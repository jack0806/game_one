// ============================================================
//  augmentdownside.test.js — 强力词条负面代价回归测试
//  收益与代价同 desc 展示、同 mult 缩放；负护甲/零血等边界有地板保护
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AUGMENT_DB } = require('../dist/data/AugmentDB');
const { makeMockGame, makePlayer } = require('./mockGame');

function find(id) { return AUGMENT_DB.find(a => a.id === id); }

function makeFullPlayer(statsOverride = {}) {
    const player = makePlayer();
    player.stats = Object.assign({
        maxHp: 200, speed: 300, damage: 20, attackSpeed: 2,
        armor: 20, critRate: 0.05, critDmg: 0.5, pierce: 0,
        goldPickupRange: 60, eliteBonus: 0,
    }, statsOverride);
    player.hp = player.stats.maxHp;
    return player;
}

test('精准射击:暴击率+20%且移动速度-5%(用户示例的代价词条)', () => {
    const p = makeFullPlayer();
    find('crit_rate').onEquip(p, makeMockGame(), 1);
    assert.ok(Math.abs(p.stats.critRate - 0.25) < 1e-9);
    assert.ok(Math.abs(p.stats.speed - 285) < 1e-9, '300×0.95=285');
    assert.ok(find('crit_rate').desc.includes('移动速度 -5%'), '负面代价必须在desc中明示');
});

test('暴击强化:暴伤+60%且最大HP-8%,当前HP同步钳制', () => {
    const p = makeFullPlayer();
    find('crit_dmg').onEquip(p, makeMockGame(), 1);
    assert.ok(Math.abs(p.stats.critDmg - 1.1) < 1e-9);
    assert.ok(Math.abs(p.stats.maxHp - 184) < 1e-9, '200×0.92=184');
    assert.equal(p.hp, 184, '当前HP不得超过下调后的上限');
});

test('急速装填:攻速+25%且移动速度-4%', () => {
    const p = makeFullPlayer();
    find('attack_spd').onEquip(p, makeMockGame(), 1);
    assert.ok(Math.abs(p.stats.attackSpeed - 2.5) < 1e-9);
    assert.ok(Math.abs(p.stats.speed - 288) < 1e-9, '300×0.96=288');
});

test('吸血子弹:装备即扣护甲10(命中回血逻辑不变)', () => {
    const p = makeFullPlayer();
    find('lifesteal').onEquip(p, makeMockGame(), 1);
    assert.equal(p.stats.armor, 10);
});

test('吸血子弹护甲有地板:低甲角色不出现负护甲放大受伤', () => {
    const p = makeFullPlayer({ armor: 5 });
    find('lifesteal').onEquip(p, makeMockGame(), 1);
    assert.equal(p.stats.armor, 0, '护甲最低扣到0,不得为负');
});

test('金币磁铁:拾取范围×3且最大HP-20', () => {
    const p = makeFullPlayer();
    find('gold_magnet').onEquip(p, makeMockGame(), 1);
    assert.equal(p.stats.goldPickupRange, 180);
    assert.equal(p.stats.maxHp, 180);
    assert.equal(p.hp, 180);
});

test('海克斯炮台:正常召唤炮台且移动速度-5%', () => {
    const game = makeMockGame();
    game.turretPowers = [];
    game.spawnTurret = (_p, power) => game.turretPowers.push(power);
    const p = makeFullPlayer();
    find('turret').onEquip(p, game, 1);
    assert.deepEqual(game.turretPowers, [0.8], '炮台威力0.55+0.25=0.8不受代价影响');
    assert.ok(Math.abs(p.stats.speed - 285) < 1e-9);
});

test('能量护盾同步增加护盾上限，当前值不会再大于上限导致HUD越界', () => {
    const p = makePlayer();
    p.shield = 0;
    p.maxShield = 20;
    const aug = find('shield_regen');
    aug._cap = 0;
    aug._timer = 0;
    aug.onEquip(p, {}, 1);
    assert.equal(p.maxShield, 150);
    assert.equal(p.shield, 150);
    aug.onEquip(p, {}, 0.8);
    assert.equal(p.maxShield, 270);
    assert.equal(p.shield, 270);
});

test('超载海克斯:标记生效且移动速度-8%', () => {
    const p = makeFullPlayer();
    find('overload').onEquip(p, makeMockGame(), 1);
    assert.equal(p.stats._overloadCheck, true);
    assert.ok(Math.abs(p.stats.speed - 276) < 1e-9, '300×0.92=276');
});

test('升级时收益与代价按同比例追加(mult=0.8再挂一次)', () => {
    const p = makeFullPlayer();
    const aug = find('crit_rate');
    aug.onEquip(p, makeMockGame(), 1);
    aug.onEquip(p, makeMockGame(), 0.8); // Lv.2升级
    assert.ok(Math.abs(p.stats.critRate - 0.41) < 1e-9, '0.25+0.20×0.8=0.41');
    assert.ok(Math.abs(p.stats.speed - 273.6) < 1e-9, '285×(1-0.04)=273.6');
});

test('金币磁铁最大HP有地板:低血量角色不会扣到0以下', () => {
    const p = makeFullPlayer({ maxHp: 25 });
    find('gold_magnet').onEquip(p, makeMockGame(), 1);
    assert.equal(p.stats.maxHp, 5, '25-20=5,合法');
    const p2 = makeFullPlayer({ maxHp: 15 });
    find('gold_magnet').onEquip(p2, makeMockGame(), 1);
    assert.equal(p2.stats.maxHp, 1, '15-20应钳到最低1,不得为负');
});
