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
        if (key === 'fx_explosion') {
            // 连锁爆炸可能在同一帧请求几十张高覆盖率火球。伤害与粒子仍全部结算，
            // 贴图层只保留分散的代表性爆点，避免橙色花瓣叠成不透明色块。
            scale = Math.min(scale, 1.4);
            let activeExplosions = 0;
            for (const fx of this.spriteFx) {
                if (fx.key !== 'fx_explosion') continue;
                activeExplosions++;
                const dx = fx.x - x, dy = fx.y - y;
                if (fx.life > 0.16 && dx * dx + dy * dy < 52 * 52) return;
            }
            if (activeExplosions >= 8) return;
        }
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
        // 伤害半径不应线性等比放大整张贴图：后期连锁/核爆会让多张 400px+
        // 的不透明火球遮住半屏。保留范围差异，但把视觉主体控制在约 55~210px。
        const visualScale = Math.min(2.4, Math.max(0.65, radius / 70));
        this.spawnSpriteFx(x, y, 'fx_explosion', 0.4, visualScale);
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
    shieldBlock(x: number, y: number, broken = false): void {
        const color = broken ? '#aaddff' : '#4488ff';
        this.emit({
            x, y, count: broken ? 18 : 7, color,
            speedMin: broken ? 90 : 35, speedMax: broken ? 260 : 130,
            lifeMin: 0.18, lifeMax: broken ? 0.55 : 0.32,
            sizeMin: 2, sizeMax: broken ? 6 : 4, glow: true,
        });
        // 格挡需要一个瞬时扩散面，破盾则用更大、更亮的双层涟漪表达状态改变。
        this.particles.push({
            x, y, vx: 0, vy: 0, life: broken ? 0.42 : 0.24,
            maxLife: broken ? 0.42 : 0.24, size: 2, color,
            fade: true, gravity: false, glow: true, type: 'ring',
            radius: broken ? 12 : 7, maxRadius: broken ? 54 : 32, alpha: 1,
        });
        if (broken) {
            this.particles.push({
                x, y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3,
                size: 2, color: '#ffffff', fade: true, gravity: false,
                glow: true, type: 'ring', radius: 6, maxRadius: 38, alpha: 1,
            });
        }
    }

    // ── 方向性冲击粒子（打击感） ──────────────────────────
    impact(x: number, y: number, angle: number, ratio: number, color: string): void {
        // ratio 是本次伤害/目标最大生命；超杀时可能远大于1。表现强度只需要
        // 表达到“一击必杀”，继续线性外推会生成千像素光环与百像素粒子。
        const visualRatio = Math.min(1, Math.max(0, ratio));
        const count = Math.floor(4 + visualRatio * 12);
        const spread = 0.6;
        for (let i = 0; i < count; i++) {
            const a     = angle + Rng.float(-spread, spread);
            const speed = Rng.float(80, 200 + visualRatio * 300);
            const life  = Rng.float(0.15, 0.4);
            this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, maxLife: life, size: Rng.float(2, 5 + visualRatio * 4), color, fade: true, gravity: true, glow: visualRatio > 0.1, type: 'dot', alpha: 1 });
        }
        // 高伤害时额外爆光环
        if (visualRatio > 0.15) {
            this.particles.push({ x, y, vx: 0, vy: 0, life: 0.2, maxLife: 0.2, size: 2, color, fade: true, gravity: false, glow: true, type: 'ring', radius: 5, maxRadius: 20 + visualRatio * 40, alpha: 1 });
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

    // ── 近战剑气（玩家/怪物近战攻击共用） ──────────────────
    /**
     * 挥斩特效：3 条平行刃线沿攻击方向扫出 + 前方扩散光环 + 扇形火花。
     * @param x,y      挥斩者坐标
     * @param angle    攻击方向（弧度）
     * @param color    主体色（中线固定白色提亮）
     * @param reach    攻击距离（决定刃长与光环半径）
     * @param strength 强度：玩家=1，小怪=0.85，Boss=1.8，放大宽度/寿命
     */
    meleeSlash(x: number, y: number, angle: number, color: string, reach = 70, strength = 1): void {
        const len = Math.max(40, reach * 1.1);
        for (let i = -1; i <= 1; i++) {
            const off = i * (5 + strength * 3);   // 垂直于攻击方向错开，模拟刃宽
            const ox = Math.cos(angle + Math.PI / 2) * off;
            const oy = Math.sin(angle + Math.PI / 2) * off;
            const a2 = angle + i * 0.12;          // 外侧两线略张开成扇形
            const life = 0.16 + strength * 0.06;
            this.particles.push({
                x: x + ox, y: y + oy, vx: 0, vy: 0,
                life, maxLife: life,
                size: 2, color: i === 0 ? '#ffffff' : color,
                fade: true, gravity: false, glow: true, type: 'line',
                x2: x + ox + Math.cos(a2) * len, y2: y + oy + Math.sin(a2) * len,
                alpha: 1, lineWidth: Math.max(1, 3 + strength * 2 - Math.abs(i) * 1.5),
            });
        }
        const ringR = Math.max(18, reach) * (0.72 + strength * 0.18);
        const rLife = 0.18 + strength * 0.05;
        this.particles.push({ x, y, vx: 0, vy: 0, life: rLife, maxLife: rLife, size: 2, color, fade: true, gravity: false, glow: true, type: 'ring', radius: ringR * 0.35, maxRadius: ringR, alpha: 1 });
        this.emit({ x, y, count: 4 + Math.floor(strength * 3), color, speedMin: 80, speedMax: 200 + strength * 60, lifeMin: 0.1, lifeMax: 0.3, sizeMin: 2, sizeMax: 4, glow: true, angleMin: angle - 0.45, angleMax: angle + 0.45 });
    }

    // ── 敌弹分弹种尾迹（boss 四章弹种可辨识化） ────────────
    /**
     * 按弹种生成尾迹，让玩家一眼分辨威胁类型：
     * poison 毒球（绿雾） / gear 齿轮（蓝环） / homing 追踪（反向尾焰） / chaos 混沌（紫烟+环）
     */
    enemyProjectileTrail(x: number, y: number, fx: 'poison' | 'gear' | 'homing' | 'chaos', vx: number, vy: number, color = '#fff', radius = 6): void {
        switch (fx) {
            case 'poison':
                this.emit({ x, y, count: 3, color: '#44ff00', speedMin: 10, speedMax: 40, lifeMin: 0.25, lifeMax: 0.5, sizeMin: 2, sizeMax: 5, glow: true });
                break;
            case 'gear':
                this.particles.push({ x, y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, size: 2, color: '#66aaff', fade: true, gravity: false, glow: true, type: 'ring', radius: radius * 0.8, maxRadius: radius * 2.2, alpha: 1 });
                break;
            case 'homing': {
                const spd = Math.hypot(vx, vy) || 1;
                this.particles.push({ x, y, vx: 0, vy: 0, life: 0.2, maxLife: 0.2, size: 2, color: '#00ffcc', fade: true, gravity: false, glow: true, type: 'line', x2: x - vx / spd * 16, y2: y - vy / spd * 16, alpha: 1, lineWidth: 2 });
                break;
            }
            case 'chaos':
                this.emit({ x, y, count: 2, color: '#cc44ff', speedMin: 5, speedMax: 30, lifeMin: 0.2, lifeMax: 0.4, sizeMin: 2, sizeMax: 4, glow: true });
                this.particles.push({ x, y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, size: 2, color: '#aa33ee', fade: true, gravity: false, glow: true, type: 'ring', radius: radius * 0.5, maxRadius: radius * 1.6, alpha: 1 });
                break;
        }
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
