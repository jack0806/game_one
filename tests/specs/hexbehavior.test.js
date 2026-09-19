'use strict';
// 海克斯技能行为：不灭协议免死、制导蜂群/无人机计时、刷新定价与章节金币倍率
const test = require('node:test');
const assert = require('node:assert/strict');
const { AugmentManager } = require('../dist/systems/AugmentManager');
const { GOLD_STAGE_MULT, nextAugRefreshCost, Economy } = require('../dist/systems/Economy');
const { PlayerController } = require('../dist/entities/PlayerController');
const { makeMockGame, makePlayer } = require('./mockGame');

/** 用原型构造可跑 takeDamage 的最小玩家（不触引擎渲染路径）。 */
function makeRealPlayer() {
    const p = Object.create(PlayerController.prototype);
    p.alive = true; p.godMode = false;
    p._invincible = 0; p._iframeTimer = 0;
    p.x = 100; p.y = 100; p.radius = 16;
    p.stats = {
        maxHp: 100, armor: 0, maxShield: 0,
        hasHexGuard: true, _hexGuardShieldMult: 2, _hexGuardCd: 0,
    };
    p.hp = 100; p.shield = 0;
    p._tempShields = []; p._buffs = [];
    p.applyBuff = function (id, duration, mods) { this._buffs.push({ id, duration, mods }); };
    p.playVisualAction = () => true;
    p.beginDefeat = () => {};
    return p;
}

test('不灭协议：致命伤触发护盾+吸血并保底1滴血，75秒冷却内不重复触发', () => {
    const game = makeMockGame();
    const p = makeRealPlayer();

    p.takeDamage(200, game);   // 100-200 致命 → 触发
    assert.equal(p.alive, true, '致命伤被拦截');
    assert.equal(p.hp, 1, '保底剩 1 滴血');
    assert.equal(p.shield, 200, '2 倍最大生命护盾');
    assert.equal(p.stats._hexGuardCd, 75, '进入 75 秒冷却');
    assert.ok(p._buffs.find(b => b.id === 'hex_guard_lifesteal' && b.mods.lifestealRate === 0.25),
        '10 秒 25% 吸血增益');

    p.shield = 0;              // 护盾被打掉后冷却期内再次致命 → 死亡
    p._iframeTimer = 0;        // 跳过首次触发的受击无敌帧
    p.takeDamage(50, game);
    assert.equal(p.alive, false, '冷却期内不重复触发');
});

test('不灭协议：生命剩余1滴时受到任意伤害也触发（文档：致命伤或剩1滴血）', () => {
    const game = makeMockGame();
    const p = makeRealPlayer();
    p.hp = 1;                  // 已经只剩 1 滴
    p.takeDamage(1, game);
    assert.equal(p.alive, true);
    assert.equal(p.hp, 1);
    assert.ok(p.shield > 0);
});

test('制导蜂群（海克斯10）：每3秒按档位发射追踪导弹', () => {
    const am = new AugmentManager();
    const spawned = [];
    const game = makeMockGame();
    game.bullets = { spawn: (cfg) => spawned.push(cfg) };
    const p = makePlayer();

    am.equip({ id: 'hex10', level: 2 }, p, game);   // Lv2：2 枚 × 20 伤
    am.dispatchUpdate(p, 3.1, game);
    assert.equal(spawned.length, 2);
    assert.ok(spawned.every(b => b.homing === true && b.damage === 20));
});

test('猎杀无人机（海克斯13）：15秒召唤攻击无人机并受上限约束', () => {
    const am = new AugmentManager();
    const drones = [];
    const game = makeMockGame();
    game.spawnHexDrone = (_p, kind, level) => drones.push({ kind, level });
    const p = makePlayer();

    am.equip({ id: 'hex13', level: 3 }, p, game);
    am.dispatchUpdate(p, 3.1, game);   // 首次 3 秒即召唤一架
    assert.deepEqual(drones[0], { kind: 'attack', level: 3 });
    am.dispatchUpdate(p, 15.1, game);  // 之后每 15 秒一架（上限由 GameManager 内部裁剪）
    assert.equal(drones.length, 2);
});

test('刷新定价：前3次5金币，之后每次溢价75%', () => {
    assert.equal(nextAugRefreshCost(0), 5);
    assert.equal(nextAugRefreshCost(1), 5);
    assert.equal(nextAugRefreshCost(2), 5);
    assert.equal(nextAugRefreshCost(3), 9);    // 5 × 1.75
    assert.equal(nextAugRefreshCost(4), 15);   // 5 × 1.75²
    assert.equal(nextAugRefreshCost(5), 27);   // 5 × 1.75³
});

