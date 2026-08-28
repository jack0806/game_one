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
    /** 敌弹特效标签：同色威胁也以轮廓区分（毒镖≠Boss毒球）。 */
    enemyFx?:     'poison' | 'toxin_dart' | 'gear' | 'homing' | 'chaos' |
        'needle' | 'frost' | 'arc' | 'rail' | 'water_bomb' | 'water_spike' |
        'shrimp_spike' | 'venom_sting' | 'sonic' | 'beam' | 'blade';
    /** 敌弹破盾：命中玩家先清空护盾再结算伤害（锯齿剑虾尖刺/无人机声波）。 */
    pierceShield?: boolean;
    /** 敌弹 DoT：命中玩家后挂持续伤害（毒刺/高能光束），可叠加。 */
    dot?:         { dps: number; dur: number; color?: string };
    /** 冰流命中后刷新同名减速，不叠层。 */
    slow?:        { mult: number; dur: number };
    /** 敌弹撞边爆炸：bounceLeft 耗尽后再次撞到屏幕边缘直接爆炸（深水炸弹）。 */
    bounceExplode?: boolean;
    /** 敌弹终点爆炸：寿命耗尽/出界时在最后位置爆炸（海之霸主水刺），命中玩家时也炸。 */
    explodeOnExpire?: boolean;
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
    b.pierceShield = false; b.dot = undefined; b.slow = undefined; b.bounceExplode = false; b.explodeOnExpire = false;
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
            const collisionTargets = game.getEnemyMechanismTargets
                ? enemies.concat(game.getEnemyMechanismTargets())
                : enemies;
            for (const e of collisionTargets) {
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
                    // 时空行者被动：子弹命中额外结算15%真实伤害（无视护盾/护甲/隐身/无敌）
                    if (player.stats?.trueDamageRate && e.takeTrueDamage) {
                        e.takeTrueDamage(dmg * player.stats.trueDamageRate, player, game);
                    }
                    if (actualDamage > 0) {
                        game.floatingText?.spawn(e.x + Rng.float(-10, 10), e.y - 10, Math.ceil(dmg).toString(), b.isCrit ? '#ffd700' : '#fff', b.isCrit ? 16 : 13, b.isCrit);
                        game.particles?.hit(b.x, b.y, b.color);
                    } else {
                        // 无敌/隐身/格挡：显示"免疫"而不是伤害数字，避免看起来还在掉血
                        game.floatingText?.spawn(e.x, e.y - 14, '免疫', '#9fb4c8', 12, false);
                    }
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
            // 边界反弹（深海恐惧大水刺反弹2次 / 深水炸弹反弹1次后撞边爆炸）
            if (b.bounceLeft > 0) {
                let bounced = false;
                if (b.x < b.radius || b.x > CANVAS_W - b.radius) {
                    b.vx *= -1; b.x = clamp(b.x, b.radius, CANVAS_W - b.radius); b.bounceLeft--; bounced = true;
                }
                if (b.y < b.radius || b.y > PLAYFIELD_BOTTOM - b.radius) {
                    b.vy *= -1; b.y = clamp(b.y, b.radius, PLAYFIELD_BOTTOM - b.radius); b.bounceLeft--; bounced = true;
                }
                if (bounced) {
                    game.particles?.explode?.(b.x, b.y, '#66ddff', 26);
                    game.audio?.playSfx?.('freeze', 0.3);
                }
            } else if (b.bounceExplode &&
                (b.x < -30 || b.x > CANVAS_W + 30 || b.y < -30 || b.y > PLAYFIELD_BOTTOM + 30)) {
                // 反弹次数耗尽后撞边 → 直接爆炸（范围伤害，玩家在爆心附近受伤）
                const ex = clamp(b.x, 0, CANVAS_W);
                const ey = clamp(b.y, 0, PLAYFIELD_BOTTOM);
                game.particles?.explode?.(ex, ey, '#33ccff', 80);
                game.audio?.playSfx?.('explode', 0.6);
                if (player.alive && Vec.dist(ex, ey, player.x, player.y) < 100) {
                    player.takeDamage(b.damage, game, { ignoreIframe: game?.state === 'testRoom' });
                }
                this._release(b); continue;
            } else if (b.explodeOnExpire &&
                (b.life > b.lifeTime || b.x < -30 || b.x > CANVAS_W + 30 || b.y < -30 || b.y > PLAYFIELD_BOTTOM + 30)) {
                // 终点爆炸：寿命耗尽/出界时在最后位置爆炸（海之霸主水刺未命中时）
                const ex = clamp(b.x, 0, CANVAS_W);
                const ey = clamp(b.y, 0, PLAYFIELD_BOTTOM);
                game.particles?.explode?.(ex, ey, '#33ccff', 70);
                game.audio?.playSfx?.('explode', 0.6);
                if (player.alive && Vec.dist(ex, ey, player.x, player.y) < 90) {
                    player.takeDamage(b.damage, game, { ignoreIframe: game?.state === 'testRoom' });
                }
                this._release(b); continue;
            } else if (b.life > b.lifeTime || b.x < -30 || b.x > CANVAS_W + 30 || b.y < -30 || b.y > PLAYFIELD_BOTTOM + 30) {
                this._release(b); continue;
            }
            if (player.alive && Vec.dist2(b.x, b.y, player.x, player.y) < (b.radius + player.radius) ** 2) {
                // 破盾弹：先清空玩家护盾（锯齿剑虾尖刺/无人机声波）
                if (b.pierceShield && player.shield > 0) {
                    player.shield = 0;
                    game.particles?.shieldBlock?.(player.x, player.y, true);
                    game.floatingText?.spawn?.(player.x, player.y - 42, '护盾失效', '#ff8888', 14, true);
                }
                // DoT 弹：命中挂持续伤害（毒刺/高能光束，可叠加）
                if (b.dot && player.applyDot) player.applyDot(b.dot.dps, b.dot.dur, b.dot.color);
                if (b.slow && player.applyBuff) player.applyBuff('enemy_frost_slow', b.slow.dur, { speed: b.slow.mult });
                // 终点爆炸弹：命中玩家时也炸（水刺，范围溅射特效）
                if (b.explodeOnExpire) game.particles?.explode?.(player.x, player.y, '#33ccff', 46);
                // 测试房敌弹穿透受击无敌帧：逐发水刺/剑气等高频弹幕不被 0.5s 无敌帧吞掉
                player.takeDamage(b.damage, game, { ignoreIframe: game?.state === 'testRoom' });
                this._release(b);
            }
        }
    }

    get active(): BulletData[] { return this._active; }

    /** 释放所有带指定来源标记的敌弹（Boss 升空"直接消失"时带走自己的弹幕）。 */
    clearTaggedEnemyBullets(tag: string): void {
        for (let i = this._active.length - 1; i >= 0; i--) {
            const b = this._active[i];
            if (b.isEnemyBullet && b.srcBossTag === tag) this._release(b);
        }
    }

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
