'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CrowdEscape, contactDistance, separatePlayerBodies } = require('../dist/core/CombatCollision');
const { PlayerController } = require('../dist/entities/PlayerController');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { ActorCorpses } = require('../dist/core/ActorCorpses');
const { WaveManager } = require('../dist/systems/WaveManager');
const { makeMockGame } = require('./mockGame');

const free = (x, y, dx, dy) => ({ x: x + dx, y: y + dy });
function setup() {
    const player = new PlayerController();
    player.x = 640; player.y = 300; player.hp = 100;
    player.stats = { maxHp: 100, speed: 300, armor: 0 };
    const game = makeMockGame();
    game.movePlayerBody = (dx, dy, dt) => player.crowdEscape.move(player, dx, dy, dt,
        game.enemies, game.moveInArena ?? free, (enemy, first) => {
            if (enemy.dissolveForEscape(game) && first) player.takeCrowdCorrosion(game);
        });
    return { player, game };
}
function enemyAt(game, x, y, extra = {}) {
    const enemy = new EnemyBase();
    Object.assign(enemy, { x, y }, extra);
    game.enemies.push(enemy);
    return enemy;
}
function surround(player, game) {
    const radius = contactDistance(player, { radius: 18 }) + 0.1;
    return Array.from({ length: 5 }, (_, i) => enemyAt(game,
        player.x + Math.cos(i * Math.PI * 2 / 5) * radius,
        player.y + Math.sin(i * Math.PI * 2 / 5) * radius));
}
function walk(player, game, frames, moveX = 1, moveY = 0) {
    for (let i = 0; i < frames; i++) {
        player.tickMovement(1 / 60, { moveX, moveY }, game);
        separatePlayerBodies(player, game.enemies, game.moveInArena ?? free);
    }
}

test('日常顶单只小怪和顶可绕行的怪群不扣血、不消散', () => {
    for (const count of [1, 3]) {
        const { player, game } = setup();
        for (let i = 0; i < count; i++) enemyAt(game, 678, 300 + i * 42);
        walk(player, game, 180);
        assert.equal(player.hp, 100);
        assert.ok(game.enemies.every(e => e.alive));
        assert.ok(player.x < 642);
    }
});

test('被围且持续按键满半秒才触发，沿路径消散后真的能走出包围', () => {
    const { player, game } = setup();
    const ring = surround(player, game);
    walk(player, game, 29);
    assert.equal(player.hp, 100);
    assert.ok(ring.every(e => e.alive));
    walk(player, game, 1);
    assert.equal(player.hp, 95);
    assert.equal(ring[0].alive, false);
    assert.ok(ring.some(e => e.alive), '不能清空整圈小怪');
    walk(player, game, 50);
    assert.ok(player.x > 800, '缺口打开后可以离开');
    assert.equal(player.hp, 95);
});

test('同一突围窗口连续碰到多层小怪只扣一次5点', () => {
    const { player, game } = setup();
    surround(player, game);
    const rear = [80, 120].map(dx => enemyAt(game, 640 + dx, 300));
    walk(player, game, 50);
    assert.ok(rear.every(e => e.corrosionDissolved));
    assert.equal(player.hp, 95);
});

test('包围圈内只能挪动少量距离时仍能触发，不能把内部空隙当出口', () => {
    for (const radius of [46, 50, 55]) {
        const { player, game } = setup();
        for (let i = 0; i < 5; i++) enemyAt(game,
            player.x + Math.cos(i * Math.PI * 2 / 5) * radius,
            player.y + Math.sin(i * Math.PI * 2 / 5) * radius);
        walk(player, game, 120);
        assert.ok(player.x > 900, `半径${radius}的包围圈必须能离开`);
        assert.equal(player.hp, 95);
    }
});

test('出口需要拐弯时不误判为被围，保留正常绕行选择', () => {
    const { player, game } = setup();
    const allowed = (x, y) => (x >= 632 && x <= 700 && y >= 296 && y <= 304)
        || (x >= 628 && x <= 636 && y >= 200 && y <= 304);
    game.moveInArena = (x, y, dx, dy) => allowed(x + dx, y + dy)
        ? { x: x + dx, y: y + dy } : { x, y };
    enemyAt(game, 677.1, 300); enemyAt(game, 680, 340);
    walk(player, game, 120);
    assert.equal(player.hp, 100);
    assert.ok(game.enemies.every(e => e.alive));
});

