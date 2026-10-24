'use strict';
// ============================================================
//  lobbyshop.test.js — 存档大厅军需商店（原任务树位）：核心币购买与补给消费
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const cc = require('cc');
const { SaveSystem } = require('../dist/systems/SaveSystem');
const { rollEquipmentDrop, equipmentKey } = require('../dist/data/EquipmentDB');

function fresh() {
    cc.sys.localStorage._clear();
    SaveSystem.resetCache();
    SaveSystem.selectSlot(0);
}

test('spendCoreCoins:余额足够扣款,不足拒付不动余额', () => {
    fresh();
    SaveSystem.addCoreCoins(100);
    assert.equal(SaveSystem.spendCoreCoins(60), true, '100 币买 60 币商品成功');
    assert.equal(SaveSystem.coreCoins(), 40, '扣款后余额 40');
    assert.equal(SaveSystem.spendCoreCoins(50), false, '40 币买 50 币商品拒付');
    assert.equal(SaveSystem.coreCoins(), 40, '拒付不动余额');
});

test('商店补给:可重复购买叠加,consumeShopSupply 开局一次性消费并清零', () => {
    fresh();
    SaveSystem.addShopSupply(150, 0, 0);
    SaveSystem.addShopSupply(150, 0, 0);   // 买两次金库 → +300
    SaveSystem.addShopSupply(0, 3, 0);
    SaveSystem.addShopSupply(0, 0, 60);
    assert.deepEqual(SaveSystem.shopSupply(), { gold: 300, draws: 3, shield: 60 },
        '三路补给按购买次数叠加');
    const got = SaveSystem.consumeShopSupply();
    assert.deepEqual(got, { gold: 300, draws: 3, shield: 60 }, '开局取回全部补给');
    assert.deepEqual(SaveSystem.shopSupply(), { gold: 0, draws: 0, shield: 0 },
        '消费后清零——只对购买后的下一局生效');
    // 未购买时消费返回零值且不写档
    assert.deepEqual(SaveSystem.consumeShopSupply(), { gold: 0, draws: 0, shield: 0 });
});

test('装备箱:按解锁进度掉未拥有装备并入仓,集齐后无可掉落', () => {
    fresh();
    const owned = new Set();
    const equip = rollEquipmentDrop(SaveSystem.unlockedChapterCount(), owned);
    assert.ok(equip, '空仓库必有可掉落装备');
    SaveSystem.addEquipment(equip);
    const p = SaveSystem.load();
    assert.equal(p.equipments.length, 1, '装备箱开出后入仓');
    assert.equal(p.equipLoadout[0], equip.uid, '入仓自动填入出战格');

    // 仓库集齐（章 1 品质上限=普通档，5 词缀 × 1 档 = 5 件）→ 商店箱无货可发
    const full = new Set();
    let roll = rollEquipmentDrop(1, full);
    while (roll) { full.add(equipmentKey(roll)); roll = rollEquipmentDrop(1, full); }
    assert.equal(full.size, 5, '章 1 可掉落组合共 5 件');
    assert.equal(rollEquipmentDrop(1, full), null, '全部组合集齐后返回 null（商店提示仓库已集齐）');
});

test('旧档兼容:缺省补给字段的旧档案读作零,购买后正常写入', () => {
    fresh();
    // 手工写入一份没有 shop* 字段的旧档（模拟 v5 之前的存档）
    const p = SaveSystem.load();
    delete p.shopStartGold; delete p.shopStartDraws; delete p.shopStartShield;
    cc.sys.localStorage.setItem('hexblast_slot_v1_1', JSON.stringify(p));
    SaveSystem.resetCache();
    assert.deepEqual(SaveSystem.shopSupply(), { gold: 0, draws: 0, shield: 0 },
        '旧档补给字段缺省读作零');
    SaveSystem.addShopSupply(150, 3, 60);
    assert.deepEqual(SaveSystem.shopSupply(), { gold: 150, draws: 3, shield: 60 },
        '旧档购买补给正常写入');
});
