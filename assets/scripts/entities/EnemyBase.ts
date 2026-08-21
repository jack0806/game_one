// ============================================================
//  EnemyBase.ts — 敌人基类 + 5种敌人类型
// ============================================================
import type { Node, Sprite } from 'cc';
import { Vec, Rng, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';

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
        this._applyTypeDef(type, scale, game);
        this._applyMutations(game);
        // 精英增强
        if (this.isElite) { this.maxHp *= 3; this.hp = this.maxHp; this.damage *= 1.5; this.goldValue *= 3; }
    }

    private _applyTypeDef(type: string, scale: number, _game: any): void {
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
        if (!this.alive) return 0;
        // 护盾先扣
        if (this.shieldActive && this.shieldHp > 0) {
            const abs = Math.min(this.shieldHp, rawDmg);
            this.shieldHp -= abs; rawDmg -= abs;
            if (this.shieldHp <= 0) this.shieldActive = false;
            if (rawDmg <= 0) { game.particles?.shieldBlock(this.x, this.y); return 0; }
        }
        // 护甲减免（对齐 hexblast-py entities/enemy.py take_damage()：
        // 用 armor/(armor+100) 的衰减公式而非线性减法，护甲越高减伤边际递减，
        // 但任何伤害都会至少留下一部分——避免高护甲+无尽模式变异叠加后伤害被完全吃掉变成无敌。
        const mitigation = this.armor / (this.armor + 100);
        const dmg = Math.max(1, rawDmg * (1 - mitigation));
        this.hp  -= dmg;
        this.flashTimer = Math.min(0.22, 0.07 + (dmg / this.maxHp) * 0.9);

        // 打击感：屏幕震动 + 顿帧
        const ratio = dmg / this.maxHp;
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
        game.comboTimer = 3;
        game.particles?.explode(this.x, this.y, this.color, this.isBoss ? 80 : 30);
        game.audio?.playSfx?.('enemy_die', this.isBoss ? 0.82 : 0.55);
        if (this.isBoss) game.audio?.playSfx?.('explode', 0.82);
        game.augmentManager?.dispatchKill(attacker, this, this.maxHp, game);
        attacker?.addUltCharge?.(0.12);
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

        // 近战攻击先进入清晰前摇。前摇期间敌人停步，玩家能读懂危险并躲开；
        // 只有结束时仍在攻击距离内才命中，避免旧版“贴近即无动画扣血”。
        if (this.attackWindup > 0) {
            this.attackWindup = Math.max(0, this.attackWindup - dt);
            if (this.attackWindup <= 0 && player.alive) {
                const atkDist = this.radius + (player.radius ?? 16) + this.meleeRange;
                const dist = Math.hypot(player.x - this.x, player.y - this.y);
                if (dist <= atkDist + 10) {
                    const angle = Math.atan2(player.y - this.y, player.x - this.x);
                    // 前摇结束再挥出剑气并结算伤害，避免贴脸瞬间扣血。
                    game.particles?.meleeSlash?.(this.x, this.y, angle, this.color, this.meleeRange, 0.85);
                    game.particles?.impact(player.x, player.y, angle, 0.35, this.color);
                    player.takeDamage(this.damage * this.buffDmgMult, game);
                }
            }
            return;
        }

        // 向玩家移动
        const [dx, dy] = Vec.normalize(player.x - this.x, player.y - this.y);
        const spd = this.speed * (this.frozen > 0 ? 0 : this.slowMult) * this.buffSpeedMult;
        this.x += (dx * spd + this.knockbackX) * dt;
        this.y += (dy * spd + this.knockbackY) * dt;
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
