'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEPOT_PRODUCTS, DEPOT_ART_KEYS, EQUIPMENT_TILES, depotBoxAvailable,
    depotEquipmentStat, depotInventory } = require('../dist/data/DepotCatalog');
const { EQUIP_AFFIXES } = require('../dist/data/EquipmentDB');

test('装备详情百分比正确换算，暴击不显示小数百分比，拾取范围保留数值', () => {
    assert.equal(depotEquipmentStat({ affix: 'crit', quality: 2 }), '暴击率 +6%');
    assert.equal(depotEquipmentStat({ affix: 'hp', quality: 2 }), '生命 +12%');
    assert.equal(depotEquipmentStat({ affix: 'dmg', quality: 2 }), '伤害 +10%');
    assert.equal(depotEquipmentStat({ affix: 'spd', quality: 1 }), '移速 +6%');
    assert.equal(depotEquipmentStat({ affix: 'greed', quality: 1 }), '拾取范围 +30');
});

test('仓库筛选和分页使用稳定排序，保留所有15件且不修改存档顺序', () => {
    const items = EQUIP_AFFIXES.flatMap(a => [0, 1, 2].map(q => ({ uid: `${a.id}${q}`, affix: a.id, quality: q })));
    const original = items.map(e => e.uid);
    const sorted = depotInventory(items);
    assert.equal(sorted.length, 15);
    assert.equal(new Set([...sorted.slice(0, 10), ...sorted.slice(10)].map(e => e.uid)).size, 15);
    assert.equal(sorted[0].affix, 'dmg');
    assert.ok(sorted.slice(0, 5).every(e => e.quality === 2));
    assert.equal(depotInventory(items, 1).length, 5);
    assert.ok(depotInventory(items, 1).every(e => e.quality === 1));
    assert.deepEqual(items.map(e => e.uid), original);
    assert.deepEqual(depotInventory([], 2), []);
});

test('商店验货按解锁品质计算，低品质集齐不阻止新解锁品质的购买', () => {
    const items = EQUIP_AFFIXES.map(a => ({ uid: a.id, affix: a.id, quality: 0 }));
    assert.equal(depotBoxAvailable([], 1), true);
    assert.equal(depotBoxAvailable(items, 1), false);
    assert.equal(depotBoxAvailable(items, 6), true);
    const full = EQUIP_AFFIXES.flatMap(a => [0, 1, 2].map(q => ({ uid: `${a.id}${q}`, affix: a.id, quality: q })));
    assert.equal(depotBoxAvailable(full, 30), false);
    assert.equal(depotBoxAvailable(full.filter(e => e.uid !== 'crit2'), 30), true);
});

test('四类商品价格与九宫格图集各占独立单元，新资源元数据保留完整画布', () => {
    assert.deepEqual(DEPOT_PRODUCTS.map(p => [p.id, p.price]), [['box', 60], ['gold', 25], ['draws', 40], ['shield', 30]]);
    assert.deepEqual(Object.values(EQUIPMENT_TILES).sort(), [0, 1, 2, 3, 4]);
    assert.deepEqual(DEPOT_PRODUCTS.map(p => p.tile), [5, 6, 7, 8]);
    const art = path.resolve(__dirname, '../../assets/resources/art');
    for (const key of DEPOT_ART_KEYS) {
        const png = fs.readFileSync(path.join(art, `${key}.png`));
        const meta = JSON.parse(fs.readFileSync(path.join(art, `${key}.png.meta`), 'utf8'));
        const frame = meta.subMetas.f9941.userData;
        assert.equal(frame.rawWidth, png.readUInt32BE(16));
        assert.equal(frame.rawHeight, png.readUInt32BE(20));
        assert.equal(frame.trimType, 'none');
        assert.equal(frame.packable, false);
        if (key === 'ui_depot_items') {
            assert.equal(frame.rawWidth % 3, 0);
            assert.equal(frame.rawHeight % 3, 0);
            assert.equal(png[25], 6, '图集必须有RGBA透明通道');
        }
    }
});
