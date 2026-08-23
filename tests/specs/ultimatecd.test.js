'use strict';
// 大招R冷却制测试：旧版靠击杀怪物充能(每杀+12%)，现改为固定30秒冷却随时间恢复。
const test = require('node:test');
const assert = require('node:assert/strict');
const { PlayerController } = require('../dist/entities/PlayerController');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { makeMockGame } = require('./mockGame');

function makeRealPlayer(ultChargeRate = 1) {
    const p = new PlayerController();
    p.x = 100; p.y = 100; p.radius = 16; p.alive = true;
    p.charId = 'reik';
    p._charDef = CHARACTERS.reik;
    p.stats = {
        ...CHARACTERS.reik.stats,
        critRate: 0, critDmg: 0, eliteBonus: 0,
        goldPickupRange: 60, cdReduction: 0, ultChargeRate,
    };
    return p;
}

function noInput() {
    return {
        getAxis: () => [0, 0],
        isDashPressed: () => false,
        isKeyQPressed: () => false,
        isKeyEPressed: () => false,
        isKeyRPressed: () => false,
        mouse: { x: 0, y: 0 },
    };
}

test('大招R随时间冷却:半程半充能,充满ultCd秒后充满并就绪(冷却按角色强度分档)', () => {
    const p = makeRealPlayer();
    const game = makeMockGame();
    const ultCd = CHARACTERS.reik.ultCd; // 雷克:死亡意志(功能型)=18s
    assert.ok(ultCd >= 15 && ultCd <= 20, '角色ultCd应落在15-20秒分档内');
    p.tick(ultCd / 2, noInput(), game);
    assert.ok(Math.abs(p.getUltChargeRatio() - 0.5) < 1e-9, '半程应充能一半');
    assert.ok(!p.ultReady, '未充满时不就绪');
    p.tick(ultCd / 2, noInput(), game);
    assert.equal(p.getUltChargeRatio(), 1, '充满ultCd秒后应充满');
    assert.ok(p.ultReady, '充满后应就绪');
});

test('ultChargeRate(储能核心)等比缩短大招恢复时间', () => {
    const p = makeRealPlayer(2); // 充能速度×2 → 一半时间充满
    const game = makeMockGame();
    p.tick(CHARACTERS.reik.ultCd / 2, noInput(), game);
    assert.equal(p.getUltChargeRatio(), 1, '×2充能速度下一半时间即应充满');
});

test('六个角色ultCd全部落在15-20秒强度分档内', () => {
    for (const key of Object.keys(CHARACTERS)) {
        const cd = CHARACTERS[key].ultCd;
        assert.ok(cd >= 15 && cd <= 20, `${key}的ultCd(${cd})应在15-20区间`);
    }
});

test('击杀敌人不再给大招充能(旧版每杀+12%)', () => {
    const p = makeRealPlayer();
    const game = makeMockGame();
    const e = new EnemyBase();
    e.init('grunt', 1, game);
    e.x = 100; e.y = 100;
    e._die(p, game);
    assert.equal(p.getUltChargeRatio(), 0, '击杀不应再给大招充能');
});

test('resetCooldowns(永恒机器)应把大招CD一并归零立即可用', () => {
    const p = makeRealPlayer();
    p.resetCooldowns();
    assert.equal(p.getUltChargeRatio(), 1, 'CD归零后大招应立即可用');
});
