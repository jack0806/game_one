'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BOSS_UNIQUES, MATERIALS, CONSUMABLES, RECIPES } = require('../dist/data/DropDB');
const { EQUIP_AFFIXES } = require('../dist/data/EquipmentDB');
const { DROP_VISUALS, DROP_ART_KEYS, DROP_VISUAL_ALIASES, DEPOT_TILE_DROP_IDS, dropVisual, recipeVisualId } = require('../dist/data/DropVisualDB');
const { EQUIPMENT_TILES } = require('../dist/data/DepotCatalog');
const art = path.resolve(__dirname, '../../assets/resources/art');

test('波间商店全部真实商品均有独立外观，名称与商品数据一致', () => {
    const { Economy } = require('../dist/systems/Economy');
    const items = new Economy().generateShopItems(1);
    for (const item of items) {
        const visual = dropVisual(`shop_${item.id}`);
        assert.ok(visual, item.id);
        assert.equal(visual.name, item.name);
        assert.ok(visual.desc.indexOf(item.desc) >= 0, item.id);
    }
});

test('掉落外观覆盖全部正式材料、道具、首领专属与装备词缀，物品身份不重用原画', () => {
    const expected = [...MATERIALS, ...CONSUMABLES, ...BOSS_UNIQUES].map(d => d.id)
        .concat(EQUIP_AFFIXES.map(e => `equip_${e.id}`), ['gold', 'core_coin', 'joker_doll', 'core_element', 'core_stealth',
            'supply_box', 'supply_gold', 'supply_draws', 'supply_shield',
            'shop_heal', 'shop_maxhp', 'shop_shield', 'shop_speed', 'shop_damage', 'shop_augment']);
    assert.deepEqual(new Set(DROP_VISUALS.map(v => v.id)), new Set(expected));
    assert.equal(DROP_VISUALS.length, expected.length);
    assert.equal(new Set(DROP_ART_KEYS).size, expected.length);
    for (const def of [...MATERIALS, ...CONSUMABLES, ...BOSS_UNIQUES]) {
        assert.equal(dropVisual(def.id).name, def.name);
        assert.equal(dropVisual(def.id).desc, def.desc);
    }
});

test('世界掉落前缀及入仓充能保持同一物品身份，未知类型不借用其他物品', () => {
    for (const m of MATERIALS) assert.equal(dropVisual(`mat:${m.id}`), dropVisual(m.id));
    for (const c of CONSUMABLES) assert.equal(dropVisual(`use:${c.id}`), dropVisual(c.id));
    assert.equal(dropVisual('relic:amber_bug'), dropVisual('amber_bug'));
    for (const [alias, id] of Object.entries(DROP_VISUAL_ALIASES)) assert.equal(dropVisual(alias), dropVisual(id));
    assert.equal(dropVisual('use:unknown_item'), undefined);
    for (const r of RECIPES) assert.ok(dropVisual(recipeVisualId(r.id)), r.id);
});

test('六种装备在槽位、卡片和详情使用各自原画，高频刃显示攻速', () => {
    for (const affix of EQUIP_AFFIXES) assert.equal(DEPOT_TILE_DROP_IDS[EQUIPMENT_TILES[affix.id]], `equip_${affix.id}`);
    assert.notEqual(EQUIPMENT_TILES.haste, EQUIPMENT_TILES.dmg);
    const { depotEquipmentStat } = require('../dist/data/DepotCatalog');
    assert.equal(depotEquipmentStat({ affix: 'haste', quality: 2 }), '攻速 +8%');
});

test('全部掉落原画为独立RGBA文件，元数据与实际画布一致并保留完整透明边距', () => {
    for (const key of DROP_ART_KEYS) {
        const png = fs.readFileSync(path.join(art, `${key}.png`));
        assert.equal(png.subarray(1, 4).toString(), 'PNG', key);
        assert.equal(png[25], 6, `${key} 必须有RGBA透明通道`);
        const meta = JSON.parse(fs.readFileSync(path.join(art, `${key}.png.meta`), 'utf8'));
        const frame = meta.subMetas.f9941.userData;
        assert.equal(frame.rawWidth, png.readUInt32BE(16), key);
        assert.equal(frame.rawHeight, png.readUInt32BE(20), key);
        assert.equal(frame.trimType, 'none', key);
        assert.equal(frame.width, frame.rawWidth, key);
        assert.equal(frame.height, frame.rawHeight, key);
    }
});
