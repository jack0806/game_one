// ============================================================
//  ArenaGeometry.ts — 无引擎依赖的角色、弹体、出生几何规则
// ============================================================
import { CANVAS_W, PLAYFIELD_BOTTOM } from './Constants';
import { ARENA_ART_SOLID_TOP, ArenaLayout, ArenaObstacle, ArenaSolid } from '../data/ChapterArenaDB';

export interface ArenaPoint { x: number; y: number }

/** 玩家脚底比圆形碰撞半径低约 19px，另留 1px 防止渲染采样压线。 */
const PLAYER_FOOT_OVERHANG = 20;
const solidCache = new WeakMap<ArenaLayout, readonly ArenaSolid[]>();

function arenaSolids(arena: ArenaLayout): readonly ArenaSolid[] {
    let solids = solidCache.get(arena);
    if (!solids) {
        solids = arena.boundaries?.length ? [...arena.obstacles, ...arena.boundaries] : arena.obstacles;
        solidCache.set(arena, solids);
    }
    return solids;
}

function topOf(solid: ArenaSolid, actor: boolean): number {
    const physicalTop = solid.y - solid.h / 2;
    if (!actor) return physicalTop;
    const prop = solid as ArenaObstacle;
    if (!prop.artKey) return physicalTop;
    const fraction = ARENA_ART_SOLID_TOP[prop.artKey];
    if (fraction === undefined) return physicalTop - 22;
    const visualTop = solid.y - prop.visualH / 2 + fraction * prop.visualH;
    return Math.min(physicalTop, visualTop - PLAYER_FOOT_OVERHANG);
}

function clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/** 角色用圆形碰撞体；残骸逻辑体为轴对齐矩形。 */
export function overlapsObstacle(x: number, y: number, radius: number, obstacle: ArenaSolid): boolean {
    const nearestX = clampValue(x, obstacle.x - obstacle.w / 2, obstacle.x + obstacle.w / 2);
    const nearestY = clampValue(y, topOf(obstacle, true), obstacle.y + obstacle.h / 2);
    const dx = x - nearestX, dy = y - nearestY;
    return dx * dx + dy * dy < radius * radius;
}

export function isArenaFree(arena: ArenaLayout, x: number, y: number, radius: number): boolean {
    if (x < radius || x > CANVAS_W - radius || y < radius || y > PLAYFIELD_BOTTOM - radius) return false;
    return !arenaSolids(arena).some(obstacle => overlapsObstacle(x, y, radius, obstacle));
}

/** 分步推进并分别尝试 X/Y，贴墙移动时自然沿墙滑动。 */
export function moveInArena(arena: ArenaLayout, x: number, y: number, dx: number, dy: number, radius: number): ArenaPoint {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 12));
    let px = x, py = y;
    for (let i = 0; i < steps; i++) {
        const nx = clampValue(px + dx / steps, radius, CANVAS_W - radius);
        const ny = clampValue(py + dy / steps, radius, PLAYFIELD_BOTTOM - radius);
        if (isArenaFree(arena, nx, ny, radius)) { px = nx; py = ny; continue; }
        if (isArenaFree(arena, nx, py, radius)) px = nx;
        if (isArenaFree(arena, px, ny, radius)) py = ny;
    }
    return { x: px, y: py };
}

/** 出生、瞬移、掉落和复活共用；按半径逐环寻找最近的合法点。 */
export function safeArenaPoint(arena: ArenaLayout, x: number, y: number, radius: number): ArenaPoint {
    const cx = clampValue(x, radius, CANVAS_W - radius);
    const cy = clampValue(y, radius, PLAYFIELD_BOTTOM - radius);
    if (isArenaFree(arena, cx, cy, radius)) return { x: cx, y: cy };
    for (let distance = 12; distance <= 320; distance += 12) {
        const count = Math.max(12, Math.ceil(distance * Math.PI / 12));
        for (let i = 0; i < count; i++) {
            const angle = i * Math.PI * 2 / count;
            const px = clampValue(cx + Math.cos(angle) * distance, radius, CANVAS_W - radius);
            const py = clampValue(cy + Math.sin(angle) * distance, radius, PLAYFIELD_BOTTOM - radius);
            if (isArenaFree(arena, px, py, radius)) return { x: px, y: py };
        }
    }
    return { x: CANVAS_W / 2, y: PLAYFIELD_BOTTOM / 2 };
}

