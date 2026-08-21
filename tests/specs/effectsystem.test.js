'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FloatingText, ScreenShake } = require('../dist/systems/EffectSystem');

test('震屏使用有界阻尼并最终回到原点', () => {
    const shake = new ScreenShake();
    shake.shake(50, 2); // 应被钳制为14px/0.45s
    let maxX = 0, maxY = 0;
    for (let i = 0; i < 40; i++) {
        shake.update(0.016);
        maxX = Math.max(maxX, Math.abs(shake.x));
        maxY = Math.max(maxY, Math.abs(shake.y));
    }
    assert.ok(maxX <= 14);
    assert.ok(maxY <= 8);
    assert.equal(shake.active, false);
    assert.equal(shake.x, 0);
    assert.equal(shake.y, 0);
});

test('强震期间的小震动不会无限延长持续时间', () => {
    const shake = new ScreenShake();
    shake.shake(12, 0.2);
    for (let i = 0; i < 18; i++) {
        shake.update(0.01);
        shake.shake(2, 0.45);
    }
    shake.update(0.03);
    assert.equal(shake.active, false, '连续普通小命中不应把强震动永久续杯');
});

test('reset立即清空震动状态', () => {
    const shake = new ScreenShake();
    shake.shake(10, 0.3);
    shake.update(0.016);
    shake.reset();
    assert.equal(shake.active, false);
    assert.equal(shake.x, 0);
    assert.equal(shake.y, 0);
});

test('clear立即清空跨页面残留的战斗飘字', () => {
    const text = new FloatingText();
    text.spawn(640, 360, '18', '#fff');
    text.spawn(640, 330, '网络连接', '#00aaff', 15, true);
    assert.equal(text.items.length, 2);

    text.clear();
    assert.equal(text.items.length, 0);
});
