'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BossController } = require('../dist/entities/BossController');
const { makeMockGame, makePlayer } = require('./mockGame');

function makeBoss(game) {
    const boss = new BossController();
    boss.initBoss(0 * 5 + 5, game); // 全局 5 = 图1章5（图末节点）→ 图1 Boss 表
    boss.x = 0; boss.y = 0;
    return boss;
}

test('大Boss负面免疫:中毒/流血/灼烧等DoT挂上即清空,永远不跳伤害', () => {
    const game = makeMockGame();
    const boss = makeBoss(game);
    const player = makePlayer({ x: 1000, y: 1000 });
    const hp0 = boss.hp;
    boss.dots.push({ type: 'burn', dps: boss.maxHp, timeLeft: 5, color: '#f80' });
    boss.dots.push({ type: 'poison', dps: 500, timeLeft: 3, color: '#4f4' });
    boss.dots.push({ type: 'bleed', dps: 100, timeLeft: 5, color: '#f35' });
    boss.update(1, player, game);
    assert.equal(boss.dots.length, 0, '全部DoT在结算前被清空');
    assert.equal(boss.hp, hp0, 'DoT不再对大Boss造成伤害');
    assert.equal(boss.alive, true, '即使DoT总伤害超过血量也不致死');
});

test('大Boss负面免疫:冰冻/减速一律无效,自身机制冰冻mechanicFrozen照常生效', () => {
    const game = makeMockGame();
    const boss = makeBoss(game);
    const player = makePlayer({ x: 1000, y: 1000 });
    boss.frozen = 5;
    boss.slowMult = 0.3;
    boss._slowTimer = 2;
    boss.update(0.1, player, game);
    assert.equal(boss.frozen, 0, '外部冰冻被免疫清零');
    assert.equal(boss.slowMult, 1, '减速立即复位');
    assert.equal(boss._slowTimer, 0);
    // 维斯帕毒爆取消奖励走 mechanicFrozen：不受免疫影响，期间定身不出手
    const frozenBoss = makeBoss(game);
    frozenBoss.x = 100; frozenBoss.y = 100;
    frozenBoss.mechanicFrozen = 0.5;
    const x0 = frozenBoss.x;
    frozenBoss.update(0.25, makePlayer({ x: 500, y: 100 }), game);
    assert.equal(frozenBoss.x, x0, '机制冰冻期间不移动');
    assert.ok(Math.abs(frozenBoss.mechanicFrozen - 0.25) < 1e-9, '机制冰冻正常倒计时');
    frozenBoss.update(0.25, makePlayer({ x: 500, y: 100 }), game);
    assert.equal(frozenBoss.mechanicFrozen, 0, '机制冰冻到期解除');
});

test('大Boss免疫减速:定身级slowMult不再生效,照常追逐', () => {
    const game = makeMockGame();
    const bossSlowed = makeBoss(game);
    bossSlowed.x = 100; bossSlowed.y = 100;
    bossSlowed.slowMult = 0;   // 旧版可定身；现在挂上即被免疫清回1
    const player = makePlayer({ x: 500, y: 100 });
    const x0 = bossSlowed.x;
    bossSlowed.update(1, player, game);
    assert.notEqual(bossSlowed.x, x0, '减速定身对大Boss无效,应正常追逐移动');
    assert.equal(bossSlowed.slowMult, 1);
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
    // 敌人技能优化方案：ch1~4 通用冲锋计时已并入技能库，由蛮牛冲撞等触发
    boss.triggerChapterCharge(player, game);
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

test('废土领主普攻、技能大招和阶段变化分别播放独立身体动作(敌人技能优化方案轮转)', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 600, y: 200 });

    // 普攻（原3发毒球保留为基础轮）：后坐帧驱动 attack 动作
    const poison = makeBoss(game);
    poison.docBasicTimer = 0; poison.docSkillTimer = 999;
    poison._updateChapterBossSkills(0.01, player, game);
    assert.equal(game.enemyBullets.length, 3, 'ch1 普攻保留三发毒球');
    poison.updateVisualAnimation(0.01, player);
    assert.equal(poison.actorAnimation.action, 'attack', '普攻开火以后坐动作表现');
    assert.ok(!!poison.actorAnimation.currentFrame.event, '普攻开火必须落到事件帧');

    // 技能大招（腐肉孵化/酸雨等轮转）：visualSkillT 驱动 skill 动作 + cast 峰值
    const skill = makeBoss(game);
    skill.docBasicTimer = 999; skill.docSkillTimer = 0;
    skill._updateChapterBossSkills(0.01, player, game);
    assert.ok(skill.visualSkillT > 0, '大招应点亮施法视觉时钟');
    assert.equal(skill.docSkillName, '腐肉孵化', 'P1 首招为腐肉孵化');
    skill.updateVisualAnimation(0.01, player);
    assert.equal(skill.actorAnimation.action, 'skill');
    assert.equal(skill.actorAnimation.currentFrame.event, 'cast', '大招释放必须直达施法峰值帧');

    // 阶段切换：visualPhaseT 驱动 skill4（原链路保留）
    const phase = makeBoss(game);
    phase.docBasicTimer = 999; phase.docSkillTimer = 999;
    phase.hp = phase.maxHp * 0.5;
    phase.update(0.01, player, game);
    phase.updateVisualAnimation(0.01, player);
    assert.equal(phase.actorAnimation.action, 'skill4');
    assert.equal(phase.actorAnimation.currentFrame.event, 'cast');
});

