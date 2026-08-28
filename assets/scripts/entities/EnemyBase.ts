// ============================================================
//  EnemyBase.ts — 敌人基类 + 5种敌人类型
// ============================================================
import type { Node, Sprite } from 'cc';
import { Vec, Rng, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';
import { getMiniBossDef, getTestGruntDef } from '../data/BossDB';
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
    /** 旧素材单位的程序化轮廓附件；随主体节点移动、转向、步态与显隐同步。 */
    accentNode?: Node;
    /** 与静止帧成对的真实动作帧。 */
    moveSpriteKey = 'enemy_grunt_move';
    /** 无完整方向帧的俯视单位（无人机）仅使用悬浮位移，不请求不存在的资源。 */
    directionalFrames = true;
    /** 渲染层用于避免每帧重复提交同一资源。 */
    locomotionFrameKey = '';
    /** 按敌人身体结构选择的步态；只影响渲染，不影响速度与碰撞。 */
    locomotionKind: LocomotionKind = 'biped';
    locomotion = createLocomotionState();
    /** 无论追击、横移、后退或站定，视觉上都由“指向玩家”的向量驱动。 */
    directionalFacing = createDirectionalFacingState('front');
    /** 底层位图的色调；旧单位另由 GameManager 叠加独立程序轮廓，不再只靠 tint 区分。 */
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
    /** 断针射手三点校射：公开蓄力进度与锁定线，渲染层逐段点亮。 */
    rangedAimWindup = 0;
    rangedAimWindupMax = 0.55;
    rangedAimTargetX = 0;
    rangedAimTargetY = 0;
    private _rangedBurstLeft = 0;
    private _rangedBurstCd = 0;
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
    /** 冲撞命中时直接推动玩家的距离；仅文档怪物使用，不改变常规击退系统。 */
    private _chargePush = 0;
    /** 冲撞扑空/结束后的可读僵直窗口。 */
    private _chargeRecovery = 0;
    /** 铆甲兽逻辑正面；与纯视觉方向帧解耦，供120°正面减伤判定。 */
    combatFacingX = 1;
    combatFacingY = 0;
    /** 撞墙后暂时失去正面减伤；渲染层据此熄灭装甲边光。 */
    frontGuardBroken = 0;
    /** 掠金虫12秒逃生与受击短促加速。 */
    scavengerEscapeTimer = 0;
    scavengerHitBoost = 0;
    private _scavengerAge = 0;
    /** 闪弧寄生体当前两条可视连接及友军短时增益。 */
    arcLinks: EnemyBase[] = [];
    arcBoostTimer = 0;
    /** 熔爆蜱靠近/被击杀后的不可取消爆炸倒计时。 */
    blastCountdown = 0;
    blastCountdownMax = 0;

    /** 小 Boss 技能冷却与计时（squid/turtle/shrimp/jelly/drone 系列用）。 */
    _miniCd1 = 0;
    _miniCd2 = 0;
    _miniTimer = 0;
    /** 小 Boss 已释放技能计数（深海鱿鱼放完一轮后自毁消失）。 */
    _miniSkillCount = 0;
    /** 《怪物设计与数值》机制小Boss的公开施法状态，GameManager据此绘制预警。 */
    miniSkillState = '';
    miniSkillTimer = 0;
    miniSkillMax = 0;
    miniSkillAngle = 0;
    miniSkillHit = false;
    /** 复合机制的命中次数、阶段索引与路径点；公开给渲染层读取。 */
    miniSkillHits = 0;
    miniSkillPhase = 0;
    miniPoints: { x: number; y: number }[] = [];

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
        this.rangedAimWindup = 0; this.rangedAimTargetX = 0; this.rangedAimTargetY = 0;
        this._rangedBurstLeft = 0; this._rangedBurstCd = 0;
        this.combatFacingX = 1; this.combatFacingY = 0; this.frontGuardBroken = 0;
        this.scavengerEscapeTimer = 0; this.scavengerHitBoost = 0; this._scavengerAge = 0;
        this.arcLinks = []; this.arcBoostTimer = 0; this.blastCountdown = 0; this.blastCountdownMax = 0;
        this._miniCd1 = 0; this._miniCd2 = 0; this._miniTimer = 0; this._miniSkillCount = 0;
        this.miniSkillState = ''; this.miniSkillTimer = 0; this.miniSkillMax = 0;
        this.miniSkillAngle = 0; this.miniSkillHit = false; this.miniSkillHits = 0;
        this.miniSkillPhase = 0; this.miniPoints = [];
        this.directionalFrames = true;
        resetLocomotion(this.locomotion);
        resetDirectionalFacing(this.directionalFacing, 'front');
        this._applyTypeDef(type, scale, game);
        this._applyMutations(game);
        // 精英增强
        if (this.isElite) { this.maxHp *= 3; this.hp = this.maxHp; this.damage *= 1.5; this.goldValue *= 3; }
    }

    private _applyTypeDef(type: string, scale: number, _game: any): void {
        // 维斯帕活卵孵化物：仅由Boss技能生成，不进入测试房目录，也不套波次成长。
        if (type === 'vespa_hatchling') {
            this.color = '#315928'; this.glowColor = '#78ff45';
            this.maxHp = 45; this.hp = 45; this.damage = 4; this.speed = 90;
            this.armor = 0; this.radius = 14; this.goldValue = 1;
            this.attackSpeed = 1 / 0.9; this.attackWindupMax = 0.24; this.meleeRange = 22;
            this.label = '酸幼蛛'; this.spriteKey = 'enemy_boss_vespa'; this.tintColor = '#baff8e';
            this.visualScale = 1.15; this.locomotionKind = 'skitter';
            this.directionalFrames = false; this.moveSpriteKey = this.spriteKey; this.locomotionFrameKey = '';
            return;
        }
        // 《怪物设计与数值》新增炮灰：测试房先行验证，独立贴图、数值与行为。
        const gruntDef = getTestGruntDef(type);
        if (gruntDef) {
            this.color = gruntDef.color; this.glowColor = gruntDef.glow;
            this.maxHp = gruntDef.maxHp; this.speed = gruntDef.speed;
            this.damage = gruntDef.damage; this.armor = gruntDef.armor;
            this.attackSpeed = 1 / gruntDef.attackInterval;
            this.radius = gruntDef.radius; this.goldValue = gruntDef.goldValue;
            this.label = gruntDef.label; this.attackWindupMax = gruntDef.attackWindupMax;
            this.visualScale = gruntDef.visualScale;
            this.spriteKey = gruntDef.spriteKey; this.tintColor = '#ffffff';
            // 锈齿扑兵在中心距约50px时锁定目标，短前摇后扑38px。
            this.meleeRange = type === 'rust_biter' ? 14 : type === 'rivet_beast' ? 110 : 0;
            if (type === 'needle_gunner') {
                this.rangedRange = 520;
                this.rangedKeepDist = 340; // 舒适区 290~390px
                this._rangedCd = 0;
            } else if (type === 'acid_sac') {
                this.rangedRange = 500;
                this.rangedKeepDist = 325;
                // 同批投手错开最多0.5秒，避免毒圈完全重叠成不可读色块。
                this._rangedCd = Rng.float(0, 0.5);
            } else if (type === 'ember_acolyte') {
                this.rangedRange = 520; this.rangedKeepDist = 340;
                this._rangedCd = Rng.float(0, 0.35);
            } else if (type === 'frost_acolyte') {
                this.rangedRange = 520; this.rangedKeepDist = 340;
                this.rangedAimWindupMax = 0.75;
                this._rangedCd = Rng.float(0, 0.35);
            } else if (type === 'arc_leech') {
                this.rangedRange = 500; this.rangedKeepDist = 320;
                this._rangedCd = Rng.float(0, 0.3);
            }
            if (type === 'gold_scavenger') this.scavengerEscapeTimer = 12;
            this.locomotionKind = type === 'rivet_beast' ? 'heavy'
                : type === 'frost_acolyte' || type === 'arc_leech' ? 'hover'
                : type === 'ember_acolyte' ? 'biped'
                : type === 'rust_biter' || type === 'acid_sac' ? 'quadruped' : 'skitter';
            // 首批新图为完整俯视战斗姿态；不请求不存在的旧六方向占位帧。
            this.directionalFrames = false;
            this.moveSpriteKey = this.spriteKey;
            this.locomotionFrameKey = '';
            this.hp = this.maxHp;
            return;
        }
        // 测试房间小 Boss（既有样例 + 设计文档新族）：数值来自 MINI_BOSSES 单一数据源
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
            if (type === 'chain_hound') this.meleeRange = 64;
            if (type === 'prism_snail') this.meleeRange = 70;
            if (type === 'triune_priest') this.meleeRange = 54;
            if (type === 'rail_butcher') this.meleeRange = 66;
            if (type === 'bell_devourer') this.meleeRange = 62;
            if (type === 'triune_priest') { this.rangedRange = 560; this.rangedKeepDist = 310; }
            if (type === 'rail_butcher') { this.rangedRange = 560; this.rangedKeepDist = 260; }
            if (type === 'bell_devourer') { this.rangedRange = 560; this.rangedKeepDist = 245; }
            if (type === 'shrimp') this.buffSpeedMult = 1.5;
            // 水母先以现形状态入场，2s 后进入隐身循环
            this._miniTimer = type === 'jelly' ? 2 : Rng.float(1, 3);
            if (type === 'chain_hound') { this._miniCd1 = 1.2; this._miniCd2 = 4.6; }
            if (type === 'prism_snail') { this._miniCd1 = 1.5; this._miniCd2 = 6.2; }
            if (type === 'triune_priest' || type === 'rail_butcher' || type === 'bell_devourer') {
                this._miniTimer = 1.35;
            }
            // 步态：水栖滑行/重甲/节肢/悬浮
            this.locomotionKind = ({
                squid: 'skitter', turtle: 'heavy', shrimp: 'skitter',
                jelly: 'hover', drone_a: 'hover', drone_s: 'hover',
                chain_hound: 'quadruped', prism_snail: 'heavy',
                triune_priest: 'hover', rail_butcher: 'heavy', bell_devourer: 'hover',
            } as Record<string, LocomotionKind>)[type] ?? 'biped';
            const usesSingleTopdownSprite = type === 'drone_a' || type === 'drone_s' ||
                type === 'chain_hound' || type === 'prism_snail' || type === 'triune_priest' ||
                type === 'rail_butcher' || type === 'bell_devourer';
            this.directionalFrames = !usesSingleTopdownSprite;
            this.moveSpriteKey = usesSingleTopdownSprite ? this.spriteKey : `${this.spriteKey}_move`;
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
                // 底层暂复用boss位图；渲染层叠加披风、双镰和单眼轮廓。
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
        // 铆甲兽正前方120°承伤-45%；撞墙破甲窗口内完全失效，侧后方也不减伤。
        if (this.type === 'rivet_beast' && this.frontGuardBroken <= 0 && attacker) {
            const [ax, ay] = Vec.normalize(attacker.x - this.x, attacker.y - this.y);
            if (ax * this.combatFacingX + ay * this.combatFacingY >= 0.5) rawDmg *= 0.55;
        }
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
        if (this.type === 'gold_scavenger') this.scavengerHitBoost = 0.8;
        if (this.type === 'blast_tick' && this.hp <= 0 && this.blastCountdown <= 0) {
            // 击杀会提前引爆而非删掉实体；0.45秒预警完整保留，击退仍可改爆点。
            this.hp = 1; this.invulnerable = true;
            this.blastCountdown = 0.45; this.blastCountdownMax = 0.45;
            game.floatingText?.spawn?.(this.x, this.y - 28, '提前引爆！', '#ff9b46', 14, true);
        }
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

    /**
     * 真实伤害（时空行者被动）：直接扣血，无视护盾/护甲/隐身/无敌。
     * 打空血走正常死亡结算；对已死亡目标不生效。
     */
    takeTrueDamage(amount: number, attacker: any, game: any): void {
        if (!this.alive || amount <= 0) return;
        this.hp -= amount;
        game?.floatingText?.spawn?.(this.x, this.y - 26, `${Math.ceil(amount)}真伤`, '#c8a2ff', 12, false);
        game?.particles?.hit?.(this.x, this.y, '#c8a2ff');
        if (this.hp <= 0) this._die(attacker, game);
    }

    protected _die(attacker: any, game: any): void {
        // 幂等保护：同帧多段伤害（多子弹/DoT+直伤）抢杀时只结算一次掉落与击杀数
        if (!this.alive) return;
        if (this.type === 'arc_leech') {
            for (const linked of this.arcLinks) if (linked.alive) linked.stunned = Math.max(linked.stunned, 0.6);
            this.arcLinks = [];
        }
        this.hp    = 0;
        this.alive = false;
        game.economy?.spawnDrop(this.x, this.y, this.goldValue);
        if (this.type === 'gold_scavenger' && this._scavengerAge <= 5) {
            game.economy?.spawnDrop(this.x, this.y, 6);
            game.floatingText?.spawn?.(this.x, this.y - 34, '截获！ +6', '#ffd75a', 17, true);
        }
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
        if (this.frontGuardBroken > 0) this.frontGuardBroken = Math.max(0, this.frontGuardBroken - dt);
        if (this.scavengerHitBoost > 0) this.scavengerHitBoost = Math.max(0, this.scavengerHitBoost - dt);
        if (this.arcBoostTimer > 0) this.arcBoostTimer = Math.max(0, this.arcBoostTimer - dt);
        if (this.type === 'gold_scavenger') {
            this._scavengerAge += dt;
            this.scavengerEscapeTimer = Math.max(0, this.scavengerEscapeTimer - dt);
        }

        if (this.blastCountdown > 0) {
            this.blastCountdown = Math.max(0, this.blastCountdown - dt);
            if (this.blastCountdown <= 0) {
                game.particles?.explode?.(this.x, this.y, '#ff6b1f', 92);
                game.audio?.playSfx?.('explode', 0.75);
                if (player.alive && Vec.dist(this.x, this.y, player.x, player.y) <= 92 + (player.radius ?? 16)) {
                    player.takeDamage(this.damage * this.buffDmgMult, game, { ignoreIframe: game?.state === 'testRoom' });
                }
                this.invulnerable = false;
                this.hp = 0;
                this._die(player, game);
            }
            return;
        }

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
            const nextX = this.x + this._chargeVx * dt;
            const nextY = this.y + this._chargeVy * dt;
            const hitBoundary = nextX <= this.radius || nextX >= CANVAS_W - this.radius ||
                nextY <= this.radius || nextY >= PLAYFIELD_BOTTOM - this.radius;
            this.x = nextX;
            this.y = nextY;
            this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
            this.y = clamp(this.y, this.radius, PLAYFIELD_BOTTOM - this.radius);
            if ((this.type === 'rivet_beast' || this.type === 'chain_hound') && hitBoundary) {
                this._chargeT = 0; this._chargeDmg = 0; this._chargePush = 0; this._chargeRecovery = 0;
                const hound = this.type === 'chain_hound';
                this.stunned = hound ? 1.1 : 1.2;
                if (!hound) this.frontGuardBroken = 1.2;
                game.particles?.impact?.(this.x, this.y, Math.atan2(-this._chargeVy, -this._chargeVx), 1, hound ? '#ff4138' : '#a9e5ff');
                game.floatingText?.spawn?.(this.x, this.y - 38, hound ? '撞墙失衡！' : '装甲破裂！', hound ? '#ff756d' : '#a9e5ff', 15, true);
                return;
            }
            if (this._chargeDmg > 0 && player.alive &&
                Vec.dist(this.x, this.y, player.x, player.y) < this.radius + (player.radius ?? 16) + 8) {
                player.takeDamage(this._chargeDmg, game);
                if (this._chargePush > 0) {
                    const [pdx, pdy] = Vec.normalize(this._chargeVx, this._chargeVy);
                    player.x = clamp(player.x + pdx * this._chargePush, player.radius ?? 16, CANVAS_W - (player.radius ?? 16));
                    player.y = clamp(player.y + pdy * this._chargePush, player.radius ?? 16, PLAYFIELD_BOTTOM - (player.radius ?? 16));
                    game.particles?.impact?.(player.x, player.y, Math.atan2(pdy, pdx), 0.55, this.glowColor);
                }
                this._chargeDmg = 0;
                this._chargePush = 0;
            }
            return;
        }

        if (this._chargeRecovery > 0) {
            this._chargeRecovery = Math.max(0, this._chargeRecovery - dt);
            return;
        }

        // 测试房间小 Boss 专属技能
        if (this.isMiniBoss) this._updateMiniBoss(dt, player, game);
        // 巡灯/闭壳期间停止追击与接触攻击，两个大范围机制不会互相叠加。
        if (this.type === 'prism_snail' && this.miniSkillState !== '') return;
        if (this.type === 'triune_priest' && this.miniSkillState !== '') return;
        if (this.type === 'rail_butcher' && this.miniSkillState !== '' && this.miniSkillState !== 'rail_drag') return;
        if (this.type === 'bell_devourer' && this.miniSkillState !== '' &&
            this.miniSkillState !== 'bell_record' && this.miniSkillState !== 'bell_silence') return;

        // 近战攻击先进入清晰前摇。前摇期间敌人停步，玩家能读懂危险并躲开；
        // 只有结束时仍在攻击距离内才命中，避免旧版“贴近即无动画扣血”。
        if (this.attackWindup > 0) {
            this.attackWindup = Math.max(0, this.attackWindup - dt * (this.arcBoostTimer > 0 ? 1.15 : 1));
            if (this.attackWindup <= 0 && player.alive) {
                const atkDist = this.radius + (player.radius ?? 16) + this.meleeRange;
                const dist = Math.hypot(player.x - this.x, player.y - this.y);
                if (this.type === 'rust_biter') {
                    // 锁定前摇时记录的方向，不在扑击瞬间重新追踪玩家。
                    const [lx, ly] = Vec.normalize(this.attackTargetX - this.x, this.attackTargetY - this.y);
                    this._chargeVx = lx * 190;
                    this._chargeVy = ly * 190;
                    this._chargeT = 0.20; // 38px
                    this._chargeDmg = this.damage * this.buffDmgMult;
                    this._chargePush = 18;
                    this._chargeRecovery = 0.35;
                    game.particles?.meleeSlash?.(this.x, this.y, Math.atan2(ly, lx), this.glowColor, 38, 0.9);
                } else if (this.type === 'chain_hound' && this.miniSkillState === 'chain_charge') {
                    // 链钉冲猎：0.70秒走廊锁向后冲360px；撞墙分支在上方统一结算眩晕。
                    const [lx, ly] = Vec.normalize(this.attackTargetX - this.x, this.attackTargetY - this.y);
                    this.combatFacingX = lx; this.combatFacingY = ly;
                    this._chargeVx = lx * 560;
                    this._chargeVy = ly * 560;
                    this._chargeT = 360 / 560;
                    this._chargeDmg = 22 * this.buffDmgMult;
                    this._chargePush = 65;
                    this._chargeRecovery = 0.30;
                    this.miniSkillState = '';
                    game.particles?.meleeSlash?.(this.x, this.y, Math.atan2(ly, lx), '#ff4138', 72, 1.25);
                } else if (this.type === 'rivet_beast') {
                    // 0.55秒长走廊锁向后冲100px，冲锋本身不再追踪玩家。
                    const [lx, ly] = Vec.normalize(this.attackTargetX - this.x, this.attackTargetY - this.y);
                    this.combatFacingX = lx; this.combatFacingY = ly;
                    this._chargeVx = lx * 250;
                    this._chargeVy = ly * 250;
                    this._chargeT = 0.40;
                    this._chargeDmg = this.damage * this.buffDmgMult;
                    this._chargePush = 55;
                    this._chargeRecovery = 0.25;
                    game.particles?.meleeSlash?.(this.x, this.y, Math.atan2(ly, lx), '#a9e5ff', 52, 1.15);
                } else if (this.type === 'shrimp') {
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

        // 掠金虫没有攻击逻辑：先贴近最近边缘，再沿边奔向离玩家最远的角落。
        if (this.type === 'gold_scavenger') {
            if (this.scavengerEscapeTimer <= 0) {
                this.alive = false;
                game.floatingText?.spawn?.(this.x, this.y - 30, '逃脱', '#c8a867', 14, false);
                return;
            }
            const edge = this.radius + 8;
            const farX = player.x < CANVAS_W * 0.5 ? CANVAS_W - edge : edge;
            const farY = player.y < PLAYFIELD_BOTTOM * 0.5 ? PLAYFIELD_BOTTOM - edge : edge;
            const edgeDistances = [this.x - edge, CANVAS_W - edge - this.x, this.y - edge, PLAYFIELD_BOTTOM - edge - this.y];
            const nearest = edgeDistances.indexOf(Math.min(...edgeDistances));
            let tx = farX, ty = farY;
            if (Math.min(...edgeDistances) > 3) {
                if (nearest === 0) { tx = edge; ty = this.y; }
                else if (nearest === 1) { tx = CANVAS_W - edge; ty = this.y; }
                else if (nearest === 2) { tx = this.x; ty = edge; }
                else { tx = this.x; ty = PLAYFIELD_BOTTOM - edge; }
            } else if (nearest <= 1) tx = nearest === 0 ? edge : CANVAS_W - edge;
            else ty = nearest === 2 ? edge : PLAYFIELD_BOTTOM - edge;
            const [sx, sy] = Vec.normalize(tx - this.x, ty - this.y);
            const boost = this.scavengerHitBoost > 0 ? 1.2 : 1;
            this.combatFacingX = sx; this.combatFacingY = sy;
            this.x = clamp(this.x + sx * this.speed * boost * dt, this.radius, CANVAS_W - this.radius);
            this.y = clamp(this.y + sy * this.speed * boost * dt, this.radius, PLAYFIELD_BOTTOM - this.radius);
            return;
        }

        if (this.type === 'arc_leech') {
            this.arcLinks = (game.enemies || [])
                .filter((e: EnemyBase) => e !== this && e.alive && e.type !== 'arc_leech' &&
                    Vec.dist(e.x, e.y, this.x, this.y) <= 220)
                .sort((a: EnemyBase, b: EnemyBase) => Vec.dist(a.x, a.y, this.x, this.y) - Vec.dist(b.x, b.y, this.x, this.y))
                .slice(0, 2);
            for (const linked of this.arcLinks) linked.arcBoostTimer = Math.max(linked.arcBoostTimer, 0.22);
        }

        // 向玩家移动；远程单位改为与玩家拉扯保持距离，并在射程内发射毒弹
        const [dx, dy] = Vec.normalize(player.x - this.x, player.y - this.y);
        this.combatFacingX = dx; this.combatFacingY = dy;
        const spd = this.speed * (this.frozen > 0 ? 0 : this.slowMult) * this.buffSpeedMult *
            (this.arcBoostTimer > 0 ? 1.15 : 1);
        let mvx = dx, mvy = dy;
        if (this.rangedRange > 0) {
            const dist = Math.hypot(player.x - this.x, player.y - this.y);
            if (dist < this.rangedKeepDist - 60) { mvx = -dx; mvy = -dy; }      // 太近 → 后撤
            else if (dist <= this.rangedKeepDist + 40) { mvx = 0; mvy = 0; }    // 舒适区 → 停步开火
            else if (this.type === 'needle_gunner') {
                // 太远时斜向靠近，避免所有射手在同一条半径线上堆成一团。
                mvx = dx * 0.72 - dy * 0.42;
                mvy = dy * 0.72 + dx * 0.42;
            }
            if (this.type === 'needle_gunner' && this.rangedAimWindup > 0) {
                mvx = 0; mvy = 0;
                this.rangedAimWindup = Math.max(0, this.rangedAimWindup - dt);
                if (this.rangedAimWindup <= 0) {
                    this._rangedBurstLeft = 3;
                    this._rangedBurstCd = 0;
                }
            } else if (this.type === 'needle_gunner' && this._rangedBurstLeft > 0) {
                mvx = 0; mvy = 0;
                this._rangedBurstCd -= dt;
                if (this._rangedBurstCd <= 0) {
                    const a = Math.atan2(this.rangedAimTargetY - this.y, this.rangedAimTargetX - this.x);
                    game.enemyBullets?.push({
                        x: this.x, y: this.y,
                        vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                        damage: this.damage * this.buffDmgMult, radius: 5,
                        color: '#fff06a', life: 3, lifeTime: 3,
                        owner: 'enemy', isEnemyBullet: true, enemyFx: 'needle',
                    });
                    this._rangedBurstLeft--;
                    this._rangedBurstCd = 0.12;
                    if (this._rangedBurstLeft <= 0) this._rangedCd = 1.65;
                }
            } else if (this.type === 'frost_acolyte' && this.rangedAimWindup > 0) {
                mvx = 0; mvy = 0;
                this.rangedAimWindup = Math.max(0, this.rangedAimWindup - dt * (this.arcBoostTimer > 0 ? 1.15 : 1));
                if (this.rangedAimWindup <= 0) {
                    const center = Math.atan2(this.rangedAimTargetY - this.y, this.rangedAimTargetX - this.x);
                    for (const off of [-0.16, 0, 0.16]) {
                        const a = center + off;
                        game.enemyBullets?.push({
                            x: this.x, y: this.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
                            damage: this.damage * this.buffDmgMult, radius: 6, color: '#9eefff',
                            life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true,
                            enemyFx: 'frost', slow: { mult: 0.75, dur: 1.6 },
                        });
                    }
                    this._rangedCd = 2.6;
                }
            } else if (this._rangedCd > 0) {
                this._rangedCd -= dt;
            } else if (this.type === 'needle_gunner' && player.alive && dist <= this.rangedRange && this.frozen <= 0) {
                // 用英雄当前移动朝向做一次轻量预判；三发都锁定这条线，不逐发追踪。
                const lead = 70;
                const px = player.x + (player.facingX ?? 0) * lead;
                const py = player.y + (player.facingY ?? 0) * lead;
                const a = Math.atan2(py - this.y, px - this.x);
                this.rangedAimTargetX = this.x + Math.cos(a) * 620;
                this.rangedAimTargetY = this.y + Math.sin(a) * 620;
                this.rangedAimWindup = this.rangedAimWindupMax;
                mvx = 0; mvy = 0;
            } else if (this.type === 'acid_sac' && player.alive && dist <= this.rangedRange && this.frozen <= 0) {
                // 落点领先玩家当前移动方向45px；抛物线与虚线落点由GameManager统一绘制。
                const tx = clamp(player.x + (player.facingX ?? 0) * 45, 52, CANVAS_W - 52);
                const ty = clamp(player.y + (player.facingY ?? 0) * 45, 52, PLAYFIELD_BOTTOM - 52);
                game.spawnEnemyAcidHazard?.(this.x, this.y, tx, ty);
                game.particles?.toxin?.(this.x, this.y);
                this._rangedCd = 2.2;
            } else if (this.type === 'ember_acolyte' && player.alive && dist <= this.rangedRange && this.frozen <= 0) {
                game.spawnEnemyEmberHazard?.(player.x, player.y);
                game.particles?.ignite?.(this.x, this.y);
                this._rangedCd = 2.4;
            } else if (this.type === 'frost_acolyte' && player.alive && dist <= this.rangedRange && this.frozen <= 0) {
                const a = Math.atan2(player.y - this.y, player.x - this.x);
                this.rangedAimTargetX = this.x + Math.cos(a) * 620;
                this.rangedAimTargetY = this.y + Math.sin(a) * 620;
                this.rangedAimWindup = 0.75;
                mvx = 0; mvy = 0;
            } else if (this.type === 'arc_leech' && player.alive && dist <= this.rangedRange && this.frozen <= 0) {
                const a = Math.atan2(player.y - this.y, player.x - this.x);
                game.enemyBullets?.push({
                    x: this.x, y: this.y, vx: Math.cos(a) * 185, vy: Math.sin(a) * 185,
                    damage: this.damage * this.buffDmgMult, radius: 8, color: '#7df4ff',
                    life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true, enemyFx: 'arc',
                });
                this._rangedCd = 2.0;
            } else if (player.alive && dist <= this.rangedRange && this.frozen <= 0) {
                const a = Math.atan2(player.y - this.y, player.x - this.x);
                game.enemyBullets?.push({
                    x: this.x, y: this.y,
                    vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                    damage: this.damage * this.buffDmgMult, radius: 5,
                    color: '#baff5c', life: 3, lifeTime: 3,
                    owner: 'enemy', isEnemyBullet: true, enemyFx: 'toxin_dart',
                });
                this._rangedCd = 2.2;
            }
        }
        this.x += (mvx * spd + this.knockbackX) * dt;
        this.y += (mvy * spd + this.knockbackY) * dt;
        this.x = clamp(this.x, this.radius, CANVAS_W - this.radius);
        this.y = clamp(this.y, this.radius, PLAYFIELD_BOTTOM - this.radius);

        if (this.type === 'blast_tick' && player.alive &&
            Vec.dist(this.x, this.y, player.x, player.y) <= 82 + (player.radius ?? 16)) {
            this.blastCountdown = 0.80;
            this.blastCountdownMax = 0.80;
            this.combatFacingX = dx; this.combatFacingY = dy;
            return;
        }

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
            case 'chain_hound': this._miniBossChainHound(dt, player, game); break;
            case 'prism_snail': this._miniBossPrismSnail(dt, player, game); break;
            case 'triune_priest': this._miniBossTriunePriest(dt, player, game); break;
            case 'rail_butcher': this._miniBossRailButcher(dt, player, game); break;
            case 'bell_devourer': this._miniBossBellDevourer(dt, player, game); break;
        }
    }

    /** 铆链猎犬（普通）：锁向长冲锋与两枚可规避捕兽夹交替，技能之间保留输出空档。 */
    private _miniBossChainHound(dt: number, player: any, game: any): void {
        this._miniCd1 -= dt; this._miniCd2 -= dt;
        if (!player.alive || this.attackWindup > 0 || this._chargeT > 0) return;
        if (this._miniCd1 <= 0 && this._miniCd2 > 1.5) {
            this._miniCd1 = 6;
            this.attackTargetX = player.x; this.attackTargetY = player.y;
            // 本帧后续会统一递减一次dt，先补回dt，保证屏幕上实际保留完整0.70秒。
            this.attackWindupMax = 0.70; this.attackWindup = 0.70 + dt;
            this.miniSkillState = 'chain_charge';
            this.miniSkillTimer = 0.70; this.miniSkillMax = 0.70;
            game.floatingText?.spawn?.(this.x, this.y - 46, '链钉冲猎', '#ff756d', 15, true);
        } else if (this._miniCd2 <= 0 && this._miniCd1 > 1.5) {
            this._miniCd2 = 8;
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            const px = -Math.sin(a), py = Math.cos(a);
            game.spawnHoundTraps?.(
                clamp(player.x + px * 58, 34, CANVAS_W - 34),
                clamp(player.y + py * 58, 34, PLAYFIELD_BOTTOM - 34),
                clamp(player.x - px * 58, 34, CANVAS_W - 34),
                clamp(player.y - py * 58, 34, PLAYFIELD_BOTTOM - 34),
            );
            game.particles?.impact?.(this.x, this.y, a, 0.65, '#ff4138');
            game.floatingText?.spawn?.(this.x, this.y - 46, '回收夹', '#ffad72', 15, true);
        }
    }

    /** 棱壳巡灯兽（普通）：150°巡灯光带与可打破的闭壳蓄光严格互斥。 */
    private _miniBossPrismSnail(dt: number, player: any, game: any): void {
        this._miniCd1 -= dt; this._miniCd2 -= dt;
        if (!player.alive) return;

        if (this.miniSkillState === 'prism_windup') {
            this.miniSkillTimer -= dt;
            if (this.miniSkillTimer <= 0) {
                this.miniSkillState = 'prism_sweep';
                this.miniSkillTimer = 1.8; this.miniSkillMax = 1.8; this.miniSkillHit = false;
            }
            return;
        }
        if (this.miniSkillState === 'prism_sweep') {
            this.miniSkillTimer -= dt;
            const progress = 1 - Math.max(0, this.miniSkillTimer) / 1.8;
            const angle = this.miniSkillAngle + (-75 + 150 * progress) * Math.PI / 180;
            if (!this.miniSkillHit) {
                const dx = player.x - this.x, dy = player.y - this.y;
                const along = dx * Math.cos(angle) + dy * Math.sin(angle);
                const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
                if (along >= 0 && along <= 900 && across <= 14 + (player.radius ?? 16)) {
                    this.miniSkillHit = true;
                    player.takeDamage(16, game, { ignoreIframe: game?.state === 'testRoom' });
                    game.particles?.coldImpact?.(player.x, player.y);
                }
            }
            if (this.miniSkillTimer <= 0) this.miniSkillState = '';
            return;
        }
        if (this.miniSkillState === 'prism_shell') {
            this.miniSkillTimer -= dt;
            if (this.shieldHp <= 0) {
                this.miniSkillState = ''; this.shieldActive = false; this.stunned = 1.3;
                game.economy?.spawnDrop?.(this.x, this.y, 8);
                game.particles?.shieldBlock?.(this.x, this.y, true);
                game.floatingText?.spawn?.(this.x, this.y - 48, '破壳眩晕！ +8', '#c8f7ff', 16, true);
            } else if (this.miniSkillTimer <= 0) {
                this.miniSkillState = ''; this.shieldActive = false; this.shieldHp = 0;
                for (let i = 0; i < 6; i++) {
                    const a = i / 6 * Math.PI * 2;
                    game.enemyBullets?.push({
                        x: this.x, y: this.y, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175,
                        damage: 8, radius: 8, color: '#a8efff', life: 5, lifeTime: 5,
                        owner: 'enemy', isEnemyBullet: true, enemyFx: 'frost',
                    });
                }
                game.particles?.hexActivate?.(this.x, this.y, '#c8f7ff');
            }
            return;
        }

        if (this._miniCd1 <= 0 && this._miniCd2 > 1.5) {
            this._miniCd1 = 6.5;
            this.miniSkillState = 'prism_windup';
            this.miniSkillTimer = 0.75; this.miniSkillMax = 0.75;
            this.miniSkillAngle = Math.atan2(player.y - this.y, player.x - this.x);
            game.floatingText?.spawn?.(this.x, this.y - 48, '巡灯切线', '#a8efff', 15, true);
        } else if (this._miniCd2 <= 0 && this._miniCd1 > 1.5) {
            this._miniCd2 = 10;
            this.miniSkillState = 'prism_shell';
            this.miniSkillTimer = 2.5; this.miniSkillMax = 2.5;
            this.maxShieldHp = 220; this.shieldHp = 220; this.shieldActive = true;
            game.particles?.shieldBlock?.(this.x, this.y, false);
            game.floatingText?.spawn?.(this.x, this.y - 48, '闭壳蓄光', '#fff3c4', 15, true);
        }
    }

    /** 三相祭司（史诗）：火→冰→雷固定轮转，施法器官与地面机制保持同色。 */
    private _miniBossTriunePriest(dt: number, player: any, game: any): void {
        this._miniTimer -= dt;
        if (!player.alive) return;
        if (this.miniSkillState !== '') {
            this.miniSkillTimer = Math.max(0, this.miniSkillTimer - dt);
            if (this.miniSkillTimer <= 0) this.miniSkillState = '';
            return;
        }
        if (this._miniTimer > 0 || this.attackWindup > 0) return;

        const phase = this._miniSkillCount % 3;
        this.miniSkillPhase = phase;
        if (phase === 0) {
            // 当前点、移动方向前方与更远前方构成连续三次预测烙印。
            const vx = player.lastMoveX ?? player.moveX ?? 0;
            const vy = player.lastMoveY ?? player.moveY ?? 0;
            const [mx, my] = Vec.normalize(vx, vy);
            this.miniPoints = [0, 42, 84].map(d => ({
                x: clamp(player.x + mx * d, 52, CANVAS_W - 52),
                y: clamp(player.y + my * d, 52, PLAYFIELD_BOTTOM - 52),
            }));
            game.spawnTriuneFireMarks?.(this.miniPoints);
            this.miniSkillState = 'triune_fire'; this.miniSkillTimer = 1.65; this.miniSkillMax = 1.65;
            this._miniTimer = 7;
            game.floatingText?.spawn?.(this.x, this.y - 50, '焚相 · 移动烙印', '#ff9a42', 15, true);
        } else if (phase === 1) {
            this.miniSkillState = 'triune_ice'; this.miniSkillTimer = 0.9; this.miniSkillMax = 0.9;
            this._miniTimer = 9;
            game.spawnTriuneIceWall?.(this.x < CANVAS_W / 2 ? 'left' : 'right');
            game.floatingText?.spawn?.(this.x, this.y - 50, '冻相 · 晶墙分流', '#8eeaff', 15, true);
        } else {
            this.miniSkillState = 'triune_arc'; this.miniSkillTimer = 1.2; this.miniSkillMax = 1.2;
            this._miniTimer = 11;
            game.spawnTriuneConductors?.(player.x, player.y);
            game.floatingText?.spawn?.(this.x, this.y - 50, '雷相 · 三角传导', '#d8f7ff', 15, true);
        }
        this._miniSkillCount++;
        game.particles?.hexActivate?.(this.x, this.y, phase === 0 ? '#ff8a35' : phase === 1 ? '#8eeaff' : '#d8f7ff');
    }

    /** 磁轨屠夫（史诗）：磁轨→回转锯→拖拽固定轮转，绝不让炮击与拖拽重叠。 */
    private _miniBossRailButcher(dt: number, player: any, game: any): void {
        this._miniTimer -= dt;
        if (!player.alive) return;
        if (this.miniSkillState === 'rail_recoil') {
            this.miniSkillTimer -= dt;
            if (this.miniSkillTimer <= 0) this.miniSkillState = '';
            return;
        }
        if (this.miniSkillState === 'rail_windup') {
            this.miniSkillTimer -= dt;
            if (this.miniSkillTimer <= 0) {
                const a = this.miniSkillAngle;
                game.enemyBullets?.push({
                    x: this.x + Math.cos(a) * 38, y: this.y + Math.sin(a) * 38,
                    vx: Math.cos(a) * 980, vy: Math.sin(a) * 980,
                    damage: 30, radius: 10, color: '#ff4fb9', life: 1.6, enemyFx: 'rail',
                });
                this.x = clamp(this.x - Math.cos(a) * 100, this.radius, CANVAS_W - this.radius);
                this.y = clamp(this.y - Math.sin(a) * 100, this.radius, PLAYFIELD_BOTTOM - this.radius);
                // 保留极短后坐僵直，既防同帧追击抵消100px位移，也让开火重量感可见。
                this.miniSkillState = 'rail_recoil'; this.miniSkillTimer = 0.15; this.miniSkillMax = 0.15;
                game.particles?.impact?.(this.x, this.y, a + Math.PI, 1.1, '#ff4fb9');
                if (game.isInsideRailSawOrbit?.(this.x, this.y)) {
                    this.stunned = 1;
                    game.floatingText?.spawn?.(this.x, this.y - 52, '锯轨过载！', '#ffbd65', 16, true);
                }
            }
            return;
        }
        if (this.miniSkillState === 'rail_saw') {
            this.miniSkillTimer -= dt;
            if (this.miniSkillTimer <= 0) this.miniSkillState = '';
            return;
        }
        if (this.miniSkillState === 'rail_drag') {
            this.miniSkillTimer -= dt;
            this.buffSpeedMult = 0.45;
            if (this.miniSkillTimer <= 1.8) {
                const [dx, dy] = Vec.normalize(this.x - player.x, this.y - player.y);
                player.x = clamp(player.x + dx * 95 * dt, player.radius ?? 16, CANVAS_W - (player.radius ?? 16));
                player.y = clamp(player.y + dy * 95 * dt, player.radius ?? 16, PLAYFIELD_BOTTOM - (player.radius ?? 16));
            }
            if (this.miniSkillTimer <= 0) { this.miniSkillState = ''; this.buffSpeedMult = 1; }
            return;
        }
        if (this._miniTimer > 0 || this.attackWindup > 0) return;

        const phase = this._miniSkillCount % 3;
        this.miniSkillPhase = phase;
        if (phase === 0) {
            this.miniSkillState = 'rail_windup'; this.miniSkillTimer = 0.9; this.miniSkillMax = 0.9;
            this.miniSkillAngle = Math.atan2(player.y - this.y, player.x - this.x);
            this._miniTimer = 6;
            game.floatingText?.spawn?.(this.x, this.y - 54, '零距磁轨', '#ff61c4', 15, true);
        } else if (phase === 1) {
            this.miniSkillState = 'rail_saw'; this.miniSkillTimer = 3.15; this.miniSkillMax = 3.15;
            this._miniTimer = 8;
            game.spawnRailSaws?.(this.x, this.y);
            game.floatingText?.spawn?.(this.x, this.y - 54, '回转废锯', '#ff9b32', 15, true);
        } else {
            this.miniSkillState = 'rail_drag'; this.miniSkillTimer = 2.8; this.miniSkillMax = 2.8;
            this.miniSkillPhase = 0; // 前1秒只显示箭头，之后拉拽1.8秒。
            this._miniTimer = 12;
            game.floatingText?.spawn?.(this.x, this.y - 54, '磁极拖拽', '#71bfff', 15, true);
        }
        this._miniSkillCount++;
    }

    /** 葬钟吞噬者（地狱）：声圈、旧轨迹回放与可走出的静默钟罩。 */
    private _miniBossBellDevourer(dt: number, player: any, game: any): void {
        this._miniTimer -= dt;
        if (!player.alive) return;
        if (this.miniSkillState === 'bell_rings') {
            this.miniSkillTimer -= dt;
            const elapsed = this.miniSkillMax - Math.max(0, this.miniSkillTimer);
            const phase = Math.min(5, Math.floor(elapsed / 0.32));
            if (phase !== this.miniSkillPhase) { this.miniSkillPhase = phase; this.miniSkillHit = false; }
            const ringAge = elapsed - phase * 0.32;
            const ringR = ringAge * 360;
            const dist = Vec.dist(this.x, this.y, player.x, player.y);
            const angle = Math.atan2(player.y - this.y, player.x - this.x);
            const gap = (phase % 2) * Math.PI / 3 + phase * Math.PI / 3;
            const gapDiff = Math.abs(Math.atan2(Math.sin(angle - gap), Math.cos(angle - gap)));
            if (!this.miniSkillHit && this.miniSkillHits < 2 && gapDiff > 0.34 && Math.abs(dist - ringR) <= 14 + (player.radius ?? 16)) {
                this.miniSkillHit = true; this.miniSkillHits++;
                player.takeDamage(16, game, { ignoreIframe: game?.state === 'testRoom' });
                game.particles?.impact?.(player.x, player.y, angle, 0.7, '#fff0a6');
            }
            if (this.miniSkillTimer <= 0) this.miniSkillState = '';
            return;
        }
        if (this.miniSkillState === 'bell_record') {
            this.miniSkillTimer -= dt;
            const last = this.miniPoints[this.miniPoints.length - 1];
            if (!last || Vec.dist(last.x, last.y, player.x, player.y) >= 12) this.miniPoints.push({ x: player.x, y: player.y });
            if (this.miniSkillTimer <= 0) {
                this.miniSkillState = 'bell_echo_warn'; this.miniSkillTimer = 0.8; this.miniSkillMax = 0.8;
            }
            return;
        }
        if (this.miniSkillState === 'bell_echo_warn') {
            this.miniSkillTimer -= dt;
            if (this.miniSkillTimer <= 0) {
                this.miniSkillState = 'bell_echo_play'; this.miniSkillTimer = 1.2; this.miniSkillMax = 1.2; this.miniSkillHit = false;
            }
            return;
        }
        if (this.miniSkillState === 'bell_echo_play') {
            this.miniSkillTimer -= dt;
            const progress = 1 - Math.max(0, this.miniSkillTimer) / 1.2;
            const idx = Math.max(0, Math.min(this.miniPoints.length - 1, Math.floor((1 - progress) * this.miniPoints.length)));
            const pt = this.miniPoints[idx];
            if (pt && !this.miniSkillHit && Vec.dist(pt.x, pt.y, player.x, player.y) <= 28 + (player.radius ?? 16)) {
                this.miniSkillHit = true;
                player.takeDamage(24, game, { ignoreIframe: game?.state === 'testRoom' });
                game.particles?.impact?.(player.x, player.y, 0, 0.9, '#bd73ff');
            }
            if (this.miniSkillTimer <= 0) { this.miniSkillState = ''; this.miniPoints = []; }
            return;
        }
        if (this.miniSkillState === 'bell_silence') {
            this.miniSkillTimer -= dt;
            this.buffSpeedMult = 0.65;
            if (Vec.dist(this.x, this.y, player.x, player.y) <= 165 + (player.radius ?? 16)) {
                // PlayerController本帧已恢复的Q/E冷却量补回；普攻与已释放技能完全不受影响。
                if (typeof player._qCd === 'number' && player._qCd > 0) player._qCd += dt * (1 + (player.stats?.cdReduction ?? 0));
                if (typeof player._eCd === 'number' && player._eCd > 0) player._eCd += dt * (1 + (player.stats?.cdReduction ?? 0));
            }
            if (this.miniSkillTimer <= 0) { this.miniSkillState = ''; this.buffSpeedMult = 1; }
            return;
        }
        if (this._miniTimer > 0 || this.attackWindup > 0) return;

        const phase = this._miniSkillCount % 3;
        if (phase === 0) {
            this.miniSkillState = 'bell_rings'; this.miniSkillTimer = 2.3; this.miniSkillMax = 2.3;
            this.miniSkillPhase = 0; this.miniSkillHits = 0; this.miniSkillHit = false; this._miniTimer = 6;
            game.floatingText?.spawn?.(this.x, this.y - 58, '六拍丧钟', '#fff0a6', 16, true);
        } else if (phase === 1) {
            this.miniSkillState = 'bell_record'; this.miniSkillTimer = 2.5; this.miniSkillMax = 2.5;
            this.miniPoints = [{ x: player.x, y: player.y }]; this._miniTimer = 9;
            game.floatingText?.spawn?.(this.x, this.y - 58, '迟到的回声', '#bd73ff', 16, true);
        } else {
            this.miniSkillState = 'bell_silence'; this.miniSkillTimer = 4; this.miniSkillMax = 4; this._miniTimer = 12;
            game.floatingText?.spawn?.(this.x, this.y - 58, '静默钟罩', '#f5e6a8', 16, true);
        }
        this._miniSkillCount++;
        game.particles?.hexActivate?.(this.x, this.y, phase === 1 ? '#bd73ff' : '#fff0a6');
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
                life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true, enemyFx: 'water_bomb',
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
                    life: 3, lifeTime: 3, owner: 'enemy', isEnemyBullet: true, enemyFx: 'water_spike',
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
                pierceShield: true, enemyFx: 'shrimp_spike',
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
                dot: { dps: 3, dur: 5, color: '#cc66ff' }, enemyFx: 'venom_sting',
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
                pierceShield: true, enemyFx: 'sonic',
            });
        }
        // 技能2 高能光束：锁定弹，命中挂 3 秒 DoT（每秒 4 伤害）
        if (this._miniCd2 <= 0) {
            this._miniCd2 = 6;
            const a = Math.atan2(player.y - this.y, player.x - this.x);
            game.enemyBullets?.push({
                x: this.x, y: this.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
                damage: 1, radius: 7, color: '#ff5555',
                life: 4, lifeTime: 4, owner: 'enemy', isEnemyBullet: true, homing: true, enemyFx: 'beam',
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

    /**
     * 渲染朝向与位移方向分开：普通近战锁定英雄，远程后撤时也继续正对英雄；
     * 攻击前摇则朝锁定点，避免目标横移时身体和危险指示线各指一边。
     */
    getVisualFacing(player: any, movementX = 1, movementY = 0): [number, number] {
        if (this.type === 'gold_scavenger') return [this.combatFacingX, this.combatFacingY];
        let tx: number | undefined;
        let ty: number | undefined;
        if (this.attackWindup > 0) {
            tx = this.attackTargetX;
            ty = this.attackTargetY;
        } else if (player?.alive !== false && player) {
            tx = player.x;
            ty = player.y;
        }
        if (tx === undefined || ty === undefined) return [movementX, movementY];
        const [dx, dy] = Vec.normalize(tx - this.x, ty - this.y);
        return Math.abs(dx) + Math.abs(dy) > 0.0001 ? [dx, dy] : [movementX, movementY];
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
