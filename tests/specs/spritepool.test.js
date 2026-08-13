'use strict';
// ============================================================
//  spritepool.test.js — 对象池稳定性测试
//  验证 SpriteNodePool（通用Sprite节点池）和 BulletPool（子弹对象池，
//  parent!=null 时会为每颗子弹永久挂 Node+Sprite）连续大量 acquire/
//  release 或 spawn/update 循环后不会出现节点泄漏——池子大小恒定，
//  active数量始终在合法范围内回落到0。
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { Node } = require('cc');
const { SpriteNodePool } = require('../dist/core/SpriteUtils');
const { BulletPool } = require('../dist/entities/BulletController');
const { makeMockGame, makePlayer } = require('./mockGame');

test('SpriteNodePool: 连续1000次acquire/release循环后,池大小不变且activeCount回落到0', () => {
    const parent = new Node('Parent');
    const pool = new SpriteNodePool(parent, 16, 'Stress', [32, 32]);
    assert.equal(pool.size, 16);

    for (let i = 0; i < 1000; i++) {
        const held = [];
        // 每轮借用池子的一半容量，再全部归还——模拟持续的特效生成/回收压力。
        for (let j = 0; j < 8; j++) held.push(pool.acquire());
        assert.ok(held.every(n => !!n), '池子未耗尽的情况下acquire应始终返回有效节点');
        assert.equal(pool.activeCount, 8);
        for (const n of held) pool.release(n);
    }

    assert.equal(pool.size, 16, '池大小(节点总数)不应随acquire/release循环增长——无泄漏');
    assert.equal(pool.activeCount, 0, '全部归还后activeCount应为0');
});

test('SpriteNodePool: 池耗尽时acquire()返回undefined而不抛错,releaseAll()后可重新借出', () => {
    const parent = new Node('Parent');
    const pool = new SpriteNodePool(parent, 4, 'Small', [16, 16]);
    const held = [pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire()];
    assert.ok(held.every(n => !!n));
    assert.equal(pool.acquire(), undefined, '池耗尽后应返回undefined,不抛异常');

    pool.releaseAll();
    assert.equal(pool.activeCount, 0);
    const again = pool.acquire();
    assert.ok(again, 'releaseAll()后应能重新借出节点');
});

test('BulletPool(带parent): 连续1000次spawn+update命中释放循环后,池总容量不变(无Node/Sprite泄漏)', () => {
    const parent = new Node('BulletParent');
    const POOL_SIZE = 32;
    const pool = new BulletPool(POOL_SIZE, parent);
    const game = makeMockGame();
    const player = makePlayer();

    for (let i = 0; i < 1000; i++) {
        const enemy = { x: 10, y: 0, radius: 10, alive: true, takeDamage() {} };
        // 玩家子弹(owner+charKey)会触发node/sprite的active切换分支。
        const bullet = pool.spawn({
            x: 10, y: 0, vx: 0, vy: 0, damage: 10, radius: 5,
            pierceLeft: 0, hitEnemies: new Set(),
            owner: 'player', charKey: 'kai',
        });
        // 无穿透命中后立即释放回池。
        pool.update(0.016, [enemy], player, game);
        assert.equal(pool.active.length, 0, `第${i}轮循环后子弹应已释放回池`);
        assert.equal(bullet.node.active, false, '释放后Sprite节点必须立即隐藏');
    }

    // _pool + _active 内部总数应恒等于初始size——用active.length(已知为0)
    // 加上"能连续spawn出POOL_SIZE颗而不复用同一个node"来间接验证没有Node泄漏:
    // 连续spawn满整池、再一次性释放，池子应仍能整数回收。
    const spawned = [];
    for (let i = 0; i < POOL_SIZE; i++) {
        spawned.push(pool.spawn({ x: 0, y: 0, vx: 0, vy: 0, hitEnemies: new Set() }));
    }
    assert.equal(pool.active.length, POOL_SIZE, '应能连续spawn满整池而不报错');
    const uniqueNodes = new Set(spawned.map(b => b.node));
    assert.equal(uniqueNodes.size, POOL_SIZE, '每颗子弹应持有各自独立的Node,无复用/泄漏');
    pool.clear();
    assert.equal(pool.active.length, 0, 'clear()后active应清空');

    // 再次spawn满整池，验证clear()真正把节点还回了池子而不是丢失。
    const spawned2 = [];
    for (let i = 0; i < POOL_SIZE; i++) {
        spawned2.push(pool.spawn({ x: 0, y: 0, vx: 0, vy: 0, hitEnemies: new Set() }));
    }
    assert.equal(pool.active.length, POOL_SIZE, 'clear()后应能再次spawn满整池,证明节点被正确回收而非泄漏丢失');
});

test('BulletPool: 敌人子弹(无art,不挂node)大量spawn/release循环不影响玩家子弹的node池', () => {
    const parent = new Node('BulletParent2');
    const pool = new BulletPool(16, parent);
    const game = makeMockGame();
    const player = makePlayer({ x: 0, y: 0, radius: 16 });

    for (let i = 0; i < 500; i++) {
        pool.spawn({
            x: 5, y: 0, vx: 0, vy: 0, damage: 5, radius: 5,
            isEnemyBullet: true, owner: 'enemy', lifeTime: 5, hitEnemies: new Set(),
        });
        pool.updateEnemyBullets(0.016, player, game);
    }
    assert.equal(pool.active.length, 0, '敌人子弹命中玩家后应被释放,不遗留在active中');
});
