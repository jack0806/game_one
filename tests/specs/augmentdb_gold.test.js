// ============================================================
//  augmentdb_gold.test.js — 金色词条钩子测试
//  覆盖之前被sub-agent审查标记为"死代码"、本轮修复的3个金色词条：
//  time_paradox / cosmos_law / eternal_machine
// ============================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AUGMENT_DB, chainLightning } = require('../dist/data/AugmentDB');
const { makeMockGame, makePlayer } = require('./mockGame');

// 每个测试都取一份独立拷贝，避免_cd/_timer等内部状态跨测试串味
function findAug(id) {
    const a = AUGMENT_DB.find(x => x.id === id);
    assert.ok(a, `词条${id}应存在于AUGMENT_DB`);
    return { ...a };
}

test('chainLightning只命中邻近目标且不会循环重复命中', () => {
    const hits = new Map();
    const enemies = [
        { x: 0, y: 0, alive: true, takeDamage(dmg) { hits.set(this, (hits.get(this) || 0) + dmg); } },
        { x: 100, y: 0, alive: true, takeDamage(dmg) { hits.set(this, (hits.get(this) || 0) + dmg); } },
        { x: 180, y: 0, alive: true, takeDamage(dmg) { hits.set(this, (hits.get(this) || 0) + dmg); } },
        { x: 600, y: 0, alive: true, takeDamage(dmg) { hits.set(this, (hits.get(this) || 0) + dmg); } },
    ];
    const game = {
        enemies,
        particles: { lightning() {} },
        floatingText: { spawn() {} },
    };
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
        chainLightning({}, enemies[0], 20, 3, game);
    } finally {
        Math.random = originalRandom;
    }
    assert.equal(hits.get(enemies[1]), 20);
    assert.equal(hits.get(enemies[2]), 16);
    assert.equal(hits.has(enemies[3]), false, '远处敌人不应被连锁误伤');
});

// ── cosmos_law ──────────────────────────────────────────────
test('cosmos_law: onEquip写入stats.hasCosmos=true(消费点在PlayerController.tick的R键分支)', () => {
    const aug = findAug('cosmos_law');
    const player = makePlayer();
    player.stats.hasCosmos = false;
    const game = makeMockGame();
    aug.onEquip(player, game, 1);
    assert.equal(player.stats.hasCosmos, true);
});

// ── eternal_machine ───────────────────────────────────────────
test('eternal_machine: onEquip写入hasEternal=true,自身CD初始为0', () => {
    const aug = findAug('eternal_machine');
    assert.equal(aug._cd, 0);
    const player = makePlayer();
    const game = makeMockGame();
    aug.onEquip(player, game, 1);
    assert.equal(player.stats.hasEternal, true);
});

test('eternal_machine: onSkill在hasEternal=true且自身CD就绪时触发,清零技能CD+施加永恒增益+进入30s自身CD', () => {
    const aug = findAug('eternal_machine');
    const player = makePlayer();
    player.stats.hasEternal = true;
    let resetCalled = false;
    let buffApplied = null;
    player.resetCooldowns = () => { resetCalled = true; };
    player.applyBuff = (id, dur, mods) => { buffApplied = { id, dur, mods }; };
    const game = makeMockGame();
    aug.onSkill(player, game);
    assert.equal(resetCalled, true, '应调用player.resetCooldowns()清空Q/E/闪避CD');
    assert.ok(buffApplied, '应调用player.applyBuff施加永恒状态增益');
    assert.equal(buffApplied.id, 'eternal_machine');
    assert.equal(buffApplied.dur, 10);
    assert.equal(aug._cd, 30, '触发后自身应进入30s CD,防止连续触发');
});

test('eternal_machine: onSkill在未装备(hasEternal=false)时不触发任何效果', () => {
    const aug = findAug('eternal_machine');
    const player = makePlayer();
    player.stats.hasEternal = false;
    let resetCalled = false;
    player.resetCooldowns = () => { resetCalled = true; };
    const game = makeMockGame();
    aug.onSkill(player, game);
    assert.equal(resetCalled, false);
    assert.equal(aug._cd, 0);
});

test('eternal_machine: onSkill在自身CD未就绪(_cd>0)时不重复触发', () => {
    const aug = findAug('eternal_machine');
    const player = makePlayer();
    player.stats.hasEternal = true;
    let triggerCount = 0;
    player.resetCooldowns = () => { triggerCount++; };
    player.applyBuff = () => {};
    const game = makeMockGame();
    aug.onSkill(player, game); // 第一次触发,_cd变为30
    aug.onSkill(player, game); // 第二次应被_cd拦截,不再触发
    assert.equal(triggerCount, 1, 'CD未到时不应重复触发resetCooldowns');
});

test('eternal_machine: onUpdate按dt递减自身CD,且不会变为负数', () => {
    const aug = findAug('eternal_machine');
    aug._cd = 30;
    aug.onUpdate(null, 5);
    assert.equal(aug._cd, 25);
    aug.onUpdate(null, 100);
    assert.equal(aug._cd, 0, 'CD耗尽后应clamp在0,不应变负');
});

// ── time_paradox ──────────────────────────────────────────────
test('time_paradox: onEquip写入hasTimeParadox=true且_timeParadoxUsed=false(本波次可用一次)', () => {
    const aug = findAug('time_paradox');
    const player = makePlayer();
    const game = makeMockGame();
    aug.onEquip(player, game, 1);
    assert.equal(player.stats.hasTimeParadox, true);
    assert.equal(player.stats._timeParadoxUsed, false);
});

test('time_paradox: onWaveStart重置_timeParadoxUsed=false(每波刷新一次撤销死亡机会)', () => {
    const aug = findAug('time_paradox');
    const player = makePlayer();
    player.stats._timeParadoxUsed = true;
    aug.onWaveStart(player);
    assert.equal(player.stats._timeParadoxUsed, false);
});
