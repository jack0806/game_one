'use strict';
// 方案D 升级特权测试：金档+购后不刷 / 特权逐卡行为（力量核心按用户定稿版：
// Lv3 核心共鸣=攻击时额外打出一道攻击）。
const test = require('node:test');
const assert = require('node:assert/strict');
const cc = require('cc');
const { AUGMENT_DB, getHexByIndex } = require('../dist/data/AugmentDB.js');
const { AugmentManager } = require('../dist/systems/AugmentManager.js');
const { GameConfig } = require('../dist/data/GameConfig.js');
const { makeMockGame, makePlayer } = require('./mockGame.js');

function freshAm() {
    cc.sys.localStorage._clear();
    GameConfig.set('amberBugChance', 0);
    return new AugmentManager();
}

// ── 规则一：可叠加海克斯金档及以上，购买后不再刷出 ────────────
test('金档规则:功能卡金档购后不刷,银档仍可叠,彩档升级通道保留', () => {
    const am = freshAm();
    const p = makePlayer();
    const game = makeMockGame({ augmentManager: am });
    p._charDef = { attackType: 'ranged' };
    // 未拥有：金档可刷出力量核心
    let saw = false;
    for (let i = 0; i < 60; i++) {
        const opts = am.rollOptions(1, 10, { forceRarity: 'gold' });
        if (opts.some(o => o.id === 'hex02')) saw = true;
    }
    assert.ok(saw, '未拥有时金档力量核心可刷出');
    // 装备 Lv2（金档）后：金档不再刷出该卡
    am.equip({ id: 'hex02', level: 2, name: '力量核心', rarity: 'silver', prices: [12, 45, 160], values: [0.01, 0.02, 0.05] }, p, game, { force: true });
    saw = false;
    for (let i = 0; i < 60; i++) {
        const opts = am.rollOptions(1, 10, { forceRarity: 'gold' });
        if (opts.some(o => o.id === 'hex02')) saw = true;
    }
    assert.equal(saw, false, '已拥有 Lv2 后金档不再刷出');
    // 彩档（Lv3 升级卡）仍可刷出——升级通道保留
    saw = false;
    for (let i = 0; i < 60; i++) {
        const opts = am.rollOptions(1, 10, { forceRarity: 'prismatic' });
        if (opts.some(o => o.id === 'hex02')) saw = true;
    }
    assert.ok(saw, 'Lv3 升级卡仍可刷出');
    // 银档仍可无限叠
    saw = false;
    for (let i = 0; i < 60; i++) {
        const opts = am.rollOptions(1, 10, { forceRarity: 'silver' });
        if (opts.some(o => o.id === 'hex02')) saw = true;
    }
    assert.ok(saw, '银档可继续叠购');
    // 升到 Lv3 后：金/彩档都不再刷，银档仍可
    am.equip({ id: 'hex02', level: 3 }, p, game, { force: true });
    for (const tier of ['gold', 'prismatic']) {
        saw = false;
        for (let i = 0; i < 60; i++) {
            const opts = am.rollOptions(1, 10, { forceRarity: tier });
            if (opts.some(o => o.id === 'hex02')) saw = true;
        }
        assert.equal(saw, false, `Lv3 后 ${tier} 档不再刷出`);
    }
});

// ── 力量核心（用户定稿）：Lv2 过载电容 / Lv3 核心共鸣 ──────────
test('力量核心:Lv3核心共鸣额外一道攻击(远程extraBullets/近战meleeExtraHits)', () => {
    const am = freshAm();
    const game = makeMockGame({ augmentManager: am });
    const p = makePlayer();
    p._charDef = { attackType: 'ranged' };
    am.equip({ id: 'hex02', level: 3 }, p, game, { force: true });
    assert.equal(p.stats.extraBullets, 1, '远程：额外一发子弹');
    const melee = makePlayer();
    melee._charDef = { attackType: 'melee' };
    am.equip({ id: 'hex02', level: 3 }, melee, game, { force: true });
    assert.equal(melee.stats.meleeExtraHits, 1, '近战：额外一段伤害');
});

