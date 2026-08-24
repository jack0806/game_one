'use strict';
// 测试房间文档小 Boss（boss.docx）行为单测：全部 headless，不依赖引擎。
const test = require('node:test');
const assert = require('node:assert/strict');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { MINI_BOSSES } = require('../dist/data/BossDB');
const { makeMockGame, makePlayer } = require('./mockGame');

function makeBuffPlayer(overrides = {}) {
    const buffs = [];
    const p = makePlayer({
        applyBuff(id, dur, mods) { buffs.push({ id, dur, mods }); },
        ...overrides,
    });
    p.buffs = buffs;
    return p;
}

// ── 初始化 ──

test('6种文档小boss按MINI_BOSSES表初始化字段且入场满血', () => {
    const game = makeMockGame();
    for (const def of MINI_BOSSES) {
        const e = new EnemyBase();
        e.init(def.id, 1, game);
        assert.equal(e.maxHp, def.maxHp, `${def.id} 生命`);
        assert.equal(e.damage, def.damage, `${def.id} 攻击`);
        assert.equal(e.speed, def.speed, `${def.id} 速度`);
        assert.equal(e.armor, def.armor, `${def.id} 护甲`);
        assert.equal(e.label, def.label, `${def.id} 名称`);
        assert.equal(e.spriteKey, def.spriteKey, `${def.id} 贴图`);
        assert.equal(e.tintColor, def.tintColor, `${def.id} 染色`);
        assert.equal(e.isMiniBoss, true, `${def.id} 应标记小boss`);
        assert.equal(e.hp, e.maxHp, `${def.id} 入场满血`);
    }
});

test('锯齿剑虾常驻+50%移速,无人机禁近战', () => {
    const game = makeMockGame();
    const shrimp = new EnemyBase(); shrimp.init('shrimp', 1, game);
    assert.equal(shrimp.buffSpeedMult, 1.5, '技能3:常驻+50%移速躲避');
    const droneA = new EnemyBase(); droneA.init('drone_a', 1, game);
    assert.equal(droneA.meleeRange, 0, '无人机不近战');
});

// ── 深海鱿鱼 ──

test('深海鱿鱼贴脸触发缠绕(玩家2秒禁移动)', () => {
    const game = makeMockGame();
    const squid = new EnemyBase(); squid.init('squid', 1, game);
    squid._miniCd1 = 0;
    const player = makeBuffPlayer({ x: squid.x + 30, y: squid.y });
    squid.update(0.1, player, game);
    const grab = player.buffs.find(b => b.id === 'squid_grab');
    assert.ok(grab, '贴脸应施加缠绕');
    assert.equal(grab.dur, 2, '控制时长2秒');
    assert.equal(grab.mods.noMove, true, '缠绕=禁移动');
});

test('深海鱿鱼周期性发射深水炸弹与3发分裂水刺', () => {
    const game = makeMockGame();
    const squid = new EnemyBase(); squid.init('squid', 1, game);
    squid._miniCd2 = 0; squid._miniTimer = 0;
    const player = makePlayer({ x: squid.x + 200, y: squid.y });
    squid.update(0.1, player, game);
    const bullets = game.enemyBullets;
    assert.ok(bullets.length >= 4, `应发射炸弹+3水刺,实际${bullets.length}`);
    assert.ok(bullets.some(b => b.radius === 12 && Math.abs(b.damage - squid.damage * 0.5) < 1e-9), '深水炸弹20伤');
    const spikes = bullets.filter(b => b.radius === 7);
    assert.ok(spikes.length >= 3, '分裂水刺应3发');
});

test('深水炸弹反弹1次后撞边爆炸,大水刺反弹2次', () => {
    // 深水炸弹：bounceLeft=1 + bounceExplode（第二次撞边直接爆炸）
    const game = makeMockGame();
    const squid = new EnemyBase(); squid.init('squid', 1, game);
    squid._miniCd2 = 0; squid._miniTimer = 99; squid._miniCd1 = 99;
    const player = makePlayer({ x: squid.x + 200, y: squid.y });
    squid.update(0.1, player, game);
    const bomb = game.enemyBullets.find(b => b.radius === 12);
    assert.ok(bomb, '应发射深水炸弹');
    assert.equal(bomb.bounceLeft, 1, '深水炸弹反弹1次');
    assert.equal(bomb.bounceExplode, true, '深水炸弹反弹耗尽后撞边爆炸');

    // 深海恐惧大水刺：bounceLeft=2（反弹2次）
    const { BossController } = require('../dist/entities/BossController');
    const game2 = makeMockGame();
    const boss = new BossController();
    boss.initBossKind('abyss', game2);
    const player2 = makePlayer({ x: boss.x + 300, y: boss.y });
    boss.skillWindup = 0.05;
    boss.update(0.1, player2, game2);
    const spikes = game2.enemyBullets.filter(b => b.radius === 11);
    assert.equal(spikes.length, 9, '3随机方向×3发=9发大水刺');
    assert.ok(spikes.every(b => b.bounceLeft === 2), '大水刺应反弹2次');
    assert.ok(spikes.every(b => !b.bounceExplode), '水刺撞边不爆炸,反弹耗尽后自然消散');
});

