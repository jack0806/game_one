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

test('虚拟摇杆向量在键盘空闲时接管移动,键盘输入优先于摇杆', () => {
    const input = new InputManager();
    assert.equal(input.moveX, 0, '无输入时移动向量为0');
    assert.equal(input.moveY, 0);

    // 摇杆写入（画布坐标系y向下）：向右+向前(屏幕上方)
    input.setStick(0.6, -0.8);
    assert.equal(input.moveX, 0.6, '键盘空闲时moveX取摇杆x');
    assert.equal(input.moveY, -0.8, '键盘空闲时moveY取摇杆y');

    // 键盘按下时优先，两端同时输入行为确定
    input._onKeyDown({ keyCode: 68 }); // D
    assert.equal(input.moveX, 1, '键盘D优先于摇杆');
    input._onKeyUp({ keyCode: 68 });
    assert.equal(input.moveX, 0.6, '松开键盘后回到摇杆向量');

    // 摇杆归零
    input.setStick(0, 0);
    assert.equal(input.moveX, 0);
    assert.equal(input.moveY, 0);
});

test('虚拟技能按钮按下沿与键盘Q/E/R共用同一帧语义,lateUpdate后清除', () => {
    const input = new InputManager();
    input.fireSkillPressed('q');
    assert.equal(input.isKeyQPressed(), true, '虚拟Q按下当帧应读到边沿');
    assert.equal(input.isKeyEPressed(), false, '未按下的槽位不受影响');
    input.lateUpdate(0.016);
    assert.equal(input.isKeyQPressed(), false, '虚拟按钮边沿在lateUpdate后清除');
    input.fireSkillPressed('r');
    assert.equal(input.isKeyRPressed(), true);
});

test('冲刺键(Shift/Space)已随冲刺功能一并移除', () => {
    // InputManager 不再暴露冲刺接口（冲刺功能砍掉，PlayerController 不再调用）
    assert.equal(InputManager.prototype.isDash, undefined);
    assert.equal(InputManager.prototype.isDashPressed, undefined);
});

test('M键按下沿用于开关角色详情面板', () => {
    const input = new InputManager();
    input._onKeyDown({ keyCode: 77 });
    assert.equal(input.isKeyMPressed(), true, '按下M当帧应读到边沿');
    input.lateUpdate(0.016);
    assert.equal(input.isKeyMPressed(), false, '边沿在lateUpdate后清除');
    input._onKeyDown({ keyCode: 77 });
    assert.equal(input.isKeyMPressed(), false, '长按M不重复触发');
});