test('四面围堵只需撞散前方一只就能离开，不清除侧面和背后小怪', () => {
    const { player, game } = setup();
    const ring = Array.from({ length: 4 }, (_, i) => enemyAt(game,
        player.x + Math.cos(i * Math.PI / 2) * 37.1,
        player.y + Math.sin(i * Math.PI / 2) * 37.1));
    walk(player, game, 70);
    assert.equal(ring.filter(e => e.corrosionDissolved).length, 1);
    assert.ok(player.x > 800);
    assert.equal(player.hp, 95);
});

test('突围窗口结束后恢复硬碰撞，日常新碰到的小怪不会继续消散', () => {
    const { player, game } = setup();
    surround(player, game);
    walk(player, game, 70);
    const enemy = enemyAt(game, player.x + 45, player.y);
    const start = player.x;
    walk(player, game, 120);
    assert.equal(enemy.alive, true);
    assert.equal(player.hp, 95);
    assert.ok(player.x - start < 10);
});

test('被围期间敌人被击杀打开出口后，持续顶另一只怪也不会触发腐蚀', () => {
    const { player, game } = setup();
    const ring = surround(player, game);
    walk(player, game, 20);
    ring[2].alive = false;
    ring[3].alive = false;
    walk(player, game, 120);
    assert.equal(player.hp, 100);
    assert.ok(game.enemies.every(e => !e.corrosionDissolved));
});

test('不按键、按键中断、定身、眩晕和零移速都不能触发或积攒突围', () => {
    const variants = [p => {}, p => p.applyBuff('定身', 10, { noMove: true }),
        p => p.applyBuff('眩晕', 10, { stun: true }), p => { p.stats.speed = 0; }];
    for (let i = 0; i < variants.length; i++) {
        const { player, game } = setup();
        surround(player, game);
        walk(player, game, 20);
        variants[i](player);
        walk(player, game, 90, i === 0 ? 0 : 1);
        assert.equal(player.hp, 100);
        assert.ok(game.enemies.every(e => e.alive));
        player._buffs = []; player.stats.speed = 300;
        walk(player, game, 20);
        assert.equal(player.hp, 100, '恢复后必须重新等待');
    }
});

test('持续顶墙不能误判；墙角确实被两只小怪封死时可以突围且不穿墙', () => {
    const wall = (x, y, dx, dy, r) => ({ x: Math.max(r, x + dx), y: Math.max(r, y + dy) });
    {
        const { player, game } = setup();
        player.x = 16; player.y = 16; game.moveInArena = wall;
        enemyAt(game, 53, 16); enemyAt(game, 16, 53);
        walk(player, game, 120, -1, 0);
        assert.equal(player.hp, 100);
        assert.ok(game.enemies.every(e => e.alive));
    }
    {
        const { player, game } = setup();
        player.x = 16; player.y = 16; game.moveInArena = wall;
        enemyAt(game, 53.1, 18); enemyAt(game, 18, 53.1);
        walk(player, game, 60, 1, 1);
        assert.equal(player.hp, 95);
        assert.ok(player.x > 60 && player.y > 60);
        assert.ok(player.x >= 16 && player.y >= 16);
    }
});

test('首领与小首领不消散，突围窗口仍不能穿过它们', () => {
    for (const extra of [{ isBoss: true, radius: 45 }, { isMiniBoss: true, radius: 32 }]) {
        const { player, game } = setup();
        surround(player, game);
        const boss = enemyAt(game, 760, 300, extra);
        walk(player, game, 110);
        assert.equal(boss.alive, true);
        assert.equal(boss.dissolveForEscape(game), false);
        assert.ok(Math.hypot(player.x - boss.x, player.y - boss.y) >= contactDistance(player, boss) - 0.02);
        assert.ok(player.x < boss.x);
    }
});

test('全部都是首领时不触发小怪腐蚀规则，离地与死亡单位不参与围困', () => {
    for (const extra of [{ isBoss: true }, { isMiniBoss: true }, { mechSkyT: 1 }, { alive: false }]) {
        const { player, game } = setup();
        surround(player, game).forEach(e => Object.assign(e, extra));
        walk(player, game, 120);
        assert.equal(player.hp, 100);
        assert.ok(game.enemies.every(e => !e.corrosionDissolved));
    }
});

test('技能瞬移后重新等待，单次大帧不能跳过半秒被围检测', () => {
    const { player, game } = setup();
    surround(player, game);
    walk(player, game, 20);
    player.x += 300;
    surround(player, game);
    walk(player, game, 20);
    assert.equal(player.hp, 100);
    const escape = new CrowdEscape();
    escape.move(player, 5, 0, 10, game.enemies, free, () => assert.fail('大帧误触发'));
});

