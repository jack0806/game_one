import {
    _decorator, Component, Node, Graphics, Color, Vec2, Vec3,
    UITransform, director, game, Label, Sprite, view, sys
} from 'cc';
import { CANVAS_W, CANVAS_H, PLAYFIELD_BOTTOM, DT_MAX } from './Constants';
import { visibleDesignWidth, applyScreenPolicy } from './ScreenFit';
import { Vec, Rng, clamp } from './MathUtils';
import { worldToLocal, entityVisualPose, entityHealthBar, animationFrameTopOffset } from './EntityVisual';
import { applyArtSprite, applyAnimationFrame, preloadArt, SpriteNodePool } from './SpriteUtils';
import { ActorAnimation } from './ActorAnimation';
import { ActorCorpses } from './ActorCorpses';
import { ACTOR_ANIMATIONS } from '../data/ActorAnimationDB';
import { EFFECT_ANIMATIONS } from '../data/EffectAnimationDB';
import { animationAlphaTop } from '../data/AnimationBoundsDB';
import { styleLabel } from './LabelUtils';
import { CharDef, CHARS } from '../data/CharacterDB';
import { spawnExplosion as spawnExplosionHelper } from '../data/AugmentDB';
import { CHAPTERS, MUTATIONS } from '../data/WaveData';
import { UNIT_CATALOG } from '../data/BossDB';
import { PlayerController } from '../entities/PlayerController';
import { EnemyBase }         from '../entities/EnemyBase';
import { BossController }    from '../entities/BossController';
import { BulletPool }        from '../entities/BulletController';
import { AugmentManager }    from '../systems/AugmentManager';
import { WaveManager }       from '../systems/WaveManager';
import { Economy, ShopItem } from '../systems/Economy';
import { SaveSystem }        from '../systems/SaveSystem';
import { ScreenShake, HitStop, FloatingText } from '../systems/EffectSystem';
import { InputManager }      from '../systems/InputManager';
import { ParticleManager, spriteFxFrame } from '../systems/ParticleManager';
import { AudioManager, BgmCue } from '../systems/AudioManager';
import { HUD, HudData }      from '../ui/HUD';
import { AugSelectUI }       from '../ui/AugSelectUI';
import { ShopUI }            from '../ui/ShopUI';
import { ScreenManager }     from '../ui/ScreenManager';
import { TouchControls }     from '../ui/TouchControls';
import { StatsPanel, StatsPanelData } from '../ui/StatsPanel';
import { TestRoomUI } from '../ui/TestRoomUI';
import { advanceLocomotion, LocomotionPose } from './Locomotion';
import {
    createDirectionalFacingState, directionalArtKey, directionalArtKeys,
    DirectionalFacingPose, updateDirectionalFacing,
} from './DirectionalFacing';

const { ccclass, property } = _decorator;

/** 敌方弹体的正式材质层；判定拖尾仍由 Graphics 画在下方。 */
const ENEMY_PROJECTILE_ART: Record<string, { key: string; aspect: number; scale: number; spin?: number }> = {
    needle:       { key: 'fx_enemy_needle', aspect: 0.42, scale: 5.5 },
    shrimp_spike: { key: 'fx_enemy_needle', aspect: 0.42, scale: 5.8 },
    frost:        { key: 'fx_enemy_frost', aspect: 0.52, scale: 5.2 },
    water_spike:  { key: 'fx_enemy_frost', aspect: 0.52, scale: 5.8 },
    poison:       { key: 'fx_enemy_toxic', aspect: 1, scale: 3.6, spin: 42 },
    toxin_dart:   { key: 'fx_enemy_toxic', aspect: 0.64, scale: 4.8 },
    venom_sting:  { key: 'fx_enemy_toxic', aspect: 0.64, scale: 5.2 },
    water_bomb:   { key: 'fx_enemy_water_bomb', aspect: 1, scale: 3.8, spin: 30 },
    gear:         { key: 'fx_enemy_saw', aspect: 1, scale: 4.1, spin: 260 },
    rail:         { key: 'fx_enemy_rail', aspect: 0.34, scale: 7.2 },
    blade:        { key: 'fx_enemy_void_blade', aspect: 0.46, scale: 6.3 },
    chaos:        { key: 'fx_enemy_void_blade', aspect: 0.46, scale: 5.6, spin: 100 },
    sonic:        { key: 'fx_enemy_bell_wave', aspect: 1, scale: 3.9, spin: 55 },
    arc:          { key: 'fx_enemy_arc', aspect: 1, scale: 4.0, spin: 120 },
    homing:       { key: 'fx_enemy_arc', aspect: 1, scale: 4.0, spin: 95 },
    beam:         { key: 'fx_enemy_arc', aspect: 0.58, scale: 5.6 },
};

/** 测试房间水体系召唤单位共享上限：水柱 + 水分身 + 深海鱿鱼 合计最多 12。 */
const MAX_TEST_WATER_UNITS = 12;
/** 测试房间水柱上限：固定 8 个方位点，每点最多 1 根水柱（常驻不消失）。 */
const MAX_TEST_PILLARS = 8;
/** 水柱固定方位点（上/下/左/右 + 两对角线边缘）：所有水柱只在这 8 个位置生成。 */
const PILLAR_SPOTS: [number, number][] = [
    [CANVAS_W / 2, 90], [CANVAS_W / 2, PLAYFIELD_BOTTOM - 60],
    [70, PLAYFIELD_BOTTOM / 2], [CANVAS_W - 70, PLAYFIELD_BOTTOM / 2],
    [150, 120], [CANVAS_W - 150, 120],
    [150, PLAYFIELD_BOTTOM - 100], [CANVAS_W - 150, PLAYFIELD_BOTTOM - 100],
];
/** 测试房单位验收点：围绕玩家近距离排布，便于低帧率内置浏览器完整验收攻击循环。 */
const TEST_UNIT_SPAWN_SPOTS: [number, number][] = [
    [CANVAS_W / 2 - 120, 360], [CANVAS_W / 2 + 120, 360],
    [CANVAS_W / 2 - 80, 260], [CANVAS_W / 2 + 80, 260],
    [CANVAS_W / 2 - 80, 460], [CANVAS_W / 2 + 80, 460],
];

export type GameState =
    | 'menu' | 'charSelect' | 'playing'
    | 'augSelect' | 'shop' | 'gameover'
    | 'chapterClear' | 'paused' | 'stats'
    | 'testRoom';

/**
 * GameManager — singleton @ccclass component attached to a root Node.
 *
 * Owns all systems, drives the state machine, and runs the render loop.
 * All other scripts reference it via GameManager.inst.
 */
@ccclass('GameManager')
export class GameManager extends Component {

    /** Global singleton accessor. */
    static inst: GameManager;
    // ── layer nodes ───────────────────────────────────────────
    private _bgLayer!:       Node;
    private _bgSprite!:      Sprite;      // chapter background (bg_chapter<N>), behind _gameLayer
    private _bgToneGfx!:     Graphics;    // per-chapter desaturation/dimming overlay
    private _gameLayer!:     Node;
    private _particleLayer!: Node;
    private _uiLayer!:       Node;
    private _gameGfx!:       Graphics;   // entities draw here
    private _particleGfx!:   Graphics;   // particles draw here
    private _coinPool!:      SpriteNodePool;
    private _turretBasePool!:   SpriteNodePool;
    private _turretBarrelPool!: SpriteNodePool;
    private _summonArtPool!:     SpriteNodePool;
    /** One-shot art FX (explosion/heal/poison/cold_arrow/hex_ring), synced from ParticleManager.spriteFx each frame. */
    private _fxPool!:        SpriteNodePool;
    /** 持续敌方弹体/区域机制材质层；容量按后期弹幕密度预分配。 */
    private _enemyArtPool!:  SpriteNodePool;

    // ── systems ───────────────────────────────────────────────
    private _input!:      InputManager;
    private _player!:     PlayerController;
    private _enemies:     EnemyBase[]    = [];
    private _bullets!:    BulletPool;
    private _augMgr!:     AugmentManager;
    private _waveMgr!:    WaveManager;
    private _economy!:    Economy;
    private _shake!:      ScreenShake;
    private _hitStop!:    HitStop;
    private _floatText!:  FloatingText;
    private _particles!:  ParticleManager;
    private _audio!:      AudioManager;

    // ── ui ────────────────────────────────────────────────────
    private _hud!:        HUD;
    private _augUI!:      AugSelectUI;
    private _shopUI!:     ShopUI;
    private _statsUI!:    StatsPanel;
    private _screenMgr!:  ScreenManager;
    private _touchUI!:    TouchControls;
    private _testUI!:     TestRoomUI;

    // ── game state ────────────────────────────────────────────
    state:             GameState = 'menu';
    private _char?:    CharDef;
    private _wave      = 0;
    private _chapter   = 0;
    private _mutations: string[] = [];
    private _runId = 0;
    private _visualTime = 0;
    /** 视觉帧 dt（方向动画/步态驱动用，与逻辑帧 dt 同步）。 */
    private _visualDt = 0;
    private _playerDeathPending = false;
    private _corpses = new ActorCorpses<EnemyBase>(actor => actor.node?.destroy());

    // ── test room state ───────────────────────────────────────
    /** 暂停前所在的战斗状态，恢复时回到原状态（测试房间不再误回 playing）。 */
    private _pauseReturn: 'playing' | 'testRoom' = 'playing';
    /** 测试房间无敌开关状态（切换英雄时保留）。 */
    private _testInvincible = false;
    private _testTargetPaused = false;
    private _testVisualGuides = false;
    /** 观摩模式只停用玩家普攻；移动与Q/E/R保持可用，便于完整看完Boss技能轮转。 */
    testCeasefire = false;
    /**
     * 测试房间水柱（深海恐惧「海之霸主」）：固定 8 个方位点、每点 1 根、常驻不消失，
     * 与水分身/深海鱿鱼共享 MAX_TEST_WATER_UNITS 上限。状态机：idle 待机 → flash 闪烁 2s →
     * shoot 依次朝主角逐发水刺（6 发）→ 回 idle；pair 为对立水柱引用。
     */
    private _pillars: { x: number; y: number; r: number; spot: number; state: 'idle' | 'flash' | 'shoot'; flashT: number; shootLeft: number; shootCd: number; pair: any; hitCd: number }[] = [];
    /** 海之霸主对射完成计数（对立两根各射完一次后关闭护盾模式）。 */
    private _abyssStormShots = 0;
    /** 测试房间冰冻预告区（深海恐惧）：3s 闪烁后玩家在区内则冰冻 1.5s。 */
    private _telegraphZones: { x: number; y: number; r: number; timer: number }[] = [];

    // ── extra runtime state (turrets / zones / enemy bullets / stats) ──
    private _turrets:      any[] = [];
    private _deathZones:   { x: number; y: number; r: number; timer: number; dps: number }[] = [];
    private _iceZones:     { x: number; y: number; r: number; timer: number }[] = [];
    /** 敌方酸囊：0.7秒抛物预告 → 3秒毒斑；与玩家技能地面区分开维护。 */
    private _enemyHazards: { kind: 'acid' | 'ember' | 'trap' | 'priest_fire'; fromX: number; fromY: number; x: number; y: number; r: number; phase: 'telegraph' | 'pool'; timer: number; telegraphMax: number; tickCd: number }[] = [];
    /** 三相祭司晶墙、可破坏导体与磁轨屠夫回转锯都使用独立判定对象，避免只画假特效。 */
    private _priestWalls: { x: number; y: number; vx: number; vy: number; r: number; halfH: number; warn: number; distance: number; hit: boolean }[] = [];
    private _triuneNetworks: any[] = [];
    private _railSaws: { cx: number; cy: number; phase: number; dir: number; timer: number; warn: number; x: number; y: number; hitCd: number }[] = [];
    /** 三只《怪物设计与数值》大Boss的主机制与可破坏目标（测试房先行）。 */
    private _docBossMechanics: any[] = [];
    private _docBossTargets: any[] = [];
    private _docPlayerTrail: { x: number; y: number; age: number }[] = [];
    private _docTrailSampleCd = 0;

    /** Written by EnemyBase._die() / read by combo-related augments & HUD. */
    score       = 0;
    kills       = 0;
    comboCount  = 0;
    comboTimer  = 0;
    /** 本局统计（EnemyBase._die 累加），局末写入玩家档案。 */
    bossKills   = 0;
    maxCombo    = 0;
    private _runRecorded = false;

    /** Written by WaveData mutation defs' apply(game) hooks (endless mode). */
    _mutationMods: Record<string, any> = {};

    // ── lifecycle ─────────────────────────────────────────────

    onLoad() {
        GameManager.inst = this;
        // 全面屏横屏铺满：宽于16:9的屏用FIXED_HEIGHT横向延展（无左右黑边），
        // 更方的屏回退SHOW_ALL保高留边，不能裁掉HUD/技能区。
        applyScreenPolicy();
        this._initLayers();
        this._initSystems();
        this._initUI();
        this._initFloatTextPool();
        // Cocos 的 Web 构建会把 `[...set]` 降级成 `[].concat(set)`，导致 Set
        // 本身被当成单个资源 key。显式使用 Array.from 保证构建产物仍是字符串数组。
        preloadArt(Array.from(new Set(Object.keys(EFFECT_ANIMATIONS).map(key => EFFECT_ANIMATIONS[key].sheet))));
        this._setState('menu');

    }

    update(rawDt: number) {
        const dt = Math.min(rawDt, DT_MAX);
        this._visualTime += dt;
        this._visualDt = dt;
        this._audio.update(dt);

        // Hit-stop pauses combat simulation, but movement/input must stay responsive.
        if (this._hitStop.active) {
            this._hitStop.update(rawDt);
            if (this._inCombat() && this._player?.alive) {
                this._player.tickMovement(dt, this._input);
                if (this._input.justPressed('Escape')) this._pauseCombat();
                if (this._input.isKeyMPressed()) this._openStats();
            }
            this._renderFrame();
            return;
        }

        if (this._inCombat()) {
            this._updatePlaying(dt);
        } else if (this.state === 'stats') {
            // 再按一次 M（或 Esc）从详情面板返回战斗；Esc 直接回战斗而不是
            // 进暂停菜单，避免"面板→菜单"两层套娃。测试房间打开的详情面板同样回到测试房间。
            if (this._input.isKeyMPressed() || this._input.justPressed('Escape')) {
                this._setState(this._pauseReturn);
            }
        }

        this._renderFrame();
    }

    // ── init helpers ──────────────────────────────────────────

    private _initLayers() {
        // 全面屏可见宽度可能>1280：容器层按可见宽铺满，游戏世界仍以1280居中
        const visW = visibleDesignWidth();
        // BgLayer — chapter background image (bg_chapter<N>), sits behind everything.
        // Created first so its sibling index is lowest (drawn first / at the back).
        this._bgLayer = new Node('BgLayer');
        this._bgLayer.setParent(this.node);
        this._bgLayer.addComponent(UITransform).setContentSize(visW, CANVAS_H);
        this._bgSprite = this._bgLayer.addComponent(Sprite);
        // 四章背景资源均为 16:9。固定 CUSTOM 尺寸可确保异步挂载 SpriteFrame 后
        // 仍严格填满 1280×720，不被 TRIMMED 模式恢复成 2560×1440 后过度裁切。
        this._bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this._bgSprite.trim = false;

        // 中性色罩放在背景图之上、所有战斗实体之下。按章节调整强度，压低
        // 高饱和裂纹/网格/电路的视觉竞争，同时保留边缘环境主题。
        const bgTone = new Node('BgTone');
        bgTone.setParent(this._bgLayer);
        bgTone.addComponent(UITransform).setContentSize(visW, CANVAS_H);
        this._bgToneGfx = bgTone.addComponent(Graphics);

        // GameLayer — entity graphics
        this._gameLayer = new Node('GameLayer');
        this._gameLayer.setParent(this.node);
        this._gameGfx = this._gameLayer.addComponent(Graphics);
        this._gameLayer.addComponent(UITransform)
            .setContentSize(CANVAS_W, CANVAS_H);
        this._coinPool = new SpriteNodePool(this._gameLayer, 80, 'GoldCoin', [30, 30]);
        this._turretBasePool = new SpriteNodePool(this._gameLayer, 24, 'TurretBase', [52, 52]);
        this._turretBarrelPool = new SpriteNodePool(this._gameLayer, 24, 'TurretBarrel', [72, 48]);
        this._summonArtPool = new SpriteNodePool(this._gameLayer, 16, 'SummonArt', [82, 82]);

        // ParticleLayer — on top of entities
        this._particleLayer = new Node('ParticleLayer');
        this._particleLayer.setParent(this.node);
        this._particleGfx = this._particleLayer.addComponent(Graphics);
        this._particleLayer.addComponent(UITransform)
            .setContentSize(CANVAS_W, CANVAS_H);

        // One-shot art FX pool — parented under ParticleLayer so FX draw above
        // entities/HP bars but its own nodes are toggled active/inactive rather
        // than reallocated per explosion/heal/poison/etc.
        this._fxPool = new SpriteNodePool(this._particleLayer, 24, 'Fx', [64, 64]);
        this._enemyArtPool = new SpriteNodePool(this._particleLayer, 220, 'EnemyArt', [48, 48]);

        // UILayer — HUD and panels
        this._uiLayer = new Node('UILayer');
        this._uiLayer.setParent(this.node);
        this._uiLayer.addComponent(UITransform)
            .setContentSize(CANVAS_W, CANVAS_H);
    }

    private _initSystems() {
        this._input     = this.node.addComponent(InputManager);
        this._shake     = new ScreenShake();
        this._hitStop   = new HitStop();
        this._floatText = new FloatingText();
        this._particles = new ParticleManager();
        this._audio     = new AudioManager(this.node);
        this._economy   = new Economy();
        // _gameLayer already exists here — _initLayers() runs before _initSystems() in onLoad() —
        // so pooled bullets can get their permanent Sprite nodes parented immediately.
        this._bullets   = new BulletPool(256, this._gameLayer);
        this._augMgr    = new AugmentManager();
        this._waveMgr   = new WaveManager();

        // Wire WaveManager callbacks
        // x/y 为该批次共享的边缘出生锚点（成批刷怪），缺省时回退随机边缘
        this._waveMgr.onSpawnEnemy  = (type, x, y)  => this.spawnEnemy(type, x, y);
        this._waveMgr.onWaveCleared = ()       => this._onWaveCleared();
    }

    private _initUI() {
        const ul = this._uiLayer;

        const hudNode = new Node('HUD'); hudNode.setParent(ul);
        this._hud = hudNode.addComponent(HUD);

        const augNode = new Node('AugSelect'); augNode.setParent(ul);
        this._augUI = augNode.addComponent(AugSelectUI);

        const shopNode = new Node('Shop'); shopNode.setParent(ul);
        this._shopUI = shopNode.addComponent(ShopUI);

        const statsNode = new Node('Stats'); statsNode.setParent(ul);
        this._statsUI = statsNode.addComponent(StatsPanel);

        const smNode = new Node('ScreenMgr'); smNode.setParent(ul);
        this._screenMgr = smNode.addComponent(ScreenManager);

        const testNode = new Node('TestRoom'); testNode.setParent(ul);
        this._testUI = testNode.addComponent(TestRoomUI);

        // 移动端虚拟操控：摇杆/技能按钮写入 InputManager，右上角按钮回调这里。
        // 触屏设备上 HUD 右下技能环与技能按钮重叠，改由触摸按钮展示冷却。
        const touchNode = new Node('TouchControls'); touchNode.setParent(ul);
        this._touchUI = touchNode.addComponent(TouchControls);
        this._touchUI.setInput(this._input);
        this._touchUI.setPlayerGetter(() => this._player);
        // 属性面板打开期间点暂停同样只是返回战斗，避免 _pauseReturn 被改写成
        // playing（测试房间开面板时误回 playing 会错误启动波次调度）
        this._touchUI.onPausePressed = () => {
            if (this.state === 'stats') { this._setState(this._pauseReturn); return; }
            this._pauseCombat();
        };
        // 属性按钮做成开关：面板开着时再点直接回到战斗（触屏端没有 M/Esc）
        this._touchUI.onStatsPressed = () => {
            if (this.state === 'stats') this._setState(this._pauseReturn);
            else this._openStats();
        };
        this._touchUI.onButtonSfx = () => this._audio.playSfx('button');
        this._hud.setSkillRingsVisible(!sys.hasFeature(sys.Feature.INPUT_TOUCH));
        // 全屏/旋转/窗口尺寸变化后：TouchControls 重设适配策略并重排边缘控件，
        // 这里跟着把战斗背景与调色层铺满新的可见宽度
        this._touchUI.onViewResized = () => this._fitBackgroundToVisible();

        // Wire screen callbacks
        this._screenMgr.onPlayPressed     = () => this._setState('charSelect');
        this._screenMgr.onTestRoomPressed = () => this._startTestRoom();
        this._screenMgr.onCharSelected    = (c) => this._startGame(c);
        this._screenMgr.onRestartPressed  = () => this._restartGame();
        this._screenMgr.onMainMenuPressed = () => {
            this._clearRunEntities();
            this._setState('menu');
        };
        this._screenMgr.onContinuePressed = () => this._continueAfterChapter();
        this._screenMgr.onResumePressed   = () => this._setState(this._pauseReturn);
        this._screenMgr.onButtonSfx       = () => {
            this._audio.resume();
            this._audio.playSfx('button');
        };
        this._augUI.onButtonSfx  = () => this._audio.playSfx('button');
        this._augUI.onPickSfx    = () => this._audio.playSfx('augment_pick');
        this._shopUI.onButtonSfx = () => this._audio.playSfx('button');
        this._shopUI.onBuySfx    = () => this._audio.playSfx('buy');
        this._testUI.onButtonSfx      = () => this._audio.playSfx('button');
        this._testUI.onSpawnUnit      = (id, count) => this.spawnTestUnit(id, count);
        this._testUI.onToggleVisualGuides = on => { this._testVisualGuides = on; };
        this._testUI.onClear          = () => this.clearTestField();
        this._testUI.onToggleInvincible = (on) => this.setPlayerInvincible(on);
        this._testUI.onToggleCeasefire  = (on) => this.setTestCeasefire(on);
        this._testUI.onSelectHero     = (id) => this.selectTestHero(id);
        this._testUI.onGetHero        = () => this._char?.id ?? CHARS[0]!.id;
        this._testUI.onAdvanceBossPhase = () => this.advanceTestBossPhase();
        this._testUI.onCycleChapter   = () => this.cycleTestChapter();
        this._testUI.onToggleTargetPause = (on) => this.setTestTargetPaused(on);
        this._testUI.onReturnMenu     = () => {
            this._clearRunEntities();
            this._setState('menu');
        };
    }

    // ── state machine ─────────────────────────────────────────

    /** playing 与 testRoom 都是"战斗模拟中"状态：渲染、HUD、主循环共用此判定。 */
    private _inCombat(): boolean {
        return this.state === 'playing' || this.state === 'testRoom';
    }

    private _setState(s: GameState) {
        this.state = s;
        this._screenMgr.hideAll();
        this._hud.node.active      = (s === 'playing' || s === 'testRoom');
        this._hud.setTestRoomMode(s === 'testRoom');
        // 虚拟操控在战斗与属性面板期间常驻：属性面板打开时触屏端靠右上按钮返回
        this._touchUI.node.active  = (s === 'playing' || s === 'testRoom' || s === 'stats');
        this._touchUI.setTestRoomMode(s === 'testRoom');
        this._augUI.node.active    = false;
        this._shopUI.node.active   = false;
        this._statsUI.node.active  = false;
        this._testUI.node.active   = false;

        // 属性页是高密度阅读界面；切换英雄/伤害等上一帧浮字若继续留在 UI 层，
        // 会穿过不透明面板标题与技能说明。这里只清浮字，不销毁持续战斗特效。
        if (s === 'stats') {
            this._floatText?.clear();
            for (const label of this._floatLabels) label.active = false;
        }

        // 章节结束/结算页必须清空上一帧战斗残影。此前浮字、金币池和粒子只在
        // playing 中刷新，Boss 的 PHASE 提示会永久叠在章节通关标题上。
        if (s === 'chapterClear' || s === 'gameover' || s === 'menu' || s === 'charSelect') {
            this._floatText?.clear();
            for (const label of this._floatLabels) label.active = false;
            for (const enemy of this._enemies) {
                if (enemy.node?.isValid) enemy.node.active = false;
            }
            this._particles?.clear();
            this._fxPool?.releaseAll();
            this._coinPool?.releaseAll();
            this._bullets?.reset();
        }

        switch (s) {
            case 'menu':
                this._screenMgr.show('menu');
                this._audio.playBgm('title');
                break;
            case 'charSelect':
                this._screenMgr.show('charSelect');
                this._audio.playBgm('title');
                break;
            case 'gameover':
                this._screenMgr.show('gameover');
                this._audio.playBgm('title');
                break;
            case 'chapterClear': this._screenMgr.show('chapterClear'); break;
            case 'paused':       this._screenMgr.show('pause');        break;
            case 'playing':
                this._audio.playBgm(this._boss ? 'boss' : this._chapterBgm());
                break;
            // 测试房间先播章节 BGM，Boss 生成后由 spawnEnemy 切到 boss BGM；
            // 从暂停恢复时 Boss 仍在场则继续播 boss BGM。
            // 工具条随 testRoom 状态常驻：_setState 顶部会统一隐藏所有面板，
            // 暂停/详情面板返回时若不在这里重新点亮，按钮会永久消失。
            case 'testRoom':
                this._audio.playBgm(this._boss ? 'boss' : this._chapterBgm());
                this._testUI.node.active = true;
                break;
            // 'shop' / 'augSelect' 面板不归 ScreenManager 管理，由调用方
            // 各自 show() 自己的 UI；这里只需确保上一个面板已被 hideAll() 清掉。
            // 'stats' 同理：StatsPanel 由 _openStats() 激活并填充数据。
            case 'shop':         this._audio.playBgm('shop');          break;
            case 'augSelect':    break;
            case 'stats':        break;
        }
    }

    /** 战斗内 Esc：进入暂停面板并记录返回状态（测试房间回测试房间，不回 playing）。 */
    private _pauseCombat() {
        this._pauseReturn = this.state === 'testRoom' ? 'testRoom' : 'playing';
        this._setState('paused');
    }

    private _chapterBgm(): BgmCue {
        return (`ch${Math.min(4, Math.max(1, this._chapter + 1))}`) as BgmCue;
    }

    private _startGame(char: CharDef) {
        this._clearRunEntities();
        this._runId++;
        this._char    = char;
        this._wave    = 0;
        this._chapter = 0;
        this._mutations = [];
        this._enemies   = [];
        this._turrets    = [];
        this._deathZones = [];
        this._enemyHazards = []; this._priestWalls = []; this._triuneNetworks = []; this._railSaws = [];
        this._docBossMechanics = []; this._docBossTargets = []; this._docPlayerTrail = [];
        this._iceZones   = [];
        this.score = 0; this.kills = 0; this.comboCount = 0; this.comboTimer = 0;
        this.bossKills = 0; this.maxCombo = 0; this._runRecorded = false;
        this._mutationMods = {};
        this._economy.reset();
        this._augMgr.reset();
        this._waveMgr.reset();
        this._bullets.reset();
        this._particles.clear();
        this._updateBgForChapter();

        // Create player
        const pNode = new Node('Player');
        pNode.setParent(this._gameLayer);
        this._player = pNode.addComponent(PlayerController);
        this._player.init(char.id, this);
        this._setState('playing');
        // Sync WaveManager state before it increments internally
        this._waveMgr.wave    = this._wave;
        this._waveMgr.chapter = this._chapter + 1;   // WaveManager is 1-based
        this._waveMgr.startWave(this);
    }

