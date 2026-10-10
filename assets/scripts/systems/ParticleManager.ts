import { UNIT_ATTACK_ART, enemyHitArt, EnemyHitContext } from '../data/CombatArtDB';
// ============================================================
//  ParticleManager.ts — 粒子特效管理器（纯逻辑，与渲染解耦）
// ============================================================
import { Rng } from '../core/MathUtils';
import type { ActorClip, AnimationFrame } from '../data/ActorAnimationDB';
import { EFFECT_ANIMATIONS } from '../data/EffectAnimationDB';

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
    followOffsetY?: number;
    playerContact?: boolean;
    /** 不同特效需要不同时间曲线：爆发、挥斩、持续光环。 */
    motion?: 'burst' | 'slash' | 'aura';
    /** 持续光环不应像爆炸一样满不透明遮住角色。 */
    baseAlpha?: number;
    /** 范围/持续效果在角色下方，命中碎屑保留在上方。 */
    layer?: 'ground' | 'impact';
    /** 已绘制的逐帧特效，画布大小固定，不再靠缩放/旋转冒充动画。 */
    animation?: ActorClip;
}

/** 按存活时间采样，不另建会与暂停、清场脱节的墙钟计时器。 */
export function spriteFxFrame(fx: SpriteFx): AnimationFrame | undefined {
    const frames = fx.animation?.frames;
    if (!frames?.length) return undefined;
    const duration = frames.reduce((sum, frame) => sum + frame.seconds, 0);
    let elapsed = Math.max(0, Math.min(1, 1 - fx.life / Math.max(0.001, fx.maxLife))) * duration;
    for (const frame of frames) {
        if (elapsed < frame.seconds) return frame;
        elapsed -= frame.seconds;
    }
    return frames[frames.length - 1];
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
        opts?: Pick<SpriteFx, 'rotationDeg' | 'follow' | 'motion' | 'baseAlpha' | 'layer'>,
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
        const ground = ['fx_explosion', 'fx_frost_aura', 'fx_poison', 'fx_hex_ring', 'fx_reik_warcry', 'fx_reik_death_will'].indexOf(key) >= 0;
        const wide = 64 * scale > 80;
        this.spriteFx.push({ x, y, key, life, maxLife: life, scale, color, animation: EFFECT_ANIMATIONS[key],
            layer: ground || wide ? 'ground' : 'impact', baseAlpha: ground ? 0.6 : wide ? 0.72 : 0.85, ...opts });
    }

    /** 每次真实开火调用一次，爆发散射共享枪口，不为每一发叠一张火焰。 */
    weaponFlash(x: number, y: number, dx: number, dy: number, kind: 'cyan' | 'charged' | 'ice' | 'chaos' | 'time' | 'toxic' = 'cyan'): void {
        const key = 'fx_weapon_' + kind;
        const life = EFFECT_ANIMATIONS[key].frames.reduce((sum, frame) => sum + frame.seconds, 0);
        this.spawnSpriteFx(x, y, key, life, kind === 'charged' ? 1.05 : kind === 'toxic' ? 0.38 : 0.7, undefined, {
            rotationDeg: -Math.atan2(dy, dx) * 180 / Math.PI,
        });
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
        this.spawnSpriteFx(x, y, 'fx_hit', 0.245, 0.55);
    }

    /** 真实受伤才播放来源独立的四帧碎裂动画；同源连击合并，异源最多两份。 */
    playerHit(x: number, y: number, hit: EnemyHitContext = {}, target?: { x: number; y: number; alive?: boolean }): void {
        const art = enemyHitArt(hit);
        const existing = this.spriteFx.find(fx => fx.playerContact && fx.key === art.key);
        if (existing && existing.life > 0.18) return;
        if (existing) this.spriteFx.splice(this.spriteFx.indexOf(existing), 1);
        const hits = this.spriteFx.filter(fx => fx.playerContact);
        if (hits.length >= 2) this.spriteFx.splice(this.spriteFx.indexOf(hits[hits.length - 1]), 1);
        this.spawnSpriteFx(x, y - 6, art.key, 0.4, art.size / 64, undefined, {
            layer: 'impact', baseAlpha: 1, rotationDeg: -(hit.angle ?? 0) * 180 / Math.PI,
        });
        const created = this.spriteFx[this.spriteFx.length - 1];
        created.follow = target; created.followOffsetY = -6; created.playerContact = true;
        // 渲染池按数组顺序分配；玩家受击优先，不能被敌群的命中火花挤掉。
        this.spriteFx.unshift(this.spriteFx.pop()!);
    }

    /** 敌方水/酸/金属范围释放：材质爆发加贴地残留，不套火球或通用圆环。 */
    enemyBurst(x: number, y: number, material: 'water' | 'acid' | 'metal', radius = 60): void {
        const source = material === 'water' ? 'boss_abyss' : material === 'acid' ? 'acid_sac' : 'boss_mech';
        const color = material === 'water' ? '#78cabe' : material === 'acid' ? '#a5c54c' : '#e2b784';
        this.emit({ x, y, count: 12, color, speedMin: 35, speedMax: radius * 1.7,
            lifeMin: 0.14, lifeMax: 0.36, sizeMin: 1, sizeMax: 3, glow: false });
        this.spawnSpriteFx(x, y, enemyHitArt({ source }).key, 0.4,
            Math.min(1.8, Math.max(0.7, radius / 55)), undefined, { layer: 'ground' });
        this.spawnSpriteFx(x, y, material === 'water' ? 'fx_ground_water' : material === 'acid' ? 'fx_ground_acid' : 'fx_ground_dust',
            0.55, Math.min(2.6, Math.max(0.8, radius / 35)), undefined, { layer: 'ground', baseAlpha: 0.6 });
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
        this.spawnSpriteFx(x, y, 'fx_ignite', 0.48, 0.82);
    }

    // ── 毒液溅射 ─────────────────────────────────────────
    toxin(x: number, y: number): void {
        // 持续中毒高频触发：只在脚边冒少量毒泡，不能堆成盖住英雄的云团。
        this.emit({ x, y: y + 12, count: 4, color: '#91cf58', speedMin: 8, speedMax: 28,
            lifeMin: 0.12, lifeMax: 0.22, sizeMin: 1, sizeMax: 2, glow: false });
        this.spawnSpriteFx(x, y + 12, 'fx_poison', 0.22, 0.4, undefined, { baseAlpha: 0.55, layer: 'ground' });
    }

    toxicImpact(x: number, y: number, vx: number, vy: number): void {
        this.spawnSpriteFx(x, y, 'fx_toxic_impact', 0.20, 0.4, undefined, {
            rotationDeg: -Math.atan2(vy, vx) * 180 / Math.PI,
            baseAlpha: 0.7,
        });
    }

    // ── 治疗回血 ─────────────────────────────────────────
    heal(x: number, y: number): void {
        this.emit({ x, y, count: 8, color: '#44ff44', speedMin: 20, speedMax: 80, lifeMin: 0.4, lifeMax: 0.8, glow: true, angleMin: -Math.PI, angleMax: 0 });
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.6, maxLife: 0.6, size: 2, color: '#44ff44', fade: true, gravity: false, glow: true, type: 'ring', radius: 5, maxRadius: 30, alpha: 1 });
        this.spawnSpriteFx(x, y, 'fx_heal', 0.5, 1);
    }

    // ── 寒冰打击（冻结命中/冰弹） ──────────────────────────
    coldImpact(x: number, y: number): void {
        this.spawnSpriteFx(x, y, 'fx_cold_arrow', 0.28, 0.6);
    }

    frostField(x: number, y: number, radius: number): void {
        this.spawnSpriteFx(x, y, 'fx_frost_aura', 0.6, Math.max(1, radius / 32));
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
            this.spawnSpriteFx(x, y, 'fx_shield_break', 0.38, 1.1);
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
        // 命中只保留方向碎屑；完整圆环曾让各类攻击都像同一种法阵。
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
    /** 挥斩主体是弧刃美术，火花沿出手方向飞散，不叠加直线/圆环。 */
    meleeSlash(x: number, y: number, angle: number, color: string, reach = 70, strength = 1, unit?: string): void {
        const centerX = x + Math.cos(angle) * reach * 0.48;
        const centerY = y + Math.sin(angle) * reach * 0.48;
        const art = unit ? (UNIT_ATTACK_ART[unit] ?? 'fx_enemy_claw_slash') : 'fx_enemy_claw_slash';
        this.spawnSpriteFx(centerX, centerY, art, 0.24, Math.min(2, Math.max(0.45, reach / 80)), undefined, {
            rotationDeg: -angle * 180 / Math.PI,
            motion: art === 'fx_hit' ? 'burst' : 'slash', baseAlpha: 0.78,
        });
        this.emit({ x: centerX, y: centerY, count: 3 + Math.floor(strength * 2), color,
            speedMin: 60, speedMax: 150, lifeMin: 0.08, lifeMax: 0.19,
            sizeMin: 1.5, sizeMax: 3, glow: false,
            angleMin: angle - 0.65, angleMax: angle + 0.65 });
    }

    /** 时间刃从挥刃命中帧的武器挂点展开，范围判定仍由攻击者负责。 */
    timeBlade(x: number, y: number, angle: number): void {
        this.spawnSpriteFx(x, y, 'fx_time_blade', 0.26, 0.9, undefined, {
            rotationDeg: -angle * 180 / Math.PI,
        });
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
    /** 普攻：轻量鞭击——沿攻击方向抽出一条鞭长裂光，鞭梢小爆点。 */
    grafWhipStrike(x: number, y: number, angle: number, range: number): void {
        const nx = Math.cos(angle), ny = Math.sin(angle);
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.22, maxLife: 0.22, size: 2, color: '#e88aff',
            fade: true, gravity: false, glow: true, type: 'line',
            x2: x + nx * range, y2: y + ny * range, alpha: 1, lineWidth: 3.5 });
        this.emit({ x: x + nx * range, y: y + ny * range, count: 5, color: '#cc44ff',
            speedMin: 40, speedMax: 130, lifeMin: 0.12, lifeMax: 0.28, sizeMin: 1, sizeMax: 3, glow: true });
    }

    /** Q：混沌长鞭鞭击——沿鞭向抽出一道主缝裂光与鞭梢碎裂粒子。 */
    grafWhipLash(x: number, y: number, nx: number, ny: number): void {
        this.spawnSpriteFx(x, y, 'fx_chaos_pulse', 0.45, 1.4);
        const px = -ny, py = nx;
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.5, maxLife: 0.5, size: 2, color: '#e88aff',
            fade: true, gravity: false, glow: true, type: 'line',
            x2: x + nx * 200, y2: y + ny * 200, alpha: 1, lineWidth: 5 });
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, size: 2, color: '#d16dff',
            fade: true, gravity: false, glow: true, type: 'ring', radius: 10, maxRadius: 64, alpha: 1, lineWidth: 4 });
        // 鞭身三道弧形残影 + 鞭梢碎裂
        for (let i = 1; i <= 3; i++) {
            const mid = i * 50;
            this.particles.push({ x: x + nx * mid + px * 8, y: y + ny * mid + py * 8, vx: 0, vy: 0,
                life: 0.32, maxLife: 0.32, size: 2, color: i % 2 ? '#cc44ff' : '#f2c6ff',
                fade: true, gravity: false, glow: true, type: 'line',
                x2: x + nx * (mid + 46) - px * 8, y2: y + ny * (mid + 46) - py * 8, alpha: 0.8, lineWidth: 2.5 });
        }
        this.emit({ x: x + nx * 200, y: y + ny * 200, count: 18, color: '#cc44ff',
            speedMin: 90, speedMax: 260, lifeMin: 0.18, lifeMax: 0.45, sizeMin: 2, sizeMax: 5, glow: true });
    }

    /** E：混沌冲击眩晕波——由中心向外炸开的双层震环与放射裂线。 */
    grafChaosStun(x: number, y: number): void {
        this.spawnSpriteFx(x, y, 'fx_chaos_pulse', 0.55, 2.1);
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.55, maxLife: 0.55, size: 2, color: '#cc44ff',
            fade: true, gravity: false, glow: true, type: 'ring', radius: 20, maxRadius: 460, alpha: 1, lineWidth: 6 });
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.42, maxLife: 0.42, size: 2, color: '#f2c6ff',
            fade: true, gravity: false, glow: true, type: 'ring', radius: 10, maxRadius: 320, alpha: 0.85, lineWidth: 3 });
        for (let i = 0; i < 10; i++) {
            const a = i * Math.PI / 5;
            this.particles.push({ x: x + Math.cos(a) * 24, y: y + Math.sin(a) * 24, vx: 0, vy: 0,
                life: 0.4, maxLife: 0.4, size: 2, color: i % 2 ? '#d687ff' : '#8f32ff',
                fade: true, gravity: false, glow: true, type: 'line',
                x2: x + Math.cos(a) * 210, y2: y + Math.sin(a) * 210, alpha: 1, lineWidth: 3 });
        }
        this.emit({ x, y, count: 30, color: '#cc44ff', speedMin: 120, speedMax: 340, lifeMin: 0.2, lifeMax: 0.55, sizeMin: 2, sizeMax: 6, glow: true });
    }

    /** 被动·洞察：怪物身上的标记闪光（小型紫环，克制到不抢怪物本体视觉）。 */
    insightMark(x: number, y: number): void {
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, maxLife: 0.35, size: 2, color: '#cc44ff',
            fade: true, gravity: false, glow: true, type: 'ring', radius: 4, maxRadius: 30, alpha: 0.9, lineWidth: 2 });
        this.emit({ x, y, count: 6, color: '#d687ff', speedMin: 40, speedMax: 110, lifeMin: 0.15, lifeMax: 0.35, sizeMin: 1, sizeMax: 3, glow: true });
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
        // 短寿命离散碎屑留在真实飞行路径；弹体本身由 Sprite 表达。
        // 不发出 line 粒子，避免高速弹再次拼成长方形条带。
        const angle = Math.atan2(-vy, -vx);
        const colors: Record<string, string> = {
            poison: '#91d84a', toxin_dart: '#b7ef69', gear: '#ffc078', homing: '#ffba70',
            chaos: '#be91ef', needle: '#ffda83', frost: '#bff6ff', arc: '#85eaff',
            water_bomb: '#70d6ef', water_spike: '#b8efff', shrimp_spike: '#ffc780',
            venom_sting: '#d895e8', sonic: '#efbf7d', beam: '#ffab81', blade: '#cfa6ff', rail: '#ffacd9',
        };
        this.emit({ x, y, count: fx === 'poison' ? 2 : 1, color: colors[fx] ?? color,
            speedMin: 8, speedMax: 26, lifeMin: 0.09, lifeMax: 0.18,
            sizeMin: 1, sizeMax: Math.min(3.5, radius * 0.4), glow: false,
            angleMin: angle - 0.35, angleMax: angle + 0.35 });
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
