// ============================================================
//  PlayerController.ts — 玩家控制器（Cocos Creator 3.x 组件）
// ============================================================
import { _decorator, Component, Node, Sprite, UITransform, Color } from 'cc';
import { Vec, Rng, clamp } from '../core/MathUtils';
import { CANVAS_W, CANVAS_H, PLAYFIELD_BOTTOM } from '../core/Constants';
import { CHARACTERS, CharDef, CharStats, SKILL_Q_CD, SKILL_E_CD } from '../data/CharacterDB';
import { applyArtSprite, preloadArt } from '../core/SpriteUtils';
import { createLocomotionState, LocomotionKind, resetLocomotion } from '../core/Locomotion';
import {
    createDirectionalFacingState, directionalArtKeys, resetDirectionalFacing,
} from '../core/DirectionalFacing';
import type { DotEffect } from './EnemyBase';
import { ActorAnimation, animationSocket } from '../core/ActorAnimation';
import { actorClip, ActorAction, ActorView, ACTOR_ANIMATIONS } from '../data/ActorAnimationDB';
import { resolveFacingView } from '../core/DirectionalFacing';
const { ccclass, property } = _decorator;

interface VisualSkillRequest {
    slot: 'q' | 'e' | 'r';
    action: 'skill' | 'skill2' | 'skill3';
    run: () => void;
    dx: number;
    dy: number;
}

export interface PlayerStats extends CharStats {
    extraBullets: number;
    bulletBounce: number;
    barrageMode: boolean;
    novaMode: boolean;
    allInBullets: number;
    goldPickupRange: number;
    cdReduction: number;
    ultChargeRate: number;
    eliteBonus: number;
    maxAugments: number;
    previewAugments: boolean;
    _bloodAwakening: boolean;
    _coreOverflow: boolean;
    _coreUsed: boolean;
    _reikPassive: boolean;
    chaosBonus: boolean;
    explosionMult: number;
    turretBonus: number;
    freezeBonus: number;
    [key: string]: any;
}

/** 导出为纯函数，便于 headless 测试逐一覆盖全部英雄。 */
export function playerLocomotionKind(charId: string): LocomotionKind {
    const kinds: Record<string, LocomotionKind> = {
        kai: 'biped', vivian: 'biped', reik: 'heavy',
        olia: 'hover', graf: 'heavy', liana: 'biped',
    };
    return kinds[charId] ?? 'biped';
}

interface Buff { id: string; duration: number; mods: Record<string, any>; }

@ccclass('PlayerController')
export class PlayerController extends Component {
    charId  = 'kai';
    stats!: PlayerStats;
    hp      = 100;
    shield  = 0;
    radius  = 16;
    x       = 640;
    y       = 360;
    alive   = true;
    /** 测试房间「玩家无敌」开关：true 时跳过一切伤害结算，便于观察 Boss 技能。 */
    godMode = false;
    /** 持续伤害（测试房小boss毒刺/高能光束等）：吃护甲、不吃无敌帧，可叠加。 */
    dots: DotEffect[] = [];
    color   = '#00ffcc';
    /** 角色朝向（单位向量）：随移动输入更新，站定时保持最后朝向；
     *  方向性技能（Q冲锋/穿刺弹等）一律沿朝向释放，不再追鼠标。 */
    facingX = 1;
    facingY = 0;

    // timers
    private _shootTimer  = 0;
    private _qCd         = 0;
    private _eCd         = 0;
    private _iframeTimer = 0;
    private _invincible  = 0;
    private _cosmosCd    = 0;
    _rCharge             = 0;
    ultReady             = false;

    private _buffs: Buff[] = [];
    private _charDef!: CharDef;
    private _game?: any;

    /** Sprite carrying the character's battle token art (char_<id>), set up in init(). */
    sprite?: Sprite;
    /** 临时护盾份额（时空行者）：到期自动回收未被消耗的部分。 */
    private _tempShields: { amount: number; timer: number }[] = [];
    /** 雷克双斧左右手交替计数，只影响表现，不参与伤害与攻速结算。 */
    private _reikSwingSide = 0;
    /**
     * 形态切换（时空行者 E）：空=沿用角色默认攻击方式；
     * 'melee'/'ranged' 为当前形态。近战形态伤害+30%（附加到所有技能）、攻速+50%。
     */
    attackForm: 'melee' | 'ranged' | '' = '';
    formDamageMult = 1;
    formAtkSpdMult = 1;
    /** 战斗贴图基 key（char_token_<id>），init 时按角色设置。 */
    spriteKey = 'char_token_kai';
    /** 与静止帧成对的真实动作帧。 */
    moveSpriteKey = 'char_token_kai_move';
    /** 距离驱动步态（前/侧/背 × 静止/动作 六帧矩阵的渲染驱动）。 */
    locomotion = createLocomotionState(0.35);
    locomotionKind: LocomotionKind = 'biped';
    /** 渲染层用于避免每帧重复提交同一资源。 */
    locomotionFrameKey = '';
    /** 视觉朝向与方向技能共用最后一次移动输入，保证按左/右时身体立即同向。 */
    directionalFacing = createDirectionalFacingState('side');
    actorAnimation = new ActorAnimation();
    animationView: ActorView = 'side';
    animationMirror: 1 | -1 = 1;
    private _animationLastX = this.x;
    private _animationLastY = this.y;
    private _pendingFire?: () => void;
    private _emissionOrigin?: [number, number];
    private _attackAnimationRate = 1;
    private _skillQueue: VisualSkillRequest[] = [];
    private _pendingSkill?: VisualSkillRequest;
    private _castFacing?: [number, number];

