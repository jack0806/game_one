// ============================================================
//  EnemyBase.ts — 敌人基类 + 5种敌人类型
// ============================================================
import type { Node, Sprite } from 'cc';
import { Vec, Rng, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';
import { getMiniBossDef } from '../data/BossDB';
import { createLocomotionState, LocomotionKind, resetLocomotion } from '../core/Locomotion';
import { createDirectionalFacingState, resetDirectionalFacing } from '../core/DirectionalFacing';

export interface DotEffect { type: string; dps: number; timeLeft: number; color: string; }

export class EnemyBase {
    type        = 'grunt';
    alive       = true;
    isElite     = false;
    isBoss      = false;
    isMiniBoss  = false;
    x           = 0;
    y           = 0;
    radius      = 18;
    hp          = 100;
    maxHp       = 100;
    speed       = 60;
    damage      = 8;
    armor       = 0;
    attackSpeed = 1;
    color       = '#ff4444';
    glowColor   = '#ff0000';
    /** 美术资源key（走 ArtRemap.artPath() 解析真实文件名），按敌人类型在 _applyTypeDef() 里设置。 */
    spriteKey   = 'enemy_grunt';
    /** 与静止帧成对的真实动作帧。 */
    moveSpriteKey = 'enemy_grunt_move';
    /** 渲染层用于避免每帧重复提交同一资源。 */
    locomotionFrameKey = '';
    /** 按敌人身体结构选择的步态；只影响渲染，不影响速度与碰撞。 */
    locomotionKind: LocomotionKind = 'biped';
    locomotion = createLocomotionState();
    /** 无论追击、横移、后退或站定，视觉上都由“指向玩家”的向量驱动。 */
    directionalFacing = createDirectionalFacingState('front');
    /** 精英/miniboss没有独立美术，复用基础怪物贴图+这个色调叠加区分（Sprite.color tint）。 */
    tintColor   = '#ffffff';
    /**
     * 纯视觉缩放系数，只影响 GameManager.spawnEnemy() 里 Sprite 的渲染直径，
     * 不参与 radius 本身（碰撞体积/近战判定距离/边界clamp全部只读 radius，
     * 见 EnemyBase.update()/BossController.update()/BulletController 的命中判定），
     * 避免"改大贴图"连带把判定体积也放大而破坏平衡性。默认1即渲染尺寸=radius*2。
     */
    visualScale = 1;
    dots: DotEffect[] = [];
    frozen      = 0;
    slowMult    = 1;
    _slowTimer  = 0;
    stunned     = 0;
    goldValue   = 10;
    xpValue     = 5;
    knockbackX  = 0;
    knockbackY  = 0;
    shieldHp    = 0;
    maxShieldHp = 0;
    shieldActive = false;
    flashTimer  = 0;
    deathExplode = false;
    label       = '';
    meleeRange  = 48;
    /** 远程单位（>0 时启用）：射程内冷却完毕朝玩家发射毒弹，并与玩家保持距离。 */
    rangedRange    = 0;
    rangedKeepDist = 300;
    private _rangedCd = 0;
    chapter     = 1;
    /** 近战前摇公开给渲染层：>0 时绘制危险圈/攻击方向，归零后才结算伤害。 */
    attackWindup    = 0;
    attackWindupMax = 0.32;
    attackTargetX   = 0;
    attackTargetY   = 0;
    private _atkCd = 0;

    /** 混沌节拍变异（chaos_beat）：由 WaveManager 定时随机施加的临时增益，到期自动回落到1。 */
    buffSpeedMult = 1;
    buffDmgMult   = 1;
    _buffTimer    = 0;

    /** 无敌（Boss 飞空坠击/水母隐身等）：takeDamage 直接免疫。 */
    invulnerable = false;
    /** 隐身可见性标记：渲染层据此降透明度（水母）。 */
    invisible = false;

    /** 微型冲锋（盾龟高速碰撞等小 Boss 用）：_chargeT>0 时按 _chargeV 直线移动。 */
    _chargeT = 0;
    _chargeVx = 0;
    _chargeVy = 0;
    private _chargeDmg = 0;

    /** 小 Boss 技能冷却与计时（squid/turtle/shrimp/jelly/drone 系列用）。 */
    _miniCd1 = 0;
    _miniCd2 = 0;
    _miniTimer = 0;
    /** 小 Boss 已释放技能计数（深海鱿鱼放完一轮后自毁消失）。 */
    _miniSkillCount = 0;

    /** 变异：混沌节拍 — WaveManager 每5秒对随机一批敌人调用此方法施加临时增益。 */
    applyChaosBuff(mult: number, duration: number): void {
        this.buffSpeedMult = mult;
        this.buffDmgMult   = mult;
        this._buffTimer    = duration;
    }

    init(type: string, wave: number, game: any): void {
        this.type    = type;
        this.chapter = Math.ceil(wave / 10);
        const scale  = 1 + (wave - 1) * 0.08;
        this.alive = true; this.dots = []; this.frozen = 0; this.slowMult = 1; this._slowTimer = 0;
        this.knockbackX = 0; this.knockbackY = 0; this.flashTimer = 0;
        this.attackWindup = 0; this.attackTargetX = 0; this.attackTargetY = 0;
        resetLocomotion(this.locomotion);
        resetDirectionalFacing(this.directionalFacing, 'front');
        this._applyTypeDef(type, scale, game);
        this._applyMutations(game);
        // 精英增强
        if (this.isElite) { this.maxHp *= 3; this.hp = this.maxHp; this.damage *= 1.5; this.goldValue *= 3; }
    }

    private _applyTypeDef(type: string, scale: number, _game: any): void {
        // 测试房间小 Boss（文档 6 种）：数值来自 MINI_BOSSES 单一数据源
        const miniDef = getMiniBossDef(type);
        if (miniDef) {
            this.isMiniBoss = true;
            this.color = miniDef.color; this.glowColor = miniDef.glow;
            this.maxHp = miniDef.maxHp; this.speed = miniDef.speed;
            this.damage = miniDef.damage; this.armor = miniDef.armor;
            this.radius = miniDef.radius; this.goldValue = miniDef.goldValue;
            this.label = miniDef.label; this.attackWindupMax = miniDef.attackWindupMax;
            this.visualScale = miniDef.visualScale;
            this.spriteKey = miniDef.spriteKey; this.tintColor = miniDef.tintColor;
            // 无人机不近战；锯齿剑虾常驻 +50% 移速躲避（buffSpeedMult 被移动分支消费）
            this.meleeRange = (type === 'drone_a' || type === 'drone_s') ? 0 : 40;
            if (type === 'shrimp') this.buffSpeedMult = 1.5;
            // 水母先以现形状态入场，2s 后进入隐身循环
            this._miniTimer = type === 'jelly' ? 2 : Rng.float(1, 3);
            // 步态：水栖滑行/重甲/节肢/悬浮
            this.locomotionKind = ({
                squid: 'skitter', turtle: 'heavy', shrimp: 'skitter',
                jelly: 'hover', drone_a: 'hover', drone_s: 'hover',
            } as Record<string, LocomotionKind>)[type] ?? 'biped';
            this.moveSpriteKey = `${this.spriteKey}_move`;
            this.locomotionFrameKey = '';
            this.hp = this.maxHp;
            return;
        }
        switch (type) {
            case 'grunt':
                this.color = '#ff4444'; this.glowColor = '#ff0000';
                this.maxHp = Math.floor(80 * scale); this.speed = 65; this.damage = 8; this.radius = 18;
                this.goldValue = 8; this.label = ''; this.attackWindupMax = 0.28;
                this.visualScale = 1.22;
                this.spriteKey = 'enemy_grunt'; this.tintColor = '#ffffff'; break;
            case 'shield':
                this.color = '#4488ff'; this.glowColor = '#0044cc';
                this.maxHp = Math.floor(60 * scale); this.speed = 45; this.damage = 10; this.radius = 20;
                this.maxShieldHp = Math.floor(80 * scale); this.shieldHp = this.maxShieldHp; this.shieldActive = true;
                this.goldValue = 12; this.label = '护盾兵'; this.attackWindupMax = 0.38;
                this.visualScale = 1.18;
                this.spriteKey = 'enemy_shield'; this.tintColor = '#ffffff'; break;
            case 'exploder':
                this.color = '#ff8800'; this.glowColor = '#ff4400';
                this.maxHp = Math.floor(50 * scale); this.speed = 85; this.damage = 40; this.radius = 20;
                this.deathExplode = true; this.goldValue = 10; this.label = ''; this.attackWindupMax = 0.52;
                this.visualScale = 1.20;
                // 素材错位：enemy_exploder key 实际内容(经ArtRemap重定向)对应"爆炸怪"语义。
                this.spriteKey = 'enemy_exploder'; this.tintColor = '#ffffff'; break;
            case 'golem':
                this.color = '#888888'; this.glowColor = '#aaaaaa';
                this.maxHp = Math.floor(300 * scale); this.speed = 35; this.damage = 20; this.radius = 26;
                this.armor = 25; this.goldValue = 20; this.label = '石像鬼'; this.attackWindupMax = 0.56;
                this.visualScale = 1.15;
                this.spriteKey = 'enemy_golem'; this.tintColor = '#ffffff'; break;
            case 'elite_grunt':
                this.isElite = true;
                this.color = '#ff44ff'; this.glowColor = '#cc00cc';
                this.maxHp = Math.floor(200 * scale); this.speed = 75; this.damage = 18; this.radius = 22;
                this.goldValue = 30; this.label = '精英'; this.attackWindupMax = 0.30;
                this.visualScale = 1.25;
                // 没有独立精英美术，复用grunt贴图+粉紫色调区分。
                this.spriteKey = 'enemy_grunt'; this.tintColor = '#ff88ff'; break;
            case 'archer':
                this.color = '#88ff44'; this.glowColor = '#44cc00';
                this.maxHp = Math.floor(70 * scale); this.speed = 60; this.damage = 12; this.radius = 18;
                this.goldValue = 12; this.label = '毒射手'; this.attackWindupMax = 0.4;
                this.meleeRange = 0;
                this.rangedRange = 460; this.rangedKeepDist = 300;
                this._rangedCd = Rng.float(0.8, 1.6);
                this.visualScale = 1.20;
                // 无独立美术：复用grunt贴图+绿色调区分（与elite/miniboss同套路）。
                this.spriteKey = 'enemy_grunt'; this.tintColor = '#7dff5f'; break;
            case 'miniboss':
                this.isMiniBoss = true;
                this.color = '#aa44ff'; this.glowColor = '#6600cc';
                this.maxHp = Math.floor(800 * scale); this.speed = 55; this.damage = 25; this.radius = 30;
                this.goldValue = 60; this.label = '暗影猎手'; this.attackWindupMax = 0.46;
                this.visualScale = 1.60;
                // 没有独立miniboss美术，复用boss贴图+紫色调区分。
                this.spriteKey = 'enemy_boss'; this.tintColor = '#cc88ff'; break;
        }
        this.hp = this.maxHp;
        // 步态映射（只影响渲染，与数值/碰撞无关）
        const GAIT: Record<string, LocomotionKind> = {
            grunt: 'biped', shield: 'heavy', exploder: 'skitter', golem: 'heavy',
            elite_grunt: 'biped', archer: 'biped', miniboss: 'quadruped',
        };
        this.locomotionKind = GAIT[type] ?? this.locomotionKind;
        this.moveSpriteKey = `${this.spriteKey}_move`;
        this.locomotionFrameKey = '';
    }

    private _applyMutations(game: any): void {
        const mods = game?._mutationMods || {};
        if (mods.armor)     this.armor += mods.armor;
        if (mods.speedMult) this.speed *= mods.speedMult;
        if (mods.hpMult)    { this.maxHp *= mods.hpMult; this.hp = this.maxHp; }
        if (mods.goldMult)  this.goldValue *= mods.goldMult;
        // 变异：时间裂缝 — 敌人攻速+50%，移速+30%（对齐 WaveData.ts 的 time_crack 描述）
        if (mods.timeCrack) { this.attackSpeed *= 1.5; this.speed *= 1.3; }
    }

    // ── 伤害处理 ──────────────────────────────────────────
    /** 返回实际扣血量（护盾吸收/护甲减免后），供攻击吸血按真实伤害结算。 */
    takeDamage(rawDmg: number, attacker: any, game: any): number {
        if (!this.alive || this.invulnerable) return 0;
        // 护盾先扣
        if (this.shieldActive && this.shieldHp > 0) {
            const abs = Math.min(this.shieldHp, rawDmg);
            this.shieldHp -= abs; rawDmg -= abs;
            if (this.shieldHp <= 0) this.shieldActive = false;
            game.particles?.shieldBlock(this.x, this.y, !this.shieldActive);
            if (rawDmg <= 0) return 0;
        }
        // 护甲减免（对齐 hexblast-py entities/enemy.py take_damage()：
        // 用 armor/(armor+100) 的衰减公式而非线性减法，护甲越高减伤边际递减，
        // 但任何伤害都会至少留下一部分——避免高护甲+无尽模式变异叠加后伤害被完全吃掉变成无敌。
        const mitigation = this.armor / (this.armor + 100);
        const dmg = Math.max(1, rawDmg * (1 - mitigation));
        this.hp  -= dmg;
        this.flashTimer = Math.min(0.22, 0.07 + (dmg / this.maxHp) * 0.9);

        // 打击感：屏幕震动 + 顿帧
        // 视觉/命停只需表达至100%生命的一击；超杀倍率不能继续放大半径与顿帧。
        const ratio = Math.min(1, dmg / this.maxHp);
        // 普通小额群攻只显示闪白/粒子；每个目标都震屏会让一次攻击带动整张画布抖动。
        if (this.isBoss || this.isElite || (this.maxHp >= 250 && ratio > 0.15)) {
            game.screenShake?.shake(Math.min(6, (this.isBoss ? 2 : 1) * (1.5 + ratio * 7)), Math.min(0.16, 0.05 + ratio * 0.12));
            if (ratio > 0.12 || this.isBoss) game.hitStop?.trigger(12 + ratio * 65);
        }
        // 方向粒子
        if (attacker) {
            const angle = Math.atan2(this.y - attacker.y, this.x - attacker.x);
            game.particles?.impact(this.x, this.y, angle, ratio, this.color);
        }
        game.audio?.playSfx?.('hit', this.isBoss ? 0.52 : 0.36);

        if (this.hp <= 0) this._die(attacker, game);
        return dmg;
    }

    /** Continuous damage keeps fractional DPS while still using the normal death settlement. */
    takeContinuousDamage(damage: number, attacker: any, game: any): void {
        if (!this.alive || damage <= 0) return;
        this.hp -= damage;
        if (this.hp <= 0) this._die(attacker, game);
    }

    protected _die(attacker: any, game: any): void {
        // 幂等保护：同帧多段伤害（多子弹/DoT+直伤）抢杀时只结算一次掉落与击杀数
        if (!this.alive) return;
        this.hp    = 0;
        this.alive = false;
        game.economy?.spawnDrop(this.x, this.y, this.goldValue);
        game.score    = (game.score || 0) + (this.isBoss ? 500 : this.isElite ? 50 : 10);
        game.kills    = (game.kills || 0) + 1;
        game.comboCount = (game.comboCount || 0) + 1;
        // 成就存档统计：Boss 击杀数、单局最高连击（GameManager 局末读取）
        if (this.isBoss) game.bossKills = (game.bossKills || 0) + 1;
        if (game.comboCount > (game.maxCombo || 0)) game.maxCombo = game.comboCount;
        game.comboTimer = 3;
        game.particles?.explode(this.x, this.y, this.color, this.isBoss ? 80 : 30);
        game.audio?.playSfx?.('enemy_die', this.isBoss ? 0.82 : 0.55);
        if (this.isBoss) game.audio?.playSfx?.('explode', 0.82);
        game.augmentManager?.dispatchKill(attacker, this, this.maxHp, game);
        // 大招R已改为固定30秒冷却(见PlayerController.tick)，击杀不再提供充能。
        // 变异：死亡爆炸
        if (game._mutationMods?.deathExplode || this.deathExplode) {
            game.spawnExplosion?.(attacker, this.x, this.y, this.damage * 2, 60);
        }
        // 变异：复活。旧局定时器不得向新局刷怪；最终位置仍由 GameManager
        // 的显式出生安全校正保证不会直接贴到玩家身上。
        if (game._mutationMods?.endlessSummon && Rng.chance(0.3)) {
            const runId = game.runId;
            const [x, y] = [this.x, this.y];
            setTimeout(() => {
                if (game.state === 'playing' && game.runId === runId) {
                    game.spawnEnemy?.(this.type, x, y);
                }
            }, 800);
        }
    }

    // ── 每帧更新 ──────────────────────────────────────────
    update(dt: number, player: any, game: any): void {
        if (!this.alive) return;
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        if (this._atkCd > 0) this._atkCd -= dt;

        // DoT
        for (let i = this.dots.length - 1; i >= 0; i--) {
            const d = this.dots[i];
            d.timeLeft -= dt;
            this.hp    -= d.dps * dt;
            if (this.hp <= 0) { this._die(player, game); return; }
            if (d.timeLeft <= 0) this.dots.splice(i, 1);
        }

        // 减速/冻结计时
        if (this.frozen > 0) { this.frozen -= dt; if (this.frozen <= 0) { this.frozen = 0; this.slowMult = 1; } }
        if (this._slowTimer > 0) { this._slowTimer -= dt; if (this._slowTimer <= 0) { this._slowTimer = 0; this.slowMult = 1; } }
        if (this.stunned > 0) { this.stunned -= dt; return; }

        // 混沌节拍临时增益倒计时
        if (this._buffTimer > 0) {
            this._buffTimer -= dt;
            if (this._buffTimer <= 0) { this._buffTimer = 0; this.buffSpeedMult = 1; this.buffDmgMult = 1; }
        }

        // 击退衰减
        this.knockbackX *= (1 - dt * 8);
        this.knockbackY *= (1 - dt * 8);

        // 微型冲锋（盾龟高速碰撞等）：冲锋期间不执行其他移动/攻击
        if (this._chargeT > 0) {
            this._chargeT -= dt;
            this.x += this._chargeVx * dt;
            this.y += this._chargeVy * dt;
            this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
            this.y = clamp(this.y, this.radius, PLAYFIELD_BOTTOM - this.radius);
            if (this._chargeDmg > 0 && player.alive &&
                Vec.dist(this.x, this.y, player.x, player.y) < this.radius + (player.radius ?? 16) + 8) {
                player.takeDamage(this._chargeDmg, game);
                this._chargeDmg = 0;
            }
            return;
        }

        // 测试房间小 Boss 专属技能
        if (this.isMiniBoss) this._updateMiniBoss(dt, player, game);

        // 近战攻击先进入清晰前摇。前摇期间敌人停步，玩家能读懂危险并躲开；
        // 只有结束时仍在攻击距离内才命中，避免旧版“贴近即无动画扣血”。
        if (this.attackWindup > 0) {
            this.attackWindup = Math.max(0, this.attackWindup - dt);
            if (this.attackWindup <= 0 && player.alive) {
                const atkDist = this.radius + (player.radius ?? 16) + this.meleeRange;
                const dist = Math.hypot(player.x - this.x, player.y - this.y);
                if (this.type === 'shrimp') {
                    // 锯齿剑虾·钳击：面前中等扇形横扫（±~57°），可毁坏主角召唤物/随从/分身
                    const facing = Math.atan2(this.attackTargetY - this.y, this.attackTargetX - this.x);
                    const toPlayer = Math.atan2(player.y - this.y, player.x - this.x);
                    const diff = Math.abs(Math.atan2(Math.sin(toPlayer - facing), Math.cos(toPlayer - facing)));
                    if (dist <= atkDist + 30 && diff < 1.0) {
                        game.particles?.meleeSlash?.(this.x, this.y, facing, this.glowColor, this.meleeRange + 10, 1.3);
                        game.particles?.impact?.(player.x, player.y, facing, 0.8, this.color);
                        player.takeDamage(this.damage * this.buffDmgMult * 0.55, game); // 25/45
                        for (const t of (game.turrets || [])) {
                            if (t.alive && Vec.dist(t.x, t.y, this.x, this.y) < atkDist + 30) t.alive = false;
                        }
                    }
                } else if (dist <= atkDist + 10) {
                    const angle = Math.atan2(player.y - this.y, player.x - this.x);
                    // 前摇结束再挥出剑气并结算伤害，避免贴脸瞬间扣血。
                    game.particles?.meleeSlash?.(this.x, this.y, angle, this.color, this.meleeRange, 0.85);
                    game.particles?.impact(player.x, player.y, angle, 0.35, this.color);
                    player.takeDamage(this.damage * this.buffDmgMult, game);
                }
            }
            return;
        }

        // 向玩家移动；远程单位改为与玩家拉扯保持距离，并在射程内发射毒弹
        const [dx, dy] = Vec.normalize(player.x - this.x, player.y - this.y);
        const spd = this.speed * (this.frozen > 0 ? 0 : this.slowMult) * this.buffSpeedMult;
        let mvx = dx, mvy = dy;
        if (this.rangedRange > 0) {
            const dist = Math.hypot(player.x - this.x, player.y - this.y);
            if (dist < this.rangedKeepDist - 60) { mvx = -dx; mvy = -dy; }      // 太近 → 后撤
            else if (dist <= this.rangedKeepDist + 40) { mvx = 0; mvy = 0; }    // 舒适区 → 停步开火
            if (this._rangedCd > 0) {
                this._rangedCd -= dt;
            } else if (player.alive && dist <= this.rangedRange && this.frozen <= 0) {
                const a = Math.atan2(player.y - this.y, player.x - this.x);
                game.enemyBullets?.push({
                    x: this.x, y: this.y,
                    vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
                    damage: this.damage * this.buffDmgMult, radius: 9,
                    color: '#88ff44', life: 3, lifeTime: 3,
                    owner: 'enemy', isEnemyBullet: true, enemyFx: 'poison',
                });
                this._rangedCd = 2.2;
            }
        }
        this.x += (mvx * spd + this.knockbackX) * dt;
        this.y += (mvy * spd + this.knockbackY) * dt;
        this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
        this.y = clamp(this.y, this.radius, PLAYFIELD_BOTTOM - this.radius);

        // 近战攻击：进入攻击范围且冷却完毕才对玩家造成伤害
        // （对齐 hexblast-py 的 entities/enemy.py _move() 近战判定；
        //  远程/纯AOE单位可将 meleeRange 设为0来禁用此逻辑）
        if (this.meleeRange > 0 && this._atkCd <= 0 && player.alive) {
            const atkDist = this.radius + (player.radius ?? 16) + this.meleeRange;
            const dist = Math.hypot(player.x - this.x, player.y - this.y);
            if (dist <= atkDist) {
                this._atkCd = 1 / Math.max(0.01, this.attackSpeed);
                this.attackWindup = this.attackWindupMax;
                this.attackTargetX = player.x;
                this.attackTargetY = player.y;
            }
        }
    }

    // ── 测试房间小 Boss 专属技能（文档 boss.docx） ──────────

    private _updateMiniBoss(dt: number, player: any, game: any): void {
        switch (this.type) {
            case 'squid':    this._miniBossSquid(dt, player, game); break;
            case 'turtle':   this._miniBossTurtle(dt, player, game); break;
            case 'shrimp':   this._miniBossShrimp(dt, player, game); break;
            case 'jelly':    this._miniBossJelly(dt, player, game); break;
            case 'drone_a':  this._miniBossDroneA(dt, player, game); break;
            case 'drone_s':  this._miniBossDroneS(dt, player, game); break;
        }
    }

    /** 深海鱿鱼（史诗）：缠绕 / 深水炸弹 / 分裂水刺；放完一轮技能（累计3个）后自毁消失。 */
    private _miniBossSquid(dt: number, player: any, game: any): void {
        this._miniCd1 -= dt; this._miniCd2 -= dt; this._miniTimer -= dt;
        if (!player.alive) return;
        // 技能2 深水炸弹：水弹射向主角，命中 20 伤害；反弹 1 次，第二次撞边直接爆炸
        if (this._miniCd2 <= 0) {
            this._miniCd2 = 4;
            this._miniSkillCount++;
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            game.enemyBullets?.push({
                x: this.x, y: this.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
                damage: this.damage * 0.5, radius: 12, color: '#33ccff',
                life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true, enemyFx: 'poison',
                bounceLeft: 1, bounceExplode: true,
            });
        }
        // 技能3 分裂水刺：向前 3 发 10 伤害
        if (this._miniTimer <= 0) {
            this._miniTimer = 5;
            this._miniSkillCount++;
            const base = Math.atan2(player.y - this.y, player.x - this.x);
            for (let i = -1; i <= 1; i++) {
                const a = base + i * 0.28;
                game.enemyBullets?.push({
                    x: this.x, y: this.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                    damage: this.damage * 0.25, radius: 7, color: '#66ddff',
                    life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true,
                });
            }
        }
        // 技能1 缠绕：贴脸触发，控制主角 2 秒
        if (this._miniCd1 <= 0 &&
            Vec.dist(this.x, this.y, player.x, player.y) < this.radius + (player.radius ?? 16) + 20) {
            this._miniCd1 = 8;
            this._miniSkillCount++;
            player.applyBuff?.('squid_grab', 2, { noMove: true });
            game.particles?.hexActivate?.(player.x, player.y, '#33ccff');
            game.floatingText?.spawn?.(player.x, player.y - 50, '缠绕！', '#33ccff', 18, true);
        }
        // 放完一轮技能后自毁消失（消耗水柱召唤的一次性单位，不长期占场）
        if (this._miniSkillCount >= 3) {
            this._miniSkillCount = 0;
            game.particles?.explode?.(this.x, this.y, '#33ccff', 60);
            game.floatingText?.spawn?.(this.x, this.y - 40, '技能释放完毕', '#33ccff', 14, true);
            game.audio?.playSfx?.('explode', 0.7);
            this._die(player, game);
        }
    }

    /** 盾龟（普通）：被动护盾 / 高速碰撞。 */
    private _miniBossTurtle(dt: number, player: any, game: any): void {
        this._miniTimer -= dt; this._miniCd1 -= dt;
        // 技能1 被动：附近有其他小兵则生成 100 护盾
        if (this._miniTimer <= 0) {
            this._miniTimer = 1;
            if (this.shieldHp <= 0) {
                const hasAlly = (game.enemies || []).some((e: any) =>
                    e !== this && !e.dead && Vec.dist(e.x, e.y, this.x, this.y) < 220);
                if (hasAlly) {
                    this.maxShieldHp = 100; this.shieldHp = 100; this.shieldActive = true;
                    game.particles?.shieldBlock?.(this.x, this.y, false);
                    game.floatingText?.spawn?.(this.x, this.y - 46, '龟壳护盾', '#55ff77', 14, true);
                }
            }
        }
        // 技能2 高速碰撞：加速 20% 向主角冲击，命中 10 伤害
        if (this._miniCd1 <= 0 && player.alive) {
            this._miniCd1 = 6;
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            this._chargeVx = Math.cos(a) * this.speed * 1.2;
            this._chargeVy = Math.sin(a) * this.speed * 1.2;
            this._chargeT = 0.6;
            this._chargeDmg = 10;
            game.particles?.impact?.(this.x, this.y, a, 0.9, this.glowColor);
            game.floatingText?.spawn?.(this.x, this.y - 46, '高速碰撞！', '#55ff77', 14, true);
        }
    }

    /** 锯齿剑虾（地狱）：扇形钳击在近战前摇分支；尖刺弹/甩击在此。 */
    private _miniBossShrimp(dt: number, player: any, game: any): void {
        this._miniCd1 -= dt; this._miniCd2 -= dt;
        if (!player.alive) return;
        // 技能2 发射尖刺：可破盾并造成 20 伤害
        if (this._miniCd1 <= 0) {
            this._miniCd1 = 4.5;
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            game.enemyBullets?.push({
                x: this.x, y: this.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
                damage: this.damage * 0.45, radius: 9, color: '#ffaa66',
                life: 3.5, lifeTime: 3.5, owner: 'enemy', isEnemyBullet: true,
                pierceShield: true,
            });
        }
        // 技能4 甩击：近身触发，30 伤害 + 主角眩晕 1.5 秒
        if (this._miniCd2 <= 0 &&
            Vec.dist(this.x, this.y, player.x, player.y) < this.radius + (player.radius ?? 16) + 16) {
            this._miniCd2 = 8;
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            game.particles?.meleeSlash?.(this.x, this.y, angle, this.glowColor, this.meleeRange + 10, 1.4);
            player.takeDamage(this.damage * this.buffDmgMult * 0.67, game); // 30/45
            player.applyBuff?.('shrimp_stun', 1.5, { noMove: true });
            game.floatingText?.spawn?.(player.x, player.y - 50, '眩晕！', '#ffcc66', 18, true);
        }
    }

    /** 毒刺鬼水母（普通）：隐身循环 / 毒刺 DoT。 */
    private _miniBossJelly(dt: number, player: any, game: any): void {
        this._miniTimer -= dt; this._miniCd1 -= dt;
        // 技能1 隐身 3 秒并免疫伤害（简化：全免——敌弹无来源过滤做不了只免远程）
        if (this._miniTimer <= 0) {
            this.invisible = !this.invisible;
            this.invulnerable = this.invisible;
            this._miniTimer = this.invisible ? 3 : 2;
            if (this.invisible) {
                game.floatingText?.spawn?.(this.x, this.y - 40, '隐身…', '#cc88ff', 14, true);
            }
        }
        // 技能2 毒刺：命中挂 5 秒 DoT（每秒 3 伤害，可叠加）
        if (this._miniCd1 <= 0 && player.alive && !this.invisible) {
            this._miniCd1 = 5;
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            game.enemyBullets?.push({
                x: this.x, y: this.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
                damage: this.damage * 0.1, radius: 8, color: '#cc66ff',
                life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true,
                dot: { dps: 3, dur: 5, color: '#cc66ff' },
            });
        }
    }

    /** 攻击性无人机（普通）：声波破盾 / 锁定光束 DoT。 */
    private _miniBossDroneA(dt: number, player: any, game: any): void {
        this._miniCd1 -= dt; this._miniCd2 -= dt;
        if (!player.alive) return;
        // 技能1 声波攻击：让主角护盾失效（破盾）+ 伤害
        if (this._miniCd1 <= 0) {
            this._miniCd1 = 3.5;
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            game.enemyBullets?.push({
                x: this.x, y: this.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                damage: this.damage * 0.4, radius: 9, color: '#ff8888',
                life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true,
                pierceShield: true,
            });
        }
        // 技能2 高能光束：锁定弹，命中挂 3 秒 DoT（每秒 4 伤害）
        if (this._miniCd2 <= 0) {
            this._miniCd2 = 6;
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            game.enemyBullets?.push({
                x: this.x, y: this.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
                damage: 1, radius: 7, color: '#ff5555',
                life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true, homing: true,
                dot: { dps: 4, dur: 3, color: '#ff5555' },
            });
        }
    }

    /** 支援型无人机（史诗）：治疗 / 能量盾 / 召唤攻击性无人机。 */
    private _miniBossDroneS(dt: number, player: any, game: any): void {
        this._miniCd1 -= dt; this._miniCd2 -= dt; this._miniTimer -= dt;
        // 技能3 召唤 5 个攻击性无人机（环绕散布）
        if (this._miniTimer <= 0) {
            this._miniTimer = 10;
            for (let i = 0; i < 5; i++) {
                const a = Rng.float(0, Math.PI * 2);
                game.spawnEnemy?.('drone_a', this.x + Math.cos(a) * 90, this.y + Math.sin(a) * 90);
            }
            game.floatingText?.spawn?.(this.x, this.y - 46, '呼叫无人机支援！', '#ff8888', 16, true);
        }
        // 技能1 对附近随机 5~10 个怪物治疗 40~60 血
        if (this._miniCd1 <= 0) {
            this._miniCd1 = 6;
            const targets = this._nearbyAllies(game, 300);
            const n = Math.min(targets.length, Rng.int(5, 10));
            for (let i = 0; i < n; i++) {
                const t = targets[i];
                t.hp = Math.min(t.maxHp, t.hp + Rng.int(40, 60));
                game.particles?.heal?.(t.x, t.y);
            }
            game.audio?.playSfx?.('heal');
            game.floatingText?.spawn?.(this.x, this.y - 46, '治疗支援', '#55ff88', 14, true);
        }
        // 技能2 对附近随机 5~10 个怪物挂 150 能量盾
        if (this._miniCd2 <= 0) {
            this._miniCd2 = 8;
            const targets = this._nearbyAllies(game, 300);
            const n = Math.min(targets.length, Rng.int(5, 10));
            for (let i = 0; i < n; i++) {
                const t = targets[i];
                t.maxShieldHp = 150; t.shieldHp = 150; t.shieldActive = true;
                game.particles?.shieldBlock?.(t.x, t.y, false);
            }
            game.floatingText?.spawn?.(this.x, this.y - 46, '能量盾部署', '#66ccff', 14, true);
        }
    }

    /** 周围存活友军（支援型无人机治疗/护盾目标）。 */
    private _nearbyAllies(game: any, radius: number): EnemyBase[] {
        const out: EnemyBase[] = [];
        for (const e of (game.enemies || [])) {
            if (e !== this && !e.dead && Vec.dist(e.x, e.y, this.x, this.y) <= radius) out.push(e);
        }
        return out;
    }

    // ── 随机边缘刷怪位置 ──────────────────────────────────
    static randomEdgePos(radius = 20): [number, number] {
        const side = Rng.int(0, 3);
        switch (side) {
            case 0: return [Rng.float(radius, CANVAS_W - radius), -radius];
            case 1: return [Rng.float(radius, CANVAS_W - radius), PLAYFIELD_BOTTOM + radius];
            case 2: return [-radius, Rng.float(radius, PLAYFIELD_BOTTOM - radius)];
            default: return [CANVAS_W + radius, Rng.float(radius, PLAYFIELD_BOTTOM - radius)];
        }
    }

    /** Keep scripted in-arena spawns away from the player while staying inside the arena. */
    static safeSpawnPos(
        x: number, y: number, radius: number,
        playerX: number, playerY: number, minDistance: number,
    ): [number, number] {
        const sx = clamp(x, radius, CANVAS_W - radius);
        const sy = clamp(y, radius, PLAYFIELD_BOTTOM - radius);
        if (Vec.dist2(sx, sy, playerX, playerY) >= minDistance * minDistance) return [sx, sy];

        const baseAngle = Math.atan2(sy - playerY, sx - playerX);
        let bestX = sx, bestY = sy, bestDist2 = -1;
        for (let i = 0; i < 8; i++) {
            const angle = baseAngle + (i / 8) * Math.PI * 2;
            const cx = clamp(playerX + Math.cos(angle) * minDistance, radius, CANVAS_W - radius);
            const cy = clamp(playerY + Math.sin(angle) * minDistance, radius, PLAYFIELD_BOTTOM - radius);
            const dist2 = Vec.dist2(cx, cy, playerX, playerY);
            if (dist2 > bestDist2) { bestX = cx; bestY = cy; bestDist2 = dist2; }
        }
        return [bestX, bestY];
    }

    /** Convenience getter used by GameManager render/update loops. */
    get dead(): boolean { return !this.alive; }

    /** Node/Sprite refs set by GameManager.spawnEnemy() — used for Sprite-based rendering. */
    node?: Node;
    sprite?: Sprite;
}
