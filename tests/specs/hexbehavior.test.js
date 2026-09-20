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
            assert.ok(!b.charKey, '飞弹为元素色能量梭(粒子风弹体),不挂角色弹素材');
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

test('元素暴击内置0.5秒冷却:连发暴击只触发一轮齐射,冷却结束后恢复', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const spawned = [];
    game.bullets = { spawn: (cfg) => spawned.push(cfg) };
    game.enemies = makeElemEnemies(6);
    game.augmentManager = am;
    const p = makePlayer();
    p._charDef = { attackType: 'ranged', attackRange: 420 };
    for (const id of ['hex20', 'hex21', 'hex22', 'hex23', 'hex19']) am.equip({ id }, p, game);

    am.dispatchCrit(p, game.enemies[0], 10, game);
    const first = spawned.length;
    assert.ok(first >= 10, '首轮齐射');
    for (let i = 0; i < 5; i++) am.dispatchCrit(p, game.enemies[0], 10, game);
    assert.equal(spawned.length, first, '冷却期内连发暴击不再触发');

    am.dispatchUpdate(p, 0.6, game);   // 冷却走完
    am.dispatchCrit(p, game.enemies[0], 10, game);
    assert.ok(spawned.length > first, '冷却结束后恢复触发');
});

test('技能子弹参与暴击:凯尔Q/大招与利亚娜Q按暴击率掷骰(联动元素暴击)', () => {
    const { CHARS } = require('../dist/data/CharacterDB');
    const mkGame = () => {
        const bullets = [];
        return {
            bullets,
            bulletPool: { spawn: (cfg) => { bullets.push(cfg); return cfg; } },
            particles: { hexActivate() {}, explode() {}, weaponFlash() {}, coldImpact() {} },
            screenShake: { shake() {} },
            floatingText: { spawn() {} },
            audio: { playSfx() {} },
        };
    };
    const mkHero = (id) => {
        const def = CHARS.find(c => c.id === id);
        const p = makePlayer();
        p.charId = id;
        p.x = 100; p.y = 100;
        p.facingX = 1; p.facingY = 0;
        p._charDef = def;
        p.stats.critRate = 0.5;
        p.applyBuff = () => {};
        p.getCastDirection = () => [1, 0];
        p.getMuzzlePosition = () => [110, 100];
        return p;
    };

    const orig = Math.random;
    try {
        // 必暴击
        Math.random = () => 0.01;
        let game = mkGame();
        CHARS.find(c => c.id === 'kai').skills_stub = null;
        const kai = mkHero('kai');
        const kaiDef = CHARS.find(c => c.id === 'kai');
        kaiDef.qSkill(kai, game);
        assert.equal(game.bullets[0].isCrit, true, '凯尔Q 技能弹可暴击');
        game = mkGame();
        kaiDef.ultimate(kai, game);
        assert.ok(game.bullets.length === 30 && game.bullets.every(b => b.isCrit === true), '凯尔大招30发均可暴击');
        assert.ok(game.bullets.every(b => !b.homing && b.speedUpAfter === 2), '大招沿自身弹道直飞,2秒后加速(不追踪)');
        game = mkGame();
        const liana = mkHero('liana');
        CHARS.find(c => c.id === 'liana').qSkill(liana, game);
        assert.equal(game.bullets[0].isCrit, true, '利亚娜Q 技能弹可暴击');

        // 必不暴击
        Math.random = () => 0.99;
        game = mkGame();
        kaiDef.qSkill(mkHero('kai'), game);
        assert.equal(game.bullets[0].isCrit, false, '暴击率未命中时不暴击');
    } finally {
        Math.random = orig;
    }
});

