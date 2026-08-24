// ============================================================
//  Locomotion.ts — 与逻辑坐标解耦的距离驱动换帧状态
// ============================================================

export type LocomotionKind = 'biped' | 'heavy' | 'skitter' | 'quadruped' | 'hover';

export interface LocomotionState {
    initialized: boolean;
    lastX: number;
    lastY: number;
    phase: number;
    motion: number;
    facingX: number;
    facingY: number;
    seed: number;
}

export interface LocomotionPose {
    kind: LocomotionKind;
    moving: boolean;
    motion: number;
    phase: number;
    directionX: number;
    directionY: number;
    /** 0=静止/落脚帧，1=另一动作帧；停住时必须回到0。 */
    frameIndex: 0 | 1;
    footSwing: number;
    footLiftLeft: number;
    footLiftRight: number;
    bodyLift: number;
    bodyRollDeg: number;
    stride: number;
}

interface LocomotionProfile {
    cycleDistance: number;
    maxCyclesPerSecond: number;
    stride: number;
    bodyLift: number;
    bodyRollDeg: number;
}

const PROFILES: Record<LocomotionKind, LocomotionProfile> = {
    biped:     { cycleDistance: 0.62, maxCyclesPerSecond: 3.6, stride: 0.090, bodyLift: 0.018, bodyRollDeg: 1.15 },
    heavy:     { cycleDistance: 0.78, maxCyclesPerSecond: 2.4, stride: 0.080, bodyLift: 0.014, bodyRollDeg: 0.72 },
    skitter:   { cycleDistance: 0.42, maxCyclesPerSecond: 5.5, stride: 0.120, bodyLift: 0.012, bodyRollDeg: 0.45 },
    quadruped: { cycleDistance: 0.72, maxCyclesPerSecond: 3.2, stride: 0.095, bodyLift: 0.013, bodyRollDeg: 0.55 },
    hover:     { cycleDistance: 0.90, maxCyclesPerSecond: 3.0, stride: 0.060, bodyLift: 0.020, bodyRollDeg: 0.38 },
};

const TAU = Math.PI * 2;

export function createLocomotionState(seed = 0): LocomotionState {
    return {
        initialized: false,
        lastX: 0,
        lastY: 0,
        phase: ((seed % TAU) + TAU) % TAU,
        motion: 0,
        facingX: 1,
        facingY: 0,
        seed,
    };
}

export function resetLocomotion(state: LocomotionState, x?: number, y?: number): void {
    state.initialized = x !== undefined && y !== undefined;
    state.lastX = x ?? 0;
    state.lastY = y ?? 0;
    state.phase = ((state.seed % TAU) + TAU) % TAU;
    state.motion = 0;
    state.facingX = 1;
    state.facingY = 0;
}

/**
 * 根据实际位移推进步态。距离而非时间驱动相位，因此减速、冻结、击退和 Boss
 * 冲锋都会自然改变落脚频率；超大位移视为传送，不会让腿在一帧内疯狂旋转。
 */
export function advanceLocomotion(
    state: LocomotionState,
    x: number,
    y: number,
    dt: number,
    visualSize: number,
    kind: LocomotionKind,
): LocomotionPose {
    const safeSize = Math.max(1, visualSize);
    const safeDt = Math.max(0, Math.min(dt, 0.1));

    if (!state.initialized) {
        state.initialized = true;
        state.lastX = x;
        state.lastY = y;
        // 相同批次的怪物也应错开落脚，避免整群像阅兵一样完全同步。
        state.phase = (state.phase + Math.abs(x * 0.013 + y * 0.017)) % TAU;
    }

    const dx = x - state.lastX;
    const dy = y - state.lastY;
    const rawDistance = Math.hypot(dx, dy);
    state.lastX = x;
    state.lastY = y;

    const teleportThreshold = safeSize * 1.8;
    const distance = rawDistance > teleportThreshold ? 0 : rawDistance;
    const movingNow = distance > 0.015;

    if (movingNow) {
        const len = rawDistance || 1;
        state.facingX = dx / len;
        state.facingY = dy / len;
        const profile = PROFILES[kind];
        const distancePhase = distance / (safeSize * profile.cycleDistance) * TAU;
        const maxPhase = safeDt * profile.maxCyclesPerSecond * TAU;
        state.phase = (state.phase + Math.min(distancePhase, maxPhase)) % TAU;
    }

    // 起步要干脆，停步稍柔和；指数阻尼使不同帧率得到接近一致的结果。
    const targetMotion = movingNow ? 1 : 0;
    const response = targetMotion > state.motion ? 18 : 11;
    const blend = safeDt > 0 ? 1 - Math.exp(-response * safeDt) : 0;
    state.motion += (targetMotion - state.motion) * blend;
    if (!movingNow && state.motion < 0.002) state.motion = 0;

    const profile = PROFILES[kind];
    const swing = Math.sin(state.phase) * state.motion;
    const impact = Math.abs(Math.sin(state.phase * 2)) * state.motion;
    return {
        kind,
        moving: movingNow || state.motion > 0.08,
        motion: state.motion,
        phase: state.phase,
        directionX: state.facingX,
        directionY: state.facingY,
        frameIndex: movingNow && Math.sin(state.phase) >= 0 ? 1 : 0,
        footSwing: swing,
        footLiftLeft: Math.max(0, swing),
        footLiftRight: Math.max(0, -swing),
        bodyLift: impact * safeSize * profile.bodyLift,
        bodyRollDeg: swing * profile.bodyRollDeg,
        stride: safeSize * profile.stride,
    };
}