test('章节金币倍率单调递增且第五章最高（越到后面爆率越高）', () => {
    for (let i = 1; i < GOLD_STAGE_MULT.length; i++) {
        assert.ok(GOLD_STAGE_MULT[i] > GOLD_STAGE_MULT[i - 1], `第${i + 1}章应高于第${i}章`);
    }
    assert.equal(GOLD_STAGE_MULT.length, 5);
});

test('点金手乘区作用于 Economy.addGold', () => {
    const eco = new Economy();
    eco.addGold(100);
    assert.equal(eco.gold, 100);
    eco.gainMult = 1.5;      // 海克斯16 Lv1
    eco.addGold(100);
    assert.equal(eco.gold, 250);
    assert.equal(eco.earnedThisRun, 250);
});

// ── 海克斯19 元素暴击：四元素飞弹齐射 + 元素爆炸 ──────────
const { AUGMENT_DB, applyElementMark, fireElementalVolley } = require('../dist/data/AugmentDB');
const fs = require('node:fs');
const path = require('node:path');
const rootDir = path.resolve(__dirname, '..', '..');

function makeElemEnemies(n) {
    return Array.from({ length: n }, (_, i) => ({
        x: 100 + i * 30, y: 200, alive: true, dead: false,
        taken: [],
        takeDamage(d) { this.taken.push(d); return d; },
    }));
}

test('元素暴击(19):先锁定后发射,数量10-20/伤害15-20区间,每枚锁定场上目标', () => {
    const hex = { id: 'hex19', level: 1 };
    const spawned = [];
    const game = makeMockGame();
    game.bullets = { spawn: (cfg) => spawned.push(cfg) };
    const enemies = makeElemEnemies(5);
    game.enemies = enemies;
    for (let i = 0; i < 60; i++) {
        spawned.length = 0;
        fireElementalVolley(hex, { x: 0, y: 0, charId: 'kai' }, game);
        assert.ok(spawned.length >= 10 && spawned.length <= 20,
            `齐射数量应在 10-20,实际 ${spawned.length}`);
        for (const b of spawned) {
            assert.ok(b.damage >= 15 && b.damage <= 20, '单枚伤害 15-20 区间');
            assert.ok(['water', 'fire', 'earth', 'wind'].includes(b.element), '四元素随机');
            assert.equal(b.homing, true, '飞弹追踪');
            assert.ok(enemies.includes(b._homingTarget), '先锁定目标再发射');
        }
    }
});

test('锁定规则:飞弹多于目标时鸽笼分配(20枚19目标必有目标被2枚锁定)', () => {
    const spawned = [];
    const game = makeMockGame();
    game.bullets = { spawn: (cfg) => spawned.push(cfg) };
    game.enemies = makeElemEnemies(19);
    const orig = Math.random;
    Math.random = () => 0.999;   // Rng.int(10,20)=20 发满
    try {
        fireElementalVolley({ level: 1 }, { x: 0, y: 0, charId: 'kai' }, game);
    } finally { Math.random = orig; }
    assert.equal(spawned.length, 20, '满额 20 枚');
    const counts = new Map();
    for (const b of spawned) counts.set(b._homingTarget, (counts.get(b._homingTarget) || 0) + 1);
    assert.equal(counts.size, 19, '19 个目标全部被锁定');
    assert.ok([...counts.values()].some(c => c >= 2), '必有目标被多枚飞弹锁定');
});

test('锁定规则:飞弹少于目标时按概率集火(多枚锁定同一目标,其余分散)', () => {
    const spawned = [];
    const game = makeMockGame();
    game.bullets = { spawn: (cfg) => spawned.push(cfg) };
    game.enemies = makeElemEnemies(30);   // >20 目标 → 集火概率 15%
    const orig = Math.random;
    Math.random = () => 0.01;    // chance(0.15) 命中集火;N=10;k=2 枚集中
    try {
        fireElementalVolley({ level: 1 }, { x: 0, y: 0, charId: 'kai' }, game);
    } finally { Math.random = orig; }
    assert.equal(spawned.length, 10);
    const counts = new Map();
    for (const b of spawned) counts.set(b._homingTarget, (counts.get(b._homingTarget) || 0) + 1);
    assert.ok([...counts.values()].includes(2), '集火目标被 2 枚锁定');
    assert.equal(counts.size, 9, '2 枚集火 + 8 枚分散 = 9 个不同目标');
});

