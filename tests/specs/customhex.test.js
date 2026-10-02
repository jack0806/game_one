'use strict';
// 自定义强化包（hex24~hex32）行为单测
const test = require('node:test');
const assert = require('node:assert/strict');
const { AUGMENT_DB } = require('../dist/data/AugmentDB');
const { AugmentManager } = require('../dist/systems/AugmentManager');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { nextAugRefreshCost } = require('../dist/systems/Economy');
const { makeMockGame, makePlayer } = require('./mockGame');

function makeEnemy(game, x, y, hp = 1000) {
    const e = new EnemyBase(); e.init('grunt', 1, game);
    e.x = x; e.y = y; e.maxHp = hp; e.hp = hp;
    return e;
}

// ── 基础完整性 ───────────────────────────────────────────────

test('自定义强化包9个全部注册(hex24~32)，图标均在现有素材集合内', () => {
    const KNOWN_ICONS = new Set(['pierce', 'lightning', 'explosion', 'fire', 'poison', 'crit', 'speed',
        'lifesteal', 'bounce', 'heart', 'shield', 'combo', 'gold', 'summon', 'ice', 'chaos']);
    const names = ['闪电网链', '天雷', '化气为剑', '实习刺客', 'boss精英',
        '再来一次（强化版）', '合理避税', '加速', '保命分身'];
    for (let i = 24; i <= 32; i++) {
        const def = AUGMENT_DB.find(a => a.index === i);
        assert.ok(def, `hex${i} 应存在`);
        assert.equal(def.name, names[i - 24], `hex${i} 名称不符`);
        assert.equal(def.prices.length, 1, `hex${i} 为单档强化`);
        assert.ok(KNOWN_ICONS.has(def.icon), `hex${i} 图标 ${def.icon} 必须在现有素材集合`);
    }
});

// ── 闪电网链 (hex24) ─────────────────────────────────────────

test('闪电网链:攻击命中连接附近4-5个敌人各受50%伤害,超距不连', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makePlayer();
    const anchor = makeEnemy(game, 100, 100);
    anchor.armor = 0;
    const near = [];
    for (let i = 0; i < 6; i++) { const e = makeEnemy(game, 150 + i * 40, 100); e.armor = 0; near.push(e); }
    const far = makeEnemy(game, 100, 600);   // 距锚点500 > 220
    game.enemies.push(anchor, ...near, far);
    am.equip({ id: 'hex24' }, p, game);
    am.dispatchHit(p, anchor, 40, game);
    const hit = near.filter(e => e.maxHp - e.hp > 0);
    assert.ok(hit.length >= 4 && hit.length <= 5, `应连接4-5个敌人,实际${hit.length}`);
    assert.ok(hit.every(e => e.maxHp - e.hp === 20), '每个链上目标受50%×40=20点伤害');
    assert.equal(anchor.maxHp - anchor.hp, 0, '锚点自身不被链重复伤害');
    assert.equal(far.maxHp - far.hp, 0, '220码外的敌人不连接');
});

// ── 天雷 (hex25) ─────────────────────────────────────────────

test('天雷:每5秒降雷,150码圆形区域80点伤害', () => {
    const { Rng } = require('../dist/core/MathUtils');
    const origPick = Rng.pick;
    Rng.pick = (arr) => arr[0];                    // 固定雷击第一个目标,保证断言确定性
    try {
        const am = new AugmentManager();
        const game = makeMockGame();
        const p = makePlayer();
        const a = makeEnemy(game, 100, 100); a.armor = 0;
        const b = makeEnemy(game, 100, 400); b.armor = 0;   // 距 a 300 > 150
        game.enemies.push(a, b);
        am.equip({ id: 'hex25' }, p, game);
        am.dispatchUpdate(p, 4.9, game);
        assert.equal(a.maxHp - a.hp, 0, '4.9秒时天雷未落');
        am.dispatchUpdate(p, 0.2, game);                     // 累计5.1秒
        assert.equal(a.maxHp - a.hp, 80, '雷击点150码内受80点伤害');
        assert.equal(b.maxHp - b.hp, 0, '区域外不受影响');
    } finally {
        Rng.pick = origPick;
    }
});

// ── 化气为剑 (hex26) ─────────────────────────────────────────

test('化气为剑:装备禁普攻+攻速1:0.75转化攻击力,召唤飞剑,卸下还原', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const summoned = [];
    game.spawnQiSwords = (p) => summoned.push(p);
    game.despawnQiSwords = () => summoned.push('despawn');
    const p = makePlayer();
    am.equip({ id: 'hex26' }, p, game);
    assert.equal(p.stats.swordMode, true, '装备后进入剑气模式(禁普攻)');
    assert.equal(summoned.length, 1, '装备时召唤飞剑');
    am.unequip('hex26', p, game);
    assert.equal(p.stats.swordMode, false, '卸下后恢复普攻');
    assert.deepEqual(summoned, [p, 'despawn'], '卸下时回收飞剑');
});

test('化气为剑:攻击力=基础+当前攻速×0.75(动态换算)', () => {
    const { PlayerController } = require('../dist/entities/PlayerController');
    const p = new PlayerController();
    p.stats = { maxHp: 100, armor: 0, critRate: 0, _coreOverflow: false,
        damage: 20, attackSpeed: 2, swordMode: true };
    p.hp = 100;
    assert.equal(p.getDamage(), 20 + 2 * 0.75, '攻速2 → 攻击力20+1.5=21.5');
    // 飞剑数量 = 攻击力/10 四舍五入：21.5 → 2把
    assert.equal(Math.round(p.getDamage() / 10), 2, '21.5/10 四舍五入=2把飞剑');
});

