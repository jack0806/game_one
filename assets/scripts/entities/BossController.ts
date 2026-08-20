// ============================================================
//  BossController.ts — Boss（4章节 × 3阶段）
// ============================================================
import { Vec, Rng, clamp } from '../core/MathUtils';
import { EnemyBase } from './EnemyBase';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';

export class BossController extends EnemyBase {
    phase        = 1;
    enraged      = false;
    _animTime    = 0;
    _skillTimer  = 3;
    _summonTimer = 8;
    _chargeCd    = 12;
    isCharging   = false;
    chargeWindup = 0;
    chargeWindupMax = 0.78;
    chargeTargetX = 0;
    chargeTargetY = 0;
    skillWindup = 0;
    skillWindupMax = 0.52;
    _chargeVx    = 0;
    _chargeVy    = 0;
    private _chargeTime = 0;
    private _contactCd = 0;

    override init(type: string, wave: number, game: any): void {
        this.isBoss = true;
        this.type   = 'boss';
        this.chapter = Math.ceil(wave / 10);
        this.alive  = true;
        this.dots   = [];
        this.frozen = 0; this.slowMult = 1;
        this.phase  = 1; this.enraged = false; this._animTime = 0;
        this._skillTimer = 2.5; this._summonTimer = 7; this._chargeCd = 10;
        this.isCharging = false; this.chargeWindup = 0; this.skillWindup = 0;
        this.attackWindup = 0; this._chargeTime = 0;
        this._setupForChapter(this.chapter);
    }

    /** Called by GameManager.spawnEnemy('boss') — chapter is 0-based. */
    initBoss(chapter: number, game: any): void {
        this.init('boss', (chapter + 1) * 10, game);
    }

    private _setupForChapter(ch: number): void {
        const tbl = [
            { maxHp: 3000, damage: 42, speed: 62, color: '#cc3300', glow: '#ff0000',   label: '废土领主·腐肉'    },
            // 熔炉橙：钢蓝工厂背景下蓝色 Boss 几乎隐形（视觉评审 2026-08-18），改互补暖色
            { maxHp: 5500, damage: 66, speed: 68, color: '#cc7a33', glow: '#ffaa44',   label: '钢铁之王·熔炉'    },
            { maxHp: 9000, damage: 94, speed: 74, color: '#00cc88', glow: '#00ffcc',   label: '海克斯异变体·无限核' },
            { maxHp:14000, damage:132, speed: 80, color: '#8800cc', glow: '#cc44ff',   label: '混沌深渊·终焉之门' },
        ];
        const t = tbl[Math.min(ch - 1, 3)];
        this.maxHp     = t.maxHp; this.hp        = t.maxHp;
        this.damage    = t.damage; this.speed     = t.speed;
        this.color     = t.color;  this.glowColor  = t.glow;
        this.label     = t.label;
        this.radius    = 45;
        this.goldValue = 200 * ch;
        this.armor     = 10 * ch;
        // 四章各有独立轮廓/材质的 Boss 贴图，不能再靠同一白模染色冒充换装。
        // glowColor 继续承担预警、弹幕和 HUD 主题色，Sprite 本体保持原画色。
        this.spriteKey = `enemy_boss_ch${Math.min(ch, 4)}`;
        this.tintColor = '#ffffff';
        // Boss 应该有明显区别于场上最大常规怪(miniboss, radius=30)的体型压迫感，
        // 但 radius 本身被碰撞判定/近战距离/边界clamp直接消费（见 update() 的近战
        // 判定和 clamp 调用），不能直接调大，否则会连带把命中体积也放大破坏平衡。
        // 这里用只影响渲染直径的 visualScale 纯视觉放大，判定范围保持不变。
        this.visualScale = 2.0;
        this.attackWindupMax = 0.42;
    }