test('元素爆炸轻量化+连爆节流:粒子火花替代重特效,伤害照常全额结算', () => {
    const fx = [];
    const game = makeMockGame();
    game.particles = { emit: (cfg) => fx.push(cfg) };
    game.screenShake = { shake: (m, d) => fx.push(['shake', m]) };
    game.audio = { playSfx: (s) => fx.push(['sfx', s]) };
    game.floatingText = { spawn: (x, y, txt) => fx.push(['txt', txt]) };
    const near = makeElemEnemies(1)[0];
    const far = { x: 500, y: 500, alive: true, dead: false, taken: [], takeDamage(d) { this.taken.push(d); return d; } };
    game.enemies = [near, far];

    applyElementMark(near, 'water', 20, {}, game);
    assert.ok(fx.some(f => !Array.isArray(f) && f.count === 3), '印记=3粒微型火花,不再逐次弹浮字');
    applyElementMark(near, 'fire', 20, {}, game);
    assert.deepEqual(near.taken, [40], '首次爆炸伤害 ×2');
    assert.deepEqual(far.taken, [], '半径外不受影响');
    const heavy = () => fx.filter(Array.isArray).length;
    const h1 = heavy();
    assert.ok(h1 >= 3, '首次爆炸有全套反馈(粒子+震屏+音效+浮字)');

    // 0.12 秒节流窗口内连爆:伤害照常,震屏/音效/浮字不再叠加
    applyElementMark(near, 'earth', 20, {}, game);
    applyElementMark(near, 'wind', 20, {}, game);
    assert.deepEqual(near.taken, [40, 40], '第二次爆炸伤害照常');
    assert.equal(heavy(), h1, '连爆反馈被节流(无新增震屏/音效/浮字)');
});

// ── 凯尔重做：Q 高爆射击（鼠标瞄准）/ E 弱点狙击 / 被动暴伤 ──
test('凯尔Q:鼠标模式朝鼠标方向发射高爆弹(命中/落点半径90爆炸,不穿透)', () => {
    const { CHARS } = require('../dist/data/CharacterDB');
    const mkGame = (mouse) => {
        const bullets = [];
        return {
            bullets, input: mouse ? { mouse } : undefined,
            bulletPool: { spawn: (cfg) => { bullets.push(cfg); return cfg; } },
            particles: { hexActivate() {}, explode() {}, weaponFlash() {} },
            screenShake: { shake() {} }, floatingText: { spawn() {} }, audio: { playSfx() {} },
        };
    };
    const mkKai = () => {
        const p = makePlayer();
        p.charId = 'kai'; p.x = 100; p.y = 100; p.facingX = 0; p.facingY = -1; // 朝上(用于触屏回退对照)
        p._charDef = CHARS.find(c => c.id === 'kai');
        p.stats.critRate = 0.5;
        p.applyBuff = () => {};
        p.getCastDirection = () => [0, -1];
        p.getMuzzlePosition = () => [110, 100];
        return p;
    };
    const kaiDef = CHARS.find(c => c.id === 'kai');

    // 鼠标在右上方且已活动过(active) → 弹道朝鼠标(而非角色朝向)
    const game = mkGame({ x: 510, y: 80, active: true });
    const orig = Math.random;
    Math.random = () => 0.5;   // 不暴击,便于看基础倍率
    try { kaiDef.qSkill(mkKai(), game); } finally { Math.random = orig; }
    const b = game.bullets[0];
    assert.equal(game.bullets.length, 1, '只发射一枚高爆弹');
    assert.ok(b.vx > 0 && b.vy < 0, '朝鼠标方向飞行');
    assert.equal(b.explodeOnExpire, true, '高爆:命中或落点爆炸');
    assert.equal(b.explodeRadius, 90);
    assert.equal(b.pierceLeft, 0, '高爆弹不穿透');
    assert.equal(b.isCrit, false, '暴击率掷骰保留');
    assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 700) < 1e-6, '弹速 700');

    // 无鼠标/鼠标从未活动(触屏) → 回退角色朝向
    const game2 = mkGame({ x: 510, y: 80, active: false });
    kaiDef.qSkill(mkKai(), game2);
    assert.ok(game2.bullets[0].vy < 0 && Math.abs(game2.bullets[0].vx) < 1e-6, '触屏回退朝向');
    const game3 = mkGame(null);
    kaiDef.qSkill(mkKai(), game3);
    assert.ok(game3.bullets[0].vy < 0, '无输入设备同样回退朝向');
});

