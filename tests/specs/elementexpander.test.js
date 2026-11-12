// ============================================================
//  elementexpander.test.js — 元素体系扩展（2026-11-09：雷/冰/光/暗 + 八选四激活 + 差异化飞弹）
// ============================================================
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeMockGame, makePlayer } = require('./mockGame.js');

const { EnemyBase } = require('../dist/entities/EnemyBase.js');
const { AugmentManager } = require('../dist/systems/AugmentManager.js');
const {
    AUGMENT_DB, ELEMENT_HEX_IDS, ELEMENT_OF_HEX, ELEMENT_TYPES,
    applyElementMark,
} = require('../dist/data/AugmentDB.js');

const byId = (id) => AUGMENT_DB.find(a => a.id === id);
const ALL_ELEMENTS = Object.keys(ELEMENT_TYPES);

function makeElemPlayer(damage = 100) {
    const healed = [];
    const buffs = [];
    const p = makePlayer({ x: 0, y: 0 });
    p.stats.damage = damage;
    p.heal = (v) => healed.push(v);
    p.applyBuff = (name, dur, mods) => buffs.push({ name, dur, mods });
    p._healed = healed;
    p._buffsApplied = buffs;
    p._charDef = { attackType: 'ranged', attackRange: 420 };
    return p;
}

function wireAm(game) {
    const am = new AugmentManager();
    game.augmentManager = am;
    am._game = game;
    return am;
}

function makeEnemy(type, game, x = 300, y = 0) {
    const e = new EnemyBase();
    e.init(type || 'grunt', 1, game);
    e.x = x; e.y = y;
    return e;
}

test('元素暴击激活条件:八张元素卡中任意持有四张即解锁(不再要求特定四张)', () => {
    const game = makeMockGame();
    const p = makeElemPlayer();
    const am = wireAm(game);
    assert.equal(ELEMENT_HEX_IDS.length, 8, '元素卡全集应为8张');
    // 持有 风/火/雷/暗 四张（不含土/水）也应激活
    for (const id of ['hex20', 'hex21', 'hex35', 'hex38']) {
        assert.equal(am.equip({ id, level: 1 }, p, game), true, `${id} 应可装备`);
    }
    assert.equal(am.elementSetComplete(), true, '任意四种元素（风火雷暗）应激活');
    // 只有三种不激活
    const am2 = wireAm(makeMockGame());
    const p2 = makeElemPlayer();
    for (const id of ['hex20', 'hex21', 'hex22']) am2.equip({ id, level: 1 }, p2, makeMockGame());
    assert.equal(am2.elementSetComplete(), false, '三种元素不激活');
});

test('元素暴击改版(2026-11-12):持有后元素卡命中附加印记,不再发射飞弹齐射', () => {
    const game = makeMockGame();
    game.bullets = { spawn(cfg) { (game._spawned ||= []).push(cfg); } };
    const am = wireAm(game);
    const p = makeElemPlayer();
    am.equip({ id: 'hex19', level: 1 }, p, game, { force: true });
    am.equip({ id: 'hex35', level: 1 }, p, game);   // 雷
    am.equip({ id: 'hex36', level: 1 }, p, game);   // 冰
    const e = { x: 300, y: 0, radius: 12, alive: true, dead: false, taken: [],
        takeDamage(d) { this.taken.push(d); return d; } };
    game.enemies = [e];
    am.dispatchHit(p, e, 100, game);
    assert.equal((game._spawned || []).length, 0, '改版后不再发射元素飞弹齐射');
    // 雷卡打印记(1种不引爆) → 冰卡补第二种印记 → 元素爆炸 = 当次命中100×2
    assert.deepEqual(e.taken, [200], '集齐雷+冰两种印记按当次命中伤害×2 引爆');
});

