'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BulletPool } = require('../dist/entities/BulletController');
const { EnemyBase } = require('../dist/entities/EnemyBase');
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

test('无敌/隐身敌人被命中只显示免疫,不显示伤害数字与命中粒子', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const texts = [];
    game.floatingText.spawn = (x, y, text) => texts.push(text);
    let hitFx = 0;
    game.particles.hit = () => { hitFx++; };
    const player = makePlayer();
    const enemy = {
        x: 20, y: 0, radius: 10, alive: true, isElite: false, isBoss: false,
        invulnerable: true, hp: 100,
        takeDamage() { return 0; }, // 无敌目标实际扣血为0
    };
    pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 15, radius: 5, pierceLeft: 0, hitEnemies: new Set() });
    pool.update(0.016, [enemy], player, game);
    assert.equal(enemy.hp, 100, '无敌目标不应掉血');
    assert.ok(texts.includes('免疫'), '应显示免疫提示');
    assert.ok(!texts.some(t => t === '15'), '不应显示伤害数字');
    assert.equal(hitFx, 0, '不应播放命中粒子');
});

test('带真伤(时空行者被动)的攻击命中无敌目标:显示真伤掉血而非免疫', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const texts = [];
    game.floatingText.spawn = (x, y, text) => texts.push(text);
    const player = makePlayer({ stats: { ...makePlayer().stats, trueDamageRate: 0.35 } });
    const enemy = {
        x: 20, y: 0, radius: 10, alive: true, isElite: false, isBoss: false,
        invulnerable: true, hp: 100,
        takeDamage() { return 0; },          // 普通伤害被免疫
        takeTrueDamage(amount) { this.hp -= amount; }, // 真伤无视隐身/无敌
    };
    pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 15, radius: 5, pierceLeft: 0, hitEnemies: new Set() });
    pool.update(0.016, [enemy], player, game);
    assert.ok(enemy.hp < 100, '真伤应无视隐身扣血');
    assert.ok(texts.includes('-6真伤'), '应显示真伤掉血数字(ceil(15*0.35)=6)');
    assert.ok(!texts.includes('免疫'), '携带真伤时不再满屏免疫误导');
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
    const player = makePlayer({ x: 20, y: 0, radius: 16 });
    pool.spawn({ x: 10, y: 0, vx: 100, vy: 0, damage: 12, radius: 5, owner: 'enemy', isEnemyBullet: true, lifeTime: 3 });
    pool.updateEnemyBullets(0.016, player, game);
    assert.equal(player.hp, 88);
    assert.equal(pool.active.length, 0);
});

test('冰霜敌弹命中施加25%减速1.6秒', () => {
    const pool = new BulletPool(2);
    const game = makeMockGame();
    const buffs = [];
    const player = makePlayer({
        x: 20, y: 0, radius: 16,
        applyBuff(id, dur, mods) { buffs.push({ id, dur, mods }); },
    });
    pool.spawn({
        x: 10, y: 0, vx: 100, vy: 0, damage: 5, radius: 6,
        owner: 'enemy', isEnemyBullet: true, lifeTime: 3,
        enemyFx: 'frost', slow: { mult: 0.75, dur: 1.6 },
    });
    pool.updateEnemyBullets(0.016, player, game);
    assert.deepEqual(buffs, [{ id: 'enemy_frost_slow', dur: 1.6, mods: { speed: 0.75 } }]);
});

test('敌弹带bounceLeft时在屏幕边缘反弹并递减,耗尽后撞边释放', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const player = makePlayer({ x: 600, y: 300, radius: 16 });
    const b = pool.spawn({ x: 20, y: 300, vx: -400, vy: 0, damage: 5, radius: 6, owner: 'enemy', isEnemyBullet: true, lifeTime: 5, bounceLeft: 1 });
    pool.updateEnemyBullets(0.05, player, game);
    assert.ok(pool.active.includes(b), '第一次撞边应反弹不释放');
    assert.equal(b.bounceLeft, 0, '反弹次数递减');
    assert.ok(b.vx > 0, '撞边后反向');
    b.x = -15; b.vx = -400; // 反弹耗尽后再撞边（向左飞出 -30 边界）
    pool.updateEnemyBullets(0.05, player, game);
    assert.ok(!pool.active.includes(b), '反弹耗尽后再撞边应释放');
});

