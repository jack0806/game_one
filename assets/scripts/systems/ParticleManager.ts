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
    /** 贴图自身旋转。Cocos 的画布 Y 轴与逻辑坐标相反，渲染层统一处理角度。 */
    rotationDeg?: number;
    /** 跟随战斗实体（持续光环），只读取 x/y/alive，不引入任何 cc.* 类型。 */
    follow?: { x: number; y: number; alive?: boolean };
    /** 不同特效需要不同时间曲线：爆发、挥斩、持续光环。 */
    motion?: 'burst' | 'slash' | 'aura';
    /** 持续光环不应像爆炸一样满不透明遮住角色。 */
    baseAlpha?: number;
}

export class ParticleManager {
    particles: Particle[] = [];
    spriteFx:  SpriteFx[] = [];

    /** 生成一个一次性美术特效（按 key 淡出消失）。 */
    spawnSpriteFx(
        x: number,
        y: number,
        key: string,
        life = 0.5,
        scale = 1,
        color?: string,
        opts?: Pick<SpriteFx, 'rotationDeg' | 'follow' | 'motion' | 'baseAlpha'>,
    ): void {
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
        this.spriteFx.push({ x, y, key, life, maxLife: life, scale, color, ...opts });
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
        // 主体使用带厚度、火花与破口的正式斩痕贴图；程序线只作为短暂运动残影，
        // 不再让近战技能看起来像调试线段。
        const centerX = x + Math.cos(angle) * reach * 0.42;
        const centerY = y + Math.sin(angle) * reach * 0.42;
        this.spawnSpriteFx(centerX, centerY, 'fx_enemy_claw_slash', 0.26, 0.72 + strength * 0.48, color, {
            rotationDeg: -angle * 180 / Math.PI,
            motion: 'slash',
            baseAlpha: 0.92,
        });
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
                alpha: 0.46, lineWidth: Math.max(1, 2 + strength * 1.2 - Math.abs(i) * 0.8),
            });
        }
        const ringR = Math.max(18, reach) * (0.72 + strength * 0.18);
        const rLife = 0.18 + strength * 0.05;
        this.particles.push({ x, y, vx: 0, vy: 0, life: rLife, maxLife: rLife, size: 2, color, fade: true, gravity: false, glow: true, type: 'ring', radius: ringR * 0.35, maxRadius: ringR, alpha: 1 });
        this.emit({ x, y, count: 4 + Math.floor(strength * 3), color, speedMin: 80, speedMax: 200 + strength * 60, lifeMin: 0.1, lifeMax: 0.3, sizeMin: 2, sizeMax: 4, glow: true, angleMin: angle - 0.45, angleMax: angle + 0.45 });
    }

    // ── 狂战士·雷克专属攻击视觉 ─────────────────────────────
    /**
     * 双斧普攻：用真正的交错熔岩弧刃替代通用三条直线。comboSide 让连续攻击
     * 在左右手之间轻微交替，避免每一下完全重合成静态贴纸。
     */
    reikCleave(x: number, y: number, angle: number, reach = 70, strength = 1, comboSide = 0): void {
        const dirX = Math.cos(angle), dirY = Math.sin(angle);
        const centerX = x + dirX * reach * 0.44;
        const centerY = y + dirY * reach * 0.44;
        const handTilt = comboSide % 2 === 0 ? -8 : 8;
        const scale = Math.min(2.25, Math.max(1.25, reach / 70 * 1.42 * strength));
        this.spawnSpriteFx(centerX, centerY, 'fx_reik_cleave', 0.3, scale, undefined, {
            rotationDeg: -angle * 180 / Math.PI + handTilt,
            motion: 'slash',
        });
        this.emit({
            x: centerX, y: centerY,
            count: 8 + Math.floor(strength * 4), color: '#ff5a3c',
            speedMin: 90, speedMax: 230 + strength * 70,
            lifeMin: 0.12, lifeMax: 0.32, sizeMin: 2, sizeMax: 5,
            glow: true, angleMin: angle - 0.7, angleMax: angle + 0.7,
        });
    }

    /** 怒冲：三段交错斧痕沿真实位移路径推进，明确表达“冲锋并撕裂沿途”。 */
    reikChargeCleave(startX: number, startY: number, endX: number, endY: number): void {
        const angle = Math.atan2(endY - startY, endX - startX);
        const distance = Math.hypot(endX - startX, endY - startY);
        for (let i = 0; i < 3; i++) {
            const t = 0.22 + i * 0.28;
            const x = startX + (endX - startX) * t;
            const y = startY + (endY - startY) * t;
            this.spawnSpriteFx(x, y, 'fx_reik_cleave', 0.34, 1.35 + distance / 500, undefined, {
                rotationDeg: -angle * 180 / Math.PI + (i % 2 === 0 ? -12 : 12),
                motion: 'slash',
                baseAlpha: 0.9 - i * 0.08,
            });
        }
        // 地面撕裂主线比粒子更克制，给玩家一个清楚的冲锋方向与受击走廊。
        this.particles.push({
            x: startX, y: startY, vx: 0, vy: 0,
            life: 0.38, maxLife: 0.38, size: 2, color: '#ff3b24',
            fade: true, gravity: false, glow: true, type: 'line',
            x2: endX, y2: endY, alpha: 0.9, lineWidth: 5,
        });
    }

    /** 战吼：破甲钢环向外震开，和伤害爆炸/海克斯法阵保持不同轮廓。 */
    reikWarcry(x: number, y: number): void {
        this.spawnSpriteFx(x, y, 'fx_reik_warcry', 0.62, 3.0, undefined, {
            motion: 'burst',
            baseAlpha: 0.9,
        });
        this.emit({ x, y, count: 18, color: '#ff5538', speedMin: 130, speedMax: 330, lifeMin: 0.18, lifeMax: 0.48, sizeMin: 2, sizeMax: 6, glow: true });
    }

    /** 死亡意志：低遮挡血怒场在整个 4 秒 buff 内跟随雷克。 */
    reikDeathWill(owner: { x: number; y: number; alive?: boolean }, duration = 4): void {
        this.spawnSpriteFx(owner.x, owner.y, 'fx_reik_death_will', duration, 2.25, undefined, {
            follow: owner,
            motion: 'aura',
            baseAlpha: 0.56,
            rotationDeg: 0,
        });
        this.reikWarcry(owner.x, owner.y);
    }

    // ── 混沌傀儡·格雷夫专属技能视觉 ─────────────────────────
    /** Q：按随机结果改变辅色，但始终保留不稳定脉冲的双环与六向裂光。 */
    grafChaosPulse(x: number, y: number, effect: string): void {
        const accent = effect === 'explode' ? '#ff5a3c'
            : effect === 'lightning' ? '#63e7ff'
            : effect === 'attract' ? '#ffcf58' : '#d16dff';
        this.spawnSpriteFx(x, y, 'fx_hex_ring', 0.52, 1.75, '#cc44ff', { motion: 'burst', rotationDeg: -18 });
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.44, maxLife: 0.44, size: 2, color: accent,
            fade: true, gravity: false, glow: true, type: 'ring', radius: 12, maxRadius: 92, alpha: 1, lineWidth: 5 });
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3 + Math.PI / 6;
            this.particles.push({ x: x + Math.cos(a) * 15, y: y + Math.sin(a) * 15, vx: 0, vy: 0,
                life: 0.34, maxLife: 0.34, size: 2, color: i % 2 ? accent : '#f2c6ff',
                fade: true, gravity: false, glow: true, type: 'line',
                x2: x + Math.cos(a) * 108, y2: y + Math.sin(a) * 108, alpha: 1, lineWidth: 3 });
        }
        this.emit({ x, y, count: 22, color: accent, speedMin: 100, speedMax: 310, lifeMin: 0.18, lifeMax: 0.5, sizeMin: 2, sizeMax: 6, glow: true });
    }

    /** E：中心旧符文破碎，左右两枚新符文展开，直观表达“一拆二”的词条重组。 */
    grafReforge(x: number, y: number): void {
        this.spawnSpriteFx(x - 42, y, 'fx_hex_ring', 0.72, 1.05, '#7ee8ff', { motion: 'burst', rotationDeg: -28 });
        this.spawnSpriteFx(x + 42, y, 'fx_hex_ring', 0.72, 1.05, '#ff75dc', { motion: 'burst', rotationDeg: 28 });
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            this.particles.push({ x, y, vx: 0, vy: 0, life: 0.5, maxLife: 0.5, size: 2,
                color: i % 2 ? '#7ee8ff' : '#ff75dc', fade: true, gravity: false, glow: true,
                type: 'line', x2: x + Math.cos(a) * 76, y2: y + Math.sin(a) * 54,
                alpha: 1, lineWidth: 3.5 });
        }
        this.emit({ x, y, count: 26, color: '#d687ff', speedMin: 70, speedMax: 250, lifeMin: 0.25, lifeMax: 0.62, sizeMin: 2, sizeMax: 5, glow: true });
    }

    /** R：三层反向错位法阵和十二向裂缝，规模必须一眼高于Q/E。 */
    grafCataclysm(x: number, y: number): void {
        this.spawnSpriteFx(x, y, 'fx_hex_ring', 0.95, 3.7, '#8f32ff', { motion: 'burst', rotationDeg: 0, baseAlpha: 0.82 });
        this.spawnSpriteFx(x, y, 'fx_hex_ring', 0.85, 2.75, '#ff59df', { motion: 'burst', rotationDeg: 30, baseAlpha: 0.75 });
        this.spawnSpriteFx(x, y, 'fx_hex_ring', 0.72, 1.8, '#6fe7ff', { motion: 'burst', rotationDeg: -30, baseAlpha: 0.78 });
        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6;
            this.particles.push({ x: x + Math.cos(a) * 28, y: y + Math.sin(a) * 28, vx: 0, vy: 0,
                life: 0.65, maxLife: 0.65, size: 2, color: i % 3 === 0 ? '#6fe7ff' : '#d66bff',
                fade: true, gravity: false, glow: true, type: 'line',
                x2: x + Math.cos(a) * (150 + (i % 2) * 35), y2: y + Math.sin(a) * (150 + (i % 2) * 35),
                alpha: 1, lineWidth: i % 2 ? 2.5 : 4.5 });
        }
        this.emit({ x, y, count: 40, color: '#cc44ff', speedMin: 120, speedMax: 390, lifeMin: 0.28, lifeMax: 0.82, sizeMin: 3, sizeMax: 8, glow: true });
    }

    // ── 敌弹分弹种尾迹（boss 四章弹种可辨识化） ────────────
    /**
     * 按弹种生成尾迹，让玩家一眼分辨威胁类型：
     * poison 毒球（绿雾） / toxin_dart 毒镖（细短残光） / gear 齿轮（蓝环） /
     * homing 追踪（反向尾焰） / chaos 混沌（紫烟+环）
     */
    enemyProjectileTrail(x: number, y: number, fx: 'poison' | 'toxin_dart' | 'gear' | 'homing' | 'chaos' |
        'needle' | 'frost' | 'arc' | 'rail' | 'water_bomb' | 'water_spike' |
        'shrimp_spike' | 'venom_sting' | 'sonic' | 'beam' | 'blade', vx: number, vy: number, color = '#fff', radius = 6): void {
        switch (fx) {
            case 'poison':
                this.emit({ x, y, count: 3, color: '#44ff00', speedMin: 10, speedMax: 40, lifeMin: 0.25, lifeMax: 0.5, sizeMin: 2, sizeMax: 5, glow: true });
                break;
            case 'toxin_dart': {
                const spd = Math.hypot(vx, vy) || 1;
                this.particles.push({
                    x, y, vx: 0, vy: 0, life: 0.11, maxLife: 0.11, size: 1,
                    color: '#9cff45', fade: true, gravity: false, glow: true,
                    type: 'line', x2: x - vx / spd * 12, y2: y - vy / spd * 12,
                    alpha: 0.8, lineWidth: 1.25,
                });
                break;
            }
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
            case 'needle': {
                const spd = Math.hypot(vx, vy) || 1;
                this.particles.push({
                    x, y, vx: 0, vy: 0, life: 0.13, maxLife: 0.13, size: 1,
                    color: '#fff3a0', fade: true, gravity: false, glow: true,
                    type: 'line', x2: x - vx / spd * 22, y2: y - vy / spd * 22,
                    alpha: 1, lineWidth: 1.4,
                });
                break;
            }
            case 'frost': {
                const spd = Math.hypot(vx, vy) || 1;
                this.particles.push({
                    x, y, vx: 0, vy: 0, life: 0.16, maxLife: 0.16, size: 1,
                    color: '#bff6ff', fade: true, gravity: false, glow: true,
                    type: 'line', x2: x - vx / spd * 18, y2: y - vy / spd * 18,
                    alpha: 1, lineWidth: 2.5,
                });
                break;
            }
            case 'arc':
                this.emit({ x, y, count: 2, color: '#7df4ff', speedMin: 5, speedMax: 24, lifeMin: 0.12, lifeMax: 0.25, sizeMin: 1, sizeMax: 3, glow: true });
                break;
            case 'water_bomb':
                this.particles.push({ x, y, vx: 0, vy: 0, life: 0.24, maxLife: 0.24, size: 2, color: '#55dfff', fade: true, gravity: false, glow: true, type: 'ring', radius: radius * 0.45, maxRadius: radius * 1.45, alpha: 0.75 });
                break;
            case 'water_spike':
            case 'beam':
            case 'blade':
            case 'rail': {
                const spd = Math.hypot(vx, vy) || 1;
                const lengths: Record<string, number> = { water_spike: 16, beam: 26, blade: 22, rail: 30 };
                const widths: Record<string, number> = { water_spike: 1.8, beam: 2.4, blade: 2.8, rail: 2.2 };
                this.particles.push({ x, y, vx: 0, vy: 0, life: 0.14, maxLife: 0.14, size: 1,
                    color, fade: true, gravity: false, glow: true, type: 'line',
                    x2: x - vx / spd * lengths[fx], y2: y - vy / spd * lengths[fx], alpha: 0.8, lineWidth: widths[fx] });
                break;
            }
            case 'shrimp_spike':
                this.emit({ x, y, count: 2, color: '#ff9a4c', speedMin: 8, speedMax: 34, lifeMin: 0.12, lifeMax: 0.25, sizeMin: 1, sizeMax: 2.5, glow: true });
                break;
            case 'venom_sting':
                this.emit({ x, y, count: 1, color: '#d36bff', speedMin: 4, speedMax: 16, lifeMin: 0.18, lifeMax: 0.32, sizeMin: 1.5, sizeMax: 2.5, glow: true });
                break;
            case 'sonic':
                this.particles.push({ x, y, vx: 0, vy: 0, life: 0.18, maxLife: 0.18, size: 2, color: '#ff7777', fade: true, gravity: false, glow: true, type: 'ring', radius: radius * 0.6, maxRadius: radius * 2.0, alpha: 0.7 });
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