test('差异化附带效果:水减速/冰强减速/雷直伤/光真伤/暗吸血/风击退各有不同结算', () => {
    const game = makeMockGame();
    const p = makeElemPlayer(100);
    const trueDmg = [];
    // 水减速 20%
    const e1 = makeEnemy('grunt', game);
    applyElementMark(e1, 'water', 20, p, game);
    assert.ok(Math.abs(e1.slowMult - 0.8) < 1e-9 && e1._slowTimer > 0, '水弹应挂20%减速');
    // 冰强减速 35%
    const e2 = makeEnemy('grunt', game);
    applyElementMark(e2, 'frost', 20, p, game);
    assert.ok(Math.abs(e2.slowMult - 0.65) < 1e-9, '冰弹应挂35%强减速');
    // 雷直伤（飞弹伤30%）
    const e3 = makeEnemy('grunt', game);
    const hp3 = e3.hp;
    applyElementMark(e3, 'thunder', 20, p, game);
    assert.ok(e3.hp < hp3, '雷弹应立即追加直伤');
    // 光真伤（takeTrueDamage 通道）
    const e4 = makeEnemy('grunt', game);
    e4.takeTrueDamage = (v) => trueDmg.push(v);
    applyElementMark(e4, 'light', 20, p, game);
    assert.equal(trueDmg.length, 1, '光弹应走真伤通道');
    // 暗吸血（飞弹伤30%回血）
    const e5 = makeEnemy('grunt', game);
    applyElementMark(e5, 'shadow', 20, p, game);
    assert.deepEqual(p._healed, [6], '暗弹应回血 20×30%=6');
    // 风击退小兵（远离玩家方向位移）
    const e6 = makeEnemy('grunt', game, 300, 0);
    e6.radius = 18;
    applyElementMark(e6, 'wind', 20, p, game);
    assert.ok(e6.x > 300, `风弹应推开小兵（x=${e6.x}）`);
});

test('雷元素:Lv1命中挂感电DoT;Lv3引雷针死亡时转移给最近敌人', () => {
    const game = makeMockGame();
    const p = makeElemPlayer(100);
    const am = wireAm(game);
    am.equip({ id: 'hex35', level: 3 }, p, game);
    const hex = am.all().find(a => a.id === 'hex35');
    const e = makeEnemy('grunt', game, 200, 0);
    game.enemies = [e];
    hex.onHit(p, e, 10, game);
    const spark = e.dots.find(d => d.type === 'hex_thunder');
    assert.ok(spark && Math.abs(spark.dps - 12) < 1e-9, `Lv3感电DPS应=攻击力12%（${spark && spark.dps}）`);
    // 死亡转移：附近另一只小怪承接感电
    const near = makeEnemy('grunt', game, 260, 0);
    game.enemies = [e, near];
    e.hp = 1;
    e.takeDamage(999, p, game);
    assert.equal(e.alive, false);
    const moved = near.dots.find(d => d.type === 'hex_thunder');
    assert.ok(moved && moved.dps === spark.dps, '引雷针应把感电转移给最近敌人');
});

test('冰元素:叠满层数冻结小怪;Boss改为寒潮易伤且霜甲生效', () => {
    const game = makeMockGame();
    const p = makeElemPlayer(100);
    const am = wireAm(game);
    am.equip({ id: 'hex36', level: 2 }, p, game);
    const hex = am.all().find(a => a.id === 'hex36');
    // Lv2 需 5 层冻结
    const e = makeEnemy('grunt', game);
    for (let i = 0; i < 4; i++) hex.onHit(p, e, 10, game);
    assert.equal(e.frozen, 0, '4层不应冻结');
    hex.onHit(p, e, 10, game);
    assert.ok(e.frozen > 0 && Math.abs(e.frozen - 1.2) < 1e-9, '第5层应冻结1.2秒');
    assert.equal(e._frostStacks, 0, '冻结后层数清空');
    // 霜甲：冻结目标受伤+15%（takeDamage 攻击者特权区）
    e.armor = 0;
    e.hp = e.maxHp = 1000;
    const hpBefore = e.hp;
    e.takeDamage(100, p, game);
    assert.ok(Math.abs(e.hp - (hpBefore - 115)) < 1e-9, `霜甲应增伤15%（实际扣${hpBefore - e.hp}）`);
    // Boss：免疫冻结 → 寒潮标记（独立字段），同样吃霜甲
    const { BossController } = require('../dist/entities/BossController.js');
    const boss = new BossController();
    boss.initBoss(5, game); // 图1
    boss.x = 500; boss.y = 0;
    for (let i = 0; i < 5; i++) hex.onHit(p, boss, 10, game);
    assert.equal(boss.frozen, 0, 'Boss 免疫冻结');
    assert.ok(boss._frostMarkT > 0, 'Boss 叠满应改挂寒潮标记');
    boss.maxHp = boss.hp = 5000; boss.armor = 0;
    const bh = boss.hp;
    boss.takeDamage(100, p, game);
    assert.ok(boss.hp < bh - 100, `寒潮目标应吃霜甲增伤（扣${bh - boss.hp}）`);
});

