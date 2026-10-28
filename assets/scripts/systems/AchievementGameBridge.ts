// 由GameManager注入的适配层。只沿组合根访问实体/系统；测试中可绑定纯对象。
import { AchievementTracker, AchievementSource } from './AchievementTracker';

const WRAPPED = Symbol('achievementWrapped');
const boundEnemies = new WeakSet<object>();
const boundEmitters = new WeakSet<object>();
type Around = (original: (...args: any[]) => any, args: any[]) => any;
function wrap(target: any, name: string, around: Around): void {
    if (!target || typeof target[name] !== 'function' || target[name][WRAPPED]) return;
    const original = target[name];
    const fn = function(...args: any[]) { return around(original.bind(this), args); };
    fn[WRAPPED] = true;
    target[name] = fn;
}
const running = (game: any): AchievementTracker | undefined =>
    game.state !== 'testRoom' && game.achievementTracker?.active ? game.achievementTracker : undefined;

/** 动态效果保留创建时的攻击归属，回调执行时重新进入同一来源。 */
export function bindAchievementEmitters(game: any, source?: AchievementSource): void {
    const tracker = running(game);
    if (!tracker) return;
    for (const t of game.turrets ?? []) {
        if (boundEmitters.has(t)) continue;
        boundEmitters.add(t);
        const parent = source ?? tracker.source('summon', t.hexTag ?? t.kind);
        const owned = t.kind === 'debtWave' ? tracker.source('explosion', '', parent) : parent;
        wrap(t, 'update', (original, args) => {
            const tr = running(game); if (!tr) return original(...args);
            const leave = tr.enter(owned);
            try {
                if (t.kind === 'timeOrb' && t._phase !== 'channel' && t._t <= args[0]) {
                    return tr.scope('explosion', '', () => original(...args));
                }
                return original(...args);
            }
            finally { tr.emitter(owned, t, game.player); bindAchievementEmitters(game, owned); leave(); }
        });
    }
    for (const e of game.enemies ?? []) for (const dot of e.dots ?? []) {
        if (!dot.achievementSource) dot.achievementSource = tracker.source('dot', dot.type, source);
    }
}

export function bindAchievementEnemy(game: any, enemy: any): void {
    const tracker = running(game);
    if (!tracker || !enemy || boundEnemies.has(enemy)) return;
    boundEnemies.add(enemy);
    tracker.enemyBorn(enemy, game.player, game);
    let dead = false;
    wrap(enemy, 'update', (original, args) => {
        const before = game.achievementIncoming; game.achievementIncoming = 'melee';
        try { return original(...args); } finally { game.achievementIncoming = before; }
    });
    wrap(enemy, '_die', (original, args) => {
        if (!enemy.alive || dead) return original(...args);
        dead = true;
        const tr = running(game);
        const source = tr?.current ?? tr?.source('environment');
        const dropsBefore = new Set(game.economy?.drops ?? []);
        // 先记录这次真实死亡，再执行onKill连锁，保持首领/小兵死亡顺序。
        if (tr && source) tr.kill(enemy, source, game.player, game);
        const beforeDepth = game.achievementDeathDepth ?? 0;
        game.achievementDeathDepth = beforeDepth + 1;
        let result: any;
        try { result = original(...args); } finally { game.achievementDeathDepth = beforeDepth; }
        if (tr && enemy.type === 'gold_scavenger' && (enemy._scavengerAge ?? 99) <= 5) {
            tr.scavengerSlain((game.economy?.drops ?? []).filter(d => !dropsBefore.has(d)));
        }
        return result;
    });
    // 子类takeDamage调用父类时，只在实例最外层计一次实际生命/护盾损失。
    for (const method of ['takeDamage', 'takeContinuousDamage', 'takeTrueDamage']) wrap(enemy, method, (original, args) => {
        const tr = running(game); if (!tr || !enemy.alive) return original(...args);
        const hp = Math.max(0, enemy.hp);
        const shield = Math.max(0, enemy.shieldHp ?? 0) + Math.max(0, enemy.bellAbsorbHp ?? 0);
        const source = tr.current ?? tr.source('environment');
        const leave = tr.enter(source);
        try {
            const result = original(...args);
            const actual = Math.max(0, hp - Math.max(0, enemy.hp)) +
                Math.max(0, shield - Math.max(0, enemy.shieldHp ?? 0) - Math.max(0, enemy.bellAbsorbHp ?? 0));
            tr.hit(enemy, actual, source, game.player, game);
            return result;
        } finally { leave(); }
    });
}

