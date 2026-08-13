// ============================================================
//  BossController.ts — Boss（4章节 × 3阶段）
// ============================================================
import { Vec, Rng, clamp } from '../core/MathUtils';
import { EnemyBase } from './EnemyBase';
import { CANVAS_W, CANVAS_H } from '../core/Constants';

export class BossController extends EnemyBase {
    phase        = 1;
    enraged      = false;
    _animTime    = 0;
    _skillTimer  = 3;
    _summonTimer = 8;
    _chargeCd    = 12;
    isCharging   = false;
    _chargeVx    = 0;
    _chargeVy    = 0;

    override init(type: string, wave: number, game: any): void {
        this.isBoss = true;
        this.type   = 'boss';
        this.chapter = Math.ceil(wave / 10);
        this.alive  = true;
        this.dots   = [];
        this.frozen = 0; this.slowMult = 1;
        this.phase  = 1; this.enraged = false; this._animTime = 0;
        this._skillTimer = 3; this._summonTimer = 8; this._chargeCd = 12;
        this._setupForChapter(this.chapter);
    }

    /** Called by GameManager.spawnEnemy('boss') — chapter is 0-based. */
    initBoss(chapter: number, game: any): void {
        this.init('boss', (chapter + 1) * 10, game);
    }

    private _setupForChapter(ch: number): void {
        const tbl = [
            { maxHp: 3000, damage: 30, speed: 55, color: '#cc3300', glow: '#ff0000',   label: '废土领主·腐肉'    },
            { maxHp: 5500, damage: 48, speed: 60, color: '#4488cc', glow: '#00ccff',   label: '钢铁之王·熔炉'    },
            { maxHp: 9000, damage: 70, speed: 65, color: '#00cc88', glow: '#00ffcc',   label: '海克斯异变体·无限核' },
            { maxHp:14000, damage:100, speed: 70, color: '#8800cc', glow: '#cc44ff',   label: '混沌深渊·终焉之门' },
        ];
        const t = tbl[Math.min(ch - 1, 3)];
        this.maxHp     = t.maxHp; this.hp        = t.maxHp;
        this.damage    = t.damage; this.speed     = t.speed;
        this.color     = t.color;  this.glowColor  = t.glow;
        this.label     = t.label;
        this.radius    = 45;
        this.goldValue = 200 * ch;
        this.armor     = 10 * ch;
        // 只有一张boss美术资源(enemy_boss)，按章节用glow色调tint区分外观。
        this.spriteKey = 'enemy_boss';
        this.tintColor = t.glow;
        // Boss 应该有明显区别于场上最大常规怪(miniboss, radius=30)的体型压迫感，
        // 但 radius 本身被碰撞判定/近战距离/边界clamp直接消费（见 update() 的近战
        // 判定和 clamp 调用），不能直接调大，否则会连带把命中体积也放大破坏平衡。
        // 这里用只影响渲染直径的 visualScale 纯视觉放大，判定范围保持不变。
        this.visualScale = 1.8;
    }

    // ── 每帧更新 ──────────────────────────────────────────
    override update(dt: number, player: any, game: any): void {
        if (!this.alive) return;
        this._animTime += dt;
        this.flashTimer = Math.max(0, this.flashTimer - dt);

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

        // 冲刺移动
        if (this.isCharging) {
            this.x += this._chargeVx * dt;
            this.y += this._chargeVy * dt;
            if (this.x < this.radius || this.x > CANVAS_W - this.radius) this._chargeVx *= -1;
            if (this.y < this.radius || this.y > CANVAS_H - this.radius) this._chargeVy *= -1;
            this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
            this.y = clamp(this.y, this.radius, CANVAS_H - this.radius);
        } else {
            // 普通追逐（对齐 hexblast-py：追逐速度要乘slowMult，之前完全没接线，
            // 导致减速类词条/技能对boss完全无效）
            const [dx, dy] = Vec.normalize(player.x - this.x, player.y - this.y);
            this.x += dx * this.speed * this.slowMult * dt;
            this.y += dy * this.speed * this.slowMult * dt;
            this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
            this.y = clamp(this.y, this.radius, CANVAS_H - this.radius);
        }

        // 技能计时
        this._skillTimer  -= dt;
        this._summonTimer -= dt;
        this._chargeCd    -= dt;

        if (this._skillTimer <= 0) { this._skillTimer = 5 - this.phase; this._useSkill(player, game); }
        if (this._summonTimer <= 0) { this._summonTimer = 12; this._summon(game); }
        if (this._chargeCd <= 0) { this._chargeCd = 10; this._startCharge(player); }

        // 近战伤害
        if (Vec.dist(this.x, this.y, player.x, player.y) < this.radius + player.radius) {
            player.takeDamage(this.damage * dt * 3, game);
        }
    }

    private _enterPhase(phase: number, game: any): void {
        this.phase   = phase;
        this.enraged = true;
        this.speed  *= 1.2;
        game.screenShake?.shake(20, 0.6);
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
                    game.enemyBullets?.push({ x: this.x, y: this.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, damage: this.damage * 0.6, radius: 10, color: '#44ff00', life: 3, owner: 'enemy', isEnemyBullet: true });
                }
                break;
            case 2: // 钢铁：齿轮弹
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + this._animTime;
                    game.enemyBullets?.push({ x: this.x, y: this.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, damage: this.damage * 0.5, radius: 8, color: '#4488cc', life: 3, owner: 'enemy', isEnemyBullet: true });
                }
                break;
            case 3: // 海克斯：追踪弹
                { const [dx, dy] = Vec.normalize(player.x - this.x, player.y - this.y);
                  game.enemyBullets?.push({ x: this.x, y: this.y, vx: dx * 300, vy: dy * 300, damage: this.damage * 0.8, radius: 12, color: '#00ffcc', life: 4, owner: 'enemy', isEnemyBullet: true, homing: true }); }
                break;
            case 4: // 混沌：随机多弹
                for (let i = 0; i < 12; i++) {
                    const a = Rng.float(0, Math.PI * 2);
                    game.enemyBullets?.push({ x: this.x, y: this.y, vx: Math.cos(a) * Rng.float(150, 350), vy: Math.sin(a) * Rng.float(150, 350), damage: this.damage * 0.7, radius: 9, color: '#cc44ff', life: 3, owner: 'enemy', isEnemyBullet: true });
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
        this.isCharging = true;
        setTimeout(() => { this.isCharging = false; }, 800);
    }

    /** 用于 HUD 绘制的 HP 信息 */
    getHPRatio(): number { return this.hp / this.maxHp; }

    /** BossController.label → exposed as .name for HUD/GameManager */
    get name(): string { return this.label; }
}