/** 线段扫掠：返回第一个高大残骸命中，快弹不会穿过薄墙。 */
function firstSegmentHit(arena: ArenaLayout, ax: number, ay: number, bx: number, by: number, radius: number, bulletOnly: boolean): ArenaSolid | undefined {
    let first: ArenaSolid | undefined;
    let nearest = Infinity;
    const dx = bx - ax, dy = by - ay;
    for (const obstacle of arenaSolids(arena)) {
        if (bulletOnly && !obstacle.blocksBullets) continue;
        const left = obstacle.x - obstacle.w / 2 - radius;
        const right = obstacle.x + obstacle.w / 2 + radius;
        const top = topOf(obstacle, !bulletOnly) - radius;
        const bottom = obstacle.y + obstacle.h / 2 + radius;
        let enter = 0, exit = 1;
        if (Math.abs(dx) < 1e-8) { if (ax < left || ax > right) continue; }
        else {
            const a = (left - ax) / dx, b = (right - ax) / dx;
            enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
        }
        if (Math.abs(dy) < 1e-8) { if (ay < top || ay > bottom) continue; }
        else {
            const a = (top - ay) / dy, b = (bottom - ay) / dy;
            enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
        }
        if (enter > exit || enter >= nearest) continue;
        if (!bulletOnly) {
            // 扩大的矩形在圆角处会误判，导致追击者在相邻残骸之间振荡。
            const sampleCount = Math.max(1, Math.ceil(Math.hypot(dx, dy) * (exit - enter) / 4));
            let circleHit = false;
            for (let i = 0; i <= sampleCount; i++) {
                const t = enter + (exit - enter) * i / sampleCount;
                if (overlapsObstacle(ax + dx * t, ay + dy * t, radius, obstacle)) {
                    circleHit = true;
                    break;
                }
            }
            if (!circleHit) continue;
        }
        nearest = enter;
        first = obstacle;
    }
    return first;
}

export function firstArenaBulletHit(arena: ArenaLayout, ax: number, ay: number, bx: number, by: number, radius = 0): ArenaSolid | undefined {
    return firstSegmentHit(arena, ax, ay, bx, by, radius, true);
}

export function arenaLineClear(arena: ArenaLayout, ax: number, ay: number, bx: number, by: number): boolean {
    return !firstArenaBulletHit(arena, ax, ay, bx, by);
}

/** 小规模残骸采用局部角点绕行，计算量与障碍数成正比。 */
export function arenaSteerTarget(arena: ArenaLayout, from: ArenaPoint, to: ArenaPoint, radius: number): ArenaPoint {
    const blocker = firstSegmentHit(arena, from.x, from.y, to.x, to.y, radius, false);
    if (!blocker) return to;
    const alongX = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    const forward = Math.sign(alongX ? to.x - from.x : to.y - from.y);
    const alreadyAbove = from.y <= topOf(blocker, true) - radius + 2;
    const alreadyBelow = from.y >= blocker.y + blocker.h / 2 + radius - 2;
    // 常规留 18px 稳定绕行；被相邻建筑夹住时缩到 6px 再找合法角点。
    for (const extra of [18, 6]) {
        const gap = radius + extra;
        const left = blocker.x - blocker.w / 2 - gap;
        const right = blocker.x + blocker.w / 2 + gap;
        const top = topOf(blocker, true) - gap;
        const bottom = blocker.y + blocker.h / 2 + gap;
        const corners: ArenaPoint[] = [
            { x: left, y: top }, { x: right, y: top },
            { x: left, y: bottom }, { x: right, y: bottom },
            // 宽体单位挤在边缘建筑与残骸之间时，标准角点可能落进边缘建筑；
            // 先沿当前 X/Y 退到残骸侧边，再绕到另一侧。
            { x: from.x, y: top }, { x: from.x, y: bottom },
            { x: left, y: from.y }, { x: right, y: from.y },
        ];
        let best: ArenaPoint | undefined;
        let cost = Infinity;
        for (const corner of corners) {
            if (alreadyAbove && corner.y > blocker.y) continue;
            if (alreadyBelow && corner.y < blocker.y) continue;
            if (!isArenaFree(arena, corner.x, corner.y, radius)) continue;
            if (Math.hypot(corner.x - from.x, corner.y - from.y) < 10) continue;
            // 只选当前可直达且比当前位置更接近目标的角点，避免宽体单位在
            // 墙角来回选择前/后两个角点，贴着墙原地振荡。
            if (firstSegmentHit(arena, from.x, from.y, corner.x, corner.y, radius, false)) continue;
            const advance = (alongX ? corner.x - from.x : corner.y - from.y) * forward;
            if (advance < -2) continue;
            const length = Math.hypot(corner.x - from.x, corner.y - from.y) + Math.hypot(to.x - corner.x, to.y - corner.y);
            if (length < cost) { best = corner; cost = length; }
        }
        if (best) return best;
    }
    return to;
}
