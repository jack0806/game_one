import {
    _decorator, Component, Node, Graphics, Color, Vec2, Vec3,
    UITransform, director, game, Label, Sprite, view, ResolutionPolicy
} from 'cc';
import { CANVAS_W, CANVAS_H, PLAYFIELD_BOTTOM, DT_MAX } from './Constants';
import { Vec, Rng, clamp } from './MathUtils';
import { applyArtSprite, preloadArt, SpriteNodePool } from './SpriteUtils';
import { styleLabel } from './LabelUtils';
import { CharDef, CHARS } from '../data/CharacterDB';
import { AugDef, spawnExplosion as spawnExplosionHelper } from '../data/AugmentDB';
import { CHAPTERS, MUTATIONS } from '../data/WaveData';
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
import { ParticleManager }   from '../systems/ParticleManager';
import { AudioManager, BgmCue } from '../systems/AudioManager';
import { advanceLocomotion, LocomotionPose } from './Locomotion';
import {
    directionalArtKey, directionalArtKeys, DirectionalFacingPose, updateDirectionalFacing,
} from './DirectionalFacing';
import { HUD, HudData }      from '../ui/HUD';
import { AugSelectUI }       from '../ui/AugSelectUI';
import { ShopUI }            from '../ui/ShopUI';
import { ScreenManager }     from '../ui/ScreenManager';
import { StatsPanel, StatsPanelData } from '../ui/StatsPanel';

const { ccclass, property } = _decorator;

