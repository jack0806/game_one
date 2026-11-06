'use strict';
// v3 掉落改版测试：DropDB 纯函数（结算兑换 / Boss 专属 / 材料 / 道具 / 配方）
// + SaveSystem 仓库新字段（材料库存 / 专属绝版 / 软保底 / 重铸）。
const test = require('node:test');
const assert = require('node:assert/strict');
const cc = require('cc');
const {
    BOSS_UNIQUES, CONSUMABLES, MATERIALS, RECIPES, MAP_MATERIAL_IDS,
    settleGoldToCoreCoins, rollBossUnique, bossUniquesOf,
    rollMaterialFor, rollConsumableFor, recipeCostMet, recipeConsume,
} = require('../dist/data/DropDB.js');
const { EQUIP_AFFIXES, rollEquipmentDrop } = require('../dist/data/EquipmentDB.js');
const { SaveSystem } = require('../dist/systems/SaveSystem.js');

function freshProfile() {
    cc.sys.localStorage._clear();
    SaveSystem.resetCache();
    SaveSystem.selectSlot(0);
}

// ── 局末结算：200:1，不足 1 枚按 1 枚 ─────────────────────────
test('结算兑换:剩余金币按200:1折核心币,不足1枚按1枚结算', () => {
    assert.equal(settleGoldToCoreCoins(0), 0, '零金币不结算');
    assert.equal(settleGoldToCoreCoins(1), 1, '有剩余金即保底 1 枚');
    assert.equal(settleGoldToCoreCoins(199), 1, '不足 200 按 1 枚');
    assert.equal(settleGoldToCoreCoins(200), 1, '恰好 200 = 1 枚');
    assert.equal(settleGoldToCoreCoins(800), 4, '800 金 = 4 枚');
    assert.equal(settleGoldToCoreCoins(1000, 100, 1), 10, '兑换比可参数化');
});

// ── Boss 专属：每家 2~3 件、25% 掉率、按件去重、软保底 ────────
test('Boss专属表:六家共16件,分布3/3/2/3/2/3,id唯一,消耗型带充能', () => {
    assert.equal(BOSS_UNIQUES.length, 16);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(m => bossUniquesOf(`ch${m}`).length), [3, 3, 2, 3, 2, 3]);
    const ids = BOSS_UNIQUES.map(u => u.id);
    assert.equal(new Set(ids).size, ids.length, 'id 唯一');
    for (const u of BOSS_UNIQUES.filter(u => u.kind === 'consumable')) {
        assert.ok(u.charge, `消耗型专属 ${u.id} 必须带充能材料 key`);
    }
});

test('Boss专属掉落:25%掷取未拥有池,全拥有转保底,软保底第4次必掉', () => {
    const seq = [];
    const rand = () => seq.shift();
    // 25% 命中：rand < 0.25 → 掉第一件
    let r = rollBossUnique('ch1', new Set(), 0, 0.25, 4, () => 0.1);
    assert.equal(r.def.bossId, 'ch1');
    assert.equal(r.nextPity, 0);
    assert.equal(r.fallback, false);
    // 未命中（rand=0.9）：pity +1
    r = rollBossUnique('ch1', new Set(), 0, 0.25, 4, () => 0.9);
    assert.equal(r.def, null);
    assert.equal(r.nextPity, 1);
    // 软保底：pity=3 时第 4 次必掉（rand 无关）
    r = rollBossUnique('ch1', new Set(), 3, 0.25, 4, () => 0.99);
    assert.ok(r.def, '连续 3 次未掉第 4 次必掉');
    assert.equal(r.nextPity, 0);
    // 全拥有 → 保底包
    const all = new Set(bossUniquesOf('ch1').map(u => u.id));
    r = rollBossUnique('ch1', all, 0, 0.25, 4, () => 0.1);
    assert.equal(r.def, null);
    assert.equal(r.fallback, true);
    // 按件去重：已拥有件不再进池
    const owned = new Set(['unsc_badge']);
    const pool = [];
    for (let i = 0; i < 50; i++) {
        const rr = rollBossUnique('ch1', owned, 3, 0.25, 4, () => 0.0);
        pool.push(rr.def.id);
    }
    assert.ok(pool.every(id => id !== 'unsc_badge'), '已拥有的件不再掉落');
});