test('clearTaggedEnemyBullets:只清除带来源标记的敌弹,其他敌弹保留', () => {
    const pool = new BulletPool(8);
    const game = makeMockGame();
    const player = makePlayer({ x: 900, y: 500, radius: 16 });
    const mech1 = pool.spawn({ x: 100, y: 100, vx: 0, vy: 0, damage: 5, radius: 5, owner: 'enemy', isEnemyBullet: true, lifeTime: 5, srcBossTag: 'mech' });
    const mech2 = pool.spawn({ x: 200, y: 100, vx: 0, vy: 0, damage: 5, radius: 5, owner: 'enemy', isEnemyBullet: true, lifeTime: 5, srcBossTag: 'mech' });
    const other = pool.spawn({ x: 300, y: 100, vx: 0, vy: 0, damage: 5, radius: 5, owner: 'enemy', isEnemyBullet: true, lifeTime: 5, srcBossTag: 'abyss' });
    pool.clearTaggedEnemyBullets('mech');
    assert.ok(!pool.active.includes(mech1), 'mech标记弹1应被清除');
    assert.ok(!pool.active.includes(mech2), 'mech标记弹2应被清除');
    assert.ok(pool.active.includes(other), '其他来源敌弹应保留');
});

test('explodeOnExpire弹:寿命耗尽后在终点爆炸,范围内玩家受伤;命中玩家也炸', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    // 未命中：寿命耗尽 → 终点爆炸（爆心距玩家 <90 → 受伤）
    const player = makePlayer({ x: 640, y: 340, radius: 16 });
    const b = pool.spawn({ x: 600, y: 340, vx: 0, vy: 0, damage: 10, radius: 8, owner: 'enemy', isEnemyBullet: true, lifeTime: 0.3, explodeOnExpire: true });
    pool.updateEnemyBullets(0.5, player, game);
    assert.ok(!pool.active.includes(b), '寿命耗尽应爆炸释放');
    assert.ok(player.hp < 100, '爆炸范围内玩家应受伤');

    // 命中玩家：直接命中伤害 + 爆炸释放
    const pool2 = new BulletPool(4);
    const game2 = makeMockGame();
    const player2 = makePlayer({ x: 20, y: 0, radius: 16 });
    pool2.spawn({ x: 10, y: 0, vx: 100, vy: 0, damage: 12, radius: 8, owner: 'enemy', isEnemyBullet: true, lifeTime: 3, explodeOnExpire: true });
    pool2.updateEnemyBullets(0.016, player2, game2);
    assert.equal(player2.hp, 88, '命中应直接结算伤害');
    assert.equal(pool2.active.length, 0, '命中后爆炸释放');
});

test('explodeOnExpire弹支持定制爆炸半径(灭世机神追踪导弹脱靶100码爆炸)', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    // 玩家距爆心 95px：默认爆炸半径90不受伤，定制半径100则受伤
    const player = makePlayer({ x: 695, y: 340, radius: 16 });
    const b = pool.spawn({
        x: 600, y: 340, vx: 0, vy: 0, damage: 10, radius: 8,
        owner: 'enemy', isEnemyBullet: true, lifeTime: 0.3,
        explodeOnExpire: true, explodeRadius: 100, explodeColor: '#ffaa33',
    });
    pool.updateEnemyBullets(0.5, player, game);
    assert.ok(!pool.active.includes(b), '寿命耗尽应爆炸释放');
    assert.ok(player.hp < 100, '定制半径100应覆盖95px外的玩家');
});

