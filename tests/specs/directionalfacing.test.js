'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createDirectionalFacingState,
    directionalArtKey,
    directionalArtKeys,
    resolveFacingView,
    updateDirectionalFacing,
} = require('../dist/core/DirectionalFacing');

test('屏幕方向正确选择前、侧、背视图', () => {
    assert.equal(resolveFacingView(0, 1, 'front').view, 'front');
    assert.equal(resolveFacingView(0, -1, 'front').view, 'back');
    assert.deepEqual(resolveFacingView(1, 0, 'front'), { view: 'side', mirror: 1 });
    assert.deepEqual(resolveFacingView(-1, 0, 'front'), { view: 'side', mirror: -1 });
});

test('对角线附近保留当前轴向，避免朝向闪烁', () => {
    assert.equal(resolveFacingView(1, 1, 'side').view, 'side');
    assert.equal(resolveFacingView(1, 1, 'front').view, 'front');
    assert.equal(resolveFacingView(0.2, -1, 'front').view, 'back');
});

test('转身在中点收窄并切换方向帧', () => {
    const state = createDirectionalFacingState('front');
    updateDirectionalFacing(state, 0, 1, 1 / 60);
    const start = updateDirectionalFacing(state, 1, 0, 0);
    assert.equal(start.turning, true);
    assert.equal(start.view, 'front');
    let middle;
    for (let i = 0; i < 5; i++) middle = updateDirectionalFacing(state, 1, 0, 1 / 60);
    assert.equal(middle.view, 'side');
    assert.ok(middle.turnScaleX < 1);
    for (let i = 0; i < 10; i++) middle = updateDirectionalFacing(state, 1, 0, 1 / 60);
    assert.equal(middle.turning, false);
    assert.equal(middle.turnScaleX, 1);
});

test('方向资源key覆盖静止与动作帧', () => {
    assert.equal(directionalArtKey('enemy_grunt', 'front', 0), 'enemy_grunt');
    assert.equal(directionalArtKey('enemy_grunt', 'front', 1), 'enemy_grunt_move');
    assert.equal(directionalArtKey('enemy_grunt', 'side', 1), 'enemy_grunt_side_move');
    assert.equal(directionalArtKey('enemy_grunt', 'back', 0), 'enemy_grunt_back');
    assert.deepEqual(directionalArtKeys('enemy_grunt'), [
        'enemy_grunt', 'enemy_grunt_move',
        'enemy_grunt_side', 'enemy_grunt_side_move',
        'enemy_grunt_back', 'enemy_grunt_back_move',
    ]);
});

test('朝向向量归零时保持最后一次左侧朝向', () => {
    const state = createDirectionalFacingState('side');
    updateDirectionalFacing(state, -1, 0, 1 / 60);
    const pose = updateDirectionalFacing(state, 0, 0, 1 / 60);
    assert.equal(pose.view, 'side');
    assert.equal(pose.mirror, -1);
});
