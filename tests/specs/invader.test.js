'use strict';
// 灭世机神·天罚（第五章正式 Boss / 测试房 invader）行为测试
const test = require('node:test');
const assert = require('node:assert/strict');
const { BossController } = require('../dist/entities/BossController');
const { PlayerController } = require('../dist/entities/PlayerController');
const { makeMockGame, makePlayer } = require('./mockGame');

function makeInvader(game, overrides = {}) {
    const boss = new BossController();
    boss.initBossKind('invader', game);
    boss.x = 0; boss.y = 0;
    return Object.assign(boss, overrides);
}

test('initBossKind(invader)套用第五章档位数值', () => {
    const game = makeMockGame();
    const boss = makeInvader(game);
    assert.equal(boss.bossKind, 'invader');
    assert.equal(boss.label, '灭世机神·天罚');
    assert.deepEqual([boss.maxHp, boss.damage, boss.speed, boss.armor], [20000, 160, 65, 50]);
});

test('开场释放节奏放缓:初始冷却拉长,不进场就连环放技能', () => {
    const game = makeMockGame();
    const boss = makeInvader(game);
    // 追踪弹6秒/激光8秒/震荡波10秒/导弹14秒后才有第一轮技能
    assert.equal(boss._invHomingCd, 6, '追踪弹初始冷却6秒');
    assert.equal(boss._invLaserCd, 8, '激光初始冷却8秒');
    assert.equal(boss._invShockCd, 10, '震荡波初始冷却10秒');
    assert.equal(boss._invMissileCd, 14, '导弹初始冷却14秒');
});

test('第五章正式Boss(initBoss(4))与invader共用技能集', () => {
    const game = makeMockGame();
    const boss = new BossController();
    boss.initBoss(4, game);
    assert.equal(boss.chapter, 5);
    assert.equal(boss.label, '灭世机神·天罚');
    // chapter===5 时走 invader 技能状态机（_usesInvaderSkills 为真）——用激光蓄能验证
    boss._invLaserCd = 0;
    const player = makePlayer({ x: 400, y: 0 });
    boss.update(0.016, player, game);
    assert.ok(boss.skillWindup > 0, '第5章正式Boss也应启动毁灭激光蓄能');
});

test('技能5:血量首次掉到20%进入无敌引导5秒,结束后进入最终形态', () => {
    const game = makeMockGame();
    const boss = makeInvader(game);
    const player = makePlayer({ x: 400, y: 0 });
    boss.hp = boss.maxHp * 0.2;
    boss.update(0.016, player, game);
    assert.equal(boss.finalForm, true, '低于20%血应进入最终形态流程');
    assert.equal(boss.hp, boss.maxHp * 0.5, '首次掉到20%后应恢复至50%血');
    assert.equal(boss.invulnerable, true, '引导期间无敌');
    assert.ok(boss._invFormT > 0, '引导5秒');
    // 回血只在首次触发：再次掉血不会重复回血
    boss.hp = boss.maxHp * 0.1;
    boss.update(0.016, player, game);
    assert.equal(boss.hp, boss.maxHp * 0.1, '最终形态已置位,不再触发回血');
    const speedBefore = boss.speed;
    boss.update(5.1, player, game);
    assert.ok(boss._invFormT <= 0, '引导倒计时走完');
    assert.equal(boss.invulnerable, false, '引导结束解除无敌');
    assert.ok(boss.speed > speedBefore, '最终形态移速提升');
});

test('技能1:毁灭激光2秒蓄能后发射,最终形态蓄能1秒', () => {
    const game = makeMockGame();
    const fired = [];
    game.startInvaderLaser = (b) => fired.push(b);
    const boss = makeInvader(game);
    const player = makePlayer({ x: 400, y: 0 });
    boss.x = 100; boss.y = 100;
    // 蓄能角度在状态机阶段锁定（早于本帧移动/边缘clamp），用 update 前的位置推算期望值
    const aimAtSchedule = Math.atan2(player.y - boss.y, player.x - boss.x);
    boss._invLaserCd = 0;
    boss.update(0.016, player, game);
    assert.ok(boss.skillWindup > 0, '激光应先进入蓄能');
    assert.ok(Math.abs(boss.skillWindup - 2) < 0.02, '基础蓄能2秒');
    assert.ok(Math.abs(boss.invAimAngle - aimAtSchedule) < 1e-9, '蓄能开始时瞄准主角方向');
    // 蓄能期间瞄准线实时跟随主角：主角走位后发射方向应对准主角当前位置
    player.x = 300; player.y = 200;
    boss.update(0.1, player, game);
    assert.ok(
        Math.abs(boss.invAimAngle - Math.atan2(player.y - boss.y, player.x - boss.x)) < 1e-9,
        '蓄能期间瞄准线跟随主角移动',
    );
    boss.update(2.1, player, game);
    assert.equal(fired.length, 1, '蓄能结束应发射激光');
    // 激光持续期间 Boss 站桩定身
    assert.ok(boss.invLaserT > 0, '激光持续3秒');
    const xBefore = boss.x, yBefore = boss.y;
    boss.update(1, player, game);
    assert.equal(boss.x, xBefore, '激光发射期间Boss定身');
    assert.equal(boss.y, yBefore, '激光发射期间Boss定身');

    // 最终形态：蓄能缩短为1秒
    fired.length = 0;
    const boss2 = makeInvader(game, { finalForm: true });
    boss2._invLaserCd = 0;
    boss2.update(0.016, player, game);
    assert.ok(Math.abs(boss2.skillWindup - 1) < 0.02, '最终形态蓄能1秒');
    boss2.update(1.1, player, game);
    assert.equal(fired.length, 1, '最终形态蓄能结束同样发射');
});