test('玩家子弹延时加速(凯尔大招2秒后弹速翻倍),只加速一次', () => {
    const game = makeMockGame();
    const enemies = [];
    const player = makePlayer();
    const pool = new BulletPool(8);
    const b = pool.spawn({ x: 200, y: 200, vx: 100, vy: 0, damage: 5, radius: 5, owner: 'player', lifeTime: 5, speedUpAfter: 0.5, speedUpMult: 2 });
    pool.update(0.4, enemies, player, game);
    assert.equal(b.vx, 100, '未到2秒不加速');
    pool.update(0.2, enemies, player, game); // life = 0.6 > 0.5
    assert.equal(b.vx, 200, '2秒后弹速翻倍');
    pool.update(0.1, enemies, player, game);
    assert.equal(b.vx, 200, '只加速一次,不重复叠加');
});

test('玩家子弹脱靶到期爆炸:对半径内敌人造成伤害(凯尔大招打不着怪不白消失)', () => {
    const game = makeMockGame();
    const enemies = [];
    const player = makePlayer();
    const pool = new BulletPool(8);
    const e = new EnemyBase();
    e.init('grunt', 1, game);
    e.x = 300; e.y = 300;
    enemies.push(e);
    const hpBefore = e.hp;
    // 用简化实现代替 GameManager.spawnExplosion（headless 无法实例化 cc 组件）
    game.spawnExplosion = (pl, x, y, dmg, radius) => {
        for (const en of enemies) {
            if (en.alive && Math.hypot(en.x - x, en.y - y) < radius) en.takeDamage(dmg, pl, game);
        }
    };
    // 静止在敌人身旁(距离20<50)的炮弹,寿命耗尽未命中 → 爆炸伤害敌人
    pool.spawn({ x: 300, y: 280, vx: 0, vy: 0, damage: 10, radius: 5, owner: 'player', lifeTime: 0.3, explodeOnExpire: true, explodeRadius: 50 });
    pool.update(0.5, enemies, player, game);
    assert.ok(e.hp < hpBefore, '脱靶到期爆炸应伤害半径50内的敌人');
    // 爆炸范围外的敌人不受影响
    const e2 = new EnemyBase();
    e2.init('grunt', 1, game);
    e2.x = 600; e2.y = 600;
    enemies.push(e2);
    const hp2Before = e2.hp;
    pool.spawn({ x: 300, y: 280, vx: 0, vy: 0, damage: 10, radius: 5, owner: 'player', lifeTime: 0.3, explodeOnExpire: true, explodeRadius: 50 });
    pool.update(0.5, enemies, player, game);
    assert.equal(e2.hp, hp2Before, '爆炸半径外的敌人不受伤害');
});

test('玩家追踪弹锁定最近存活敌人(非数组第一个),目标死亡重锁,加速瞬间重锁', () => {
    const game = makeMockGame();
    const enemies = [];
    const player = makePlayer();
    const pool = new BulletPool(16);
    const mkEnemy = (x, y) => {
        const e = new EnemyBase();
        e.init('grunt', 1, game);
        e.x = x; e.y = y;
        enemies.push(e);
        return e;
    };
    // 数组顺序：远的在前、近的在后 → 验证锁定最近而非数组第一个
    const far = mkEnemy(900, 100);
    const near = mkEnemy(400, 100);
    const b = pool.spawn({ x: 200, y: 100, vx: 100, vy: 0, damage: 5, radius: 5, owner: 'player', lifeTime: 5, homing: true });
    pool.update(0.016, enemies, player, game);
    assert.equal(b._homingTarget, near, '应锁定最近敌人而非数组第一个');
    // 锁定目标死亡 → 重新锁定存活敌人
    near.alive = false;
    pool.update(0.016, enemies, player, game);
    assert.equal(b._homingTarget, far, '目标死亡后重新锁定');
    // 加速瞬间清空锁定 → 重新锁定最近存活目标（凯尔大招"加速后锁定怪物位置"）
    const alive = mkEnemy(300, 100);
    const b2 = pool.spawn({ x: 200, y: 100, vx: 100, vy: 0, damage: 5, radius: 5, owner: 'player', lifeTime: 5, homing: true, speedUpAfter: 0.5, speedUpMult: 2 });
    pool.update(0.016, enemies, player, game);
    assert.equal(b2._homingTarget, alive, '加速前锁定最近目标');
    pool.update(0.5, enemies, player, game); // life=0.516 >= 0.5 → 加速并重锁
    assert.equal(b2._spedUp, true, '加速已触发');
    assert.equal(b2._homingTarget, alive, '加速后重新锁定最近存活目标');
});

