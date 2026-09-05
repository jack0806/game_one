'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    worldToLocal, entityVisualPose, entityHealthBar, animationFrameTopOffset,
} = require('../dist/core/EntityVisual');
const { CANVAS_W, CANVAS_H, PLAYFIELD_BOTTOM } = require('../dist/core/Constants');
const { ACTOR_ANIMATIONS } = require('../dist/data/ActorAnimationDB');
const { ANIMATION_ALPHA_TOP, animationAlphaTop } = require('../dist/data/AnimationBoundsDB');

test('全战场与场外出生坐标可逆，左半屏和下半屏不被推到别处', () => {
    for (const x of [-90, 0, 90, 320, 640, 960, 1280, 1370]) {
        for (const y of [-90, 0, 80, 300, 500, PLAYFIELD_BOTTOM, PLAYFIELD_BOTTOM + 90]) {
            const pose = entityVisualPose(x, y, 1, 0);
            assert.equal(pose.x + CANVAS_W / 2, x);
            assert.equal(CANVAS_H / 2 - pose.y, y);
            assert.deepEqual([pose.x, pose.y], worldToLocal(x, y));
        }
    }
});

test('不同尺寸敌人的血条跟随当前身体，后坐力不随目标距离放大', () => {
    for (const radius of [9, 18, 30, 50, 90]) {
        const pose = entityVisualPose(200, 460, 800, -600, 3, 4, 2);
        assert.ok(Math.hypot(pose.x - pose.groundX, pose.y - pose.groundY) < 9);
        const bar = entityHealthBar(pose.x, pose.y, radius, radius * 1.8);
        assert.ok(Math.abs(bar.x + bar.width / 2 - pose.x) < 1e-9);
        assert.equal(bar.y, pose.y + radius * 1.8 + 4);
        assert.equal(bar.height, 6);
    }
});

test('放大动作帧的血条位于Cocos真实画布顶部且宽度同步放大', () => {
    const bodyX = 125, bodyY = -70;
    const radius = 30, visualRadius = 48;
    const displayScale = 1.55, pivotY = 0.62;
    const top = animationFrameTopOffset(visualRadius * 2, pivotY, displayScale);
    const bar = entityHealthBar(bodyX, bodyY, radius, visualRadius * displayScale, top);
    assert.equal(top, visualRadius * 2 * pivotY * displayScale);
    assert.equal(bar.y, bodyY + top + 4);
    assert.ok(bar.width >= visualRadius * displayScale * 1.55);
    assert.equal(bar.x + bar.width / 2, bodyX);
});

test('全部身体动作帧都有alpha顶边，血条贴合可见像素而非透明画布', () => {
    let checked = 0;
    for (const actor of Object.values(ACTOR_ANIMATIONS)) {
        for (const view of Object.values(actor)) {
            for (const clip of Object.values(view)) {
                for (const frame of clip.frames) {
                    const top = animationAlphaTop(clip.sheet, frame.index);
                    assert.equal(top, ANIMATION_ALPHA_TOP[clip.sheet][frame.index]);
                    assert.ok(top >= 0 && top < 1, `${clip.sheet}:${frame.index}顶边无效`);
                    checked++;
                }
            }
        }
    }
    assert.ok(checked > 4500);
    const fullCanvas = animationFrameTopOffset(100, 0.6, 1.5);
    const visibleBody = animationFrameTopOffset(100, 0.6, 1.5, 0.25);
    assert.equal(visibleBody, 52.5);
    assert.ok(visibleBody < fullCanvas);
});

test('目标重叠不会生成NaN坐标', () => {
    const pose = entityVisualPose(640, 360, 0, 0, 2, 5, 3);
    assert.deepEqual(pose, { x: 0, y: 2, groundX: 0, groundY: 0 });
});
