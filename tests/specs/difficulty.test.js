'use strict';
// 难度系统测试：难度乘区（怪物非移速数值缩放）+ 简单难度 Boss 技能削减（1/3）
const test = require('node:test');
const assert = require('node:assert/strict');
const { DIFFICULTIES } = require('../dist/data/DifficultyDB');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { BossController } = require('../dist/entities/BossController');
const { makeMockGame, makePlayer } = require('./mockGame');

const byId = (id) => DIFFICULTIES.find(d => d.id === id);

function makeBoss(game, mapId = 1) {
    const boss = new BossController();
    boss.initBoss(mapId * 5, game);   // v5：图 m 章 5（图末节点）
    boss.x = 0; boss.y = 0;
    return boss;
}

test('难度表：四档 easy→hell，强度 0.75/1/1.25/1.5 + 数量 0.85/1/1.1/1.2 + 金币 0.9/1/1.2/1.35（2026-10-07 三联定稿）', () => {
    assert.equal(DIFFICULTIES.length, 4);
    assert.deepEqual(DIFFICULTIES.map(d => d.id), ['easy', 'normal', 'hard', 'hell']);
    assert.deepEqual(DIFFICULTIES.map(d => d.statMult), [0.75, 1, 1.25, 1.5]);
    assert.deepEqual(DIFFICULTIES.map(d => d.countMult), [0.85, 1, 1.1, 1.2], '数量增幅取强度一半，防密度爆炸');
    assert.deepEqual(DIFFICULTIES.map(d => d.goldMult), [0.9, 1, 1.2, 1.35], '金币对齐强度再吃数量加成');
    assert.equal(DIFFICULTIES[0].bossSkillCut, 3, '简单难度 Boss 只保留 1/3 技能');
    for (let i = 1; i < 4; i++) {
        assert.ok(!DIFFICULTIES[i].bossSkillCut, '其余难度 Boss 技能完整');
    }
});

test('地狱难度：怪物血/攻/甲×1.5 且移速与攻速不变；金币不吃难度乘区（v4 9.3，grunt 表值 2）', () => {
    const game = makeMockGame({ _difficulty: byId('hell') });
    const e = new EnemyBase();
    e.init('grunt', 1, game);
    assert.equal(e.maxHp, 120);   // 80 × 1.5
    assert.equal(e.hp, 120);
    assert.equal(e.damage, 12);   // 8 × 1.5
    assert.equal(e.goldValue, 2, '金币走独立难度系数，不再吃 statMult');
    assert.equal(e.speed, 82, '移速不吃难度乘区（2026-11-09 敌人提速：grunt 65→82）');
    assert.equal(e.attackSpeed, 1, '攻速节奏不吃难度乘区');
});

test('简单难度：怪物数值×0.75，护盾兵的护盾同样缩放', () => {
    const game = makeMockGame({ _difficulty: byId('easy') });
    const e = new EnemyBase();
    e.init('shield', 1, game);
    assert.equal(e.maxHp, 45);          // 60 × 0.75
    assert.equal(e.hp, 45);
    assert.equal(e.maxShieldHp, 60);    // 80 × 0.75
    assert.equal(e.shieldHp, 60);
    assert.equal(e.damage, 7.5);        // 10 × 0.75
});

test('难度乘区先于精英增幅：简单精英 200×0.75×3 = 450', () => {
    const game = makeMockGame({ _difficulty: byId('easy') });
    const e = new EnemyBase();
    e.init('elite_grunt', 1, game);
    assert.equal(e.maxHp, 450);
    assert.equal(e.damage, 20.25);       // 18 × 0.75 × 1.5
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
    // 第1章 Boss 表值 3000/42/62/10/150（金币 v4 重标且不吃难度乘区）
    assert.equal(b.maxHp, 2250);  assert.equal(b.hp, 2250);   // 3000 × 0.75
    assert.equal(b.damage, 31.5);                             // 42 × 0.75
    assert.equal(b.armor, 7.5);                               // 10 × 0.75
    assert.equal(b.goldValue, 150);
    assert.equal(b.speed, 62, 'Boss 移速不吃难度乘区');
    assert.equal(b.bossSkillCut, 3);

    const plain = makeBoss(makeMockGame());
    assert.equal(plain.maxHp, 3000);
    assert.equal(plain.damage, 42);
    assert.equal(plain.bossSkillCut, 0);
});

test('简单难度：章节 Boss 技能轮转仅保留第1招，普攻不受削减（敌人技能优化方案）', () => {
    const spawned = [];
    const game = makeMockGame({
        _difficulty: byId('easy'),
        spawnEnemy(type) { spawned.push(type); },
    });
    const boss = makeBoss(game);
    const player = makePlayer({ x: 1000, y: 1000 });
    assert.ok(boss.bossSkillCut > 0, '简单难度开启技能削减');
    // 通用召唤/冲锋计时对 ch1~4 已由技能库接管，简单难度同样不触发
    boss._summonTimer = 0.01;
    boss._chargeCd = 0.01;
    boss.update(0.02, player, game);
    assert.equal(spawned.length, 0, '简单难度不召唤小怪');
    assert.equal(boss.isCharging, false, '简单难度不冲锋');
    assert.equal(boss.chargeWindup, 0);
    // 技能轮转：削减后技能池只剩第1招，多轮驱动名称恒定
    const fired = [];
    game.floatingText = { spawn(_x, _y, text) { fired.push(text); } };
    for (let i = 0; i < 4; i++) {
        boss.docSkillTimer = 0;
        boss._updateChapterBossSkills(0.01, player, game);
    }
    assert.ok(fired.length >= 3, `多轮驱动应释放多次技能（实际${fired.length}）`);
    assert.ok(new Set(fired).size === 1, `简单难度只保留第1招（出现了 ${[...new Set(fired)]}）`);
    // 普攻弹幕照常（ch1 三发毒球）
    game.enemyBullets.length = 0;
    boss.docBasicTimer = 0;
    boss.docSkillTimer = 999;
    boss._updateChapterBossSkills(0.01, player, game);
    assert.equal(game.enemyBullets.length, 3, '普攻不受技能削减');

    // 对照：普通难度技能轮转在第1、2招之间轮换（不再只有第1招）
    const fired2 = [];
    const game2 = makeMockGame({
        _difficulty: byId('normal'),
        floatingText: { spawn(_x, _y, text) { fired2.push(text); } },
    });
    const boss2 = makeBoss(game2);
    assert.equal(boss2.bossSkillCut, 0, '普通难度技能完整');
    for (let i = 0; i < 4; i++) {
        boss2.docSkillTimer = 0;
        boss2._updateChapterBossSkills(0.01, player, game2);
    }
    assert.ok(new Set(fired2).size >= 2, `普通难度 P1 应在前2招间轮换（出现了 ${[...new Set(fired2)]}）`);
});

test('简单难度：灭世机神仅保留天罚网格激光，导弹/追踪弹与最终形态关闭', () => {
    const calls = [];
    let gridFired = 0;
    const game = makeMockGame({
        _difficulty: byId('easy'),
        startInvaderMissiles() { calls.push('missiles'); },
        startInvaderLaserGrid() { gridFired++; },
    });
    const boss = makeBoss(game, 6); // 图6 → invader 技能集
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
