// ============================================================
//  attackfx.test.js — 攻击特效/吸血/敌弹弹种标签 回归测试
//  覆盖:狂战士5%攻击吸血(按实际扣血)、近战剑气(玩家/怪/Boss)、
//       Q冲锋路径伤害、boss四章enemyFx弹幕、敌弹尾迹节流、战斗区底边
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PlayerController } = require('../dist/entities/PlayerController');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { BossController } = require('../dist/entities/BossController');
const { BulletPool } = require('../dist/entities/BulletController');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { makeMockGame, makePlayer } = require('./mockGame');

// ---- helpers ------------------------------------------------

function makeReik() {
    const player = new PlayerController();
    player.x = 0; player.y = 0; player.radius = 16; player.alive = true;
    player.charId = 'reik';
    player._charDef = CHARACTERS.reik;
    player.stats = {
        ...CHARACTERS.reik.stats,
        critRate: 0, critDmg: 0, eliteBonus: 0, freezeBonus: 0,
        extraBullets: 0, bulletBounce: 0, barrageMode: false, novaMode: false,
        allInBullets: 0, goldPickupRange: 60, cdReduction: 0, ultChargeRate: 1,
        maxAugments: 6, previewAugments: false, phaseDash: false,
        lifestealRate: 0,
    };
    return player;
}

function makeEnemy(hp = 1000) {
    return {
        x: 40, y: 0, radius: 10, alive: true, isElite: false, isBoss: false,
        hp, maxHp: hp, frozen: 0,
        takeDamage(dmg) { this.hp -= dmg; return dmg; },
    };
}

/** 记录 meleeSlash / enemyProjectileTrail 调用的 mock game。 */
function recordingGame() {
    const game = makeMockGame();
    game.meleeCalls = [];
    game.trailCalls = [];
    game.particles.meleeSlash = (...args) => game.meleeCalls.push(args);
    game.particles.enemyProjectileTrail = (...args) => game.trailCalls.push(args);
    return game;
}

// ---- 吸血 ----------------------------------------------------

test('狂战士(reik)被动设置攻击吸血5% (lifestealRate=0.05)', () => {
    const player = makeReik();
    CHARACTERS.reik.passive(player, makeMockGame());
    assert.equal(player.stats.lifestealRate, 0.05);
    assert.equal(player.stats._reikPassive, true, '残血加伤被动应同时保留');
});

test('攻击吸血按实际扣血回血:统一命中链100伤害回5点HP', () => {
    const player = makeReik();
    player.stats.lifestealRate = 0.05;
    player.stats.maxHp = 200;
    player.hp = 100;
    player.applyAttackDamage(makeEnemy(), makeMockGame(), 100);
    assert.equal(player.hp, 105, '100×5%=5点回血');
});

test('玩家子弹命中敌人触发吸血(BulletController链路)', () => {
    const pool = new BulletPool(2);
    const game = makeMockGame();
    const player = makeReik();
    player.stats.lifestealRate = 0.05;
    player.stats.maxHp = 200;
    player.hp = 100;
    const enemy = makeEnemy();
    enemy.x = 20; // 距离子弹10,小于两者半径和15,保证碰撞
    pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 40, radius: 5, pierceLeft: 0, hitEnemies: new Set() });
    pool.update(0.016, [enemy], player, game);
    assert.equal(enemy.hp, 960);
    assert.equal(player.hp, 102, '40实际伤害×5%=2点回血');
});

test('lifestealRate=0的角色攻击不回血', () => {
    const player = makeReik();
    player.hp = 100;
    player.applyAttackDamage(makeEnemy(), makeMockGame(), 100);
    assert.equal(player.hp, 100);
});

test('满血时吸血不越过maxHp上限', () => {
    const player = makeReik();
    player.stats.lifestealRate = 0.05;
    player.hp = player.stats.maxHp; // 200
    player.applyAttackDamage(makeEnemy(), makeMockGame(), 100);
    assert.equal(player.hp, player.stats.maxHp);
});