test('钢铁之王齿轮齐射与技能大招使用第二章专属身体动作', () => {
    const game = makeMockGame();
    const boss = new BossController();
    boss.initBoss(10, game);   // 全局 10 = 图2章5 → 钢铁之王
    boss.x = 0; boss.y = 0;
    const player = makePlayer({ x: 600, y: 200 });
    boss.docBasicTimer = 0; boss.docSkillTimer = 999;
    boss._updateChapterBossSkills(0.01, player, game);
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.spriteKey, 'enemy_boss_ch2');
    assert.equal(game.enemyBullets.length, 8, 'ch2 普攻保留8向齿轮');
    assert.equal(boss.actorAnimation.action, 'attack', '齿轮齐射以后坐动作表现');
    const boss2 = new BossController();
    boss2.initBoss(10, game);
    boss2.x = 0; boss2.y = 0;
    boss2.docBasicTimer = 999; boss2.docSkillTimer = 0;
    boss2._updateChapterBossSkills(0.01, player, game);
    boss2.updateVisualAnimation(0.01, player);
    assert.equal(boss2.actorAnimation.action, 'skill');
    assert.equal(boss2.actorAnimation.currentFrame.event, 'cast', '大招释放必须显示熔炉张臂峰值');
});

test('海克斯异变体追踪核普攻与技能大招使用第三章专属身体动作', () => {
    const game = makeMockGame();
    const boss = new BossController();
    boss.initBoss(15, game);   // 全局 15 = 图3章5 → 海克斯异变体
    boss.x = 0; boss.y = 0;
    const player = makePlayer({ x: 600, y: 200 });
    boss.docBasicTimer = 0; boss.docSkillTimer = 999;
    boss._updateChapterBossSkills(0.01, player, game);
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.spriteKey, 'enemy_boss_ch3');
    assert.equal(game.enemyBullets.length, 1, 'ch3 普攻P1为单发追踪核（被动进化起点）');
    assert.ok(game.enemyBullets[0].homing === true, '追踪核应带追踪');
    assert.equal(boss.actorAnimation.action, 'attack', '追踪核发射以后坐动作表现');
    const boss2 = new BossController();
    boss2.initBoss(15, game);
    boss2.x = 0; boss2.y = 0;
    boss2.docBasicTimer = 999; boss2.docSkillTimer = 0;
    boss2._updateChapterBossSkills(0.01, player, game);
    boss2.updateVisualAnimation(0.01, player);
    assert.equal(boss2.actorAnimation.action, 'skill');
    assert.equal(boss2.actorAnimation.currentFrame.event, 'cast', '大招释放必须显示手部晶核峰值');
});

test('终焉之门混沌弹幕与奇点大招使用第四章专属身体动作', () => {
    const game = makeMockGame();
    const boss = new BossController();
    boss.initBoss(20, game);   // 全局 20 = 图4章5 → 终焉之门
    boss.x = 0; boss.y = 0;
    const player = makePlayer({ x: 600, y: 200 });
    boss.docBasicTimer = 0; boss.docSkillTimer = 999;
    boss._updateChapterBossSkills(0.01, player, game);
    boss.updateVisualAnimation(0.01, player);
    assert.equal(boss.spriteKey, 'enemy_boss_ch4');
    assert.equal(game.enemyBullets.length, 12, 'ch4 普攻保留12发混沌弹');
    assert.equal(boss.actorAnimation.action, 'attack', '混沌弹幕以后坐动作表现');
    // 大招首招为奇点：验证吸引弹体字段完整
    const boss2 = new BossController();
    boss2.initBoss(20, game);
    boss2.x = 0; boss2.y = 0;
    boss2.docBasicTimer = 999; boss2.docSkillTimer = 0;
    boss2._updateChapterBossSkills(0.01, player, game);
    boss2.updateVisualAnimation(0.01, player);
    assert.equal(boss2.actorAnimation.action, 'skill');
    assert.equal(boss2.actorAnimation.currentFrame.event, 'cast', '大招释放必须显示门环过载峰值');
    assert.equal(game.enemyBullets.filter(b => b.attract).length, 1, '奇点弹应带 attract 字段');
    const singularity = game.enemyBullets.find(b => b.attract);
    assert.ok(singularity.attract.radius === 180 && singularity.burstDmg > 0, '奇点参数完整');
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