test('凯尔E弱点狙击:≥5目标各锁一个必暴;不足5全弹+25%;单目标逐发+25%封顶100%', () => {
    const { CHARS } = require('../dist/data/CharacterDB');
    const kaiDef = CHARS.find(c => c.id === 'kai');
    const mkGame = (n) => {
        const bullets = [];
        const timers = [];
        return {
            bullets, timers, enemies: makeElemEnemies(n),
            after: (sec, fn) => timers.push([sec, fn]),
            bulletPool: { spawn: (cfg) => { bullets.push(cfg); return cfg; } },
            particles: { hexActivate() {} }, screenShake: { shake() {} },
            floatingText: { spawn() {} }, audio: { playSfx() {} },
        };
    };
    const fire = (game) => { assert.equal(game.timers.length, 1, '登记1.25秒引导'); assert.equal(game.timers[0][0], 1.25); game.timers[0][1](); };
    const mkKai = (dmg) => {
        const p = makePlayer();
        p.charId = 'kai'; p.x = 0; p.y = 0;
        p._charDef = kaiDef;
        p.stats.damage = dmg;
        p.applyBuff = () => {};
        p.getMuzzlePosition = () => [0, 0];
        return p;
    };

    // ≥5 目标：5 发必暴,锁定 5 个不同目标,基础倍率
    let game = mkGame(7);
    kaiDef.eSkill(mkKai(100), game);
    assert.equal(game.bullets.length, 0, '引导期间不发射');
    fire(game);
    assert.equal(game.bullets.length, 5);
    assert.ok(game.bullets.every(b => b.isCrit === true), '五发必定暴击');
    const locked = new Set(game.bullets.map(b => b._homingTarget));
    assert.equal(locked.size, 5, '随机锁定5个不同怪物');
    assert.ok(game.bullets.every(b => Math.abs(b.damage - 100) < 1e-9), '基础伤害无加成');
    assert.ok(game.bullets.every(b => b.homing === true), '锁定目标飞行');

    // 3 目标：全弹 ×1.25
    game = mkGame(3);
    kaiDef.eSkill(mkKai(100), game);
    fire(game);
    assert.equal(game.bullets.length, 5, '仍发射5发');
    assert.ok(game.bullets.every(b => Math.abs(b.damage - 125) < 1e-9), '目标不足5个全弹+25%');

    // 1 目标：逐发 ×1/×1.25/×1.5/×1.75/×2(上限+100%)
    game = mkGame(1);
    kaiDef.eSkill(mkKai(100), game);
    fire(game);
    assert.equal(game.bullets.length, 5);
    const expected = [100, 125, 150, 175, 200];
    game.bullets.forEach((b, i) => {
        assert.ok(Math.abs(b.damage - expected[i]) < 1e-9, `第${i + 1}发 ×${expected[i] / 100}`);
        assert.equal(b._homingTarget, game.enemies[0], '全部作用于同一怪物');
    });

    // 0 目标：不发射
    game = mkGame(0);
    game.enemies = [];
    kaiDef.eSkill(mkKai(100), game);
    assert.equal(game.bullets.length, 0, '无目标不浪费技能');
});

test('凯尔被动:额外穿透+1 与 暴击伤害+5%', () => {
    const { CHARS } = require('../dist/data/CharacterDB');
    const p = makePlayer();
    p.stats.pierce = 0;
    p.stats.critDmg = 0.5;
    CHARS.find(c => c.id === 'kai').passive(p, {});
    assert.equal(p.stats.pierce, 1);
    assert.ok(Math.abs(p.stats.critDmg - 0.55) < 1e-9, '暴击伤害 0.5 → 0.55');
});