test('护盾完全吸收的伤害不触发吸血(按实际扣血,而非面板伤害)', () => {
    const game = makeMockGame();
    const player = makeReik();
    player.stats.lifestealRate = 0.05;
    player.stats.maxHp = 200;
    player.hp = 100;
    const shielded = new EnemyBase();
    shielded.init('shield', 1, game); // 护盾兵:自带80点护盾
    shielded.x = 40; shielded.y = 0;
    player.applyAttackDamage(shielded, game, 50);
    assert.equal(player.hp, 100, '50点伤害被护盾全部吸收,实际扣血=0,不应回血');
});

// ---- 剑气 ----------------------------------------------------

test('狂战士近战普攻触发剑气特效(从玩家位置朝目标方向,强度1)', () => {
    const player = makeReik();
    const game = recordingGame();
    const enemy = makeEnemy();
    enemy.x = 50;
    game.getNearestEnemy = () => enemy;
    player._meleeAttack(game);
    assert.equal(game.meleeCalls.length, 1);
    const [sx, sy, angle, color, reach, strength] = game.meleeCalls[0];
    assert.equal(sx, 0);
    assert.equal(sy, 0);
    assert.ok(Math.abs(angle) < 0.01, '目标在+x方向,角度应为0');
    assert.equal(strength, 1);
    assert.ok(enemy.hp < 1000, '普攻应同时造成伤害');
});

test('怪物近战攻击玩家时触发剑气(强度0.85,方向指向玩家)', () => {
    const game = recordingGame();
    const e = new EnemyBase();
    e.init('grunt', 1, game);
    e.x = 100; e.y = 100;
    e.speed = 0; // 定身,避免追击位移干扰坐标断言
    const player = makePlayer({ x: 130, y: 100 });
    const hpBefore = player.hp;
    e.update(0.016, player, game);
    assert.equal(game.meleeCalls.length, 1);
    const [sx, sy, angle, , , strength] = game.meleeCalls[0];
    assert.equal(sx, 100);
    assert.equal(sy, 100);
    assert.ok(Math.abs(angle) < 0.01);
    assert.equal(strength, 0.85);
    assert.ok(player.hp < hpBefore, '近战伤害应正常结算');
});

test('Boss接触攻击触发大幅剑气(强度1.8)', () => {
    const game = recordingGame();
    const boss = new BossController();
    boss.initBoss(0, game);
    boss.x = 0; boss.y = 0;
    const player = makePlayer({ x: 40, y: 0 });
    boss.update(0.016, player, game);
    assert.equal(game.meleeCalls.length, 1);
    assert.equal(game.meleeCalls[0][5], 1.8);
});

test('狂战士Q冲锋从起点斩出长刃剑气(长度200,强度1.35)', () => {
    const player = makeReik();
    player.x = 100; player.y = 100;
    const game = recordingGame();
    game.input = { mouse: { x: 100, y: 300 } }; // 向+y方向冲锋
    game.enemies = [];
    CHARACTERS.reik.qSkill(player, game);
    assert.equal(game.meleeCalls.length, 1);
    const [sx, sy, angle, , reach, strength] = game.meleeCalls[0];
    assert.equal(sx, 100, '剑气应从冲锋起点斩出');
    assert.equal(sy, 100);
    assert.ok(Math.abs(angle - Math.PI / 2) < 0.01);
    assert.equal(reach, 200);
    assert.equal(strength, 1.35);
});

// ---- Q冲锋路径伤害 -------------------------------------------

test('狂战士Q冲锋:路径中点旁的敌人也受伤(旧版只判终点圆,冲过头顶不伤害)', () => {
    const player = makeReik();
    player.x = 0; player.y = 0;
    const game = makeMockGame();
    game.input = { mouse: { x: 200, y: 0 } }; // 向+x冲200
    const mid = makeEnemy();
    mid.x = 100; mid.y = 30; // 路径中点旁,垂直距离30 ≤ radius+28
    const far = makeEnemy();
    far.x = 400; far.y = 400; // 完全不在路径上
    game.enemies = [mid, far];
    CHARACTERS.reik.qSkill(player, game);
    assert.ok(mid.hp < 1000, '路径旁敌人应受伤');
    assert.equal(far.hp, 1000, '不在路径上的敌人不应受伤');
    assert.equal(player.x, 200, '冲锋位移应正常执行');
});

// ---- boss弹种标签/敌弹尾迹 -----------------------------------

