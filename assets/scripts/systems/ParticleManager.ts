// ============================================================
//  ParticleManager.ts — 粒子特效管理器（纯逻辑，与渲染解耦）
// ============================================================
import { Rng } from '../core/MathUtils';

interface Particle {
    x: number; y: number;
    vx: number; vy: number;
    life: number; maxLife: number;
    size: number; color: string;
    fade: boolean; gravity: boolean; glow: boolean;
    type: 'dot' | 'ring' | 'line';
    // ring / line 专用
    radius?: number; maxRadius?: number;
    x2?: number; y2?: number;
    alpha?: number;
    lineWidth?: number;
}

/**
 * 一次性美术特效（贴图动画）请求 —— 纯数据，不含任何 cc.* 引用。
 * GameManager 每帧读取 spriteFx 数组，用一个固定大小的 Sprite 节点池按下标
 * 同步渲染（位置/缩放/淡出透明度），这里只负责生成事件与寿命衰减/清理。
 */
export interface SpriteFx {
    x: number; y: number;
    key:     string;   // art key，如 'fx_explosion'（会先经 ArtRemap 解析）
    life:    number;
    maxLife: number;
    scale:   number;
    color?:  string;   // 可选染色（hex 青色环在青色网格背景下会融化，按符文色染开）
}

export class ParticleManager {
    particles: Particle[] = [];
    spriteFx:  SpriteFx[] = [];

    /** 生成一个一次性美术特效（按 key 淡出消失）。 */
    spawnSpriteFx(x: number, y: number, key: string, life = 0.5, scale = 1, color?: string): void {
        this.spriteFx.push({ x, y, key, life, maxLife: life, scale, color });
    }

    // ── 通用发射 ─────────────────────────────────────────
    emit(cfg: {
        x: number; y: number; count?: number; color?: string;
        speedMin?: number; speedMax?: number;
        lifeMin?: number; lifeMax?: number;
        sizeMin?: number; sizeMax?: number;
        gravity?: boolean; fade?: boolean; glow?: boolean;
        angleMin?: number; angleMax?: number;
    }): void {
        const count = cfg.count ?? 8;
        for (let i = 0; i < count; i++) {
            const a     = Rng.float(cfg.angleMin ?? 0, cfg.angleMax ?? Math.PI * 2);
            const speed = Rng.float(cfg.speedMin ?? 50, cfg.speedMax ?? 200);
            this.particles.push({
                x: cfg.x, y: cfg.y,
                vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
                life: Rng.float(cfg.lifeMin ?? 0.3, cfg.lifeMax ?? 0.8),
                maxLife: Rng.float(cfg.lifeMin ?? 0.3, cfg.lifeMax ?? 0.8),
                size: Rng.float(cfg.sizeMin ?? 2, cfg.sizeMax ?? 5),
                color: cfg.color ?? '#fff', fade: cfg.fade ?? true,
                gravity: cfg.gravity ?? false, glow: cfg.glow ?? false,
                type: 'dot', alpha: 1,
            });
        }
    }

    // ── 命中闪光 ─────────────────────────────────────────
    hit(x: number, y: number, color: string): void {
        this.emit({ x, y, count: 6, color, speedMin: 60, speedMax: 180, lifeMin: 0.1, lifeMax: 0.3, sizeMin: 2, sizeMax: 4 });
    }

