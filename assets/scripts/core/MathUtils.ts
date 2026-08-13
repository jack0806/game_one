// ============================================================
//  MathUtils.ts — 向量/随机/颜色工具（与原 utils.js 接口对齐）
// ============================================================

// ── 向量工具 ───────────────────────────────────────────────
export const Vec = {
    dist(ax: number, ay: number, bx: number, by: number): number {
        const dx = ax - bx, dy = ay - by;
        return Math.sqrt(dx * dx + dy * dy);
    },
    dist2(ax: number, ay: number, bx: number, by: number): number {
        const dx = ax - bx, dy = ay - by;
        return dx * dx + dy * dy;
    },
    normalize(dx: number, dy: number): [number, number] {
        const l = Math.sqrt(dx * dx + dy * dy);
        return l > 0 ? [dx / l, dy / l] : [0, 0];
    },
    angle(ax: number, ay: number, bx: number, by: number): number {
        return Math.atan2(by - ay, bx - ax);
    },
    lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    },
};

// ── 随机工具 ───────────────────────────────────────────────
export const Rng = {
    float(min: number, max: number): number {
        return min + Math.random() * (max - min);
    },
    int(min: number, max: number): number {
        return Math.floor(min + Math.random() * (max - min + 1));
    },
    pick<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
    },
    chance(p: number): boolean {
        return Math.random() < p;
    },
    /** 加权随机：weights=[30,60,10] → 返回下标 */
    weighted(weights: number[]): number {
        const sum = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * sum;
        for (let i = 0; i < weights.length; i++) {
            r -= weights[i];
            if (r <= 0) return i;
        }
        return weights.length - 1;
    },
};

// ── 颜色工具 ───────────────────────────────────────────────
export const Color = {
    rarityColor(rarity: string): string {
        return ({ blue: '#4488ff', purple: '#aa44ff', orange: '#ff8800', gold: '#ffd700' } as Record<string, string>)[rarity] || '#aaa';
    },
    rarityLabel(rarity: string): string {
        return ({ blue: '蓝色', purple: '紫色', orange: '橙色', gold: '金色' } as Record<string, string>)[rarity] || '';
    },
    alpha(hex: string, a: number): string {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${a})`;
    },
    hexToRgb(hex: string): { r: number; g: number; b: number } {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16),
        };
    },
};

// ── 通用 clamp ─────────────────────────────────────────────
export function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}
