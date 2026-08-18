'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { InputManager } = require('../dist/systems/InputManager');

test('Escape按下边沿在本帧逻辑可读取,直到lateUpdate后才清除', () => {
    const input = new InputManager();
    input._onKeyDown({ keyCode: 27 });

    assert.equal(input.justPressed('Escape'), true);
    assert.equal(input.justPressed('Escape'), true,
        '同一帧内多个系统读取不应提前消耗按键边沿');

    input.lateUpdate(0.016);
    assert.equal(input.justPressed('Escape'), false,
        '本帧全部普通update完成后才应清除按键边沿');
});

test('Shift/Space和技能键只在按下沿触发,长按不会重复触发', () => {
    const input = new InputManager();
    input._onKeyDown({ keyCode: 16 });
    assert.equal(input.isDashPressed(), true);
    input.lateUpdate(0.016);
    assert.equal(input.isDashPressed(), false);
    input._onKeyDown({ keyCode: 16 });
    assert.equal(input.isDashPressed(), false, '未松开时重复keydown不应制造新的按下沿');
    input._onKeyUp({ keyCode: 16 });
    input._onKeyDown({ keyCode: 16 });
    assert.equal(input.isDashPressed(), true, '松开后再次按下应产生新的按下沿');
});
