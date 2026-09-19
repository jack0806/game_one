'use strict';
// 海克斯管理器：等级叠加 / 一次性消耗 / 定价溢价 / 卖出回退 / 满格规则
const test = require('node:test');
const assert = require('node:assert/strict');
const { AugmentManager } = require('../dist/systems/AugmentManager');
const { AUGMENT_DB } = require('../dist/data/AugmentDB');
const { makeMockGame, makePlayer } = require('./mockGame');

const byId = (id) => AUGMENT_DB.find(a => a.id === id);

function makeStatsPlayer() {
    const p = makePlayer();
    p.charId = 'kai';
    p._charDef = { attackType: 'ranged', attackRange: 420 };
    p.getDamage = () => p.stats.damage;
    // 真实 PlayerController.stats 初始字段（swapFactor 换档需要基数）
    p.stats.attackSpeed = 1;
    p.stats.critRate = 0.05;
    return p;
}

/** 让一次性海克斯钩子里的 game.augmentManager 指向真实管理器。 */
function wireAm(game, am) {
    game.augmentManager = am;
    return game;
}

test('初始格子为5（海克斯.docx：初始5个待开发格子）', () => {
    assert.equal(new AugmentManager().maxSlots, 5);
});

test('同一海克斯重复装备升档：Lv1→Lv2→Lv3，攻速按档位精确换算', () => {
    const am = new AugmentManager();
    const game = wireAm(makeMockGame(), am);
    const p = makeStatsPlayer();
    const base = p.stats.attackSpeed;

    am.equip({ id: 'hex01' }, p, game);   // Lv1 +10%
    assert.equal(am.functional.length, 1, '功能性海克斯入 functional 列表');
    assert.equal(am.active.length, 0, '功能性海克斯不占技能格');
    assert.equal(am.functional[0].level, 1);
    assert.ok(Math.abs(p.stats.attackSpeed - base * 1.10) < 1e-9);

    am.equip({ id: 'hex01' }, p, game);   // Lv2 +20%
    assert.equal(am.functional.length, 1, '升档不占新格子');
    assert.equal(am.functional[0].level, 2);
    assert.ok(Math.abs(p.stats.attackSpeed - base * 1.20) < 1e-9);

    am.equip({ id: 'hex01' }, p, game);   // Lv3 +30%
    assert.equal(am.functional[0].level, 3);
    assert.ok(Math.abs(p.stats.attackSpeed - base * 1.30) < 1e-9);
});

test('功能性海克斯可无限叠加购买：满档后再买=叠加新实例，效果独立叠乘', () => {
    const am = new AugmentManager();
    const game = wireAm(makeMockGame(), am);
    const p = makeStatsPlayer();
    const base = p.stats.attackSpeed;

    // 前3次购买把第一份升到 Lv3（×1.30）
    for (let i = 0; i < 3; i++) am.equip({ id: 'hex01' }, p, game);
    assert.ok(Math.abs(p.stats.attackSpeed - base * 1.30) < 1e-9);

    // 第4次购买：满档后叠加 Lv1 新实例（×1.30 ×1.10）
    assert.equal(am.equip({ id: 'hex01' }, p, game), true, '满档后仍可购买');
    assert.equal(am.functional.length, 2, '叠加新实例');
    assert.equal(am.functional[1].level, 1);
    assert.ok(Math.abs(p.stats.attackSpeed - base * 1.43) < 1e-9, '效果独立叠乘');

    // 第5-6次购买把第二份升到 Lv3（×1.30 ×1.30）
    am.equip({ id: 'hex01' }, p, game);
    am.equip({ id: 'hex01' }, p, game);
    assert.equal(am.functional.length, 2, '升级不新增实例');
    assert.equal(am.functional[1].level, 3);
    assert.ok(Math.abs(p.stats.attackSpeed - base * 1.69) < 1e-9);

    // 技能格始终不受影响；卖出叠加实例只回退该实例的贡献
    assert.equal(am.active.length, 0);
    am.unequip('hex01', p, game);
    assert.equal(am.functional.length, 1);
    assert.ok(Math.abs(p.stats.attackSpeed - base * 1.30) < 1e-9, '卖出一份后另一份仍生效');

    // 满档持有后商店卡池仍持续刷出该功能海克斯（可继续无限购买）
    let offered = false;
    for (let i = 0; i < 60 && !offered; i++) {
        offered = am.rollOptions(3, 8).some(c => c.id === 'hex01');
    }
    assert.ok(offered, '满档功能海克斯应持续出现在卡池');
});