test('技能2/3:集束导弹与震荡波按冷却调度', () => {
    let missiles = 0, shockwaves = 0;
    const game = makeMockGame({
        startInvaderMissiles: () => missiles++,
        startInvaderShockwaves: () => shockwaves++,
    });
    const boss = makeInvader(game);
    const player = makePlayer({ x: 400, y: 0 });
    boss._invMissileCd = 0;
    boss._invShockCd = 0;
    boss.update(0.016, player, game);
    assert.equal(missiles, 1, '导弹按冷却触发');
    assert.equal(shockwaves, 1, '震荡波按冷却触发');
});

test('技能4:追踪导弹速度280伤害25,追踪4秒脱靶100码爆炸,最终形态双发30伤', () => {
    const pushed = [];
    const game = makeMockGame({ enemyBullets: { push: (b) => pushed.push(b) } });
    const boss = makeInvader(game);
    const player = makePlayer({ x: 400, y: 0 });
    boss._invHomingCd = 0;
    boss.update(0.016, player, game);
    assert.equal(pushed.length, 1, '基础形态1发');
    assert.equal(pushed[0].homing, true, '追踪弹');
    assert.equal(Math.hypot(pushed[0].vx, pushed[0].vy), 280, '速度280码/秒');
    assert.equal(pushed[0].damage, 25, '伤害25');
    assert.equal(pushed[0].lifeTime, 4, '追踪4秒后到期');
    assert.equal(pushed[0].explodeOnExpire, true, '脱靶/到期原地爆炸');
    assert.equal(pushed[0].explodeRadius, 100, '爆炸半径100码');
    assert.equal(pushed[0].explodeColor, '#ffaa33', '爆炸橙色与导弹一致');

    pushed.length = 0;
    const boss2 = makeInvader(game, { finalForm: true });
    boss2._invHomingCd = 0;
    boss2.update(0.016, player, game);
    assert.equal(pushed.length, 2, '最终形态2发');
    assert.ok(pushed.every(b => b.damage === 30), '最终形态每发30伤');
});

test('玩家takeTrueDamage无视护盾/护甲/受击无敌帧,godMode仍免疫', () => {
    const p = new PlayerController();
    p.stats = { maxHp: 100, armor: 100, _coreOverflow: false }; // 50%减伤
    p.hp = 100; p.shield = 50;
    p.takeTrueDamage(20, {});
    assert.equal(p.hp, 80, '真伤无视护甲');
    assert.equal(p.shield, 50, '真伤无视护盾');
    // 受击无敌帧不挡真伤
    p.takeDamage(10, {});
    const hpAfter = p.hp;
    p.takeTrueDamage(20, {});
    assert.equal(p.hp, hpAfter - 20, '真伤穿透受击无敌帧');
    // godMode（测试房无敌开关）仍免疫
    p.godMode = true;
    const hpGod = p.hp;
    p.takeTrueDamage(999, {});
    assert.equal(p.hp, hpGod, 'godMode下真伤也免疫');
    // 致死路径：真伤打空血触发 onPlayerDeath
    p.godMode = false;
    p.hp = 5;
    const deaths = [];
    p.takeTrueDamage(10, { onPlayerDeath: () => deaths.push(1) });
    assert.equal(p.alive, false, '真伤打空血应死亡');
    assert.equal(deaths.length, 1, '应触发onPlayerDeath一次');

    // quiet 模式（激光连续伤害逐帧结算）：跳过反馈但照常扣血/无视护盾，致死照常触发死亡
    const deaths2 = [];
    const p3 = new PlayerController();
    p3.stats = { maxHp: 100, armor: 0, _coreOverflow: false };
    p3.hp = 5; p3.shield = 50;
    p3.takeTrueDamage(10, { onPlayerDeath: () => deaths2.push(1) }, { quiet: true });
    assert.equal(p3.shield, 50, 'quiet模式仍无视护盾');
    assert.equal(p3.hp, 0, 'quiet模式致死时hp钳到0');
    assert.equal(p3.alive, false, 'quiet模式致死照常死亡');
    assert.equal(deaths2.length, 1, 'quiet模式致死触发onPlayerDeath');
});