test('元素印记:集齐2种元素引爆,每多一种伤害翻倍(×2/×4/×8),爆炸半径90', () => {
    const game = makeMockGame();
    const near = makeElemEnemies(1)[0];
    const far = { x: 500, y: 500, alive: true, dead: false, taken: [], takeDamage(d) { this.taken.push(d); return d; } };
    game.enemies = [near, far];

    applyElementMark(near, 'water', 20, {}, game);
    assert.equal(near.taken.length, 0, '第一种元素只打印记不引爆');
    assert.equal(near._elemMarks.size, 1);

    applyElementMark(near, 'fire', 20, {}, game);
    assert.deepEqual(near.taken, [40], '两种元素引爆 = 单枚伤害×2');
    assert.deepEqual(far.taken, [], '超出半径 90 不受爆炸影响');
    assert.equal(near._elemMarks.size, 0, '爆炸后印记清空,可重新累积');

    near._elemMarks = new Set(['water', 'fire']);
    applyElementMark(near, 'wind', 20, {}, game);
    assert.deepEqual(near.taken, [40, 80], '三种元素 ×4');

    near._elemMarks = new Set(['water', 'fire', 'wind']);
    applyElementMark(near, 'earth', 20, {}, game);
    assert.deepEqual(near.taken, [40, 80, 160], '四种元素 ×8');
});

test('暴击分发:dispatchCrit 触发元素暴击齐射', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const spawned = [];
    game.bullets = { spawn: (cfg) => spawned.push(cfg) };
    game.enemies = makeElemEnemies(6);
    game.augmentManager = am;
    const p = makePlayer();
    am.equip({ id: 'hex19' }, p, game);
    am.dispatchCrit(p, game.enemies[0], 10, game);
    assert.ok(spawned.length >= 10, '暴击触发元素齐射');
    assert.ok(AUGMENT_DB.find(a => a.id === 'hex19').onCrit, '数据库带 onCrit 钩子');
});

test('暴击接入点:近战与子弹暴击结算后分发 dispatchCrit,元素飞弹命中打印记', () => {
    const pc = fs.readFileSync(path.join(rootDir, 'assets/scripts/entities/PlayerController.ts'), 'utf8');
    const bc = fs.readFileSync(path.join(rootDir, 'assets/scripts/entities/BulletController.ts'), 'utf8');
    assert.match(pc, /if \(isCrit\) game\.augmentManager\?\.dispatchCrit\?\.\(this, enemy, dmg, game\);/);
    assert.match(bc, /if \(b\.isCrit\) game\.augmentManager\?\.dispatchCrit\?\.\(player, e, dmg, game\);/);
    assert.match(bc, /if \(b\.element\) applyElementMark\(e, b\.element, b\.damage, player, game\);/);
});

// ── 四元素海克斯（hex20~23）+ 元素暴击解锁门槛 ────────────
test('风元素(20):远程加子弹速度基数,近战加伤害乘区,换档/卸下精确回退', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    // 远程英雄：bulletSpeedMult 加算（档位绝对值 10%/15%/20%）
    const ranged = makePlayer();
    ranged._charDef = { attackType: 'ranged', attackRange: 420 };
    am.equip({ id: 'hex20' }, ranged, game);
    assert.ok(Math.abs(ranged.stats.bulletSpeedMult - 0.10) < 1e-9, '远程 Lv1 弹速 +10%');
    am.equip({ id: 'hex20' }, ranged, game);
    assert.ok(Math.abs(ranged.stats.bulletSpeedMult - 0.15) < 1e-9, 'Lv2 +15%');
    am.unequip('hex20', ranged, game);
    assert.equal(ranged.stats.bulletSpeedMult, 0, '卸下回退');

    // 近战英雄：伤害乘区(数值×0.5 → 5%/8%/10%)
    const melee = makePlayer();
    melee.stats.damage = 100;
    melee._charDef = { attackType: 'melee', attackRange: 120 };
    const am2 = new AugmentManager();
    am2.equip({ id: 'hex20' }, melee, game);
    assert.ok(Math.abs(melee.stats.damage - 105) < 1e-9, '近战 Lv1 增伤 5%');
    am2.equip({ id: 'hex20' }, melee, game);
    assert.ok(Math.abs(melee.stats.damage - 107.5) < 1e-9, '近战 Lv2 增伤 8%');
});

test('火元素(21):命中附加灼烧,每秒=当前生命5%,命中刷新不叠层', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makePlayer();
    am.equip({ id: 'hex21' }, p, game);
    const hex = am.ownedOf('hex21');
    const enemy = { alive: true, hp: 1000, dots: [] };
    hex.onHit(p, enemy, 10, game);
    assert.equal(enemy.dots.length, 1, '第一条灼烧');
    assert.ok(Math.abs(enemy.dots[0].dps - 50) < 1e-9, '5% 当前生命/秒');
    enemy.hp = 400;
    hex.onHit(p, enemy, 10, game);
    assert.equal(enemy.dots.length, 1, '命中刷新不叠层');
    assert.ok(Math.abs(enemy.dots[0].dps - 20) < 1e-9, '刷新按新当前生命重算');
    assert.equal(enemy.dots[0].timeLeft, 1.5);
});

