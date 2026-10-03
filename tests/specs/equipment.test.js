'use strict';
// v4 装备体系（跨局掉落物）测试：品质分章 / 防刷去重 / 卖出价 / 属性注入
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    EQUIP_AFFIXES, rollEquipmentDrop, equipmentSellValue, equipmentLabel,
    equipmentKey, applyEquipmentToStats, qualityCapForChapter, EQUIP_QUALITY_LABEL,
} = require('../dist/data/EquipmentDB');

test('品质上限按章:1章普通/2~3稀有/4~6史诗', () => {
    assert.equal(qualityCapForChapter(1), 0);
    assert.equal(qualityCapForChapter(2), 1);
    assert.equal(qualityCapForChapter(3), 1);
    assert.equal(qualityCapForChapter(4), 2);
    assert.equal(qualityCapForChapter(6), 2);
});

test('Boss掉落掷取:品质不超章节上限,未拥有组合优先,全拥有后返回null', () => {
    // 第 1 章：只掉普通品质
    for (let i = 0; i < 30; i++) {
        const e = rollEquipmentDrop(1, new Set(), () => i / 30);
        assert.ok(e, '空仓库必有掉落');
        assert.equal(e.quality, 0, '第1章只掉普通');
        assert.ok(EQUIP_AFFIXES.some(a => a.id === e.affix));
        assert.ok(e.uid.length > 0, '掉落自带唯一 uid');
    }
    // 第 5 章：可掉史诗
    const epic = rollEquipmentDrop(5, new Set(), () => 0.99);
    assert.equal(epic.quality, 2, '高随机位应命中史诗档');
    // 去重：全部组合已拥有 → null（调用方改掉核心币包）
    const all = new Set();
    for (const a of EQUIP_AFFIXES) for (let q = 0; q <= 1; q++) all.add(`${a.id}:${q}`);
    assert.equal(rollEquipmentDrop(2, all), null, '第2章档位全拥有后不再掉装备');
    // 部分拥有：只从未拥有组合里出
    const e2 = rollEquipmentDrop(1, new Set(['hp:0', 'dmg:0']), () => 0);
    assert.ok(!['hp', 'dmg'].includes(e2.affix) || e2.quality > 0, '已拥有的组合不重复掉');
});

test('卖出价与显示名:普通80/稀有200/史诗450', () => {
    assert.deepEqual([0, 1, 2].map(equipmentSellValue), [80, 200, 450]);
    assert.equal(equipmentLabel({ uid: 'x', affix: 'hp', quality: 2 }), '史诗·强化装甲');
    assert.equal(equipmentKey({ uid: 'x', affix: 'hp', quality: 2 }), 'hp:2');
    assert.equal(EQUIP_QUALITY_LABEL.length, 3);
});

test('属性注入:百分比乘算/数值直加,多件叠加', () => {
    const stats = { maxHp: 100, damage: 20, speed: 300, critRate: 0.05, goldPickupRange: 60 };
    applyEquipmentToStats({ uid: 'a', affix: 'hp', quality: 2 }, stats);      // +12% → 112
    assert.equal(stats.maxHp, 112);
    applyEquipmentToStats({ uid: 'b', affix: 'dmg', quality: 1 }, stats);     // +6% → 21.2
    assert.ok(Math.abs(stats.damage - 21.2) < 1e-9);
    applyEquipmentToStats({ uid: 'c', affix: 'crit', quality: 0 }, stats);    // +0.02
    assert.ok(Math.abs(stats.critRate - 0.07) < 1e-9);
    applyEquipmentToStats({ uid: 'd', affix: 'greed', quality: 1 }, stats);   // +30
    assert.equal(stats.goldPickupRange, 90);
    // 同词缀两件叠加（乘算链）
    const s2 = { maxHp: 100 };
    applyEquipmentToStats({ uid: 'e', affix: 'hp', quality: 0 }, s2);  // ×1.04
    applyEquipmentToStats({ uid: 'f', affix: 'hp', quality: 0 }, s2);  // ×1.04
    assert.equal(s2.maxHp, Math.round(100 * 1.04 * 1.04));
});
