'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    advanceLocomotion,
    createLocomotionState,
    resetLocomotion,
} = require('../dist/core/Locomotion');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { BossController } = require('../dist/entities/BossController');
const { makeMockGame } = require('./mockGame');

test('动作帧由实际位移推进且停住保持静止帧', () => {
    const state = createLocomotionState(0);
    resetLocomotion(state, 100, 100);
    const idle = advanceLocomotion(state, 100, 100, 1 / 60, 82, 'biped');
    assert.equal(idle.moving, false);
    assert.equal(idle.frameIndex, 0);
    assert.equal(idle.footSwing, 0);

    const walking = advanceLocomotion(state, 106, 100, 1 / 60, 82, 'biped');
    assert.equal(walking.moving, true);
    assert.ok(walking.motion > 0);
    assert.ok(walking.phase > idle.phase);
    assert.ok(walking.footLiftLeft === 0 || walking.footLiftRight === 0);
    assert.ok(walking.footLiftLeft > 0 || walking.footLiftRight > 0);
});

test('减速后的短位移产生更少步态相位推进', () => {
    const slow = createLocomotionState();
    const fast = createLocomotionState();
    resetLocomotion(slow, 0, 0);
    resetLocomotion(fast, 0, 0);
    const slowPose = advanceLocomotion(slow, 1, 0, 1 / 60, 60, 'biped');
    const fastPose = advanceLocomotion(fast, 4, 0, 1 / 60, 60, 'biped');
    assert.ok(fastPose.phase > slowPose.phase);
});

test('高速英雄的步频有上限，不会因高移速变成腿部残影', () => {
    const state = createLocomotionState();
    resetLocomotion(state, 0, 0);
    const dt = 1 / 60;
    const pose = advanceLocomotion(state, 330 * dt, 0, dt, 82, 'biped');
    assert.ok(pose.phase <= dt * 3.6 * Math.PI * 2 + 1e-9);
});

test('传送不会让步态相位在一帧内乱转', () => {
    const state = createLocomotionState(0.4);
    resetLocomotion(state, 10, 10);
    const before = state.phase;
    const pose = advanceLocomotion(state, 600, 500, 1 / 60, 82, 'biped');
    assert.equal(pose.phase, before);
    assert.equal(pose.moving, false);
});

test('停步后动作平滑收束并最终回到待机', () => {
    const state = createLocomotionState();
    resetLocomotion(state, 0, 0);
    advanceLocomotion(state, 5, 0, 1 / 60, 70, 'heavy');
    let pose;
    for (let i = 0; i < 90; i++) {
        pose = advanceLocomotion(state, 5, 0, 1 / 60, 70, 'heavy');
    }
    assert.equal(pose.moving, false);
    assert.equal(pose.frameIndex, 0);
    assert.equal(pose.motion, 0);
    assert.equal(pose.bodyLift, 0);
    assert.equal(pose.bodyRollDeg, 0);
});

test('不同身体结构使用不同步幅，悬浮体仍有位移脉冲', () => {
    const poses = {};
    for (const kind of ['biped', 'heavy', 'skitter', 'quadruped', 'hover']) {
        const state = createLocomotionState();
        resetLocomotion(state, 0, 0);
        poses[kind] = advanceLocomotion(state, 6, 0, 1 / 60, 80, kind);
        assert.equal(poses[kind].kind, kind);
        assert.ok(poses[kind].motion > 0);
    }
    assert.ok(poses.skitter.stride > poses.heavy.stride);
    assert.ok(poses.hover.bodyLift > poses.heavy.bodyLift);
});

test('所有普通怪原型和四章Boss都有明确的移动结构', () => {
    const game = makeMockGame();
    const expected = {
        grunt: 'biped', shield: 'heavy', exploder: 'skitter', golem: 'heavy',
        elite_grunt: 'biped', archer: 'biped', miniboss: 'quadruped',
    };
    for (const [type, kind] of Object.entries(expected)) {
        const enemy = new EnemyBase();
        enemy.init(type, 1, game);
        assert.equal(enemy.locomotionKind, kind, `${type} 的步态结构`);
        assert.equal(enemy.moveSpriteKey, `${enemy.spriteKey}_move`, `${type} 的动作帧`);
    }

    for (let chapter = 0; chapter < 4; chapter++) {
        const boss = new BossController();
        boss.initBoss(chapter, game);
        assert.equal(boss.locomotionKind, chapter < 2 ? 'heavy' : 'hover', `第${chapter + 1}章Boss`);
        assert.equal(boss.moveSpriteKey, `enemy_boss_ch${chapter + 1}_move`);
    }
});