test('功能性海克斯不占 5 个技能格：数量无上限，技能格独立计算', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makeStatsPlayer();
    // 全部 5 个功能性海克斯（01/02/03/07/11）都装上
    for (const id of ['hex01', 'hex02', 'hex03', 'hex07', 'hex11']) {
        assert.equal(am.equip({ id }, p, game), true);
    }
    assert.equal(am.functional.length, 5);
    assert.equal(am.active.length, 0, '功能海克斯不占技能格');
    assert.equal(am.all().length, 5, 'all() 汇总技能+功能');
    assert.equal(am.ownedOf('hex03').id, 'hex03', 'ownedOf 跨列表查询');
    // 技能海克斯仍可正常装满 5 格
    for (const id of ['hex04', 'hex05', 'hex06', 'hex08', 'hex10']) {
        assert.equal(am.equip({ id }, p, game), true);
    }
    assert.equal(am.active.length, 5);
    assert.equal(am.equip({ id: 'hex13' }, p, game), false, '技能格满后第6个技能海克斯被拒绝');
});

test('一次性海克斯（17 立得金币）立即生效不占格子，且每局只能选择一次', () => {
    const am = new AugmentManager();
    const game = wireAm(makeMockGame(), am);
    game.economy = { gold: 0, addGold(v) { this.gold += v; } };
    const p = makeStatsPlayer();

    const ok = am.equip({ id: 'hex17', level: 2 }, p, game);
    assert.equal(ok, true);
    assert.equal(am.active.length, 0, '一次性海克斯不入列');
    assert.equal(game.economy.gold, 1000, 'Lv2 立得 1000 金币');

    // 同一局内第二次选择同一一次性海克斯被拒绝（金币不再重复发放）
    assert.equal(am.equip({ id: 'hex17', level: 3 }, p, game), false, '每局只能选择一次');
    assert.equal(game.economy.gold, 1000);

    // 商店卡池不再刷出已消耗的一次性海克斯（15/17）
    for (let i = 0; i < 40; i++) {
        for (const card of am.rollOptions(3, 8)) {
            assert.notEqual(card.id, 'hex17', '已选用的整局不再出现');
        }
    }
    // force 供测试房沙盒绕过限制重复授予
    assert.equal(am.equip({ id: 'hex17', level: 1 }, p, game, { force: true }), true);
    assert.equal(game.economy.gold, 1500);
});

test('满格后新海克斯装备失败，升档不受格子限制', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makeStatsPlayer();
    // 5 个技能海克斯占满技能格（功能性海克斯不占格，不参与满格判定）
    for (const id of ['hex04', 'hex05', 'hex06', 'hex08', 'hex10']) {
        assert.equal(am.equip({ id }, p, game), true);
    }
    assert.equal(am.active.length, 5);
    assert.equal(am.equip({ id: 'hex13' }, p, game), false, '第6个非功能性海克斯被拒绝');

    assert.equal(am.equip({ id: 'hex04' }, p, game), true, '已持有海克斯升档仍可进行');
    assert.equal(am.active[0].level, 2);
});

test('定价溢价：银/金每购1次+10%，彩每购1次+100%（按档位稀有度计价）', () => {
    const am = new AugmentManager();
    const speed = byId('hex01');       // prices [15, 100, 500]
    const blueprint = byId('hex15');   // 单档彩 500
    assert.equal(am.priceOf(speed, 1), 15);
    assert.equal(am.priceOf(speed, 2), 100);
    assert.equal(am.priceOf(speed, 3), 500);
    am.recordPurchase('silver', 15);
    assert.equal(am.priceOf(speed, 1), 17);   // 15 × 1.1 → 16.5 取整

    assert.equal(am.priceOf(blueprint, 1), 500);
    am.recordPurchase('prismatic', 500);
    assert.equal(am.priceOf(blueprint, 1), 1000);  // 500 × 2
});

test('卖出回退加成并回收75%实付价', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makeStatsPlayer();
    const base = p.stats.damage;

    am.equip({ id: 'hex02' }, p, game);
    am.active[0].paid = 100;
    assert.ok(Math.abs(p.stats.damage - base * 1.05) < 1e-9);

    const inst = am.unequip('hex02', p, game);
    assert.equal(am.active.length, 0);
    assert.equal(am.sellValue(inst), 75, '回收价 = 实付 × 75%');
    assert.ok(Math.abs(p.stats.damage - base) < 1e-9, '卖出后攻击加成回退');
});

