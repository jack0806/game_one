import {
    _decorator, Component, Node, Graphics, Color, Vec2, Vec3,
    UITransform, director, game, Label, Sprite
} from 'cc';
import { CANVAS_W, CANVAS_H, DT_MAX } from './Constants';
import { Vec, Rng } from './MathUtils';
import { applyArtSprite, SpriteNodePool } from './SpriteUtils';
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
import { ScreenShake, HitStop, FloatingText } from '../systems/EffectSystem';
import { InputManager }      from '../systems/InputManager';
import { ParticleManager }   from '../systems/ParticleManager';
import { HUD, HudData }      from '../ui/HUD';
import { AugSelectUI }       from '../ui/AugSelectUI';
import { ShopUI }            from '../ui/ShopUI';
import { ScreenManager }     from '../ui/ScreenManager';

const { ccclass, property } = _decorator;

export type GameState =
    | 'menu' | 'charSelect' | 'playing'
    | 'augSelect' | 'shop' | 'gameover'
    | 'chapterClear' | 'paused';

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
    private _gameLayer!:     Node;
    private _particleLayer!: Node;
    private _uiLayer!:       Node;
    private _gameGfx!:       Graphics;   // entities draw here
    private _particleGfx!:   Graphics;   // particles draw here
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

    // ── ui ────────────────────────────────────────────────────
    private _hud!:        HUD;
    private _augUI!:      AugSelectUI;
    private _shopUI!:     ShopUI;
    private _screenMgr!:  ScreenManager;

    // ── game state ────────────────────────────────────────────
    state:             GameState = 'menu';
    private _char?:    CharDef;
    private _wave      = 0;
    private _chapter   = 0;
    private _mutations: string[] = [];
    private _runId = 0;

    // ── extra runtime state (turrets / zones / enemy bullets / stats) ──
    private _turrets:      any[] = [];
    private _deathZones:   { x: number; y: number; r: number; timer: number; dps: number }[] = [];
    private _iceZones:     { x: number; y: number; r: number; timer: number }[] = [];

    /** Written by EnemyBase._die() / read by combo-related augments & HUD. */
    score       = 0;
    kills       = 0;
    comboCount  = 0;
    comboTimer  = 0;

    /** Written by WaveData mutation defs' apply(game) hooks (endless mode). */
    _mutationMods: Record<string, any> = {};

    // ── lifecycle ─────────────────────────────────────────────

    onLoad() {
        GameManager.inst = this;
        this._initLayers();
        this._initSystems();
        this._initUI();
        this._initFloatTextPool();
        this._setState('menu');
    }

    update(rawDt: number) {
        const dt = Math.min(rawDt, DT_MAX);

        // Hit-stop pauses combat simulation, but movement/input must stay responsive.
        if (this._hitStop.active) {
            this._hitStop.update(rawDt);
            if (this.state === 'playing' && this._player?.alive) {
                this._player.tickMovement(dt, this._input);
                if (this._input.justPressed('Escape')) this._setState('paused');
            }
            this._renderFrame();
            return;
        }

        if (this.state === 'playing') {
            this._updatePlaying(dt);
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
        // 修复背景拉伸变形：改用TRIMMED模式保持原始宽高比，居中裁切填充Canvas
        this._bgSprite.sizeMode = Sprite.SizeMode.TRIMMED;
        this._bgSprite.trim = false; // 保留完整画布尺寸，让bg图填满背景

        // GameLayer — entity graphics
        this._gameLayer = new Node('GameLayer');
        this._gameLayer.setParent(this.node);
        this._gameGfx = this._gameLayer.addComponent(Graphics);
        this._gameLayer.addComponent(UITransform)
            .setContentSize(CANVAS_W, CANVAS_H);

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
        this._economy   = new Economy();
        // _gameLayer already exists here — _initLayers() runs before _initSystems() in onLoad() —
        // so pooled bullets can get their permanent Sprite nodes parented immediately.
        this._bullets   = new BulletPool(256, this._gameLayer);
        this._augMgr    = new AugmentManager();
        this._waveMgr   = new WaveManager();

        // Wire WaveManager callbacks
        this._waveMgr.onSpawnEnemy  = (type)  => this.spawnEnemy(type);
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
    }

    // ── state machine ─────────────────────────────────────────

    private _setState(s: GameState) {
        this.state = s;
        this._screenMgr.hideAll();
        this._hud.node.active      = (s === 'playing');
        this._augUI.node.active    = false;
        this._shopUI.node.active   = false;

        switch (s) {
            case 'menu':         this._screenMgr.show('menu');         break;
            case 'charSelect':   this._screenMgr.show('charSelect');   break;
            case 'gameover':     this._screenMgr.show('gameover');     break;
            case 'chapterClear': this._screenMgr.show('chapterClear'); break;
            case 'paused':       this._screenMgr.show('pause');        break;
            case 'playing':      /* HUD already active */              break;
            // 'shop' / 'augSelect' 面板不归 ScreenManager 管理，由调用方
            // 各自 show() 自己的 UI；这里只需确保上一个面板已被 hideAll() 清掉。
            case 'shop':
            case 'augSelect':    break;
        }
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
        this._mutationMods = {};
        this._economy.reset();
        this._augMgr.reset();
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
    }

    private _continueAfterChapter() {
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
        this._economy.update(dt, this._player);

        // Screen shake
        this._shake.update(dt);
        if (this._shake.x !== 0 || this._shake.y !== 0) {
            this._gameLayer.setPosition(new Vec3(
                this._shake.x, this._shake.y, 0));
        } else {
            this._gameLayer.setPosition(Vec3.ZERO);
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

    private _drawEntities() {
        const g = this._gameGfx;
        g.clear();

        // Background is now the _bgSprite layer (bg_chapter<N>, set in _updateBgForChapter()),
        // sitting behind _gameLayer — no more opaque fillRect here, or it would hide the art.
        if (this.state !== 'playing') return;

        // Gold drops
        for (const drop of this._economy.drops) {
            const [dx, dy] = this._toLocal(drop.x, drop.y);
            g.fillColor = new Color(255, 200, 40, 200);
            g.fillRect(dx - 6, dy - 6, 12, 12);
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

        // Turrets / clones
        for (const t of this._turrets) {
            if (!t.alive) continue;
            const [tx, ty] = this._toLocal(t.x, t.y);
            g.fillColor = t.kind === 'clone'
                ? new Color(170, 90, 255, 230)
                : new Color(0, 170, 255, 220);
            g.circle(tx, ty, t.r ?? 10); g.fill();
            g.strokeColor = new Color(255, 255, 255, 200);
            g.lineWidth = 2; g.circle(tx, ty, (t.r ?? 10) + 3); g.stroke();
        }

        // Enemies — Sprite node carries the visual, Graphics only draws the HP bar
        // and the hit-flash overlay (flashTimer, previously a dead field, now used here).
        for (const e of this._enemies) {
            if (e.dead) continue;
            const r = e.radius ?? 18;
            const [ex, ey] = this._toLocal(e.x, e.y);
            if (e.node) e.node.setPosition(ex, ey, 0);

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

            // HP bar over enemy
            if (!e.isBoss) {
                const bw = r * 2.2, bh = 4;
                const [rx, ry, rw, rh] = this._toLocalRect(e.x - bw / 2, e.y - r - 10, bw, bh);
                g.fillColor = new Color(40, 40, 40, 180);
                g.fillRect(rx, ry, rw, rh);
                g.fillColor = new Color(220, 60, 60, 230);
                g.fillRect(rx, ry, rw * (e.hp / e.maxHp), rh);
            }
        }

        // Bullets — player bullets with art carry a Sprite node (positioned here);
        // turret/enemy bullets have no active node and keep the cheap Graphics dot.
        for (const b of this._bullets.active) {
            const [bx, by] = this._toLocal(b.x, b.y);
            if (b.node && b.node.active) {
                b.node.setPosition(bx, by, 0);
                continue;
            }
            g.fillColor = Color.fromHEX(new Color(), b.color ?? '#ffff80');
            g.circle(bx, by, b.radius ?? 5); g.fill();
        }

        // Player — Sprite node (char_<id> battle token, set up in PlayerController.init)
        // carries the visual; Graphics only draws the shield ring overlay.
        if (this._player && !this._player.dead) {
            const p = this._player;
            const [px, py] = this._toLocal(p.x, p.y);
            p.node.setPosition(px, py, 0);
            // Shield ring
            if (p.shield > 0) {
                g.strokeColor = new Color(80, 160, 255, 180);
                g.lineWidth = 3;
                g.circle(px, py, (p.radius ?? 20) + 6); g.stroke();
            }
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
                    const glowR = (p.radius ?? p.size) * 2.4;
                    g.fillColor = new Color(c.r, c.g, c.b, Math.floor(alpha * 0.22));
                    g.circle(px, py, glowR); g.fill();
                    g.fillColor = new Color(c.r, c.g, c.b, Math.floor(alpha * 0.45));
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
            node.setPosition(fx_x, fx_y, 0);

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

            sprite.color = new Color(255, 255, 255, alpha);

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
            node.setPosition(new Vec3(lx, ly, 0));
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
        if (e === this._boss) this._boss = undefined;
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
        this._setState('gameover');
    }

    // ── turret / clone summon system ────────────────────────────

    spawnTurret(player: any, dmgMult = 1): void {
        // 被动：炮台类词条效果×1.5（对齐 CharacterDB.ts vivian 的 desc 描述）
        const turretMult = player.stats?.turretBonus || 1;
        // 炮台军团(turret_army)：持有≥3个"炮台类"词条(tags含'turret')时，
        // 数量×3、攻速×1.5（对齐 AugmentDB.ts 的 desc 描述）。每次召唤时动态判定，
        // 不缓存 flag —— 避免"先装turret_army、后补满3个炮台词条"时永远不生效的顺序依赖问题。
        const armyActive = this._augMgr.active.filter(a => (a.tags?.indexOf('turret') ?? -1) >= 0).length >= 3;
        const spawnCount  = armyActive ? 3 : 1;
        const fireInterval = armyActive ? 0.6 / 1.5 : 0.6;
        for (let n = 0; n < spawnCount; n++) {
            const t: any = {
                x: player.x + (Math.random() - 0.5) * 100,
                y: player.y + (Math.random() - 0.5) * 100,
                r: 10, alive: true, _timer: 0,
                dmg: player.getDamage(this) * dmgMult * turretMult,
                owner: player, _life: 12,
            };
            t.update = (dt: number, g: GameManager) => {
                t._life -= dt; t._timer -= dt;
                if (t._life <= 0) { t.alive = false; return; }
                if (t._timer <= 0) {
                    t._timer = fireInterval;
                    const target = (t.focusTarget && !t.focusTarget.dead) ? t.focusTarget : g.getNearestEnemy(t.x, t.y);
                    if (target) {
                        const [dx, dy] = Vec.normalize(target.x - t.x, target.y - t.y);
                        g.bullets.fire(t.x, t.y, dx, dy, t.dmg, { color: '#2af', r: 5, owner: 'turret' });
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
                r: 8, alive: true, _timer: 0, _life: 8,
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
                        g.bullets.fire(t.x, t.y, dx, dy, t.dmg, { color: '#00aaff', r: 4, owner: 'turret' });
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
                    g.bullets.fire(c.x, c.y, dx, dy, dmg, { color: '#aa66ff', r: 6, owner: 'clone' });
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
        const nowActive = turretAugCount >= 3;
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
        const y = Math.random() * CANVAS_H;
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
            case 'heal':   p.hp = Math.min(p.maxHp, p.hp + (item.value ?? 30)); break;
            case 'maxhp':  p.maxHp += (item.value ?? 20); p.hp += (item.value ?? 20); break;
            case 'shield': p.maxShield += (item.value ?? 20); p.shield = p.maxShield; break;
            case 'speed':  p.moveSpeed *= 1 + (item.value ?? 0.1); break;
            case 'damage': p.damageMulti *= 1 + (item.value ?? 0.15); break;
            case 'augment':
                const opts = this._augMgr.rollOptions(3, this._waveMgr.wave, p.charId);
                this._augUI.show(opts, (aug) => {
                    if (aug) this._augMgr.equip(aug, p, this);
                });
                break;
        }
    }

    // ── boss ref ──────────────────────────────────────────────
    private _boss?: BossController;
}
