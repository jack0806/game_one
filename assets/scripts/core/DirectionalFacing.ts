// ============================================================
//  DirectionalFacing.ts — 2D方向帧选择与2.5D转身过渡
// ============================================================

export type FacingView = 'front' | 'side' | 'back';

export interface DirectionalFacingState {
    initialized: boolean;
    view: FacingView;
    mirror: 1 | -1;
    targetView: FacingView;
    targetMirror: 1 | -1;
    turnProgress: number;
}

export interface DirectionalFacingPose {
    view: FacingView;
    mirror: 1 | -1;
    turnScaleX: number;
    turnLeanDeg: number;
    turning: boolean;
}

const TURN_SECONDS = 0.13;
const AXIS_SWITCH_RATIO = 1.24;

export function createDirectionalFacingState(view: FacingView = 'front'): DirectionalFacingState {
    return {
        initialized: false,
        view,
        mirror: 1,
        targetView: view,
        targetMirror: 1,
        turnProgress: 1,
    };
}

export function resetDirectionalFacing(state: DirectionalFacingState, view: FacingView = 'front'): void {
    state.initialized = false;
    state.view = view;
    state.mirror = 1;
    state.targetView = view;
    state.targetMirror = 1;
    state.turnProgress = 1;
}

/**
 * 把屏幕空间朝向量量化为前/侧/背三套美术。接近45°时保留当前轴向，避免
 * 鼠标或寻路在对角线附近轻微抖动导致 Sprite 高频闪换。
 */
export function resolveFacingView(
    dx: number,
    dy: number,
    currentView: FacingView,
): { view: FacingView; mirror: 1 | -1 } {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax + ay < 0.0001) return { view: currentView, mirror: 1 };

    let view = currentView;
    if (currentView === 'side') {
        if (ay > ax * AXIS_SWITCH_RATIO) view = dy >= 0 ? 'front' : 'back';
    } else if (ax > ay * AXIS_SWITCH_RATIO) {
        view = 'side';
    } else if (ay >= ax) {
        view = dy >= 0 ? 'front' : 'back';
    }

    // 侧面原画统一朝右；向左时才镜像。前/背面不镜像，避免武器换手。
    const mirror: 1 | -1 = view === 'side' && dx < 0 ? -1 : 1;
    return { view, mirror };
}

/**
 * 转身的前半段收窄轮廓，在最窄点切方向帧，后半段恢复宽度。这样不会把
 * 正面立绘直接硬切成背面，也不会像绕Z轴旋转一张纸片。
 */
export function updateDirectionalFacing(
    state: DirectionalFacingState,
    dx: number,
    dy: number,
    dt: number,
): DirectionalFacingPose {
    // 鼠标恰好落在角色中心（或敌人与玩家重叠）时保持最后朝向，不能把左侧
    // 视图无条件弹回右侧；技能和碰撞逻辑不依赖这里的视觉状态。
    const directionMissing = Math.abs(dx) + Math.abs(dy) < 0.0001 && state.initialized;
    const desired = directionMissing
        ? { view: state.targetView, mirror: state.targetMirror }
        : resolveFacingView(dx, dy, state.targetView);
    if (!state.initialized) {
        state.initialized = true;
        state.view = desired.view;
        state.mirror = desired.mirror;
        state.targetView = desired.view;
        state.targetMirror = desired.mirror;
        state.turnProgress = 1;
    } else if (desired.view !== state.targetView || desired.mirror !== state.targetMirror) {
        state.targetView = desired.view;
        state.targetMirror = desired.mirror;
        state.turnProgress = 0;
    }

    if (state.turnProgress < 1) {
        state.turnProgress = Math.min(1, state.turnProgress + Math.max(0, Math.min(dt, 0.1)) / TURN_SECONDS);
        if (state.turnProgress >= 0.5) {
            state.view = state.targetView;
            state.mirror = state.targetMirror;
        }
    }

    const turning = state.turnProgress < 1;
    const pinch = turning ? Math.sin(state.turnProgress * Math.PI) : 0;
    const sideSign = state.targetMirror < 0 ? -1 : 1;
    return {
        view: state.view,
        mirror: state.mirror,
        turnScaleX: 1 - pinch * 0.25,
        turnLeanDeg: pinch * 1.8 * sideSign,
        turning,
    };
}

export function directionalArtKey(baseKey: string, view: FacingView, frameIndex: 0 | 1): string {
    if (view === 'front') return frameIndex === 1 ? `${baseKey}_move` : baseKey;
    return `${baseKey}_${view}${frameIndex === 1 ? '_move' : ''}`;
}

/** 一个单位完整的静止/动作 × 前/侧/背资源集合，用于出生时一次预热。 */
export function directionalArtKeys(baseKey: string): string[] {
    return [
        baseKey,
        `${baseKey}_move`,
        `${baseKey}_side`,
        `${baseKey}_side_move`,
        `${baseKey}_back`,
        `${baseKey}_back_move`,
    ];
}