test('实付价由 equip 累计到被升级/叠加的实例（卖出按各实例总额回收）', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makeStatsPlayer();

    am.equip({ id: 'hex01', _price: 15 }, p, game);   // 第一份 Lv1
    am.equip({ id: 'hex01', _price: 17 }, p, game);   // 升 Lv2
    am.equip({ id: 'hex01', _price: 20 }, p, game);   // 升 Lv3
    assert.equal(am.functional[0].paid, 52, '升级价累计到同一实例');
    am.equip({ id: 'hex01', _price: 21 }, p, game);   // 满档 → 叠加第二份 Lv1
    am.equip({ id: 'hex01', _price: 23 }, p, game);   // 第二份升 Lv2
    am.equip({ id: 'hex01', _price: 26 }, p, game);   // 第二份升 Lv3
    am.equip({ id: 'hex01', _price: 28 }, p, game);   // 又满档 → 第三份 Lv1
    assert.equal(am.functional.length, 3, '可继续叠加第三份');
    assert.equal(am.functional[1].paid, 70, '第二份累计自己的实付');
    assert.equal(am.functional[2].paid, 28, '叠加实例记自己的实付');
    assert.equal(am.sellValue(am.functional[2]), 21, '卖出按各实例实付 75% 回收');
});

test('海克斯15 进阶蓝图：下一个新海克斯 +1 档（封顶3，功能海克斯同样受益）', () => {
    const am = new AugmentManager();
    const game = wireAm(makeMockGame(), am);
    const p = makeStatsPlayer();

    am.equip({ id: 'hex15' }, p, game);
    assert.equal(am.nextLevelBonus, 1);
    assert.equal(am.active.length, 0, '蓝图本身是一次性');

    am.equip({ id: 'hex03' }, p, game);
    assert.equal(am.functional[0].level, 2, '新功能海克斯直接 Lv2（不占格也吃蓝图加成）');
    assert.equal(am.nextLevelBonus, 0, '加成已消费');
});

test('rollOptions：三张卡带档位与价格，卡面稀有度=档位稀有度，已持有的非一次性不再重复出现', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makeStatsPlayer();
    const levelRarity = { 1: 'silver', 2: 'gold', 3: 'prismatic' };

    am.equip({ id: 'hex01' }, p, game);
    // 多次采样：任何一帧的卡池都不应再出现已持有的 hex01 新卡
    for (let i = 0; i < 30; i++) {
        const opts = am.rollOptions(3, 1);
        assert.equal(opts.length, 3);
        for (const card of opts) {
            assert.ok(card._price > 0, '卡片必须带价格');
            assert.ok(card.desc && card.desc.length > 0, '卡片必须带档位文案');
            // 等级即稀有度：多档海克斯卡面颜色随档位走
            if (byId(card.id).prices.length > 1) {
                assert.equal(card.rarity, levelRarity[card.level], `${card.id} Lv${card.level} 应为 ${levelRarity[card.level]}`);
            }
            if (card.id === 'hex01') assert.ok(card._isUpgrade, '已持有只能以升档卡出现');
        }
    }
});

test('海克斯16 点金手：金币获得乘区按档位换算', () => {
    const am = new AugmentManager();
    const game = wireAm(makeMockGame(), am);
    game.economy = { gold: 0, gainMult: 1, addGold(v) { this.gold += Math.round(v * this.gainMult); } };
    const p = makeStatsPlayer();

    am.equip({ id: 'hex16' }, p, game);
    assert.equal(game.economy.gainMult, 1.5);
    am.equip({ id: 'hex16' }, p, game);
    assert.equal(game.economy.gainMult, 2);
    am.unequip('hex16', p, game);
    assert.equal(game.economy.gainMult, 1);
});

test('海克斯12 不灭协议：装备写入标记与护盾倍率，卸下清除', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makeStatsPlayer();

    am.equip({ id: 'hex12', level: 3 }, p, game);
    assert.equal(p.stats.hasHexGuard, true);
    assert.equal(p.stats._hexGuardShieldMult, 2.5);
    am.unequip('hex12', p, game);
    assert.equal(p.stats.hasHexGuard, false);
});
