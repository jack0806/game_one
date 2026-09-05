'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BossController } = require('../dist/entities/BossController');
const { makeMockGame, makePlayer } = require('./mockGame');

function makeBoss(game) {
    const boss = new BossController();
    boss.initBoss(0, game); // chapter=0 (0-based) → wave=10 → chapter 1 表
    boss.x = 0; boss.y = 0;
    return boss;
}

test('DoT把boss血量打到<=0时应触发死亡(_die),而不是让boss带负血继续存活', () => {
    const game = makeMockGame();
    const boss = makeBoss(game);
    boss.dots.push({ type: 'burn', dps: boss.maxHp, timeLeft: 5, color: '#f80' });
    const player = makePlayer();
    boss.update(1, player, game);
    assert.equal(boss.alive, false, 'DoT把hp打到<=0后boss应标记为死亡');
    assert.equal(boss.hp, 0, '死亡时hp应被夹到0(EnemyBase._die的行为)');
});

test('slowMult在_slowTimer到期后应自动恢复为1(之前override update后完全没有衰减逻辑)', () => {
    const game = makeMockGame();
    const boss = makeBoss(game);
    boss.slowMult = 0.3;
    boss._slowTimer = 0.5;
    const player = makePlayer({ x: 1000, y: 1000 }); // 远离boss,避免近战伤害分支干扰
    boss.update(0.6, player, game); // dt > _slowTimer,应触发恢复
    assert.equal(boss.slowMult, 1, '_slowTimer耗尽后slowMult应恢复为1');
    assert.equal(boss._slowTimer, 0);
});

test('boss追逐移动速度应受slowMult影响(之前减速对boss完全无效)', () => {
    const game = makeMockGame();
    const bossSlowed = makeBoss(game);
    bossSlowed.slowMult = 0; // 完全定身
    bossSlowed.x = 100; bossSlowed.y = 100;
    const player = makePlayer({ x: 500, y: 100 });
    const x0 = bossSlowed.x;
    bossSlowed.update(1, player, game);
    assert.equal(bossSlowed.x, x0, 'slowMult=0(定身)时boss不应发生位移');

    const bossNormal = makeBoss(game);
    bossNormal.x = 100; bossNormal.y = 100;
    bossNormal.slowMult = 1;
    const x1 = bossNormal.x;
    bossNormal.update(1, player, game);
    assert.notEqual(bossNormal.x, x1, 'slowMult=1时boss应正常追逐移动');
});

test('boss接触攻击先进入前摇,不会贴脸瞬间扣血', () => {
    const game = makeMockGame();
    const boss = makeBoss(game);
    const player = makePlayer({ x: 20, y: 0, radius: 16 });
    boss.update(0.016, player, game);
    assert.equal(player.hp, 100);
    assert.ok(boss.attackWindup > 0, '接触攻击应暴露前摇给渲染层');
    boss.update(boss.attackWindupMax, player, game);
    assert.ok(player.hp < 100, '前摇结束且仍贴近时才造成伤害');
});

test('boss冲锋先锁定目标并蓄力,不会立即移动', () => {
    const game = makeMockGame();
    const boss = makeBoss(game);
    const player = makePlayer({ x: 500, y: 0 });
    boss._chargeCd = 0;
    boss.update(0.016, player, game);
    assert.ok(boss.chargeWindup > 0, '冲锋应先进入可见蓄力');
    assert.equal(boss.isCharging, false);
    assert.equal(boss.chargeTargetX, player.x);
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.action, 'skill2', '冲锋蓄力必须播放压低重心动作');
    boss.update(boss.chargeWindupMax, player, game);
    assert.equal(boss.isCharging, true, '蓄力结束后才进入冲锋');
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.currentFrame.event, 'cast', '冲锋启动必须直达突进峰值');
});

test('废土领主毒球、召唤和阶段变化分别播放独立身体动作', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 600, y: 200 });

    const poison = makeBoss(game);
    poison._skillTimer = 0; poison._summonTimer = 999; poison._chargeCd = 999;
    poison.update(0.01, player, game);
    poison.updateVisualAnimation(0.01, player);
    assert.equal(poison.actorAnimation.action, 'skill');
    poison.update(poison.skillWindupMax, player, game);
    poison.updateVisualAnimation(0.01, player);
    assert.equal(poison.actorAnimation.currentFrame.event, 'cast', '毒球生成时必须显示毒爪喷口峰值');

    const summon = makeBoss(game);
    summon._skillTimer = 999; summon._summonTimer = 0; summon._chargeCd = 999;
    summon.update(0.01, player, game);
    summon.updateVisualAnimation(0.01, player);
    assert.equal(summon.actorAnimation.action, 'skill3');
    assert.equal(summon.actorAnimation.currentFrame.event, 'cast');

    const phase = makeBoss(game);
    phase._skillTimer = 999; phase._summonTimer = 999; phase._chargeCd = 999;
    phase.hp = phase.maxHp * 0.5;
    phase.update(0.01, player, game);
    phase.updateVisualAnimation(0.01, player);
    assert.equal(phase.actorAnimation.action, 'skill4');
    assert.equal(phase.actorAnimation.currentFrame.event, 'cast');
});