    // ── 每帧更新 ──────────────────────────────────────────
    override update(dt: number, player: any, game: any): void {
        if (!this.alive) return;
        this._animTime += dt;
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        this._contactCd = Math.max(0, this._contactCd - dt);

        // DoT（对齐 hexblast-py entities/boss.py update()：DoT把血打空时也要触发死亡，
        // 之前只扣血从不检查hp<=0，boss会一直"活着"卡在0血不消失）
        for (let i = this.dots.length - 1; i >= 0; i--) {
            const d = this.dots[i];
            d.timeLeft -= dt;
            this.hp    -= d.dps * dt;
            if (d.timeLeft <= 0) this.dots.splice(i, 1);
        }
        if (this.hp <= 0 && this.alive) { this._die(player, game); return; }

        // 减速计时衰减（对齐 hexblast-py：EnemyBase同款逻辑之前被BossController的
        // override完全吞掉，导致boss身上的减速一旦生效就永远不会恢复到slowMult=1）
        if (this._slowTimer > 0) { this._slowTimer -= dt; if (this._slowTimer <= 0) { this._slowTimer = 0; this.slowMult = 1; } }
        if (this.frozen > 0) { this.frozen -= dt; if (this.frozen <= 0) this.frozen = 0; return; }

        // 阶段判断
        const pct = this.hp / this.maxHp;
        if (pct < 0.33 && this.phase < 3) this._enterPhase(3, game);
        else if (pct < 0.66 && this.phase < 2) this._enterPhase(2, game);

        // Boss技能先给出能量环前摇，再发射弹幕，避免子弹凭空出现。
        if (this.skillWindup > 0) {
            this.skillWindup = Math.max(0, this.skillWindup - dt);
            if (this.skillWindup <= 0) this._useSkill(player, game);
        }

        // 冲刺先锁定路线并蓄力，再进入冲刺移动。
        if (this.chargeWindup > 0) {
            this.chargeWindup = Math.max(0, this.chargeWindup - dt);
            if (this.chargeWindup <= 0) {
                this.isCharging = true;
                this._chargeTime = 0.8;
            }
        } else if (this.isCharging) {
            this.x += this._chargeVx * dt;
            this.y += this._chargeVy * dt;
            this._chargeTime -= dt;
            if (this.x < this.radius || this.x > CANVAS_W - this.radius) this._chargeVx *= -1;
            if (this.y < this.radius || this.y > PLAYFIELD_BOTTOM - this.radius) this._chargeVy *= -1;
            this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
            this.y = clamp(this.y, this.radius, PLAYFIELD_BOTTOM - this.radius);
            if (this._chargeTime <= 0) this.isCharging = false;
        } else {
            // 普通追逐（对齐 hexblast-py：追逐速度要乘slowMult，之前完全没接线，
            // 导致减速类词条/技能对boss完全无效）
            const [dx, dy] = Vec.normalize(player.x - this.x, player.y - this.y);
            this.x += dx * this.speed * this.slowMult * dt;
            this.y += dy * this.speed * this.slowMult * dt;
            this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
            this.y = clamp(this.y, this.radius, PLAYFIELD_BOTTOM - this.radius);
        }

        // 技能计时
        this._skillTimer  -= dt;
        this._summonTimer -= dt;
        this._chargeCd    -= dt;

        if (this._skillTimer <= 0 && this.skillWindup <= 0) {
            this._skillTimer = Math.max(2.2, 5 - this.phase * 0.8);
            this.skillWindup = this.skillWindupMax;
        }
        if (this._summonTimer <= 0) { this._summonTimer = Math.max(7, 12 - this.phase); this._summon(game); }
        if (this._chargeCd <= 0 && !this.isCharging && this.chargeWindup <= 0) {
            this._chargeCd = Math.max(7, 10 - this.phase);
            this._startCharge(player);
        }

        // 接触攻击也必须经过可见前摇；玩家在结算前离开碰撞范围即可躲避。
        if (this.attackWindup > 0) {
            this.attackWindup = Math.max(0, this.attackWindup - dt);
            if (this.attackWindup <= 0 &&
                Vec.dist(this.x, this.y, player.x, player.y) < this.radius + player.radius + 12) {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                game.particles?.meleeSlash?.(this.x, this.y, angle, this.glowColor, this.radius + player.radius, 1.8);
                game.particles?.impact(player.x, player.y, angle, 0.7, this.glowColor);
                player.takeDamage(this.damage, game);
            }
        } else if (Vec.dist(this.x, this.y, player.x, player.y) < this.radius + player.radius && this._contactCd <= 0) {
            this._contactCd = 0.65;
            this.attackWindup = this.attackWindupMax;
            this.attackTargetX = player.x;
            this.attackTargetY = player.y;
        }
    }