test('力量核心:Lv2过载电容暴击附加固伤,Lv1无特权', () => {
    const am = freshAm();
    const game = makeMockGame({ augmentManager: am });
    const p = makePlayer();
    p._charDef = { attackType: 'ranged' };
    p.getDamage = () => 100;
    const enemy = { alive: true, x: 0, y: 0, takeDamage(d) { this.taken = (this.taken ?? 0) + d; } };
    am.equip({ id: 'hex02', level: 2 }, p, game, { force: true });
    am.dispatchCrit(p, enemy, 50, game);
    assert.equal(Math.round(enemy.taken), 10, '附加 10% 攻击力固伤');
    // Lv1 无特权
    const am2 = freshAm();
    am2.equip({ id: 'hex02', level: 1 }, p, game, { force: true });
    const e2 = { alive: true, x: 0, y: 0, takeDamage(d) { this.taken = (this.taken ?? 0) + d; } };
    am2.dispatchCrit(p, e2, 50, game);
    assert.equal(e2.taken, undefined, 'Lv1 不触发过载电容');
});

// ── 精准仪轨：弱点习惯叠层 / 换目标清零 ───────────────────────
test('精准仪轨:Lv2弱点习惯同目标叠暴击,换目标清零', () => {
    const am = freshAm();
    const game = makeMockGame({ augmentManager: am });
    const p = makePlayer();
    am.equip({ id: 'hex07', level: 2 }, p, game, { force: true });
    const a = { alive: true }, b = { alive: true };
    am.dispatchHit(p, a, 10, game);
    am.dispatchHit(p, a, 10, game);
    am.dispatchHit(p, a, 10, game);
    assert.equal(p.stats.perkFocusCrit, 0.03, '同目标 3 跳 = +3%');
    am.dispatchHit(p, b, 10, game);
    assert.equal(p.stats.perkFocusCrit, 0.01, '换目标清零重记 1%');
    // 上限封顶（默认 5%）
    for (let i = 0; i < 10; i++) am.dispatchHit(p, a, 10, game);
    assert.equal(p.stats.perkFocusCrit, 0.05, '封顶 +5%');
});

// ── 生命涌泉：涌泉活水（波间开页）+ 泉眼标志 ───────────────────
test('生命涌泉:Lv2波间回复已损生命,Lv3泉眼低血减伤标志', () => {
    const am = freshAm();
    const game = makeMockGame({ augmentManager: am });
    const p = makePlayer();
    p.heal = function (n) { this.hp = Math.min(this.stats.maxHp, this.hp + n); };
    am.equip({ id: 'hex03', level: 2 }, p, game, { force: true });
    p.hp = 50; // 升档会先按 Lv2 数值放大 maxHp（100→105），回复按放大后的已损计算
    const lost = p.stats.maxHp - 50;
    am.dispatchShopOpen(p, game);
    assert.ok(Math.abs(p.hp - (50 + lost * 0.15)) < 1e-6, '回复 15% 已损生命');
    am.equip({ id: 'hex03', level: 3 }, p, game, { force: true });
    assert.equal(p.stats.perkLowHpReduce, GameConfig.get('perkLowHpReduce'), '泉眼标志生效');
});

// ── 延展力场：透镜/贯穿标志 ───────────────────────────────────
test('延展力场:Lv2透镜伤害标志,Lv3贯穿标志,卖出清零', () => {
    const am = freshAm();
    const game = makeMockGame({ augmentManager: am });
    const p = makePlayer();
    am.equip({ id: 'hex11', level: 2 }, p, game, { force: true });
    assert.equal(p.stats.perkFarShot, GameConfig.get('perkFarShotBonus'));
    assert.equal(p.stats.perkRangePierce, false);
    am.equip({ id: 'hex11', level: 3 }, p, game, { force: true });
    assert.equal(p.stats.perkRangePierce, true);
    am.unequip('hex11', p, game);
    assert.equal(p.stats.perkFarShot, 0, '卖出后透镜标志清零');
    assert.equal(p.stats.perkRangePierce, false, '卖出后贯穿标志清零');
});