    // ── 初始化 ───────────────────────────────────────────
    init(charId: string, game: any): void {
        this.charId   = charId;
        this._charDef = CHARACTERS[charId];
        this._game    = game;
        const def     = this._charDef;
        this.color    = def.color;

        // 玩家战斗token贴图：使用专为战斗内小尺寸显示设计的 char_token_<id>
        // （比角色选择界面的大立绘更简洁、轮廓对比度更高）；找不到贴图时不
        // 影响逻辑，只是看不到图（回退到无贴图）。
        if (!this.sprite) {
            const node = (this as any).node as Node;
            node.addComponent(UITransform).setContentSize(82, 82);
            this.sprite = node.addComponent(Sprite);
            this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            // Cocos 默认会把 auto-trim 后的可见矩形强行塞进 82×82。
            // 六张角色的裁剪框宽高比不同（例如 Kai 约 304×461），因此会被
            // 横向拉宽。关闭 Sprite 侧 trim 后按原始 512×512 画布排版，既保留
            // 每张图的透明留白，也保证所有角色都以原画比例等比显示。
            this.sprite.trim = false;
        }
        this.spriteKey = `char_token_${charId}`;
        this.resetVisualAnimation();
        const animationSheets = new Set<string>();
        const animationSet = ACTOR_ANIMATIONS[this.spriteKey] ?? {};
        for (const viewName of Object.keys(animationSet)) {
            const view = animationSet[viewName];
            for (const action of Object.keys(view)) animationSheets.add(view[action].sheet);
        }
        // 避免 Cocos Web 转译把 `[...set]` 变成包含 Set 对象的单元素数组。
        preloadArt(Array.from(animationSheets));
        this.moveSpriteKey = `${this.spriteKey}_move`;
        this.locomotionFrameKey = this.spriteKey;
        preloadArt(directionalArtKeys(this.spriteKey));
        applyArtSprite(this.sprite, this.spriteKey);
        this.sprite.color = new Color(255, 255, 255, 255);

        // 六名英雄按身体结构使用不同重心：狂战士/傀儡重步，时空行者悬浮，
        // 其余角色保持灵活双足。只改变视觉节奏，不改变实际速度和碰撞。
        this.locomotionKind = playerLocomotionKind(charId);

        this.stats = {
            maxHp: def.stats.maxHp, speed: def.stats.speed,
            damage: def.stats.damage, attackSpeed: def.stats.attackSpeed,
            armor: def.stats.armor, critRate: def.stats.critRate, critDmg: def.stats.critDmg,
            pierce: def.stats.pierce || 0,
            extraBullets: 0, bulletBounce: 0,
            barrageMode: false, novaMode: false, allInBullets: 0,
            goldPickupRange: 60, cdReduction: 0, ultChargeRate: 1,
            eliteBonus: 0, maxAugments: 6, previewAugments: false,
            _bloodAwakening: false, _coreOverflow: false, _coreUsed: false,
            _reikPassive: false, chaosBonus: false, explosionMult: 1, turretBonus: 1, freezeBonus: 0,
            lifestealRate: 0, maxShield: 0,
        };

        this.hp     = this.stats.maxHp;
        this.shield = 0;
        this.x      = CANVAS_W / 2;
        this.y      = CANVAS_H / 2;
        this.alive  = true;
        this._buffs = [];
        this._rCharge = 0;
        // 方向动画状态重置（六帧矩阵由渲染层按朝向/步态切换）
        resetLocomotion(this.locomotion, this.x, this.y);
        resetDirectionalFacing(this.directionalFacing, 'side');

        if (def.passive) def.passive(this, game);
    }

    // ── 当前伤害（含词条/buff/连击） ──────────────────────
    getDamage(game?: any): number {
        // damageMulti：商店/词条的攻击力乘区（此前只写不读，是死数据）
        let d = this.stats.damage * this.damageMulti;
        // 形态加成（时空行者攻击形态等）：附加到所有技能与普攻
        d *= this.formDamageMult;
        if (this.stats._reikPassive) {
            const lost = 1 - this.hp / this.stats.maxHp;
            // +1e-6 容差：恰好损失 10%/20%…整档时浮点算出 0.0999… 不得掉档
            d *= (1 + Math.min(0.8, Math.floor((lost + 1e-6) / 0.1) * 0.08));
        }
        for (const b of this._buffs) if (b.mods.dmgMult) d *= b.mods.dmgMult;
        if (this.stats._comboDmgAug && game) {
            const c = game.comboCount || 0;
            if (c >= 100) d *= 1.30; else if (c >= 50) d *= 1.15; else if (c >= 20) d *= 1.05;
        }
        if (this.stats._bloodAwakening && this.hp / this.stats.maxHp < 0.25) d *= 2;
        if (this.stats._overloadCheck && game?.augmentManager?.active?.length >= 5) d *= 1.5;
        if (this.stats.chaosGodActive) d *= 5;
        return d;
    }

    getAtkSpd(): number {
        let s = this.stats.attackSpeed;
        for (const b of this._buffs) if (b.mods.atkSpd) s *= b.mods.atkSpd;
        return s * this.formAtkSpdMult;
    }

