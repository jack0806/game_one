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
    assert.equal(am.active.length, 1);
    assert.equal(am.active[0].level, 1);
    assert.ok(Math.abs(p.stats.attackSpeed - base * 1.10) < 1e-9);

    am.equip({ id: 'hex01' }, p, game);   // Lv2 +20%
    assert.equal(am.active.length, 1, '升档不占新格子');
    assert.equal(am.active[0].level, 2);
    assert.ok(Math.abs(p.stats.attackSpeed - base * 1.20) < 1e-9);

    am.equip({ id: 'hex01' }, p, game);   // Lv3 +30%
    assert.equal(am.active[0].level, 3);
    assert.ok(Math.abs(p.stats.attackSpeed - base * 1.30) < 1e-9);

    assert.equal(am.equip({ id: 'hex01' }, p, game), false, '满级后再装备失败');
});

test('一次性海克斯（17 立得金币）立即生效且不占格子', () => {
    const am = new AugmentManager();
    const game = wireAm(makeMockGame(), am);
    game.economy = { gold: 0, addGold(v) { this.gold += v; } };
    const p = makeStatsPlayer();

    const ok = am.equip({ id: 'hex17', level: 2 }, p, game);
    assert.equal(ok, true);
    assert.equal(am.active.length, 0, '一次性海克斯不入列');
    assert.equal(game.economy.gold, 1000, 'Lv2 立得 1000 金币');
});

test('满格后新海克斯装备失败，升档不受格子限制', () => {
    const am = new AugmentManager();
    const game = makeMockGame();
    const p = makeStatsPlayer();
    for (const id of ['hex01', 'hex02', 'hex03', 'hex07', 'hex11']) {
        assert.equal(am.equip({ id }, p, game), true);
    }
    assert.equal(am.active.length, 5);
    assert.equal(am.equip({ id: 'hex04' }, p, game), false, '第6个非一次性海克斯被拒绝');

    assert.equal(am.equip({ id: 'hex01' }, p, game), true, '已持有海克斯升档仍可进行');
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

test('海克斯15 进阶蓝图：下一个新海克斯 +1 档（封顶3）', () => {
    const am = new AugmentManager();
    const game = wireAm(makeMockGame(), am);
    const p = makeStatsPlayer();

    am.equip({ id: 'hex15' }, p, game);
    assert.equal(am.nextLevelBonus, 1);
    assert.equal(am.active.length, 0, '蓝图本身是一次性');

    am.equip({ id: 'hex03' }, p, game);
    assert.equal(am.active[0].level, 2, '新海克斯直接 Lv2');
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