    /** Load & apply CHAPTERS[this._chapter].bgKey onto _bgSprite (art already resolved through ArtRemap). */
    private _updateBgForChapter() {
        const bgKey = CHAPTERS[this._chapter]?.bgKey;
        if (!bgKey) return;
        applyArtSprite(this._bgSprite, bgKey);
        this._fitBackgroundToVisible();
    }

    /** 背景/调色层按当前可见宽度铺满（全面屏横屏>1280时横向拉伸，无左右黑边）。 */
    private _fitBackgroundToVisible() {
        const visW = visibleDesignWidth();
        this._bgLayer.getComponent(UITransform)!.setContentSize(visW, CANVAS_H);
        this._bgToneGfx.node.getComponent(UITransform)!.setContentSize(visW, CANVAS_H);
        this._applyBackgroundTone(this._chapter);
    }

    /** 四章独立背景调色：越靠后原图荧光越强，覆盖强度相应提高。 */
    private _applyBackgroundTone(chapterIndex: number) {
        const visW = visibleDesignWidth();
        const tones = [
            { tint: new Color(205, 198, 190, 255), overlay: new Color(22, 24, 28, 62), center: 18 },
            { tint: new Color(193, 198, 202, 255), overlay: new Color(20, 24, 30, 82), center: 26 },
            { tint: new Color(184, 194, 198, 255), overlay: new Color(18, 24, 32, 94), center: 32 },
            { tint: new Color(198, 184, 202, 255), overlay: new Color(22, 16, 30, 102), center: 36 },
        ];
        const tone = tones[Math.min(Math.max(0, chapterIndex), tones.length - 1)];
        this._bgSprite.color = tone.tint;
        const g = this._bgToneGfx;
        g.clear();
        g.fillColor = tone.overlay;
        g.fillRect(-visW / 2, -CANVAS_H / 2, visW, CANVAS_H);
        // 中央是主要走位/弹幕区。用三层低透明度矩形逐级收拢，代替单块
        // 硬边遮罩：中心总压暗量不变，边缘主题装饰到战斗区之间过渡更自然。
        const bands = [
            { sx: 0.94, sy: 0.92, alpha: Math.round(tone.center * 0.24) },
            { sx: 0.86, sy: 0.84, alpha: Math.round(tone.center * 0.33) },
            { sx: 0.76, sy: 0.74, alpha: Math.round(tone.center * 0.43) },
        ];
        for (const band of bands) {
            g.fillColor = new Color(12, 18, 28, band.alpha);
            g.fillRect(
                -visW * band.sx / 2, -CANVAS_H * band.sy / 2,
                visW * band.sx, CANVAS_H * band.sy,
            );
        }
    }

    private _restartGame() {
        this._startGame(this._char ?? CHARS[0]!);
    }

    // ── test room ─────────────────────────────────────────────

    /**
     * 测试房间直接进图：空场地 + 玩家 + 底部工具条（沙盒，不写档案、
     * 不跑波次调度）。单位由工具条按 id 生成，见 UNIT_CATALOG。
     */
    private _startTestRoom() {
        this._clearRunEntities();
        this._runId++;
        this._char    = this._char ?? CHARS[0];
        this._wave    = 0;
        this._chapter = 0;
        this._mutations = [];
        this._enemies   = [];
        this._turrets    = [];
        this._deathZones = [];
        this._enemyHazards = []; this._priestWalls = []; this._triuneNetworks = []; this._railSaws = [];
        this._docBossMechanics = []; this._docBossTargets = []; this._docPlayerTrail = [];
        this._iceZones   = [];
        this._pillars = [];
        this._telegraphZones = [];
        this.score = 0; this.kills = 0; this.comboCount = 0; this.comboTimer = 0;
        this.bossKills = 0; this.maxCombo = 0; this._runRecorded = false;
        // 清空无尽变异乘区：测试房间要求单位数值精确等于表内数值
        this._mutationMods = {};
        this._economy.reset();
        this._augMgr.reset();
        this._waveMgr.reset();
        this._bullets.reset();
        this._particles.clear();
        this._updateBgForChapter();

        const pNode = new Node('Player');
        pNode.setParent(this._gameLayer);
        this._player = pNode.addComponent(PlayerController);
        this._player.init(this._char.id, this);
        this._player.resetCooldowns();

        this._setState('testRoom');
        // 复位工具条状态（无敌/数量/分类不跨房保留）；工具条点亮由 _setState('testRoom') 统一负责
        this._testInvincible = false;
        this._testTargetPaused = false;
        this._testVisualGuides = false;
        this.testCeasefire = false;
        this._testUI.resetState();
        this._floatText.spawn(CANVAS_W / 2, 200, '测试房间：点底部工具条生成单位', '#9adcff', 18, true);
    }

    /** 测试房间选择英雄：即使重复选择同一人也重建，用于一键重置技能冷却与战斗状态。 */
    selectTestHero(charId: string): void {
        if (this.state !== 'testRoom') return;
        const def = CHARS.find(c => c.id === charId) ?? CHARS[0];
        if (!def) return;
        if (this._player?.node?.isValid) {
            this._player.node.active = false;
            this._player.node.destroy();
        }
        const pNode = new Node('Player');
        pNode.setParent(this._gameLayer);
        const p = pNode.addComponent(PlayerController);
        p.init(def.id, this);
        p.resetCooldowns();
        p.godMode = this._testInvincible;
        p.x = CANVAS_W / 2;
        p.y = CANVAS_H / 2;
        p.applyBuff('switch_iframe', 2, { invincible: true });
        this._player = p;
        this._char = def;
        // 场上召唤物/分身持有旧玩家引用，切换后一律清空
        this._turrets = [];
        this._particles.hexActivate(CANVAS_W / 2, CANVAS_H / 2, def.color);
        this._floatText.spawn(CANVAS_W / 2, 200, `已切换英雄：${def.name}`, '#9adcff', 20, true);
        this._audio.playSfx('augment_pick');
    }

    /** 测试房间生成单位：id 见 UNIT_CATALOG，count 为生成数量（1~50）。 */
    spawnTestUnit(id: string, count: number): void {
        const n = Math.max(1, Math.min(50, count));
        for (let i = 0; i < n; i++) {
            const [sx, sy] = TEST_UNIT_SPAWN_SPOTS[i % TEST_UNIT_SPAWN_SPOTS.length];
            if (id.startsWith('boss_') && id !== 'boss_ch1' && id !== 'boss_ch2' && id !== 'boss_ch3' && id !== 'boss_ch4') {
                this.spawnEnemy('boss', sx, sy, id.slice('boss_'.length));
            } else if (id.startsWith('boss_ch')) {
                const ch = Number(id.slice('boss_ch'.length)) - 1;
                this.spawnEnemy('boss', sx, sy, ch);
            } else if (id === 'squid') {
                // 深海鱿鱼与水柱/水分身共享 12 上限（工具条直出也不超发）
                if (this._testWaterCount() >= MAX_TEST_WATER_UNITS) break;
                this.spawnEnemy(id, sx, sy);
            } else {
                this.spawnEnemy(id, sx, sy);
            }
        }
        const entry = UNIT_CATALOG.find(u => u.id === id);
        this._floatText.spawn(CANVAS_W / 2, 200, `生成 ${entry?.label ?? id} ×${n}`, '#9adcff', 18, true);
        this._audio.playSfx('boss_roar', 0.4);
    }

    /** 测试房间清场：清敌人/弹幕/粒子/水柱/预告区/召唤物。 */
    clearTestField(): void {
        this._corpses.clear();
        for (const e of this._enemies) {
            if (e.node?.isValid) { e.node.active = false; e.node.destroy(); }
        }
        this._enemies = [];
        this._boss = undefined;
        this._pillars = [];
        this._telegraphZones = [];
        this._turrets = [];
        this._bullets?.reset();
        this._particles?.clear();
        this._economy?.clearDrops();
        this._enemyHazards = []; this._priestWalls = []; this._triuneNetworks = []; this._railSaws = [];
        this._docBossMechanics = []; this._docBossTargets = []; this._docPlayerTrail = [];
        this._floatText?.clear();
    }

    /** 测试房间无敌开关（工具条）。 */
    setPlayerInvincible(on: boolean): void {
        this._testInvincible = on;
        if (this._player) this._player.godMode = on;
    }

    /** 受击钩子（PlayerController.takeDamage 调用）：海之霸主期间深海恐惧每次受击生成 20% 血量护盾。 */
    onPlayerHit(p: PlayerController, _game: GameManager): void {
        if (this.state !== 'testRoom' || !this._boss || this._boss.dead) return;
        if (this._boss.bossKind !== 'abyss' || !this._boss.abyssShieldMode) return;
        const gain = Math.round(this._boss.maxHp * 0.2);
        this._boss.maxShieldHp = Math.max(this._boss.maxShieldHp, gain);
        this._boss.shieldHp = Math.min(this._boss.maxShieldHp, this._boss.shieldHp + gain);
        this._boss.shieldActive = true;
        this._particles.shieldBlock(this._boss.x, this._boss.y, false);
        this._floatText.spawn(this._boss.x, this._boss.y - 70, `护盾 +${gain}`, '#66ccff', 16, true);
    }

    // ── 深海恐惧技能场景系统（水柱 / 冰冻预告区 / 水分身 / 召唤） ──

    /** 水体系召唤单位计数：水柱 + 水分身 + 深海鱿鱼（共享上限 MAX_TEST_WATER_UNITS）。 */
    private _testWaterCount(): number {
        let n = this._pillars.length;
        for (const t of this._turrets) if (t.kind === 'waterClone' && t.alive) n++;
        for (const e of this._enemies) if (e.type === 'squid' && !e.dead) n++;
        return n;
    }

    /** 海之霸主：在固定方位补齐水柱（每点 1 根、常驻不消失，最多 8 根），并挑一对「相对方向」水柱互射形成交叉夹角。 */
    startPillarStorm(boss: BossController): void {
        if (this.state !== 'testRoom') return;
        let waterCount = this._testWaterCount();
        for (let s = 0; s < PILLAR_SPOTS.length && waterCount < MAX_TEST_WATER_UNITS; s++) {
            // 水柱位置固定：已有水柱的方位点跳过，第二次使用只补齐空缺点
            if (this._pillars.some(z => z.spot === s)) continue;
            const [x, y] = PILLAR_SPOTS[s];
            this._pillars.push({ x, y, r: 30, spot: s, state: 'idle', flashT: 0, shootLeft: 0, shootCd: 0, pair: null, hitCd: 0 });
            waterCount++;
        }
        // 相对方向的对立水柱对：上↔下 / 左↔右 / 两条对角线（射击在战场中央交叉成夹角）
        const OPPOSITE_PAIRS: [number, number][] = [[0, 1], [2, 3], [4, 7], [5, 6]];
        const available = OPPOSITE_PAIRS.filter(([a, b]) =>
            this._pillars.some(z => z.spot === a) && this._pillars.some(z => z.spot === b));
        if (available.length === 0) return; // 场上没有可配对的对立水柱
        const alivePair = Rng.pick(available);
        const a = this._pillars.find(z => z.spot === alivePair[0])!;
        const b = this._pillars.find(z => z.spot === alivePair[1])!;
        a.state = 'flash'; a.flashT = 2; a.pair = b;
        b.state = 'flash'; b.flashT = 2; b.pair = a;
        this._abyssStormShots = 0;
        boss.abyssShieldMode = true;
        this._audio.playSfx('freeze');
        this._floatText.spawn(CANVAS_W / 2, 160, '海之霸主！', '#33ccff', 26, true);
    }

    /** 水柱推进：常驻不消失；碰柱减速 20%；flash 2s 后进入 shoot，依次朝主角逐发水刺（6 发）。 */
    private _updatePillars(dt: number): void {
        if (this._pillars.length === 0) return;
        const p = this._player;
        for (const z of this._pillars) {
            // 玩家碰柱 → 减速 50%（2s 刷新冷却；射击中的水柱不判定）
            if (p && p.alive && z.hitCd <= 0 && z.state !== 'shoot' &&
                Vec.dist(z.x, z.y, p.x, p.y) < z.r + (p.radius ?? 16)) {
                z.hitCd = 1;
                p.applyBuff('pillar_slow', 2, { speed: 0.5 });
                this._particles.coldImpact(z.x, z.y);
            }
            z.hitCd = Math.max(0, z.hitCd - dt);

            if (z.state === 'flash') {
                // 闪烁 2s 后进入逐发射击
                z.flashT -= dt;
                if (z.flashT <= 0) {
                    z.state = 'shoot';
                    z.shootLeft = 6;
                    z.shootCd = 0;
                }
            } else if (z.state === 'shoot') {
                // 依次朝主角当前位置发射水刺（间隔 0.35s，伤害 = 玩家当前生命 5%）
                z.shootCd -= dt;
                if (z.shootCd <= 0) {
                    z.shootCd = 0.35;
                    z.shootLeft--;
                    const a = p ? Math.atan2(p.y - z.y, p.x - z.x) : 0;
                    const dmg = p && p.alive ? Math.max(1, p.hp * 0.05) : 1;
                    this._bullets.spawn({
                        x: z.x, y: z.y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320,
                        damage: dmg, radius: 9, color: '#66ddff',
                        owner: 'enemy', isEnemyBullet: true, lifeTime: 2.5,
                        explodeOnExpire: true, // 水刺最后会爆炸：命中即炸，未命中在终点范围爆炸
                    });
                    this._particles.explode(z.x, z.y, '#33ccff', 30);
                    this._audio.playSfx('freeze', 0.4);
                    // 6 发射完回 idle；对立两根都射完 → 关闭护盾模式
                    if (z.shootLeft <= 0) {
                        z.state = 'idle';
                        this._abyssStormShots++;
                        if (this._abyssStormShots >= 2 && this._boss?.bossKind === 'abyss') {
                            this._boss.abyssShieldMode = false;
                            this._abyssStormShots = 0;
                        }
                    }
                }
            }
        }
    }

    /** 在固定方位空缺处生成一道水柱（水分身冲锋失败 / 召唤鱿鱼无水柱时）；固定位置已满则不生成。 */
    spawnWaterPillar(): void {
        if (this.state !== 'testRoom' || this._testWaterCount() >= MAX_TEST_WATER_UNITS) return;
        if (this._pillars.length >= MAX_TEST_PILLARS) return;
        // 位置固定：找第一个空缺的方位点，不随机
        for (let s = 0; s < PILLAR_SPOTS.length; s++) {
            if (this._pillars.some(z => z.spot === s)) continue;
            const [x, y] = PILLAR_SPOTS[s];
            this._pillars.push({ x, y, r: 30, spot: s, state: 'idle', flashT: 0, shootLeft: 0, shootCd: 0, pair: null, hitCd: 0 });
            this._particles.coldImpact(x, y);
            return;
        }
    }

    /** 冰冻区域：释放 4 个互不重叠的预告区（拒绝采样保证间距），3s 闪烁后玩家在内则冰冻 1.5s。 */
    startTelegraphZones(boss: BossController): void {
        if (this.state !== 'testRoom') return;
        this._telegraphZones.length = 0;
        const zones = this._telegraphZones;
        const MIN_GAP = 200; // 区域半径90×2+余量，保证互不重叠
        for (let i = 0; i < 4; i++) {
            // 拒绝采样：最多尝试30次挑出与已有区域不重叠的位置；空间不足时宁可少放也不重叠
            let placed = false;
            for (let t = 0; t < 30; t++) {
                const x = Rng.float(120, CANVAS_W - 120);
                const y = Rng.float(110, PLAYFIELD_BOTTOM - 90);
                if (zones.every(z => Vec.dist(z.x, z.y, x, y) >= MIN_GAP)) {
                    zones.push({ x, y, r: 90, timer: 3 });
                    placed = true;
                    break;
                }
            }
            if (!placed) break;
        }
        this._floatText.spawn(CANVAS_W / 2, 160, '危险水域！', '#66ddff', 24, true);
        this._audio.playSfx('freeze', 0.6);
    }

    /** 冰冻预告区推进：到期时玩家在区内 → 冰冻 1.5s。 */
    private _updateTelegraphZones(dt: number): void {
        if (this._telegraphZones.length === 0) return;
        const p = this._player;
        for (let i = this._telegraphZones.length - 1; i >= 0; i--) {
            const z = this._telegraphZones[i];
            z.timer -= dt;
            if (z.timer <= 0) {
                this._telegraphZones.splice(i, 1);
                if (p && p.alive && !p.godMode &&
                    Vec.dist(z.x, z.y, p.x, p.y) < z.r + (p.radius ?? 16)) {
                    p.applyBuff('abyss_freeze', 1.5, { noMove: true });
                    this._particles.coldImpact(p.x, p.y);
                    this._audio.playSfx('freeze');
                    this._floatText.spawn(p.x, p.y - 50, '冰冻！', '#66ddff', 18, true);
                }
            }
        }
    }

    /** 测试房轮换四章场景，便于逐英雄检查技能在不同明暗与色相背景上的可读性。 */
    cycleTestChapter(): number {
        if (this.state !== 'testRoom') return this._chapter + 1;
        this._chapter = (this._chapter + 1) % CHAPTERS.length;
        this._updateBgForChapter();
        if (!this._boss) this._audio.playBgm(this._chapterBgm());
        const chapter = CHAPTERS[this._chapter];
        this._floatText.spawn(CANVAS_W / 2, 200, `第${chapter.id}章 · ${chapter.name}`, '#9adcff', 17, true);
        return chapter.id;
    }

    /** 静止靶模式只停掉测试房敌方AI，仍保留受击、碰撞、血条与玩家技能闭环。 */
    setTestTargetPaused(on: boolean): void {
        if (this.state !== 'testRoom') return;
        this._testTargetPaused = on;
        if (on) {
            this._bullets.reset();
            this._enemyHazards = [];
            this._docBossMechanics = [];
            this._docBossTargets = [];
            this._telegraphZones = [];
        }
    }

    setTestCeasefire(on: boolean): void {
        this.testCeasefire = on;
    }

    /** 测试房验收工具：不改面板伤害，直接推进到66%/33%阶段门槛以观察完整Boss轮转。 */
    advanceTestBossPhase(): void {
        const boss = this._boss;
        if (!boss?.alive) {
            this._floatText.spawn(CANVAS_W / 2, 200, '请先生成一只首领', '#ffd080', 16, true);
            return;
        }
        if (boss.phase === 1) boss.hp = Math.min(boss.hp, boss.maxHp * 0.65);
        else if (boss.phase === 2) boss.hp = Math.min(boss.hp, boss.maxHp * 0.32);
        else {
            this._floatText.spawn(CANVAS_W / 2, 200, '首领已进入阶段 III', '#d9a6ff', 16, true);
            return;
        }
        this._floatText.spawn(CANVAS_W / 2, 200, '推进阶段：清理旧机制后留出1.2秒观察窗', '#d9a6ff', 16, true);
    }

    /** 酸囊投手抛投入口：落点在飞行全程可见，测试房与未来正式波次共用。 */
    spawnEnemyAcidHazard(fromX: number, fromY: number, targetX: number, targetY: number): void {
        this._enemyHazards.push({
            kind: 'acid', fromX, fromY, x: targetX, y: targetY, r: 52,
            phase: 'telegraph', timer: 0.7, telegraphMax: 0.7, tickCd: 0,
        });
        this._audio.playSfx('skill_e', 0.35);
    }

    /** 焚芯咒仆：锁定玩家当前点，0.85秒后爆燃并留下1.5秒余烬。 */
    spawnEnemyEmberHazard(targetX: number, targetY: number): void {
        this._enemyHazards.push({
            kind: 'ember', fromX: targetX, fromY: targetY, x: targetX, y: targetY, r: 58,
            phase: 'telegraph', timer: 0.85, telegraphMax: 0.85, tickCd: 0,
        });
        this._audio.playSfx('skill_e', 0.32);
    }

    /** 铆链猎犬：两枚六角捕兽夹先预告0.8秒，再封锁路线5秒。 */
    spawnHoundTraps(x1: number, y1: number, x2: number, y2: number): void {
        for (const [x, y] of [[x1, y1], [x2, y2]]) {
            this._enemyHazards.push({
                kind: 'trap', fromX: x, fromY: y, x, y, r: 25,
                phase: 'telegraph', timer: 0.8, telegraphMax: 0.8, tickCd: 0,
            });
        }
        this._audio.playSfx('skill_e', 0.38);
    }

    /** 三相祭司焚相：三个预测点依次亮起，视觉计时与爆炸判定共用同一对象。 */
    spawnTriuneFireMarks(points: { x: number; y: number }[]): void {
        points.slice(0, 3).forEach((pt, i) => this._enemyHazards.push({
            kind: 'priest_fire', fromX: pt.x, fromY: pt.y, x: pt.x, y: pt.y, r: 50,
            phase: 'telegraph', timer: 0.85 + i * 0.32, telegraphMax: 0.85 + i * 0.32, tickCd: 0,
        }));
        this._audio.playSfx('skill_e', 0.38);
    }

    /** 三相祭司冻相：五条通道中随机保留两个相邻缺口，其余三段推进420px。 */
    spawnTriuneIceWall(side: 'left' | 'right'): void {
        const gapStart = Rng.int(0, 3);
        const sign = side === 'left' ? 1 : -1;
        for (let slot = 0; slot < 5; slot++) {
            if (slot === gapStart || slot === gapStart + 1) continue;
            const y = 92 + slot * ((PLAYFIELD_BOTTOM - 184) / 4);
            this._priestWalls.push({
                x: side === 'left' ? 26 : CANVAS_W - 26, y,
                vx: sign * 180, vy: 0, r: 22, halfH: 48,
                warn: 0.9, distance: 0, hit: false,
            });
        }
        this._audio.playSfx('freeze', 0.42);
    }