    getSpeed(): number {
        let s = this.stats.speed;
        for (const b of this._buffs) if (b.mods.speed) s *= b.mods.speed;
        return s;
    }

    applyBuff(id: string, duration: number, mods: Record<string, any>): void {
        const existing = this._buffs.find(b => b.id === id);
        if (existing) { existing.duration = duration; return; }
        this._buffs.push({ id, duration, mods });
    }

    heal(amount: number, feedback = true): number {
        const before = this.hp;
        this.hp = Math.min(this.stats.maxHp, this.hp + amount);
        const healed = this.hp - before;
        if (feedback && healed >= 1) {
            this._game?.particles?.heal?.(this.x, this.y);
            this._game?.audio?.playSfx?.('heal');
            this._game?.floatingText?.spawn?.(this.x, this.y - 42, `+${Math.round(healed)}`, '#8fffb0', 14, false);
        }
        return healed;
    }

    /** 挂持续伤害（毒刺/高能光束等），同一来源可叠加。 */
    applyDot(dps: number, dur: number, color = '#cc66ff'): void {
        this.dots.push({ type: 'dot', dps, timeLeft: dur, color });
    }

    takeDamage(amount: number, game: any, opts?: { ignoreIframe?: boolean }): void {
        // !alive 守卫：测试房间死亡后到重生前，场上敌人仍会持续攻击，
        // 不守卫会反复触发 onPlayerDeath 重复调度重生定时器。
        if (!this.alive || this.godMode) return;
        // buff 无敌（重生/切换英雄/技能无敌帧）始终生效
        if (this._invincible > 0) return;
        // 受击无敌帧只挡常规受击；ignoreIframe（测试房敌弹）跳过——
        // 0.5s 无敌帧会吞掉逐发水刺(0.35s)/剑气风暴(一次性10~20道)的后续命中，
        // 表现为"有些攻击对主角不生效"。
        if (!opts?.ignoreIframe && this._iframeTimer > 0) return;
        // 核心溢出保护
        if (this.stats._coreOverflow && !this.stats._coreUsed && this.hp / this.stats.maxHp < 0.2) {
            this.stats._coreUsed = true;
            this.applyBuff('core_overflow', 10, { invincible: true, dmgMult: 3, atkSpd: 3 });
            game.floatingText?.spawn(this.x, this.y - 50, '核心溢出！', '#ffcc00', 24, true);
            game.particles?.hexActivate(this.x, this.y, '#ffcc00');
            setTimeout(() => { this.heal(this.stats.maxHp * 0.5); this.stats._coreUsed = false; }, 10000);
        }
        // 护盾先扣
        if (this.shield > 0) {
            const abs = Math.min(this.shield, amount);
            this.shield -= abs; amount -= abs;
            const shieldBroken = this.shield <= 0;
            game.particles?.shieldBlock?.(this.x, this.y, shieldBroken);
            if (shieldBroken) {
                game.floatingText?.spawn(this.x, this.y - 42, '护盾破裂', '#88ccff', 18, true);
            }
            if (amount <= 0) { this._iframeTimer = 0.3; return; }
        }
        // 护甲减伤（对齐 EnemyBase.takeDamage 的 armor/(armor+100) 衰减公式；
        // armor_up 词条/角色初始 armor 之前只写入 stats.armor 从未在这里读取，是死代码）。
        const mitigation = this.stats.armor / (this.stats.armor + 100);
        amount = Math.max(1, amount * (1 - mitigation));
        this.hp -= amount;
        // 受击钩子：深海恐惧「海之霸主」期间每受一次伤害 Boss 生成护盾（测试房）
        game.onPlayerHit?.(this, game);
        this._iframeTimer = 0.5;
        this.playVisualAction('hit');
        game.audio?.playSfx?.('player_hurt');
        game.screenShake?.shake(4, 0.14);
        game.floatingText?.spawn(this.x, this.y - 30, `-${Math.ceil(amount)}`, '#ff4444', 16, false);
        if (this.hp <= 0) {
            // 时间悖论(time_paradox)：每波一次撤销死亡（对齐 AugmentDB.ts 的 desc 描述）。
            // 简化为"撤销本次死亡"而非完整的状态快照回滚到波次起点——后者需要整局
            // 状态序列化，超出核心玩法QA范围；_timeParadoxUsed 在每波开始时重置。
            if (this.stats.hasTimeParadox && !this.stats._timeParadoxUsed) {
                this.stats._timeParadoxUsed = true;
                this.hp = this.stats.maxHp * 0.5;
                this.applyBuff('time_paradox_iframe', 1.5, { invincible: true });
                game.floatingText?.spawn(this.x, this.y - 50, '时间倒流！', '#66ffff', 24, true);
                game.particles?.hexActivate?.(this.x, this.y, '#66ffff');
                return;
            }
            this.hp = 0; this.alive = false; this.beginDefeat(); game.onPlayerDeath();
        }
    }

    // ── 每帧更新 ─────────────────────────────────────────
    tickMovement(dt: number, input: any): void {
        if (!this.alive || this._buffs.some(b => b.mods.noMove)) return;
        let mx = input.moveX, my = input.moveY;
        if (mx !== 0 && my !== 0) { mx *= 0.707; my *= 0.707; }
        // 有移动输入时更新朝向（对角线已归一，这里再稳一次防御性归一）
        if (mx !== 0 || my !== 0) {
            const len = Math.hypot(mx, my) || 1;
            this.facingX = mx / len;
            this.facingY = my / len;
        }
        const spd = this.getSpeed();
        this.x = clamp(this.x + mx * spd * dt, this.radius, CANVAS_W - this.radius);
        this.y = clamp(this.y + my * spd * dt, this.radius, PLAYFIELD_BOTTOM - this.radius);
    }

