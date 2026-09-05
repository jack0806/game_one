'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { InputManager } = require('../dist/systems/InputManager');

test('空格与触屏跳跃共享按下沿，长按及下一帧不会重复触发', () => {
    const input = new InputManager();
    input._onKeyDown({ keyCode: 32 });
    assert.equal(input.isJumpPressed(), true);
    input.lateUpdate(0);
    input._onKeyDown({ keyCode: 32 });
    assert.equal(input.isJumpPressed(), false);
    input._onKeyUp({ keyCode: 32 });
    input._onKeyDown({ keyCode: 32 });
    assert.equal(input.isJumpPressed(), true);
    input.lateUpdate(0);
    input.fireJumpPressed();
    assert.equal(input.isJumpPressed(), true);
    input.lateUpdate(0);
    assert.equal(input.isJumpPressed(), false);
});