// ── 点金手：复利 / 黄金之手 ──────────────────────────────────
test('点金手:Lv2复利按存款加成拾取,Lv3精英金与结算比标志', () => {
    const am = freshAm();
    const eco = { gainMult: 1, gold: 0, earnedThisRun: 0 };
    const game = makeMockGame({ economy: eco, augmentManager: am });
    const p = makePlayer();
    am.equip({ id: 'hex16', level: 2 }, p, game, { force: true });
    assert.equal(eco.compoundPerk, true);
    eco.gold = 350; // 存款 350 → floor(3.5)=3 → +3%
    const Economy = require('../dist/systems/Economy.js');
    // 直接调用 Economy 实例方法验证复利（gainMult=1、goldGainMult=1）
    const realEco = new Economy.Economy();
    realEco.compoundPerk = true;
    realEco.gold = 350;
    realEco.addGold(100);
    assert.equal(realEco.gold, 453, '拾取 100 金吃复利 +3%（350 + 100×1.03）');
    am.equip({ id: 'hex16', level: 3 }, p, game, { force: true });
    assert.equal(eco.eliteGoldBonus, true, '精英金标志');
    assert.equal(p.stats.perkSettleRate, GameConfig.get('perkSettleRate'), '结算比改善标志');
});

// ── 元素卡：特权标志与蔓延转移 ────────────────────────────────
test('元素卡:Lv2/Lv3特权标志齐备(风压/风驰/燃尽/潮汐/冰点/厚重)', () => {
    const am = freshAm();
    const game = makeMockGame({ augmentManager: am });
    const p = makePlayer();
    p._charDef = { attackType: 'ranged' };
    am.equip({ id: 'hex20', level: 3 }, p, game, { force: true });
    assert.equal(p.stats.perkWindPush, true);
    assert.equal(p.stats.perkSkillBulletSpeed, true);
    am.equip({ id: 'hex21', level: 3 }, p, game, { force: true });
    assert.equal(p.stats.perkFireSpread, true);
    assert.equal(p.stats.perkBurnout, true);
    am.equip({ id: 'hex22', level: 2 }, p, game, { force: true });
    assert.equal(p.stats.perkPierceBonus, GameConfig.get('perkPierceBonus'));
    am.equip({ id: 'hex23', level: 3 }, p, game, { force: true });
    assert.equal(p.stats.perkTideDmg, GameConfig.get('perkTideBonus'));
    assert.equal(p.stats.perkFrostCrit, true);
});

test('火元素蔓延:灼烧目标死亡时剩余灼烧转移给邻近敌人', () => {
    const { EnemyBase } = require('../dist/entities/EnemyBase.js');
    const drops = [];
    const dying = new EnemyBase();
    const game = makeMockGame({
        player: makePlayer(),
        enemies: [],
        economy: { spawnDrop(...a) { drops.push(a); } },
    });
    game.player.stats.perkFireSpread = true;
    game.player.stats.perkBurnout = false;
    dying.init('grunt', 1, game);
    dying.isElite = false;
    dying.dots.push({ type: 'hex_fire', dps: 20, timeLeft: 1.5, color: '#ff6a3d' });
    const near = new EnemyBase();
    near.init('grunt', 1, game);
    near.x = dying.x + 50; near.y = dying.y;
    game.enemies.push(near);
    dying.takeDamage(1e9, game.player, game);
    const spread = near.dots.find(d => d.type === 'hex_fire');
    assert.ok(spread, '邻近敌人获得转移灼烧');
    // 剩余 20*1.5=30，转移 50% → 15 总量 / 1.5 秒 = 10 DPS
    assert.ok(Math.abs(spread.dps - 10) < 1e-6, '转移灼烧量正确');
});

// ── descAt 特权文案门禁 ──────────────────────────────────────
test('特权文案:10 张卡 Lv2/Lv3 描述均带特权行', () => {
    const ids = ['hex01', 'hex02', 'hex03', 'hex07', 'hex11', 'hex16', 'hex20', 'hex21', 'hex22', 'hex23'];
    for (const id of ids) {
        const def = getHexByIndex(Number(id.slice(3)));
        assert.ok(def, `${id} 存在`);
        assert.ok(def.descAt(2).includes('特权'), `${id} Lv2 描述带特权行`);
        assert.ok(def.descAt(3).includes('特权'), `${id} Lv3 描述带特权行`);
        assert.ok(!def.descAt(1).includes('特权'), `${id} Lv1 无特权行`);
    }
});