    tick(dt: number, input: any, game: any): void {
        if (!this.alive) { this.updateVisualAnimation(dt); return; }

        // DoT 持续伤害（测试房小boss毒刺/高能光束等）：吃护甲、不吃受击无敌帧，可叠加。
        // 测试房 godMode 代表“跳过一切伤害”，但 DoT 计时仍正常消耗，避免关闭无敌后残留过期效果。
        // 浮字每 0.5s 汇总一次，避免逐帧刷屏。
        for (let i = this.dots.length - 1; i >= 0; i--) {
            const d = this.dots[i];
            d.timeLeft -= dt;
            if (d.timeLeft <= 0) { this.dots.splice(i, 1); continue; }
            if (this.godMode) continue;
            const dotMitigation = (this.stats?.armor ?? 0) / ((this.stats?.armor ?? 0) + 100);
            const dmg = Math.max(0.1, d.dps * dt * (1 - dotMitigation));
            this.hp -= dmg;
            const fx = d as any;
            fx._acc = (fx._acc ?? 0) + dmg;
            fx._fxT = (fx._fxT ?? 0) - dt;
            if (fx._fxT <= 0) {
                fx._fxT = 0.5;
                this._game?.floatingText?.spawn?.(this.x, this.y - 34, `-${Math.max(1, Math.round(fx._acc))}`, d.color ?? '#cc66ff', 12, false);
                fx._acc = 0;
                this._game?.particles?.toxin?.(this.x, this.y);
            }
            if (this.hp <= 0 && this.alive) {
                this.hp = 0; this.alive = false;
                // 用 tick 传入的 game（headless 测试不调 init()，this._game 可能为空）
                this.beginDefeat();
                game?.onPlayerDeath?.();
            }
        }

        if (!this.alive) { this.updateVisualAnimation(dt); return; }

        this._iframeTimer = Math.max(0, this._iframeTimer - dt);
        this._invincible  = Math.max(0, this._invincible - dt);
        this._qCd         = Math.max(0, this._qCd - dt * (1 + this.stats.cdReduction));
        this._eCd         = Math.max(0, this._eCd - dt * (1 + this.stats.cdReduction));
        this._cosmosCd    = Math.max(0, this._cosmosCd - dt);
        // 大招R为固定冷却制，冷却时长按角色大招强度分档(见 CharacterDB.ultCd，
        // 强爆发20s/功能型18s/依赖词条15s)。ultChargeRate(储能核心等词条)沿用
        // "充能速度"语义，等比缩短恢复时间。
        const ultCd = this._charDef?.ultCd || 20;
        this._rCharge     = Math.min(1, this._rCharge + dt / ultCd * (this.stats.ultChargeRate || 1));

        // Buff 更新
        for (let i = this._buffs.length - 1; i >= 0; i--) {
            const b = this._buffs[i];
            b.duration -= dt;
            if (b.mods.invincible) this._invincible = Math.max(this._invincible, 0.1);
            if (b.duration <= 0) this._buffs.splice(i, 1);
        }

        // 临时护盾到期回收（只回收未被消耗的部分）
        for (let i = this._tempShields.length - 1; i >= 0; i--) {
            const ts = this._tempShields[i];
            ts.timer -= dt;
            if (ts.timer <= 0) {
                this.shield = Math.max(0, this.shield - ts.amount);
                this._tempShields.splice(i, 1);
            }
        }

        // 移动
        this.tickMovement(dt, input);
        // 跳跃使用独立的起跳/腾空/落地姿势，长按不会不断重置起跳帧。
        if (input.isJumpPressed?.() && !this.actorAnimation.locked) this.playVisualAction('jump');
        this.updateVisualAnimation(dt);

        // 普攻
        this._shootTimer += dt;
        const atkInterval = 1 / Math.max(0.1, this.getAtkSpd());
        if (!game?.testCeasefire && this._shootTimer >= atkInterval) {
            // 被受击/技能打断时保留一次待发机会，不能积累成恢复后的瞬间爆发。
            this._shootTimer = this._shoot(input, game)
                ? Math.min(atkInterval, this._shootTimer - atkInterval) : atkInterval;
        } else if (game?.testCeasefire) {
            this._shootTimer = Math.min(this._shootTimer, atkInterval);
        }

        // 技能 Q（CD 可按角色定制：qCd ?? 默认SKILL_Q_CD=4秒）
        if ((input.isKeyQPressed?.() ?? input.isKeyQ()) && this._qCd <= 0) {
            if (this._requestSkill('q', () => {
                game.audio?.playSfx?.('skill_q');
                this._grantCastShield(game);
                this._charDef.qSkill(this, game);
                const qName = this._charDef.skills.q.split('—')[0].trim();
                game.floatingText?.spawn(this.x, this.y - 55, qName, this.color, 15, true);
                game.augmentManager?.dispatchSkill(this, game);
            })) this._qCd = (this._charDef.qCd ?? SKILL_Q_CD) * (1 - this.stats.cdReduction);
        }
        // 技能 E（CD 可按角色定制：eCd ?? 默认SKILL_E_CD=10秒）
        if ((input.isKeyEPressed?.() ?? input.isKeyE()) && this._eCd <= 0) {
            if (this._requestSkill('e', () => {
                game.audio?.playSfx?.('skill_e');
                this._grantCastShield(game);
                let eName = this._charDef.skills.e.split('—')[0].trim();
                if (this.stats.eSkillUpgrade === 'blackhole') {
                    // 放置类技能：黑洞直接释放在敌人最密集的位置；
                    // 场上没有敌人时才退回鼠标位置。
                    const cluster = game.getEnemyClusterPoint?.();
                    const bx = cluster ? cluster.x : input.mouse.x;
                    const by = cluster ? cluster.y : input.mouse.y;
                    game.attractEnemies?.(bx, by, 120);
                    game.particles?.explode(bx, by, '#aa00ff', 60);
                    for (const e of game.enemies) {
                        if (e.alive && Math.hypot(e.x - bx, e.y - by) < 120) e.takeDamage(this.getDamage(game) * 2, this, game);
                    }
                    eName = '黑洞引擎';
                } else {
                    this._charDef.eSkill(this, game);
                }
                // Q/E 名称统一只由控制器显示一次。角色数据层只负责效果，避免
                // “网络连接/连接网络”这类同义文案在英雄头顶叠两遍。
                const eColor = this.stats.eSkillUpgrade === 'blackhole' ? '#cc00ff' : this.color;
                game.floatingText?.spawn(this.x, this.y - 55, eName, eColor, 15, true);
                game.augmentManager?.dispatchSkill(this, game);
            })) this._eCd = (this._charDef.eCd ?? SKILL_E_CD) * (1 - this.stats.cdReduction);
        }
        // 宇宙法则(cosmos_law)：R 键触发（独立于大招 R，走独立30s CD）。
        // 对齐 hexblast-py entities/player.py 的触发方式：
        // 持有 hasCosmos 且 CD 就绪时按 R 即激活，不消耗大招充能；
        // "互相攻击"部分沿用 hexblast-py 的半成品（变色+5s后AOE爆炸），
        // 这在 Python 原版中也未实现互攻 AI，记录为已知限制。
        if ((input.isKeyRPressed?.() ?? input.isKeyR()) && this.stats.hasCosmos && this._cosmosCd <= 0) {
            this._cosmosCd = 30;
            game.activateCosmos?.(this);
        }
        // 终极 R
        if ((input.isKeyRPressed?.() ?? input.isKeyR()) && this._rCharge >= 1) {
            if (this._requestSkill('r', () => {
                game.audio?.playSfx?.('skill_r');
                this._grantCastShield(game);
                this._charDef.ultimate(this, game);
                game.hitStop?.trigger(0.1);
            })) { this._rCharge = 0; this.ultReady = false; }
        }
        this._rCharge = Math.min(1, this._rCharge);
        if (this._rCharge >= 1) this.ultReady = true;
    }