test('土元素(22):远程加穿刺层数,近战按百分比加攻击范围(rangeBonus)', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const ranged = makePlayer();
    ranged._charDef = { attackType: 'ranged', attackRange: 420 };
    am.equip({ id: 'hex22' }, ranged, game);
    am.equip({ id: 'hex22' }, ranged, game);
    assert.equal(ranged.stats.pierce, 2, 'Lv2 穿刺 +2');

    const melee = makePlayer();
    melee._charDef = { attackType: 'melee', attackRange: 120 };
    const am2 = new AugmentManager();
    am2.equip({ id: 'hex22' }, melee, game);
    assert.ok(Math.abs(melee.stats.rangeBonus - 24) < 1e-9, '近战 Lv1 范围 +20%(120×0.2)');
});

test('水元素(23):命中减速20%并刷新计时,不覆盖更强减速', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makePlayer();
    am.equip({ id: 'hex23' }, p, game);
    const hex = am.ownedOf('hex23');
    const enemy = { alive: true, slowMult: 1, _slowTimer: 0 };
    hex.onHit(p, enemy, 10, game);
    assert.ok(Math.abs(enemy.slowMult - 0.8) < 1e-9, '减速 20%');
    assert.equal(enemy._slowTimer, 2, '持续 2 秒');
    enemy.slowMult = 0.5;   // 已有更强减速
    enemy._slowTimer = 1;
    hex.onHit(p, enemy, 10, game);
    assert.equal(enemy.slowMult, 0.5, '不覆盖更强减速');
    assert.equal(enemy._slowTimer, 2, '但刷新持续时间');
});

test('元素暴击解锁门槛:未集齐四元素时卡池不刷出且装备被拒,集齐后解锁', () => {
    const game = makeMockGame();
    const p = makePlayer();
    p._charDef = { attackType: 'ranged', attackRange: 420 };

    const am = new AugmentManager();
    assert.equal(am.elementSetComplete(), false);
    assert.equal(am.equip({ id: 'hex19' }, p, game), false, '未解锁时装备被拒');
    for (let i = 0; i < 80; i++) {
        for (const card of am.rollOptions(3, 10)) {
            assert.notEqual(card.id, 'hex19', '未集齐四元素,卡池不应刷出元素暴击');
        }
    }

    // 集齐四元素(缺一不可)
    am.equip({ id: 'hex20' }, p, game);
    am.equip({ id: 'hex21' }, p, game);
    am.equip({ id: 'hex22' }, p, game);
    assert.equal(am.elementSetComplete(), false, '还差水元素');
    am.equip({ id: 'hex23' }, p, game);
    assert.equal(am.elementSetComplete(), true, '四元素集齐');
    // 卡池验证须在装备前：单档海克斯购入后不会再刷出
    let offered = false;
    for (let i = 0; i < 200 && !offered; i++) {
        offered = am.rollOptions(3, 10).some(c => c.id === 'hex19');
    }
    assert.ok(offered, '集齐后卡池可刷出元素暴击(彩色)');
    assert.equal(am.equip({ id: 'hex19' }, p, game), true, '解锁后可装备');
});

test('元素齐射不锁定隐身/飞空的隐藏单位;场上全是隐藏单位时不发射', () => {
    const spawned = [];
    const game = makeMockGame();
    game.bullets = { spawn: (cfg) => spawned.push(cfg) };
    const visible = makeElemEnemies(5);
    const hidden = [
        { x: 100, y: 100, alive: true, dead: false, invisible: true },
        { x: 200, y: 100, alive: true, dead: false, mechSkyT: 2 },
    ];
    game.enemies = [...visible, ...hidden];
    for (let i = 0; i < 20; i++) {
        spawned.length = 0;
        fireElementalVolley({}, { x: 0, y: 0 }, game);
        assert.ok(spawned.length > 0);
        for (const b of spawned) {
            assert.ok(visible.includes(b._homingTarget), '飞弹不得锁定隐身/飞空单位');
        }
    }
    // 只剩隐藏单位：无有效目标，不浪费齐射
    game.enemies = hidden;
    spawned.length = 0;
    fireElementalVolley({}, { x: 0, y: 0 }, game);
    assert.equal(spawned.length, 0, '全是隐藏单位时不发射');
});
