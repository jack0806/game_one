'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WaveManager } = require('../dist/systems/WaveManager');
const { ENEMY_COUNT_BY_WAVE, chapterForWave } = require('../dist/data/WaveData');
const { makeMockGame } = require('./mockGame');

function drainSpawning(wm, game, spawned) {
    // 逐帧推进直到spawning阶段完全出队(spawnInterval=0.5s)
    let guard = 0;
    while (wm.state === 'spawning' && guard++ < 100000) {
        wm.update(0.5, game);
    }
}

test('ENEMY_COUNT_BY_WAVE 数量随波次增长,难度倍率正确,且存在48的封顶', () => {
    // 2026-09-07 密度上调:6+3/wave/封顶48(旧为4+2/wave/封顶28)
    assert.equal(ENEMY_COUNT_BY_WAVE(1, 'normal'), 9);   // min(6+3,48)=9
    assert.equal(ENEMY_COUNT_BY_WAVE(20, 'normal'), 48); // min(6+60,48)=48 封顶
    assert.equal(ENEMY_COUNT_BY_WAVE(1, 'nightmare'), 13); // floor(9*1.5)
    assert.equal(ENEMY_COUNT_BY_WAVE(1, 'chaos'), 18);    // 9*2
});

test('startWave在Boss波(第5波)先刷boss再正常刷小怪', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const game = makeMockGame();
        const wm = new WaveManager();
        wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
        for (let w = 1; w <= 5; w++) wm.startWave(game);
        assert.ok(wm.isBossWave(), '第5波应判定为Boss波');
        drainSpawning(wm, game);
        const spawnedTypes = game.enemies.map(e => e.type);
        assert.equal(spawnedTypes[0], 'boss', 'Boss波应先刷出boss');
        assert.equal(spawnedTypes.filter(t => t === 'boss').length, 1, '只刷1个boss');
        // boss 波会跟小怪关一样正常刷小怪（数量与普通波一致）
        assert.equal(game.enemies.length, 1 + ENEMY_COUNT_BY_WAVE(5, 'normal'), 'boss波应附带完整小怪波');
    } finally {
        Math.random = originalRandom;
    }
});

test('完整主线1~25波(每章5波)与无尽26波的队列均可生成,章节和Boss节点连续', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // 固定敌池，且不追加随机精英
    try {
        const game = makeMockGame();
        const wm = new WaveManager();
        const bossWaves = new Set([5, 10, 15, 20, 25]);
        wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };

        for (let wave = 1; wave <= 25; wave++) {
            game.enemies = [];
            wm.startWave(game);
            drainSpawning(wm, game);
            assert.equal(wm.wave, wave);
            assert.equal(wm.chapter, chapterForWave(wave));
            if (bossWaves.has(wave)) {
                const types = game.enemies.map(e => e.type);
                assert.equal(types[0], 'boss', `第${wave}波应先刷章节Boss`);
                assert.equal(types.filter(t => t === 'boss').length, 1, `第${wave}波只有1个章节Boss`);
                assert.equal(game.enemies.length, 1 + ENEMY_COUNT_BY_WAVE(wave, 'normal'), `第${wave}波boss波应带完整小怪波`);
            } else {
                assert.equal(game.enemies.length, ENEMY_COUNT_BY_WAVE(wave, 'normal'), `第${wave}波敌人数异常`);
            }
        }

        // 无尽开启后的第26波会激活首个变异；固定随机数选择非增殖型变异，
        // 同时避开随机精英追加，以验证主线通关后仍可继续建立第5章敌群。
        Math.random = () => 0.5;
        wm.endless = true;
        game.enemies = [];
        wm.startWave(game);
        drainSpawning(wm, game);
        assert.equal(wm.wave, 26);
        assert.equal(wm.chapter, 5);
        assert.equal(game.enemies.length, ENEMY_COUNT_BY_WAVE(26, 'normal'));
    } finally {
        Math.random = originalRandom;
    }
});

test('nightmare与chaos内部模式在无尽波均使用各自难度倍率', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        for (const difficulty of ['nightmare', 'chaos']) {
            const game = makeMockGame();
            const wm = new WaveManager();
            wm.wave = 40;
            wm.difficulty = difficulty;
            wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
            wm.startWave(game);
            drainSpawning(wm, game);
            assert.equal(game.enemies.length, ENEMY_COUNT_BY_WAVE(41, difficulty), `${difficulty}第41波倍率异常`);
        }
    } finally {
        Math.random = originalRandom;
    }
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

        assert.equal(gameBase.enemies.length, 9, '第1波基础敌人9个(密度上调后)');
        assert.equal(gameMut.enemies.length, 27, 'cloneWar三倍=9+9*2');
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

// ---- 批次刷怪(一波3-4个,近战+远程混合) --------------------------

test('普通波队列成批编组:每批5-7个且包含近战与远程(archer)', () => {
    const game = makeMockGame();
    const wm = new WaveManager();
    const batches = [];
    let clock = 0;
    let lastFire = -1;
    wm.onSpawnEnemy = (type, x, y) => {
        if (clock !== lastFire) { batches.push([]); lastFire = clock; }
        batches[batches.length - 1].push({ type, x, y });
    };
    wm.startWave(game); // 第1波: 9个
    while (wm.state === 'spawning') { clock += 2.5; wm.update(2.5, game); }

    // 5%精英事件会另追加一个单独精英批，不属于基础9只的5~7人编组。
    const normalBatches = batches.filter(b => !(b.length === 1 && b[0].type === 'elite_grunt'));
    assert.equal(normalBatches.length, 2, '9个基础敌人应分成2批');
    for (const b of normalBatches) {
        // 批次为5-7个；尾批允许3-4个（避免1-2只的碎尾巴批）
        assert.ok(b.length >= 3 && b.length <= 7, `每批应3-7个,实际${b.length}`);
        assert.ok(b.some(e => e.type === 'archer'), '每批都应含远程archer');
        assert.ok(b.some(e => e.type !== 'archer'), '每批都应含近战');
    }
    // 同批成员应共享同一个边缘锚点(x或y贴近同一边缘,散布在±50内)
    const first = normalBatches[0];
    const xs = first.map(e => e.x), ys = first.map(e => e.y);
    const sameEdge = Math.max(...xs) - Math.min(...xs) <= 130 || Math.max(...ys) - Math.min(...ys) <= 130;
    assert.ok(sameEdge, '同批成员应从同一边缘锚点附近进场');
});