    /** 时空行者被动：释放技能获得 castShield 点临时护盾（2 秒后自动回收未消耗部分）。 */
    private _grantCastShield(game: any): void {
        const v = this.stats.castShield || 0;
        if (v <= 0) return;
        this.grantTempShield(v, 2, game);
    }

    /**
     * 临时护盾：立即获得 amount 点护盾（上限同步抬高），dur 秒后自动回收
     * 未被消耗的部分（已被打掉的不返还）。多次施加各自独立计时。
     */
    grantTempShield(amount: number, dur: number, game?: any): void {
        if (amount <= 0) return;
        if (this.maxShield < this.shield + amount) this.maxShield = this.shield + amount;
        this.shield += amount;
        this._tempShields.push({ amount, timer: dur });
        game?.particles?.shieldBlock?.(this.x, this.y, false);
    }

    // ── 近战普攻 ────────────────────────────────────────────
    private _meleeAttack(game: any, lockedTarget?: any, lockedAngle?: number): void {
        // 远程角色切入近战形态时使用紧凑的形态近战范围（90），近战角色沿用自身攻击距离
        const range = (this.attackForm === 'melee' && this._charDef.attackType !== 'melee')
            ? 90 : this._charDef.attackRange;
        const enemy = lockedTarget ?? game.getNearestEnemy?.(this.x, this.y);
        if (!enemy) return;
        const inRange = enemy.alive && Vec.dist(this.x, this.y, enemy.x, enemy.y) <= range + this.radius + enemy.radius;
        if (!lockedTarget && !inRange) return;
        // 挥刃时生成特效，命中点另加冲击；武器挂点不改变攻击范围判定。
        const angle = lockedAngle ?? Math.atan2(enemy.y - this.y, enemy.x - this.x);
        if (this.charId === 'reik' && game.particles?.reikCleave) {
            game.particles.reikCleave(this.x, this.y, angle, range, 1, this._reikSwingSide++);
        } else if (this.charId === 'olia' && game.particles?.timeBlade) {
            const [bladeX, bladeY] = this.getMuzzlePosition();
            game.particles.timeBlade(bladeX, bladeY, angle);
        } else {
            game.particles?.meleeSlash?.(this.x, this.y, angle, this.color, range, 1);
        }
        // 前摇期间目标离开范围或绕到身后时仍挥出动作，但不会隔空/背向扣血。
        const dot = (enemy.x - this.x) * Math.cos(angle) + (enemy.y - this.y) * Math.sin(angle);
        if (inRange && dot >= 0) {
            game.particles?.impact?.(enemy.x, enemy.y, angle, 0.55, this.color);
            this.applyAttackDamage(enemy, game);
        }
    }

