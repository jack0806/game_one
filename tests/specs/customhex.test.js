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
    const KNOWN_ICONS = new Set(require('node:fs').readdirSync(require('node:path').resolve(__dirname, '../../assets/resources/art')).filter(name => /^ui_icon_.+\.png$/.test(name)).map(name => name.slice(8, -4)));
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

// ── 荆棘甲壳 (hex33) ─────────────────────────────────────────

test('荆棘甲壳:被攻击命中逐层+护甲,20层封顶,升档追溯差值,卖出保留', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makePlayer();
    am.equip({ id: 'hex33' }, p, game);
    const armor0 = p.stats.armor || 0;
    for (let i = 0; i < 25; i++) am.dispatchPlayerHit(p, game);
    assert.equal((p.stats.armor || 0) - armor0, 20 * 3, 'Lv1 每层+3护甲,封顶20层');
    // 升档 Lv1→Lv2：已有 20 层追溯差值 20×(4-3)=+20，之后每层+4
    am.equip({ id: 'hex33', level: 2 }, p, game);
    assert.equal((p.stats.armor || 0) - armor0, 20 * 4, '升档对已叠层数按新档位追溯');
    am.dispatchPlayerHit(p, game);
    assert.equal((p.stats.armor || 0) - armor0, 20 * 4, '满层后继续受击不再叠加');
    // 卖出：护甲保留（变现链），层数清零，重购从 0 重新叠
    am.unequip('hex33', p, game);
    assert.equal((p.stats.armor || 0) - armor0, 20 * 4, '卖出时已获护甲保留不退');
    am.equip({ id: 'hex33' }, p, game);
    am.dispatchPlayerHit(p, game);
    assert.equal((p.stats.armor || 0) - armor0, 20 * 4 + 3, '重购后从 0 层重新叠');
});

// ── 风行节奏 (hex34) ─────────────────────────────────────────

function walk(p, am, game, total, step = 50) {
    for (let moved = 0; moved < total; moved += step) {
        p.x += step;
        am.dispatchUpdate(p, 0.1, game);
    }
}

test('风行节奏:移动叠双速层数,满层封顶,受击折半,卖出全额退还', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makePlayer();
    p.stats.speed = 300;
    p.stats.attackSpeed = 1;
    am.equip({ id: 'hex34' }, p, game);
    const s0 = p.stats.speed, a0 = p.stats.attackSpeed;
    walk(p, am, game, 250); // 250码 = 2层,余50码（swapFactor 为因子替换语义：按基值加算）
    assert.ok(Math.abs(p.stats.speed - s0 * 1.04) < 1e-6, '2层移速+4%（每层+2%加算）');
    assert.ok(Math.abs(p.stats.attackSpeed - a0 * 1.02) < 1e-9, '2层攻速+2%（每层+1%加算）');
    walk(p, am, game, 2000); // 累计更多,封顶15层
    assert.ok(Math.abs(p.stats.speed - s0 * 1.30) < 1e-6, '满层15层封顶(+30%)');
    am.dispatchPlayerHit(p, game); // 15 → 7
    assert.ok(Math.abs(p.stats.speed - s0 * 1.14) < 1e-6, '受击失去一半层数(15→7,+14%)');
    am.unequip('hex34', p, game);
    assert.ok(Math.abs(p.stats.speed - s0) < 1e-6, '卖出全额退还移速');
    assert.ok(Math.abs(p.stats.attackSpeed - a0) < 1e-9, '卖出全额退还攻速');
});

test('风行节奏:单帧大位移(传送/重生)不计入路程', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makePlayer();
    p.stats.speed = 300;
    p.stats.attackSpeed = 1;
    am.equip({ id: 'hex34' }, p, game);
    am.dispatchUpdate(p, 0.1, game); // 初始化位置基准
    p.x += 500;                       // 单帧大跳
    am.dispatchUpdate(p, 0.1, game);
    assert.equal(p.stats.speed, 300, '传送位移不得白送层数');
    p.x += 50;                        // 正常单帧位移继续累计
    am.dispatchUpdate(p, 0.1, game);
    assert.equal(p.stats.speed, 300, '50码不足一层');
    p.x += 50;
    am.dispatchUpdate(p, 0.1, game);
    assert.ok(Math.abs(p.stats.speed - 300 * 1.02) < 1e-6, '累计100码获得1层');
});