// ── 实习刺客 (hex27) ─────────────────────────────────────────

test('实习刺客:每15秒进入2秒无敌隐身,下一次攻击×2后消耗', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = new (require('../dist/entities/PlayerController').PlayerController)();
    p.stats = { maxHp: 100, armor: 0, critRate: 0, _coreOverflow: false };
    p.hp = 100;
    const e = makeEnemy(game, 100, 100); e.armor = 0;
    game.enemies.push(e);
    am.equip({ id: 'hex27' }, p, game);
    am.dispatchUpdate(p, 15.1, game);
    assert.ok(p._buffs.some(b => b.id === 'intern_stealth' && b.mods.invincible === true),
        '进入2秒不可选中(无敌)隐身');
    assert.equal(p.stats.assassinStrike, true, '下一发攻击已装填×2');
    p.applyAttackDamage(e, game, 20);
    assert.equal(e.maxHp - e.hp, 40, '隐身后首击 20×2=40');
    assert.equal(p.stats.assassinStrike, false, '×2为一次性,已消耗');
    p.applyAttackDamage(e, game, 20);
    assert.equal(e.maxHp - e.hp, 60, '后续攻击恢复常规20');
});

// ── boss精英 (hex28) ─────────────────────────────────────────

test('boss精英:精英/Boss增伤150%,装备时削减当前Boss 10%生命上限', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const cuts = [];
    game.cutBossHp = (frac, p) => cuts.push(frac);
    const p = makePlayer({ stats: { ...makePlayer().stats } });
    am.equip({ id: 'hex28' }, p, game);
    assert.equal(p.stats.eliteBonus, 1.5, '对首领/Boss增伤150%');
    assert.deepEqual(cuts, [0.10], '装备时立即削减Boss 10%生命上限');
    am.unequip('hex28', p, game);
    assert.equal(p.stats.eliteBonus, 0, '卸下后增伤回收');
});

// ── 再来一次（强化版）(hex29) ────────────────────────────────

test('再来一次(强化版):每次强化选择重置5次免费刷新,卸下清零', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    game.augmentManager = am;                      // 词条 onLevel 经 game.augmentManager 回写
    const p = makePlayer();
    am.equip({ id: 'hex29' }, p, game);
    assert.equal(am.freeRefreshes, 5, '装备后免费刷新5次');
    am.freeRefreshes = 2;                          // 模拟本页已用3次
    am.unequip('hex29', p, game);
    assert.equal(am.freeRefreshes, 0, '卸下后免费刷新清零');
});

// ── 合理避税 (hex30) ─────────────────────────────────────────

test('合理避税:刷新费用减半(费用乘区0.5),卸下还原', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    game.augmentManager = am;
    const p = makePlayer();
    am.equip({ id: 'hex30' }, p, game);
    assert.equal(am.refreshCostMult, 0.5, '费用乘区0.5');
    // 首刷5金 → 5×0.5=2.5 → 取整3金（至少1）
    assert.equal(Math.max(1, Math.round(nextAugRefreshCost(0) * am.refreshCostMult)), 3);
    am.unequip('hex30', p, game);
    assert.equal(am.refreshCostMult, 1, '卸下后费用还原');
});

// ── 加速 (hex31) ─────────────────────────────────────────────

test('加速:技能与强化冷却-20%(cdReduction),强化计时器按比例加速走表', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makePlayer();
    const a = makeEnemy(game, 100, 100); a.armor = 0;
    game.enemies.push(a);
    am.equip({ id: 'hex31' }, p, game);
    assert.equal(p.stats.cdReduction, 0.2, '技能/强化冷却-20%');
    am.equip({ id: 'hex25' }, p, game);            // 天雷5秒冷却
    // 4.2秒 × (1+0.2) = 5.04 ≥ 5 → 天雷提前落下
    am.dispatchUpdate(p, 4.2, game);
    assert.equal(a.maxHp - a.hp, 80, '强化冷却缩减后天雷在4.2实际秒落下');
});

// ── 保命分身 (hex32) ─────────────────────────────────────────

test('保命分身:血量<10%时召唤分身,30秒冷却内不重复,回升后再触发', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const spawns = [];
    game.spawnLifeClone = (p) => spawns.push(p);
    const p = makePlayer();
    p.stats.maxHp = 100;
    am.equip({ id: 'hex32' }, p, game);
    p.hp = 50;
    am.dispatchUpdate(p, 1, game);
    assert.equal(spawns.length, 0, '血量50%不触发');
    p.hp = 9;                                       // 低于10%
    am.dispatchUpdate(p, 0.1, game);
    assert.equal(spawns.length, 1, '血量低于10%召唤分身');
    am.dispatchUpdate(p, 29, game);                 // 冷却期内
    assert.equal(spawns.length, 1, '30秒冷却内不重复触发');
    am.dispatchUpdate(p, 1.1, game);                // 累计超过30秒,血量仍低于10%
    assert.equal(spawns.length, 2, '冷却结束后血量仍低则再次触发');
});