test('光元素:Lv1真伤/Lv2曝光破隐/Lv3聚焦递增', () => {
    const game = makeMockGame();
    const p = makeElemPlayer(100);
    const am = wireAm(game);
    am.equip({ id: 'hex37', level: 3 }, p, game);
    const hex = am.all().find(a => a.id === 'hex37');
    const e = makeEnemy('grunt', game);
    const trueHits = [];
    e.takeTrueDamage = (v) => trueHits.push(v);
    hex.onHit(p, e, 10, game);   // 第1跳：8%×(1+1×2%)=8.16
    assert.ok(Math.abs(trueHits[0] - 100 * 0.08 * 1.02) < 1e-9, `聚焦第1跳（${trueHits[0]}）`);
    hex.onHit(p, e, 10, game);   // 第2跳：8%×1.04
    assert.ok(Math.abs(trueHits[1] - 100 * 0.08 * 1.04) < 1e-9, `聚焦第2跳（${trueHits[1]}）`);
    // 曝光：隐身单位破隐 + 追加真伤
    const hidden = makeEnemy('grunt', game);
    hidden.invisible = true; hidden.invulnerable = true;
    hidden.takeTrueDamage = (v) => trueHits.push(v);
    hex.onHit(p, hidden, 10, game);
    assert.equal(hidden.invisible, false, '曝光应破隐');
    const last = trueHits[trueHits.length - 1];
    // hidden 是新目标：聚焦层数换目标清零，从第1档 1.02 重新起跳
    assert.ok(Math.abs(last - (100 * 0.08 * 1.02 + 100 * 0.20)) < 1e-9, `曝光应追加20%真伤（${last}）`);
});

test('暗元素:腐蚀标记下击杀回血;Lv2汲取按实付伤害回血且受每秒预算限制', () => {
    const game = makeMockGame();
    const p = makeElemPlayer(100);
    const am = wireAm(game);
    am.equip({ id: 'hex38', level: 2 }, p, game);
    const hex = am.all().find(a => a.id === 'hex38');
    const e = makeEnemy('grunt', game);
    e.maxHp = e.hp = 10000; e.armor = 0;
    hex.onHit(p, e, 10, game);              // 挂腐蚀
    assert.ok(e._shadowMarkT > 0, '命中应挂腐蚀标记');
    // 汲取：实付100 → 回8；预算上限 6/秒
    p._healed.length = 0;
    e.takeDamage(100, p, game);
    assert.ok(Math.abs(p._healed[0] - 6) < 1e-9, `汲取应受每秒预算6封顶（回${p._healed[0]}）`);
    // 同秒第二次：预算已用完，不再回血
    p._healed.length = 0;
    e.takeDamage(100, p, game);
    assert.equal(p._healed.length, 0, '每秒预算耗尽后本秒不再汲取');
    // 击杀回血：Lv2 数值 3
    const dying = makeEnemy('grunt', game);
    hex.onHit(p, dying, 10, game);
    p._healed.length = 0;
    dying.hp = 1;
    dying.takeDamage(999, p, game);
    assert.deepEqual(p._healed, [3], '腐蚀单位死亡应回3生命');
});

test('元素倾向:持有≥2张元素卡后,元素卡刷出频率显著提升(×3权重)', () => {
    const countElems = (am, p, rounds) => {
        let hits = 0;
        for (let i = 0; i < rounds; i++) {
            for (const card of am.rollOptions(3, 10)) {
                if (ELEMENT_HEX_IDS.includes(card.id)) hits++;
            }
        }
        return hits;
    };
    // 基线：无元素卡持有
    const am0 = wireAm(makeMockGame());
    const p0 = makeElemPlayer();
    const base = countElems(am0, p0, 400);
    // 持有 2 张元素卡（风/火）→ 未持有的雷/冰/光/暗/土/水出现率提升
    const am1 = wireAm(makeMockGame());
    const p1 = makeElemPlayer();
    const game1 = makeMockGame(); game1.augmentManager = am1;
    am1.equip({ id: 'hex20', level: 1 }, p1, makeMockGame());
    am1.equip({ id: 'hex21', level: 1 }, p1, makeMockGame());
    const boosted = countElems(am1, p1, 400);
    // 持有2张后卡池内元素候选变少(6张未持有+2张升级卡)，但权重×3足以抵消；
    // 用宽松下限(1.5×)保证统计稳定，同时避免纯随机偶发
    assert.ok(boosted > Math.max(base * 1.5, base + 30),
        `元素倾向应显著提升元素卡出现率（基线${base} vs 提升${boosted}）`);
});