    /**
     * 统一攻击命中链路：暴击 → 精英/Boss加成 → 冻结要害 → 实际扣血 →
     * 攻击吸血 → 词条分发 → 浮字/粒子。近战普攻与狂战士Q冲锋共用，
     * 保证吸血按"实际扣血"（护盾吸收/护甲减免后）结算。
     */
    applyAttackDamage(enemy: any, game: any, baseDamage?: number): number {
        let dmg = baseDamage ?? this.getDamage(game);
        const isCrit = Rng.chance(this.stats.critRate || 0);
        if (isCrit) {
            dmg *= 1 + (this.stats.critDmg || 0.5);
            game.floatingText?.spawn(enemy.x, enemy.y - 20, '暴击！', '#ffd700', 14, true);
        }
        if ((enemy.isElite || enemy.isBoss) && this.stats.eliteBonus) dmg *= 1 + this.stats.eliteBonus;
        if (enemy.frozen > 0 && this.stats.freezeBonus) dmg *= this.stats.freezeBonus;
        const actual = enemy.takeDamage(dmg, this, game);
        const actualDamage = actual === undefined ? dmg : actual;
        this.applyAttackLifesteal(actualDamage, game);
        game.augmentManager?.dispatchHit(this, enemy, dmg, game);
        // 时空行者被动：额外造成15%真实伤害（无视护盾/护甲/隐身/无敌）
        if (this.stats.trueDamageRate && enemy.takeTrueDamage) {
            enemy.takeTrueDamage(dmg * this.stats.trueDamageRate, this, game);
        }
        if (actualDamage > 0) {
            game.floatingText?.spawn(enemy.x, enemy.y - 10, Math.ceil(dmg).toString(), isCrit ? '#ffd700' : this.color, isCrit ? 16 : 13, isCrit);
            game.particles?.hit(enemy.x, enemy.y, this.color);
        } else {
            // 无敌/隐身/格挡：显示"免疫"而不是伤害数字，避免看起来还在掉血
            game.floatingText?.spawn(enemy.x, enemy.y - 14, '免疫', '#9fb4c8', 12, false);
        }
        return dmg;
    }

    /** 攻击吸血：按实际扣血回血。lifestealRate 默认0（狂战士被动=0.05），
     *  大招等 buff 可通过 mods.lifestealRate 叠加（如死亡意志+45%）。 */
    applyAttackLifesteal(actualDamage: number, game: any): void {
        let rate = this.stats.lifestealRate || 0;
        for (const b of this._buffs) if (b.mods.lifestealRate) rate += b.mods.lifestealRate;
        if (rate <= 0 || actualDamage <= 0 || !this.alive) return;
        const heal = actualDamage * rate;
        if (heal < 1) return;
        const before = this.hp;
        this.heal(heal, false);
        const healed = this.hp - before;
        if (healed > 0) game.floatingText?.spawn(this.x + 14, this.y - 34, `+${Math.round(healed)}`, '#5fff5f', 12, false);
    }

    // ── 发射子弹 ─────────────────────────────────────────
    private _shoot(input: any, game: any): boolean {
        if (!this.alive || this._pendingFire) return false;
        if (this.actorAnimation.locked && this.actorAnimation.action !== 'attack' && this.actorAnimation.action !== 'attackMelee') return false;
        // 形态切换（时空行者E）：attackForm 优先于角色默认攻击方式
        const form = this.attackForm || this._charDef.attackType;
        if (form === 'melee') {
            const enemy = game.getNearestEnemy?.(this.x, this.y);
            const range = this._charDef.attackType === 'melee' ? this._charDef.attackRange : 90;
            if (!enemy?.alive || Vec.dist(this.x, this.y, enemy.x, enemy.y) > range + this.radius + enemy.radius) return false;
            const dx = enemy.x - this.x, dy = enemy.y - this.y;
            const angle = Math.atan2(dy, dx);
            return this._queueVisualAttack(dx, dy, () => this._meleeAttack(game, enemy, angle));
        }
        const nearest = game.getNearestEnemy?.(this.x, this.y);
        let tx = input.mouse.x, ty = input.mouse.y;
        if (nearest) { tx = nearest.x; ty = nearest.y; }
        const [ndx, ndy] = Vec.normalize(tx - this.x, ty - this.y);

        const dmg    = this.getDamage(game);
        const isCrit = Rng.chance(this.stats.critRate || 0);

        const spawnBullet = (dx: number, dy: number, dmgMult = 1) => {
            const [muzzleX, muzzleY] = this.getMuzzlePosition();
            game.bulletPool?.spawn({
                x: muzzleX, y: muzzleY, vx: dx * 550, vy: dy * 550,
                damage: dmg * dmgMult, radius: this._charDef.attackType === 'melee' ? 20 : 5,
                color: this.color, owner: 'player', isCrit,
                pierceLeft: this.stats.pierce || 0,
                bounceLeft: this.stats.bulletBounce || 0,
                charKey: this.charId, lifeTime: 2,
            });
        };

        const fire = () => {
            if (!this.alive) return;
            // 发弹时从当前枪口重新瞄准，不能沿“腰部→目标”的平行线飞过目标。
            const [muzzleX, muzzleY] = this.getMuzzlePosition();
            const aimX = nearest?.alive ? nearest.x : tx;
            const aimY = nearest?.alive ? nearest.y : ty;
            const [ndx, ndy] = Vec.normalize(aimX - muzzleX, aimY - muzzleY);
            game.audio?.playSfx?.('shoot');
            const flash = this.charId === 'liana' ? 'ice' : this.charId === 'graf' ? 'chaos' : this.charId === 'olia' ? 'time' : 'cyan';
            game.particles?.weaponFlash?.(muzzleX, muzzleY, ndx, ndy, flash);

            if (this.stats.novaMode) {
                // 全方向9发
                for (let i = 0; i < 9; i++) {
                    const a = (i / 9) * Math.PI * 2;
                    spawnBullet(Math.cos(a), Math.sin(a), 0.35);
                }
            } else if (this.stats.barrageMode) {
                // 5发散射
                const spread = 0.25;
                for (let i = -2; i <= 2; i++) {
                    const a = Math.atan2(ndy, ndx) + i * spread;
                    spawnBullet(Math.cos(a), Math.sin(a), 0.5);
                }
            } else {
                spawnBullet(ndx, ndy, 1);
                // 额外子弹
                for (let i = 0; i < (this.stats.extraBullets || 0); i++) {
                    const off = Rng.float(-0.15, 0.15);
                    const a   = Math.atan2(ndy, ndx) + off;
                    spawnBullet(Math.cos(a), Math.sin(a), 0.7);
                }
                // all_in
                for (let i = 1; i < (this.stats.allInBullets || 0); i++) {
                    const off = (i / (this.stats.allInBullets - 1) - 0.5) * 0.5;
                    const a   = Math.atan2(ndy, ndx) + off;
                    spawnBullet(Math.cos(a), Math.sin(a), 0.8);
                }
            }
        };
        // 开火帧驱动弹体生成，枪口火焰与伤害弹体共用同一时刻。
        return this._queueVisualAttack(ndx, ndy, fire);
    }

