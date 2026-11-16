import { clamp, Rng } from './MathUtils';

export const CARD_BREAK_TIME = 0.14;
export const CARD_FX_LIFE = 1.4;

export interface FlowDiamond {
    track: number;
    angle: number;
    originX: number;
    originY: number;
    size: number;
    spin: number;
    phase: number;
    delay: number;
    life: number;
}

/** 斜向的三条开放弧线共用轨迹，碎钻与星尘始终贴着流光运动。 */
export function diamondFlowPoint(track: number, angle: number, width: number, height: number) {
    const radius = width * (0.34 + track * 0.035);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * height * (0.085 + track * 0.012);
    return { x, y: height * 0.1 + y + x * 0.34 + (track - 1) * 25 };
}

/** 24 颗大小错落的实心切面碎钻；初始分布覆盖卡面，随后卷入弧形流光。 */
export function createDiamondFlow(width: number, height: number): FlowDiamond[] {
    const diamonds: FlowDiamond[] = [];
    for (let i = 0; i < 24; i++) {
        const track = i % 3;
        diamonds.push({ track, angle: i / 24 * Math.PI * 2 + Rng.float(-0.15, 0.15),
            originX: Rng.float(-width * 0.4, width * 0.4),
            originY: Rng.float(-height * 0.37, height * 0.42),
            size: i % 4 === 0 ? Rng.float(11, 15) : Rng.float(4.5, 9),
            spin: Rng.float(-1.2, 1.2), phase: Rng.float(0, Math.PI * 2),
            delay: Rng.float(0, 0.045), life: Rng.float(0.91, 1.15) });
    }
    return diamonds;
}

/** 解析采样不累计积分误差；三条轨道顺逆交错，避免整圈同步转动。 */
export function sampleFlowDiamond(diamond: FlowDiamond, time: number, width: number, height: number) {
    const t = Math.max(0, time - CARD_BREAK_TIME - diamond.delay);
    const progress = clamp(t / diamond.life, 0, 1);
    const direction = diamond.track === 1 ? -1 : 1;
    const angle = diamond.angle + direction * t * (2.2 + diamond.track * 0.28);
    const orbit = diamondFlowPoint(diamond.track, angle, width, height);
    const join = 1 - Math.pow(1 - clamp(t / 0.34, 0, 1), 3);
    const fade = 1 - clamp((progress - 0.57) / 0.43, 0, 1);
    return {
        x: diamond.originX + (orbit.x - diamond.originX) * join,
        y: diamond.originY + (orbit.y - diamond.originY) * join + progress * 12,
        rotation: diamond.phase * 0.35 + diamond.spin * t,
        size: diamond.size * (0.68 + Math.sin(Math.min(1, progress * 2) * Math.PI / 2) * 0.32)
            * (0.65 + fade * 0.35),
        squash: 0.65 + Math.abs(Math.cos(diamond.phase + t * 3)) * 0.35,
        glint: Math.pow(Math.max(0, Math.sin(t * 15 + diamond.phase)), 10),
        opacity: fade * fade,
        visible: time >= CARD_BREAK_TIME + diamond.delay && progress < 1,
    };
}

/** 每档独立的明暗切面，金卡全身金黄，银卡全身银白，彩卡多色折射。 */
export function diamondFacetColors(rarity: string): number[][] {
    if (rarity === 'gold') return [
        [255, 222, 102], [255, 246, 187], [224, 151, 34],
        [255, 192, 51], [255, 255, 234], [178, 106, 25],
    ];
    if (rarity === 'prismatic') return [
        [184, 164, 255], [218, 250, 255], [95, 214, 255],
        [245, 131, 232], [255, 244, 255], [136, 103, 236],
    ];
    return [
        [201, 221, 239], [240, 250, 255], [139, 168, 197],
        [181, 203, 225], [255, 255, 255], [104, 135, 164],
    ];
}