test('凯尔E引导:1.25秒后按引导结束时的战场状态发射;引导期间定身,死亡/无目标不发射', () => {
    const { CHARS } = require('../dist/data/CharacterDB');
    const kaiDef = CHARS.find(c => c.id === 'kai');
    const buffs = [];
    const mkGame = (n) => {
        const bullets = [];
        const timers = [];
        return {
            bullets, timers, enemies: makeElemEnemies(n),
            after: (sec, fn) => timers.push([sec, fn]),
            bulletPool: { spawn: (cfg) => { bullets.push(cfg); return cfg; } },
            particles: { hexActivate() {} }, screenShake: { shake() {} },
            floatingText: { spawn() {} }, audio: { playSfx() {} },
        };
    };
    const mkKai = () => {
        const p = makePlayer();
        p.charId = 'kai'; p.x = 0; p.y = 0; p._charDef = kaiDef;
        p.stats.damage = 100;
        p.applyBuff = (id, dur, mods) => buffs.push({ id, dur, mods });
        p.getMuzzlePosition = () => [0, 0];
        return p;
    };

    // 引导期间新增了目标 → 发射时按新战场锁定
    const game = mkGame(0);
    const kai = mkKai();
    game.enemies = [];
    kaiDef.eSkill(kai, game);
    assert.equal(game.bullets.length, 0, '无目标直接提示,不进入引导');
    game.enemies = makeElemEnemies(6);
    kaiDef.eSkill(kai, game);
    assert.equal(game.bullets.length, 0, '引导中未发射');
    assert.deepEqual(buffs[0], { id: 'weakpoint_aim', dur: 1.25, mods: { noMove: true } }, '引导定身buff');
    game.enemies = makeElemEnemies(2);          // 引导结束时战场变化
    game.timers[0][1]();
    assert.equal(game.bullets.length, 5);
    assert.ok(game.bullets.every(b => Math.abs(b.damage - 125) < 1e-9), '按引导结束时的2目标规则+25%');

    // 引导期间玩家死亡 → 不发射
    const game2 = mkGame(5);
    const kai2 = mkKai();
    kaiDef.eSkill(kai2, game2);
    kai2.alive = false;
    game2.timers[0][1]();
    assert.equal(game2.bullets.length, 0, '引导期间阵亡不发射');
});

test('InputManager鼠标模式:首次鼠标移动/按下置位active(触屏不置位)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/scripts/systems/InputManager.ts'), 'utf8');
    assert.match(src, /mouse = \{ x: 640, y: 360, down: false, active: false \};/, 'mouse.active 初始为 false');
    assert.match(src, /this\.mouse\.active = true; \}/, '鼠标事件置位 active');
    // 坐标必须用 UI 坐标（设计分辨率）换算——getLocation 是物理像素，
    // 全屏/DPI 缩放下会错位导致瞄准不跟鼠标（与 TouchControls 触点换算同源）
    assert.match(src, /e\.getUILocationX\?\.\(\) \?\? e\.getLocationX\(\)/, '鼠标用 UI 坐标');
    assert.match(src, /this\.mouse\.y = CANVAS_H - y;/, 'y 翻转为世界向下坐标系');
    assert.match(src, /active：收到过真实鼠标事件/, '注释说明用途');
});

test('GameManager延时器:暂停安全,换局作废(源码门禁)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/scripts/core/GameManager.ts'), 'utf8');
    assert.match(src, /after\(seconds: number, fn: \(\) => void\): void/, 'after 接口');
    assert.match(src, /tm\.runId !== this\._runId\) \{ this\._timers\.splice\(i, 1\); continue; \}/, '换局作废');
    assert.match(src, /this\._updateTimers\(dt\);/, '随战斗推进计时');
    assert.match(src, /this\._timers = \[\];   \/\/ 换局\/清场：作废全部引导与延迟回调/, '清场作废');
});