    private _queueVisualAttack(dx: number, dy: number, fire: () => void): boolean {
        const facing = resolveFacingView(dx, dy, this.animationView);
        const melee = (this.attackForm || this._charDef.attackType) === 'melee';
        const action: ActorAction = melee && actorClip(this.spriteKey, facing.view, 'attackMelee') ? 'attackMelee' : 'attack';
        const clip = actorClip(this.spriteKey, facing.view, action);
        if (!clip) { fire(); return true; }
        if (!this.playVisualAction(action, dx, dy)) return false;
        this._pendingFire = fire;
        const duration = clip.frames.reduce((sum, frame) => sum + frame.seconds, 0);
        this._attackAnimationRate = Math.max(1, duration * this.getAtkSpd());
        return true;
    }

    playVisualAction(action: ActorAction, dx = this.facingX, dy = this.facingY): boolean {
        // 受击/倒下沿用正在显示的身体方向，不能因移动输入不同而突然转身。
        const facing = action === 'hit' || action === 'defeated'
            ? { view: this.animationView, mirror: this.animationMirror }
            : resolveFacingView(dx, dy, this.animationView);
        const clip = actorClip(this.spriteKey, facing.view, action);
        if (!this.actorAnimation.play(action, clip, true)) return false;
        this.animationView = facing.view; this.animationMirror = facing.mirror;
        if (action !== 'attack' && action !== 'attackMelee') this._pendingFire = undefined;
        if (action === 'hit' && this._pendingSkill) {
            // 受击中断时保留输入，恢复后重播准备动作，不重复消耗CD。
            this._skillQueue.unshift(this._pendingSkill);
            this._pendingSkill = undefined;
        }
        return true;
    }

    updateVisualAnimation(dt: number): void {
        const moved = Math.hypot(this.x - this._animationLastX, this.y - this._animationLastY);
        this._animationLastX = this.x; this._animationLastY = this.y;
        if (!this.alive) {
            this.playVisualAction('defeated');
            this._pendingFire = undefined;
        } else if (!this.actorAnimation.locked) {
            const facing = resolveFacingView(this.facingX, this.facingY, this.animationView);
            const action: ActorAction = moved < 0.015 ? 'idle'
                : moved / Math.max(0.001, dt) > 240 ? 'run' : 'walk';
            const clip = actorClip(this.spriteKey, facing.view, action);
            if (clip) this.actorAnimation.play(action, clip);
            else this.actorAnimation.reset();
            this.animationView = facing.view; this.animationMirror = facing.mirror;
        }
        const attacking = this.actorAnimation.action === 'attack' || this.actorAnimation.action === 'attackMelee';
        this.actorAnimation.update(dt, attacking ? this._attackAnimationRate : 1);
        for (const { event, frame } of this.actorAnimation.takeFrameEvents()) {
            // 高攻速/低帧率可能一次跨过开火帧；保留事件自己的挂点，不使用已走到的收招帧。
            this._emissionOrigin = animationSocket(frame, this.x, this.y,
                82 * (this.actorAnimation.clip?.displayScale ?? 1), this.animationMirror);
            try {
                if (event === 'fire' || event === 'strike') {
                    const fire = this._pendingFire; this._pendingFire = undefined; fire?.();
                } else if (event === 'cast' && this.alive) {
                    const skill = this._pendingSkill; this._pendingSkill = undefined;
                    if (skill) {
                        this._castFacing = [skill.dx, skill.dy];
                        try { skill.run(); } finally { this._castFacing = undefined; }
                    }
                }
            } finally { this._emissionOrigin = undefined; }
        }
        this._startNextSkill();
    }

