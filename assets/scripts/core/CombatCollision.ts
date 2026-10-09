/** 英雄与实体敌人的身体分离。伤害半径保持不变，离地首领暂不阻挡。 */
export interface CombatBody { x: number; y: number; radius: number; alive?: boolean; dead?: boolean; isBoss?: boolean; mechSkyT?: number }
export function contactDistance(a: CombatBody, b: CombatBody): number {
    return a.radius + b.radius * (b.isBoss ? 1.15 : 1) + 3;
}
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