test('深海鱿鱼放完一轮技能(累计3个)后自毁消失', () => {
    const game = makeMockGame();
    const squid = new EnemyBase(); squid.init('squid', 1, game);
    // 初始不触发技能：存活
    const player = makePlayer({ x: squid.x + 200, y: squid.y });
    squid._miniCd1 = 99; squid._miniCd2 = 99; squid._miniTimer = 99;
    squid.update(0.1, player, game);
    assert.equal(squid.alive, true, '技能未释放完不应消失');

    // 炸弹+水刺+贴脸缠绕 一帧内全触发 → 累计3个 → 自毁
    const squid2 = new EnemyBase(); squid2.init('squid', 1, game);
    squid2._miniCd1 = 0; squid2._miniCd2 = 0; squid2._miniTimer = 0;
    const closePlayer = makePlayer({ x: squid2.x + 30, y: squid2.y });
    squid2.update(0.1, closePlayer, game);
    assert.equal(squid2.alive, false, '放完一轮技能应自毁消失');
    assert.equal(squid2.hp, 0, '自毁走正常死亡结算');
});

// ── 盾龟 ──

test('盾龟附近有其他小兵时生成100护盾,独行不生成', () => {
    const game = makeMockGame();
    const ally = new EnemyBase(); ally.init('grunt', 1, game);
    ally.x = 0; ally.y = 0;
    game.enemies.push(ally);

    const turtle = new EnemyBase(); turtle.init('turtle', 1, game);
    turtle.x = 0; turtle.y = 50;
    turtle._miniTimer = 0;
    const player = makePlayer({ x: 500, y: 500 });
    turtle.update(0.1, player, game);
    assert.equal(turtle.shieldHp, 100, '附近有友军应生成龟壳护盾');
    assert.equal(turtle.shieldActive, true);

    const soloGame = makeMockGame(); // 干净场景：场上没有其他敌人
    const solo = new EnemyBase(); solo.init('turtle', 1, soloGame);
    solo._miniTimer = 0;
    solo.update(0.1, player, soloGame);
    assert.equal(solo.shieldHp, 0, '独行的盾龟不应有护盾');
});

test('盾龟冷却结束发起高速碰撞冲刺并位移', () => {
    const game = makeMockGame();
    const turtle = new EnemyBase(); turtle.init('turtle', 1, game);
    turtle._miniCd1 = 0;
    const player = makePlayer({ x: turtle.x + 300, y: turtle.y });
    turtle.update(0.1, player, game);
    assert.ok(turtle._chargeT > 0, '应进入冲锋');
    assert.ok(turtle._chargeDmg > 0, '冲锋应带伤害');
    const x0 = turtle.x;
    turtle.update(0.1, player, game);
    assert.notEqual(turtle.x, x0, '冲锋期间应发生位移');
});

// ── 锯齿剑虾 ──

test('锯齿剑虾尖刺弹带破盾标记', () => {
    const game = makeMockGame();
    const shrimp = new EnemyBase(); shrimp.init('shrimp', 1, game);
    shrimp._miniCd1 = 0;
    const player = makePlayer({ x: shrimp.x + 200, y: shrimp.y });
    shrimp.update(0.1, player, game);
    assert.ok(game.enemyBullets.some(b => b.pierceShield === true), '尖刺弹应可破盾');
});

// ── 毒刺鬼水母 ──

test('毒刺鬼水母隐身循环:隐身3s无敌,到期现形可被击中', () => {
    const game = makeMockGame();
    const jelly = new EnemyBase(); jelly.init('jelly', 1, game);
    jelly._miniTimer = 0.05;
    const player = makePlayer({ x: jelly.x + 200, y: jelly.y });
    jelly.update(0.1, player, game);
    assert.equal(jelly.invisible, true, '应进入隐身');
    assert.equal(jelly.invulnerable, true, '隐身期间免疫伤害');
    assert.equal(jelly.takeDamage(50, player, game), 0, '隐身时伤害应被免疫');
    jelly.update(3.2, player, game);
    assert.equal(jelly.invisible, false, '隐身3s后应现形');
    assert.equal(jelly.invulnerable, false);
    const dealt = jelly.takeDamage(50, player, game);
    assert.ok(dealt > 0, '现形后应正常受击');
});

// ── 支援型无人机 ──

test('支援型无人机治疗附近友军并部署150能量盾', () => {
    const game = makeMockGame();
    const wounded = new EnemyBase(); wounded.init('golem', 1, game);
    wounded.hp = wounded.maxHp * 0.5;
    wounded.x = 0; wounded.y = 0;
    game.enemies.push(wounded);

    const drone = new EnemyBase(); drone.init('drone_s', 1, game);
    drone.x = 0; drone.y = 80;
    drone._miniCd1 = 0; drone._miniCd2 = 0;
    const player = makePlayer({ x: 500, y: 500 });
    drone.update(0.1, player, game);
    assert.ok(wounded.hp > wounded.maxHp * 0.5, '友军应被治疗');
    assert.equal(wounded.shieldHp, 150, '友军应获得150能量盾');
    assert.equal(wounded.shieldActive, true);
});

// ── 攻击性无人机 ──

test('攻击性无人机发射破盾声波弹与锁定光束DoT弹', () => {
    const game = makeMockGame();
    const drone = new EnemyBase(); drone.init('drone_a', 1, game);
    drone._miniCd1 = 0; drone._miniCd2 = 0;
    const player = makePlayer({ x: drone.x + 200, y: drone.y });
    drone.update(0.1, player, game);
    assert.ok(game.enemyBullets.some(b => b.pierceShield === true), '声波弹应破盾');
    assert.ok(game.enemyBullets.some(b => b.dot && b.dot.dps === 4 && b.dot.dur === 3), '光束弹应挂3秒DoT');
    assert.ok(game.enemyBullets.some(b => b.homing === true), '光束应为锁定弹');
});