    private _requestSkill(slot: 'q' | 'e' | 'r', run: () => void): boolean {
        if (!this.alive || this._pendingSkill?.slot === slot || this._skillQueue.some(s => s.slot === slot)) return false;
        const [dx, dy] = Vec.normalize(this.facingX, this.facingY);
        const facing = resolveFacingView(dx, dy, this.animationView);
        const requestedAction = slot === 'q' ? 'skill' : slot === 'e' ? 'skill2' : 'skill3';
        // 尚未完成专属稿的角色暂时回落原有施法行；随着图集登记，Q/E/R会自动分流。
        const action: 'skill' | 'skill2' | 'skill3' = actorClip(this.spriteKey, facing.view, requestedAction)
            ? requestedAction
            : 'skill';
        const clip = actorClip(this.spriteKey, facing.view, action);
        if (!clip?.frames.some(frame => frame.event === 'cast')) { run(); return true; }
        this._skillQueue.push({ slot, action, run, dx, dy });
        this._startNextSkill();
        return true;
    }

    private _startNextSkill(): void {
        if (!this.alive || this._pendingSkill || this._skillQueue.length === 0) return;
        if (this.actorAnimation.locked && ['skill', 'skill2', 'skill3'].indexOf(this.actorAnimation.action) >= 0) return;
        const next = this._skillQueue[0];
        if (!this.playVisualAction(next.action, next.dx, next.dy)) return;
        this._skillQueue.shift(); this._pendingSkill = next;
    }

    getCastDirection(): [number, number] {
        return this._castFacing ?? Vec.normalize(this.facingX, this.facingY);
    }

    getMuzzlePosition(): [number, number] {
        if (this._emissionOrigin) return this._emissionOrigin;
        const frame = this.actorAnimation.currentFrame;
        return frame ? animationSocket(frame, this.x, this.y, 82 * (this.actorAnimation.clip?.displayScale ?? 1), this.animationMirror) ?? [this.x, this.y]
            : [this.x, this.y];
    }

    beginDefeat(): void {
        this._pendingFire = undefined;
        this._pendingSkill = undefined; this._skillQueue.length = 0;
        this.actorAnimation.play('defeated', actorClip(this.spriteKey, this.animationView, 'defeated'));
    }

    resetVisualAnimation(): void {
        this.actorAnimation.reset();
        this._emissionOrigin = undefined;
        this._pendingFire = undefined;
        this._pendingSkill = undefined; this._skillQueue.length = 0; this._castFacing = undefined;
        this._attackAnimationRate = 1;
        this._animationLastX = this.x; this._animationLastY = this.y;
        this._shootTimer = 0;
    }

    // ── CD 归零（eternal_machine 词条调用） ──────────────
    resetCooldowns(): void {
        this._qCd = 0;
        this._eCd = 0;
        // 大招R已是冷却制，"所有技能CD归零"应把大招也立即充满可用。
        this._rCharge = 1;
    }

    // ── 状态快照（用于 HUD） ─────────────────────────────
    getHPRatio(): number       { return this.hp / (this.stats.maxHp || 1); }
    getQCdRatio(): number      { return 1 - Math.min(1, this._qCd / (this._charDef?.qCd ?? 4)); }
    getECdRatio(): number      { return 1 - Math.min(1, this._eCd / (this._charDef?.eCd ?? 10)); }
    getUltChargeRatio(): number { return this._rCharge; }
    hasBuff(id: string): boolean { return !!this._buffs.find(b => b.id === id); }

    // ── 便捷访问器（GameManager / HUD 直接读取） ─────────
    get dead():         boolean { return !this.alive; }
    get maxHp():        number  { return this.stats.maxHp; }
    set maxHp(v:number)         { this.stats.maxHp = v; }
    get maxShield():    number  { return (this.stats as any).maxShield ?? 0; }
    set maxShield(v: number)    { (this.stats as any).maxShield = v; }
    get moveSpeed():    number  { return this.stats.speed; }
    set moveSpeed(v: number)    { this.stats.speed = v; }
    get damageMulti():  number  { return (this.stats as any).damageMulti ?? 1; }
    set damageMulti(v: number)  { (this.stats as any).damageMulti = v; }

    /**
     * Returns a skill-state snapshot consumed by HUD.refresh() and TouchControls.
     * Slots: [0]=Q skill, [1]=E skill, [2]=R ultimate.
     */
    getSkillStates(): { name: string; desc: string; icon: string; cd: number; maxCd: number }[] {
        const cdR = 1 + (this.stats.cdReduction ?? 0);
        const icons = this._charDef.skillIcons;
        const skills = this._charDef.skills;
        return [
            { name: 'Q', desc: skills.q, icon: icons.q, cd: this._qCd,   maxCd: (this._charDef.qCd ?? 4)  / cdR },
            { name: 'E', desc: skills.e, icon: icons.e, cd: this._eCd,   maxCd: (this._charDef.eCd ?? 10) / cdR },
            { name: 'R', desc: skills.r, icon: icons.r, cd: 1 - this._rCharge, maxCd: 1 },   // rCharge [0‥1]
        ];
    }
}