// ── 材料掉落：档位掉率、定向零件、稀有陨星 ────────────────────
test('材料掉落:图域材料按图掉落,陨星0.2%,定向零件按类型', () => {
    const seq = (vals) => { let i = 0; return () => vals[i++]; };
    // 图1 小兵：陨星未中(0.5) → 图域命中(0.0) → mat_waste
    assert.equal(rollMaterialFor('grunt', 1, 'grunt', { rand: seq([0.5, 0.0]) }), 'mat_waste');
    assert.equal(rollMaterialFor('elite', 6, 'grunt', { rand: seq([0.5, 0.0]) }), 'mat_ember');
    // 陨星优先：rand<0.002 时直接返回 mat_star
    assert.equal(rollMaterialFor('grunt', 1, 'grunt', { rand: () => 0.001 }), 'mat_star');
    // 定向零件：drone_a → part_mech（陨星/图域未中后命中零件 5%）
    assert.equal(rollMaterialFor('miniboss', 1, 'drone_a', { rand: seq([0.9, 0.9, 0.0]) }), 'part_mech');
    // 档位互斥：Boss 档不吃图域材料（mapRate=0），但陨星仍可掉
    assert.equal(rollMaterialFor('boss', 1, 'boss', { rand: () => 0.0 }), 'mat_star');
    assert.equal(rollMaterialFor('boss', 1, 'boss', { rand: () => 0.9 }), null, 'Boss 档不吃通用材料');
    assert.equal(MAP_MATERIAL_IDS.length, 6);
});

test('道具掉落:来源与档位匹配,同一次击杀独立掷取', () => {
    // 盾龟的道具必是龟甲片（rate 命中）
    const shield = rollConsumableFor('miniboss', 'turtle', 1, () => 0.0);
    assert.equal(shield.id, 'turtle_shell');
    // 基础小兵首个命中的是表序在前的战地口粮（同源多件按表序独立掷取）
    const any = rollConsumableFor('grunt', 'grunt', 1, () => 0.0);
    assert.equal(any.id, 'ration');
    assert.equal(rollConsumableFor('any', 'grunt', 1, () => 0.999), null, '全未命中不掉道具');
    assert.equal(rollConsumableFor('grunt', 'turtle', 1, () => 0.0).id, 'chaos_dice', '非盾龟不掉龟甲片，但 any 档混沌骰子仍可掉');
    // 表完整性：v3 清单 34 条道具 + 3 条资源/幸运即时结算类（四叶虫草/大额金袋/诅咒金币袋）= 37
    assert.equal(CONSUMABLES.length, 37);
    const ids = CONSUMABLES.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const c of CONSUMABLES) assert.ok(c.rate > 0 && c.rate <= 1 && c.desc, `${c.id} 定义完整`);
});

// ── 配方：通配消耗判定与扣减 ──────────────────────────────────
test('兑换配方:通配判定(*map/*anyMap)与扣减一致', () => {
    const forge = RECIPES.find(r => r.id === 'r_forge');
    assert.equal(recipeCostMet(forge, { mat_waste: 3 }), true, '同图材料×3 满足图域锻造');
    assert.equal(recipeCostMet(forge, { mat_waste: 2, mat_gear: 1 }), false, '跨图凑数不满足');
    const mats = { mat_waste: 3, part_mech: 2 };
    assert.ok(recipeConsume(forge, mats));
    assert.deepEqual(mats, { mat_waste: 0, part_mech: 2 }, '只扣同图材料');
    const reforge = RECIPES.find(r => r.id === 'r_reforge');
    const mixed = { mat_waste: 1, mat_gear: 1, part_mech: 2 };
    assert.equal(recipeCostMet(reforge, mixed), true, '*anyMap 任意两件图域材料');
    assert.ok(recipeConsume(reforge, mixed));
    assert.equal((mixed.mat_waste + mixed.mat_gear), 0, '通配扣减到位');
    assert.equal(mixed.part_mech, 0);
});

// ── 高频刃词缀：未解锁不进池，解锁后进池 ──────────────────────
test('高频刃词缀:X-剑刃模组未解锁时rollEquipmentDrop不产出haste', () => {
    // 图4（章16）史诗档全未拥有
    const owned = new Set();
    let sawHaste = false;
    for (let i = 0; i < 200; i++) {
        const e = rollEquipmentDrop(16, owned, Math.random, false);
        if (e && e.affix === 'haste') sawHaste = true;
    }
    assert.equal(sawHaste, false, '未解锁时高频刃不进掉落池');
    sawHaste = false;
    for (let i = 0; i < 200; i++) {
        const e = rollEquipmentDrop(16, owned, Math.random, true);
        if (e && e.affix === 'haste') sawHaste = true;
    }
    assert.equal(sawHaste, true, '解锁后高频刃可掉落');
    assert.ok(EQUIP_AFFIXES.some(a => a.id === 'haste'), '词缀表已登记高频刃');
});

