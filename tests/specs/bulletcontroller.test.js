'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BulletPool } = require('../dist/entities/BulletController');
const { makeMockGame, makePlayer } = require('./mockGame');

test('spawn/fire正确从池中取出子弹并加入active', () => {
    const pool = new BulletPool(4);
    const b = pool.fire(0, 0, 1, 0, 10, { speed: 500 });
    assert.equal(pool.active.length, 1);
    assert.equal(b.vx, 500);
    assert.equal(b.damage, 10);
    assert.equal(b.active, true);
});

test('子弹碰撞敌人造成伤害,并调用onHitCb/particles/augmentManager.dispatchHit', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    let hitCbCalled = false;
    let dispatched = false;
    game.augmentManager.dispatchHit = () => { dispatched = true; };
    const player = makePlayer();
    const enemy = { x: 20, y: 0, radius: 10, alive: true, isElite: false, isBoss: false, takeDamage(dmg) { this.lastDmg = dmg; } };
    const b = pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 15, radius: 5, pierceLeft: 0, hitEnemies: new Set() });
    b.onHitCb = () => { hitCbCalled = true; };
    pool.update(0.016, [enemy], player, game);
    assert.equal(enemy.lastDmg, 15);
    assert.ok(hitCbCalled);
    assert.ok(dispatched);
});

test('无穿透(pierceLeft=0)命中后子弹立即释放回池', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const player = makePlayer();
    const enemy = { x: 10, y: 0, radius: 10, alive: true, takeDamage() {} };
    pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 10, radius: 5, pierceLeft: 0, hitEnemies: new Set() });
    pool.update(0.016, [enemy], player, game);
    assert.equal(pool.active.length, 0, '无穿透子弹命中后应被释放');
});

test('有穿透(pierceLeft>0)命中后继续存在,pierceLeft递减', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const player = makePlayer();
    const enemy = { x: 10, y: 0, radius: 10, alive: true, takeDamage() {} };
    const b = pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 10, radius: 5, pierceLeft: 2, hitEnemies: new Set() });
    pool.update(0.016, [enemy], player, game);
    assert.equal(pool.active.length, 1, '有穿透的子弹命中后应继续存在');
    assert.equal(b.pierceLeft, 1);
});

test('子弹生命周期耗尽(life>lifeTime)会被释放', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const player = makePlayer();
    pool.spawn({ x: 640, y: 360, vx: 0, vy: 0, damage: 10, radius: 5, lifeTime: 0.5, hitEnemies: new Set() });
    pool.update(0.6, [], player, game);
    assert.equal(pool.active.length, 0, '超过lifeTime的子弹应被释放');
});

test('同一颗子弹不会对同一个敌人重复命中(hitEnemies去重)', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const player = makePlayer();
    let hitCount = 0;
    const enemy = { x: 10, y: 0, radius: 10, alive: true, takeDamage() { hitCount++; } };
    pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 10, radius: 5, pierceLeft: 5, hitEnemies: new Set() });
    pool.update(0.016, [enemy], player, game);
    pool.update(0.016, [enemy], player, game);
    assert.equal(hitCount, 1, '同一敌人不应被同一颗子弹命中两次');
});

test('敌人子弹(updateEnemyBullets)碰到玩家会调用player.takeDamage并释放子弹', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const player = makePlayer({ x: 0, y: 0, radius: 16 });
    pool.spawn({ x: 5, y: 0, vx: 0, vy: 0, damage: 20, radius: 5, isEnemyBullet: true, owner: 'enemy', lifeTime: 5, hitEnemies: new Set() });
    pool.updateEnemyBullets(0.016, player, game);
    assert.equal(player.hp, 80);
    assert.equal(pool.active.length, 0);
});

test('敌方追踪弹会朝玩家修正方向并在越界后释放', () => {
    const pool = new BulletPool(2);
    const game = makeMockGame();
    const player = makePlayer({ x: 100, y: 100 });
    const b = pool.spawn({ x: 0, y: 0, vx: 100, vy: 0, damage: 10, radius: 5, isEnemyBullet: true, owner: 'enemy', homing: true, lifeTime: 0.2 });
    pool.updateEnemyBullets(0.1, player, game);
    assert.ok(b.vy > 0, '追踪弹应向玩家方向修正Y速度');
    pool.updateEnemyBullets(0.2, player, game);
    assert.equal(pool.active.length, 0, '过期敌方子弹应被释放');
});

test('被动freezeBonus:命中冻结中的敌人时伤害×freezeBonus(对齐liana描述)', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const player = makePlayer({ stats: { critDmg: 0.5, eliteBonus: 0, maxHp: 100, pierce: 0, damage: 20, goldPickupRange: 60, freezeBonus: 2.5 } });
    const enemy = { x: 10, y: 0, radius: 10, alive: true, frozen: 1, takeDamage(dmg) { this.lastDmg = dmg; } };
    pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 20, radius: 5, pierceLeft: 0, hitEnemies: new Set() });
    pool.update(0.016, [enemy], player, game);
    assert.equal(enemy.lastDmg, 50, '冻结状态下伤害应×2.5');
});

test('被动freezeBonus:敌人未冻结时不受影响,伤害保持原值', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const player = makePlayer({ stats: { critDmg: 0.5, eliteBonus: 0, maxHp: 100, pierce: 0, damage: 20, goldPickupRange: 60, freezeBonus: 2.5 } });
    const enemy = { x: 10, y: 0, radius: 10, alive: true, frozen: 0, takeDamage(dmg) { this.lastDmg = dmg; } };
    pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 20, radius: 5, pierceLeft: 0, hitEnemies: new Set() });
    pool.update(0.016, [enemy], player, game);
    assert.equal(enemy.lastDmg, 20, '未冻结时不应享受freezeBonus加成');
});

test('clear()/reset()把所有active子弹放回池中', () => {
    const { Node } = require('cc');
    const parent = new Node('BulletParent');
    const pool = new BulletPool(4, parent);
    const b1 = pool.spawn({ x: 0, y: 0, vx: 0, vy: 0, owner: 'player', charKey: 'kai' });
    const b2 = pool.spawn({ x: 0, y: 0, vx: 0, vy: 0, owner: 'player', charKey: 'kai' });
    assert.equal(pool.active.length, 2);
    assert.equal(b1.node.active, true);
    assert.equal(b2.node.active, true);
    pool.clear();
    assert.equal(pool.active.length, 0);
    assert.equal(b1.node.active, false, 'clear后第一颗子弹节点应隐藏');
    assert.equal(b2.node.active, false, 'clear后第二颗子弹节点应隐藏');
});

test('角色和炮台弹丸使用横向原色Sprite并按飞行方向旋转', () => {
    const { Node, Sprite, UITransform } = require('cc');
    const parent = new Node('BulletParent');
    const pool = new BulletPool(2, parent);
    const b = pool.fire(0, 0, 0, 1, 10, {
        owner: 'turret', charKey: 'vivian', radius: 6,
    });
    const size = b.node.getComponent(UITransform);
    const sprite = b.node.getComponent(Sprite);
    assert.equal(b.node.active, true, '炮台子弹提供角色键后应启用正式美术');
    assert.ok(size.width > size.height * 2, '弹丸显示框应保持横向武器弹体比例');
    assert.deepEqual(
        [sprite.color.r, sprite.color.g, sprite.color.b, sprite.color.a],
        [255, 255, 255, 255],
        '不应再用纯色染色压平弹丸自身层次',
    );
    assert.equal(Math.round(b.node.eulerAngles.z), -90, '朝上的弹丸应随速度方向旋转');
});
