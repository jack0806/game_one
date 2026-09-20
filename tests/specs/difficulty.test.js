'use strict';
// 难度系统测试：难度乘区（怪物非移速数值缩放）+ 简单难度 Boss 技能削减（1/3）
const test = require('node:test');
const assert = require('node:assert/strict');
const { DIFFICULTIES } = require('../dist/data/DifficultyDB');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { BossController } = require('../dist/entities/BossController');
const { makeMockGame, makePlayer } = require('./mockGame');

const byId = (id) => DIFFICULTIES.find(d => d.id === id);

function makeBoss(game, chapter0 = 0) {
    const boss = new BossController();
    boss.initBoss(chapter0, game);
    boss.x = 0; boss.y = 0;
    return boss;
}

test('难度表：四档 easy→hell，倍率 0.25/0.5/1/1.5，仅简单削减 Boss 技能', () => {
    assert.equal(DIFFICULTIES.length, 4);
    assert.deepEqual(DIFFICULTIES.map(d => d.id), ['easy', 'normal', 'hard', 'hell']);
    assert.deepEqual(DIFFICULTIES.map(d => d.statMult), [0.25, 0.5, 1, 1.5]);
    assert.equal(DIFFICULTIES[0].bossSkillCut, 3, '简单难度 Boss 只保留 1/3 技能');
    for (let i = 1; i < 4; i++) {
        assert.ok(!DIFFICULTIES[i].bossSkillCut, '其余难度 Boss 技能完整');
    }
});

test('地狱难度：怪物血/攻/甲/赏金×1.5，移速与攻速不变（grunt 波1基准 80/8/0/8/65）', () => {
    const game = makeMockGame({ _difficulty: byId('hell') });
    const e = new EnemyBase();
    e.init('grunt', 1, game);
    assert.equal(e.maxHp, 120);
    assert.equal(e.hp, 120);
    assert.equal(e.damage, 12);
    assert.equal(e.goldValue, 12);
    assert.equal(e.speed, 65, '移速不吃难度乘区');
    assert.equal(e.attackSpeed, 1, '攻速节奏不吃难度乘区');
});

test('简单难度：怪物数值×0.25，护盾兵的护盾同样缩放', () => {
    const game = makeMockGame({ _difficulty: byId('easy') });
    const e = new EnemyBase();
    e.init('shield', 1, game);
    assert.equal(e.maxHp, 15);          // 60 × 0.25
    assert.equal(e.hp, 15);
    assert.equal(e.maxShieldHp, 20);    // 80 × 0.25
    assert.equal(e.shieldHp, 20);
    assert.equal(e.damage, 2.5);        // 10 × 0.25
});

test('难度乘区先于精英增幅：简单精英 200×0.25×3 = 150', () => {
    const game = makeMockGame({ _difficulty: byId('easy') });
    const e = new EnemyBase();
    e.init('elite_grunt', 1, game);
    assert.equal(e.maxHp, 150);
    assert.equal(e.damage, 6.75);       // 18 × 0.25 × 1.5
});

test('无难度注入（测试房/旧流程）：数值精确等于表值', () => {
    const e = new EnemyBase();
    e.init('grunt', 1, makeMockGame());
    assert.equal(e.maxHp, 80);
    assert.equal(e.damage, 8);
});

test('Boss 数值吃难度乘区且移速不变；简单难度带技能削减标记', () => {
    const easy = makeMockGame({ _difficulty: byId('easy') });
    const b = makeBoss(easy);
    // 第1章 Boss 表值 3000/42/62/10/200
    assert.equal(b.maxHp, 750);  assert.equal(b.hp, 750);
    assert.equal(b.damage, 10.5);
    assert.equal(b.armor, 2.5);
    assert.equal(b.goldValue, 50);
    assert.equal(b.speed, 62, 'Boss 移速不吃难度乘区');
    assert.equal(b.bossSkillCut, 3);

    const plain = makeBoss(makeMockGame());
    assert.equal(plain.maxHp, 3000);
    assert.equal(plain.damage, 42);
    assert.equal(plain.bossSkillCut, 0);
});

test('简单难度：章节 Boss 整场不召唤不冲锋（3 项技能仅保留弹幕主技）', () => {
    const spawned = [];
    const game = makeMockGame({
        _difficulty: byId('easy'),
        spawnEnemy(type) { spawned.push(type); },
    });
    const boss = makeBoss(game);
    const player = makePlayer({ x: 1000, y: 1000 });
    boss._summonTimer = 0.01;
    boss._chargeCd = 0.01;
    boss.update(0.02, player, game);
    assert.equal(spawned.length, 0, '简单难度不召唤小怪');
    assert.equal(boss.isCharging, false, '简单难度不冲锋');
    assert.equal(boss.chargeWindup, 0);
    // 弹幕主技保留：_skillTimer 到点仍进入前摇
    boss._skillTimer = 0.01;
    boss.update(0.02, player, game);
    assert.ok(boss.skillWindup > 0, '弹幕主技仍正常蓄力');

    // 对照：普通难度召唤正常触发
    const spawned2 = [];
    const game2 = makeMockGame({
        _difficulty: byId('normal'),
        spawnEnemy(type) { spawned2.push(type); },
    });
    const boss2 = makeBoss(game2);
    boss2._summonTimer = 0.01;
    boss2.update(0.02, player, game2);
    assert.equal(spawned2.length, 1, '普通难度按阶段召唤 1 只 grunt');
});

test('简单难度：灭世机神仅保留天罚网格激光，导弹/追踪弹与最终形态关闭', () => {
    const calls = [];
    let gridFired = 0;
    const game = makeMockGame({
        _difficulty: byId('easy'),
        startInvaderMissiles() { calls.push('missiles'); },
        startInvaderLaserGrid() { gridFired++; },
    });
    const boss = makeBoss(game, 5); // 第6章 → invader 技能集
    assert.equal(boss.chapter, 6);
    const player = makePlayer({ x: 400, y: 0 });
    boss._invMissileCd = 0;
    boss._invHomingCd = 0;
    boss.update(0.016, player, game);
    assert.deepEqual(calls, [], '导弹被技能削减关闭');
    assert.equal(game.enemyBullets.length, 0, '追踪弹不发射');
    assert.equal(gridFired, 0, '网格激光初始冷却未到,不提前调度');

    // 天罚网格激光保留：冷却到点仍调度（1/3 技能削减后仅存的主技能）
    boss._invLaserCd = 0;
    boss.update(0.016, player, game);
    assert.equal(gridFired, 1, '天罚网格激光(融合技)仍正常调度');

    // 血量掉到 20% 以下也不触发最终形态（技能5 被削减）
    boss.hp = boss.maxHp * 0.1;
    boss.update(0.016, player, game);
    assert.equal(boss.finalForm, false, '简单难度不进入最终形态');
});

test('简单难度：文档 Boss 技能池只循环第 1 招，三阶段不强制终招', () => {
    const used = [];
    const game = makeMockGame({
        _difficulty: byId('easy'),
        startDocBossSkill(_kind, idx) { used.push(idx); },
    });
    const boss = new BossController();
    boss.initBossKind('vespa', game);
    assert.equal(boss.bossSkillCut, 3);
    const player = makePlayer({ x: 400, y: 0 });
    boss.phase = 3;           // 三阶段原本强制第 5 招
    boss.docSkillTimer = 0;   // 立即出招
    boss.update(0.016, player, game);
    assert.deepEqual(used, [0], '三阶段也只放第 1 招');
});
