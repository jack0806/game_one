'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Economy } = require('../dist/systems/Economy');
const { makePlayer } = require('./mockGame');

test('addGold/spendGold基本收支', () => {
    const eco = new Economy();
    eco.addGold(100);
    assert.equal(eco.gold, 100);
    assert.equal(eco.spendGold(30), true);
    assert.equal(eco.gold, 70);
    assert.equal(eco.spendGold(1000), false, '余额不足应返回false且不扣款');
    assert.equal(eco.gold, 70);
});

test('spawnDrop生成的金币掉落在拾取范围内被玩家收集', () => {
    const eco = new Economy();
    const player = makePlayer({ x: 0, y: 0, stats: { goldPickupRange: 60 } });
    eco.spawnDrop(0, 0, 25);
    // 多帧模拟直到掉落物落地并被拾取(掉落有初始向上速度,需要时间下落回拾取范围)
    for (let i = 0; i < 200 && eco.drops.length; i++) eco.update(0.05, player);
    assert.equal(eco.gold, 25, '拾取范围内的掉落应被收集,金币应到账');
    assert.equal(eco.drops.length, 0);
});

test('金币不会沉入底部HUD区域,底部生成和横向移动都会被安全限制', () => {
    const eco = new Economy();
    const player = makePlayer({ x: 640, y: 704, stats: { goldPickupRange: 1 } });
    eco.spawnDrop(640, 719, 10);
    assert.ok(eco.drops[0].y <= 648, '生成在画布底部的金币应先校正到HUD上方');
    eco.drops[0].vx = 10000;
    eco.update(1, player);
    assert.ok(eco.drops[0].x <= 1268, '金币不应横向越出画布');
    assert.ok(eco.drops[0].y <= 648, '金币落地位置必须保持在HUD上方');
    assert.equal(eco.drops[0].vy, 0, '金币落地后不应继续向下累积速度');
});

test('掉落物超过life后自动消失(未被拾取)', () => {
    const eco = new Economy();
    const player = makePlayer({ x: 5000, y: 5000 }); // 远离,不会拾取
    eco.spawnDrop(0, 0, 10);
    eco.update(31, player); // life=30,一次性推进超过
    assert.equal(eco.drops.length, 0, '超过生命周期的掉落应被清除');
    assert.equal(eco.gold, 0, '未被拾取不应加金币');
});

test('generateShopItems按章节数放大价格(mult = 1+(chapter-1)*0.3)', () => {
    const eco = new Economy();
    const ch1 = eco.generateShopItems(1);
    const ch3 = eco.generateShopItems(3);
    const heal1 = ch1.find(i => i.id === 'heal');
    const heal3 = ch3.find(i => i.id === 'heal');
    assert.equal(heal1.cost, 30); // mult=1
    assert.equal(heal3.cost, Math.round(30 * 1.6)); // mult=1+2*0.3=1.6
});

test('spend()是spendGold的别名', () => {
    const eco = new Economy();
    eco.addGold(50);
    assert.equal(eco.spend(20), true);
    assert.equal(eco.gold, 30);
});

test('reset()清空gold/parts/drops', () => {
    const eco = new Economy();
    eco.addGold(100);
    eco.spawnDrop(0, 0, 10);
    eco.reset();
    assert.equal(eco.gold, 0);
    assert.equal(eco.parts, 0);
    assert.equal(eco.drops.length, 0);
});