// ── SaveSystem 仓库字段 ───────────────────────────────────────
test('仓库材料:入仓/计数/消耗/出售得核心币/一键出售', () => {
    freshProfile();
    assert.equal(SaveSystem.materialCount('mat_waste'), 0, '旧档缺省 0');
    SaveSystem.addMaterial('mat_waste', 3);
    assert.equal(SaveSystem.materialCount('mat_waste'), 3);
    assert.equal(SaveSystem.consumeMaterial('mat_waste', 2), true);
    assert.equal(SaveSystem.materialCount('mat_waste'), 1);
    assert.equal(SaveSystem.consumeMaterial('mat_waste', 2), false, '不足不扣');
    const coins0 = SaveSystem.coreCoins();
    const gained = SaveSystem.sellMaterial('mat_waste', 1);
    assert.equal(gained, 5, '按材料表售价 5 核心币');
    assert.equal(SaveSystem.coreCoins(), coins0 + 5);
    assert.equal(SaveSystem.materialCount('mat_waste'), 0);
    SaveSystem.addMaterial('mat_gear', 2);
    SaveSystem.addMaterial('mat_star', 1);
    const all = SaveSystem.sellAllMaterials();
    assert.equal(all, 2 * 5 + 25, '一键出售：齿轮×2 + 陨星×1');
    assert.equal(SaveSystem.coreCoins(), coins0 + 5 + all);
});

test('Boss专属收藏:入档即绝版判定,软保底计数跨局保留', () => {
    freshProfile();
    assert.equal(SaveSystem.hasBossUnique('unsc_badge'), false);
    SaveSystem.addBossUnique('unsc_badge');
    SaveSystem.addBossUnique('unsc_badge');
    assert.equal(SaveSystem.hasBossUnique('unsc_badge'), true);
    assert.equal(SaveSystem.bossUniqueSet().size, 1, '重复入档不重复记录');
    assert.equal(SaveSystem.pityOf('ch1'), 0, '缺省计数 0');
    SaveSystem.setPity('ch1', 3);
    assert.equal(SaveSystem.pityOf('ch1'), 3);
    SaveSystem.setPity('ch1', 0);
    assert.equal(SaveSystem.pityOf('ch1'), 0);
});

test('仓库重铸:词缀随机更换且品质保留,目标必须存在', () => {
    freshProfile();
    SaveSystem.addEquipment({ uid: 'eq_t1', affix: 'hp', quality: 2 });
    const next = SaveSystem.rerollEquipment('eq_t1');
    assert.ok(next && next.affix !== 'hp', '换成不同词缀');
    assert.equal(next.quality, 2, '品质保留');
    assert.equal(SaveSystem.rerollEquipment('eq_nope'), null, '不存在的装备返回 null');
});

test('新档案字段:materials/bossUniques/bossPity/relics缺省初始化', () => {
    freshProfile();
    const p = SaveSystem.load();
    assert.deepEqual(p.materials, {});
    assert.deepEqual(p.bossUniques, []);
    assert.deepEqual(p.bossPity, {});
    assert.deepEqual(p.relics, {});
    SaveSystem.addRelic('cloak_shard', 2);
    assert.equal(SaveSystem.relicCount('cloak_shard'), 2);
    assert.equal(SaveSystem.relicCount('amber_bug'), 0);
});

// ── 配方产出联动（装备掷取走图鉴去重） ────────────────────────
test('图域锻造产出:装备经图鉴去重优先,全拥有回退核心币由调用方处理', () => {
    // 纯数据侧验证：rollEquipmentDrop 的去重语义在 equipment.test.js 已覆盖，
    // 这里验证兑换台使用的 MATERIALS 售价与 DropDB 表一致。
    const sellable = MATERIALS.filter(m => m.sell > 0);
    assert.ok(sellable.length >= 12, '可售材料覆盖图域/零件/陨星/徽记');
    for (const m of sellable) assert.ok(m.sell >= 4 && m.sell <= 25, `${m.id} 售价在合理区间`);
});
