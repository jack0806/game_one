// ============================================================
//  BossController.ts — Boss（4章节 × 3阶段）
// ============================================================
import { Vec, Rng, clamp } from '../core/MathUtils';
import { EnemyBase } from './EnemyBase';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';
import { getBossDef, TEST_BOSSES } from '../data/BossDB';
import { resetLocomotion } from '../core/Locomotion';
import { resetDirectionalFacing } from '../core/DirectionalFacing';

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

    /** 测试房间专属 Boss 技能集（'mech' | 'abyss'），正式章节 Boss 无此字段。 */
    bossKind?: string;
    // mech 状态
    mechSlashT = 0;            // 横劈前摇剩余
    mechSlashAngle = 0;        // 高亮扇形朝向（开局锁定主角方向）
    mechSkyT = 0;              // 飞空坠击剩余（>0 时在天上，无敌且不移动）
    mechSkyTargetX = 0;
    mechSkyTargetY = 0;
    mechBuffT = 0;             // 光剑增伤剩余
    private _mechSlashCd = 3;
    // abyss 状态
    /** 海之霸主激活期间：主角每受一次伤害 boss 生成 20% 血量护盾（GameManager.onPlayerHit 读取）。 */
    abyssShieldMode = false;
    private _abyssPillarCd = 8;
    private _abyssZoneCd = 12;
    private _abyssCloneCd = 16;
    private _abyssSquidCd = 20;
    // 《怪物设计与数值》三只新大Boss：固定轮转，便于测试房逐项验收，
    // 同一时刻只允许一个主机制存在。
    docSkillIndex = 0;
    docSkillTimer = 2.4;
    docBasicTimer = 1.8;
    docSkillName = '';
    private _docFinalUsed = false;

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
        resetLocomotion(this.locomotion);
        resetDirectionalFacing(this.directionalFacing, 'front');
        this._setupForChapter(this.chapter);
    }

    /** Called by GameManager.spawnEnemy('boss') — chapter is 0-based. */
    initBoss(chapter: number, game: any): void {
        this.init('boss', (chapter + 1) * 10, game);
    }

    /** 测试房间专属 Boss：按 kind 套 TEST_BOSSES 数值与技能集（chapter 取自表内基准章）。 */
    initBossKind(kind: string, game: any): void {
        const def = TEST_BOSSES.find(t => t.kind === kind) ?? TEST_BOSSES[0];
        this.initBoss(def.chapter - 1, game);
        this.bossKind = kind;
        this.maxHp = def.maxHp; this.hp = def.maxHp;
        this.damage = def.damage; this.speed = def.speed;
        this.armor = def.armor;
        this.color = def.color; this.glowColor = def.glow;
        this.label = def.label;
        this.radius = def.radius;
        this.goldValue = def.goldValue;
        this.spriteKey = def.spriteKey;
        this.tintColor = def.tintColor ?? '#ffffff';
        this.visualScale = def.visualScale;
        this.attackWindupMax = def.attackWindupMax;
        this.locomotionKind = def.chapter <= 2 ? 'bossHeavy' : 'bossHover';
        this.moveSpriteKey = `${this.spriteKey}_move`;
        this.locomotionFrameKey = '';
        this.directionalFrames = ['vespa', 'crucible_city', 'manyfold'].indexOf(kind) < 0;
        this.docSkillIndex = 0; this.docSkillTimer = 2.4; this.docBasicTimer = 1.8;
        this.docSkillName = ''; this._docFinalUsed = false;
    }

    /** 机械高达被动：50% 概率格挡玩家伤害（用剑劈掉攻击，简化实现）。 */
    override takeDamage(rawDmg: number, attacker: any, game: any): number {
        if (this.bossKind === 'mech' && attacker && this.alive && !this.invulnerable && Rng.chance(0.5)) {
            game?.floatingText?.spawn?.(this.x, this.y - 80, '格挡！', '#aaddff', 18, true);
            game?.particles?.shieldBlock?.(this.x, this.y, false);
            game?.audio?.playSfx?.('hex_activate', 0.6);
            return 0;
        }
        return super.takeDamage(rawDmg, attacker, game);
    }

    private _setupForChapter(ch: number): void {
        // 数值来自 data/BossDB.ts（与测试房间共用单一数据源），内容与历史内联表一致
        const t = getBossDef(ch - 1);
        this.maxHp     = t.maxHp; this.hp        = t.maxHp;
        this.damage    = t.damage; this.speed     = t.speed;
        this.color     = t.color;  this.glowColor  = t.glow;
        this.label     = t.label;
        this.radius    = t.radius;
        this.goldValue = t.goldValue;
        this.armor     = t.armor;
        // 四章各有独立轮廓/材质的 Boss 贴图，不能再靠同一白模染色冒充换装。
        // glowColor 继续承担预警、弹幕和 HUD 主题色，Sprite 本体保持原画色。
        this.spriteKey = t.spriteKey;
        this.tintColor = '#ffffff';
        // Boss 应该有明显区别于场上最大常规怪(miniboss, radius=30)的体型压迫感，
        // 但 radius 本身被碰撞判定/近战距离/边界clamp直接消费（见 update() 的近战
        // 判定和 clamp 调用），不能直接调大，否则会连带把命中体积也放大破坏平衡。
        // 这里用只影响渲染直径的 visualScale 纯视觉放大，判定范围保持不变。
        this.visualScale = t.visualScale;
        this.attackWindupMax = t.attackWindupMax;
        // 第1/2章是有脚的巨兽/机甲；第3/4章本体为悬浮晶核与深渊门环。
        // 大型单位使用专用低频步态，避免高速冲锋时大图换帧闪烁。
        this.locomotionKind = ch <= 2 ? 'bossHeavy' : 'bossHover';
        this.moveSpriteKey = `${this.spriteKey}_move`;
        this.locomotionFrameKey = '';
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

        // 测试房间专属 Boss 技能状态机（机械高达/深海恐惧，文档 boss.docx）
        if (this.bossKind === 'mech') this._updateMechSkills(dt, player, game);
        else if (this.bossKind === 'abyss') this._updateAbyssSkills(dt, player, game);
        else if (this._isDocBoss()) this._updateDocBossSkills(dt, player, game);

        // Boss技能先给出能量环前摇，再发射弹幕，避免子弹凭空出现。
        if (this.skillWindup > 0) {
            this.skillWindup = Math.max(0, this.skillWindup - dt);
            if (this.skillWindup <= 0) this._useSkill(player, game);
        }

        // 飞空（机械高达天空坠击）：在天上不移动、不接触攻击
        const airborne = this.bossKind === 'mech' && this.mechSkyT > 0;

        // 冲刺先锁定路线并蓄力，再进入冲刺移动。
        if (airborne) {
            // 空中：位置不变（渲染层画锁定目标圈）
        } else if (this.chargeWindup > 0) {
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
        } else if (this.attackWindup <= 0) {
            // 普通追逐（对齐 hexblast-py：追逐速度要乘slowMult，之前完全没接线，
            // 导致减速类词条/技能对boss完全无效）
            const toPlayerX = player.x - this.x;
            const toPlayerY = player.y - this.y;
            const distance = Math.hypot(toPlayerX, toPlayerY);
            const [dx, dy] = Vec.normalize(toPlayerX, toPlayerY);
            // 旧逻辑无条件穿过英雄中心，Boss 会在目标点两侧来回越界并每帧
            // 翻转前/背或左右帧，视觉上就是“一闪一闪”。现在在接触判定内沿
            // 稳定停步；冲锋结束若重叠，则以较慢速度后撤恢复合理间距。
            const contactDistance = this.radius + (player.radius ?? 16);
            const standDistance = Math.max(1, contactDistance - 2);
            const moveSpeed = this.speed * this.slowMult;
            let step = 0;
            if (distance > standDistance + 0.5) {
                step = Math.min(moveSpeed * dt, distance - standDistance);
            } else if (distance < standDistance - 6 && distance > 0.0001) {
                step = -Math.min(moveSpeed * 0.35 * dt, standDistance - distance);
            }
            this.x += dx * step;
            this.y += dy * step;
            this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
            this.y = clamp(this.y, this.radius, PLAYFIELD_BOTTOM - this.radius);
        }

        // 技能计时（正式章节 Boss；测试房 Boss 由各自状态机调度）
        if (!this.bossKind) {
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
        }

        // 接触攻击也必须经过可见前摇；玩家在结算前离开碰撞范围即可躲避。
        if (!airborne && this.attackWindup > 0) {
            this.attackWindup = Math.max(0, this.attackWindup - dt);
            if (this.attackWindup <= 0 &&
                Vec.dist(this.x, this.y, player.x, player.y) < this.radius + player.radius + 12) {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                game.particles?.meleeSlash?.(this.x, this.y, angle, this.glowColor, this.radius + player.radius, 1.8);
                game.particles?.impact(player.x, player.y, angle, 0.7, this.glowColor);
                player.takeDamage(this.damage * this.buffDmgMult, game);
            }
        } else if (!airborne && Vec.dist(this.x, this.y, player.x, player.y) < this.radius + player.radius && this._contactCd <= 0) {
            this._contactCd = 0.65;
            this.attackWindup = this.attackWindupMax;
            this.attackTargetX = player.x;
            this.attackTargetY = player.y;
        }
    }

    private _enterPhase(phase: number, game: any): void {
        this.phase   = phase;
        this.enraged = true;
        // 新设计Boss不靠无提示叠伤或通用20%加速制造难度：只让维斯帕在第三阶段
        // 按文档获得15%移速，其余通过技能组合与节奏变化升级。
        if (this.bossKind === 'vespa' && phase === 3) this.speed *= 1.15;
        else if (!this._isDocBoss()) this.speed *= 1.2;
        if (this._isDocBoss()) {
            game.clearDocBossMechanics?.(this);
            game.clearTaggedEnemyBullets?.(`doc_${this.bossKind}`);
            this.docSkillTimer = 1.2;
            if (phase === 3) this.docSkillIndex = 4;
        }
        game.screenShake?.shake(10, 0.32);
        game.floatingText?.spawn(640, 200, `⚠ PHASE ${phase} ⚠`, this.glowColor, 28, true);
        game.particles?.hexActivate(this.x, this.y, this.glowColor);
    }

    private _isDocBoss(): boolean {
        return this.bossKind === 'vespa' || this.bossKind === 'crucible_city' || this.bossKind === 'manyfold';
    }

    /**
     * 三只文档大Boss使用可复现的固定轮转，不做随机五技能乱叠。
     * 阶段I仅教学前两招；阶段II加入三、四招；阶段III先强制第五招。
     */
    private _updateDocBossSkills(dt: number, player: any, game: any): void {
        if (!player?.alive) return;
        this.docBasicTimer -= dt;
        if (this.docBasicTimer <= 0 && !game.docBossSkillBusy?.(this)) {
            this.docBasicTimer = this.bossKind === 'crucible_city' ? 2.1 : this.bossKind === 'manyfold' ? 2.0 : 1.55;
            game.startDocBossBasic?.(this.bossKind, this, player);
        }
        this.docSkillTimer -= dt;
        if (this.docSkillTimer > 0 || game.docBossSkillBusy?.(this)) return;

        let pool: number[];
        if (this.phase === 1) pool = [0, 1];
        else if (this.phase === 2) pool = [0, 1, 2, 3];
        else if (this.bossKind === 'manyfold') pool = [4, 1];
        else pool = [0, 1, 2, 3, 4];

        let skill: number;
        if (this.phase === 3 && !this._docFinalUsed) {
            skill = 4;
            this._docFinalUsed = true;
        } else {
            const cursor = Math.max(0, pool.indexOf(this.docSkillIndex));
            skill = pool[cursor >= 0 ? cursor : 0];
        }
        const names: Record<string, string[]> = {
            vespa: ['六角蛛网', '三段弹跳猎杀', '母囊毒雨', '活卵债务', '蜕晶假死'],
            crucible_city: ['双色磁极铸印', '三臂活塞打桩', '废钢回炉', '铸件列阵', '炉心倒灌'],
            manyfold: ['对岸缝线', '折面迁跃', '借影裁片', '六面缺口', '边界收针'],
        };
        this.docSkillName = names[this.bossKind!][skill];
        game.floatingText?.spawn?.(this.x, this.y - 100, this.docSkillName, this.glowColor, 18, true);
        game.startDocBossSkill?.(this.bossKind, skill, this, player);
        const next = (pool.indexOf(skill) + 1) % pool.length;
        this.docSkillIndex = pool[next];
        const pace = this.phase === 3 ? 0.85 : 1;
        this.docSkillTimer = (this.bossKind === 'manyfold' ? 7.2 : 7.8) * pace;
    }

    private _useSkill(player: any, game: any): void {
        // 正式章节按 chapter 分支；测试房间专属 Boss 按 bossKind 分支
        const kind = this.bossKind ?? `ch${this.chapter}`;
        switch (kind) {
            case 'ch1': // 废土：毒液 DOT 圆
                game.particles?.explode(this.x, this.y, '#44ff00', 100);
                for (const e of (game.enemies || [])) { /* friendly fire */ }
                // 向玩家发射3发毒球
                for (let i = -1; i <= 1; i++) {
                    const a = Math.atan2(player.y - this.y, player.x - this.x) + i * 0.3;
                    game.enemyBullets?.push({ x: this.x, y: this.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, damage: this.damage * this.buffDmgMult * 0.6, radius: 10, color: '#44ff00', life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'poison' });
                }
                break;
            case 'ch2': // 钢铁：齿轮弹
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + this._animTime;
                    game.enemyBullets?.push({ x: this.x, y: this.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, damage: this.damage * this.buffDmgMult * 0.5, radius: 10, color: '#ffad42', life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'gear' });
                }
                break;
            case 'ch3': // 海克斯：追踪弹
                { const [dx, dy] = Vec.normalize(player.x - this.x, player.y - this.y);
                  game.enemyBullets?.push({ x: this.x, y: this.y, vx: dx * 300, vy: dy * 300, damage: this.damage * this.buffDmgMult * 0.8, radius: 13, color: '#ff4da6', life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true, homing: true, enemyFx: 'homing' }); }
                break;
            case 'ch4': // 混沌：随机多弹
                for (let i = 0; i < 12; i++) {
                    const a = Rng.float(0, Math.PI * 2);
                    game.enemyBullets?.push({ x: this.x, y: this.y, vx: Math.cos(a) * Rng.float(150, 350), vy: Math.sin(a) * Rng.float(150, 350), damage: this.damage * this.buffDmgMult * 0.7, radius: 11, color: '#ffe066', life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'chaos' });
                }
                break;
            case 'mech':  this._mechBladeStormFire(player, game); break;
            case 'abyss': this._abyssWaterSpikes(player, game); break;
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

    // ── 机械高达X-剑（测试房间，文档 boss.docx） ──────────────

    /** 技能状态机：横劈 / 剑气风暴 / 光剑 / 天空坠击 + 被动格挡（takeDamage override）。 */
    private _updateMechSkills(dt: number, player: any, game: any): void {
        // 光剑：15s 增伤 25%
        if (this.mechBuffT > 0) {
            this.mechBuffT -= dt;
            if (this.mechBuffT <= 0) this.buffDmgMult = 1;
        }
        // 天空坠击：3s 飞空锁定 → 落地中圆 AoE
        if (this.mechSkyT > 0) {
            this.mechSkyT -= dt;
            if (this.mechSkyT <= 0) {
                this.invulnerable = false;
                game.particles?.explode?.(this.mechSkyTargetX, this.mechSkyTargetY, '#88ccff', 90);
                game.screenShake?.shake?.(14, 0.35);
                game.hitStop?.trigger?.(90);
                game.audio?.playSfx?.('explode', 0.9);
                if (player.alive && Vec.dist(this.mechSkyTargetX, this.mechSkyTargetY, player.x, player.y) < 170) {
                    player.takeDamage(this.damage * this.buffDmgMult * 0.53, game); // 35/66
                }
            }
            return; // 空中不移动/不攻击/不调度新技能
        }
        if (!player.alive) return;
        // 横劈：2s 前摇（渲染层画高亮扇形），结束时主角在扇形内 → 30 伤
        if (this.mechSlashT > 0) {
            this.mechSlashT -= dt;
            if (this.mechSlashT <= 0) {
                game.particles?.meleeSlash?.(this.x, this.y, this.mechSlashAngle, this.glowColor, 260, 1.6);
                game.screenShake?.shake?.(8, 0.25);
                game.audio?.playSfx?.('skill_r', 0.8);
                const ang = Math.atan2(player.y - this.y, player.x - this.x);
                const diff = Math.abs(Math.atan2(Math.sin(ang - this.mechSlashAngle), Math.cos(ang - this.mechSlashAngle)));
                if (diff < 1.05 && Vec.dist(this.x, this.y, player.x, player.y) < 280) {
                    player.takeDamage(this.damage * this.buffDmgMult * 0.45, game); // 30/66
                    game.floatingText?.spawn?.(player.x, player.y - 50, '横劈！', '#aaddff', 20, true);
                }
            }
        } else {
            // 横劈冷却
            this._mechSlashCd -= dt;
            if (this._mechSlashCd <= 0) {
                this._mechSlashCd = 7 + Rng.float(0, 2);
                this.mechSlashT = 2;
                this.mechSlashAngle = Math.atan2(player.y - this.y, player.x - this.x);
                game.floatingText?.spawn?.(this.x, this.y - 90, '横劈蓄力！', '#aaddff', 18, true);
            }
        }
        // 技能调度：剑气风暴 / 光剑 / 天空坠击
        this._skillTimer -= dt;
        if (this._skillTimer <= 0 && this.skillWindup <= 0 && this.mechSlashT <= 0 && this.mechSkyT <= 0) {
            this._skillTimer = 6 + Rng.float(0, 2);
            const r = Rng.int(0, 2);
            if (r === 0) {
                // 剑气风暴：1.5s 蓄能（skillWindup 前摇环）后 10~20 道剑气四散
                this.skillWindup = 1.5;
                this.skillWindupMax = 1.5;
                game.floatingText?.spawn?.(this.x, this.y - 90, '剑气蓄能！', '#aaddff', 18, true);
            } else if (r === 1) {
                this.mechBuffT = 15;
                this.buffDmgMult = 1.25;
                game.particles?.hexActivate?.(this.x, this.y, '#88ccff');
                game.floatingText?.spawn?.(this.x, this.y - 90, '光剑·增伤25%！', '#88ccff', 20, true);
            } else {
                this._mechSkyDive(player, game);
            }
        }
    }

    /** 剑气风暴发射：10~20 道剑气向四面八方连续挥出，每道 5 伤。 */
    private _mechBladeStormFire(_player: any, game: any): void {
        const count = Rng.int(10, 20);
        const base = Rng.float(0, Math.PI * 2);
        for (let i = 0; i < count; i++) {
            const a = base + (i / count) * Math.PI * 2 + this._animTime * 0.4;
            game.enemyBullets?.push({
                x: this.x, y: this.y,
                vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                damage: this.damage * this.buffDmgMult * 0.076, // 5/66
                radius: 8, color: '#cfe8ff', life: 3, lifeTime: 3,
                owner: 'enemy', isEnemyBullet: true, enemyFx: 'blade',
                srcBossTag: 'mech', // 升空时随 Boss 一并带走
            });
        }
        game.audio?.playSfx?.('skill_e', 0.7);
    }

    /** 天空坠击：举剑飞空（无敌+隐身+带走自身弹幕），锁定主角位置，3s 后落地 AoE。 */
    private _mechSkyDive(player: any, game: any): void {
        this.invulnerable = true;
        this.mechSkyT = 3;
        this.mechSkyTargetX = player.x;
        this.mechSkyTargetY = player.y;
        // 升空瞬间场上残留的剑气一并消失——Boss"直接消失"时不能还留着它的子弹攻击
        game.clearTaggedEnemyBullets?.('mech');
        game.particles?.hexActivate?.(this.x, this.y, '#88ccff');
        game.floatingText?.spawn?.(this.x, this.y - 90, '升空锁定！', '#88ccff', 20, true);
        game.audio?.playSfx?.('skill_q', 0.8);
    }

    // ── 深海恐惧（测试房间，文档 boss.docx） ──────────────────

    /** 技能状态机：大水刺 / 海之霸主（水柱）/ 冰冻区域 / 水分身 / 召唤深海鱿鱼。 */
    private _updateAbyssSkills(dt: number, player: any, game: any): void {
        // 海之霸主：场景边缘 8 道水柱（GameManager._pillars 维护）
        this._abyssPillarCd -= dt;
        if (this._abyssPillarCd <= 0) {
            this._abyssPillarCd = 22;
            game.startPillarStorm?.(this);
        }
        // 冰冻区域：随机 4 个预告区（GameManager._telegraphZones 维护）
        this._abyssZoneCd -= dt;
        if (this._abyssZoneCd <= 0) {
            this._abyssZoneCd = 15;
            game.startTelegraphZones?.(this);
        }
        // 水分身冲锋
        this._abyssCloneCd -= dt;
        if (this._abyssCloneCd <= 0 && player.alive) {
            this._abyssCloneCd = 14;
            game.spawnWaterClone?.(this, player);
        }
        // 消耗水柱召唤深海鱿鱼
        this._abyssSquidCd -= dt;
        if (this._abyssSquidCd <= 0) {
            this._abyssSquidCd = 18;
            game.abyssSummonSquid?.(this);
        }
        // 大水刺：随机 3 方向各 3 发（复用 skillWindup 前摇）
        this._skillTimer -= dt;
        if (this._skillTimer <= 0 && this.skillWindup <= 0) {
            this._skillTimer = 5 + Rng.float(0, 2);
            this.skillWindup = this.skillWindupMax;
        }
    }

    /** 大水刺：向 6 个均匀方向（整体随机旋转）各释放 3 发水刺，每发 20 伤，遇屏幕边缘反弹 2 次。 */
    private _abyssWaterSpikes(player: any, game: any): void {
        game.particles?.explode(this.x, this.y, '#33ccff', 90);
        const baseAngle = Rng.float(0, Math.PI * 2 / 6); // 整体随机旋转
        for (let s = 0; s < 6; s++) {
            const base = baseAngle + (s / 6) * Math.PI * 2;
            for (let i = -1; i <= 1; i++) {
                const a = base + i * 0.22;
                game.enemyBullets?.push({
                    x: this.x, y: this.y,
                    vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
                    damage: this.damage * this.buffDmgMult * 0.21, // 20/94
                    radius: 11, color: '#33ccff', life: 3.5, lifeTime: 3.5,
                    owner: 'enemy', isEnemyBullet: true, enemyFx: 'water_spike',
                    bounceLeft: 2, // 水刺遇边缘反弹 2 次
                });
            }
        }
        game.audio?.playSfx?.('freeze', 0.7);
    }

    override getVisualFacing(player: any, movementX = 1, movementY = 0): [number, number] {
        // 冲锋时身体必须沿真实速度方向；撞墙反弹后也立即随新速度转向。
        if (this.isCharging) {
            const [dx, dy] = Vec.normalize(this._chargeVx, this._chargeVy);
            if (Math.abs(dx) + Math.abs(dy) > 0.0001) return [dx, dy];
        }
        if (this.chargeWindup > 0) {
            const [dx, dy] = Vec.normalize(this.chargeTargetX - this.x, this.chargeTargetY - this.y);
            if (Math.abs(dx) + Math.abs(dy) > 0.0001) return [dx, dy];
        }
        return super.getVisualFacing(player, movementX, movementY);
    }

    /** 用于 HUD 绘制的 HP 信息 */
    getHPRatio(): number { return this.hp / this.maxHp; }

    /** BossController.label → exposed as .name for HUD/GameManager */
    get name(): string { return this.label; }
}