test('钢铁之王齿轮齐射使用第二章专属身体动作', () => {
    const game = makeMockGame();
    const boss = new BossController();
    boss.initBoss(1, game);
    boss.x = 0; boss.y = 0;
    boss._skillTimer = 0; boss._summonTimer = 999; boss._chargeCd = 999;
    const player = makePlayer({ x: 600, y: 200 });
    boss.update(0.01, player, game);
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.spriteKey, 'enemy_boss_ch2');
    assert.equal(boss.actorAnimation.action, 'skill');
    boss.update(boss.skillWindupMax, player, game);
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.currentFrame.event, 'cast', '齿轮发射时必须显示熔炉张臂峰值');
});

test('海克斯异变体追踪核使用第三章专属身体动作', () => {
    const game = makeMockGame();
    const boss = new BossController();
    boss.initBoss(2, game);
    boss.x = 0; boss.y = 0;
    boss._skillTimer = 0; boss._summonTimer = 999; boss._chargeCd = 999;
    const player = makePlayer({ x: 600, y: 200 });
    boss.update(0.01, player, game);
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.spriteKey, 'enemy_boss_ch3');
    assert.equal(boss.actorAnimation.action, 'skill');
    boss.update(boss.skillWindupMax, player, game);
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.currentFrame.event, 'cast', '追踪核发射时必须显示手部晶核峰值');
});

test('终焉之门混沌弹幕使用第四章专属身体动作', () => {
    const game = makeMockGame();
    const boss = new BossController();
    boss.initBoss(3, game);
    boss.x = 0; boss.y = 0;
    boss._skillTimer = 0; boss._summonTimer = 999; boss._chargeCd = 999;
    const player = makePlayer({ x: 600, y: 200 });
    boss.update(0.01, player, game);
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.spriteKey, 'enemy_boss_ch4');
    assert.equal(boss.actorAnimation.action, 'skill');
    boss.update(boss.skillWindupMax, player, game);
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.currentFrame.event, 'cast', '混沌弹幕发射时必须显示门环过载峰值');
});

test('机械高达横劈、刀刃风暴、光剑强化与空降落地使用对应身体动作', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 600, y: 200 });
    const boss = new BossController();
    boss.initBossKind('mech', game);
    boss.x = 0; boss.y = 0;

    boss.mechSlashT = 1;
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.action, 'skill');
    assert.equal(boss.actorAnimation.frame, 0, '横劈前摇从收刀姿势开始');
    boss.mechSlashT = 0; boss.visualMechSlashReleaseT = 0.65;
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.currentFrame.event, 'cast', '横劈结算直达挥刀峰值');

    boss.visualMechSlashReleaseT = 0; boss.skillWindup = 1;
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.action, 'skill2');
    assert.equal(boss.actorAnimation.frame, 0, '刀刃风暴前摇从蓄能姿势开始');
    boss.skillWindup = 0; boss.visualSkillT = 0.65;
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.currentFrame.event, 'cast', '刀刃风暴发射直达放射峰值');

    boss.visualSkillT = 0; boss.visualMechBuffT = 0.65;
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.action, 'skill3');
    assert.equal(boss.actorAnimation.currentFrame.event, 'cast', '光剑强化直达能量峰值');

    boss.visualMechBuffT = 0; boss.visualMechSkyLandT = 0.65;
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.action, 'skill4');
    assert.equal(boss.actorAnimation.currentFrame.event, 'cast', '落地伤害直达冲击峰值');
});

test('深海恐惧水刺、水柱、冻结区、水分身与召唤鱿鱼使用五套身体动作', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 600, y: 200 });
    const boss = new BossController();
    boss.initBossKind('abyss', game);
    boss.x = 0; boss.y = 0;

    boss.skillWindup = 1;
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.action, 'skill');
    assert.equal(boss.actorAnimation.frame, 0);
    boss.skillWindup = 0; boss.visualSkillT = 0.65;
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.actorAnimation.currentFrame.event, 'cast');

    boss.visualSkillT = 0;
    for (let index = 2; index <= 5; index++) {
        boss.visualAbyssSkillIndex = index; boss.visualAbyssSkillT = 0.68;
        boss.updateVisualAnimation(0.01, player);
        assert.equal(boss.actorAnimation.action, `skill${index}`);
        assert.equal(boss.actorAnimation.currentFrame.event, 'cast');
        boss.visualAbyssSkillT = 0;
        boss.updateVisualAnimation(0.01, player);
    }
});

test('文档Boss技能索引驱动对应身体动作峰值', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 600, y: 200 });
    const boss = new BossController();
    boss.initBossKind('vespa', game);
    for (let index = 1; index <= 5; index++) {
        boss.visualDocSkillIndex = index; boss.visualDocSkillT = 0.72;
        boss.updateVisualAnimation(0.01, player);
        assert.equal(boss.actorAnimation.action, index === 1 ? 'skill' : `skill${index}`);
        assert.equal(boss.actorAnimation.currentFrame.event, 'cast');
        boss.visualDocSkillT = 0; boss.updateVisualAnimation(0.01, player);
    }
});
