/** 英雄与实体敌人的身体分离。伤害半径保持不变，离地首领暂不阻挡。 */
export interface CombatBody { x: number; y: number; radius: number; alive?: boolean; dead?: boolean; isBoss?: boolean; mechSkyT?: number }
export function contactDistance(a: CombatBody, b: CombatBody): number {
    return a.radius * (a.isBoss ? 1.15 : 1) + b.radius * (b.isBoss ? 1.15 : 1) + 3;
}
export type BodyMove = (x: number, y: number, dx: number, dy: number, radius: number) => { x: number; y: number };

function blocks(body: CombatBody): boolean {
    return body.alive !== false && !body.dead && (body.mechSkyT ?? 0) <= 0;
}

/** 扫掠本次位移，在首次接触处截断向内分量；只改变移动者，不给障碍单位施加推力。 */
export function moveCombatBody(body: CombatBody, dx: number, dy: number,
    obstacles: CombatBody[], move: BodyMove): { x: number; y: number } {
    if (!blocks(body)) return move(body.x, body.y, dx, dy, body.radius);
    let x = body.x, y = body.y;
    const travel = Math.hypot(dx, dy);
    const nearby = obstacles.filter(other => {
        if (other === body || !blocks(other)) return false;
        const reach = contactDistance(body, other) + travel + 1;
        return Math.abs(other.x - x) <= reach && Math.abs(other.y - y) <= reach;
    });
    if (!nearby.length) return move(x, y, dx, dy, body.radius);
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
    for (let step = 0; step < steps; step++) {
        let vx = dx / steps, vy = dy / steps;
        for (let slide = 0; slide < 4; slide++) {
            // 地形先给出可行方向；身体滑动后再次检查地形，避免墙角滑入残骸。
            const terrain = move(x, y, vx, vy, body.radius);
            vx = terrain.x - x; vy = terrain.y - y;
            const length2 = vx * vx + vy * vy;
            if (length2 < 1e-10) break;
            let time = 1, hit: CombatBody | undefined;
            for (const other of nearby) {
                const ox = x - other.x, oy = y - other.y;
                const dot = ox * vx + oy * vy;
                if (dot >= 0) continue; // 已经离开接触面，可以自由后退或侧移。
                const radius = contactDistance(body, other);
                const c = ox * ox + oy * oy - radius * radius;
                const discriminant = dot * dot - length2 * c;
                if (discriminant < 0) continue;
                const t = c <= 0 ? 0 : (-dot - Math.sqrt(discriminant)) / length2;
                if (t >= 0 && t < time) { time = t; hit = other; }
            }
            if (!hit) { x += vx; y += vy; break; }
            const advance = Math.max(0, time - 0.001 / Math.sqrt(length2));
            const safe = move(x, y, vx * advance, vy * advance, body.radius);
            x = safe.x; y = safe.y;
            const length = Math.hypot(x - hit.x, y - hit.y) || 1;
            const nx = (x - hit.x) / length, ny = (y - hit.y) / length;
            vx *= 1 - time; vy *= 1 - time;
            const inward = Math.min(0, vx * nx + vy * ny);
            vx -= nx * inward; vy -= ny * inward;
        }
    }
    return { x, y };
}

/** 近身敌群占位；被前排挡住时尝试沿两侧寻找空位，不推动前排或英雄。 */
export function moveEnemyBody(enemy: CombatBody, player: CombatBody, neighbors: CombatBody[],
    dx: number, dy: number, move: BodyMove): { x: number; y: number } {
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    const obstacles = distance < 260 ? [player, ...neighbors] : [player];
    const direct = moveCombatBody(enemy, dx, dy, obstacles, move);
    const length = Math.hypot(dx, dy);
    if (length < 0.001 || distance <= contactDistance(enemy, player) + 2 ||
        dx * (player.x - enemy.x) + dy * (player.y - enemy.y) <= 0 ||
        Math.hypot(direct.x - enemy.x, direct.y - enemy.y) >= length * 0.65) return direct;
    let best = direct;
    const scorePoint = (point: { x: number; y: number }) => Math.hypot(point.x - player.x, point.y - player.y)
        - Math.hypot(point.x - enemy.x, point.y - enemy.y) * 0.45;
    let bestScore = scorePoint(direct);
    for (const angle of [0.65, -0.65, 1.15, -1.15]) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const candidate = moveCombatBody(enemy, dx * cos - dy * sin, dx * sin + dy * cos, obstacles, move);
        // 正对前排背部时，第一步侧绕会略微远离目标；允许这段必要的切向移动。
        const score = scorePoint(candidate);
        if (score < bestScore - 0.001) { best = candidate; bestScore = score; }
    }
    return best;
}

/** 仅处理出生、落地、瞬移等已重叠状态；普通走路必须先经 moveCombatBody。 */
export function separatePlayerBodies(player: CombatBody, enemies: CombatBody[],
    move: (x: number, y: number, dx: number, dy: number, radius: number) => { x: number; y: number }): void {
    if (player.alive === false) return;
    // 在墙角优先移动敌人；被地形挡住的剩余穿透量再推回玩家。
    for (let pass = 0; pass < 8; pass++) for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.alive === false || e.dead || (e.mechSkyT ?? 0) > 0) continue;
        let dx = e.x - player.x, dy = e.y - player.y;
        let distance = Math.hypot(dx, dy);
        const required = contactDistance(player, e);
        if (distance >= required - 0.01) continue;
        if (distance < 0.001) { const a = i * 2.399963; dx = Math.cos(a); dy = Math.sin(a); distance = 1; }
        const nx = dx / distance, ny = dy / distance;
        const overlap = required - Math.hypot(e.x - player.x, e.y - player.y);
        const next = move(e.x, e.y, nx * overlap, ny * overlap, e.radius);
        e.x = next.x; e.y = next.y;
        let remaining = required - Math.hypot(e.x - player.x, e.y - player.y);
        // 正后方被墙挡住时向侧面让位。只接受经过地形移动检查且真正分离的位置，
        // 避免多个敌人反复把英雄推回另一只敌人的身体里。
        if (remaining > 0.01) {
            const base = Math.atan2(ny, nx);
            for (const offset of [0.18, -0.18, 0.36, -0.36, 0.7, -0.7, 1.1, -1.1, 1.57, -1.57]) {
                const a = base + offset;
                const side = move(e.x, e.y, player.x + Math.cos(a) * (required + 0.05) - e.x,
                    player.y + Math.sin(a) * (required + 0.05) - e.y, e.radius);
                if (Math.hypot(side.x - player.x, side.y - player.y) >= required - 0.01) {
                    e.x = side.x; e.y = side.y; remaining = 0; break;
                }
            }
        }
        if (remaining > 0.01) {
            const safe = move(player.x, player.y, -nx * remaining, -ny * remaining, player.radius);
            player.x = safe.x; player.y = safe.y;
        }
    }
}