test('元素闭环:集齐四种元素后每次刷新必出元素暴击,持有后不再强制', () => {
    const am = wireAm(makeMockGame());
    const p = makeElemPlayer();
    const game = makeMockGame(); game.augmentManager = am;
    // 未集齐：不出
    for (let i = 0; i < 30; i++) {
        for (const c of am.rollOptions(3, 10)) assert.notEqual(c.id, 'hex19', '未集齐不出元素暴击');
    }
    // 集齐四种（风火土水）
    am.equip({ id: 'hex20', level: 1 }, p, makeMockGame());
    am.equip({ id: 'hex21', level: 1 }, p, makeMockGame());
    am.equip({ id: 'hex22', level: 1 }, p, makeMockGame());
    am.equip({ id: 'hex23', level: 1 }, p, makeMockGame());
    for (let i = 0; i < 30; i++) {
        const opts = am.rollOptions(3, 10);
        assert.ok(opts.some(c => c.id === 'hex19'), `集齐后每次刷新必出元素暴击（第${i}轮缺）`);
    }
    // 付费刷新路径同样必出
    for (let i = 0; i < 10; i++) {
        assert.ok(am.rollOptions(3, 10, { refresh: true }).some(c => c.id === 'hex19'), '刷新路径同样必出');
    }
    // 持有后不再强制（正常彩卡概率回归）
    assert.equal(am.equip({ id: 'hex19', level: 1 }, p, game, { force: true }), true);
    let seen = 0;
    for (let i = 0; i < 200; i++) {
        if (am.rollOptions(3, 10).some(c => c.id === 'hex19')) seen++;
    }
    assert.ok(seen < 200, '持有后不再每轮必出');
});

// ── 2026-11-09 商店刷出规则(玩家调整):单档卡购后不刷 + 跳档衰减 ──

test('单档技能卡购后不再刷出且重复装备被拒(hex19/闪电网链)', () => {
    const am = wireAm(makeMockGame());
    const p = makeElemPlayer();
    const game = makeMockGame(); game.augmentManager = am;
    // 闪电网链(hex24 单档金):购前可刷出,购后金档池整局绝迹
    let seenBefore = 0;
    for (let i = 0; i < 300; i++) {
        if (am.rollOptions(3, 10).some(c => c.id === 'hex24')) seenBefore++;
    }
    assert.ok(seenBefore > 0, '购前金档池可刷出闪电网链');
    assert.equal(am.equip({ id: 'hex24', level: 1 }, p, game, { force: true }), true);
    for (let i = 0; i < 300; i++) {
        for (const c of am.rollOptions(3, 10)) {
            assert.notEqual(c.id, 'hex24', '单档卡持有后不应再刷出');
        }
    }
    // 重复装备被拒(无更高档可升,重复购买无效果)
    assert.equal(am.equip({ id: 'hex24', level: 1 }, p, game), false, '单档卡重复装备应被拒');
    assert.equal(am.equip({ id: 'hex24', level: 2 }, p, game), false, '伪高档同样被拒');
});

test('元素暴击购后同样绝迹:集齐→必出→购买→不再出现', () => {
    const am = wireAm(makeMockGame());
    const p = makeElemPlayer();
    const game = makeMockGame(); game.augmentManager = am;
    for (const id of ['hex20', 'hex21', 'hex22', 'hex23']) {
        am.equip({ id, level: 1 }, p, makeMockGame());
    }
    assert.ok(am.rollOptions(3, 10).some(c => c.id === 'hex19'), '集齐后必出');
    assert.equal(am.equip({ id: 'hex19', level: 1 }, p, game, { force: true }), true);
    for (let i = 0; i < 100; i++) {
        for (const c of am.rollOptions(3, 10)) {
            assert.notEqual(c.id === 'hex19' ? c.id : '', 'hex19', '持有后整局不再刷出元素暴击');
        }
    }
});

test('跳档衰减:未购买银档时金档刷出率下降,持有银档后恢复(升级卡)', () => {
    const countAt = (am, targetId, rounds) => {
        let hits = 0;
        for (let i = 0; i < rounds; i++) {
            for (const c of am.rollOptions(3, 10)) {
                if (c.id === targetId && (c.level ?? 1) === 2) hits++;
            }
        }
        return hits;
    };
    // 未持有风元素:金档直出权重 ×0.5（采样放大到2000轮稳住方差）
    const am0 = wireAm(makeMockGame());
    const skip = countAt(am0, 'hex20', 2000);
    // 持有风元素 Lv1:金档走升级卡通道权重 ×1.0
    const am1 = wireAm(makeMockGame());
    am1.equip({ id: 'hex20', level: 1 }, makeElemPlayer(), makeMockGame());
    const upgrade = countAt(am1, 'hex20', 2000);
    assert.ok(upgrade > skip * 1.2,
        `持有银档后金档应更常刷出（跳档${skip} vs 升级${upgrade}）`);
});
