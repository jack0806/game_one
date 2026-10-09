// ============================================================
//  ArenaGeometry.ts — 无引擎依赖的角色、弹体、出生几何规则
// ============================================================
import { CANVAS_W, PLAYFIELD_BOTTOM } from './Constants';
import { ARENA_ART_FOOT_CLEARANCE, ARENA_ART_SIDE_TOP, ARENA_ART_SOLID_TOP, ArenaLayout, ArenaObstacle, ArenaSolid,
    arenaWithObstacles, obstacleCandidatesForChapter } from '../data/ChapterArenaDB';
import { ARENA_COLLISION_MASKS } from '../data/ArenaCollisionMasks';

export interface ArenaPoint { x: number; y: number }

/** 玩家脚底比圆形碰撞半径低约 19px，另留 1px 防止渲染采样压线。 */
const PLAYER_FOOT_OVERHANG = 20;
const PLAYER_COLLISION_RADIUS = 16;
const solidCache = new WeakMap<ArenaLayout, readonly ArenaSolid[]>();
const maskRowCache = new Map<string, readonly number[]>();

function arenaSolids(arena: ArenaLayout): readonly ArenaSolid[] {
    let solids = solidCache.get(arena);
    if (!solids) {
        const sideSolids: ArenaSolid[] = [];
        for (const prop of arena.obstacles) {
            if (ARENA_COLLISION_MASKS[prop.artKey]) continue;
            const commonTop = ARENA_ART_SIDE_TOP[prop.artKey];
            if (!commonTop && !prop.sideTop) continue;
            const sideTop = { ...commonTop, ...prop.sideTop };
            // 主矩形加玩家半径仍够不到贴图外沿时，仅补落地的侧角；直接加宽
            // 整个主矩形会把侧角上方的空地也封死。
            const sideReach = (prop.visualW - prop.w) / 2;
            const width = sideReach - PLAYER_COLLISION_RADIUS + 1;
            if (width <= 0) continue;
            const bottom = prop.y + prop.h / 2;
            for (const side of ['left', 'right'] as const) {
                const fraction = sideTop[side];
                if (fraction === undefined) continue;
                const top = prop.y - prop.visualH / 2 + fraction * prop.visualH;
                const innerX = prop.x + (side === 'left' ? -prop.w / 2 : prop.w / 2);
                sideSolids.push({
                    id: `${prop.id}-${side}-rim`,
                    x: innerX + (side === 'left' ? -width / 2 : width / 2),
                    y: (top + bottom) / 2,
                    w: width,
                    h: bottom - top,
                    blocksBullets: prop.blocksBullets,
                    maxActorRadius: prop.sideMaxRadius?.[side] ?? sideReach,
                });
            }
        }
        solids = [...arena.obstacles, ...(arena.boundaries ?? []), ...sideSolids];
        solidCache.set(arena, solids);
    }
    return solids;
}

function topOf(solid: ArenaSolid, actor: boolean): number {
    const physicalTop = solid.y - solid.h / 2;
    if (!actor) return physicalTop;
    const prop = solid as ArenaObstacle;
    // 背景建筑没有独立透明贴图，但角色脚底同样低于圆形碰撞中心。
    if (!prop.artKey) return physicalTop - PLAYER_FOOT_OVERHANG;
    const fraction = ARENA_ART_SOLID_TOP[prop.artKey];
    if (fraction === undefined) return physicalTop - 22;
    const visualTop = solid.y - prop.visualH / 2 + fraction * prop.visualH;
    return Math.min(physicalTop, visualTop - PLAYER_FOOT_OVERHANG - (ARENA_ART_FOOT_CLEARANCE[prop.artKey] ?? 0));
}

function clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/** 角色逻辑半径用于彼此接触；贴地图时只用脚底接地宽度。 */
function mapRadius(radius: number, actor: boolean): number {
    return actor ? radius * 0.68 : radius;
}

