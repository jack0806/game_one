'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BossController } = require('../dist/entities/BossController');
const { makeMockGame, makePlayer } = require('./mockGame');

function makeBoss(game) {
    const boss = new BossController();
    boss.initBoss(0, game); // chapter=0 (0-based) → wave=10 → chapter 1 表
    boss.x = 0; boss.y = 0;
    return boss;
}

test('DoT把boss血量打到<=0时应触发死亡(_die),而不是让boss带负血继续存活', () => {
    const game = makeMockGame();
    const boss = makeBoss(game);
    boss.dots.push({ type: 'burn', dps: boss.maxHp, timeLeft: 5, color: '#f80' });
    const player = makePlayer();
    boss.update(1, player, game);
    assert.equal(boss.alive, false, 'DoT把hp打到<=0后boss应标记为死亡');
    assert.equal(boss.hp, 0, '死亡时hp应被夹到0(EnemyBase._die的行为)');
});

test('slowMult在_slowTimer到期后应自动恢复为1(之前override update后完全没有衰减逻辑)', () => {
    const game = makeMockGame();
    const boss = makeBoss(game);
    boss.slowMult = 0.3;
    boss._slowTimer = 0.5;
    const player = makePlayer({ x: 1000, y: 1000 }); // 远离boss,避免近战伤害分支干扰
    boss.update(0.6, player, game); // dt > _slowTimer,应触发恢复
    assert.equal(boss.slowMult, 1, '_slowTimer耗尽后slowMult应恢复为1');
    assert.equal(boss._slowTimer, 0);
});

test('boss追逐移动速度应受slowMult影响(之前减速对boss完全无效)', () => {
    const game = makeMockGame();
    const bossSlowed = makeBoss(game);
    bossSlowed.slowMult = 0; // 完全定身
    bossSlowed.x = 100; bossSlowed.y = 100;
    const player = makePlayer({ x: 500, y: 100 });
    const x0 = bossSlowed.x;
    bossSlowed.update(1, player, game);
    assert.equal(bossSlowed.x, x0, 'slowMult=0(定身)时boss不应发生位移');

    const bossNormal = makeBoss(game);
    bossNormal.x = 100; bossNormal.y = 100;
    bossNormal.slowMult = 1;
    const x1 = bossNormal.x;
    bossNormal.update(1, player, game);
    assert.notEqual(bossNormal.x, x1, 'slowMult=1时boss应正常追逐移动');
});