test('Boss四章技能弹幕带enemyFx标签(毒球/齿轮/追踪/混沌)', () => {
    const expected = ['poison', 'gear', 'homing', 'chaos'];
    const counts  = [3, 8, 1, 12]; // 第三章只发1发追踪弹
    for (let ch = 0; ch < 4; ch++) {
        const game = makeMockGame();
        game.enemyBullets = [];
        const boss = new BossController();
        boss.initBoss(ch, game);
        boss.x = 100; boss.y = 100;
        boss._useSkill(makePlayer({ x: 400, y: 100 }), game);
        assert.equal(game.enemyBullets.length, counts[ch], `第${ch + 1}章弹幕数量`);
        for (const b of game.enemyBullets) {
            assert.equal(b.enemyFx, expected[ch], `第${ch + 1}章弹幕应带${expected[ch]}标签`);
        }
        if (ch === 2) assert.equal(game.enemyBullets[0].homing, true, '第三章追踪弹应带homing');
    }
});

test('带enemyFx的敌弹按0.08s节流生成分弹种尾迹', () => {
    const pool = new BulletPool(2);
    const game = recordingGame();
    const player = makePlayer({ x: 5000, y: 5000 }); // 远离,不触发命中
    pool.spawn({
        x: 100, y: 100, vx: 100, vy: 0, damage: 5, radius: 8,
        owner: 'enemy', isEnemyBullet: true, enemyFx: 'poison', lifeTime: 5,
    });
    pool.updateEnemyBullets(0.01, player, game);
    assert.equal(game.trailCalls.length, 1, '首个tick应发射尾迹');
    pool.updateEnemyBullets(0.05, player, game); // 累计0.06s < 0.08s
    assert.equal(game.trailCalls.length, 1, '间隔未满0.08s不应重复发射');
    pool.updateEnemyBullets(0.05, player, game); // 累计0.11s ≥ 0.08s
    assert.equal(game.trailCalls.length, 2);
    assert.equal(game.trailCalls[0][2], 'poison', '尾迹应携带弹种标签');
});

test('无enemyFx标签的敌弹不发射尾迹(普通弹保持原样)', () => {
    const pool = new BulletPool(2);
    const game = recordingGame();
    const player = makePlayer({ x: 5000, y: 5000 });
    pool.spawn({ x: 100, y: 100, vx: 100, vy: 0, damage: 5, radius: 6, owner: 'enemy', isEnemyBullet: true, lifeTime: 5 });
    pool.updateEnemyBullets(0.05, player, game);
    assert.equal(game.trailCalls.length, 0);
});

// ---- 战斗区底边(PLAYFIELD_BOTTOM=648) ------------------------

test('玩家移动不会进入底部HUD区(y停在PLAYFIELD_BOTTOM-radius)', () => {
    const player = makeReik();
    player.x = 640; player.y = 600;
    player.tickMovement(10, { moveX: 0, moveY: 1 }); // 大步向下
    assert.equal(player.y, 648 - 16, '应停在战斗区底边648之内');
});

test('敌人追击也不会进入底部HUD区(不再堆积在窗口最下面)', () => {
    const game = makeMockGame();
    const e = new EnemyBase();
    e.init('grunt', 1, game);
    e.x = 100; e.y = 700;
    e.speed = 100000;
    const player = makePlayer({ x: 100, y: 2000 }); // 玩家在HUD更下方,诱导敌人往下追
    e.update(0.016, player, game);
    assert.ok(e.y <= 648 - e.radius, `敌人y(${e.y})应≤${648 - e.radius}`);
});

test('玩家子弹在战斗区底边反弹/回收,不再以720为界', () => {
    const pool = new BulletPool(2);
    const game = makeMockGame();
    const player = makePlayer();
    const b = pool.spawn({ x: 640, y: 640, vx: 0, vy: 500, damage: 5, radius: 5, bounceLeft: 1, lifeTime: 5, hitEnemies: new Set() });
    pool.update(0.05, [], player, game); // y推进到665,越过648-5=643
    assert.ok(b.active, '有反弹次数的子弹不应被回收');
    assert.ok(b.y <= 643, `反弹后应夹回战斗区底边内,实际y=${b.y}`);
    assert.ok(b.vy < 0, '越底后vy应翻转向上');
});