    /** 三相祭司雷相：三枚90HP导体是玩家子弹的真实目标；打破任意一枚即拆除全网。 */
    spawnTriuneConductors(centerX: number, centerY: number): void {
        const group: any = { activeIn: 1.2, timer: 7.2, hitCd: 0, dead: false, nodes: [] as any[] };
        for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
            const node: any = {
                x: clamp(centerX + Math.cos(a) * 88, 22, CANVAS_W - 22),
                y: clamp(centerY + Math.sin(a) * 88, 22, PLAYFIELD_BOTTOM - 22),
                radius: 16, hp: 90, maxHp: 90, alive: true,
                isElite: false, isBoss: false, frozen: 0,
            };
            node.takeDamage = (damage: number) => {
                if (!node.alive || group.dead) return 0;
                const dealt = Math.min(node.hp, Math.max(0, damage));
                node.hp -= dealt;
                if (node.hp <= 0) {
                    group.dead = true;
                    for (const n of group.nodes) n.alive = false;
                    this._economy.spawnDrop(node.x, node.y, 3);
                    this._particles.hexActivate(node.x, node.y, '#d8f7ff');
                    this._floatText.spawn(node.x, node.y - 32, '电网瓦解！ +3', '#d8f7ff', 15, true);
                }
                return dealt;
            };
            node.takeTrueDamage = node.takeDamage;
            group.nodes.push(node);
        }
        this._triuneNetworks.push(group);
        this._audio.playSfx('lightning', 0.42);
    }

    /** 磁轨屠夫：两枚锯先完整显示固定椭圆轨道0.75秒，再相向绕行一周。 */
    spawnRailSaws(centerX: number, centerY: number): void {
        for (let i = 0; i < 2; i++) {
            this._railSaws.push({
                cx: centerX, cy: centerY, phase: i * Math.PI, dir: i === 0 ? 1 : -1,
                timer: 3.15, warn: 0.75, x: centerX, y: centerY, hitCd: 0,
            });
        }
        this._audio.playSfx('skill_q', 0.4);
    }

    isInsideRailSawOrbit(x: number, y: number): boolean {
        return this._railSaws.some(s => s.timer > 0 && s.warn <= 0 &&
            Math.abs(Math.hypot((x - s.cx) / 145, (y - s.cy) / 80) - 1) <= 0.28);
    }

    /** Player bullets include these stable objects, so conductors can be aimed, pierced and destroyed normally. */
    getEnemyMechanismTargets(): any[] {
        const out: any[] = [];
        for (const group of this._triuneNetworks) if (!group.dead) {
            for (const node of group.nodes) if (node.alive) out.push(node);
        }
        for (const node of this._docBossTargets) if (node.alive) out.push(node);
        return out;
    }

    docBossSkillBusy(boss: BossController): boolean {
        return this._docBossMechanics.some(m => m.boss === boss && m.timer > 0 && m.main !== false);
    }

    clearDocBossMechanics(boss?: BossController): void {
        for (const m of this._docBossMechanics) if (!boss || m.boss === boss) {
            if (m.boss) m.boss.invulnerable = false;
            for (const n of (m.nodes || [])) n.alive = false;
        }
        this._docBossMechanics = boss ? this._docBossMechanics.filter(m => m.boss !== boss) : [];
        this._docBossTargets = this._docBossTargets.filter(n => n.alive);
    }

    /** 可被玩家子弹正常锁定、穿透和摧毁的Boss机制物。 */
    private _makeDocBossTarget(x: number, y: number, hp: number, kind: string, onBreak?: (n: any) => void): any {
        const n: any = {
            x: clamp(x, 22, CANVAS_W - 22), y: clamp(y, 22, PLAYFIELD_BOTTOM - 22),
            radius: 18, hp, maxHp: hp, alive: true, kind,
            isElite: false, isBoss: false, frozen: 0,
        };
        n.takeDamage = (raw: number) => {
            if (!n.alive) return 0;
            const dealt = Math.min(n.hp, Math.max(0, raw));
            n.hp -= dealt;
            if (n.hp <= 0) {
                n.alive = false;
                this._particles.hexActivate(n.x, n.y, kind.includes('vespa') ? '#72ff3c' : kind.includes('manyfold') ? '#c991ff' : '#ff9c3d');
                onBreak?.(n);
            }
            return dealt;
        };
        n.takeTrueDamage = n.takeDamage;
        this._docBossTargets.push(n);
        return n;
    }

    /** 三只新大Boss的基础攻击，独立于五个主动技能。 */
    startDocBossBasic(kind: string, boss: BossController, player: PlayerController): void {
        const a = Math.atan2(player.y - boss.y, player.x - boss.x);
        if (kind === 'vespa') {
            // 双矛点刺：中线是可穿过的缝，两段各22伤。
            this._docBossMechanics.push({ kind: 'vespa_stab', boss, timer: 0.75, max: 0.75, angle: a, hits: 0, main: false });
        } else if (kind === 'crucible_city') {
            const lead = 34;
            this._docBossMechanics.push({ kind: 'crucible_mortar', boss, timer: 2.7, max: 2.7,
                x: clamp(player.x + Math.cos(a) * lead, 42, CANVAS_W - 42),
                y: clamp(player.y + Math.sin(a) * lead, 42, PLAYFIELD_BOTTOM - 42), fired: false, hitCd: 0, main: false });
        } else if (kind === 'manyfold') {
            for (const off of [-0.34, -0.18, 0.12, 0.24, 0.36]) {
                const aa = a + off;
                this.enemyBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(aa) * 260, vy: Math.sin(aa) * 260,
                    damage: 18, radius: 6, color: '#d8b8ff', life: 3, lifeTime: 3,
                    owner: 'enemy', isEnemyBullet: true, enemyFx: 'chaos', srcBossTag: 'doc_manyfold' });
            }
        }
    }

    /** 按文档序号0~4启动主动技能；状态与绘制共用同一对象，避免“只画不判”。 */
    startDocBossSkill(kind: string, skill: number, boss: BossController, player: PlayerController): void {
        const add = (m: any) => this._docBossMechanics.push({ boss, timer: 6, max: 6, main: true, ...m });
        if (kind === 'vespa') {
            if (skill === 0) {
                const nodes: any[] = [];
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    nodes.push(this._makeDocBossTarget(player.x + Math.cos(a) * 95, player.y + Math.sin(a) * 95, 100, 'vespa_web_pin', n => {
                        this._economy.spawnDrop(n.x, n.y, 3);
                    }));
                }
                add({ kind: 'vespa_web', timer: 6.9, max: 6.9, warn: 0.9, nodes, edgeCd: new Array(6).fill(0) });
            } else if (skill === 1) {
                const count = boss.phase === 1 ? 1 : 3;
                const points: any[] = [];
                for (let i = 0; i < count; i++) {
                    const x = i === 2 ? CANVAS_W / 2 + Math.cos(this._visualTime) * 70 : player.x + (i === 1 ? Math.cos(this._visualTime * 3) * 75 : 0);
                    const y = i === 2 ? PLAYFIELD_BOTTOM / 2 + Math.sin(this._visualTime) * 50 : player.y + (i === 1 ? Math.sin(this._visualTime * 3) * 55 : 0);
                    points.push({ x: clamp(x, 80, CANVAS_W - 80), y: clamp(y, 80, PLAYFIELD_BOTTOM - 80), at: 0.65 + i * 0.55, hit: false });
                }
                boss.invulnerable = true;
                add({ kind: 'vespa_jump', timer: 0.65 + count * 0.55 + 0.25, max: 0.65 + count * 0.55 + 0.25, elapsed: 0, points });
            } else if (skill === 2) {
                const drops: any[] = [];
                for (let i = 0; i < 12; i++) {
                    const center = i < 8 ? player : boss;
                    const ring = i < 8 ? 92 + (i % 2) * 54 : 72;
                    const a = i * 2.399 + 0.3;
                    drops.push({ x: clamp(center.x + Math.cos(a) * ring, 36, CANVAS_W - 36), y: clamp(center.y + Math.sin(a) * ring, 36, PLAYFIELD_BOTTOM - 36), hit: false });
                }
                add({ kind: 'vespa_rain', timer: 1.35, max: 1.35, drops });
            } else if (skill === 3) {
                const nodes: any[] = [];
                for (let i = 0; i < 3; i++) {
                    const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
                    nodes.push(this._makeDocBossTarget(CANVAS_W / 2 + Math.cos(a) * 470, PLAYFIELD_BOTTOM / 2 + Math.sin(a) * 220, 180, 'vespa_egg', n => {
                        this._economy.spawnDrop(n.x, n.y, 8);
                        if (boss.alive) boss.hp = Math.max(1, boss.hp - boss.hp * 0.03);
                    }));
                }
                add({ kind: 'vespa_eggs', timer: 6, max: 6, nodes });
            } else {
                boss.x = boss.x < CANVAS_W / 2 ? CANVAS_W - 90 : 90;
                const node = this._makeDocBossTarget(player.x, player.y, 450, 'vespa_shell', n => {
                    this._economy.spawnDrop(n.x, n.y, 15); boss.frozen = Math.max(boss.frozen, 2);
                    this._floatText.spawn(n.x, n.y - 35, '毒爆取消！ +15', '#b7ff74', 16, true);
                });
                add({ kind: 'vespa_shell', timer: 4, max: 4, nodes: [node], exploded: false });
            }
        } else if (kind === 'crucible_city') {
            if (skill === 0) {
                const nodes: any[] = [];
                const breakPole = (n: any) => {
                    this._economy.spawnDrop(n.x, n.y, 5);
                    for (const p of nodes) p.alive = false;
                };
                nodes.push(this._makeDocBossTarget(player.x - 150, player.y, 160, 'crucible_blue_pole', breakPole));
                nodes.push(this._makeDocBossTarget(player.x + 150, player.y, 160, 'crucible_pink_pole', breakPole));
                add({ kind: 'crucible_poles', timer: 6, max: 6, warn: 1, nodes, hitCd: 0 });
            } else if (skill === 1) {
                const lanes = [-170, 0, 170].map((off, i) => ({ vertical: i === 1, center: (i === 1 ? CANVAS_W / 2 : PLAYFIELD_BOTTOM / 2 + off), at: 1 + i * 0.55, hit: false }));
                add({ kind: 'crucible_pistons', timer: 3.4, max: 3.4, elapsed: 0, lanes });
            } else if (skill === 2) {
                const nodes: any[] = [];
                for (let i = 0; i < 4; i++) {
                    const a = Math.PI / 4 + i * Math.PI / 2;
                    nodes.push(this._makeDocBossTarget(CANVAS_W / 2 + Math.cos(a) * 540, PLAYFIELD_BOTTOM / 2 + Math.sin(a) * 260, 130, 'crucible_scrap', n => this._economy.spawnDrop(n.x, n.y, 6)));
                }
                add({ kind: 'crucible_scrap', timer: 4, max: 4, nodes });
            } else if (skill === 3) {
                const nodes: any[] = [];
                for (let row = 0; row < 2; row++) for (let slot = 0; slot < 6; slot++) {
                    if (slot === (row ? 1 : 2) || slot === (row ? 4 : 5)) continue;
                    const n = this._makeDocBossTarget(22, 82 + slot * 82, 220, 'crucible_billet');
                    // 两面错时钢坯墙从战场左侧外进入，每面墙保留两个清晰缺口。
                    n.x = -50 - row * 145; n.radius = 24; n.vx = 95; nodes.push(n);
                }
                add({ kind: 'crucible_billets', timer: 6, max: 6, nodes, hitCd: 0 });
            } else {
                boss.x = CANVAS_W / 2; boss.y = PLAYFIELD_BOTTOM / 2;
                add({ kind: 'crucible_backflow', timer: 6.2, max: 6.2, warn: 1.2, safeAngle: 0, hitCd: 0 });
            }
        } else if (kind === 'manyfold') {
            if (skill === 0) {
                const lines = [
                    { ax: 0, ay: 120, bx: CANVAS_W, by: PLAYFIELD_BOTTOM - 80, at: 1, hit: false },
                    { ax: 0, ay: PLAYFIELD_BOTTOM - 100, bx: CANVAS_W, by: 100, at: 1.5, hit: false },
                    { ax: CANVAS_W * 0.32, ay: 0, bx: CANVAS_W * 0.68, by: PLAYFIELD_BOTTOM, at: 2, hit: false },
                ];
                add({ kind: 'manyfold_lines', timer: 3, max: 3, elapsed: 0, lines });
            } else if (skill === 1) {
                const vertical = (Math.floor(this._visualTime) % 2) === 0;
                add({ kind: 'manyfold_mirror', timer: 1.1, max: 1.1, vertical, done: false,
                    px: player.x, py: player.y, bx: boss.x, by: boss.y });
            } else if (skill === 2) {
                let points = this._docPlayerTrail.map(p => ({ x: p.x, y: p.y }));
                const spread = points.length ? Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) : 0;
                if (spread < 35) points = Array.from({ length: 18 }, (_, i) => ({ x: player.x + Math.cos(i / 18 * Math.PI * 2) * 55, y: player.y + Math.sin(i / 18 * Math.PI * 2) * 55 }));
                add({ kind: 'manyfold_shadow', timer: 2.9, max: 2.9, warn: 0.9, points, cursor: 0, hit: false });
            } else if (skill === 3) {
                boss.x = CANVAS_W / 2; boss.y = PLAYFIELD_BOTTOM / 2;
                add({ kind: 'manyfold_sectors', timer: 4.3, max: 4.3, elapsed: 0, safe: 0, round: 0, hitRound: -1 });
            } else {
                const nodes: any[] = [];
                const placements = [
                    { x: 80, y: PLAYFIELD_BOTTOM / 2, edge: 'left' },
                    { x: CANVAS_W - 80, y: PLAYFIELD_BOTTOM / 2, edge: 'right' },
                    { x: 400, y: 58, edge: 'bottom' },
                    { x: 880, y: 58, edge: 'bottom' },
                    { x: 400, y: PLAYFIELD_BOTTOM - 58, edge: 'top' },
                    { x: 880, y: PLAYFIELD_BOTTOM - 58, edge: 'top' },
                ];
                for (const spec of placements) {
                    const n = this._makeDocBossTarget(spec.x, spec.y, 240, 'manyfold_needle', target => this._economy.spawnDrop(target.x, target.y, 8));
                    n.edge = spec.edge;
                    nodes.push(n);
                }
                add({ kind: 'manyfold_boundary', timer: 8, max: 8, nodes, hitCd: 0, pause: 0, lastDead: 0 });
            }
        }
        this._audio.playSfx('skill_r', 0.55);
    }

    private _docLineDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
        const vx = bx - ax, vy = by - ay;
        const len2 = vx * vx + vy * vy || 1;
        const t = clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1);
        return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
    }

    /** 统一推进所有新大Boss机制：视觉计时、碰撞、可破坏物与阶段清理共享同一真值。 */
    private _updateDocBossMechanics(dt: number): void {
        const p = this._player;
        if (p?.alive) {
            this._docTrailSampleCd -= dt;
            if (this._docTrailSampleCd <= 0) {
                this._docTrailSampleCd = 0.10;
                this._docPlayerTrail.push({ x: p.x, y: p.y, age: 0 });
            }
            for (const q of this._docPlayerTrail) q.age += dt;
            this._docPlayerTrail = this._docPlayerTrail.filter(q => q.age <= 3.15);
        }
        const hurt = (damage: number, label?: string) => {
            if (!p?.alive || p.godMode) return;
            p.takeDamage(damage, this, { ignoreIframe: true });
            if (label) this._floatText.spawn(p.x, p.y - 42, label, '#ffb37b', 14, true);
        };
        for (let i = this._docBossMechanics.length - 1; i >= 0; i--) {
            const m = this._docBossMechanics[i];
            const boss: BossController = m.boss;
            if (!boss?.alive) { for (const n of (m.nodes || [])) n.alive = false; this._docBossMechanics.splice(i, 1); continue; }
            m.timer -= dt;
            if (m.hitCd > 0) m.hitCd -= dt;

            if (m.kind === 'vespa_stab') {
                const elapsed = m.max - m.timer;
                const stage = elapsed >= 0.50 ? (elapsed < 0.75 ? 1 : 2) : 0;
                if (stage > m.hits) {
                    m.hits = stage;
                    const aa = m.angle + (stage === 1 ? -0.24 : 0.24);
                    if (Vec.dist(boss.x, boss.y, p.x, p.y) <= 150) {
                        const pa = Math.atan2(p.y - boss.y, p.x - boss.x);
                        if (Math.abs(Math.atan2(Math.sin(pa - aa), Math.cos(pa - aa))) < 0.25) hurt(22, '晶矛点刺');
                    }
                    this._particles.meleeSlash?.(boss.x, boss.y, aa, '#8dff65', 145, 1.25);
                }
            } else if (m.kind === 'crucible_mortar') {
                if (!m.fired && m.timer <= 2) {
                    m.fired = true;
                    if (Vec.dist(m.x, m.y, p.x, p.y) < 48 + p.radius) hurt(24, '铸渣迫击');
                    this._particles.explode(m.x, m.y, '#ff8b2c', 48);
                }
                if (m.fired && m.timer > 0 && Vec.dist(m.x, m.y, p.x, p.y) < 38 + p.radius && m.hitCd <= 0) {
                    m.hitCd = 0.8; hurt(4);
                }
            } else if (m.kind === 'vespa_web') {
                m.warn = Math.max(0, m.warn - dt);
                for (let e = 0; e < 6; e++) m.edgeCd[e] = Math.max(0, m.edgeCd[e] - dt);
                if (m.warn <= 0) for (let e = 0; e < 6; e++) {
                    const a = m.nodes[e], b = m.nodes[(e + 1) % 6];
                    if (!a.alive || !b.alive || m.edgeCd[e] > 0) continue;
                    if (this._docLineDistance(p.x, p.y, a.x, a.y, b.x, b.y) < p.radius + 5) {
                        m.edgeCd[e] = 1; hurt(8, '蛛网减速'); p.applyBuff?.('vespa_web_slow', 1.2, { speed: 0.7 });
                    }
                }
            } else if (m.kind === 'vespa_jump') {
                m.elapsed += dt;
                for (const pt of m.points) if (!pt.hit && m.elapsed >= pt.at) {
                    pt.hit = true; boss.x = pt.x; boss.y = pt.y;
                    this._particles.explode(pt.x, pt.y, '#71ff42', 76);
                    if (Vec.dist(pt.x, pt.y, p.x, p.y) < 76 + p.radius) hurt(30, '弹跳猎杀');
                    if (pt === m.points[m.points.length - 1] && m.points.length === 3) {
                        this._docBossMechanics.push({ kind: 'vespa_poison_pool', boss, timer: 4, max: 4, x: pt.x, y: pt.y, hitCd: 0, main: false });
                    }
                }
                if (m.timer <= 0) boss.invulnerable = false;
            } else if (m.kind === 'vespa_poison_pool') {
                if (Vec.dist(m.x, m.y, p.x, p.y) < 70 + p.radius && m.hitCd <= 0) {
                    m.hitCd = 1; hurt(3); p.applyDot?.(3, 1.2, '#72ff38');
                }
            } else if (m.kind === 'vespa_rain') {
                if (m.timer <= 0.25) for (const d of m.drops) if (!d.hit) {
                    d.hit = true; this._particles.explode?.(d.x, d.y, '#72ff38', 34);
                    if (Vec.dist(d.x, d.y, p.x, p.y) < 34 + p.radius) { hurt(18, '母囊毒雨'); p.applyDot?.(3, 4, '#72ff38'); }
                }
            } else if (m.kind === 'vespa_eggs') {
                if (m.timer <= 0) for (const n of m.nodes) if (n.alive) {
                    n.alive = false;
                    for (let k = 0; k < 3; k++) this.spawnEnemy('acid_sac', n.x + Math.cos(k * Math.PI * 2 / 3) * 34, n.y + Math.sin(k * Math.PI * 2 / 3) * 34);
                }
            } else if (m.kind === 'vespa_shell') {
                const n = m.nodes[0];
                if (m.timer <= 0 && n.alive && !m.exploded) {
                    m.exploded = true; n.alive = false; hurt(18, '蜕晶毒震');
                    this._particles.explode(n.x, n.y, '#73ff3f', 160);
                    this._docBossMechanics.push({ kind: 'vespa_broken_ring', boss, timer: 2.5, max: 2.5, x: n.x, y: n.y, radius: 30, hitCd: 0, main: false });
                }
            } else if (m.kind === 'vespa_broken_ring') {
                m.radius += 115 * dt;
                const dist = Vec.dist(m.x, m.y, p.x, p.y);
                const angle = Math.atan2(p.y - m.y, p.x - m.x);
                    const inGap = Math.abs(Math.sin(angle)) < 0.18;
                if (!inGap && Math.abs(dist - m.radius) < 13 + p.radius && m.hitCd <= 0) { m.hitCd = 1; hurt(12); }
            } else if (m.kind === 'crucible_poles') {
                m.warn = Math.max(0, m.warn - dt);
                if (m.warn <= 0) for (let n = 0; n < m.nodes.length; n++) {
                    const pole = m.nodes[n]; if (!pole.alive) continue;
                    const dist = Vec.dist(pole.x, pole.y, p.x, p.y);
                    if (dist < 150 && dist > 1) {
                        const force = (n === 0 ? -1 : 1) * 55 * dt;
                        p.x = clamp(p.x + (p.x - pole.x) / dist * force, p.radius, CANVAS_W - p.radius);
                        p.y = clamp(p.y + (p.y - pole.y) / dist * force, p.radius, PLAYFIELD_BOTTOM - p.radius);
                    }
                    if (dist < 24 + p.radius && m.hitCd <= 0) { m.hitCd = 1; hurt(10, n === 0 ? '蓝极灼热' : '品红灼热'); }
                }
            } else if (m.kind === 'crucible_pistons') {
                m.elapsed += dt;
                for (const lane of m.lanes) if (!lane.hit && m.elapsed >= lane.at) {
                    lane.hit = true;
                    const inside = lane.vertical ? Math.abs(p.x - lane.center) <= 35 + p.radius : Math.abs(p.y - lane.center) <= 35 + p.radius;
                    if (inside) hurt(34, '活塞打桩');
                    this._shake.shake(8, 0.22);
                }
                if (m.lanes.every((l: any) => l.hit) && !m.exposed) { m.exposed = true; boss.armor = 0; m.restoreArmor = 30; }
                if (m.exposed && m.timer <= 1.0) boss.armor = m.restoreArmor;
            } else if (m.kind === 'crucible_scrap') {
                for (const n of m.nodes) if (n.alive) {
                    const [dx, dy] = Vec.normalize(boss.x - n.x, boss.y - n.y);
                    n.x += dx * 120 * dt; n.y += dy * 120 * dt;
                    if (Vec.dist(n.x, n.y, p.x, p.y) < n.radius + p.radius && (n.hitCd ?? 0) <= 0) { n.hitCd = 0.8; hurt(20, '废钢撞击'); }
                    n.hitCd = Math.max(0, (n.hitCd ?? 0) - dt);
                    if (Vec.dist(n.x, n.y, boss.x, boss.y) < boss.radius + 14) { n.alive = false; boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * 0.025); }
                }
            } else if (m.kind === 'crucible_billets') {
                for (const n of m.nodes) if (n.alive) {
                    n.x += n.vx * dt;
                    if (Vec.dist(n.x, n.y, p.x, p.y) < n.radius + p.radius && (n.hitCd ?? 0) <= 0) {
                        n.hitCd = 1; hurt(26, '铸件列阵'); p.x = clamp(p.x + 45, p.radius, CANVAS_W - p.radius);
                    }
                    n.hitCd = Math.max(0, (n.hitCd ?? 0) - dt);
                    if (n.x > 500) n.alive = false;
                }
            } else if (m.kind === 'crucible_backflow') {
                m.warn = Math.max(0, m.warn - dt); m.safeAngle += dt * 0.72;
                if (m.warn <= 0 && m.hitCd <= 0 && Vec.dist(boss.x, boss.y, p.x, p.y) < 330) {
                    const pa = Math.atan2(p.y - boss.y, p.x - boss.x);
                    const diff = Math.abs(Math.atan2(Math.sin(pa - m.safeAngle), Math.cos(pa - m.safeAngle)));
                    if (diff > 35 * Math.PI / 180) { m.hitCd = 0.8; hurt(22, '炉心倒灌'); }
                }
            } else if (m.kind === 'manyfold_lines') {
                m.elapsed += dt;
                for (const line of m.lines) if (!line.hit && m.elapsed >= line.at) {
                    line.hit = true;
                    if (this._docLineDistance(p.x, p.y, line.ax, line.ay, line.bx, line.by) < p.radius + 11) hurt(30, '空间切割');
                }
            } else if (m.kind === 'manyfold_mirror') {
                if (!m.done && m.timer <= 0) {
                    m.done = true;
                    if (m.vertical) { p.x = CANVAS_W - m.px; boss.x = CANVAS_W - m.bx; }
                    else { p.y = PLAYFIELD_BOTTOM - m.py; boss.y = PLAYFIELD_BOTTOM - m.by; }
                    // 折面既是威胁也是解围工具：清除双方落点55px内的地面危险。
                    const endpoints = [[p.x, p.y], [boss.x, boss.y]];
                    this._enemyHazards = this._enemyHazards.filter(z => endpoints.every(([x, y]) => Vec.dist(z.x, z.y, x, y) > 55));
                    for (const q of this._docBossMechanics) if (q.kind === 'vespa_poison_pool' && endpoints.some(([x, y]) => Vec.dist(q.x, q.y, x, y) <= 55)) q.timer = 0;
                }
            } else if (m.kind === 'manyfold_shadow') {
                m.warn = Math.max(0, m.warn - dt);
                if (m.warn <= 0 && m.points.length) {
                    m.cursor = Math.min(m.points.length - 1, m.cursor + dt * m.points.length / 2);
                    const pt = m.points[Math.floor(m.cursor)];
                    if (!m.hit && Vec.dist(pt.x, pt.y, p.x, p.y) < 24 + p.radius) { m.hit = true; hurt(28, '借影裁片'); }
                }
            } else if (m.kind === 'manyfold_sectors') {
                m.elapsed += dt;
                const round = Math.min(3, Math.floor(Math.max(0, m.elapsed - 1) / 0.8));
                if (round > m.round) { m.round = round; m.safe = (m.safe + 1) % 6; }
                if (m.elapsed >= 1 + round * 0.8 && m.hitRound !== round) {
                    m.hitRound = round;
                    const a = Math.atan2(p.y - boss.y, p.x - boss.x);
                    const sector = ((Math.floor((a + Math.PI) / (Math.PI / 3)) % 6) + 6) % 6;
                    if (sector !== m.safe) hurt(36, '六面缺口');
                }
            } else if (m.kind === 'manyfold_boundary') {
                const dead = m.nodes.filter((n: any) => !n.alive).length;
                if (dead >= 4) m.timer = 0;
                if (dead >= 2 && m.lastDead < 2) m.pause = 2;
                m.lastDead = dead;
                if (m.pause > 0) m.pause -= dt;
                const progress = m.pause > 0 ? m.progress ?? 0 : clamp(1 - m.timer / m.max, 0, 1);
                m.progress = progress;
                const insetX = 128 * progress, insetY = 58 * progress;
                const outside = p.x < insetX || p.x > CANVAS_W - insetX || p.y < insetY || p.y > PLAYFIELD_BOTTOM - insetY;
                const openPort = m.nodes.some((n: any) => !n.alive && (
                    (n.edge === 'left' && p.x < insetX && Math.abs(p.y - n.y) <= 75)
                    || (n.edge === 'right' && p.x > CANVAS_W - insetX && Math.abs(p.y - n.y) <= 75)
                    || (n.edge === 'bottom' && p.y < insetY && Math.abs(p.x - n.x) <= 75)
                    || (n.edge === 'top' && p.y > PLAYFIELD_BOTTOM - insetY && Math.abs(p.x - n.x) <= 75)
                ));
                if (outside && !openPort && m.hitCd <= 0) {
                    m.hitCd = 1; hurt(12, '收缩边界');
                }
            }

            if (m.timer <= 0) {
                if (m.kind === 'vespa_jump') boss.invulnerable = false;
                if (m.kind === 'crucible_pistons' && m.exposed) boss.armor = m.restoreArmor;
                for (const n of (m.nodes || [])) n.alive = false;
                this._docBossMechanics.splice(i, 1);
            }
        }
        this._docBossTargets = this._docBossTargets.filter(n => n.alive);
    }

    private _refreshPlayerDot(color: string, dps: number, duration: number, maxStacks: number): void {
        const p = this._player;
        if (!p) return;
        const matches = (p.dots || []).filter((d: any) => d.color === color);
        if (matches.length >= maxStacks) {
            for (const d of matches) d.timeLeft = Math.max(d.timeLeft, duration);
        } else {
            p.applyDot(dps, duration, color);
        }
    }

    /** 酸囊落地：4点直伤+4秒2DPS；毒斑3秒内每秒刷新，酸毒最多2层。 */
    private _updateEnemyHazards(dt: number): void {
        const p = this._player;
        for (let i = this._enemyHazards.length - 1; i >= 0; i--) {
            const z = this._enemyHazards[i];
            z.timer -= dt;
            if (z.phase === 'telegraph') {
                if (z.timer > 0) continue;
                z.phase = 'pool'; z.timer = z.kind === 'acid' ? 3 : z.kind === 'ember' ? 1.5 : z.kind === 'priest_fire' ? 0.12 : 5; z.tickCd = 0;
                if (z.kind === 'acid') this._particles.toxin(z.x, z.y);
                else if (z.kind === 'ember') this._particles.ignite(z.x, z.y);
                else if (z.kind === 'priest_fire') this._particles.explode?.(z.x, z.y, '#ff8a35', z.r);
                else this._particles.impact(z.x, z.y, 0, 0.35, '#ff5f4a');
                this._audio.playSfx(z.kind === 'trap' ? 'hit' : 'explode', 0.32);
                if (p?.alive && Vec.dist(z.x, z.y, p.x, p.y) <= z.r + (p.radius ?? 16)) {
                    p.takeDamage(z.kind === 'acid' ? 4 : z.kind === 'ember' ? 5 : z.kind === 'priest_fire' ? 18 : 12, this, { ignoreIframe: true });
                    if (z.kind === 'acid') this._refreshPlayerDot('#72ff38', 2, 4, 2);
                    else if (z.kind === 'ember') this._refreshPlayerDot('#ff7a24', 2, 4, 1);
                    else if (z.kind === 'priest_fire') this._refreshPlayerDot('#ff8a35', 2, 3, 1);
                    else {
                        p.applyBuff?.('hound_trap_slow', 1.5, { speed: 0.65 });
                        this._floatText.spawn(p.x, p.y - 42, '捕获！', '#ff7968', 16, true);
                        this._enemyHazards.splice(i, 1);
                    }
                }
                continue;
            }

            if (z.timer <= 0) {
                this._enemyHazards.splice(i, 1);
                continue;
            }
            z.tickCd -= dt;
            if (z.tickCd <= 0) {
                z.tickCd = 1;
                if (p?.alive && Vec.dist(z.x, z.y, p.x, p.y) <= z.r + (p.radius ?? 16)) {
                    if (z.kind === 'acid') this._refreshPlayerDot('#72ff38', 2, 4, 2);
                    else if (z.kind === 'ember') this._refreshPlayerDot('#ff7a24', 2, 4, 1);
                    else {
                        p.takeDamage(12, this, { ignoreIframe: true });
                        p.applyBuff?.('hound_trap_slow', 1.5, { speed: 0.65 });
                        this._floatText.spawn(p.x, p.y - 42, '捕获！', '#ff7968', 16, true);
                        this._enemyHazards.splice(i, 1);
                    }
                }
            }
        }

        // 冰晶墙：0.9秒预警后移动420px；只结算一次伤害与1.5秒减速。
        for (let i = this._priestWalls.length - 1; i >= 0; i--) {
            const w = this._priestWalls[i];
            if (w.warn > 0) { w.warn = Math.max(0, w.warn - dt); continue; }
            const step = Math.hypot(w.vx, w.vy) * dt;
            w.x += w.vx * dt; w.y += w.vy * dt; w.distance += step;
            if (!w.hit && p?.alive && Math.abs(p.x - w.x) <= w.r + (p.radius ?? 16) &&
                Math.abs(p.y - w.y) <= w.halfH + (p.radius ?? 16)) {
                w.hit = true;
                p.takeDamage(20, this, { ignoreIframe: true });
                p.applyBuff?.('triune_ice_slow', 1.5, { speed: 0.75 });
                this._particles.coldImpact(p.x, p.y);
            }
            if (w.distance >= 420) { this._particles.coldImpact(w.x, w.y); this._priestWalls.splice(i, 1); }
        }

        // 三角电网：1.2秒后通电；任意线段接触造成22伤害，1秒内不重复结算。
        for (let i = this._triuneNetworks.length - 1; i >= 0; i--) {
            const group = this._triuneNetworks[i];
            group.activeIn -= dt; group.timer -= dt; group.hitCd = Math.max(0, group.hitCd - dt);
            if (group.dead || group.timer <= 0) { for (const n of group.nodes) n.alive = false; this._triuneNetworks.splice(i, 1); continue; }
            if (group.activeIn > 0 || group.hitCd > 0 || !p?.alive) continue;
            for (let edge = 0; edge < 3; edge++) {
                const a = group.nodes[edge], b = group.nodes[(edge + 1) % 3];
                const abx = b.x - a.x, aby = b.y - a.y;
                const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / Math.max(1, abx * abx + aby * aby), 0, 1);
                const qx = a.x + abx * t, qy = a.y + aby * t;
                if (Vec.dist(qx, qy, p.x, p.y) <= 9 + (p.radius ?? 16)) {
                    group.hitCd = 1;
                    p.takeDamage(22, this, { ignoreIframe: true });
                    this._particles.impact(p.x, p.y, Math.atan2(aby, abx), 0.7, '#d8f7ff');
                    break;
                }
            }
        }

        // 两枚锯的轨道中心在生成时锁死，Boss后续移动/反冲都不会拖动轨道。
        for (let i = this._railSaws.length - 1; i >= 0; i--) {
            const s = this._railSaws[i];
            s.timer -= dt; s.hitCd = Math.max(0, s.hitCd - dt);
            if (s.warn > 0) { s.warn = Math.max(0, s.warn - dt); }
            else {
                const progress = 1 - Math.max(0, s.timer) / 2.4;
                const a = s.phase + s.dir * progress * Math.PI * 2;
                s.x = s.cx + Math.cos(a) * 145; s.y = s.cy + Math.sin(a) * 80;
                if (s.hitCd <= 0 && p?.alive && Vec.dist(s.x, s.y, p.x, p.y) <= 20 + (p.radius ?? 16)) {
                    s.hitCd = 0.8;
                    p.takeDamage(18, this, { ignoreIframe: true });
                    this._particles.impact(p.x, p.y, a, 0.75, '#ff9b32');
                }
            }
            if (s.timer <= 0) this._railSaws.splice(i, 1);
        }
    }

    /** 水分身：最多 1 个；与本体同尺寸的淡色虚影，3s 引导后向主角位置冲锋，撞到 40 伤+10% 减速，失败则变为水柱。 */
    spawnWaterClone(boss: BossController, player: any): void {
        if (this.state !== 'testRoom') return;
        // 水分身最多 1 个
        if (this._turrets.some(t => t.kind === 'waterClone' && t.alive)) return;
        // 与场上水柱/鱿鱼共享上限
        if (this._testWaterCount() >= MAX_TEST_WATER_UNITS) return;
        const c: any = {
            x: boss.x + 90, y: boss.y,
            r: boss.radius, // 与本体同尺寸（颜色更淡以示区分）
            alive: true,
            kind: 'waterClone', _phase: 'windup', _t: 2, // 引导 2 秒后冲锋
            _vx: 0, _vy: 0, _speed: 460, _aim: 0, owner: boss,
        };
        this._initSummonActor(c, 'enemy_boss_abyss', boss.radius * 4, '#bfefff', 165);
        c.update = (dt: number, g: GameManager) => {
            if (!c.alive) return;
            if (c._phase === 'windup') {
                c._t -= dt;
                c._aim = Math.atan2(player.y - c.y, player.x - c.x);
                if (c._t <= 0) {
                    c._phase = 'dash';
                    c._t = 2.5;
                    c._vx = Math.cos(c._aim) * c._speed;
                    c._vy = Math.sin(c._aim) * c._speed;
                    g.particles?.impact?.(c.x, c.y, c._aim, 1, '#33ccff');
                    g.floatingText?.spawn?.(c.x, c.y - 40, '冲锋！', '#33ccff', 16, true);
                }
                return;
            }
            c.x += c._vx * dt;
            c.y += c._vy * dt;
            c._t -= dt;
            // 撞到玩家：40 伤 + 10% 减速 3s
            if (player.alive && Vec.dist(c.x, c.y, player.x, player.y) < c.r + (player.radius ?? 16) + 6) {
                player.takeDamage(40, g);
                player.applyBuff?.('water_slow', 3, { speed: 0.9 });
                g.particles?.explode?.(c.x, c.y, '#33ccff', 70);
                g.floatingText?.spawn?.(player.x, player.y - 50, '水冲！', '#33ccff', 18, true);
                c.alive = false;
                return;
            }
            // 未撞到（出界/超时）→ 消散并在场景边缘生成一道水柱
            if (c._t <= 0 || c.x < -40 || c.x > CANVAS_W + 40 || c.y < -40 || c.y > PLAYFIELD_BOTTOM + 40) {
                c.alive = false;
                g.spawnWaterPillar();
            }
        };
        this._turrets.push(c);
        this._floatText.spawn(c.x, c.y - 46, '水分身！', '#33ccff', 16, true);
    }

    /** 召唤深海鱿鱼：消耗至多 3 道空闲水柱并在各自水柱位置生成；无水柱则补一道水柱后在其位置生成（共享上限）。 */
    abyssSummonSquid(boss: BossController): void {
        if (this.state !== 'testRoom') return;
        const spots: { x: number; y: number }[] = [];
        // 消耗空闲水柱并记录位置（不消耗正在对射的）；消耗→生成是等量替换，总量不变
        for (let i = this._pillars.length - 1; i >= 0 && spots.length < 3; i--) {
            if (this._pillars[i].state === 'idle') {
                spots.push({ x: this._pillars[i].x, y: this._pillars[i].y });
                this._pillars.splice(i, 1);
            }
        }
        // 没水柱：固定方位有空位则补一道并在该位置生成（净增 1），无空位或已达共享上限则放弃召唤
        if (spots.length === 0) {
            if (this._testWaterCount() >= MAX_TEST_WATER_UNITS) return;
            const emptySpot = PILLAR_SPOTS.findIndex((_, s) => !this._pillars.some(z => z.spot === s));
            if (emptySpot < 0) return;
            const [x, y] = PILLAR_SPOTS[emptySpot];
            spots.push({ x, y });
        }
        // 每道被消耗的水柱位置生成一只深海鱿鱼
        for (const s of spots) {
            this.spawnEnemy('squid', s.x, s.y);
            this._particles.coldImpact(s.x, s.y);
        }
        this._floatText.spawn(boss.x, boss.y - 90, `深海鱿鱼现身 ×${spots.length}！`, '#33aaff', 20, true);
        this._audio.playSfx('boss_roar', 0.7);
    }

    private _clearRunEntities() {
        this._corpses.clear();
        this._playerDeathPending = false;
        if (this._player?.node?.isValid) {
            this._player.node.active = false;
            this._player.node.destroy();
        }
        for (const e of this._enemies) {
            if (e.node?.isValid) {
                e.node.active = false;
                e.node.destroy();
            }
        }
        this._enemies = [];
        this._boss = undefined;
        this._turrets = [];
        this._deathZones = [];
        this._iceZones = [];
        this._enemyHazards = []; this._priestWalls = []; this._triuneNetworks = []; this._railSaws = [];
        this._docBossMechanics = []; this._docBossTargets = []; this._docPlayerTrail = [];
        this._pillars = [];
        this._telegraphZones = [];
        this._bullets?.reset();
        this._fxPool?.releaseAll();
        this._coinPool?.releaseAll();
        this._turretBasePool?.releaseAll();
        this._turretBarrelPool?.releaseAll();
        this._summonArtPool?.releaseAll();
        this._floatText?.clear();
    }

    private _continueAfterChapter() {
        // 通关最终章（0-based: 最后一章 clear 后再无下一章）→ 记录胜利局档案
        if (this._chapter + 1 >= CHAPTERS.length) this._recordRun(true);
        this._chapter++;
        this._updateBgForChapter();
        // _setState hides chapterClear panel (and everything else) before the
        // shop UI takes over — avoids the old bug where chapterClear stayed
        // active underneath the shop and its CONTINUE button kept firing.
        this._setState('shop');
        const items = this._economy.generateShopItems(this._chapter);
        this._shopUI.show(
            items,
            this._economy.gold,
            (cost, item) => {
                if (this._economy.spend(cost)) {
                    this._applyShopItem(item);
                    this._shopUI.refreshGold(this._economy.gold);
                    return true;
                }
                return false;
            },
            () => {
                this._setState('playing');
                this._waveMgr.startWave(this);
            }
        );
    }

    private _onWaveCleared() {
        this._wave++;

        // Every 5 waves = boss wave -> chapter clear check
        const wavesPerChapter = CHAPTERS[this._chapter]?.waves ?? 5;
        if (this._wave % wavesPerChapter === 0) {
            this._setState('chapterClear');
            return;
        }

        // Normal wave clear -> augment pick
        // _setState hides all panels (incl. any stray chapterClear) before
        // the augment UI takes over.
        this._setState('augSelect');
        this._audio.playSfx('levelup');
        const options = this._augMgr.rollOptions(3, this._waveMgr.wave, this._player.charId);
        this._augUI.show(options, (aug) => {
            if (aug) this._augMgr.equip(aug, this._player, this);
            this._setState('playing');
            this._waveMgr.startWave(this);
        });
    }

    // ── update (playing only) ─────────────────────────────────

    private _updatePlaying(dt: number) {
        const input = this._input;
        this._corpses.update(dt);

        if (this._playerDeathPending) {
            this._player.updateVisualAnimation(dt);
            this._particles.update(dt);
            if (!this._player.actorAnimation.clip || this._player.actorAnimation.finished) {
                this._playerDeathPending = false;
                this._setState('gameover');
            }
            return;
        }

        // Player
        this._player.tick(dt, input, this);
        if (this._playerDeathPending) return;

        // Enemies
        for (let i = this._enemies.length - 1; i >= 0; i--) {
            const e = this._enemies[i];
            if (!(this.state === 'testRoom' && this._testTargetPaused)) {
                e.update(dt, this._player, this);
                e.updateVisualAnimation(dt, this._player);
            }
            // 先退出碰撞/寻敌列表，尸体单独播放；没有动作稿的单位保留即时回收。
            if (e.dead) {
                if (e === this._boss) this._boss = undefined;
                this._corpses.add(e);
                this._enemies.splice(i, 1);
            }
        }

        if (this._playerDeathPending) return;

        // Bullets
        this._bullets.update(dt, this._enemies, this._player, this);
        this._bullets.updateEnemyBullets(dt, this._player, this);
        if (this._playerDeathPending) return;

        // Turrets / clones
        for (let i = this._turrets.length - 1; i >= 0; i--) {
            const t = this._turrets[i];
            if (!t.alive) { this._turrets.splice(i, 1); continue; }
            t.update?.(dt, this);
            this._updateSummonActor(t, dt);
        }

        // Death zones (持续伤害区域)
        for (let i = this._deathZones.length - 1; i >= 0; i--) {
            const z = this._deathZones[i];
            z.timer -= dt;
            if (z.timer <= 0) { this._deathZones.splice(i, 1); continue; }
            const r2 = z.r * z.r;
            for (const e of this._enemies) {
                if (!e.dead && (e.x - z.x) ** 2 + (e.y - z.y) ** 2 < r2) {
                    e.takeContinuousDamage(z.dps * dt, this._player, this);
                }
            }
        }

        // Ice zones (仅维护生命周期，减速效果在生成时已直接施加到敌人)
        for (let i = this._iceZones.length - 1; i >= 0; i--) {
            const z = this._iceZones[i];
            z.timer -= dt;
            if (z.timer <= 0) this._iceZones.splice(i, 1);
        }

        if (!(this.state === 'testRoom' && this._testTargetPaused)) {
            this._updateEnemyHazards(dt);
            this._updateDocBossMechanics(dt);
        }
        if (this._playerDeathPending) return;

        // Wave manager — 测试房间不跑波次调度，杜绝"清场→章节结算/augSelect"链路
        if (this.state !== 'testRoom') {
            this._waveMgr.update(dt, this);
        }

        // 测试房间场景系统：深海恐惧水柱 / 冰冻预告区
        this._updatePillars(dt);
        this._updateTelegraphZones(dt);

        // Economy (gold pickups)
        this._economy.update(dt, this._player, this);

        // Screen shake
        this._shake.update(dt);
        if (this._shake.x !== 0 || this._shake.y !== 0) {
            const sx = Math.round(this._shake.x);
            const sy = Math.round(this._shake.y);
            // 实体与粒子必须同步移动，否则命中特效会从目标身上“滑开”；背景只做
            // 轻微视差，HUD保持固定，既有冲击感又不会让整屏信息一起乱晃。
            this._gameLayer.setPosition(new Vec3(sx, sy, 0));
            this._particleLayer.setPosition(new Vec3(sx, sy, 0));
            this._bgLayer.setPosition(new Vec3(Math.round(sx * 0.18), Math.round(sy * 0.18), 0));
        } else {
            this._gameLayer.setPosition(Vec3.ZERO);
            this._particleLayer.setPosition(Vec3.ZERO);
            this._bgLayer.setPosition(Vec3.ZERO);
        }

        // Floating text
        this._floatText.update(dt);

        // Particles
        this._particles.update(dt);

        // Augment per-frame hooks
        this._augMgr.dispatchUpdate(this._player, dt, this);

        // Combo timer decay
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) { this.comboTimer = 0; this.comboCount = 0; }
        }

        // 角色详情面板（M）优先于暂停：打开面板时本帧剩余逻辑不再执行
        if (input.isKeyMPressed()) { this._openStats(); return; }

        // Pause toggle（暂停返回状态由 _pauseCombat 记录）
        if (input.justPressed('Escape')) { this._pauseCombat(); }
    }

    // ── render loop ───────────────────────────────────────────

    private _renderFrame() {
        this._drawEntities();
        this._drawParticles();
        this._drawSpriteFx();
        if (this._inCombat()) {
            this._hud.refresh(this._buildHudData());
            this._touchUI.refresh(this._player);
            this._refreshFloatText();
        }
    }

    /**
     * Game logic uses canvas-space coordinates (origin top-left, Y grows
     * downward — same convention as the original JS/pygame ports). Cocos
     * Node-local space has its origin at the layer center with Y growing
     * upward, so every world-space draw call must go through this transform.
     */
    private _toLocal(x: number, y: number): [number, number] {
        return worldToLocal(x, y);
    }

    /** Same transform, but for a canvas-space rect (x,y,w,h) → local (x,y,w,h). */
    private _toLocalRect(x: number, y: number, w: number, h: number): [number, number, number, number] {
        const [lx, ly1] = this._toLocal(x, y);
        const [, ly2]    = this._toLocal(x, y + h);
        return [lx, Math.min(ly1, ly2), w, Math.abs(ly2 - ly1)];
    }

    /** 仅在动作帧改变时切换 SpriteFrame；SpriteUtils 会缓存并防止异步竞态。 */
    private _syncDirectionalFrame(
        entity: any,
        pose: LocomotionPose,
        facing: DirectionalFacingPose,
    ): void {
        const animation = entity.actorAnimation;
        if (animation?.clip && animation.currentFrame && entity.sprite) {
            applyAnimationFrame(entity.sprite, animation.clip, animation.currentFrame);
            entity.locomotionFrameKey = '';
            return;
        }
        entity.sprite?.node?.getComponent(UITransform)?.setAnchorPoint(0.5, 0.5);
        const key = entity.directionalFrames === false
            ? entity.spriteKey
            : directionalArtKey(entity.spriteKey, facing.view, pose.frameIndex);
        if (!entity.sprite || !key || entity.locomotionFrameKey === key) return;
        entity.locomotionFrameKey = key;
        applyArtSprite(entity.sprite, key);
    }

    private _drawDocBossMechanics(g: Graphics): void {
        const hex = (x: number, y: number, r: number) => {
            for (let k = 0; k < 6; k++) {
                const a0 = k * Math.PI / 3, a1 = (k + 1) * Math.PI / 3;
                if (k === 0) g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
                g.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r);
            }
            g.close();
        };
        const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 8);
        for (const m of this._docBossMechanics) {
            const boss = m.boss;
            if (m.kind === 'vespa_stab') {
                const [bx, by] = this._toLocal(boss.x, boss.y);
                for (const off of [-0.24, 0.24]) {
                    const a = -(m.angle + off);
                    g.strokeColor = new Color(129, 255, 101, 130 + Math.floor(pulse * 100)); g.lineWidth = 4;
                    g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * 145, by + Math.sin(a) * 145); g.stroke();
                }
            } else if (m.kind === 'crucible_mortar') {
                const [x, y] = this._toLocal(m.x, m.y);
                g.fillColor = new Color(255, 105, 30, m.fired ? 54 : 24); g.circle(x, y, 42); g.fill();
                g.strokeColor = new Color(255, 164, 64, 210); g.lineWidth = 2.5; g.circle(x, y, 42); g.stroke();
            } else if (m.kind === 'vespa_web') {
                g.strokeColor = new Color(117, 255, 75, m.warn > 0 ? 100 : 220); g.lineWidth = m.warn > 0 ? 1.5 : 4;
                for (let e = 0; e < 6; e++) {
                    const a = m.nodes[e], b = m.nodes[(e + 1) % 6]; if (!a.alive || !b.alive) continue;
                    const [ax, ay] = this._toLocal(a.x, a.y), [bx, by] = this._toLocal(b.x, b.y);
                    g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
                }
            } else if (m.kind === 'vespa_jump') {
                for (const pt of m.points) if (!pt.hit) {
                    const [x, y] = this._toLocal(pt.x, pt.y);
                    const r = 30 + Math.max(0, pt.at - m.elapsed) * 48;
                    g.fillColor = new Color(105, 255, 65, 28); g.circle(x, y, 76); g.fill();
                    g.strokeColor = new Color(154, 255, 118, 220); g.lineWidth = 3; g.circle(x, y, r); g.stroke();
                }
            } else if (m.kind === 'vespa_poison_pool') {
                const [x, y] = this._toLocal(m.x, m.y);
                g.fillColor = new Color(85, 220, 35, 70 + Math.floor(pulse * 30)); g.circle(x, y, 70); g.fill();
                g.strokeColor = new Color(148, 255, 74, 190); g.lineWidth = 2; g.circle(x, y, 70); g.stroke();
            } else if (m.kind === 'vespa_rain') {
                for (const d of m.drops) {
                    const [x, y] = this._toLocal(d.x, d.y);
                    g.fillColor = new Color(112, 255, 56, 30); g.circle(x, y, 34); g.fill();
                    g.strokeColor = new Color(171, 255, 105, 150 + Math.floor(pulse * 90)); g.lineWidth = 2; g.circle(x, y, 34); g.stroke();
                }
            } else if (m.kind === 'vespa_shell') {
                const n = m.nodes[0]; if (n?.alive) {
                    const [x, y] = this._toLocal(n.x, n.y);
                    g.fillColor = new Color(79, 210, 44, 72); hex(x, y, 54); g.fill();
                    g.strokeColor = new Color(179, 255, 125, 230); g.lineWidth = 4; hex(x, y, 54); g.stroke();
                    g.strokeColor = new Color(255, 100, 120, 220); g.lineWidth = 3; g.circle(x, y, 68 - (1 - m.timer / m.max) * 24); g.stroke();
                }
            } else if (m.kind === 'vespa_broken_ring') {
                const [x, y] = this._toLocal(m.x, m.y);
                g.strokeColor = new Color(120, 255, 72, 220); g.lineWidth = 7;
                for (let seg = 0; seg < 24; seg++) if ([0, 1, 12, 13].indexOf(seg) < 0) {
                    const a0 = seg / 24 * Math.PI * 2, a1 = (seg + 0.8) / 24 * Math.PI * 2;
                    g.arc(x, y, m.radius, a0, a1, false); g.stroke();
                }
            } else if (m.kind === 'crucible_poles') {
                for (let i = 0; i < m.nodes.length; i++) if (m.nodes[i].alive) {
                    const n = m.nodes[i], [x, y] = this._toLocal(n.x, n.y);
                    const c = i === 0 ? new Color(65, 155, 255, 55) : new Color(255, 72, 190, 55);
                    g.fillColor = c; g.circle(x, y, 150); g.fill();
                    g.strokeColor = i === 0 ? new Color(92, 190, 255, 230) : new Color(255, 92, 205, 230);
                    g.lineWidth = 3; g.circle(x, y, 22 + pulse * 4); g.stroke();
                }
            } else if (m.kind === 'crucible_pistons') {
                for (let i = 0; i < m.lanes.length; i++) {
                    const lane = m.lanes[i];
                    g.fillColor = new Color(255, 118, 36, lane.hit ? 28 : 18 + i * 14);
                    g.strokeColor = new Color(255, 174, 76, lane.hit ? 70 : 190 + i * 20); g.lineWidth = lane.hit ? 1.5 : 3;
                    if (lane.vertical) {
                        const [x] = this._toLocal(lane.center, 0); g.rect(x - 35, CANVAS_H / 2 - PLAYFIELD_BOTTOM, 70, PLAYFIELD_BOTTOM); g.fill(); g.rect(x - 35, CANVAS_H / 2 - PLAYFIELD_BOTTOM, 70, PLAYFIELD_BOTTOM); g.stroke();
                    } else {
                        const [, y] = this._toLocal(0, lane.center); g.rect(-CANVAS_W / 2, y - 35, CANVAS_W, 70); g.fill(); g.rect(-CANVAS_W / 2, y - 35, CANVAS_W, 70); g.stroke();
                    }
                }
            } else if (m.kind === 'crucible_backflow') {
                const [x, y] = this._toLocal(boss.x, boss.y);
                for (let k = 0; k < 3; k++) {
                    g.strokeColor = new Color(255, 104, 30, m.warn > 0 ? 100 : 230); g.lineWidth = m.warn > 0 ? 8 : 22;
                    // 三层炉环共享同一个70°安全扇区；分段画线避免Graphics.arc跨0°时
                    // 走长弧/短弧不一致，保证视觉缺口与碰撞判定完全同向。
                    for (let seg = 0; seg < 72; seg++) {
                        const w0 = seg / 72 * Math.PI * 2, w1 = (seg + 1) / 72 * Math.PI * 2;
                        const mid = (w0 + w1) * 0.5;
                        const diff = Math.abs(Math.atan2(Math.sin(mid - m.safeAngle), Math.cos(mid - m.safeAngle)));
                        if (diff <= 35 * Math.PI / 180) continue;
                        const r = 190 + k * 32;
                        g.moveTo(x + Math.cos(w0) * r, y - Math.sin(w0) * r);
                        g.lineTo(x + Math.cos(w1) * r, y - Math.sin(w1) * r); g.stroke();
                    }
                }
                g.strokeColor = new Color(100, 205, 255, 210); g.lineWidth = 3;
                const s0 = m.safeAngle - 35 * Math.PI / 180, s1 = m.safeAngle + 35 * Math.PI / 180;
                g.moveTo(x + Math.cos(s0) * 272, y - Math.sin(s0) * 272);
                for (let q = 1; q <= 12; q++) {
                    const a = s0 + (s1 - s0) * q / 12;
                    g.lineTo(x + Math.cos(a) * 272, y - Math.sin(a) * 272);
                }
                g.stroke();
            } else if (m.kind === 'manyfold_lines') {
                for (let i = 0; i < m.lines.length; i++) {
                    const l = m.lines[i], [ax, ay] = this._toLocal(l.ax, l.ay), [bx, by] = this._toLocal(l.bx, l.by);
                    g.strokeColor = new Color(212, 172, 255, l.hit ? 45 : 95 + i * 60); g.lineWidth = l.hit ? 1 : (m.elapsed >= l.at ? 8 : 2 + i);
                    g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
                }
            } else if (m.kind === 'manyfold_mirror') {
                g.strokeColor = new Color(210, 170, 255, 230); g.lineWidth = 4;
                if (m.vertical) { const [x] = this._toLocal(CANVAS_W / 2, 0); g.moveTo(x, CANVAS_H / 2); g.lineTo(x, CANVAS_H / 2 - PLAYFIELD_BOTTOM); }
                else { const [, y] = this._toLocal(0, PLAYFIELD_BOTTOM / 2); g.moveTo(-CANVAS_W / 2, y); g.lineTo(CANVAS_W / 2, y); }
                g.stroke();
            } else if (m.kind === 'manyfold_shadow') {
                if (m.points.length > 1) {
                    g.strokeColor = new Color(215, 185, 255, m.warn > 0 ? 100 : 220); g.lineWidth = m.warn > 0 ? 2 : 6;
                    for (let k = 1; k < m.points.length; k++) {
                        const [ax, ay] = this._toLocal(m.points[k - 1].x, m.points[k - 1].y), [bx, by] = this._toLocal(m.points[k].x, m.points[k].y);
                        g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
                    }
                }
            } else if (m.kind === 'manyfold_sectors') {
                const [x, y] = this._toLocal(boss.x, boss.y);
                for (let k = 0; k < 6; k++) {
                    const a0 = k * Math.PI / 3 - Math.PI, a1 = a0 + Math.PI / 3;
                    g.fillColor = k === m.safe ? new Color(82, 132, 145, 34) : new Color(183, 71, 255, 54 + Math.floor(pulse * 20));
                    g.moveTo(x, y); g.arc(x, y, 285, a0, a1, false); g.close(); g.fill();
                    g.strokeColor = k === m.safe ? new Color(110, 220, 230, 170) : new Color(218, 170, 255, 160);
                    g.lineWidth = 2; g.moveTo(x, y); g.lineTo(x + Math.cos(a0) * 285, y + Math.sin(a0) * 285); g.stroke();
                }
            } else if (m.kind === 'manyfold_boundary') {
                const q = m.progress ?? 0, ix = 128 * q, iy = 58 * q;
                const dead = m.nodes.filter((n: any) => !n.alive);
                const spans = (start: number, end: number, gaps: number[]): number[][] => {
                    let result: number[][] = [[start, end]];
                    for (const center of gaps) {
                        const lo = clamp(center - 75, start, end), hi = clamp(center + 75, start, end);
                        const next: number[][] = [];
                        for (const [a, b] of result) {
                            if (hi <= a || lo >= b) next.push([a, b]);
                            else {
                                if (lo - a > 1) next.push([a, lo]);
                                if (b - hi > 1) next.push([hi, b]);
                            }
                        }
                        result = next;
                    }
                    return result;
                };
                const strokeBoundary = (color: Color, width: number): void => {
                    g.strokeColor = color; g.lineWidth = width;
                    const draw = (ax: number, ay: number, bx: number, by: number): void => {
                        const [x0, y0] = this._toLocal(ax, ay), [x1, y1] = this._toLocal(bx, by);
                        g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
                    };
                    for (const [a, b] of spans(iy, PLAYFIELD_BOTTOM - iy, dead.filter((n: any) => n.edge === 'left').map((n: any) => n.y))) draw(ix, a, ix, b);
                    for (const [a, b] of spans(iy, PLAYFIELD_BOTTOM - iy, dead.filter((n: any) => n.edge === 'right').map((n: any) => n.y))) draw(CANVAS_W - ix, a, CANVAS_W - ix, b);
                    for (const [a, b] of spans(ix, CANVAS_W - ix, dead.filter((n: any) => n.edge === 'bottom').map((n: any) => n.x))) draw(a, iy, b, iy);
                    for (const [a, b] of spans(ix, CANVAS_W - ix, dead.filter((n: any) => n.edge === 'top').map((n: any) => n.x))) draw(a, PLAYFIELD_BOTTOM - iy, b, PLAYFIELD_BOTTOM - iy);
                };
                strokeBoundary(new Color(255, 75, 200, 80 + Math.floor(pulse * 80)), 12);
                strokeBoundary(new Color(214, 175, 255, 225), 5);
                // 已破镜针的位置用青色端点标出，明确告诉玩家这里是可穿越的安全口。
                g.strokeColor = new Color(100, 235, 255, 235); g.lineWidth = 4;
                for (const n of dead) {
                    const horizontal = n.edge === 'top' || n.edge === 'bottom';
                    for (const side of [-75, 75]) {
                        const wx = horizontal ? n.x + side : (n.edge === 'left' ? ix : CANVAS_W - ix);
                        const wy = horizontal ? (n.edge === 'bottom' ? iy : PLAYFIELD_BOTTOM - iy) : n.y + side;
                        const dx = horizontal ? 0 : (n.edge === 'left' ? 18 : -18);
                        const dy = horizontal ? (n.edge === 'bottom' ? 18 : -18) : 0;
                        const [x0, y0] = this._toLocal(wx, wy), [x1, y1] = this._toLocal(wx + dx, wy + dy);
                        g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
                    }
                }
            }
        }

        // 机制目标统一显示生命比例和材质符号；它们同时存在于真实子弹目标列表。
        for (const n of this._docBossTargets) if (n.alive) {
            const [x, y] = this._toLocal(n.x, n.y), ratio = clamp(n.hp / n.maxHp, 0, 1);
            const isVespa = n.kind.includes('vespa'), isMany = n.kind.includes('manyfold');
            g.fillColor = isVespa ? new Color(66, 145, 40, 180) : isMany ? new Color(73, 42, 105, 190) : new Color(95, 57, 31, 190);
            hex(x, y, n.radius + 4); g.fill();
            g.strokeColor = isVespa ? new Color(148, 255, 88, 245) : isMany ? new Color(210, 177, 255, 245) : new Color(255, 154, 64, 245);
            g.lineWidth = 2.5; hex(x, y, n.radius + 4); g.stroke();
            g.fillColor = new Color(15, 20, 28, 215); g.rect(x - 18, y - n.radius - 12, 36, 4); g.fill();
            g.fillColor = isVespa ? new Color(117, 255, 67, 245) : isMany ? new Color(196, 143, 255, 245) : new Color(255, 135, 42, 245);
            g.rect(x - 18, y - n.radius - 12, 36 * ratio, 4); g.fill();
        }
    }

    /** 从固定池绘制一张持续敌方技能贴图；只负责表现，不参与碰撞。 */
    private _placeEnemyArt(
        key: string, x: number, y: number, width: number, height = width,
        rotationDeg = 0, alpha = 255, tint = '#ffffff',
    ): void {
        const node = this._enemyArtPool.acquire();
        if (!node) return;
        node.getComponent(UITransform)!.setContentSize(Math.max(2, width), Math.max(2, height));
        const sprite = node.getComponent(Sprite)!;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        applyArtSprite(sprite, key);
        const color = Color.fromHEX(new Color(), tint);
        color.a = Math.max(0, Math.min(255, Math.round(alpha)));
        sprite.color = color;
        node.setPosition(Math.round(x), Math.round(y), 0);
        node.setScale(new Vec3(1, 1, 1));
        node.setRotationFromEuler(0, 0, rotationDeg);
    }

    private _drawEntities() {
        const g = this._gameGfx;
        g.clear();
        this._turretBasePool.releaseAll();
        this._turretBarrelPool.releaseAll();
        this._summonArtPool.releaseAll();
        this._enemyArtPool.releaseAll();

        // Background is now the _bgSprite layer (bg_chapter<N>, set in _updateBgForChapter()),
        // sitting behind _gameLayer — no more opaque fillRect here, or it would hide the art.
        if (!this._inCombat()) return;

        // Gold drops — 独立六边形金币Sprite + 翻面/漂浮动画；对象池避免掉落密集时GC。
        this._coinPool.releaseAll();
        const crowdedCoins = this._economy.drops.length > 48;
        for (const drop of this._economy.drops) {
            const [dx, dy] = this._toLocal(drop.x, drop.y);
            const coin = this._coinPool.acquire();
            if (!coin) continue;
            // 后期上百枚高亮金币会盖住近战角色与敌人轮廓。高密度时缩小远处
            // 金币并降低透明度，靠近玩家进入拾取关注区后恢复全亮。
            const nearPlayer = this._player && Vec.dist(drop.x, drop.y, this._player.x, this._player.y) < 150;
            const densityScale = crowdedCoins && !nearPlayer ? 0.78 : 1;
            const size = (25 + Math.min(9, drop.amount / 10)) * densityScale;
            coin.getComponent(UITransform)!.setContentSize(size, size);
            const sprite = coin.getComponent(Sprite)!;
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            applyArtSprite(sprite, 'ui_gold_coin');
            sprite.color = new Color(255, 255, 255, crowdedCoins && !nearPlayer ? 150 : 255);
            const bob = Math.sin(drop.age * 4.5) * 2.5;
            coin.setPosition(Math.round(dx), Math.round(dy + bob), 0);
            // X轴压缩模拟金币翻面，保持最窄仍有足够面积，不退化成黄色圆点。
            const flip = 0.55 + Math.abs(Math.cos(drop.age * 5.2)) * 0.45;
            coin.setScale(new Vec3(flip, 1, 1));
        }

        // Death zones
        for (const z of this._deathZones) {
            const [zx, zy] = this._toLocal(z.x, z.y);
            g.fillColor = new Color(200, 0, 0, 60);
            g.circle(zx, zy, z.r); g.fill();
            g.strokeColor = new Color(255, 68, 68, 200);
            g.lineWidth = 2; g.circle(zx, zy, z.r); g.stroke();
        }

        // Ice zones
        for (const z of this._iceZones) {
            const [zx, zy] = this._toLocal(z.x, z.y);
            g.fillColor = new Color(100, 180, 255, 30);
            g.circle(zx, zy, z.r); g.fill();
            g.strokeColor = new Color(136, 221, 255, 200);
            g.lineWidth = 2; g.circle(zx, zy, z.r); g.stroke();
        }

        // 测试房间水柱（深海恐惧·海之霸主）：蓝柱 + flash/shoot 白闪
        for (const z of this._pillars) {
            const [zx, zy] = this._toLocal(z.x, z.y);
            const flash = z.state !== 'idle' ? (Math.sin(this._visualTime * 8) * 0.5 + 0.5) : 0;
            g.fillColor = new Color(40, 140, 220, 60 + Math.floor(flash * 60));
            g.circle(zx, zy, z.r); g.fill();
            g.strokeColor = new Color(90, 200, 255, 190 + Math.floor(flash * 60));
            g.lineWidth = 3; g.circle(zx, zy, z.r); g.stroke();
            // 水柱内部高光
            g.fillColor = new Color(150, 230, 255, 90);
            g.circle(zx, zy - z.r * 0.15, z.r * 0.45); g.fill();
        }

        // 测试房间冰冻预告区（深海恐惧）：闪烁蓝圈，越临近越亮
        for (const z of this._telegraphZones) {
            const [zx, zy] = this._toLocal(z.x, z.y);
            const urgent = Math.max(0, z.timer / 3);
            const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 10);
            const alpha = Math.floor((60 + (1 - urgent) * 130) * (0.55 + 0.45 * pulse));
            g.fillColor = new Color(60, 150, 255, Math.floor(alpha * 0.4));
            g.circle(zx, zy, z.r); g.fill();
            g.strokeColor = new Color(140, 210, 255, alpha);
            g.lineWidth = 2.5; g.circle(zx, zy, z.r); g.stroke();
        }

        // 酸囊/焚芯咒仆地面危险区：毒囊带抛物线，火环由暗到亮后留下余烬。
        for (const z of this._enemyHazards) {
            const [zx, zy] = this._toLocal(z.x, z.y);
            if (z.kind === 'trap') {
                const progress = z.phase === 'telegraph' ? 1 - z.timer / z.telegraphMax : 1;
                const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 7 + z.x * 0.02);
                g.fillColor = new Color(120, 28, 22, z.phase === 'telegraph' ? 18 + Math.floor(progress * 32) : 54 + Math.floor(pulse * 18));
                g.circle(zx, zy, z.r); g.fill();
                g.strokeColor = new Color(255, 84, 65, z.phase === 'telegraph' ? 130 + Math.floor(progress * 120) : 225);
                g.lineWidth = z.phase === 'telegraph' ? 2 : 3;
                for (let tooth = 0; tooth < 6; tooth++) {
                    const a0 = tooth / 6 * Math.PI * 2;
                    const a1 = (tooth + 1) / 6 * Math.PI * 2;
                    const inner = z.r * (z.phase === 'telegraph' ? 0.58 + progress * 0.16 : 0.47);
                    g.moveTo(zx + Math.cos(a0) * z.r, zy + Math.sin(a0) * z.r);
                    g.lineTo(zx + Math.cos((a0 + a1) * 0.5) * inner, zy + Math.sin((a0 + a1) * 0.5) * inner);
                    g.lineTo(zx + Math.cos(a1) * z.r, zy + Math.sin(a1) * z.r);
                    g.stroke();
                }
                g.fillColor = new Color(255, 118, 80, 210);
                g.circle(zx, zy, 3 + pulse * 2); g.fill();
                this._placeEnemyArt('fx_enemy_web', zx, zy, z.r * 2.25, z.r * 2.25,
                    this._visualTime * 9, z.phase === 'telegraph' ? 82 + progress * 68 : 205);
                continue;
            }
            const acid = z.kind === 'acid';
            if (z.phase === 'telegraph') {
                const progress = 1 - z.timer / z.telegraphMax;
                g.fillColor = acid ? new Color(80, 220, 45, 22) : new Color(255, 75, 20, 20 + Math.floor(progress * 42));
                g.circle(zx, zy, z.r); g.fill();
                g.strokeColor = acid ? new Color(125, 255, 70, 220) : new Color(255, 145, 55, 155 + Math.floor(progress * 100));
                g.lineWidth = 2 + (acid ? 0 : progress * 2.5);
                for (let seg = 0; seg < 12; seg += 2) {
                    const a0 = seg / 12 * Math.PI * 2;
                    const a1 = (seg + 1) / 12 * Math.PI * 2;
                    g.arc(zx, zy, z.r, a0, a1, false); g.stroke();
                }
                if (acid) {
                    const t = progress;
                    const ox = z.fromX + (z.x - z.fromX) * t;
                    const oy = z.fromY + (z.y - z.fromY) * t - Math.sin(Math.PI * t) * 70;
                    const [px, py] = this._toLocal(ox, oy);
                    const [fx, fy] = this._toLocal(z.fromX, z.fromY);
                    const fd = Math.hypot(zx - fx, zy - fy) || 1;
                    const ux = (zx - fx) / fd, uy = (zy - fy) / fd;
                    const sx = -uy, sy = ux;
                    // 飞行态是有朝向的囊状毒弹，避免和落地危险区同为绿色圆圈。
                    g.fillColor = new Color(65, 155, 24, 95);
                    g.moveTo(px + ux * 13, py + uy * 13);
                    g.lineTo(px + sx * 8, py + sy * 8);
                    g.lineTo(px - ux * 10 + sx * 4, py - uy * 10 + sy * 4);
                    g.lineTo(px - ux * 15, py - uy * 15);
                    g.lineTo(px - ux * 10 - sx * 4, py - uy * 10 - sy * 4);
                    g.lineTo(px - sx * 8, py - sy * 8); g.close(); g.fill();
                    g.strokeColor = new Color(200, 255, 110, 235); g.lineWidth = 2;
                    g.moveTo(px + ux * 12, py + uy * 12);
                    g.lineTo(px + sx * 7, py + sy * 7);
                    g.lineTo(px - ux * 12, py - uy * 12);
                    g.lineTo(px - sx * 7, py - sy * 7); g.close(); g.stroke();
                    g.fillColor = new Color(218, 255, 126, 230);
                    g.circle(px + ux * 5 + sx * 2, py + uy * 5 + sy * 2, 3); g.fill();
                    g.fillColor = new Color(122, 235, 50, 150);
                    g.circle(px - ux * 19 + sx * 2, py - uy * 19 + sy * 2, 2.5); g.fill();
                    this._placeEnemyArt('fx_enemy_toxic', px, py, 42, 27,
                        -Math.atan2(z.y - z.fromY, z.x - z.fromX) * 180 / Math.PI, 235);
                } else {
                    for (let k = 0; k < 6; k++) {
                        const a = k / 6 * Math.PI * 2 + this._visualTime * 0.35;
                        g.strokeColor = new Color(255, 180, 70, 120 + Math.floor(progress * 120));
                        g.lineWidth = 1.5;
                        g.moveTo(zx + Math.cos(a) * 14, zy + Math.sin(a) * 14);
                        g.lineTo(zx + Math.cos(a) * (z.r - 6), zy + Math.sin(a) * (z.r - 6)); g.stroke();
                    }
                }
            } else {
                const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 3.5 + z.x * 0.01);
                if (acid) {
                    // 落地态使用不规则腐蚀滩轮廓，与飞行囊弹形成材质和形状差异。
                    const puddlePoint = (i: number, inner = false) => {
                        const a = i / 14 * Math.PI * 2 - 0.18;
                        const jag = i % 2 === 0 ? 1 : 0.78;
                        const rr = z.r * jag * (inner ? 0.56 : 1) * (0.97 + Math.sin(i * 4.1 + z.x) * 0.04);
                        return [zx + Math.cos(a) * rr, zy + Math.sin(a) * rr] as [number, number];
                    };
                    const [x0, y0] = puddlePoint(0);
                    g.fillColor = new Color(40, 118, 18, 70 + Math.floor(pulse * 28));
                    g.moveTo(x0, y0);
                    for (let i = 1; i < 14; i++) { const [x, y] = puddlePoint(i); g.lineTo(x, y); }
                    g.close(); g.fill();
                    g.strokeColor = new Color(128, 238, 62, 170 + Math.floor(pulse * 65));
                    g.lineWidth = 2.4; g.moveTo(x0, y0);
                    for (let i = 1; i < 14; i++) { const [x, y] = puddlePoint(i); g.lineTo(x, y); }
                    g.close(); g.stroke();
                    const [ix0, iy0] = puddlePoint(0, true);
                    g.fillColor = new Color(166, 225, 62, 34 + Math.floor(pulse * 22));
                    g.moveTo(ix0, iy0);
                    for (let i = 1; i < 14; i++) { const [x, y] = puddlePoint(i, true); g.lineTo(x, y); }
                    g.close(); g.fill();
                    this._placeEnemyArt('fx_enemy_toxic', zx, zy, z.r * 2.15, z.r * 2.15,
                        this._visualTime * 7, 82 + pulse * 32);
                } else {
                    g.fillColor = new Color(125, 45, 15, 48 + Math.floor(pulse * 26));
                    g.circle(zx, zy, z.r); g.fill();
                    g.strokeColor = new Color(255, 105, 35, 135 + Math.floor(pulse * 70));
                    g.lineWidth = 2; g.circle(zx, zy, z.r); g.stroke();
                    this._placeEnemyArt('fx_enemy_ember_brand', zx, zy, z.r * 2.2, z.r * 2.2,
                        this._visualTime * -5, 150 + pulse * 55);
                }
                for (let bubble = 0; bubble < 5; bubble++) {
                    const a = bubble * 2.399 + z.x * 0.013;
                    const br = z.r * (0.2 + bubble * 0.11);
                    g.fillColor = acid ? new Color(170, 255, 80, 80 + bubble * 15) : new Color(255, 150, 55, 75 + bubble * 13);
                    g.circle(zx + Math.cos(a) * br, zy + Math.sin(a) * br, 2 + (bubble % 2)); g.fill();
                }
            }
        }

        // 三相祭司晶墙：预警为细长虚框，启动后变成可碰撞的冰晶实体。
        for (const w of this._priestWalls) {
            const [wx, wy] = this._toLocal(w.x, w.y);
            const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 8 + w.y * 0.02);
            g.fillColor = new Color(90, 205, 255, w.warn > 0 ? 18 + Math.floor(pulse * 16) : 72);
            g.moveTo(wx - w.r, wy - w.halfH); g.lineTo(wx + w.r, wy - w.halfH + 12);
            g.lineTo(wx + w.r, wy + w.halfH - 12); g.lineTo(wx - w.r, wy + w.halfH); g.close(); g.fill();
            g.strokeColor = new Color(175, 238, 255, w.warn > 0 ? 125 + Math.floor(pulse * 80) : 235);
            g.lineWidth = w.warn > 0 ? 1.8 : 3.2;
            g.moveTo(wx - w.r, wy - w.halfH); g.lineTo(wx + w.r, wy - w.halfH + 12);
            g.lineTo(wx + w.r, wy + w.halfH - 12); g.lineTo(wx - w.r, wy + w.halfH); g.close(); g.stroke();
        }

        // 雷相导体与真实三角电网；节点生命越低，内核越暗。
        for (const group of this._triuneNetworks) {
            if (group.dead) continue;
            if (group.activeIn <= 0) {
                const arcPulse = 0.5 + 0.5 * Math.sin(this._visualTime * 13);
                g.strokeColor = new Color(202, 247, 255, 155 + Math.floor(arcPulse * 90));
                g.lineWidth = 3 + arcPulse * 1.5;
                for (let edge = 0; edge < 3; edge++) {
                    const a = group.nodes[edge], b = group.nodes[(edge + 1) % 3];
                    const [ax, ay] = this._toLocal(a.x, a.y), [bx, by] = this._toLocal(b.x, b.y);
                    g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
                }
            }
            for (const n of group.nodes) if (n.alive) {
                const [nx, ny] = this._toLocal(n.x, n.y);
                const ratio = Math.max(0, n.hp / n.maxHp);
                g.fillColor = new Color(45, 100, 125, 105); g.circle(nx, ny, 16); g.fill();
                g.strokeColor = new Color(205, 250, 255, 160 + Math.floor(ratio * 90)); g.lineWidth = 2.5;
                for (let side = 0; side < 6; side++) {
                    const a0 = side / 6 * Math.PI * 2, a1 = (side + 1) / 6 * Math.PI * 2;
                    g.moveTo(nx + Math.cos(a0) * 16, ny + Math.sin(a0) * 16);
                    g.lineTo(nx + Math.cos(a1) * 16, ny + Math.sin(a1) * 16); g.stroke();
                }
                g.fillColor = new Color(220, 255, 255, 105 + Math.floor(ratio * 145)); g.circle(nx, ny, 5 + ratio * 3); g.fill();
            }
        }

        // 磁轨回转锯：轨道在0.75秒预警期间完整可见，随后只保留低亮路径与实体锯片。
        for (const s of this._railSaws) {
            const [cx, cy] = this._toLocal(s.cx, s.cy);
            const warning = s.warn > 0;
            g.strokeColor = new Color(255, 151, 48, warning ? 215 : 65);
            g.lineWidth = warning ? 2.4 : 1.3;
            for (let seg = 0; seg < 24; seg += 2) {
                const a0 = seg / 24 * Math.PI * 2, a1 = (seg + 1) / 24 * Math.PI * 2;
                g.moveTo(cx + Math.cos(a0) * 145, cy + Math.sin(a0) * 80);
                g.lineTo(cx + Math.cos(a1) * 145, cy + Math.sin(a1) * 80); g.stroke();
            }
            if (!warning) {
                const [sx, sy] = this._toLocal(s.x, s.y);
                const spin = this._visualTime * 18 * s.dir;
                g.fillColor = new Color(105, 42, 12, 210); g.circle(sx, sy, 18); g.fill();
                g.strokeColor = new Color(255, 171, 54, 245); g.lineWidth = 3;
                for (let tooth = 0; tooth < 8; tooth++) {
                    const a = spin + tooth * Math.PI / 4;
                    g.moveTo(sx + Math.cos(a) * 10, sy + Math.sin(a) * 10);
                    g.lineTo(sx + Math.cos(a) * 22, sy + Math.sin(a) * 22); g.stroke();
                }
                g.fillColor = new Color(255, 219, 122, 245); g.circle(sx, sy, 5); g.fill();
                this._placeEnemyArt('fx_enemy_saw', sx, sy, 52, 52,
                    -spin * 180 / Math.PI, 245);
            }
        }

        this._drawDocBossMechanics(g);

        // Turrets / clones — 用明确的底座、炮管和朝向替代“蓝色圆圈占位”。
        for (const t of this._turrets) {
            if (!t.alive) continue;
            // 时空切割突刺序列：无实体渲染，玩家本体的位移就是表现
            if (t.kind === 'alphaStrike') continue;
            const [tx, ty] = this._toLocal(t.x, t.y);
            const r = t.r ?? 10;
            g.fillColor = new Color(0, 0, 0, 100);
            g.ellipse(tx, ty - r * 0.72, r * 1.15, r * 0.34); g.fill();

            // 水分身蓄力时仍保留冲锋方向线；身体本身由深海恐惧的逐帧动作绘制。
            if (t.kind === 'waterClone' && t._phase === 'windup') {
                g.strokeColor = new Color(140, 225, 255, 170);
                g.lineWidth = 2;
                g.moveTo(tx, ty);
                g.lineTo(tx + Math.cos(t._aim ?? 0) * 70, ty - Math.sin(t._aim ?? 0) * 70);
                g.stroke();
            }

            if (t._actorAnimation?.clip && t._actorAnimation.currentFrame) {
                const summon = this._summonArtPool.acquire();
                if (!summon) continue;
                summon.getComponent(UITransform)!.setContentSize(t._actorDisplaySize, t._actorDisplaySize);
                const sprite = summon.getComponent(Sprite)!;
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.trim = false;
                applyAnimationFrame(sprite, t._actorAnimation.clip, t._actorAnimation.currentFrame);
                const tint = Color.fromHEX(new Color(), t._actorTint ?? '#ffffff');
                tint.a = t._actorAlpha ?? 255;
                sprite.color = tint;
                summon.setPosition(Math.round(tx), Math.round(ty), 0);
                const facing = t._actorFacingPose;
                const scale = t._actorAnimation.clip.displayScale ?? 1;
                summon.setScale(new Vec3(
                    (facing?.mirror ?? 1) * (facing?.turnScaleX ?? 1) * scale,
                    scale,
                    1,
                ));
                summon.setRotationFromEuler(0, 0, facing?.turnLeanDeg ?? 0);
                continue;
            }

            if (t.kind === 'timeOrb') {
                // 时空行者·时空奇点能量球：蓝白光球 + 呼吸光环
                g.fillColor = new Color(170, 221, 255, 150);
                g.circle(tx, ty, r); g.fill();
                g.strokeColor = new Color(220, 240, 255, 230);
                g.lineWidth = 2.5; g.circle(tx, ty, r); g.stroke();
                g.strokeColor = new Color(170, 221, 255, 120);
                g.lineWidth = 1.5;
                g.circle(tx, ty, r + 8 + Math.sin(this._visualTime * 6) * 4); g.stroke();
                continue;
            }

            // 炮台按“固定俯视底座 + 独立旋转炮筒”拆层。底座不旋转、不漂浮，
            // 只有炮筒跟随瞄准角，避免3/4视角整座玩具在地面打转的违和感。
            const base = this._turretBasePool.acquire();
            const barrel = this._turretBarrelPool.acquire();
            if (!base || !barrel) {
                if (base) this._turretBasePool.release(base);
                if (barrel) this._turretBarrelPool.release(barrel);
                continue;
            }
            const tint = t.kind === 'orbitTurret'
                ? new Color(195, 245, 255, 255)
                : new Color(255, 255, 255, 255);
            const baseSize = t.kind === 'orbitTurret' ? 34 : 52;
            const barrelW = t.kind === 'orbitTurret' ? 48 : 72;
            const barrelH = t.kind === 'orbitTurret' ? 32 : 48;

            const baseSp = base.getComponent(Sprite)!;
            baseSp.sizeMode = Sprite.SizeMode.CUSTOM;
            baseSp.trim = false;
            baseSp.color = tint;
            applyArtSprite(baseSp, 'turret_base_vivian');
            base.getComponent(UITransform)!.setContentSize(baseSize, baseSize);
            base.setPosition(Math.round(tx), Math.round(ty), 0);

            const barrelSp = barrel.getComponent(Sprite)!;
            barrelSp.sizeMode = Sprite.SizeMode.CUSTOM;
            barrelSp.trim = false;
            barrelSp.color = tint;
            const turretClip = EFFECT_ANIMATIONS.fx_turret_barrel_fire;
            const fireElapsed = Math.max(0, 0.18 - (t._fireAnimT ?? 0));
            const fireIndex = t._fireAnimT > 0 ? Math.min(3, 1 + Math.floor(fireElapsed / 0.06)) : 0;
            applyAnimationFrame(barrelSp, turretClip, turretClip.frames[fireIndex]);
            const barrelTransform = barrel.getComponent(UITransform)!;
            barrelTransform.setContentSize(barrelW, barrelH);
            // 生成图的机械枢轴位于原画宽度约36%，把锚点放到枢轴后旋转时
            // 炮管围绕底座中心转动，而不是围绕图片几何中心公转。
            barrelTransform.setAnchorPoint(0.36, 0.5);
            barrel.setPosition(Math.round(tx), Math.round(ty), 0);
            barrel.setRotationFromEuler(0, 0, -(t._aim ?? 0) * 180 / Math.PI);
        }

        // 尸体不参与下方活体条/攻击预警绘制，也不会再执行AI。
        for (const entry of this._corpses.entries) {
            const e = entry.actor, clip = e.actorAnimation.clip, frame = e.actorAnimation.currentFrame;
            if (!e.node || !e.sprite || !clip || !frame) continue;
            applyAnimationFrame(e.sprite, clip, frame);
            const [x, y] = this._toLocal(e.x, e.y);
            e.node.setPosition(x, y, 0);
            const scale = clip.displayScale ?? 1;
            e.node.setScale(new Vec3(e.animationMirror * scale, scale, 1));
            e.node.setRotationFromEuler(0, 0, 0);
            e.sprite.color = new Color(255, 255, 255, Math.round(entry.alpha * 255));
        }

        // Enemies — Sprite node carries the visual, Graphics only draws the HP bar
        // and the hit-flash overlay (flashTimer, previously a dead field, now used here).
        for (const e of this._enemies) {
            if (e.dead) continue;
            const r = e.radius ?? 18;
            const visualR = r * (e.visualScale ?? 1);
            // 贴图、阴影与碰撞共用同一逻辑根。场外出生必须保留真实位置。
            const [ex, ey] = this._toLocal(e.x, e.y);
            const showGuides = this.state === 'testRoom' && this._testVisualGuides;
            if (showGuides) {
                g.strokeColor = new Color(65, 245, 232, 210);
                g.lineWidth = 1;
                g.circle(ex, ey, r); g.stroke();
                g.moveTo(ex - 7, ey); g.lineTo(ex + 7, ey);
                g.moveTo(ex, ey - 7); g.lineTo(ex, ey + 7); g.stroke();
            }
            // 方向动作帧：距离驱动步态 + 脸始终朝向玩家（远程怪后撤/Boss横移不背对）
            const walkPose = advanceLocomotion(
                e.locomotion, e.x, e.y, this._visualDt, visualR * 2, e.locomotionKind,
            );
            const [faceDx, faceDy] = e.getVisualFacing(
                this._player, walkPose.directionX, walkPose.directionY,
            );
            const facingPose = updateDirectionalFacing(
                e.directionalFacing, faceDx, faceDy, this._visualDt,
            );

            // 隐身（毒刺鬼水母）/机械高达飞空：贴图淡出时阴影与血条一并隐藏，
            // 否则地上仍留实影、头顶仍飘血条，看起来"实体还在"
            const hidden = e.invisible || (e instanceof BossController && e.mechSkyT > 0);
            // 常驻圆形底盘/描边会让所有单位像棋子。改为低矮接触阴影，只负责
            // 把脚底从背景纹理中分离；危险圆环仅在攻击前摇期间出现。
            if (!hidden) {
                g.fillColor = new Color(0, 0, 0, e.isBoss ? 125 : 88);
                g.ellipse(
                    ex, ey - visualR * 0.72,
                    visualR * (e.isBoss ? 0.72 : 0.62) * walkPose.shadowScale,
                    visualR * 0.18 * walkPose.shadowScale,
                ); g.fill();
            }
            this._syncDirectionalFrame(e, walkPose, facingPose);

            let bodyX = ex, bodyY = ey;
            if (e.node && e.actorAnimation.clip) {
                e.node.setPosition(ex, ey, 0);
                const scale = e.actorAnimation.clip.displayScale ?? 1;
                e.node.setScale(new Vec3(e.animationMirror * scale, scale, 1));
                e.node.setRotationFromEuler(0, 0, 0);
            } else if (e.node) {
                const singleSpriteSway = e.directionalFrames ? 0 : walkPose.footSwing * visualR * 0.045;
                const recoil = Math.sin(Math.min(1, e.actionRecoil / 0.24) * Math.PI) * visualR * 0.10;
                const windupProgress = e.attackWindup > 0 && e.attackWindupMax > 0
                    ? 1 - e.attackWindup / e.attackWindupMax : 0;
                const windupPull = Math.sin(windupProgress * Math.PI * 0.5) * visualR * 0.07;
                const pose = entityVisualPose(e.x, e.y, faceDx, faceDy,
                    walkPose.bodyLift, recoil + windupPull, singleSpriteSway);
                bodyX = Math.round(pose.x); bodyY = Math.round(pose.y);
                e.node.setPosition(bodyX, bodyY, 0);
                const facing = facingPose.mirror;
                e.node.setScale(new Vec3(
                    facing * facingPose.turnScaleX * walkPose.bodyScaleX * (1 - windupProgress * 0.035),
                    walkPose.bodyScaleY * (1 + windupProgress * 0.055),
                    1,
                ));
                e.node.setRotationFromEuler(
                    0, 0, walkPose.bodyRollDeg * facing + facingPose.turnLeanDeg +
                        (e.directionalFrames ? 0 : walkPose.footSwing * 1.25) - faceDx * recoil * 0.12,
                );
            }

            // 持续护盾不是第二条血条：用低透明能量壳让玩家在未攻击前就能
            // 识别护盾兵，同时以断续旋转弧避免重新套回“棋子圆底盘”的廉价感。
            if (e.shieldActive && e.shieldHp > 0 && e.maxShieldHp > 0) {
                const shieldRatio = Math.max(0, Math.min(1, e.shieldHp / e.maxShieldHp));
                const shieldR = visualR + 8;
                const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 4.2 + e.x * 0.01);
                g.fillColor = new Color(60, 145, 255, 12 + Math.floor(12 * shieldRatio));
                g.circle(ex, ey, shieldR); g.fill();
                g.strokeColor = new Color(105, 190, 255, 105 + Math.floor(70 * pulse));
                g.lineWidth = 1.5 + shieldRatio;
                g.circle(ex, ey, shieldR); g.stroke();
                const spin = this._visualTime * 0.7;
                g.strokeColor = new Color(205, 238, 255, 165 + Math.floor(55 * pulse));
                g.lineWidth = 2.4;
                for (let seg = 0; seg < 3; seg++) {
                    const start = spin + seg * Math.PI * 2 / 3;
                    g.arc(ex, ey, shieldR + 2, start, start + 0.52, false); g.stroke();
                }
            }

            // 普通怪/Boss接触攻击前摇：红橙危险区 + 锁定方向线。
            // attackWindup 从 max 倒数到0，环形进度会逐渐收紧并增强亮度。
            if (e.attackWindup > 0 && e.attackWindupMax > 0) {
                const progress = 1 - e.attackWindup / e.attackWindupMax;
                const dangerR = r + 13 - progress * 5;
                const warning = e.type === 'exploder'
                    ? new Color(255, 150, 25, 255)
                    : new Color(255, 55, 45, 255);
                const [tx, ty] = this._toLocal(e.attackTargetX, e.attackTargetY);
                if (e.type === 'rust_biter') {
                    // 锈齿扑兵：0.28秒小扇形明确表达扑击方向与可横移躲避的边界。
                    const aim = Math.atan2(ty - ey, tx - ex);
                    const fanR = 58;
                    const half = 0.58;
                    g.fillColor = new Color(255, 45, 30, 38 + Math.floor(progress * 70));
                    g.moveTo(ex, ey);
                    g.arc(ex, ey, fanR, aim - half, aim + half, false);
                    g.close(); g.fill();
                    g.strokeColor = new Color(255, 105, 60, 185 + Math.floor(progress * 70));
                    g.lineWidth = 2 + progress * 2.5;
                    g.moveTo(ex, ey);
                    g.arc(ex, ey, fanR, aim - half, aim + half, false);
                    g.close(); g.stroke();
                } else if (e.type === 'rivet_beast' || (e.type === 'chain_hound' && e.miniSkillState === 'chain_charge')) {
                    // 铆甲兽：宽走廊比圆形危险圈更准确表达100px冲撞与55px击退。
                    const aim = Math.atan2(ty - ey, tx - ex);
                    const ux = Math.cos(aim), uy = Math.sin(aim);
                    const px = -uy, py = ux;
                    const hound = e.type === 'chain_hound';
                    const len = hound ? 390 : 132, halfW = hound ? 30 : 25;
                    const x1 = ex + px * halfW, y1 = ey + py * halfW;
                    const x2 = ex - px * halfW, y2 = ey - py * halfW;
                    const x3 = ex + ux * len - px * halfW, y3 = ey + uy * len - py * halfW;
                    const x4 = ex + ux * len + px * halfW, y4 = ey + uy * len + py * halfW;
                    g.fillColor = hound
                        ? new Color(255, 55, 42, 28 + Math.floor(progress * 72))
                        : new Color(105, 205, 255, 30 + Math.floor(progress * 65));
                    g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4); g.close(); g.fill();
                    g.strokeColor = hound
                        ? new Color(255, 126, 92, 170 + Math.floor(progress * 85))
                        : new Color(190, 238, 255, 170 + Math.floor(progress * 85));
                    g.lineWidth = 2 + progress * 3;
                    g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4); g.close(); g.stroke();
                } else {
                    g.fillColor = new Color(warning.r, warning.g, warning.b, 28 + Math.floor(progress * 55));
                    g.circle(ex, ey, dangerR + 10); g.fill();
                    g.strokeColor = new Color(warning.r, warning.g, warning.b, 170 + Math.floor(progress * 85));
                    g.lineWidth = 2.5 + progress * 2.5;
                    g.circle(ex, ey, dangerR); g.stroke();
                    g.strokeColor = new Color(255, 235, 210, 150 + Math.floor(progress * 100));
                    g.lineWidth = 1.5 + progress;
                    g.moveTo(ex, ey); g.lineTo(tx, ty); g.stroke();
                }
            }

            if (e.type === 'prism_snail' && (e.miniSkillState === 'prism_windup' || e.miniSkillState === 'prism_sweep')) {
                const sweeping = e.miniSkillState === 'prism_sweep';
                const progress = sweeping ? 1 - e.miniSkillTimer / Math.max(0.01, e.miniSkillMax) : 0;
                const worldAngle = e.miniSkillAngle + (-75 + 150 * progress) * Math.PI / 180;
                const [beamX, beamY] = this._toLocal(e.x + Math.cos(worldAngle) * 900, e.y + Math.sin(worldAngle) * 900);
                const aim = Math.atan2(beamY - ey, beamX - ex);
                const ux = Math.cos(aim), uy = Math.sin(aim), px = -uy, py = ux;
                const halfW = sweeping ? 14 : 8;
                const alpha = sweeping ? 105 : 38 + Math.floor((1 - e.miniSkillTimer / Math.max(0.01, e.miniSkillMax)) * 52);
                g.fillColor = new Color(125, 225, 255, alpha);
                g.moveTo(ex + px * halfW, ey + py * halfW);
                g.lineTo(ex - px * halfW, ey - py * halfW);
                g.lineTo(ex + ux * 900 - px * halfW, ey + uy * 900 - py * halfW);
                g.lineTo(ex + ux * 900 + px * halfW, ey + uy * 900 + py * halfW);
                g.close(); g.fill();
                g.strokeColor = new Color(220, 250, 255, sweeping ? 245 : 175);
                g.lineWidth = sweeping ? 3.5 : 1.8;
                g.moveTo(ex, ey); g.lineTo(ex + ux * 900, ey + uy * 900); g.stroke();
            }
            if (e.type === 'prism_snail' && e.miniSkillState === 'prism_shell') {
                const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 8);
                g.strokeColor = new Color(255, 244, 202, 175 + Math.floor(pulse * 75));
                g.lineWidth = 4;
                const shellR = visualR + 11;
                for (let side = 0; side < 6; side++) {
                    const a0 = side / 6 * Math.PI * 2 + Math.PI / 6;
                    const a1 = (side + 1) / 6 * Math.PI * 2 + Math.PI / 6;
                    g.moveTo(ex + Math.cos(a0) * shellR, ey + Math.sin(a0) * shellR);
                    g.lineTo(ex + Math.cos(a1) * shellR, ey + Math.sin(a1) * shellR); g.stroke();
                }
            }

            if (e.type === 'triune_priest' && e.miniSkillState !== '') {
                const phase = e.miniSkillPhase ?? 0;
                const col = phase === 0 ? new Color(255, 139, 55, 245)
                    : phase === 1 ? new Color(142, 234, 255, 245) : new Color(216, 247, 255, 245);
                const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 10);
                const coreY = ey + (phase - 1) * visualR * 0.44;
                g.fillColor = new Color(col.r, col.g, col.b, 30 + Math.floor(pulse * 35));
                g.circle(ex, coreY, 11 + pulse * 5); g.fill();
                g.strokeColor = col; g.lineWidth = 2.5 + pulse * 1.5;
                g.circle(ex, coreY, 10 + pulse * 3); g.stroke();
            }

            if (e.type === 'rail_butcher' && e.miniSkillState === 'rail_windup') {
                const [endX, endY] = this._toLocal(e.x + Math.cos(e.miniSkillAngle) * 1400, e.y + Math.sin(e.miniSkillAngle) * 1400);
                const aim = Math.atan2(endY - ey, endX - ex), ux = Math.cos(aim), uy = Math.sin(aim);
                const px = -uy, py = ux, halfW = 27;
                const progress = 1 - e.miniSkillTimer / Math.max(0.01, e.miniSkillMax);
                g.fillColor = new Color(255, 45, 177, 26 + Math.floor(progress * 72));
                g.moveTo(ex + px * halfW, ey + py * halfW); g.lineTo(ex - px * halfW, ey - py * halfW);
                g.lineTo(ex + ux * 1400 - px * halfW, ey + uy * 1400 - py * halfW);
                g.lineTo(ex + ux * 1400 + px * halfW, ey + uy * 1400 + py * halfW); g.close(); g.fill();
                g.strokeColor = new Color(255, 111, 207, 175 + Math.floor(progress * 80)); g.lineWidth = 2 + progress * 3;
                g.moveTo(ex, ey); g.lineTo(ex + ux * 1400, ey + uy * 1400); g.stroke();
            } else if (e.type === 'rail_butcher' && e.miniSkillState === 'rail_drag') {
                const [px, py] = this._toLocal(this._player.x, this._player.y);
                const a = Math.atan2(ey - py, ex - px), ux = Math.cos(a), uy = Math.sin(a);
                const warned = e.miniSkillTimer > 1.8;
                g.strokeColor = new Color(102, 190, 255, warned ? 225 : 150); g.lineWidth = warned ? 3.5 : 2.5;
                g.moveTo(px, py); g.lineTo(ex, ey); g.stroke();
                for (let arrow = 0; arrow < 3; arrow++) {
                    const d = 50 + arrow * 45, ax = px + ux * d, ay = py + uy * d;
                    g.moveTo(ax, ay); g.lineTo(ax - ux * 13 - uy * 7, ay - uy * 13 + ux * 7);
                    g.moveTo(ax, ay); g.lineTo(ax - ux * 13 + uy * 7, ay - uy * 13 - ux * 7); g.stroke();
                }
            }

            if (e.type === 'bell_devourer' && e.miniSkillState === 'bell_rings') {
                const elapsed = e.miniSkillMax - Math.max(0, e.miniSkillTimer);
                const phase = Math.min(5, Math.floor(elapsed / 0.32));
                const ringR = (elapsed - phase * 0.32) * 360;
                const gap = (phase % 2) * Math.PI / 3 + phase * Math.PI / 3;
                const halfGap = 0.34;
                g.strokeColor = new Color(255, 240, 166, 225); g.lineWidth = 5;
                g.arc(ex, ey, Math.max(2, ringR), gap + halfGap, gap + Math.PI * 2 - halfGap, false); g.stroke();
                g.strokeColor = new Color(181, 131, 216, 90); g.lineWidth = 10;
                g.arc(ex, ey, Math.max(2, ringR), gap + halfGap, gap + Math.PI * 2 - halfGap, false); g.stroke();
                this._placeEnemyArt('fx_enemy_bell_wave', ex, ey, Math.max(28, ringR * 2.1), Math.max(28, ringR * 2.1),
                    gap * 180 / Math.PI, 150);
            }
            if (e.type === 'bell_devourer' && (e.miniSkillState === 'bell_echo_warn' || e.miniSkillState === 'bell_echo_play')) {
                const points = e.miniPoints ?? [];
                g.strokeColor = new Color(189, 115, 255, e.miniSkillState === 'bell_echo_warn' ? 190 : 245);
                g.lineWidth = e.miniSkillState === 'bell_echo_warn' ? 3 : 7;
                for (let i = 1; i < points.length; i++) {
                    const [x0, y0] = this._toLocal(points[i - 1].x, points[i - 1].y);
                    const [x1, y1] = this._toLocal(points[i].x, points[i].y);
                    g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
                }
            }
            if (e.type === 'bell_devourer' && e.miniSkillState === 'bell_silence') {
                const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 4);
                g.fillColor = new Color(68, 35, 91, 34 + Math.floor(pulse * 18)); g.circle(ex, ey, 165); g.fill();
                g.strokeColor = new Color(255, 240, 166, 175 + Math.floor(pulse * 70)); g.lineWidth = 3.5;
                for (let side = 0; side < 6; side++) {
                    const a0 = side / 6 * Math.PI * 2 + Math.PI / 6;
                    const a1 = (side + 1) / 6 * Math.PI * 2 + Math.PI / 6;
                    g.moveTo(ex + Math.cos(a0) * 165, ey + Math.sin(a0) * 165);
                    g.lineTo(ex + Math.cos(a1) * 165, ey + Math.sin(a1) * 165); g.stroke();
                }
            }
            if (e.type === 'bell_devourer' && e.miniSkillState === 'bell_counter') {
                const ratio = Math.max(0, e.bellAbsorbHp / 300);
                const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 9);
                const size = visualR * (2.35 + pulse * 0.16);
                this._placeEnemyArt('fx_enemy_bell_wave', ex, ey, size, size,
                    this._visualTime * 18, 145 + pulse * 70);
                g.strokeColor = new Color(255, 240, 166, 185 + Math.floor(pulse * 60));
                g.lineWidth = 3.5;
                g.arc(ex, ey, visualR + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false); g.stroke();
            }
            if (e.type === 'bell_devourer' && e.miniSkillState === 'bell_counter_release') {
                const elapsed = e.miniSkillMax - Math.max(0, e.miniSkillTimer);
                const phase = Math.floor(elapsed / 0.34);
                if (phase >= 0 && phase < e.bellCounterWaves) {
                    const ringR = (elapsed - phase * 0.34) * 390;
                    this._placeEnemyArt('fx_enemy_bell_wave', ex, ey, Math.max(30, ringR * 2.1), Math.max(30, ringR * 2.1),
                        phase * 37, 205);
                    g.strokeColor = new Color(255, 240, 166, 215); g.lineWidth = 4;
                    g.circle(ex, ey, Math.max(2, ringR)); g.stroke();
                }
            }

            if (e.type === 'rivet_beast') {
                // 正面120°装甲扇面：蓝白=减伤有效，碎裂灰=撞墙后的侧后方输出窗口。
                const aim = Math.atan2(e.combatFacingY, e.combatFacingX);
                const active = e.frontGuardBroken <= 0;
                g.strokeColor = active ? new Color(175, 230, 255, 205) : new Color(125, 132, 140, 120);
                g.lineWidth = active ? 3.2 : 1.5;
                g.arc(ex, ey, visualR + 7, aim - Math.PI / 3, aim + Math.PI / 3, false); g.stroke();
            } else if (e.type === 'gold_scavenger') {
                // 极短金色足迹仅用于传达逃跑速度；能量色不覆盖暗铜主体。
                const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 15 + e.x * 0.02);
                g.strokeColor = new Color(255, 205, 70, 80 + Math.floor(pulse * 90));
                g.lineWidth = 2;
                const bx = ex - e.combatFacingX * (visualR + 5);
                const by = ey - e.combatFacingY * (visualR + 5);
                g.moveTo(bx, by); g.lineTo(bx - e.combatFacingX * 13, by - e.combatFacingY * 13); g.stroke();
            } else if (e.type === 'arc_leech') {
                for (const linked of e.arcLinks || []) {
                    if (!linked.alive) continue;
                    const [lx, ly] = this._toLocal(linked.x, linked.y);
                    const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 13 + linked.x * 0.03);
                    g.strokeColor = new Color(90, 235, 255, 105 + Math.floor(pulse * 105));
                    g.lineWidth = 2.2;
                    g.moveTo(ex, ey); g.lineTo((ex + lx) * 0.5 + Math.sin(this._visualTime * 19) * 6, (ey + ly) * 0.5); g.lineTo(lx, ly); g.stroke();
                }
            } else if (e.type === 'blast_tick' && e.blastCountdown > 0) {
                const progress = 1 - e.blastCountdown / Math.max(0.01, e.blastCountdownMax);
                const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * (10 + progress * 18));
                g.fillColor = new Color(255, 75, 20, 22 + Math.floor(progress * 48));
                g.circle(ex, ey, 92); g.fill();
                g.strokeColor = new Color(255, 175, 70, 170 + Math.floor(pulse * 85));
                g.lineWidth = 2.5 + progress * 4;
                g.circle(ex, ey, 92); g.stroke();
            }

            if (e.rangedAimWindup > 0 && e.rangedAimWindupMax > 0) {
                const progress = 1 - e.rangedAimWindup / e.rangedAimWindupMax;
                const [tx, ty] = this._toLocal(e.rangedAimTargetX, e.rangedAimTargetY);
                if (e.type === 'frost_acolyte') {
                    // 冰棱侍从：三条低饱和冰蓝射界提前展开，与断针射手的黄色校射点形成明确语义区分。
                    const center = Math.atan2(ty - ey, tx - ex);
                    for (const off of [-0.16, 0, 0.16]) {
                        const a = center + off;
                        const len = 620;
                        const lx = ex + Math.cos(a) * len;
                        const ly = ey + Math.sin(a) * len;
                        g.strokeColor = new Color(75, 205, 245, 24 + Math.floor(progress * 52));
                        g.lineWidth = 9; g.moveTo(ex, ey); g.lineTo(lx, ly); g.stroke();
                        g.strokeColor = new Color(185, 247, 255, 105 + Math.floor(progress * 135));
                        g.lineWidth = 1.4 + progress * 1.6;
                        g.moveTo(ex, ey); g.lineTo(lx, ly); g.stroke();
                    }
                    g.strokeColor = new Color(218, 253, 255, 135 + Math.floor(progress * 110));
                    g.lineWidth = 2;
                    g.arc(ex, ey, visualR + 9 + progress * 6, center - 0.18, center + 0.18, false); g.stroke();
                } else {
                    // 断针射手：0.55秒逐级点亮的校射线，结束后3发沿同一方向射出。
                    g.strokeColor = new Color(255, 220, 65, 38 + Math.floor(progress * 58));
                    g.lineWidth = 6; g.moveTo(ex, ey); g.lineTo(tx, ty); g.stroke();
                    g.strokeColor = new Color(255, 250, 205, 145 + Math.floor(progress * 105));
                    g.lineWidth = 1.3 + progress * 1.2;
                    g.moveTo(ex, ey); g.lineTo(tx, ty); g.stroke();
                    const lit = Math.min(6, 1 + Math.floor(progress * 6));
                    for (let seg = 1; seg <= 6; seg++) {
                        const t = seg / 8;
                        const sx = ex + (tx - ex) * t;
                        const sy = ey + (ty - ey) * t;
                        g.fillColor = seg <= lit
                            ? new Color(255, 246, 155, 230)
                            : new Color(70, 78, 88, 150);
                        g.circle(sx, sy, 2.2 + progress * 0.8); g.fill();
                    }
                }
            }

            if (e instanceof BossController) {
                // 弹幕技能蓄力：大范围脉冲环提示“即将发射”。
                if (e.skillWindup > 0 && e.skillWindupMax > 0) {
                    const progress = 1 - e.skillWindup / e.skillWindupMax;
                    const sr = r * 1.8 + 28 - progress * 18;
                    const sc = Color.fromHEX(new Color(), e.glowColor);
                    g.fillColor = new Color(sc.r, sc.g, sc.b, 24 + Math.floor(progress * 42));
                    g.circle(ex, ey, sr); g.fill();
                    g.strokeColor = new Color(255, 245, 215, 210);
                    g.lineWidth = 3 + progress * 3;
                    g.circle(ex, ey, sr); g.stroke();
                }
                // 冲锋蓄力：宽半透明路线 + 中心高亮线 + 目标圈。
                if (e.chargeWindup > 0 && e.chargeWindupMax > 0) {
                    const progress = 1 - e.chargeWindup / e.chargeWindupMax;
                    const [tx, ty] = this._toLocal(e.chargeTargetX, e.chargeTargetY);
                    g.strokeColor = new Color(255, 45, 35, 45 + Math.floor(progress * 45));
                    g.lineWidth = r * 1.3;
                    g.moveTo(ex, ey); g.lineTo(tx, ty); g.stroke();
                    g.strokeColor = new Color(255, 235, 190, 180 + Math.floor(progress * 75));
                    g.lineWidth = 2.5 + progress * 2;
                    g.moveTo(ex, ey); g.lineTo(tx, ty); g.stroke();
                    g.strokeColor = new Color(255, 70, 45, 220);
                    g.lineWidth = 3;
                    g.circle(tx, ty, 24 - progress * 8); g.stroke();
                }
                // 机械高达·横劈蓄力：主角方向高亮大扇形。
                // 用采样描点画扇面（不依赖 Graphics.arc 的角度方向语义），
                // 角度范围/半径与 BossController 的横劈伤害判定严格一致。
                if (e.mechSlashT > 0) {
                    const prog = 1 - e.mechSlashT / 2;
                    const pulse = 0.55 + 0.45 * Math.sin(this._visualTime * 14);
                    const reach = 280;
                    const half = 1.05; // 与 BossController 横劈判定角度一致
                    const a = -e.mechSlashAngle; // 画布角 → 本地角（y 翻转）
                    const SEG = 24;
                    g.fillColor = new Color(150, 210, 255, Math.floor((18 + prog * 26) * pulse));
                    g.moveTo(ex, ey);
                    for (let k = 0; k <= SEG; k++) {
                        const ang = a - half + (k / SEG) * (half * 2);
                        g.lineTo(ex + Math.cos(ang) * reach, ey + Math.sin(ang) * reach);
                    }
                    g.close(); g.fill();
                    g.strokeColor = new Color(210, 240, 255, Math.floor((150 + prog * 90) * pulse));
                    g.lineWidth = 2.5 + prog * 2;
                    g.moveTo(ex + Math.cos(a - half) * reach, ey + Math.sin(a - half) * reach);
                    for (let k = 1; k <= SEG; k++) {
                        const ang = a - half + (k / SEG) * (half * 2);
                        g.lineTo(ex + Math.cos(ang) * reach, ey + Math.sin(ang) * reach);
                    }
                    g.stroke();
                }
                // 机械高达·天空坠击：锁定目标圈（飞空期间 Boss 贴图淡出）
                if (e.mechSkyT > 0) {
                    const [sx, sy] = this._toLocal(e.mechSkyTargetX, e.mechSkyTargetY);
                    const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 9);
                    g.strokeColor = new Color(255, 120, 90, 170 + Math.floor(pulse * 85));
                    g.lineWidth = 3;
                    g.circle(sx, sy, 170); g.stroke();
                    g.fillColor = new Color(255, 80, 60, Math.floor(pulse * 40));
                    g.circle(sx, sy, 170); g.fill();
                    g.strokeColor = new Color(255, 230, 200, 220);
                    g.lineWidth = 2;
                    g.circle(sx, sy, 24 + pulse * 12); g.stroke();
                }
            }

            // Hit-flash: brief white ring pulse on the sprite's own tint instead of a
            // Graphics circle, so the underlying art stays visible under the flash.
            if (e.sprite && e.flashTimer > 0) {
                const baseTint = Color.fromHEX(new Color(), e.tintColor ?? '#ffffff');
                const t = e.flashTimer / 0.22;
                e.sprite.color = new Color(
                    Math.min(255, baseTint.r + (255 - baseTint.r) * t),
                    Math.min(255, baseTint.g + (255 - baseTint.g) * t),
                    Math.min(255, baseTint.b + (255 - baseTint.b) * t),
                    255);
            } else if (e.sprite) {
                const baseTint = Color.fromHEX(new Color(), e.tintColor ?? '#ffffff');
                // 隐身（毒刺鬼水母）降透明度；机械高达飞空期间完全消失（只留锁定圈）
                const faded = e.invisible || (e instanceof BossController && e.mechSkyT > 0);
                e.sprite.color = faded
                    ? new Color(baseTint.r, baseTint.g, baseTint.b, e.invisible ? 60 : 0)
                    : baseTint;
            }

            // HP bar over enemy — 仅受伤后显示，避免满血时的视觉噪音；隐身/飞空时隐藏
            if (((!e.isBoss && e.hp < e.maxHp) || showGuides) && !hidden) {
                const clip = e.actorAnimation.clip;
                const frame = e.actorAnimation.currentFrame;
                const actorScale = clip?.displayScale ?? 1;
                const displayedVisualR = visualR * actorScale;
                const topOffset = frame
                    ? animationFrameTopOffset(
                        visualR * 2, frame.pivot[1], actorScale,
                        animationAlphaTop(clip.sheet, frame.index),
                    )
                    : displayedVisualR;
                const bar = entityHealthBar(bodyX, bodyY, r, displayedVisualR, topOffset);
                const { x: rx, y: ry, width: rw, height: rh } = bar;
                g.fillColor = new Color(40, 40, 40, 180);
                g.fillRect(rx, ry, rw, rh);
                g.fillColor = new Color(220, 60, 60, 230);
                g.fillRect(rx, ry, rw * (e.hp / e.maxHp), rh);
                // 护盾剩余：血条上方细蓝条
                if (e.shieldActive && e.shieldHp > 0 && e.maxShieldHp > 0) {
                    const sh = 3;
                    g.fillColor = new Color(90, 170, 255, 220);
                    g.fillRect(rx, ry + rh, rw * (e.shieldHp / e.maxShieldHp), sh);
                }
            }
        }

        // Bullets — 玩家、分身和炮台弹携带角色 Sprite；敌弹按威胁类型程序绘制。
        for (const b of this._bullets.active) {
            const [bx, by] = this._toLocal(b.x, b.y);
            if (b.node && b.node.active) {
                b.node.setPosition(Math.round(bx), Math.round(by), 0);
                b.node.setRotationFromEuler(0, 0, -Math.atan2(b.vy, b.vx) * 180 / Math.PI);
                continue;
            }
            const radius = b.radius ?? 5;
            const col = Color.fromHEX(new Color(), b.color ?? '#ffff80');
            if (b.isEnemyBullet || b.owner === 'enemy') {
                const speed = Math.hypot(b.vx, b.vy) || 1;
                const nx = b.vx / speed, ny = -b.vy / speed;
                // 敌弹先画通用拖尾、辉光和白色外轮廓，再叠加弹种轮廓。
                // 这样既保留四章弹幕的形状语言，也能在同色背景上稳定辨认。
                g.strokeColor = new Color(col.r, col.g, col.b, 125);
                g.lineWidth = Math.max(3, radius * 0.75);
                g.moveTo(bx - nx * radius * 3.2, by - ny * radius * 3.2);
                g.lineTo(bx, by); g.stroke();
                g.fillColor = new Color(col.r, col.g, col.b, 55);
                g.circle(bx, by, radius * 1.9); g.fill();
                g.fillColor = new Color(col.r, col.g, col.b, 245);
                g.circle(bx, by, radius); g.fill();
                g.strokeColor = new Color(255, 248, 220, 245);
                g.lineWidth = 2;
                g.circle(bx, by, radius + 2); g.stroke();
            } else {
                // 兜底也使用定向能量梭而不是圆点；正常业务路径都会提供 charKey
                // 并在上方走正式角色弹丸 Sprite。
                const speed = Math.hypot(b.vx, b.vy) || 1;
                const nx = b.vx / speed, ny = -b.vy / speed;
                const px = -ny, py = nx;
                g.fillColor = new Color(col.r, col.g, col.b, 245);
                g.moveTo(bx + nx * radius * 2.2, by + ny * radius * 2.2);
                g.lineTo(bx + px * radius * 0.72, by + py * radius * 0.72);
                g.lineTo(bx - nx * radius * 1.45, by - ny * radius * 1.45);
                g.lineTo(bx - px * radius * 0.72, by - py * radius * 0.72);
                g.close(); g.fill();
            }
            // 敌弹分弹种轮廓：不看颜色也能一眼分辨威胁类型
            // （毒球=双层绿圈+外毒环 / 齿轮=旋转环+4辐条 / 追踪=锁定环+十字 / 混沌=脉冲紫圈+交叉线）
            if (b.enemyFx) {
                const r = radius;
                const t = b.life ?? 0;
                const pulse = 1 + Math.sin(t * 18) * 0.12;
                const art = ENEMY_PROJECTILE_ART[b.enemyFx];
                if (art) {
                    const width = Math.max(24, r * art.scale);
                    const angle = art.spin !== undefined
                        ? this._visualTime * art.spin
                        : -Math.atan2(b.vy, b.vx) * 180 / Math.PI;
                    this._placeEnemyArt(art.key, bx, by, width, width * art.aspect, angle, 248);
                }
                switch (b.enemyFx) {
                    case 'poison':
                        g.strokeColor = new Color(80, 255, 60, 220);
                        g.lineWidth = 2; g.circle(bx, by, r + 2); g.stroke();
                        g.strokeColor = new Color(40, 160, 30, 140);
                        g.lineWidth = 3; g.circle(bx, by, r * 1.6); g.stroke();
                        break;
                    case 'toxin_dart': {
                        const spd = Math.hypot(b.vx, b.vy) || 1;
                        const nx = b.vx / spd, ny = -b.vy / spd;
                        const px = -ny, py = nx;
                        g.fillColor = new Color(205, 255, 112, 250);
                        g.moveTo(bx + nx * (r + 5), by + ny * (r + 5));
                        g.lineTo(bx + px * 2.5, by + py * 2.5);
                        g.lineTo(bx - nx * (r + 3), by - ny * (r + 3));
                        g.lineTo(bx - px * 2.5, by - py * 2.5); g.close(); g.fill();
                        g.strokeColor = new Color(76, 156, 34, 220); g.lineWidth = 1.25;
                        g.moveTo(bx - nx * (r + 5), by - ny * (r + 5));
                        g.lineTo(bx + nx * (r + 6), by + ny * (r + 6)); g.stroke();
                        break;
                    }
                    case 'water_bomb':
                        g.fillColor = new Color(22, 86, 116, 235); g.circle(bx, by, r); g.fill();
                        g.strokeColor = new Color(112, 230, 255, 245); g.lineWidth = 2;
                        g.circle(bx, by, r + 2); g.stroke();
                        g.strokeColor = new Color(80, 195, 240, 145); g.lineWidth = 1.5;
                        g.circle(bx, by, r + 6 + Math.sin(t * 14) * 2); g.stroke();
                        g.fillColor = new Color(205, 250, 255, 230); g.circle(bx - r * 0.28, by - r * 0.28, 2.2); g.fill();
                        break;
                    case 'water_spike': {
                        const spd = Math.hypot(b.vx, b.vy) || 1;
                        const nx = b.vx / spd, ny = -b.vy / spd, px = -ny, py = nx;
                        g.fillColor = new Color(115, 225, 255, 245);
                        g.moveTo(bx + nx * (r + 9), by + ny * (r + 9));
                        g.lineTo(bx + px * (r * 0.48), by + py * (r * 0.48));
                        g.lineTo(bx - nx * (r + 5), by - ny * (r + 5));
                        g.lineTo(bx - px * (r * 0.48), by - py * (r * 0.48)); g.close(); g.fill();
                        g.strokeColor = new Color(215, 250, 255, 245); g.lineWidth = 1.4;
                        g.moveTo(bx - nx * (r + 5), by - ny * (r + 5));
                        g.lineTo(bx + nx * (r + 9), by + ny * (r + 9)); g.stroke();
                        break;
                    }
                    case 'shrimp_spike':
                    case 'venom_sting':
                    case 'rail': {
                        const spd = Math.hypot(b.vx, b.vy) || 1;
                        const nx = b.vx / spd, ny = -b.vy / spd, px = -ny, py = nx;
                        const rail = b.enemyFx === 'rail';
                        const venom = b.enemyFx === 'venom_sting';
                        const len = rail ? r + 15 : r + 9;
                        const halfW = rail ? 3.5 : venom ? 2.6 : 4.2;
                        g.fillColor = rail ? new Color(255, 80, 190, 250)
                            : venom ? new Color(205, 105, 255, 250) : new Color(255, 154, 76, 250);
                        g.moveTo(bx + nx * len, by + ny * len);
                        g.lineTo(bx + px * halfW, by + py * halfW);
                        g.lineTo(bx - nx * len * 0.7, by - ny * len * 0.7);
                        g.lineTo(bx - px * halfW, by - py * halfW); g.close(); g.fill();
                        if (!venom) {
                            g.strokeColor = rail ? new Color(255, 208, 245, 240) : new Color(255, 226, 170, 235);
                            g.lineWidth = 1.4;
                            g.moveTo(bx - nx * len * 0.3 + px * (halfW + 2), by - ny * len * 0.3 + py * (halfW + 2));
                            g.lineTo(bx - nx * len * 0.55, by - ny * len * 0.55);
                            g.lineTo(bx - nx * len * 0.3 - px * (halfW + 2), by - ny * len * 0.3 - py * (halfW + 2)); g.stroke();
                        }
                        break;
                    }
                    case 'sonic':
                        g.fillColor = new Color(255, 105, 105, 225); g.circle(bx, by, Math.max(2.5, r * 0.38)); g.fill();
                        g.strokeColor = new Color(255, 170, 155, 225); g.lineWidth = 1.6;
                        g.circle(bx, by, r * 0.9); g.stroke();
                        g.strokeColor = new Color(255, 105, 95, 165); g.lineWidth = 2;
                        g.circle(bx, by, r + 5 + Math.sin(t * 18) * 2); g.stroke();
                        break;
                    case 'beam': {
                        const spd = Math.hypot(b.vx, b.vy) || 1;
                        const nx = b.vx / spd, ny = -b.vy / spd, px = -ny, py = nx;
                        g.strokeColor = new Color(255, 75, 70, 245); g.lineWidth = 4;
                        g.moveTo(bx - nx * (r + 11), by - ny * (r + 11));
                        g.lineTo(bx + nx * (r + 11), by + ny * (r + 11)); g.stroke();
                        g.strokeColor = new Color(255, 225, 215, 250); g.lineWidth = 1.4;
                        g.moveTo(bx - nx * (r + 12), by - ny * (r + 12));
                        g.lineTo(bx + nx * (r + 12), by + ny * (r + 12)); g.stroke();
                        g.moveTo(bx + px * 5, by + py * 5); g.lineTo(bx - px * 5, by - py * 5); g.stroke();
                        break;
                    }
                    case 'blade': {
                        const spd = Math.hypot(b.vx, b.vy) || 1;
                        const nx = b.vx / spd, ny = -b.vy / spd, px = -ny, py = nx;
                        g.fillColor = new Color(175, 225, 255, 220);
                        g.moveTo(bx + nx * (r + 12), by + ny * (r + 12));
                        g.lineTo(bx + px * (r + 3), by + py * (r + 3));
                        g.lineTo(bx - nx * (r + 7), by - ny * (r + 7));
                        g.lineTo(bx + px * 2, by + py * 2); g.close(); g.fill();
                        g.strokeColor = new Color(235, 250, 255, 245); g.lineWidth = 1.6;
                        g.moveTo(bx - nx * (r + 7), by - ny * (r + 7));
                        g.lineTo(bx + nx * (r + 12), by + ny * (r + 12)); g.stroke();
                        break;
                    }
                    case 'gear': {
                        g.strokeColor = new Color(140, 190, 255, 230);
                        g.lineWidth = 2.5; g.circle(bx, by, r + 1.5); g.stroke();
                        const a0 = t * 6;
                        for (let k = 0; k < 4; k++) {
                            const aa = a0 + (k / 4) * Math.PI * 2;
                            g.moveTo(bx + Math.cos(aa) * (r - 2), by + Math.sin(aa) * (r - 2));
                            g.lineTo(bx + Math.cos(aa) * (r + 4), by + Math.sin(aa) * (r + 4));
                        }
                        g.stroke();
                        break;
                    }
                    case 'homing':
                        g.strokeColor = new Color(0, 255, 210, 230);
                        g.lineWidth = 2; g.circle(bx, by, r + 4); g.stroke();
                        g.moveTo(bx - r - 8, by); g.lineTo(bx - r - 2, by);
                        g.moveTo(bx + r + 2, by); g.lineTo(bx + r + 8, by);
                        g.moveTo(bx, by - r - 8); g.lineTo(bx, by - r - 2);
                        g.moveTo(bx, by + r + 2); g.lineTo(bx, by + r + 8);
                        g.stroke();
                        break;
                    case 'chaos':
                        g.strokeColor = new Color(220, 100, 255, 230);
                        g.lineWidth = 2; g.circle(bx, by, r * pulse + 2); g.stroke();
                        const ca = t * 3;
                        for (let k = 0; k < 2; k++) {
                            const aa = ca + k * Math.PI / 2;
                            g.moveTo(bx - Math.cos(aa) * (r + 5), by - Math.sin(aa) * (r + 5));
                            g.lineTo(bx + Math.cos(aa) * (r + 5), by + Math.sin(aa) * (r + 5));
                        }
                        g.stroke();
                        break;
                    case 'needle': {
                        const spd = Math.hypot(b.vx, b.vy) || 1;
                        const nx = b.vx / spd, ny = -b.vy / spd;
                        g.strokeColor = new Color(255, 252, 205, 255);
                        g.lineWidth = 3;
                        g.moveTo(bx - nx * (r + 8), by - ny * (r + 8));
                        g.lineTo(bx + nx * (r + 8), by + ny * (r + 8));
                        g.stroke();
                        g.fillColor = new Color(255, 220, 55, 245);
                        g.circle(bx, by, 2.5); g.fill();
                        break;
                    }
                    case 'frost': {
                        const spd = Math.hypot(b.vx, b.vy) || 1;
                        const nx = b.vx / spd, ny = -b.vy / spd;
                        const px = -ny, py = nx;
                        g.fillColor = new Color(195, 248, 255, 250);
                        g.moveTo(bx + nx * (r + 6), by + ny * (r + 6));
                        g.lineTo(bx + px * 4, by + py * 4);
                        g.lineTo(bx - nx * (r + 4), by - ny * (r + 4));
                        g.lineTo(bx - px * 4, by - py * 4); g.close(); g.fill();
                        break;
                    }
                    case 'arc':
                        g.strokeColor = new Color(130, 250, 255, 245);
                        g.lineWidth = 2; g.circle(bx, by, r + 4); g.stroke();
                        g.moveTo(bx - r - 5, by); g.lineTo(bx, by - 3); g.lineTo(bx + r + 5, by + 2); g.stroke();
                        break;
                }
            }
        }

        // Player — Sprite node (char_<id> battle token, set up in PlayerController.init)
        // carries the visual; Graphics only draws the shield ring overlay.
        if (this._player && (!this._player.dead || this._player.actorAnimation.action === 'defeated')) {
            const p = this._player;
            const [px, py] = this._toLocal(p.x, p.y);
            const walkPose = advanceLocomotion(
                p.locomotion, p.x, p.y, this._visualDt, 82, p.locomotionKind,
            );
            const facingPose = updateDirectionalFacing(
                p.directionalFacing,
                p.facingX,
                p.facingY,
                this._visualDt,
            );
            // 只保留无色接触阴影。身份色椭圆会穿过双腿之间，看起来像一根绿线。
            g.fillColor = new Color(0, 0, 0, 125);
            g.ellipse(px, py - 25, 21 * walkPose.shadowScale, 6.5 * walkPose.shadowScale); g.fill();
            this._syncDirectionalFrame(p, walkPose, facingPose);
            if (p.actorAnimation.clip) {
                p.node.setPosition(px, py, 0);
                const scale = p.actorAnimation.clip.displayScale ?? 1;
                p.node.setScale(new Vec3(p.animationMirror * scale, scale, 1));
                p.node.setRotationFromEuler(0, 0, 0);
                return;
            }
            p.node.setPosition(Math.round(px), Math.round(py + walkPose.bodyLift), 0);
            // 移动时由完整动作帧和轻微重心倾斜表达步态；静止保留极轻呼吸。
            // 呼吸只允许等比缩放。旧版横向放大时纵向同时缩小，角色会周期性
            // 变胖/变瘦，看起来像素材被拉伸；移动时仍完全关闭呼吸缩放。
            const breathe = walkPose.moving ? 0 : Math.sin(this._visualTime * 3.2) * 0.006;
            const facing = facingPose.mirror;
            const uniformScale = 1 + breathe;
            p.node.setScale(new Vec3(
                facing * facingPose.turnScaleX * uniformScale * walkPose.bodyScaleX,
                uniformScale * walkPose.bodyScaleY,
                1,
            ));
            p.node.setRotationFromEuler(
                0, 0, walkPose.bodyRollDeg * facing + facingPose.turnLeanDeg,
            );
        }
    }

    private _drawParticles() {
        const g = this._particleGfx;
        g.clear();
        if (!this._inCombat()) return;

        for (const p of this._particles.particles) {
            if (p.life <= 0) continue;
            const alpha = Math.floor(p.alpha * 255);
            const c = Color.fromHEX(new Color(), p.color);
            const [px, py] = this._toLocal(p.x, p.y);

            if (p.type === 'dot') {
                // glow 粒子：先叠两层放大+低透明度的光晕，再画高亮实心核心，
                // 撑出"发光"的体积感——此前 glow 字段完全没被渲染消费，
                // 所有粒子（包括爆炸/暴击/治疗）看起来都是同一种平淡实心圆，
                // 就是用户反馈"特效很low"的根因之一。
                if (p.glow) {
                    const glowR = (p.radius ?? p.size) * 1.75;
                    g.fillColor = new Color(c.r, c.g, c.b, Math.floor(alpha * 0.16));
                    g.circle(px, py, glowR); g.fill();
                    g.fillColor = new Color(c.r, c.g, c.b, Math.floor(alpha * 0.38));
                    g.circle(px, py, glowR * 0.55); g.fill();
                    // 核心略微提亮（往白色混合），让发光粒子的中心更"刺眼"
                    const core = new Color(
                        Math.min(255, c.r + (255 - c.r) * 0.5),
                        Math.min(255, c.g + (255 - c.g) * 0.5),
                        Math.min(255, c.b + (255 - c.b) * 0.5),
                        alpha);
                    g.fillColor = core;
                    g.circle(px, py, p.size); g.fill();
                } else {
                    g.fillColor = new Color(c.r, c.g, c.b, alpha);
                    g.circle(px, py, p.size); g.fill();
                }

            } else if (p.type === 'ring') {
                if (p.glow) {
                    g.strokeColor = new Color(c.r, c.g, c.b, Math.floor(alpha * 0.3));
                    g.lineWidth = 6;
                    g.circle(px, py, p.radius); g.stroke();
                }
                g.strokeColor = new Color(c.r, c.g, c.b, alpha);
                g.lineWidth = 2;
                g.circle(px, py, p.radius); g.stroke();

            } else if (p.type === 'line') {
                const [px2, py2] = this._toLocal(p.x2!, p.y2!);
                if (p.glow) {
                    g.strokeColor = new Color(c.r, c.g, c.b, Math.floor(alpha * 0.35));
                    g.lineWidth = (p.lineWidth ?? 2) + 5;
                    g.moveTo(px, py); g.lineTo(px2, py2); g.stroke();
                }
                g.strokeColor = new Color(c.r, c.g, c.b, alpha);
                g.lineWidth = p.lineWidth ?? 2;
                g.moveTo(px, py); g.lineTo(px2, py2); g.stroke();
            }
        }

        // 玩家 Sprite 是 GameLayer 的子节点；若护盾也画在 GameLayer 根 Graphics，
        // Cocos 会先画 Graphics 再画角色，护盾绝大部分必然被 82px 角色遮住。
        // ParticleLayer 位于所有实体之上，持续护盾在这里最后绘制，形成真正覆盖
        // 角色轮廓的能量罩。半径按战斗 Sprite 而非16px碰撞半径计算。
        if (this._player && !this._player.dead && this._player.shield > 0) {
            const p = this._player;
            const [px, py] = this._toLocal(p.x, p.y);
            const shieldRatio = p.maxShield > 0
                ? Math.max(0, Math.min(1, p.shield / p.maxShield)) : 1;
            const shieldR = Math.max(44, (p.radius ?? 20) + 12);
            const pulse = 0.5 + 0.5 * Math.sin(this._visualTime * 4.8);
            g.fillColor = new Color(65, 150, 255, 12 + Math.floor(10 * shieldRatio));
            g.circle(px, py, shieldR); g.fill();
            g.strokeColor = new Color(90, 175, 255, 155 + Math.floor(50 * pulse));
            g.lineWidth = 2.2;
            g.circle(px, py, shieldR); g.stroke();
            const spin = -this._visualTime * 0.85;
            g.strokeColor = new Color(225, 246, 255, 205 + Math.floor(40 * pulse));
            g.lineWidth = 3;
            for (let seg = 0; seg < 4; seg++) {
                const start = spin + seg * Math.PI / 2;
                g.arc(px, py, shieldR + 2.5, start, start + 0.48, false); g.stroke();
            }
            // 上半部高光让它读成罩在角色前方的透明穹顶，而不是脚下光圈。
            g.strokeColor = new Color(195, 232, 255, 115 + Math.floor(55 * pulse));
            g.lineWidth = 1.6;
            g.arc(px, py + 3, shieldR * 0.82, Math.PI * 0.12, Math.PI * 0.88, false); g.stroke();
        }
    }

    /**
     * One-shot art FX (explosion/heal/poison/cold_arrow/hex_ring) — reads
     * ParticleManager.spriteFx (pure data, decays in ParticleManager.update())
     * and re-acquires pool nodes every frame rather than tracking a stable
     * id mapping: with only ≤24 concurrent FX this full-reacquire is cheap
     * and much simpler than diffing entries across frames.
     */
    private _drawSpriteFx() {
        this._fxPool.releaseAll();
        if (!this._inCombat()) return;

        for (const fx of this._particles.spriteFx) {
            const node = this._fxPool.acquire();
            if (!node) break; // pool exhausted — extremely unlikely at 24 slots, just skip the rest

            const sprite = node.getComponent(Sprite)!;
            const frame = spriteFxFrame(fx);
            if (frame && fx.animation) applyAnimationFrame(sprite, fx.animation, frame);
            else {
                // 同一池节点可能上一帧还在画偏心枪口特效，旧图必须恢复中心锚点。
                node.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
                sprite.trim = true;
                applyArtSprite(sprite, fx.key);
            }

            const sourceX = fx.follow?.alive === false ? fx.x : (fx.follow?.x ?? fx.x);
            const sourceY = fx.follow?.alive === false ? fx.y : (fx.follow?.y ?? fx.y);
            const [fx_x, fx_y] = this._toLocal(sourceX, sourceY);
            node.setPosition(Math.round(fx_x), Math.round(fx_y), 0);

            // 播放进度：0=刚生成，1=即将消失。此前直接用 t(=life/maxLife) 线性
            // 驱动透明度+固定尺寸，特效表现是"一张图突然出现、匀速变淡后消失"，
            // 完全没有动画层次——这正是用户反馈"特效也很low"的根因之一。
            // 现在改成有节奏的三段式：
            //   1) 前12%：从60%尺寸快速"弹出"到100%（pop-in，制造冲击感）；
            //   2) 全程：尺寸持续小幅膨胀（爆炸/寒冰扩散的既视感）；
            //   3) 后40%：透明度加速衰减（早期饱满显示，收尾快速消散不拖泥带水）。
            const t = Math.max(0, Math.min(1, fx.life / fx.maxLife));
            const progress = 1 - t; // 0→1，随时间推进

            let scaleT: number;
            let fadeT: number;
            let rotation = fx.rotationDeg ?? 0;
            if (frame) {
                // 形变和消散由真实帧提供；旋转仅确定发射朝向，不随时间转动。
                scaleT = 1;
                fadeT = 1;
            } else if (fx.motion === 'aura') {
                // 持续状态：轻微呼吸+缓慢旋转，最后18%才收束，不抢走角色本体。
                scaleT = 0.96 + Math.sin(progress * Math.PI * 10) * 0.035;
                fadeT = progress < 0.82 ? 1 : Math.max(0, 1 - (progress - 0.82) / 0.18);
                rotation += progress * 120;
            } else if (fx.motion === 'slash') {
                // 挥斩：更快弹出、更少膨胀，避免弧刃像爆炸一样向四周发胖。
                const popIn = progress < 0.08 ? progress / 0.08 : 1;
                scaleT = (0.68 + 0.32 * popIn) * (1 + progress * 0.16);
                fadeT = progress < 0.52 ? 1 : Math.max(0, 1 - (progress - 0.52) / 0.48);
            } else {
                const popIn = progress < 0.12 ? (progress / 0.12) : 1;
                const growth = 1 + progress * 0.35;
                scaleT = (0.6 + 0.4 * popIn) * growth;
                fadeT = progress < 0.6 ? 1 : Math.max(0, 1 - (progress - 0.6) / 0.4);
            }
            const alpha = Math.floor(fadeT * (fx.baseAlpha ?? 1) * 255);
            node.setRotationFromEuler(0, 0, rotation);

            // 可选染色（hex_ring 按符文颜色）：与白色 alpha 合成，无 color 时行为不变
            if (fx.color) {
                const c = Color.fromHEX(new Color(), fx.color);
                sprite.color = new Color(c.r, c.g, c.b, alpha);
            } else {
                sprite.color = new Color(255, 255, 255, alpha);
            }

            const size = 64 * fx.scale * scaleT;
            node.getComponent(UITransform)!.setContentSize(size, size);
        }
    }

    // ── floating text (Label node pool — Graphics cannot render text) ──

    private _floatLabels: Node[] = [];
    private readonly FLOAT_POOL_SIZE = 32;

    private _initFloatTextPool() {
        for (let i = 0; i < this.FLOAT_POOL_SIZE; i++) {
            const n = new Node(`Float${i}`);
            n.setParent(this._uiLayer);
            n.addComponent(UITransform).setContentSize(220, 30);
            const lbl = n.addComponent(Label);
            lbl.fontSize = 16;
            lbl.color = new Color(255, 255, 255, 255);
            styleLabel(lbl);
            n.active = false;
            this._floatLabels.push(n);
        }
    }

    private _refreshFloatText() {
        const items = this._floatText.items;
        for (let i = 0; i < this._floatLabels.length; i++) {
            const node = this._floatLabels[i];
            const item = items[i];
            if (!item) { node.active = false; continue; }
            node.active = true;
            const [lx, ly] = this._toLocal(item.x, item.y);
            node.setPosition(new Vec3(Math.round(lx + this._shake.x), Math.round(ly + this._shake.y), 0));
            const lbl = node.getComponent(Label)!;
            lbl.string   = item.text;
            lbl.fontSize = item.crit ? item.size + 4 : item.size;
            const col = Color.fromHEX(new Color(), item.color);
            lbl.color = new Color(col.r, col.g, col.b, Math.max(0, Math.floor(item.alpha * 255)));
            styleLabel(lbl); // fontSize 每帧可能变化（暴击+4），outlineWidth 需要跟着重新选取
        }
    }

    private _buildHudData(): HudData {
        const p = this._player;
        return {
            hp: p.hp, maxHp: p.maxHp,
            shield: p.shield, maxShield: p.maxShield,
            gold: this._economy.gold,
            wave: this._waveMgr.wave, chapter: this._chapter,
            augments: this._augMgr.active,
            skills: p.getSkillStates(),
            initialPassive: this._char ? { name: this._char.name, desc: this._char.desc } : undefined,
            bossHp:    this._boss?.hp,
            bossMaxHp: this._boss?.maxHp,
            bossName:  this._boss?.name,
        }
    }

    /** M键：暂停战斗并弹出角色属性/词条详情面板。 */
    private _openStats() {
        this._pauseReturn = this.state === 'testRoom' ? 'testRoom' : 'playing';
        this._setState('stats');
        // 先激活再填充：Graphics 在节点未激活时下发的绘制命令激活后可能丢失
        // （表现为面板只剩文字、底板全透明）；onEnable/refresh 里也会重画兜底。
        this._statsUI.node.active = true;
        this._statsUI.refresh(this._buildStatsData());
    }

    private _buildStatsData(): StatsPanelData {
        const p   = this._player;
        const st  = p.stats;
        const pct = (v: number) => `${Math.round(v * 100)}%`;
        return {
            charName:   this._char?.name  ?? '角色',
            charColor:  this._char?.color ?? '#ffd700',
            passiveDesc: this._char?.desc ?? '',
            stats: [
                { label: '生命',     value: `${Math.ceil(p.hp)} / ${Math.round(st.maxHp)}` },
                { label: '护盾',     value: `${Math.ceil(p.shield)} / ${Math.round(p.maxShield)}` },
                { label: '攻击力',   value: `${Math.round(p.getDamage(this))}` },
                { label: '攻击速度', value: `${p.getAtkSpd().toFixed(2)} /秒` },
                { label: '移动速度', value: `${Math.round(p.getSpeed())}` },
                { label: '护甲',     value: `${Math.round(st.armor)}` },
                { label: '暴击率',   value: pct(st.critRate || 0) },
                { label: '暴击伤害', value: `+${pct(st.critDmg || 0)}` },
                { label: '攻击吸血', value: pct(st.lifestealRate || 0) },
                { label: '拾取范围', value: `${Math.round(st.goldPickupRange ?? 60)}` },
                { label: '冷却缩减', value: pct(st.cdReduction || 0) },
                { label: '金币',     value: `${this._economy.gold}` },
            ],
            progress: `进度  第${this._chapter + 1}章 · 第${this._waveMgr.wave}波 · 击杀 ${this.kills} · 得分 ${this.score}`,
            augments:    this._augMgr.active,
            skillStates: p.getSkillStates(),
        };
    }

    // ── public game API (called by systems / augments) ────────



    /**
     * Spawn an enemy of the given type. If x/y omitted, spawns just outside a random edge.
     * bossKey 仅对 type==='boss' 生效：number=0-based 章节（正式局/测试房章节 Boss），
     * 'mech' | 'abyss' = 测试房文档专属 Boss（TEST_BOSSES）。
     */
    spawnEnemy(type: string, x?: number, y?: number, bossKey?: string | number): EnemyBase {
        // EnemyBase/BossController are plain TS classes (not cc.Component),
        // so they're constructed with `new`, not addComponent(). Keep the node
        // hidden until its world position and art settings are fully configured;
        // otherwise its default local origin briefly appears at screen center.
        const eNode = new Node(`Enemy_${type}`);
        eNode.active = false;
        eNode.setParent(this._gameLayer);
        eNode.addComponent(UITransform).setContentSize(64, 64);
        const eSprite = eNode.addComponent(Sprite);
        eSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        eSprite.trim = false;

        let enemy: EnemyBase;
        if (type === 'boss') {
            const boss = new BossController();
            boss.node = eNode;
            boss.sprite = eSprite;
            if (typeof bossKey === 'string') boss.initBossKind(bossKey, this);
            else boss.initBoss(typeof bossKey === 'number' ? bossKey : this._chapter, this);
            this._boss = boss;
            enemy = boss;
            this._audio.playBgm('boss');
            this._audio.playSfx('boss_roar');
        } else {
            enemy = new EnemyBase();
            enemy.node = eNode;
            enemy.sprite = eSprite;
            enemy.init(type, this._wave, this);
        }

        let ex: number, ey: number;
        if (x !== undefined && y !== undefined) {
            const p = this._player;
            if (p?.alive) {
                const minDistance = Math.max(180, enemy.radius + p.radius + enemy.meleeRange + 80);
                [ex, ey] = EnemyBase.safeSpawnPos(x, y, enemy.radius, p.x, p.y, minDistance);
            } else {
                [ex, ey] = EnemyBase.safeSpawnPos(x, y, enemy.radius, CANVAS_W / 2, CANVAS_H / 2, 0);
            }
        } else {
            [ex, ey] = EnemyBase.randomEdgePos(enemy.radius);
        }
        enemy.x = ex; enemy.y = ey;
        enemy.updateVisualAnimation(0, this._player);
        const animationSheets = new Set<string>();
        const set = ACTOR_ANIMATIONS[enemy.spriteKey] ?? {};
        for (const view of Object.keys(set)) for (const action of Object.keys(set[view])) {
            animationSheets.add(set[view][action].sheet);
        }
        preloadArt(Array.from(animationSheets));

        // 方向动作帧矩阵预热 + 初始静止帧
        enemy.locomotionFrameKey = enemy.spriteKey;
        preloadArt(enemy.directionalFrames === false
            ? [enemy.spriteKey]
            : directionalArtKeys(enemy.spriteKey));
        applyArtSprite(eSprite, enemy.spriteKey);
        eSprite.color = Color.fromHEX(new Color(), enemy.tintColor ?? '#ffffff');
        // 渲染直径叠加 visualScale（默认1，Boss=1.8）：只放大贴图显示尺寸，
        // 碰撞体积/近战判定距离/边界clamp仍只读 enemy.radius 本身，不受影响。
        const diameter = (enemy.radius ?? 18) * 2 * (enemy.visualScale ?? 1);
        eNode.getComponent(UITransform)!.setContentSize(diameter, diameter);
        const [lx, ly] = this._toLocal(ex, ey);
        eNode.setPosition(lx, ly, 0);
        eNode.active = true;
        this._enemies.push(enemy);

        return enemy;
    }

    /** Remove a dead / destroyed enemy from the list. */
    removeEnemy(e: EnemyBase) {
        const idx = this._enemies.indexOf(e);
        if (idx >= 0) {
            this._enemies.splice(idx, 1);
            if (e.dead) this._corpses.add(e);
            else e.node?.destroy();
        }
        if (e === this._boss) {
            this._boss = undefined;
            if (this.state === 'playing') this._audio.playBgm(this._chapterBgm());
        }
    }

    /** Return the living enemy closest to (x, y), or undefined. */
    getNearestEnemy(x: number, y: number): EnemyBase | undefined {
        let best: EnemyBase | undefined;
        let bestD = Infinity;
        for (const e of this._enemies) {
            if (e.dead) continue;
            const dx = e.x - x, dy = e.y - y;
            const d  = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = e; }
        }
        return best;
    }

    /**
     * 敌人最密集的位置：以150为半径统计每个存活敌人的邻居数，
     * 取邻居最多者的邻域质心。放置类技能（黑洞/冰场）释放在这里，
     * 不再依赖鼠标指向。
     */
    getEnemyClusterPoint(): { x: number; y: number } | undefined {
        const alive = this._enemies.filter(e => !e.dead && e.alive);
        if (alive.length === 0) return undefined;
        const R = 150;
        let best = alive[0], bestCount = -1;
        for (const a of alive) {
            let count = 0;
            for (const b of alive) if (Vec.dist(a.x, a.y, b.x, b.y) <= R) count++;
            if (count > bestCount) { bestCount = count; best = a; }
        }
        let sx = 0, sy = 0, n = 0;
        for (const b of alive) {
            if (Vec.dist(best.x, best.y, b.x, b.y) <= R) { sx += b.x; sy += b.y; n++; }
        }
        return n > 0 ? { x: sx / n, y: sy / n } : { x: best.x, y: best.y };
    }

    /** Return all living enemies within radius r of (x, y). */
    getEnemiesInRadius(x: number, y: number, r: number): EnemyBase[] {
        const r2 = r * r;
        return this._enemies.filter(e => {
            if (e.dead) return false;
            const dx = e.x - x, dy = e.y - y;
            return dx * dx + dy * dy <= r2;
        });
    }

    /** Called by EnemyBase when it dies. */
    onEnemyKilled(e: EnemyBase) {
        this._economy.spawnDrop(e.x, e.y, e.goldValue ?? 1);
        this._augMgr.dispatchKill(this._player, e, 0, this);
        this._particles.explode(e.x, e.y, e.color ?? '#cc4444');
        this.removeEnemy(e);
    }

    /** Called by PlayerController when HP reaches 0. */
    onPlayerDeath() {
        if (this._playerDeathPending) return;
        this._player.beginDefeat();
        this._particles.explode(this._player.x, this._player.y, '#40c8ff');
        this._audio.playSfx('player_die');
        // 测试房间沙盒：不写档案、不进 gameover，3 秒后满血回中央重生
        if (this.state === 'testRoom') {
            this._scheduleTestRespawn();
            return;
        }
        this._recordRun(false);
        if (this._player.actorAnimation.clip) this._playerDeathPending = true;
        else this._setState('gameover');
    }

    /** 测试房间重生：3s 后满血回中央 + 2s 无敌（runId 校验防止跨局定时器误触发）。 */
    private _scheduleTestRespawn() {
        const runId = this._runId;
        this._floatText.spawn(CANVAS_W / 2, 200, '3 秒后重生…', '#88ccff', 20, true);
        setTimeout(() => {
            if (this.state !== 'testRoom' || this._runId !== runId) return;
            const p = this._player;
            if (!p) return;
            p.hp = p.maxHp;
            p.shield = 0;
            p.alive = true;
            p.dots = [];
            p.x = CANVAS_W / 2;
            p.y = CANVAS_H / 2;
            p.resetVisualAnimation();
            p.applyBuff('respawn_iframe', 2, { invincible: true });
            this._particles.hexActivate(CANVAS_W / 2, CANVAS_H / 2, '#88ccff');
            this._floatText.spawn(CANVAS_W / 2, 200, '已重生', '#88ffb0', 20, true);
        }, 3000);
    }

    /** 局末：把本局数据写入玩家档案(SaveSystem)，新解锁成就弹中央浮字。 */
    private _recordRun(won: boolean) {
        if (this._runRecorded) return; // 一局只记一次（先通关后死亡不重复计）
        this._runRecorded = true;
        const unlocked = SaveSystem.recordRun({
            charId:        this._player?.charId ?? '',
            chapter:       this._chapter + 1,
            wave:          this._waveMgr.wave,
            kills:         this.kills,
            bossKills:     this.bossKills,
            goldEarned:    this._economy.earnedThisRun,
            maxCombo:      this.maxCombo,
            augmentCount:  this._augMgr.active.length,
            won,
        });
        for (const a of unlocked) {
            this._floatText.spawn(CANVAS_W / 2, 180, `成就解锁：${a.icon} ${a.name}`, '#ffd655', 22, true);
        }
    }

    // ── turret / clone summon system ────────────────────────────

    /** 召唤单位复用正式角色动作集；只保存轻量时钟/朝向，不创建独立实体节点。 */
    private _initSummonActor(
        summon: any, actorKey: string, displaySize: number, tint: string, alpha: number,
    ): void {
        summon._actorKey = actorKey;
        summon._actorAnimation = new ActorAnimation();
        summon._actorFacing = createDirectionalFacingState('side');
        summon._actorFacingPose = updateDirectionalFacing(summon._actorFacing, 1, 0, 0);
        summon._actorDisplaySize = displaySize;
        summon._actorTint = tint;
        summon._actorAlpha = alpha;
        summon._actorLastX = summon.x;
        summon._actorLastY = summon.y;

        const sheets = new Set<string>();
        const set = ACTOR_ANIMATIONS[actorKey];
        for (const viewKey in (set ?? {})) {
            const view = (set as any)[viewKey];
            for (const actionKey in (view ?? {})) {
                const clip = view[actionKey];
                if (clip?.sheet) sheets.add(clip.sheet);
            }
        }
        preloadArt(Array.from(sheets));
    }

    private _updateSummonActor(summon: any, dt: number): void {
        const animation: ActorAnimation | undefined = summon._actorAnimation;
        const state = summon._actorFacing;
        const set = ACTOR_ANIMATIONS[summon._actorKey];
        if (!animation || !state || !set) return;

        const moveX = summon.x - (summon._actorLastX ?? summon.x);
        const moveY = summon.y - (summon._actorLastY ?? summon.y);
        let faceX = moveX;
        let faceY = moveY;
        if (Number.isFinite(summon._aim)) {
            faceX = Math.cos(summon._aim);
            faceY = Math.sin(summon._aim);
        }
        summon._actorFacingPose = updateDirectionalFacing(state, faceX, faceY, dt);
        const view = summon._actorFacingPose.view;
        if (summon._actorRequested === 'attack') {
            animation.play('attack', set[view]?.attack, true);
            summon._actorRequested = undefined;
        } else if (!animation.locked) {
            const moving = Math.hypot(moveX, moveY) > 0.15;
            const action: 'idle' | 'walk' | 'run' = summon.kind === 'waterClone' && summon._phase === 'dash'
                ? 'run'
                : moving ? 'walk' : 'idle';
            animation.play(action, set[view]?.[action]);
        }
        animation.update(dt);
        summon._actorLastX = summon.x;
        summon._actorLastY = summon.y;
    }

    spawnTurret(player: any, dmgMult = 1, followOwner = false): void {
        // 被动：炮台类词条效果×1.5（对齐 CharacterDB.ts vivian 的 desc 描述）
        const turretMult = player.stats?.turretBonus || 1;
        // 炮台军团(turret_army)：持有炮台类词条(tags含'turret')时，数量×3、
        // 攻速×1.5。旧阈值是"≥3个炮台词条"，但炮台类词条只有'turret'一种且
        // 同名词条不可重复装备，3个永远凑不齐——对任何角色都是死词条，降为≥1。
        // 每次召唤时动态判定，不缓存 flag —— 避免"先装turret_army、后装炮台词条"
        // 时永远不生效的顺序依赖问题。
        const armyActive = this._augMgr.active.filter(a => (a.tags?.indexOf('turret') ?? -1) >= 0).length >= 1;
        const spawnCount  = armyActive ? 3 : 1;
        const fireInterval = armyActive ? 0.6 / 1.5 : 0.6;
        const deployAim = Math.atan2(this._input.mouse.y - player.y, this._input.mouse.x - player.x);
        const existingDeployed = this._turrets.filter(t => t.kind === 'turret' && !t.followOwner).length;
        for (let n = 0; n < spawnCount; n++) {
            const followIndex = this._turrets.filter(t => t.followOwner).length;
            const followSide = followIndex % 2 === 0 ? -1 : 1;
            // 部署炮台沿瞄准方向扇形落位，避免随机刷在玩家脚下。重复部署时
            // 轻微错开角度；炮台军团一次生成3座时天然展开为左/中/右阵列。
            const fanIndex = n - (spawnCount - 1) / 2;
            const deployAngle = deployAim + fanIndex * 0.62 + existingDeployed * 0.18;
            const deployDistance = 68;
            const t: any = {
                x: followOwner
                    ? player.x + followSide * 52
                    : clamp(player.x + Math.cos(deployAngle) * deployDistance, 28, CANVAS_W - 28),
                y: followOwner
                    ? player.y + 34
                    : clamp(player.y + Math.sin(deployAngle) * deployDistance, 28, PLAYFIELD_BOTTOM - 28),
                r: 14, alive: true, _timer: 0,
                kind: 'turret', _aim: 0,
                dmg: player.getDamage(this) * dmgMult * turretMult,
                owner: player, followOwner,
                _followX: followSide * 52, _followY: 34,
                _life: followOwner ? Number.POSITIVE_INFINITY : 12,
            };
            t.update = (dt: number, g: GameManager) => {
                t._life -= dt; t._timer -= dt;
                t._fireAnimT = Math.max(0, (t._fireAnimT ?? 0) - dt);
                if (t._life <= 0) { t.alive = false; return; }
                // 超频指令（薇薇安E）：限时伤害/攻速乘区，到期回落
                if (t._buffTimer > 0) {
                    t._buffTimer -= dt;
                    if (t._buffTimer <= 0) { t.dmgMult = 1; t.spdMult = 1; }
                }
                if (t.followOwner) {
                    const targetX = player.x + t._followX;
                    const targetY = player.y + t._followY;
                    const followT = Math.min(1, dt * 9);
                    t.x += (targetX - t.x) * followT;
                    t.y += (targetY - t.y) * followT;
                }
                if (t._timer <= 0) {
                    t._timer = fireInterval / (t.spdMult ?? 1);
                    const target = (t.focusTarget && !t.focusTarget.dead) ? t.focusTarget : g.getNearestEnemy(t.x, t.y);
                    if (target) {
                        const [dx, dy] = Vec.normalize(target.x - t.x, target.y - t.y);
                        t._aim = Math.atan2(dy, dx);
                        t._fireAnimT = 0.18;
                        g.bullets.fire(t.x, t.y, dx, dy, t.dmg * (t.dmgMult ?? 1), {
                            color: '#2af', r: 5, owner: 'turret', charKey: 'vivian',
                        });
                    }
                }
            };
            this._turrets.push(t);
        }
    }

    spawnOrbitTurret(player: any, count = 6): void {
        const turretMult = player.stats?.turretBonus || 1;
        for (let i = 0; i < count; i++) {
            const angle0 = (i / count) * Math.PI * 2;
            const t: any = {
                _angle: angle0, _orbitR: 80, _orbitSpd: 2,
                r: 10, alive: true, _timer: 0, _life: 8,
                kind: 'orbitTurret', _aim: angle0,
                dmg: player.getDamage(this) * 0.8 * turretMult, owner: player,
                x: player.x + Math.cos(angle0) * 80,
                y: player.y + Math.sin(angle0) * 80,
            };
            t.update = (dt: number, g: GameManager) => {
                t._life -= dt; t._timer -= dt;
                t._fireAnimT = Math.max(0, (t._fireAnimT ?? 0) - dt);
                if (t._life <= 0) { t.alive = false; return; }
                // 超频指令（薇薇安E）：限时伤害/攻速乘区，到期回落
                if (t._buffTimer > 0) {
                    t._buffTimer -= dt;
                    if (t._buffTimer <= 0) { t.dmgMult = 1; t.spdMult = 1; }
                }
                t._angle += t._orbitSpd * dt;
                t.x = player.x + Math.cos(t._angle) * t._orbitR;
                t.y = player.y + Math.sin(t._angle) * t._orbitR;
                if (t._timer <= 0) {
                    t._timer = 0.4 / (t.spdMult ?? 1);
                    const target = g.getNearestEnemy(t.x, t.y);
                    if (target) {
                        const [dx, dy] = Vec.normalize(target.x - t.x, target.y - t.y);
                        t._aim = Math.atan2(dy, dx);
                        t._fireAnimT = 0.18;
                        g.bullets.fire(t.x, t.y, dx, dy, t.dmg * (t.dmgMult ?? 1), {
                            color: '#00aaff', r: 4, owner: 'turret', charKey: 'vivian',
                        });
                    }
                }
            };
            this._turrets.push(t);
        }
    }

    spawnClone(player: any): void {
        // 分身不属于"炮台类词条"，不吃 turretBonus 加成——仅炮台/轨道炮台享受该被动。
        const c: any = {
            x: player.x + 80, y: player.y, r: player.radius,
            alive: true, _timer: 0, _life: 8, owner: player, kind: 'clone',
        };
        this._initSummonActor(c, player.spriteKey ?? `char_token_${player.charId}`, 82, '#d8a6ff', 205);
        c.update = (dt: number, g: GameManager) => {
            c._life -= dt; c._timer -= dt;
            if (c._life <= 0) { c.alive = false; return; }
            c.x += (player.x + 80 - c.x) * 0.05;
            c.y += (player.y - c.y) * 0.05;
            if (c._timer <= 0) {
                c._timer = 0.25;
                const target = g.getNearestEnemy(c.x, c.y);
                if (target) {
                    const [dx, dy] = Vec.normalize(target.x - c.x, target.y - c.y);
                    const dmg = player.getDamage(this) * 0.6;
                    c._aim = Math.atan2(dy, dx);
                    c._actorRequested = 'attack';
                    g.bullets.fire(c.x, c.y, dx, dy, dmg, {
                        color: '#aa66ff', r: 6, owner: 'clone', charKey: player.charId,
                    });
                }
            }
        };
        this._turrets.push(c);
        this._floatText.spawn(player.x, player.y - 50, '暗影分身！', '#aa66ff', 18, true);
        this._particles.hexActivate(player.x, player.y, '#aa66ff');
    }

    /**
     * 炮台军团(turret_army 词条)：持有≥3个"炮台类"词条(tags含'turret')时永久激活，
     * 之后新召唤的炮台数量×3、攻速×1.5（对齐 AugmentDB.ts 的 desc 描述）。
     * 之前的实现是数当前存活炮台实例数≥3，且只在装备瞬间生效一次性提升dmg×1.2——
     * 与描述完全不符（多数玩家装备时并没有3个存活炮台实例），已改为持久 flag。
     */
    checkTurretArmy(player: any): void {
        const turretAugCount = this._augMgr.active.filter(a => (a.tags?.indexOf('turret') ?? -1) >= 0).length;
        const wasActive = !!player.stats?._turretArmyActive;
        // 与 spawnTurret 的动态判定保持一致：≥1 即激活（炮台类词条只有'turret'一种）。
        const nowActive = turretAugCount >= 1;
        if (player.stats) player.stats._turretArmyActive = nowActive;
        if (nowActive && !wasActive) {
            this._floatText.spawn(CANVAS_W / 2, 200, '炮台军团激活！', '#4488ff', 22, true);
        }
    }

    // ── crowd control ────────────────────────────────────────

    slowEnemiesAround(x: number, y: number, radius: number, mult: number, duration: number): void {
        const r2 = radius * radius;
        for (const e of this._enemies) {
            if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 <= r2) {
                e.slowMult   = mult;
                e._slowTimer = duration;
            }
        }
    }

    freezeAllEnemies(duration: number): void {
        for (const e of this._enemies) {
            if (!e.dead) { e.slowMult = 0; e._slowTimer = duration; }
        }
        this._iceZones.push({ x: CANVAS_W / 2, y: CANVAS_H / 2, r: 9999, timer: duration });
        this._audio.playSfx('freeze');
    }

    slowAllEnemies(mult: number, duration: number): void {
        for (const e of this._enemies) {
            if (!e.dead) {
                e.slowMult   = Math.min(e.slowMult || 1, mult);
                e._slowTimer = Math.max(e._slowTimer || 0, duration);
            }
        }
    }

    attractEnemies(x: number, y: number, radius: number): void {
        const r2 = radius * radius;
        for (const e of this._enemies) {
            if (e.dead) continue;
            const dx = x - e.x, dy = y - e.y;
            if (dx * dx + dy * dy <= r2) {
                const dist = Math.hypot(dx, dy) || 1;
                e.knockbackX += (dx / dist) * 8;
                e.knockbackY += (dy / dist) * 8;
            }
        }
        this._particles.explode(x, y, '#cc44ff', radius * 0.4);
    }

    // ── area / aoe damage ────────────────────────────────────

    spawnIceZone(x: number, y: number, r: number, dur: number): void {
        this._iceZones.push({ x, y, r, timer: dur });
        const r2 = r * r;
        for (const e of this._enemies) {
            if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 <= r2) {
                e.slowMult   = 0;
                e._slowTimer = dur;
            }
        }
    }

    spawnDeathZone(x: number, y: number, r: number, dur: number, dps: number): void {
        this._deathZones.push({ x, y, r, timer: dur, dps });
    }

    spawnVortex(player: any): void {
        const x = Math.random() * CANVAS_W;
        const y = Math.random() * PLAYFIELD_BOTTOM;
        const dmg = (player?.getDamage?.(this) ?? 10) * 0.2;
        this.spawnDeathZone(x, y, 80, 8, dmg);
        this._particles.explode(x, y, '#8844ff', 60);
    }

    damageAllEnemies(dmg: number): void {
        for (const e of this._enemies) {
            if (!e.dead) e.takeDamage(dmg, this._player, this);
        }
    }

    /**
     * 宇宙法则(cosmos_law)：激活后5s内所有敌人变色（标记为"友方"），
     * 5s后统一对全场造成各自最大HP×60%的AoE伤害并还原颜色。
     * "互相攻击"部分在 hexblast-py 原版同样未实现互攻AI逻辑（仅变色+延迟AOE），
     * 此处对齐 hexblast-py 的行为，记为已知半成品限制。
     */
    activateCosmos(player: any): void {
        if (this._cosmosActive) return;
        this._cosmosActive = true;
        const savedColors: string[] = [];
        for (let i = 0; i < this._enemies.length; i++) {
            const e = this._enemies[i];
            if (!e.dead) { savedColors[i] = e.color; e.color = '#cc44ff'; }
        }
        this._floatText.spawn(CANVAS_W / 2, 200, '🌌 宇宙法则激活！', '#cc44ff', 28, true);
        this._shake.add(10, 500);
        // 5s 后爆炸结算
        setTimeout(() => {
            for (let i = 0; i < this._enemies.length; i++) {
                const e = this._enemies[i];
                if (!e.dead) {
                    if (savedColors[i]) e.color = savedColors[i];
                    e.takeDamage(e.maxHp * 0.6, player, this);
                }
            }
            this._cosmosActive = false;
            this._shake.add(18, 800);
            this._particles.explode(CANVAS_W / 2, CANVAS_H / 2, '#cc44ff', 200);
        }, 5000);
    }
    private _cosmosActive = false;

    laserSweep(player: any): void {
        const dmg = player.getDamage(this) * 3;
        for (const e of this._enemies) {
            if (e.dead) continue;
            e.takeDamage(dmg, player, this);
            this._particles.hit(e.x, e.y, '#f8f');
        }
        this._shake.add(12, 400);
        this._hitStop.trigger(120);
    }

    triggerRandomAugment(player: any): void {
        const active = this._augMgr.active;
        if (!active.length) return;
        const aug = Rng.pick(active);
        if (aug.onKill) {
            const fake: any = { x: player.x, y: player.y, alive: false };
            aug.onKill(player, fake, 0, this);
        }
    }

    /** Module-level explosion helper (data/AugmentDB.spawnExplosion) exposed as game.spawnExplosion(). */
    spawnExplosion(player: any, x: number, y: number, dmg: number, radius: number): void {
        spawnExplosionHelper(player, x, y, dmg, radius, this);
    }

    /** Convenient pass-throughs for sub-systems ────────────── */

    get screenShake()  { return this._shake; }
    get hitStop()      { return this._hitStop; }
    get floatingText() { return this._floatText; }
    get particles()    { return this._particles; }
    get audio()        { return this._audio; }
    get economy()      { return this._economy; }
    get augManager()      { return this._augMgr; }
    /** Alias — some call sites use game.augmentManager instead of game.augManager. */
    get augmentManager()  { return this._augMgr; }
    get bullets()         { return this._bullets; }
    /** Alias — some call sites use game.bulletPool instead of game.bullets. */
    get bulletPool()       { return this._bullets; }
    /** Shim so BossController's game.enemyBullets?.push({...}) forwards into the pooled bullet system. */
    get enemyBullets() {
        return {
            push: (b: any) => this._bullets.spawn({
                x: b.x, y: b.y, vx: b.vx, vy: b.vy,
                damage: b.damage, radius: b.radius ?? 6,
                color: b.color ?? '#ff8844', owner: 'enemy',
                isEnemyBullet: true, homing: b.homing ?? false,
                lifeTime: b.life ?? 3,
                enemyFx: b.enemyFx,
                pierceShield: b.pierceShield ?? false,
                dot: b.dot,
                bounceLeft: b.bounceLeft ?? 0,
                bounceExplode: b.bounceExplode ?? false,
                explodeOnExpire: b.explodeOnExpire ?? false,
                srcBossTag: b.srcBossTag,
            }),
        };
    }
    /** 清除带来源标记的在场敌弹（Boss 升空"直接消失"时带走自己的弹幕）。 */
    clearTaggedEnemyBullets(tag: string): void {
        this._bullets.clearTaggedEnemyBullets(tag);
    }
    get turrets()      { return this._turrets; }
    get input()        { return this._input; }
    get enemies()      { return this._enemies as readonly EnemyBase[]; }
    get player()       { return this._player; }
    get runId()        { return this._runId; }
    get wave()         { return this._wave; }
    get chapter()      { return this._chapter; }

    // ── shop item applicator ──────────────────────────────────

    private _applyShopItem(item: ShopItem) {
        const p = this._player;
        switch (item.effect) {
            case 'heal':   p.heal(item.value ?? 30); break;
            case 'maxhp':  p.maxHp += (item.value ?? 20); p.hp += (item.value ?? 20); break;
            case 'shield': p.maxShield += (item.value ?? 20); p.shield = p.maxShield; break;
            case 'speed':  p.moveSpeed *= 1 + (item.value ?? 0.1); break;
            case 'damage': p.damageMulti *= 1 + (item.value ?? 0.15); break;
            case 'augment':
                const opts = this._augMgr.rollOptions(3, this._waveMgr.wave, p.charId);
                // 商店与强化选择都是全屏模态层。两者同时 active 时，创建顺序较早
                // 的强化卡会透过商店半透明底板显示，形成“售罄后商店突然透明”的
                // 视觉穿帮。购买神秘强化时暂停商店，选完再原样恢复售罄状态。
                this._shopUI.hide();
                this._augUI.show(opts, (aug) => {
                    if (aug) this._augMgr.equip(aug, p, this);
                    this._shopUI.resume();
                });
                break;
        }
    }

    // ── boss ref ──────────────────────────────────────────────
    private _boss?: BossController;
}
