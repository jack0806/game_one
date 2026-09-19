'use strict';
// 海克斯数据库完整性：19 个海克斯、三档数值、稀有度定价区间与图标资产
const test = require('node:test');
const assert = require('node:assert/strict');
const { AUGMENT_DB } = require('../dist/data/AugmentDB');

// 现有 ui_icon_* 资源集合（新增图标必须先落盘，artmanifest 测试会校验文件存在）
const KNOWN_ICONS = new Set([
    'pierce', 'lightning', 'explosion', 'fire', 'poison', 'crit', 'speed',
    'lifesteal', 'bounce', 'heart', 'shield', 'combo', 'gold', 'summon', 'ice', 'chaos',
]);

test('海克斯总数为23个，编号1~23且id唯一', () => {
    assert.equal(AUGMENT_DB.length, 23);
    const ids = AUGMENT_DB.map(a => a.id);
    assert.equal(new Set(ids).size, 23, 'id 必须唯一');
    const indexes = AUGMENT_DB.map(a => a.index).sort((a, b) => a - b);
    assert.deepEqual(indexes, Array.from({ length: 23 }, (_, i) => i + 1));
});

test('分档定价：Lv.1银15-50 / Lv.2金100-250 / Lv.3彩500-1000，单档海克斯用自身稀有度区间', () => {
    const band = { silver: [15, 50], gold: [100, 250], prismatic: [500, 1000] };
    const inBand = (v, r) => v >= band[r][0] && v <= band[r][1];
    for (const a of AUGMENT_DB) {
        assert.ok(Array.isArray(a.prices) && a.prices.length >= 1, `${a.id} 缺少 prices`);
        if (a.prices.length === 1) {
            // 单档海克斯：进阶蓝图（彩500）/ 应急壁垒（银35）
            assert.ok(inBand(a.prices[0], a.rarity), `${a.id} 单档价 ${a.prices[0]} 超出 ${a.rarity} 区间`);
            continue;
        }
        assert.ok(inBand(a.prices[0], 'silver'), `${a.id} 银档价 ${a.prices[0]} 超出 15-50`);
        if (a.prices.length >= 2) assert.ok(inBand(a.prices[1], 'gold'), `${a.id} 金档价 ${a.prices[1]} 超出 100-250`);
        if (a.prices.length >= 3) assert.ok(inBand(a.prices[2], 'prismatic'), `${a.id} 彩档价 ${a.prices[2]} 超出 500-1000`);
    }
});

test('等级即稀有度：多档海克斯 Lv.1/2/3 对应 银/金/彩', () => {
    const { rarityForLevel } = require('../dist/data/AugmentDB');
    const multi = AUGMENT_DB.find(a => a.id === 'hex01');
    assert.equal(rarityForLevel(multi, 1), 'silver');
    assert.equal(rarityForLevel(multi, 2), 'gold');
    assert.equal(rarityForLevel(multi, 3), 'prismatic');
    // 单档：进阶蓝图固定彩、应急壁垒固定银
    assert.equal(rarityForLevel(AUGMENT_DB.find(a => a.id === 'hex15'), 1), 'prismatic');
    assert.equal(rarityForLevel(AUGMENT_DB.find(a => a.id === 'hex18'), 1), 'silver');
});

test('三档数值同步：除单档海克斯(15/18/19)外每个海克斯都有3档数值与三档文案', () => {
    for (const a of AUGMENT_DB) {
        if (a.id === 'hex15' || a.id === 'hex18' || a.id === 'hex19') continue;
        assert.equal(a.values.length, 3, `${a.id} 应有 Lv1/2/3 三档数值`);
        for (let lvl = 1; lvl <= 3; lvl++) {
            assert.equal(typeof a.descAt(lvl), 'string', `${a.id} Lv${lvl} 缺少文案`);
        }
    }
});

test('元素暴击为单档彩色海克斯，四元素海克斯齐备才解锁（hex19~23）', () => {
    const crit = AUGMENT_DB.find(a => a.id === 'hex19');
    assert.equal(crit.prices.length, 1, '元素暴击只有一档（彩色）');
    assert.equal(crit.rarity, 'prismatic');
    assert.equal(crit.prices[0], 900);
    // 四元素：风20/火21/土22/水23，三档可升，图标用现有素材
    const names = { hex20: '风元素', hex21: '火元素', hex22: '土元素', hex23: '水元素' };
    for (const [id, name] of Object.entries(names)) {
        const def = AUGMENT_DB.find(a => a.id === id);
        assert.ok(def, `${id} 应存在`);
        assert.equal(def.name, name);
        assert.equal(def.category, '技能');
        assert.equal(def.prices.length, 3);
        assert.ok(KNOWN_ICONS.has(def.icon), `${id} 图标 ${def.icon} 必须在现有素材集合`);
    }
});

test('一次性海克斯只有15/17，装备后不占格子', () => {
    const oneShots = AUGMENT_DB.filter(a => a.oneShot).map(a => a.id).sort();
    assert.deepEqual(oneShots, ['hex15', 'hex17']);
});

test('图标全部使用现有素材键（不引入不存在的 ui_icon_*）', () => {
    for (const a of AUGMENT_DB) {
        assert.ok(KNOWN_ICONS.has(a.icon), `${a.id} 使用了未知图标 ${a.icon}`);
    }
});

test('文档数值抽查：攻速/攻击/血量/暴击/射程档位与《海克斯.docx》一致', () => {
    const byIndex = (i) => AUGMENT_DB.find(a => a.index === i);
    assert.deepEqual(byIndex(1).values, [0.10, 0.20, 0.30]);  // 海克斯1 攻速
    assert.deepEqual(byIndex(2).values, [0.05, 0.10, 0.15]);  // 海克斯2 攻击
    assert.deepEqual(byIndex(3).values, [0.10, 0.15, 0.30]);  // 海克斯3 血量
    assert.deepEqual(byIndex(7).values, [0.05, 0.10, 0.20]);  // 海克斯7 暴击
    assert.deepEqual(byIndex(11).values, [20, 30, 50]);       // 海克斯11 射程
    assert.deepEqual(byIndex(4).values, [1, 2, 5]);           // 海克斯4 范围伤害个数
    assert.deepEqual(byIndex(17).values, [500, 1000, 2000]);  // 海克斯17 立得金币
    assert.deepEqual(byIndex(16).values, [0.5, 1, 1.5]);      // 海克斯16 金币倍率
});