/** 只在正式局启动时绑定；长寿命对象的包装通过组合根读取当前跟踪器，避免串局。 */
export function bindAchievementGame(game: any): void {
    const player = game.player;
    const tracker: AchievementTracker = game.achievementTracker;
    if (!player || !tracker) return;
    for (const e of game.enemies ?? []) bindAchievementEnemy(game, e);
    // 每名角色的数据实例独立，绝不改全局CharacterDB。
    player._charDef = { ...player._charDef };
    for (const [name, slot] of [['qSkill', 'q'], ['eSkill', 'e'], ['ultimate', 'r']]) {
        wrap(player._charDef, name, (original, args) => {
            const tr = running(game); if (!tr) return original(...args);
            const source = tr.beginSkill(slot, player, game), leave = tr.enter(source);
            try { return original(...args); }
            finally { bindAchievementEmitters(game, source); tr.endSkill(source, player, game); leave(); }
        });
    }
    wrap(player, '_meleeAttack', (original, args) => {
        const tr = running(game);
        return tr ? tr.scope('melee', '', () => original(...args)) : original(...args);
    });
    wrap(player, 'heal', (original, args) => {
        const before = player.hp, result = original(...args), tr = running(game);
        tr?.healed(Math.max(0, player.hp - before), player.stats.maxHp);
        tr?.observe(player, game);
        return result;
    });
    wrap(player, 'grantTempShield', (original, args) => {
        const result = original(...args);
        running(game)?.shieldGranted(args[0]);
        return result;
    });
    for (const method of ['_updateEnemyHazards', '_updateDocBossMechanics', '_updatePillars', '_updateTelegraphZones']) {
        wrap(game, method, (original, args) => {
            const before = game.achievementIncoming; game.achievementIncoming = 'environment';
            try { return original(...args); } finally { game.achievementIncoming = before; }
        });
    }
    wrap(game.bulletPool, 'updateEnemyBullets', (original, args) => {
        const before = game.achievementIncoming; game.achievementIncoming = 'ranged';
        try { return original(...args); } finally { game.achievementIncoming = before; }
    });
    wrap(game.bulletPool, 'spawn', (original, args) => {
        const b = original(...args), tr = running(game);
        // 对象池每次发射都覆盖来源；敌弹也必须清掉上一轮的玩家来源。
        b.achievementSource = tr && !b.isEnemyBullet && b.owner !== 'enemy'
            ? tr.source('projectile', '', tr.current ?? tr.source('auto')) : undefined;
        return b;
    });
    wrap(game, 'spawnEnemy', (original, args) => {
        const e = original(...args); bindAchievementEnemy(game, e); return e;
    });
    wrap(game, 'after', (original, args) => {
        const source = running(game)?.current, callback = args[1], run = game.runId;
        return original(args[0], () => {
            const tr = running(game);
            if (run !== game.runId) return;
            if (!tr) return callback();
            const leave = tr.enter(source);
            try { return callback(); } finally { bindAchievementEmitters(game, source); leave(); }
        });
    });
    const am = game.augmentManager;
    for (const [method, callback, index] of [
        ['dispatchHit', 'onHit', 0], ['dispatchCrit', 'onCrit', 0], ['dispatchKill', 'onKill', 0],
        ['dispatchUpdate', 'onUpdate', 0], ['dispatchWaveStart', 'onWaveStart', 0], ['dispatchSkill', 'onSkill', 0],
    ] as any[]) {
        wrap(am, method, (original, args) => {
            const tr = running(game); if (!tr) return original(...args);
            if (method === 'dispatchCrit' && tr.current?.hits.has(args[1])) tr.critical();
            const scale = method === 'dispatchUpdate' ? 1 + (args[0]?.stats?.cdReduction || 0) : 1;
            for (const a of [...am.all()]) if (a[callback]) {
                tr.scope('hex', a.id, () => {
                    if (method === 'dispatchUpdate') a[callback](args[0], args[1] * scale, args[2]);
                    else a[callback](...args);
                    bindAchievementEmitters(game, tr.current);
                    tr.observe(player, game);
                });
            }
        });
    }
    wrap(am, 'equip', (original, args) => {
        const tr = running(game);
        if (!tr) return original(...args);
        const card = args[0], level = am.ownedOf(card.id)?.level ?? 0;
        const armor = player.stats.armor, blueprint = am.nextLevelBonus > 0;
        const result = original(...args);
        if (result) {
            tr.acquired(card, level, armor, blueprint, player, game);
            bindAchievementEmitters(game, tr.source('hex', card.id));
        }
        return result;
    });
    wrap(am, 'unequip', (original, args) => {
        const result = original(...args);
        running(game)?.observe(player, game);
        return result;
    });
    wrap(game.economy, 'addGold', (original, args) => {
        const before = game.economy.gold, result = original(...args), tr = running(game);
        if (tr && game.wave > 0) tr.goldEarned += Math.max(0, game.economy.gold - before);
        return result;
    });
    wrap(game, 'spawnLifeClone', (original, args) => {
        const result = original(...args); running(game)?.cloneTriggered(); return result;
    });
    wrap(game, 'grantSoul', (original, args) => {
        const before = player.stats._souls ?? 0, result = original(...args);
        if (!game.achievementDeathDepth) running(game)?.soul(Math.max(0, (player.stats._souls ?? 0) - before), player);
        return result;
    });
    wrap(game, 'tryRaiseSkeleton', (original, args) => {
        const count = (game.turrets ?? []).filter(t => t.alive && t.kind === 'skeleton').length;
        const tr = running(game), source = tr?.current;
        const result = original(...args);
        if (tr && tr.options.hero === 'mortis' && source?.skill?.slot === 'r' && source.kind === 'explosion' &&
            (game.turrets ?? []).filter(t => t.alive && t.kind === 'skeleton').length > count) tr.mark(151);
        // 被动复苏的骷髅不能算成原先那次大招的尸爆。
        bindAchievementEmitters(game, tr?.source('passive', 'skeleton'));
        return result;
    });
    wrap(game._augUI, 'show', (original, args) => {
        running(game)?.shopOpened(args[0] ?? []);
        return original(...args);
    });
    wrap(game, '_buildAugShopCtx', (original, args) => {
        const ctx = original(...args);
        wrap(ctx, 'buy', (buy, buyArgs) => {
            const cost = buyArgs[0]._price ?? 0, result = buy(...buyArgs);
            if (result) running(game)?.shopBought(buyArgs[0], cost, game.economy.gold);
            game._persistAchievementProgress?.();
            return result;
        });
        wrap(ctx, 'sell', (sell, sellArgs) => {
            const before = game.economy.gold, result = sell(...sellArgs);
            if (result) running(game)?.shopSold(sellArgs[0].id, game.economy.gold - before);
            return result;
        });
        wrap(ctx, 'pin', (pin, pinArgs) => {
            const result = pin(...pinArgs); running(game)?.pinned(pinArgs[0].id); return result;
        });
        wrap(ctx, 'refresh', (refresh, refreshArgs) => {
            const cost = ctx.refreshCost(), result = refresh(...refreshArgs);
            if (result) running(game)?.shopRefreshed(cost, !!am.ownedOf('hex30'));
            return result;
        });
        return ctx;
    });
    wrap(game, '_applyShopItem', (original, args) => {
        const result = original(...args), tr = running(game);
        if (tr) {
            if (game.wave === 8) tr.mark(9);
            tr.grossSpent += args[0].cost ?? args[0].price ?? 0;
        }
        return result;
    });
}