test('腐蚀固定5点且护盾优先，护甲、减伤、易伤和调试倍率不改变代价', () => {
    for (const shield of [0, 3, 10]) {
        const { player, game } = setup();
        player.shield = shield; player.stats.armor = 900;
        player.applyBuff('减伤', 10, { dmgReduction: 0.6, takenMult: 2, dmgTakenMult: 2 });
        game.testEnemyDmgMult = 10;
        game.augmentManager.dispatchPlayerHit = () => assert.fail('不能触发受击反伤等收益');
        game.screenShake.shake = () => assert.fail('腐蚀不震屏');
        player.takeCrowdCorrosion(game);
        assert.equal(player.shield, Math.max(0, shield - 5));
        assert.equal(player.hp, 100 - Math.max(0, 5 - shield));
        player.takeDamage(50, game);
        assert.equal(player.hp, 100 - Math.max(0, 5 - shield), '护盾全吸收也提供0.5秒保护');
    }
});

test('受击保护、技能无敌和测试房无敌下能突围但不再扣血', () => {
    for (const protect of [p => { p._iframeTimer = 0.2; },
        p => p.applyBuff('技能无敌', 2, { invincible: true }), p => { p.godMode = true; }]) {
        const { player, game } = setup();
        surround(player, game); protect(player);
        walk(player, game, 40);
        assert.equal(player.hp, 100);
        assert.ok(game.enemies.some(e => e.corrosionDissolved));
    }
});

test('完整玩家更新中受击保护会到期，突围按真实计时扣血且窗口内不重复扣血', () => {
    const { player, game } = setup();
    surround(player, game);
    for (const dx of [80, 120]) enemyAt(game, player.x + dx, player.y);
    player.stats.attackSpeed = 1; player.stats.cdReduction = 0;
    player._iframeTimer = 0.2;
    game.testCeasefire = true;
    const input = { moveX: 1, moveY: 0, isKeyQ: () => false, isKeyE: () => false, isKeyR: () => false };
    for (let i = 0; i < 55; i++) {
        player.tick(1 / 60, input, game);
        separatePlayerBodies(player, game.enemies, free);
    }
    assert.equal(player.hp, 95, '此前0.2秒保护在突围前已到期');
    assert.ok(game.enemies.filter(e => e.corrosionDissolved).length >= 3);
});

test('腐蚀可致死且不重复死亡，既有不灭协议仍能保命', () => {
    {
        const { player, game } = setup(); let deaths = 0;
        player.hp = 4; game.onPlayerDeath = () => deaths++;
        player.takeCrowdCorrosion(game); player.takeCrowdCorrosion(game);
        assert.equal(player.hp, 0); assert.equal(player.alive, false); assert.equal(deaths, 1);
    }
    {
        const { player, game } = setup();
        player.hp = 4; player.stats.hasHexGuard = true;
        player.takeCrowdCorrosion(game);
        assert.equal(player.hp, 1); assert.equal(player.alive, true);
        assert.ok(player.shield > 0);
    }
});

test('消散跳过全部击杀收益与自爆，立即退出战斗并回收节点', () => {
    const { game } = setup();
    const fail = () => assert.fail('消散不能进入击杀结算');
    game.economy.spawnDrop = fail;
    for (const key of ['rollDropsFor', 'dropKillSplash', 'tryRaiseSkeleton', 'onEnemySlain', 'onEnemyKilled']) game[key] = fail;
    game.augmentManager.dispatchKill = fail;
    let hidden = false, disposed = 0;
    const e = enemyAt(game, 0, 0, { type: 'blast_tick', deathExplode: true, blastCountdown: 0.1 });
    e.node = { set active(value) { hidden = !value; } };
    assert.equal(e.dissolveForEscape(game), true);
    assert.equal(e.dissolveForEscape(game), false);
    e.update(1, {}, game); e.takeDamage(999, {}, game); e.takeTrueDamage(999, {}, game);
    assert.ok(e.dead && hidden); assert.equal(e.blastCountdown, 0);
    assert.equal(game.kills, 0); assert.equal(game.score, 0); assert.equal(game.comboCount, 0);
    const corpses = new ActorCorpses(() => disposed++);
    corpses.add(e);
    assert.equal(corpses.entries.length, 0); assert.equal(disposed, 1);
});

test('最后一只小怪腐蚀消散后波次可以正常结束', () => {
    const { game } = setup();
    const enemy = enemyAt(game, 0, 0);
    const wave = new WaveManager();
    wave.state = 'fighting'; wave._bossPending = false;
    enemy.dissolveForEscape(game);
    wave.update(1 / 60, game);
    assert.equal(wave.state, 'intermission');
});
