'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WaveManager } = require('../dist/systems/WaveManager');
const { ENEMY_COUNT_BY_WAVE } = require('../dist/data/WaveData');
const { makeMockGame } = require('./mockGame');

function drainSpawning(wm, game, spawned) {
    // 逐帧推进直到spawning阶段完全出队(spawnInterval=0.5s)
    let guard = 0;
    while (wm.state === 'spawning' && guard++ < 100000) {
        wm.update(0.5, game);
    }
}

test('ENEMY_COUNT_BY_WAVE 数量随波次增长,难度倍率正确,且存在28的封顶', () => {
    assert.equal(ENEMY_COUNT_BY_WAVE(1, 'normal'), 6);   // min(4+2,28)=6
    assert.equal(ENEMY_COUNT_BY_WAVE(20, 'normal'), 28); // min(4+40,28)=28 封顶
    assert.equal(ENEMY_COUNT_BY_WAVE(1, 'nightmare'), 9); // floor(6*1.5)
    assert.equal(ENEMY_COUNT_BY_WAVE(1, 'chaos'), 12);    // 6*2
});

test('startWave在Boss波(第10/20/30/40波)只生成boss队列', () => {
    const game = makeMockGame();
    const wm = new WaveManager();
    wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
    for (let w = 1; w <= 10; w++) wm.startWave(game);
    assert.ok(wm.isBossWave(), '第10波应判定为Boss波');
    drainSpawning(wm, game);
    const spawnedTypes = game.enemies.map(e => e.type);
    assert.deepEqual(spawnedTypes, ['boss'], 'Boss波应该只刷出1个boss');
});

test('变异mirrorArmy在Boss波时使boss数量×2', () => {
    const game = makeMockGame({ _mutationMods: { mirrorArmy: true } });
    const wm = new WaveManager();
    wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
    for (let w = 1; w <= 10; w++) wm.startWave(game);
    drainSpawning(wm, game);
    const bossCount = game.enemies.filter(e => e.type === 'boss').length;
    assert.equal(bossCount, 2, 'mirrorArmy应使Boss波生成2个boss');
});

test('变异cloneWar使普通波次敌人数量变为3倍(原本count + count*2)', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // 固定敌人抽取，并确保5%精英追加不触发
    try {
        const gameBase = makeMockGame();
        const wmBase = new WaveManager();
        wmBase.onSpawnEnemy = (type) => { gameBase.enemies.push({ type, alive: true, dead: false }); };
        wmBase.startWave(gameBase); // 第1波,普通波
        drainSpawning(wmBase, gameBase);

        const gameMut = makeMockGame({ _mutationMods: { cloneWar: true } });
        const wmMut = new WaveManager();
        wmMut.onSpawnEnemy = (type) => { gameMut.enemies.push({ type, alive: true, dead: false }); };
        wmMut.startWave(gameMut);
        drainSpawning(wmMut, gameMut);

        assert.equal(gameBase.enemies.length, 6);
        assert.equal(gameMut.enemies.length, 18);
    } finally {
        Math.random = originalRandom;
    }
});

test('波次清空后进入intermission,倒计时结束触发onWaveCleared回调', () => {
    const game = makeMockGame();
    const wm = new WaveManager();
    let cleared = false;
    wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
    wm.onWaveCleared = () => { cleared = true; };
    wm.startWave(game);
    drainSpawning(wm, game);
    assert.equal(wm.state, 'fighting');

    // 全部敌人标记死亡
    for (const e of game.enemies) e.dead = true;
    wm.update(0.1, game);
    assert.equal(wm.state, 'intermission');

    wm.update(2, game); // 超过intermission的1.5秒
    assert.equal(cleared, true, 'intermission结束应回调onWaveCleared');
    assert.equal(wm.state, 'idle');
});

test('变异chaosBeat每5秒对活着敌人的40%施加临时buff', () => {
    const game = makeMockGame({ _mutationMods: { chaosBeat: true } });
    // alive:true 是必须的 —— WaveManager.update()的fighting分支用 `!e.dead && e.alive`
    // 判断存活数，缺了alive字段会被误判为全灭,进而在同一帧误触发intermission/onWaveCleared。
    game.enemies = Array.from({ length: 10 }, () => ({ dead: false, alive: true, applyChaosBuff(m, d) { this._buffed = [m, d]; } }));
    const wm = new WaveManager();
    wm.state = 'fighting'; // 跳过spawning/intermission分支干扰
    wm.update(5, game); // 触发一次chaosBeat
    const buffedCount = game.enemies.filter(e => e._buffed).length;
    assert.equal(buffedCount, 4, 'ceil(10*0.4)=4个敌人应被buff');
});

test('reset()清空波次状态回到初始值', () => {
    const game = makeMockGame();
    const wm = new WaveManager();
    wm.onSpawnEnemy = () => {};
    wm.startWave(game);
    wm.reset();
    assert.equal(wm.wave, 0);
    assert.equal(wm.chapter, 1);
    assert.equal(wm.state, 'idle');
});