test('玩家追踪弹场上有Boss时优先锁定Boss(即使更远),Boss死亡后回落最近敌人', () => {
    const game = makeMockGame();
    const enemies = [];
    const player = makePlayer();
    const pool = new BulletPool(16);
    const mkEnemy = (x, y, isBoss = false) => {
        const e = new EnemyBase();
        e.init('grunt', 1, game);
        e.x = x; e.y = y;
        e.isBoss = isBoss;
        enemies.push(e);
        return e;
    };
    // 近处普通敌人(200,100) + 远处Boss(900,100) → 应优先锁定Boss
    const grunt = mkEnemy(200, 100);
    const boss = mkEnemy(900, 100, true);
    const b = pool.spawn({ x: 100, y: 100, vx: 100, vy: 0, damage: 5, radius: 5, owner: 'player', lifeTime: 5, homing: true });
    pool.update(0.016, enemies, player, game);
    assert.equal(b._homingTarget, boss, '有Boss时优先锁定Boss(即使更远)');
    // Boss死亡 → 重新锁定最近普通敌人
    boss.alive = false;
    pool.update(0.016, enemies, player, game);
    assert.equal(b._homingTarget, grunt, 'Boss死亡后回落最近敌人');
});

test('凯尔大招单目标时所有炮弹锁定同一个敌人(集火)', () => {
    const game = makeMockGame();
    const enemies = [];
    const player = makePlayer();
    const pool = new BulletPool(16);
    const solo = new EnemyBase();
    solo.init('grunt', 1, game);
    solo.x = 300; solo.y = 100;
    enemies.push(solo);
    const bullets = [];
    for (let i = 0; i < 5; i++) {
        bullets.push(pool.spawn({ x: 100, y: 100, vx: 50, vy: 0, damage: 5, radius: 5, owner: 'player', lifeTime: 5, homing: true }));
    }
    pool.update(0.016, enemies, player, game);
    for (const b of bullets) {
        assert.equal(b._homingTarget, solo, '所有炮弹应锁定场上唯一目标');
    }
});

test('bounceExplode弹:反弹耗尽后撞边爆炸,爆心附近的玩家受伤', () => {
    const pool = new BulletPool(4);
    const game = makeMockGame();
    const player = makePlayer({ x: 12, y: 380, radius: 16 });
    const b = pool.spawn({ x: 20, y: 300, vx: -400, vy: 0, damage: 20, radius: 12, owner: 'enemy', isEnemyBullet: true, lifeTime: 5, bounceLeft: 1, bounceExplode: true });
    // 第一次撞边 → 反弹（玩家在反弹点 80px 外，不命中）
    pool.updateEnemyBullets(0.05, player, game);
    assert.ok(pool.active.includes(b), '第一次撞边应反弹');
    assert.equal(b.bounceLeft, 0);
    // 第二次撞边 → 直接爆炸（爆心距玩家 <100 → 受伤）
    b.x = -15; b.vx = -400;
    pool.updateEnemyBullets(0.05, player, game);
    assert.ok(!pool.active.includes(b), '第二次撞边应爆炸释放');
    assert.ok(player.hp < 100, '爆炸范围内玩家应受伤');
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
