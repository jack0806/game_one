// ============================================================
//  EntityVisual.ts — 逻辑坐标与表现坐标的唯一转换
// ============================================================
import { CANVAS_W, CANVAS_H } from './Constants';

/** 逻辑坐标原点在左上角，Cocos 战场节点原点在画布中心。 */
export function worldToLocal(x: number, y: number): [number, number] {
    return [x - CANVAS_W / 2, CANVAS_H / 2 - y];
}

/**
 * 表现偏移只接受少量局部动作位移，绝不能把贴图单独钳制到屏幕内。
 * 出生在场外的单位应从场外进入；碰撞、危险预警、阴影始终跟随逻辑根。
 */
export function entityVisualPose(
    x: number, y: number, facingX: number, facingY: number,
    lift = 0, pull = 0, sway = 0,
): { x: number; y: number; groundX: number; groundY: number } {
    const [groundX, groundY] = worldToLocal(x, y);
    const length = Math.hypot(facingX, facingY);
    const dx = length > 0 ? facingX / length : 0;
    const dy = length > 0 ? facingY / length : 0;
    return {
        groundX, groundY,
        x: groundX - dx * pull - dy * sway,
        y: groundY + lift + dy * pull - dx * sway,
    };
}

/**
 * 动画帧的 pivotY 使用源图左上角坐标；Cocos 锚点则从左下角计算。
 * applyAnimationFrame 会设置 anchorY=1-pivotY，因此节点到 Sprite 画布顶部的
 * 实际距离正好是 displaySize*displayScale*pivotY。
 */
export function animationFrameTopOffset(
    displaySize: number, pivotY: number, displayScale = 1, alphaTop = 0,
): number {
    // 跳跃落地、倒下等姿势可能整体位于逻辑根下方，此时偏移可以为负；
    // 强行钳到0会把血条留在根节点而不是放到真实身体顶边。
    const visibleHeight = Math.max(0, Math.min(1, pivotY)) - Math.max(0, Math.min(1, alphaTop));
    return Math.max(0, displaySize) * Math.max(0, displayScale) * visibleHeight;
}

/** 血条与当前可见身体使用同一个局部坐标，受击/跳跃时也不会脱节。 */
export function entityHealthBar(
    x: number, y: number, radius: number, visualRadius: number, topOffset = visualRadius,
) {
    const width = Math.max(radius * 2.2, visualRadius * 1.55);
    return { x: x - width / 2, y: y + topOffset + 4, width, height: 6 };
}