    // ── 爆炸 ─────────────────────────────────────────────
    explode(x: number, y: number, color: string, radius = 40): void {
        this.emit({ x, y, count: 20, color, speedMin: 50, speedMax: radius * 2, lifeMin: 0.3, lifeMax: 0.7, glow: true });
        // 扩散冲击波环
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, size: 2, color, fade: true, gravity: false, glow: true, type: 'ring', radius: 4, maxRadius: radius * 1.5, alpha: 1 });
        this.spawnSpriteFx(x, y, 'fx_explosion', 0.4, radius / 40);
    }

    // ── 六角激活 ─────────────────────────────────────────
    hexActivate(x: number, y: number, color: string): void {
        this.emit({ x, y, count: 16, color, speedMin: 40, speedMax: 220, lifeMin: 0.3, lifeMax: 0.8, glow: true });
        // 六方向火花
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            this.emit({ x, y, count: 2, color, speedMin: 100, speedMax: 160, lifeMin: 0.2, lifeMax: 0.4, angleMin: a - 0.2, angleMax: a + 0.2, glow: true });
        }
        this.spawnSpriteFx(x, y, 'fx_hex_ring', 0.5, 1, color);
    }

    // ── 燃烧点燃 ─────────────────────────────────────────
    ignite(x: number, y: number): void {
        this.emit({ x, y, count: 8, color: '#ff6600', speedMin: 20, speedMax: 80, lifeMin: 0.2, lifeMax: 0.5, sizeMin: 3, sizeMax: 6, glow: true, gravity: false });
        this.emit({ x, y, count: 4, color: '#ffaa00', speedMin: 10, speedMax: 40, lifeMin: 0.3, lifeMax: 0.6 });
    }

    // ── 毒液溅射 ─────────────────────────────────────────
    toxin(x: number, y: number): void {
        this.emit({ x, y, count: 8, color: '#44ff00', speedMin: 30, speedMax: 100, lifeMin: 0.3, lifeMax: 0.6, sizeMin: 3, sizeMax: 6, glow: true });
        this.emit({ x, y, count: 5, color: '#00aa00', speedMin: 10, speedMax: 50, lifeMin: 0.2, lifeMax: 0.4 });
        this.spawnSpriteFx(x, y, 'fx_poison', 0.45, 1);
    }

    // ── 治疗回血 ─────────────────────────────────────────
    heal(x: number, y: number): void {
        this.emit({ x, y, count: 8, color: '#44ff44', speedMin: 20, speedMax: 80, lifeMin: 0.4, lifeMax: 0.8, glow: true, angleMin: -Math.PI, angleMax: 0 });
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.6, maxLife: 0.6, size: 2, color: '#44ff44', fade: true, gravity: false, glow: true, type: 'ring', radius: 5, maxRadius: 30, alpha: 1 });
        this.spawnSpriteFx(x, y, 'fx_heal', 0.5, 1);
    }

    // ── 寒冰打击（冻结命中/冰弹） ──────────────────────────
    coldImpact(x: number, y: number): void {
        this.spawnSpriteFx(x, y, 'fx_cold_arrow', 0.4, 1);
    }

    // ── 护盾格挡 ─────────────────────────────────────────
    shieldBlock(x: number, y: number): void {
        this.emit({ x, y, count: 10, color: '#4488ff', speedMin: 40, speedMax: 160, lifeMin: 0.2, lifeMax: 0.4, glow: true });
    }

    // ── 方向性冲击粒子（打击感） ──────────────────────────
    impact(x: number, y: number, angle: number, ratio: number, color: string): void {
        const count = Math.floor(4 + ratio * 12);
        const spread = 0.6;
        for (let i = 0; i < count; i++) {
            const a     = angle + Rng.float(-spread, spread);
            const speed = Rng.float(80, 200 + ratio * 300);
            const life  = Rng.float(0.15, 0.4);
            this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, maxLife: life, size: Rng.float(2, 5 + ratio * 4), color, fade: true, gravity: true, glow: ratio > 0.1, type: 'dot', alpha: 1 });
        }
        // 高伤害时额外爆光环
        if (ratio > 0.15) {
            this.particles.push({ x, y, vx: 0, vy: 0, life: 0.2, maxLife: 0.2, size: 2, color, fade: true, gravity: false, glow: true, type: 'ring', radius: 5, maxRadius: 20 + ratio * 40, alpha: 1 });
        }
    }

    // ── 暴击飞溅 ─────────────────────────────────────────
    crit(x: number, y: number): void {
        this.emit({ x, y, count: 12, color: '#ffd700', speedMin: 100, speedMax: 300, lifeMin: 0.2, lifeMax: 0.5, sizeMin: 2, sizeMax: 5, glow: true });
    }

    // ── 闪电 ─────────────────────────────────────────────
    lightning(x1: number, y1: number, x2: number, y2: number, color: string): void {
        // 折线段效果（简化）
        const segs = 6;
        let px = x1, py = y1;
        for (let i = 0; i < segs; i++) {
            const t   = (i + 1) / segs;
            const nx  = x1 + (x2 - x1) * t + Rng.float(-20, 20);
            const ny  = y1 + (y2 - y1) * t + Rng.float(-20, 20);
            this.particles.push({ x: px, y: py, vx: 0, vy: 0, life: 0.15, maxLife: 0.15, size: 2, color, fade: true, gravity: false, glow: true, type: 'line', x2: nx, y2: ny, alpha: 1 });
            px = nx; py = ny;
        }
    }

    // ── 冲刺残影 ─────────────────────────────────────────
    dashTrail(x: number, y: number, color: string): void {
        this.emit({ x, y, count: 10, color, speedMin: 20, speedMax: 60, lifeMin: 0.2, lifeMax: 0.5, sizeMin: 4, sizeMax: 8, glow: true });
    }

    // ── 每帧更新 ─────────────────────────────────────────
    update(dt: number): void {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }
            if (p.type === 'dot') {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (p.gravity) p.vy += 300 * dt;
                if (p.fade) p.alpha = Math.max(0, p.life / p.maxLife);
            } else if (p.type === 'ring') {
                const t = 1 - p.life / p.maxLife;
                p.radius = 4 + ((p.maxRadius ?? 40) - 4) * t;
                p.alpha  = Math.max(0, p.life / p.maxLife);
            } else if (p.type === 'line') {
                p.alpha = Math.max(0, p.life / p.maxLife);
            }
        }
        // spriteFx 只做寿命衰减 + 清理，位置固定不动（贴图动画本身不带位移）；
        // GameManager 每帧读取剩余的 spriteFx 渲染，life/maxLife 供其算淡出透明度。
        for (let i = this.spriteFx.length - 1; i >= 0; i--) {
            this.spriteFx[i].life -= dt;
            if (this.spriteFx[i].life <= 0) this.spriteFx.splice(i, 1);
        }
    }

    clear(): void { this.particles = []; this.spriteFx = []; }
}
