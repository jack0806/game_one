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

test('金币固定在敌人死亡位置:不生成速度,多帧更新后位置保持不变(二维平面,无重力)', () => {
    const eco = new Economy();
    const player = makePlayer({ x: 5000, y: 5000 }); // 远离,不会拾取
    eco.spawnDrop(400, 300, 10);
    assert.equal(eco.drops[0].x, 400, '金币应生成在死亡x坐标');
    assert.equal(eco.drops[0].y, 300, '金币应生成在死亡y坐标');
    assert.equal(eco.drops[0].vx, 0, '不应有横向抛洒速度');
    assert.equal(eco.drops[0].vy, 0, '不应有重力下落(之前会掉进HUD区)');
    for (let i = 0; i < 50; i++) eco.update(0.05, player);
    assert.equal(eco.drops[0].x, 400, '多帧更新后x不变');
    assert.equal(eco.drops[0].y, 300, '多帧更新后y不变');
});

test('金币不会沉入底部HUD区域,死亡点在HUD区内会被校正到战斗区底边', () => {
    const eco = new Economy();
    const player = makePlayer({ x: 640, y: 704, stats: { goldPickupRange: 1 } });
    eco.spawnDrop(640, 719, 10);
    assert.equal(eco.drops[0].y, 648, 'HUD区内死亡的金币应校正到PLAYFIELD_BOTTOM(648)');
    eco.update(1, player);
    assert.equal(eco.drops[0].y, 648, '更新后位置保持固定');
    assert.equal(eco.drops[0].x, 640, 'x不漂移');
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

test('clearDrops只清理测试场掉落且保留当前金币', () => {
    const eco = new Economy();
    eco.addGold(42);
    eco.spawnDrop(300, 200, 8);
    eco.clearDrops();
    assert.equal(eco.gold, 42);
    assert.equal(eco.drops.length, 0);
});