function overlapsOutline(x: number, y: number, radius: number, vertices: readonly [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const [ax, ay] = vertices[j], [bx, by] = vertices[i];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
        const vx = bx - ax, vy = by - ay;
        const t = clampValue(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
        const dx = x - ax - vx * t, dy = y - ay - vy * t;
        if (dx * dx + dy * dy < radius * radius) return true;
    }
    return inside;
}

/** 按 Sprite.trim 后的可见像素格判定，角色中心下移到脚底；不再填满透明角。 */
function overlapsArtMask(x: number, y: number, radius: number, prop: ArenaObstacle, actor: boolean): boolean {
    radius = mapRadius(radius, actor);
    let rows = maskRowCache.get(prop.artKey);
    if (!rows) {
        rows = ARENA_COLLISION_MASKS[prop.artKey].map(row => parseInt(row, 16));
        maskRowCache.set(prop.artKey, rows);
    }
    const left = prop.x - prop.visualW / 2;
    const top = prop.y - prop.visualH / 2;
    const cx = x - left;
    const cy = y + (actor ? PLAYER_FOOT_OVERHANG : 0) - top;
    const cellW = prop.visualW / 32;
    const cellH = prop.visualH / 16;
    const firstX = Math.max(0, Math.floor((cx - radius) / cellW));
    const lastX = Math.min(31, Math.floor((cx + radius) / cellW));
    const firstY = Math.max(0, Math.floor((cy - radius) / cellH));
    const lastY = Math.min(15, Math.floor((cy + radius) / cellH));
    if (firstX > lastX || firstY > lastY) return false;
    for (let row = firstY; row <= lastY; row++) {
        const bits = rows[row];
        for (let column = firstX; column <= lastX; column++) {
            if (!(bits & (1 << column))) continue;
            const dx = cx - clampValue(cx, column * cellW, (column + 1) * cellW);
            const dy = cy - clampValue(cy, row * cellH, (row + 1) * cellH);
            if (dx * dx + dy * dy < radius * radius || (radius === 0 && dx === 0 && dy === 0)) return true;
        }
    }
    return false;
}

/** 角色用圆形碰撞体；斜向路障在自身局部坐标里求最近点。 */
function overlapsSolid(x: number, y: number, radius: number, obstacle: ArenaSolid, actor: boolean): boolean {
    if (actor && obstacle.blocksActors === false) return false;
    if (obstacle.maxActorRadius !== undefined && radius >= obstacle.maxActorRadius) return false;
    const prop = obstacle as ArenaObstacle;
    if (prop.artKey && ARENA_COLLISION_MASKS[prop.artKey]) return overlapsArtMask(x, y, radius, prop, actor);
    if (obstacle.vertices) return overlapsOutline(x, y + (actor ? PLAYER_FOOT_OVERHANG : 0),
        mapRadius(radius, actor), obstacle.vertices);
    const angle = (obstacle.angleDeg ?? 0) * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const offsetX = x - obstacle.x, offsetY = y - obstacle.y;
    const localX = offsetX * cos + offsetY * sin;
    const localY = -offsetX * sin + offsetY * cos;
    const nearestX = clampValue(localX, -obstacle.w / 2, obstacle.w / 2);
    const nearestY = clampValue(localY, topOf(obstacle, actor) - obstacle.y, obstacle.h / 2);
    const dx = localX - nearestX, dy = localY - nearestY;
    return dx * dx + dy * dy < radius * radius;
}

export function overlapsObstacle(x: number, y: number, radius: number, obstacle: ArenaSolid): boolean {
    return overlapsSolid(x, y, radius, obstacle, true);
}

function solidBounds(obstacle: ArenaSolid, actor: boolean, radius: number) {
    if (obstacle.vertices) {
        radius = mapRadius(radius, actor);
        const xs = obstacle.vertices.map(point => point[0]);
        const ys = obstacle.vertices.map(point => point[1]);
        const footOffset = actor ? PLAYER_FOOT_OVERHANG : 0;
        return { left: Math.min(...xs) - radius, right: Math.max(...xs) + radius,
            top: Math.min(...ys) - footOffset - radius,
            bottom: Math.max(...ys) - footOffset + radius };
    }
    const prop = obstacle as ArenaObstacle;
    if (prop.artKey && ARENA_COLLISION_MASKS[prop.artKey]) {
        radius = mapRadius(radius, actor);
        const footOffset = actor ? PLAYER_FOOT_OVERHANG : 0;
        return { left: prop.x - prop.visualW / 2 - radius, right: prop.x + prop.visualW / 2 + radius,
            top: prop.y - prop.visualH / 2 - footOffset - radius,
            bottom: prop.y + prop.visualH / 2 - footOffset + radius };
    }
    const angle = (obstacle.angleDeg ?? 0) * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const top = topOf(obstacle, actor) - obstacle.y;
    const bottom = obstacle.h / 2;
    const xs = [-obstacle.w / 2, obstacle.w / 2];
    const ys = [top, bottom];
    let left = Infinity, right = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const lx of xs) for (const ly of ys) {
        const wx = obstacle.x + lx * cos - ly * sin;
        const wy = obstacle.y + lx * sin + ly * cos;
        left = Math.min(left, wx); right = Math.max(right, wx);
        minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
    }
    return { left: left - radius, right: right + radius,
        top: minY - radius, bottom: maxY + radius };
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

/** 冲刺沿原方向扫掠，碰到第一处实心物立即停下，不会侧滑绕过建筑。 */
export function dashInArena(arena: ArenaLayout, x: number, y: number, dx: number, dy: number, radius: number): ArenaPoint {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
    let px = x, py = y;
    for (let i = 1; i <= steps; i++) {
        const nx = x + dx * i / steps;
        const ny = y + dy * i / steps;
        if (!isArenaFree(arena, nx, ny, radius)) break;
        px = nx; py = ny;
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

/** 检查大体型与普通角色的可走网格，避免随机残骸与背景建筑围出孤岛。 */
export function arenaIsConnected(arena: ArenaLayout, radius: number): boolean {
    const step = 16;
    const columns = Math.floor((CANVAS_W - radius * 2) / step) + 1;
    const rows = Math.floor((PLAYFIELD_BOTTOM - radius * 2) / step) + 1;
    const free = new Uint8Array(columns * rows);
    let total = 0, start = -1, nearest = Infinity;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const x = radius + column * step, y = radius + row * step;
        if (!isArenaFree(arena, x, y, radius)) continue;
        const index = row * columns + column;
        free[index] = 1; total++;
        const distance = Math.hypot(x - CANVAS_W / 2, y - PLAYFIELD_BOTTOM / 2);
        if (distance < nearest) { nearest = distance; start = index; }
    }
    if (start < 0) return false;
    const queue = [start];
    free[start] = 0;
    for (let head = 0; head < queue.length; head++) {
        const index = queue[head];
        const column = index % columns, row = Math.floor(index / columns);
        for (const next of [column > 0 ? index - 1 : -1, column + 1 < columns ? index + 1 : -1,
            row > 0 ? index - columns : -1, row + 1 < rows ? index + columns : -1]) {
            if (next < 0 || !free[next]) continue;
            free[next] = 0; queue.push(next);
        }
        // 斜向空隙可能刚好没有水平/竖直采样点；只在连线中点可通行时连接。
        for (const dc of [-1, 1]) for (const dr of [-1, 1]) {
            const nc = column + dc, nr = row + dr;
            if (nc < 0 || nc >= columns || nr < 0 || nr >= rows) continue;
            const next = nr * columns + nc;
            if (!free[next]) continue;
            const x = radius + (column + dc / 2) * step;
            const y = radius + (row + dr / 2) * step;
            if (!isArenaFree(arena, x, y, radius)) continue;
            free[next] = 0; queue.push(next);
        }
    }
    return queue.length === total;
}

/** 每次进图无放回抽三处；先排除边缘建筑、Boss 出生区和彼此贴图重叠。 */
export function randomArenaForChapter(chapter: number, randomInt: (min: number, max: number) => number): ArenaLayout {
    const pool = [...obstacleCandidatesForChapter(chapter)];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = randomInt(0, i);
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const edges = arenaWithObstacles(chapter, []);
    const chosen: ArenaObstacle[] = [];
    const fitsEdges = (prop: ArenaObstacle) => {
        for (const sx of [-0.5, 0, 0.5]) for (const sy of [-0.5, 0, 0.5]) {
            if (!isArenaFree(edges, prop.x + sx * prop.w, prop.y + sy * prop.h, 18)) return false;
        }
        return isArenaFree(arenaWithObstacles(chapter, [prop]), 640, 360, 70);
    };
    const valid = pool.filter(fitsEdges);
    for (const margin of [26, 8, 0]) {
        for (const prop of valid) {
            if (chosen.indexOf(prop) >= 0) continue;
            if (chosen.some(other => Math.abs(prop.x - other.x) < (prop.visualW + other.visualW) / 2 + margin
                && Math.abs(prop.y - other.y) < (prop.visualH + other.visualH) / 2 + margin)) continue;
            const nextArena = arenaWithObstacles(chapter, [...chosen, prop]);
            if (!arenaIsConnected(nextArena, 70) || !arenaIsConnected(nextArena, 18)) continue;
            chosen.push(prop);
            if (chosen.length === 3) return arenaWithObstacles(chapter, chosen);
        }
    }
    return arenaWithObstacles(chapter, chosen);
}

/** 线段扫掠：返回第一个高大残骸命中，快弹不会穿过薄墙。 */
function firstSegmentHit(arena: ArenaLayout, ax: number, ay: number, bx: number, by: number, radius: number, bulletOnly: boolean): ArenaSolid | undefined {
    let first: ArenaSolid | undefined;
    let nearest = Infinity;
    const dx = bx - ax, dy = by - ay;
    for (const obstacle of arenaSolids(arena)) {
        if (bulletOnly && !obstacle.blocksBullets) continue;
        if (!bulletOnly && obstacle.maxActorRadius !== undefined && radius >= obstacle.maxActorRadius) continue;
        const { left, right, top, bottom } = solidBounds(obstacle, !bulletOnly, radius);
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
        let hitAt = enter;
        if (!bulletOnly || obstacle.angleDeg || obstacle.vertices || (obstacle as ArenaObstacle).artKey) {
            // 扩大的矩形在圆角处会误判，导致追击者在相邻残骸之间振荡。
            const sampleCount = Math.max(1, Math.ceil(Math.hypot(dx, dy) * (exit - enter) / 4));
            let circleHit = false;
            for (let i = 0; i <= sampleCount; i++) {
                const t = enter + (exit - enter) * i / sampleCount;
                if (overlapsSolid(ax + dx * t, ay + dy * t, radius, obstacle, !bulletOnly)) {
                    circleHit = true;
                    hitAt = t;
                    break;
                }
            }
            if (!circleHit) continue;
        }
        if (hitAt >= nearest) continue;
        nearest = hitAt;
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

interface SteerGrid {
    columns: number;
    rows: number;
    radius: number;
    free: Uint8Array;
    distances: Int16Array;
    targetIndex: number;
}

const steerGridCache = new WeakMap<ArenaLayout, Map<number, SteerGrid>>();
const STEER_STEP = 16;

function steerGrid(arena: ArenaLayout, radius: number): SteerGrid {
    let byRadius = steerGridCache.get(arena);
    if (!byRadius) { byRadius = new Map(); steerGridCache.set(arena, byRadius); }
    let grid = byRadius.get(radius);
    if (grid) return grid;
    const columns = Math.floor((CANVAS_W - radius * 2) / STEER_STEP) + 1;
    const rows = Math.floor((PLAYFIELD_BOTTOM - radius * 2) / STEER_STEP) + 1;
    const free = new Uint8Array(columns * rows);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        free[row * columns + column] = isArenaFree(arena, radius + column * STEER_STEP,
            radius + row * STEER_STEP, radius) ? 1 : 0;
    }
    grid = { columns, rows, radius, free, distances: new Int16Array(free.length), targetIndex: -1 };
    byRadius.set(radius, grid);
    return grid;
}

function steerNeighbors(arena: ArenaLayout, grid: SteerGrid, index: number): number[] {
    const column = index % grid.columns, row = Math.floor(index / grid.columns);
    const result: number[] = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = column + dc, nr = row + dr;
        if (nc < 0 || nc >= grid.columns || nr < 0 || nr >= grid.rows) continue;
        const next = nr * grid.columns + nc;
        if (!grid.free[next]) continue;
        if (dc && dr && !isArenaFree(arena, grid.radius + (column + dc / 2) * STEER_STEP,
            grid.radius + (row + dr / 2) * STEER_STEP, grid.radius)) continue;
        result.push(next);
    }
    return result;
}

function steerGridPoint(grid: SteerGrid, index: number): ArenaPoint {
    return { x: grid.radius + index % grid.columns * STEER_STEP,
        y: grid.radius + Math.floor(index / grid.columns) * STEER_STEP };
}

/** 建筑与残骸形成复合拐角时，用共享距离场寻找能实际走通的下一段。 */
function gridSteerTarget(arena: ArenaLayout, from: ArenaPoint, to: ArenaPoint, radius: number): ArenaPoint | undefined {
    const grid = steerGrid(arena, radius);
    const nearest = (point: ArenaPoint, reachable: boolean): number => {
        const column = Math.round((point.x - radius) / STEER_STEP);
        const row = Math.round((point.y - radius) / STEER_STEP);
        let best = -1, bestDistance = Infinity;
        for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
            const nc = column + dc, nr = row + dr;
            if (nc < 0 || nc >= grid.columns || nr < 0 || nr >= grid.rows) continue;
            const index = nr * grid.columns + nc;
            if (!grid.free[index] || (reachable && grid.distances[index] < 0)) continue;
            const candidate = steerGridPoint(grid, index);
            const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
            if (distance >= bestDistance || firstSegmentHit(arena, point.x, point.y,
                candidate.x, candidate.y, radius, false)) continue;
            best = index; bestDistance = distance;
        }
        return best;
    };
    const targetIndex = nearest(to, false);
    if (targetIndex < 0) return undefined;
    if (grid.targetIndex !== targetIndex) {
        grid.distances.fill(-1);
        grid.targetIndex = targetIndex;
        grid.distances[targetIndex] = 0;
        const queue = [targetIndex];
        for (let head = 0; head < queue.length; head++) {
            const index = queue[head];
            for (const next of steerNeighbors(arena, grid, index)) {
                if (grid.distances[next] >= 0) continue;
                grid.distances[next] = grid.distances[index] + 1;
                queue.push(next);
            }
        }
    }
    let index = nearest(from, true);
    if (index < 0) return undefined;
    let waypoint = steerGridPoint(grid, index);
    for (let i = 0; i < 8; i++) {
        const next = steerNeighbors(arena, grid, index)
            .filter(candidate => grid.distances[candidate] >= 0 && grid.distances[candidate] < grid.distances[index])
            .sort((a, b) => grid.distances[a] - grid.distances[b])[0];
        if (next === undefined) break;
        const candidate = steerGridPoint(grid, next);
        if (firstSegmentHit(arena, from.x, from.y, candidate.x, candidate.y, radius, false)) break;
        waypoint = candidate;
        index = next;
    }
    return waypoint;
}

/** 小规模残骸采用局部角点绕行，计算量与障碍数成正比。 */
export function arenaSteerTarget(arena: ArenaLayout, from: ArenaPoint, to: ArenaPoint, radius: number): ArenaPoint {
    const blocker = firstSegmentHit(arena, from.x, from.y, to.x, to.y, radius, false);
    if (!blocker) return to;
    const gridRoute = gridSteerTarget(arena, from, to, radius);
    if (gridRoute) return gridRoute;
    const alongX = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    const forward = Math.sign(alongX ? to.x - from.x : to.y - from.y);
    const bounds = solidBounds(blocker, true, 0);
    const alreadyAbove = from.y <= bounds.top - radius + 2;
    const alreadyBelow = from.y >= bounds.bottom + radius - 2;
    // 常规留 18px 稳定绕行；被相邻建筑夹住时缩到 6px 再找合法角点。
    for (const extra of [18, 6]) {
        const gap = radius + extra;
        const left = bounds.left - gap;
        const right = bounds.right + gap;
        const top = bounds.top - gap;
        const bottom = bounds.bottom + gap;
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
            // 起点到角点可达仍可能是死胡同（残骸背后紧贴边界建筑）。
            // 至少还要能经另一角点离开同一残骸，否则不把敌人引进去。
            const exit = corners.some(next => next !== corner && isArenaFree(arena, next.x, next.y, radius)
                && !firstSegmentHit(arena, corner.x, corner.y, next.x, next.y, radius, false)
                && !firstSegmentHit(arena, next.x, next.y, to.x, to.y, radius, false));
            const direct = !firstSegmentHit(arena, corner.x, corner.y, to.x, to.y, radius, false);
            if (!direct && !exit) continue;
            const length = Math.hypot(corner.x - from.x, corner.y - from.y) + Math.hypot(to.x - corner.x, to.y - corner.y);
            if (length < cost) { best = corner; cost = length; }
        }
        if (best) return best;
    }
    return gridSteerTarget(arena, from, to, radius) ?? to;
}