    private _enterPhase(phase: number, game: any): void {
        this.phase   = phase;
        this.enraged = true;
        this.speed  *= 1.2;
        game.screenShake?.shake(10, 0.32);
        game.floatingText?.spawn(640, 200, `⚠ PHASE ${phase} ⚠`, this.glowColor, 28, true);
        game.particles?.hexActivate(this.x, this.y, this.glowColor);
    }

    private _useSkill(player: any, game: any): void {
        switch (this.chapter) {
            case 1: // 废土：毒液 DOT 圆
                game.particles?.explode(this.x, this.y, '#44ff00', 100);
                for (const e of (game.enemies || [])) { /* friendly fire */ }
                // 向玩家发射3发毒球
                for (let i = -1; i <= 1; i++) {
                    const a = Math.atan2(player.y - this.y, player.x - this.x) + i * 0.3;
                    game.enemyBullets?.push({ x: this.x, y: this.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, damage: this.damage * 0.6, radius: 10, color: '#44ff00', life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'poison' });
                }
                break;
            case 2: // 钢铁：齿轮弹
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + this._animTime;
                    game.enemyBullets?.push({ x: this.x, y: this.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, damage: this.damage * 0.5, radius: 10, color: '#ffad42', life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'gear' });
                }
                break;
            case 3: // 海克斯：追踪弹
                { const [dx, dy] = Vec.normalize(player.x - this.x, player.y - this.y);
                  game.enemyBullets?.push({ x: this.x, y: this.y, vx: dx * 300, vy: dy * 300, damage: this.damage * 0.8, radius: 13, color: '#ff4da6', life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true, homing: true, enemyFx: 'homing' }); }
                break;
            case 4: // 混沌：随机多弹
                for (let i = 0; i < 12; i++) {
                    const a = Rng.float(0, Math.PI * 2);
                    game.enemyBullets?.push({ x: this.x, y: this.y, vx: Math.cos(a) * Rng.float(150, 350), vy: Math.sin(a) * Rng.float(150, 350), damage: this.damage * 0.7, radius: 11, color: '#ffe066', life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'chaos' });
                }
                break;
        }
    }

    private _summon(game: any): void {
        const count = this.phase;
        const angleOffset = Rng.float(0, Math.PI * 2);
        for (let i = 0; i < count; i++) {
            const angle = angleOffset + (i / count) * Math.PI * 2;
            const sx = this.x + Math.cos(angle) * 120;
            const sy = this.y + Math.sin(angle) * 120;
            game.spawnEnemy?.('grunt', sx, sy);
        }
    }

    private _startCharge(player: any): void {
        const [dx, dy] = Vec.normalize(player.x - this.x, player.y - this.y);
        this._chargeVx = dx * this.speed * 3;
        this._chargeVy = dy * this.speed * 3;
        this.chargeTargetX = player.x;
        this.chargeTargetY = player.y;
        this.chargeWindup = this.chargeWindupMax;
    }

    /** 用于 HUD 绘制的 HP 信息 */
    getHPRatio(): number { return this.hp / this.maxHp; }

    /** BossController.label → exposed as .name for HUD/GameManager */
    get name(): string { return this.label; }
}
