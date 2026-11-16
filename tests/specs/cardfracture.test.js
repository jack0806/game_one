'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cc = require('cc');
const { createDiamondFlow, diamondFlowPoint, sampleFlowDiamond, diamondFacetColors,
    CARD_BREAK_TIME, CARD_FX_LIFE } = require('../dist/core/CardFracture');

test('星钻流光生成24颗独立碎钻，均匀分配三条轨道并限制卡面内的初始位置', () => {
    for (let round = 0; round < 30; round++) {
        const diamonds = createDiamondFlow(272, 360);
        assert.equal(diamonds.length, 24);
        for (let track = 0; track < 3; track++) assert.equal(diamonds.filter(d => d.track === track).length, 8);
        for (const d of diamonds) {
            assert.ok(Math.abs(d.originX) <= 272 * 0.4);
            assert.ok(d.originY >= -360 * 0.37 && d.originY <= 360 * 0.42);
            assert.ok(d.size >= 4.5 && d.size <= 15);
            assert.ok(d.life + d.delay + CARD_BREAK_TIME < CARD_FX_LIFE);
        }
    }
});

test('碎钻蓄亮后卷入弧线，切面独立闪烁并在总寿命内淡尽，采样不依赖帧率', () => {
    for (const d of createDiamondFlow(272, 360)) {
        const before = sampleFlowDiamond(d, CARD_BREAK_TIME - 0.001, 272, 360);
        assert.equal(before.visible, false);
        assert.equal(before.x, d.originX);
        assert.equal(before.y, d.originY);
        const start = CARD_BREAK_TIME + d.delay;
        const released = sampleFlowDiamond(d, start + 0.1, 272, 360);
        assert.equal(released.visible, true);
        assert.equal(released.opacity, 1);
        const time = start + 0.4;
        const state = sampleFlowDiamond(d, time, 272, 360);
        const direction = d.track === 1 ? -1 : 1;
        const orbit = diamondFlowPoint(d.track, d.angle + direction * 0.4 * (2.2 + d.track * 0.28), 272, 360);
        assert.ok(Math.abs(state.x - orbit.x) < 0.0001);
        assert.ok(Math.abs(state.y - orbit.y - 0.4 / d.life * 12) < 0.0001);
        assert.deepEqual(sampleFlowDiamond(d, time, 272, 360), state);
        assert.ok(state.glint >= 0 && state.glint <= 1);
        assert.ok(state.squash >= 0.65 && state.squash <= 1);
        const fading = sampleFlowDiamond(d, start + d.life * 0.85, 272, 360);
        assert.ok(fading.opacity > 0 && fading.opacity < released.opacity);
        const end = sampleFlowDiamond(d, CARD_FX_LIFE, 272, 360);
        assert.equal(end.visible, false);
        assert.equal(end.opacity, 0);
    }
});

test('银钻为银白切面，金钻为整体金黄切面，彩钻包含粉紫青色折射', () => {
    const silver = diamondFacetColors('silver');
    const gold = diamondFacetColors('gold');
    const prism = diamondFacetColors('prismatic');
    for (const colors of [silver, gold, prism]) {
        assert.equal(colors.length, 6);
        for (const face of colors) for (const channel of face) assert.ok(channel >= 0 && channel <= 255);
    }
    for (const [r, g, b] of silver) assert.ok(b >= g && g >= r);
    for (const [r, g, b] of gold) assert.ok(r >= g && g > b);
    assert.ok(prism.some(([r, g, b]) => r > g && b > g));
    assert.ok(prism.some(([r, g, b]) => g > r && b > r));
});

// 与渲染分离验证成交状态、刷新和关闭，不用 cc 桩模拟 GPU 模板缓冲。
function makeShop(buyResult = true) {
    const created = [];
    class FakeFx {
        constructor() { this.destroyed = false; created.push(this); }
        update() { return false; }
        destroy() { this.destroyed = true; }
    }
    const mocks = {
        cc,
        './AugmentCardFx': { AugmentCardFx: FakeFx },
        '../core/Constants': require('../dist/core/Constants'),
        '../core/LabelUtils': {}, '../core/DepotStyle': {}, '../core/SpriteUtils': {},
        '../core/UIStyle': { keyboardFocusTarget: () => ({ setFocused() {} }), UI_PALETTE: { text: {} } },
        '../core/ScreenFit': {},
    };
    const source = fs.readFileSync(path.join(__dirname, '../../assets/scripts/ui/AugSelectUI.ts'), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, experimentalDecorators: true,
    } }).outputText;
    const sandbox = { exports: {}, console, require: id => {
        assert.ok(id in mocks, `未声明的测试依赖 ${id}`); return mocks[id];
    } };
    vm.runInNewContext(output, sandbox);
    const ui = new sandbox.exports.AugSelectUI();
    ui.node = { active: true };
    ui._options = ['a', 'b', 'c'].map(id => ({ id, rarity: 'gold', _price: 20 }));
    const label = () => ({ node: {} });
    ui._cards = ui._options.map(() => ({ root: { active: true }, receipt: { active: false },
        rarityLabel: label(), tierLabel: label(), nameLabel: label(), iconSprite: label(),
        descLabel: label(), priceLabel: label() }));
    ui._shatterRoot = { children: [] };
    ui._goldLbl = {}; ui._refreshLbl = {}; ui._refreshSkin = { setDisabled() {} }; ui._oddsLbl = {};
    ui._refreshChips = () => {}; ui._paintCard = () => {};
    let purchases = 0;
    ui._ctx = { gold: () => 100, odds: () => undefined, refreshCost: () => 5,
        owned: () => [], pinnedIds: () => [], refresh: () => ui._options,
        buy: () => { purchases++; return buyResult; } };
    return { ui, created, purchases: () => purchases };
}

test('成交即隐藏原卡并显示回执，连点不重复购买，多张卡的特效独立播放', () => {
    const { ui, created, purchases } = makeShop();
    ui._pinned.add('a');
    ui._buy(0); ui._buy(0); ui._buy(1);
    assert.equal(purchases(), 2);
    assert.equal(created.length, 2);
    assert.equal(ui._cards[0].root.active, false);
    assert.equal(ui._cards[0].receipt.active, true);
    assert.equal(ui._cards[2].root.active, true);
    assert.equal(ui._cards[2].receipt.active, false);
    assert.equal(ui._pinned.has('a'), false);
    assert.equal(created.some(f => f.destroyed), false);
});

test('购买失败保留原卡，刷新换卡后清掉旧动画与回执', () => {
    const failed = makeShop(false);
    failed.ui._buy(0);
    assert.equal(failed.created.length, 0);
    assert.equal(failed.ui._cards[0].root.active, true);
    assert.equal(failed.ui._cards[0].receipt.active, false);
    const { ui, created } = makeShop();
    ui._buy(0); ui._refresh();
    assert.equal(created[0].destroyed, true);
    assert.equal(ui._shatterFxs.length, 0);
    assert.equal(ui._cards[0].root.active, true);
    assert.equal(ui._cards[0].receipt.active, false);
});

test('页面关闭、外部停用与销毁都会清理购买动画', () => {
    for (const action of ['hide', 'onDisable', 'onDestroy']) {
        const { ui, created } = makeShop();
        ui._buy(0); ui[action]();
        assert.equal(created[0].destroyed, true);
        assert.equal(ui._shatterFxs.length, 0);
    }
});
