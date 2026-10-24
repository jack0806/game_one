'use strict';
// ============================================================
//  testroomdebug.test.js — 实习刺客隐身「不可选中」+ 测试房数值调试开关
//  （无CD释放 / 玩家伤害 / 敌方伤害倍率；敌人血量倍率在 GameManager 层，不进 headless 编译清单）
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { BulletPool } = require('../dist/entities/BulletController');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { PlayerController } = require('../dist/entities/PlayerController');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { makeMockGame, makePlayer } = require('./mockGame');

const noKeys = { moveX: 0, moveY: 0, mouse: { x: 1000, y: 360 },
    isKeyQ: () => false, isKeyE: () => false, isKeyR: () => false };

function makeRealPlayer() {
    const p = new PlayerController();
    p.charId = 'kai';
    p.spriteKey = 'char_token_kai';
    p._charDef = { ...CHARACTERS.kai,
        qSkill: () => { p._casts.push('q'); },
        eSkill: () => { p._casts.push('e'); },
        ultimate: () => { p._casts.push('r'); },
        ultCd: 20 };
    p._casts = [];
    // armor 归零：承伤倍率断言不混入护甲减伤公式
    p.stats = { ...CHARACTERS.kai.stats, armor: 0, cdReduction: 0, critRate: 0, ultChargeRate: 1 };
    p.hp = p.stats.maxHp;
    p.x = 0; p.y = 0;
    return p;
}

// ── 实习刺客隐身（intern_stealth → untargetable） ─────────────

test('实习刺客隐身:intern_stealth 挂上后 untargetable=true，2 秒到期自动解除', () => {
    const p = makeRealPlayer();
    const game = makeMockGame({ testCeasefire: true });
    assert.equal(p.untargetable, false, '常态可被选中');
    p.applyBuff('intern_stealth', 2, { invincible: true });
    assert.equal(p.untargetable, true, '隐身期间不可选中');
    p.tick(1.0, noKeys, game);
    assert.equal(p.untargetable, true, '第1秒仍在隐身');
    p.tick(1.05, noKeys, game);
    assert.equal(p.untargetable, false, '2秒后隐身解除，恢复可选中');
});

test('敌弹穿过不可选中的玩家:不命中不扣血，弹体继续飞行', () => {
    const pool = new BulletPool(2);
    const game = makeMockGame();
    const player = makePlayer({ x: 20, y: 0, radius: 16, untargetable: true });
    const b = pool.spawn({ x: 10, y: 0, vx: 100, vy: 0, damage: 12, radius: 5,
        owner: 'enemy', isEnemyBullet: true, lifeTime: 3 });
    pool.updateEnemyBullets(0.016, player, game);
    assert.equal(player.hp, 100, '隐身期间敌弹直接穿过，不掉血');
    assert.ok(pool.active.includes(b), '弹体不应被隐身玩家消耗');

    // 隐身解除后同一发弹应正常命中
    player.untargetable = false;
    player.x = b.x; player.y = b.y;
    pool.updateEnemyBullets(0.016, player, game);
    assert.equal(player.hp, 88, '隐身结束后恢复可被命中');
});

test('追踪弹在玩家隐身期间丢失锁定不再转向', () => {
    const pool = new BulletPool(2);
    const game = makeMockGame();
    const player = makePlayer({ x: 600, y: 300, radius: 16, untargetable: true });
    const b = pool.spawn({ x: 100, y: 300, vx: 0, vy: 300, damage: 5, radius: 6,
        owner: 'enemy', isEnemyBullet: true, lifeTime: 5, homing: true });
    pool.updateEnemyBullets(0.5, player, game);
    assert.equal(b.vx, 0, '隐身目标不被追踪，横向速度不变');
    assert.ok(b.vy > 0, '弹体保持原方向直飞');
});

