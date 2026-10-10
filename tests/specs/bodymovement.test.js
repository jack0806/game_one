'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { moveCombatBody, moveEnemyBody, contactDistance, separatePlayerBodies } = require('../dist/core/CombatCollision');
const { PlayerController } = require('../dist/entities/PlayerController');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { BossController } = require('../dist/entities/BossController');
const { UNIT_CATALOG } = require('../dist/data/BossDB');
const { globalChapter } = require('../dist/data/LevelIndex');
const { makeMockGame, makePlayer } = require('./mockGame');
const free = (x, y, dx, dy) => ({ x: x + dx, y: y + dy });
const body = (x, y, radius = 18) => ({ x, y, radius, alive: true });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function createEnemy(unit, game) {
    const enemy = unit.category === 'boss' ? new BossController() : new EnemyBase();
    if (unit.id.startsWith('boss_ch')) enemy.initBoss(globalChapter(Number(unit.id.slice(7)), 1), game);
    else if (unit.category === 'boss') enemy.initBossKind(unit.id.slice(5), game);
    else enemy.init(unit.id, 1, game);
    return enemy;
}

test('英雄持续走向全部37种静止敌人，敌人不被推走且英雄停止在身体边界', () => {
    for (const unit of UNIT_CATALOG) {
        const game = makeMockGame(), enemy = createEnemy(unit, game);
        enemy.x = 500; enemy.y = 300;
        const player = new PlayerController();
        player.x = 250; player.y = 300; player.hp = 100;
        player.stats = { speed: 180 };
        game.movePlayerBody = (dx, dy) => moveCombatBody(player, dx, dy, [enemy], free);
        for (let i = 0; i < 240; i++) {
            player.tickMovement(1 / 60, { moveX: 1, moveY: 0 }, game);
            separatePlayerBodies(player, [enemy], free);
        }
        assert.equal(enemy.x, 500, unit.id + '不能被走路推开');
        assert.equal(enemy.y, 300);
        assert.ok(Math.abs(distance(player, enemy) - contactDistance(player, enemy)) < 0.02, unit.id);
    }
});

test('斜向接触沿圆形身体滑动，松开和离开时不粘住、不移动对方', () => {
    const p = body(263, 300, 16), enemy = body(300, 300);
    for (let n = 0; n < 50; n++) Object.assign(p, moveCombatBody(p, 2, -2, [enemy], free));
    assert.ok(p.x > 330 && p.y < 220);
    assert.deepEqual(enemy, body(300, 300));
    const before = { ...p };
    Object.assign(p, moveCombatBody(p, 0, 0, [enemy], free));
    assert.deepEqual(p, before);
    Object.assign(p, moveCombatBody(p, -5, 0, [enemy], free));
    assert.equal(p.x, before.x - 5);
});

test('高速移动扫掠整段路线，不能从敌人另一侧穿出', () => {
    const p = body(100, 300, 16), enemy = body(300, 300, 45);
    enemy.isBoss = true;
    Object.assign(p, moveCombatBody(p, 700, 0, [enemy], free));
    assert.ok(p.x < enemy.x);
    assert.ok(Math.abs(distance(p, enemy) - contactDistance(p, enemy)) < 0.02);
});

test('小兵与首领正常追近能停住并近战命中，不挤压静止英雄', () => {
    for (const id of ['grunt', 'golem', 'squid', 'boss_ch1', 'boss_ch2']) {
        const p = makePlayer({ x: 600, y: 300, hp: 100000 });
        const game = makeMockGame(), e = createEnemy(UNIT_CATALOG.find(u => u.id === id), game);
        e.x = 450; e.y = 300;
        e._skillTimer = e._summonTimer = e._chargeCd = e._miniTimer = 999;
        game.moveEnemyBody = (actor, dx, dy) => moveEnemyBody(actor, p, [e], dx, dy, free);
        for (let n = 0; n < 360; n++) {
            e.update(1 / 60, p, game);
            if (!e.alive) break;
            separatePlayerBodies(p, [e], free);
            assert.equal(p.x, 600, id);
            assert.ok(distance(p, e) >= contactDistance(p, e) - 0.01, id);
        }
        assert.ok(p.hp < 100000, id + '接触边界仍可攻击');
    }
});

test('迎面移动在接触处稳定停下，持续输入不搬动接触点', () => {
    const p = body(200, 300, 16), e = body(500, 300);
    for (let n = 0; n < 100; n++) {
        Object.assign(p, moveCombatBody(p, 3, 0, [e], free));
        Object.assign(e, moveEnemyBody(e, p, [e], -2, 0, free));
    }
    const start = [p.x, p.y, e.x, e.y];
    for (let n = 0; n < 100; n++) {
        Object.assign(p, moveCombatBody(p, 3, 0, [e], free));
        Object.assign(e, moveEnemyBody(e, p, [e], -2, 0, free));
    }
    assert.deepEqual([p.x, p.y, e.x, e.y], start);
});

test('前排占位不被后排推走，后排沿侧面寻找英雄附近空位', () => {
    const p = body(500, 300, 16), front = body(463, 300), rear = body(400, 300);
    for (let n = 0; n < 150; n++) {
        const a = Math.atan2(p.y - rear.y, p.x - rear.x);
        Object.assign(rear, moveEnemyBody(rear, p, [front, rear], Math.cos(a) * 2, Math.sin(a) * 2, free));
        assert.ok(distance(front, rear) >= contactDistance(front, rear) - 0.01);
        assert.ok(distance(p, rear) >= contactDistance(p, rear) - 0.01);
    }
    assert.deepEqual(front, body(463, 300));
    assert.equal(p.x, 500);
    assert.ok(Math.abs(rear.y - 300) > 25, '后排绕到侧面');
    assert.ok(distance(p, rear) < 75, '后排能够接近');
});

test('死者与飞空首领不阻挡普通移动', () => {
    for (const state of [{ dead: true }, { alive: false }, { mechSkyT: 1 }]) {
        const p = body(100, 300, 16), e = { ...body(200, 300, 45), ...state };
        assert.deepEqual(moveCombatBody(p, 250, 0, [e], free), { x: 350, y: 300 });
    }
});

test('六章墙角连续斜向走位不穿地形，不推走敌人或产生身体重叠', () => {
    const { arenaForChapter } = require('../dist/data/ChapterArenaDB');
    const { safeArenaPoint, moveInArena, isArenaFree } = require('../dist/core/ArenaGeometry');
    for (let chapter = 1; chapter <= 6; chapter++) {
        const arena = arenaForChapter(chapter);
        const e = { ...body(0, 0, 32), ...safeArenaPoint(arena, 300, 420, 32) };
        const p = { ...body(0, 0, 16), ...safeArenaPoint(arena, 450, 420, 16) };
        const start = { ...e }, move = (x, y, dx, dy, r) => moveInArena(arena, x, y, dx, dy, r);
        for (let n = 0; n < 360; n++) {
            const a = Math.atan2(e.y - p.y, e.x - p.x) + (n < 180 ? 0.35 : -0.35);
            Object.assign(p, moveCombatBody(p, Math.cos(a) * 3, Math.sin(a) * 3, [e], move));
            separatePlayerBodies(p, [e], move);
            assert.deepEqual(e, start);
            assert.ok(isArenaFree(arena, p.x, p.y, p.radius));
            assert.ok(distance(p, e) >= contactDistance(p, e) - 0.01);
        }
    }
});
