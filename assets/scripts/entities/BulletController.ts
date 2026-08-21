// ============================================================
//  BulletController.ts — 子弹对象池（Cocos Creator 3.x）
// ============================================================
import { Node, Sprite, Color, UITransform } from 'cc';
import { Vec, Rng, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';
import { applyArtSprite } from '../core/SpriteUtils';

export interface BulletData {
    active:       boolean;
    x: number;   y: number;
    vx: number;  vy: number;
    damage:       number;
    radius:       number;
    pierce:       number;
    pierceLeft:   number;
    bounce:       number;
    bounceLeft:   number;
    lifeTime:     number;
    life:         number;
    color:        string;
    owner:        string;
    charKey:      string;
    hitEnemies:   Set<any>;
    isCrit:       boolean;
    onHitCb:      ((b: BulletData, e: any) => void) | null;
    novaMode:     boolean;
    infinite:     boolean;
    isEnemyBullet: boolean;
    homing:       boolean;
    /** 敌弹特效标签：boss 按章节弹种附加可辨识尾迹/轮廓（毒球/齿轮/追踪/混沌）。 */
    enemyFx?:     'poison' | 'gear' | 'homing' | 'chaos';
    trailCd?:     number;
    /** Sprite node carrying bullet_<charKey> art; enemy bullets use programmatic threat shapes. */
    node?:        Node;
    sprite?:      Sprite;
    [key: string]: any;
}

/** Every pooled bullet permanently owns a Node+Sprite (parented once, toggled active/inactive) — avoids per-shot new Node()/destroy() churn. */
function makeBullet(parent?: Node): BulletData {
    let node: Node | undefined;
    let sprite: Sprite | undefined;
    if (parent) {
        node = new Node('Bullet');
        node.setParent(parent);
        node.addComponent(UITransform).setContentSize(10, 10);
        sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        node.active = false;
    }
    return {
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        damage: 10, radius: 5, pierce: 0, pierceLeft: 0,
        bounce: 0, bounceLeft: 0, lifeTime: 1.5, life: 0,
        color: '#00ffcc', owner: 'player', charKey: '',
        hitEnemies: new Set(), isCrit: false, onHitCb: null,
        novaMode: false, infinite: false, isEnemyBullet: false, homing: false,
        enemyFx: undefined, trailCd: 0,
        node, sprite,
    };
}

function resetBullet(b: BulletData): void {
    b.active = false; b.x = 0; b.y = 0; b.vx = 0; b.vy = 0;
    b.damage = 10; b.radius = 5; b.pierce = 0; b.pierceLeft = 0;
    b.bounce = 0; b.bounceLeft = 0; b.lifeTime = 1.5; b.life = 0;
    b.color = '#00ffcc'; b.owner = 'player'; b.charKey = '';
    b.hitEnemies.clear(); b.isCrit = false; b.onHitCb = null;
    b.novaMode = false; b.infinite = false; b.isEnemyBullet = false; b.homing = false;
    b.enemyFx = undefined; b.trailCd = 0;
    // node/sprite are left untouched here — they're permanent per-slot resources,
    // toggled active/inactive in spawn()/_release(), not reallocated.
    if (b.node) b.node.active = false;
}

export class BulletPool {
    private _pool:   BulletData[] = [];
    private _active: BulletData[] = [];
    /** Parent for pooled bullets' Sprite nodes; undefined in headless/test contexts (no Node created). */
    private _parent?: Node;

    constructor(size = 400, parent?: Node) {
        this._parent = parent;
        for (let i = 0; i < size; i++) this._pool.push(makeBullet(parent));
    }

    spawn(cfg: Partial<BulletData>): BulletData {
        const b = this._pool.length ? this._pool.pop()! : makeBullet(this._parent);
        resetBullet(b);
        Object.assign(b, cfg);
        b.active = true;
        b.hitEnemies = new Set();
        b.life = 0;

        // 只要调用方提供 charKey 就使用角色弹丸美术；敌弹不提供 charKey，
        // 继续走 GameManager 中按威胁类型绘制的程序化轮廓。
        if (b.node && b.sprite) {
            if (!b.isEnemyBullet && b.owner !== 'enemy' && b.charKey) {
                b.node.active = true;
                const diameter = (b.radius ?? 5) * 2;
                // 新弹丸素材统一朝右并采用横向构图；显示区域保持长宽比，
                // 不再把素材压回纯色圆点。大口径技能弹会按碰撞半径同步放大。
                b.node.getComponent(UITransform)!.setContentSize(
                    Math.max(18, diameter * 2.6), Math.max(8, diameter * 1.15),
                );
                b.node.setRotationFromEuler(0, 0, -Math.atan2(b.vy, b.vx) * 180 / Math.PI);
                applyArtSprite(b.sprite, `bullet_${b.charKey}`);
                // 保留素材自身的金属、亮核与尾焰层次；纯色染色会再次把它压成色块。
                b.sprite.color = new Color(255, 255, 255, 255);
            } else {
                b.node.active = false;
            }
        }

        this._active.push(b);
        return b;
    }

    fire(x: number, y: number, dx: number, dy: number, dmg: number, opts: any = {}): BulletData {
        return this.spawn({
            x, y,
            vx: dx * (opts.speed || 500), vy: dy * (opts.speed || 500),
            damage: dmg, radius: opts.r || opts.radius || 5,
            color: opts.color || '#2af', owner: opts.owner || 'turret',
            charKey: opts.charKey || '',
            lifeTime: opts.lifeTime || 1.8,
            pierceLeft: opts.pierce || 0, bounceLeft: opts.bounce || 0,
        });
    }

    private _release(b: BulletData): void {
        const i = this._active.indexOf(b);
        if (i >= 0) {
            this._active.splice(i, 1);
            b.active = false;
            if (b.node) b.node.active = false;
            this._pool.push(b);
        }
    }

    // ── 更新（仅处理玩家/炮台子弹） ──────────────────────
    update(dt: number, enemies: any[], player: any, game: any): void {
        for (let i = this._active.length - 1; i >= 0; i--) {
            const b = this._active[i];
            if (b.isEnemyBullet || b.owner === 'enemy') continue;

            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life += dt;

            // 追踪逻辑（如有）
            if (b.homing) {
                const nearest = enemies.find(e => e.alive);
                if (nearest) {
                    const [dx, dy] = [nearest.x - b.x, nearest.y - b.y];
                    const spd = Math.hypot(b.vx, b.vy);
                    const [ndx, ndy] = [dx / (Math.hypot(dx, dy) || 1), dy / (Math.hypot(dx, dy) || 1)];
                    b.vx += ndx * spd * dt * 3; b.vy += ndy * spd * dt * 3;
                    const ns = Math.hypot(b.vx, b.vy);
                    if (ns > 0) { b.vx = b.vx / ns * spd; b.vy = b.vy / ns * spd; }
                }
            }

            // 边界弹射
            if (b.bounceLeft > 0) {
                if (b.x < b.radius || b.x > CANVAS_W - b.radius) { b.vx *= -1; b.x = clamp(b.x, b.radius, CANVAS_W - b.radius); b.bounceLeft--; }
                if (b.y < b.radius || b.y > PLAYFIELD_BOTTOM - b.radius) { b.vy *= -1; b.y = clamp(b.y, b.radius, PLAYFIELD_BOTTOM - b.radius); b.bounceLeft--; }
            } else if (!b.infinite) {
                if (b.x < -20 || b.x > CANVAS_W + 20 || b.y < -20 || b.y > PLAYFIELD_BOTTOM + 20 || b.life > b.lifeTime) {
                    this._release(b); continue;
                }
            }

            // 碰撞检测 vs 敌人
            let released = false;
            for (const e of enemies) {
                if (!e.alive || b.hitEnemies.has(e)) continue;
                if (Vec.dist2(b.x, b.y, e.x, e.y) < (b.radius + e.radius) ** 2) {
                    b.hitEnemies.add(e);
                    let dmg = b.damage;
                    if (b.isCrit) {
                        dmg *= (1 + (player.stats.critDmg || 0.5));
                        game.floatingText?.spawn(e.x, e.y - 20, '暴击！', '#ffd700', 14, true);
                    }
                    if ((e.isElite || e.isBoss) && player.stats.eliteBonus) dmg *= (1 + player.stats.eliteBonus);
                    // 被动：冻结要害×freezeBonus（对齐 CharacterDB.ts liana 的 desc 描述）
                    if (e.frozen > 0 && player.stats.freezeBonus) dmg *= player.stats.freezeBonus;
                    const actualDamage = e.takeDamage(dmg, player, game);
                    player.applyAttackLifesteal?.(actualDamage === undefined ? dmg : actualDamage, game);
                    if (b.onHitCb) b.onHitCb(b, e);
                    game.floatingText?.spawn(e.x + Rng.float(-10, 10), e.y - 10, Math.ceil(dmg).toString(), b.isCrit ? '#ffd700' : '#fff', b.isCrit ? 16 : 13, b.isCrit);
                    game.particles?.hit(b.x, b.y, b.color);
                    game.augmentManager?.dispatchHit(player, e, dmg, game);
                    if (b.pierceLeft <= 0 && !b.infinite) { this._release(b); released = true; break; }
                    else b.pierceLeft = Math.max(0, b.pierceLeft - 1);
                }
            }
            if (released) continue;
        }
    }

    // ── 敌人子弹 vs 玩家 ──────────────────────────────────
    updateEnemyBullets(dt: number, player: any, game: any): void {
        for (let i = this._active.length - 1; i >= 0; i--) {
            const b = this._active[i];
            if (!b.isEnemyBullet && b.owner !== 'enemy') continue;
            if (b.homing && player.alive) {
                const [dx, dy] = Vec.normalize(player.x - b.x, player.y - b.y);
                const speed = Math.max(1, Math.hypot(b.vx, b.vy));
                b.vx += dx * speed * dt * 2.5;
                b.vy += dy * speed * dt * 2.5;
                const nextSpeed = Math.hypot(b.vx, b.vy) || speed;
                b.vx = b.vx / nextSpeed * speed;
                b.vy = b.vy / nextSpeed * speed;
            }
            b.x += b.vx * dt; b.y += b.vy * dt; b.life += dt;
            // 分弹种尾迹（0.08s 节流）：毒球绿雾 / 齿轮光环 / 追踪尾焰 / 混沌紫烟
            if (b.enemyFx) {
                b.trailCd = (b.trailCd ?? 0) - dt;
                if (b.trailCd <= 0) {
                    b.trailCd = 0.08;
                    game.particles?.enemyProjectileTrail?.(b.x, b.y, b.enemyFx, b.vx, b.vy, b.color, b.radius);
                }
            }
            if (b.life > b.lifeTime || b.x < -30 || b.x > CANVAS_W + 30 || b.y < -30 || b.y > PLAYFIELD_BOTTOM + 30) {
                this._release(b); continue;
            }
            if (player.alive && Vec.dist2(b.x, b.y, player.x, player.y) < (b.radius + player.radius) ** 2) {
                player.takeDamage(b.damage, game);
                this._release(b);
            }
        }
    }

    get active(): BulletData[] { return this._active; }

    clear(): void {
        while (this._active.length) {
            const b = this._active.pop()!;
            b.active = false;
            if (b.node) b.node.active = false;
            this._pool.push(b);
        }
    }

    /** Alias for clear() — resets pool state between game sessions. */
    reset(): void { this.clear(); }
}