test('近战敌人不对隐身玩家起手，隐身解除后恢复进入攻击前摇', () => {
    const game = makeMockGame();
    const e = new EnemyBase();
    e.init('grunt', 1, game);
    e.x = 40; e.y = 0;
    const player = makePlayer({ x: 0, y: 0, radius: 16, untargetable: true });
    for (let i = 0; i < 20; i++) e.update(0.05, player, game);
    assert.equal(e.attackWindup, 0, '隐身期间近战不起手');

    player.untargetable = false;
    e.update(0.05, player, game);
    assert.ok(e.attackWindup > 0, '隐身结束立刻进入攻击前摇');
});

test('远程敌人(弓手)在玩家隐身期间整体停火，解除后恢复射击', () => {
    const game = makeMockGame();
    const e = new EnemyBase();
    e.init('archer', 1, game);
    e.x = 200; e.y = 0;
    const player = makePlayer({ x: 0, y: 0, radius: 16, untargetable: true });
    for (let i = 0; i < 80; i++) e.update(0.05, player, game);
    assert.equal(game.enemyBullets.length, 0, '隐身期间弓手不得开火');
    assert.equal(e.rangedAimWindup, 0, '瞄准前摇也不得启动');

    player.untargetable = false;
    for (let i = 0; i < 120 && game.enemyBullets.length === 0; i++) e.update(0.05, player, game);
    assert.ok(game.enemyBullets.length > 0, '隐身解除后弓手恢复射击');
});

// ── 测试房「数值调试」开关 ─────────────────────────────────────

test('无CD释放:Q 施放后不落冷却，可立刻再次施放', () => {
    const p = makeRealPlayer();
    const game = makeMockGame({ testCeasefire: true, testNoCd: true });
    p.tick(0.01, { ...noKeys, isKeyQ: () => true }, game);
    for (let i = 0; i < 45; i++) p.tick(0.05, noKeys, game);
    assert.equal(p._casts.length, 1, '第一次Q正常施放');
    assert.equal(p._qCd, 0, '无CD期间Q不进入冷却');
    // 常规模式下同一份冷却会在施放请求时立即挂上
    p.tick(0.01, { ...noKeys, isKeyQ: () => true }, { ...game, testNoCd: false });
    assert.ok(p._qCd > 0, '关闭无CD后恢复常规冷却');
});

test('无CD释放:R 未充能也可施放且不消耗充能', () => {
    const p = makeRealPlayer();
    const game = makeMockGame({ testCeasefire: true, testNoCd: true });
    p._rCharge = 0;
    p.tick(0.01, { ...noKeys, isKeyR: () => true }, game);
    assert.equal(p._rCharge, 1, '无CD期间R施放后保持满充能');
    assert.equal(p.ultReady, true, 'ultReady 不被清零');
    for (let i = 0; i < 45; i++) p.tick(0.05, noKeys, game);
    assert.ok(p._casts.includes('r'), '未充能的R在无CD模式下成功施放');
});

test('玩家伤害倍率:getDamage 统一乘算（game 参数与 _game 回退两路都生效）', () => {
    const p = makeRealPlayer();
    const base = p.getDamage();
    assert.equal(p.getDamage(makeMockGame({ testPlayerDmgMult: 2 })), base * 2, '显式传 game');
    p._game = makeMockGame({ testPlayerDmgMult: 5 });
    assert.equal(p.getDamage(), base * 5, '不传 game 时回退 _game');
    p._game = makeMockGame({});
    assert.equal(p.getDamage(), base, '开关复位后不影响正式数值');
});

test('敌方伤害倍率:takeDamage 统一乘算（护甲结算之前）', () => {
    const p = makeRealPlayer();
    const game = makeMockGame({ testEnemyDmgMult: 2 });
    p.takeDamage(10, game);
    assert.equal(p.hp, p.stats.maxHp - 20, '承伤×2');
    // ignoreIframe 跳过首次受击后的无敌帧（测试房敌弹同款选项）
    game.testEnemyDmgMult = 0.5;
    p.takeDamage(10, game, { ignoreIframe: true });
    assert.equal(p.hp, p.stats.maxHp - 25, '承伤×0.5（压测生存档）');
});