export type GameState =
    | 'menu' | 'charSelect' | 'playing'
    | 'augSelect' | 'shop' | 'gameover'
    | 'chapterClear' | 'paused' | 'stats';

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
    /** One-shot art FX (explosion/heal/poison/cold_arrow/hex_ring), synced from ParticleManager.spriteFx each frame. */
    private _fxPool!:        SpriteNodePool;

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

    // ── game state ────────────────────────────────────────────
    state:             GameState = 'menu';
    private _char?:    CharDef;
    private _wave      = 0;
    private _chapter   = 0;
    private _mutations: string[] = [];
    private _runId = 0;
    private _visualTime = 0;
    private _visualDt = 0;

    // ── extra runtime state (turrets / zones / enemy bullets / stats) ──
    private _turrets:      any[] = [];
    private _deathZones:   { x: number; y: number; r: number; timer: number; dps: number }[] = [];
    private _iceZones:     { x: number; y: number; r: number; timer: number }[] = [];

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
        // 始终完整显示16:9设计画布；窄窗口采用等比缩放+留边，不能再裁掉HUD/技能区。
        view.setDesignResolutionSize(CANVAS_W, CANVAS_H, ResolutionPolicy.SHOW_ALL);
        this._initLayers();
        this._initSystems();
        this._initUI();
        this._initFloatTextPool();
        this._setState('menu');

    }

    update(rawDt: number) {
        const dt = Math.min(rawDt, DT_MAX);
        this._visualDt = dt;
        this._visualTime += dt;
        this._audio.update(dt);

        // Hit-stop pauses combat simulation, but movement/input must stay responsive.
        if (this._hitStop.active) {
            this._hitStop.update(rawDt);
            if (this.state === 'playing' && this._player?.alive) {
                this._player.tickMovement(dt, this._input);
                if (this._input.justPressed('Escape')) this._setState('paused');
                if (this._input.isKeyMPressed()) this._openStats();
            }
            this._renderFrame();
            return;
        }

        if (this.state === 'playing') {
            this._updatePlaying(dt);
        } else if (this.state === 'stats') {
            // 再按一次 M（或 Esc）从详情面板返回战斗；Esc 直接回战斗而不是
            // 进暂停菜单，避免"面板→菜单"两层套娃。
            if (this._input.isKeyMPressed() || this._input.justPressed('Escape')) {
                this._setState('playing');
            }
        }

        this._renderFrame();
    }

    // ── init helpers ──────────────────────────────────────────

    private _initLayers() {
        // BgLayer — chapter background image (bg_chapter<N>), sits behind everything.
        // Created first so its sibling index is lowest (drawn first / at the back).
        this._bgLayer = new Node('BgLayer');
        this._bgLayer.setParent(this.node);
        this._bgLayer.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
        this._bgSprite = this._bgLayer.addComponent(Sprite);
        // 四章背景资源均为 16:9。固定 CUSTOM 尺寸可确保异步挂载 SpriteFrame 后
        // 仍严格填满 1280×720，不被 TRIMMED 模式恢复成 2560×1440 后过度裁切。
        this._bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this._bgSprite.trim = false;

        // 中性色罩放在背景图之上、所有战斗实体之下。按章节调整强度，压低
        // 高饱和裂纹/网格/电路的视觉竞争，同时保留边缘环境主题。
        const bgTone = new Node('BgTone');
        bgTone.setParent(this._bgLayer);
        bgTone.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
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

        // Wire screen callbacks
        this._screenMgr.onPlayPressed     = () => this._setState('charSelect');
        this._screenMgr.onCharSelected    = (c) => this._startGame(c);
        this._screenMgr.onRestartPressed  = () => this._restartGame();
        this._screenMgr.onMainMenuPressed = () => {
            this._clearRunEntities();
            this._setState('menu');
        };
        this._screenMgr.onContinuePressed = () => this._continueAfterChapter();
        this._screenMgr.onResumePressed   = () => this._setState('playing');
        this._screenMgr.onButtonSfx       = () => {
            this._audio.resume();
            this._audio.playSfx('button');
        };
        this._augUI.onButtonSfx  = () => this._audio.playSfx('button');
        this._augUI.onPickSfx    = () => this._audio.playSfx('augment_pick');
        this._shopUI.onButtonSfx = () => this._audio.playSfx('button');
        this._shopUI.onBuySfx    = () => this._audio.playSfx('buy');
    }

    // ── state machine ─────────────────────────────────────────

    private _setState(s: GameState) {
        this.state = s;
        this._screenMgr.hideAll();
        this._hud.node.active      = (s === 'playing');
        this._augUI.node.active    = false;
        this._shopUI.node.active   = false;
        this._statsUI.node.active  = false;

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
            // 'shop' / 'augSelect' 面板不归 ScreenManager 管理，由调用方
            // 各自 show() 自己的 UI；这里只需确保上一个面板已被 hideAll() 清掉。
            // 'stats' 同理：StatsPanel 由 _openStats() 激活并填充数据。
            case 'shop':         this._audio.playBgm('shop');          break;
            case 'augSelect':    break;
            case 'stats':        break;
        }
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
        this._bgLayer.getComponent(UITransform)!.setContentSize(CANVAS_W, CANVAS_H);
        this._applyBackgroundTone(this._chapter);
    }

    /** 四章独立背景调色：越靠后原图荧光越强，覆盖强度相应提高。 */
    private _applyBackgroundTone(chapterIndex: number) {
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
        g.fillRect(-CANVAS_W / 2, -CANVAS_H / 2, CANVAS_W, CANVAS_H);
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
                -CANVAS_W * band.sx / 2, -CANVAS_H * band.sy / 2,
                CANVAS_W * band.sx, CANVAS_H * band.sy,
            );
        }
    }

    private _restartGame() {
        this._startGame(this._char ?? CHARS[0]!);
    }

    private _clearRunEntities() {
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
        this._bullets?.reset();
        this._fxPool?.releaseAll();
        this._coinPool?.releaseAll();
        this._turretBasePool?.releaseAll();
        this._turretBarrelPool?.releaseAll();
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

        // Player
        this._player.tick(dt, input, this);

        // Enemies
        for (let i = this._enemies.length - 1; i >= 0; i--) {
            const e = this._enemies[i];
            e.update(dt, this._player, this);
            // Sprite node isn't pooled (spawnEnemy() creates a fresh one each time,
            // like the original Graphics-only version created a fresh Node) — must
            // destroy it here or dead enemies' sprites keep sitting on screen forever.
            if (e.dead) {
                if (e === this._boss) this._boss = undefined;
                e.node?.destroy();
                this._enemies.splice(i, 1);
            }
        }

        // Bullets
        this._bullets.update(dt, this._enemies, this._player, this);
        this._bullets.updateEnemyBullets(dt, this._player, this);

        // Turrets / clones
        for (let i = this._turrets.length - 1; i >= 0; i--) {
            const t = this._turrets[i];
            if (!t.alive) { this._turrets.splice(i, 1); continue; }
            t.update?.(dt, this);
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

        // Wave manager
        this._waveMgr.update(dt, this);

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

        // Pause toggle
        if (input.justPressed('Escape')) { this._setState('paused'); }
    }

    // ── render loop ───────────────────────────────────────────

    private _renderFrame() {
        this._drawEntities();
        this._drawParticles();
        this._drawSpriteFx();
        if (this.state === 'playing') {
            this._hud.refresh(this._buildHudData());
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
        return [x - CANVAS_W / 2, CANVAS_H / 2 - y];
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
        const key = directionalArtKey(entity.spriteKey, facing.view, pose.frameIndex);
        if (!entity.sprite || !key || entity.locomotionFrameKey === key) return;
        entity.locomotionFrameKey = key;
        applyArtSprite(entity.sprite, key);
    }
    private _drawEntities() {
        const g = this._gameGfx;
        g.clear();
        this._turretBasePool.releaseAll();
        this._turretBarrelPool.releaseAll();

        // Background is now the _bgSprite layer (bg_chapter<N>, set in _updateBgForChapter()),
        // sitting behind _gameLayer — no more opaque fillRect here, or it would hide the art.
        if (this.state !== 'playing') return;

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

        // Turrets / clones — 用明确的底座、炮管和朝向替代“蓝色圆圈占位”。
        for (const t of this._turrets) {
            if (!t.alive) continue;
            const [tx, ty] = this._toLocal(t.x, t.y);
            const r = t.r ?? 10;
            g.fillColor = new Color(0, 0, 0, 100);
            g.ellipse(tx, ty - r * 0.72, r * 1.15, r * 0.34); g.fill();

            if (t.kind === 'clone') {
                // 分身使用角形人形剪影，与机械炮台明确区分。
                const drawCloneBody = () => {
                    g.moveTo(tx, ty + r * 1.15);
                    g.lineTo(tx + r * 0.58, ty + r * 0.38);
                    g.lineTo(tx + r * 0.42, ty - r * 0.75);
                    g.lineTo(tx, ty - r * 1.05);
                    g.lineTo(tx - r * 0.42, ty - r * 0.75);
                    g.lineTo(tx - r * 0.58, ty + r * 0.38);
                    g.close();
                };
                g.fillColor = new Color(52, 20, 82, 225);
                drawCloneBody(); g.fill();
                g.strokeColor = new Color(205, 120, 255, 235);
                g.lineWidth = 2; drawCloneBody(); g.stroke();
                g.fillColor = new Color(235, 200, 255, 240);
                g.moveTo(tx, ty + r * 0.58);
                g.lineTo(tx + r * 0.25, ty + r * 0.18);
                g.lineTo(tx, ty - r * 0.12);
                g.lineTo(tx - r * 0.25, ty + r * 0.18);
                g.close(); g.fill();
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
            applyArtSprite(barrelSp, 'turret_barrel_vivian');
            const barrelTransform = barrel.getComponent(UITransform)!;
            barrelTransform.setContentSize(barrelW, barrelH);
            // 生成图的机械枢轴位于原画宽度约36%，把锚点放到枢轴后旋转时
            // 炮管围绕底座中心转动，而不是围绕图片几何中心公转。
            barrelTransform.setAnchorPoint(0.36, 0.5);
            barrel.setPosition(Math.round(tx), Math.round(ty), 0);
            barrel.setRotationFromEuler(0, 0, -(t._aim ?? 0) * 180 / Math.PI);
        }

        // Enemies — Sprite node carries the visual, Graphics only draws the HP bar
        // and the hit-flash overlay (flashTimer, previously a dead field, now used here).
        for (const e of this._enemies) {
            if (e.dead) continue;
            const r = e.radius ?? 18;
            const visualR = r * (e.visualScale ?? 1);
            const [ex, ey] = this._toLocal(e.x, e.y);
            const walkPose = advanceLocomotion(
                e.locomotion, e.x, e.y, this._visualDt, visualR * 2, e.locomotionKind,
            );
            // 敌人的脸始终朝英雄；远程怪后撤和 Boss 横移时也不会背对目标。
            const faceDx = this._player ? this._player.x - e.x : walkPose.directionX;
            const faceDy = this._player ? this._player.y - e.y : walkPose.directionY;
            const facingPose = updateDirectionalFacing(
                e.directionalFacing, faceDx, faceDy, this._visualDt,
            );

            // 常驻圆形底盘/描边会让所有单位像棋子。改为低矮接触阴影，只负责
            // 把脚底从背景纹理中分离；危险圆环仅在攻击前摇期间出现。
            g.fillColor = new Color(0, 0, 0, e.isBoss ? 125 : 88);
            g.ellipse(
                ex, ey - visualR * 0.72,
                visualR * (e.isBoss ? 0.72 : 0.62), visualR * 0.18,
            ); g.fill();
            this._syncDirectionalFrame(e, walkPose, facingPose);

            if (e.node) {
                e.node.setPosition(Math.round(ex), Math.round(ey + walkPose.bodyLift), 0);
                const facing = facingPose.mirror;
                e.node.setScale(new Vec3(facing * facingPose.turnScaleX, 1, 1));
                e.node.setRotationFromEuler(
                    0, 0, walkPose.bodyRollDeg * facing + facingPose.turnLeanDeg,
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
                g.fillColor = new Color(warning.r, warning.g, warning.b, 28 + Math.floor(progress * 55));
                g.circle(ex, ey, dangerR + 10); g.fill();
                g.strokeColor = new Color(warning.r, warning.g, warning.b, 170 + Math.floor(progress * 85));
                g.lineWidth = 2.5 + progress * 2.5;
                g.circle(ex, ey, dangerR); g.stroke();
                const [tx, ty] = this._toLocal(e.attackTargetX, e.attackTargetY);
                g.strokeColor = new Color(255, 235, 210, 150 + Math.floor(progress * 100));
                g.lineWidth = 1.5 + progress;
                g.moveTo(ex, ey); g.lineTo(tx, ty); g.stroke();
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
                e.sprite.color = Color.fromHEX(new Color(), e.tintColor ?? '#ffffff');
            }

            // HP bar over enemy — 仅受伤后显示，避免满血时的视觉噪音
            if (!e.isBoss && e.hp < e.maxHp) {
                const bw = Math.max(r * 2.2, visualR * 1.55), bh = 6;
                const [rx, ry, rw, rh] = this._toLocalRect(e.x - bw / 2, e.y - visualR - 10, bw, bh);
                g.fillColor = new Color(40, 40, 40, 180);
                g.fillRect(rx, ry, rw, rh);
                g.fillColor = new Color(220, 60, 60, 230);
                g.fillRect(rx, ry, rw * (e.hp / e.maxHp), rh);
                // 护盾剩余：血条上方细蓝条
                if (e.shieldActive && e.shieldHp > 0 && e.maxShieldHp > 0) {
                    const sh = 3;
                    const [sx, sy, sw, shh] = this._toLocalRect(e.x - bw / 2, e.y - visualR - 10 - sh, bw, sh);
                    g.fillColor = new Color(90, 170, 255, 220);
                    g.fillRect(sx, sy, sw * (e.shieldHp / e.maxShieldHp), shh);
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
                switch (b.enemyFx) {
                    case 'poison':
                        g.strokeColor = new Color(80, 255, 60, 220);
                        g.lineWidth = 2; g.circle(bx, by, r + 2); g.stroke();
                        g.strokeColor = new Color(40, 160, 30, 140);
                        g.lineWidth = 3; g.circle(bx, by, r * 1.6); g.stroke();
                        break;
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
                }
            }
        }

        // Player — Sprite node (char_<id> battle token, set up in PlayerController.init)
        // carries the visual; Graphics only draws the shield ring overlay.
        if (this._player && !this._player.dead) {
            const p = this._player;
            const [px, py] = this._toLocal(p.x, p.y);
            const walkPose = advanceLocomotion(
                p.locomotion, p.x, p.y, this._visualDt, 82, 'biped',
            );
            const facingPose = updateDirectionalFacing(
                p.directionalFacing,
                this._input.mouse.x - p.x,
                this._input.mouse.y - p.y,
                this._visualDt,
            );
            // 只保留无色接触阴影。身份色椭圆会穿过双腿之间，看起来像一根绿线。
            g.fillColor = new Color(0, 0, 0, 125);
            g.ellipse(px, py - 25, 21, 6.5); g.fill();
            this._syncDirectionalFrame(p, walkPose, facingPose);
            p.node.setPosition(Math.round(px), Math.round(py + walkPose.bodyLift), 0);
            // 移动时由完整动作帧和轻微重心倾斜表达步态；静止保留极轻呼吸。
            // 呼吸只允许等比缩放。旧版横向放大时纵向同时缩小，角色会周期性
            // 变胖/变瘦，看起来像素材被拉伸；移动时仍完全关闭呼吸缩放。
            const breathe = walkPose.moving ? 0 : Math.sin(this._visualTime * 3.2) * 0.006;
            const facing = facingPose.mirror;
            const uniformScale = 1 + breathe;
            p.node.setScale(new Vec3(
                facing * facingPose.turnScaleX * uniformScale, uniformScale, 1,
            ));
            p.node.setRotationFromEuler(
                0, 0, walkPose.bodyRollDeg * facing + facingPose.turnLeanDeg,
            );
        }
    }

    private _drawParticles() {
        const g = this._particleGfx;
        g.clear();
        if (this.state !== 'playing') return;

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
        if (this.state !== 'playing') return;

        for (const fx of this._particles.spriteFx) {
            const node = this._fxPool.acquire();
            if (!node) break; // pool exhausted — extremely unlikely at 24 slots, just skip the rest

            const sprite = node.getComponent(Sprite)!;
            applyArtSprite(sprite, fx.key);

            const [fx_x, fx_y] = this._toLocal(fx.x, fx.y);
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

            const popIn = progress < 0.12 ? (progress / 0.12) : 1;
            const growth = 1 + progress * 0.35;
            const scaleT = (0.6 + 0.4 * popIn) * growth;

            const fadeT = progress < 0.6 ? 1 : Math.max(0, 1 - (progress - 0.6) / 0.4);
            const alpha = Math.floor(fadeT * 255);

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


    /** Spawn an enemy of the given type. If x/y omitted, spawns just outside a random edge. */
    spawnEnemy(type: string, x?: number, y?: number): EnemyBase {
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
            boss.initBoss(this._chapter, this);
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

        enemy.locomotionFrameKey = enemy.spriteKey;
        preloadArt(directionalArtKeys(enemy.spriteKey));
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
        if (idx >= 0) this._enemies.splice(idx, 1);
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
        this._particles.explode(this._player.x, this._player.y, '#40c8ff');
        this._audio.playSfx('player_die');
        this._recordRun(false);
        this._setState('gameover');
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
                if (t._life <= 0) { t.alive = false; return; }
                if (t.followOwner) {
                    const targetX = player.x + t._followX;
                    const targetY = player.y + t._followY;
                    const followT = Math.min(1, dt * 9);
                    t.x += (targetX - t.x) * followT;
                    t.y += (targetY - t.y) * followT;
                }
                if (t._timer <= 0) {
                    t._timer = fireInterval;
                    const target = (t.focusTarget && !t.focusTarget.dead) ? t.focusTarget : g.getNearestEnemy(t.x, t.y);
                    if (target) {
                        const [dx, dy] = Vec.normalize(target.x - t.x, target.y - t.y);
                        t._aim = Math.atan2(dy, dx);
                        g.bullets.fire(t.x, t.y, dx, dy, t.dmg, {
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
                if (t._life <= 0) { t.alive = false; return; }
                t._angle += t._orbitSpd * dt;
                t.x = player.x + Math.cos(t._angle) * t._orbitR;
                t.y = player.y + Math.sin(t._angle) * t._orbitR;
                if (t._timer <= 0) {
                    t._timer = 0.4;
                    const target = g.getNearestEnemy(t.x, t.y);
                    if (target) {
                        const [dx, dy] = Vec.normalize(target.x - t.x, target.y - t.y);
                        t._aim = Math.atan2(dy, dx);
                        g.bullets.fire(t.x, t.y, dx, dy, t.dmg, {
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
            }),
        };
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
