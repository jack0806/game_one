'use strict';
// v4《关卡设计-15波.md》波次调度测试：一局一章 × 15 波、波型槽位、
// 数量公式（封顶 128）、小首领/精英固定槽、兽潮对齐 W9/W13、无尽循环。
const test = require('node:test');
const assert = require('node:assert/strict');
const { WaveManager } = require('../dist/systems/WaveManager');
const {
    enemyCountForWave, waveKind, eliteSlots, starterPack, WAVES_PER_CHAPTER, ENEMY_COUNT_CAP,
} = require('../dist/data/WaveData');
const { makeMockGame, makePlayer } = require('./mockGame');
const { MINI_BOSSES } = require('../dist/data/BossDB');
const MINI_IDS = new Set(MINI_BOSSES.map(m => m.id));
const TIER = Object.fromEntries(MINI_BOSSES.map(m => [m.id, m.tier]));

function drainSpawning(wm, game) {
    let guard = 0;
    while (wm.state === 'spawning' && guard++ < 100000) {
        wm.update(0.5, game);   // 批间隔 ≥1.2s，0.5 步进必出队
    }
}

/** 跑完一波并返回该波刷出的全部单位 type 列表。 */
function runWave(wm, game) {
    game.enemies = [];
    wm.startWave(game);
    drainSpawning(wm, game);
    return game.enemies.map(e => e.type);
}

function mkWm(chapter = 1, opts = {}) {
    const wm = new WaveManager();
    wm.chapter = chapter;
    Object.assign(wm, opts);
    return wm;
}

test('v4数量公式:(10+2.4L)×波型×章节×难度,round封顶128', () => {
    // 第 1 章普通：W1=12 / W13 兽潮=60 / W6 呼吸=17 / W15 Boss 波=37
    assert.equal(enemyCountForWave(1, 1), 12);
    assert.equal(enemyCountForWave(13, 1), 60, 'W13 兽潮 ×1.45');
    assert.equal(enemyCountForWave(6, 1), 17, 'W6 呼吸 ×0.7');
    assert.equal(enemyCountForWave(15, 1), 37, 'W15 Boss 波小兵 ×0.8');
    // 章节数量系数：第 6 章 W13 = round(41.2×1.45×2.0) = 119，逼近封顶
    assert.equal(enemyCountForWave(13, 6), 119);
    // 难度数量倍率与封顶：第 6 章 W13 = round(119.48×2) 超过 128 截断
    assert.equal(enemyCountForWave(13, 6, 2), ENEMY_COUNT_CAP);
    assert.equal(enemyCountForWave(13, 6, 1.5), 128, '×1.5 倍率超封顶截到 128');
    // v4 难度三联系数（DifficultyDB.countMult）：地狱 ×1.2 时 W13 = round(119.48×1.2) = 143 → 截 128
    assert.equal(enemyCountForWave(13, 1, 1.2), Math.min(Math.round(60 * 1.2), 128), '地狱数量 ×1.2');
    // 全章总量约 430 只（文档 3 节模板）
    let total = 0;
    for (let w = 1; w <= 15; w++) total += enemyCountForWave(w, 1);
    assert.equal(total, 429);
});

test('波型槽位:W9/W13兽潮,W6/W11呼吸,W5/W10小首领护卫,W14守卫,W15 Boss', () => {
    assert.equal(waveKind(9), 'beast');  assert.equal(waveKind(13), 'beast');
    assert.equal(waveKind(6), 'breather'); assert.equal(waveKind(11), 'breather');
    assert.equal(waveKind(5), 'miniGuard'); assert.equal(waveKind(10), 'miniGuard');
    assert.equal(waveKind(14), 'guard');
    assert.equal(waveKind(15), 'boss');
    assert.equal(waveKind(7), 'normal');
});

test('精英固定槽:W4/W8/W14随章爬升(8/11/14),其余波为0', () => {
    for (const w of [1, 2, 3, 5, 7, 9, 12, 13, 15]) assert.equal(eliteSlots(w, 1), 0);
    assert.deepEqual([eliteSlots(4, 1), eliteSlots(8, 1), eliteSlots(14, 1)], [2, 3, 3]);
    assert.deepEqual([eliteSlots(4, 3), eliteSlots(8, 3), eliteSlots(14, 3)], [3, 4, 4]);
    assert.deepEqual([eliteSlots(4, 5), eliteSlots(8, 5), eliteSlots(14, 5)], [4, 5, 5]);
});

test('战备包表:第1章0抽0金,第6章10抽700金', () => {
    assert.deepEqual(starterPack(1), { draws: 0, gold: 0 });
    assert.deepEqual(starterPack(6), { draws: 10, gold: 700 });
});

test('W15=Boss波:小兵先上,清空后大Boss登场;W8波后小兵量×0.8', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;   // 固定敌池与远程抽取
    try {
        const game = makeMockGame();
        const wm = mkWm(1);
        wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
        for (let w = 1; w <= 14; w++) runWave(wm, game);
        const types = runWave(wm, game);
        assert.equal(wm.wave, 15);
        assert.ok(wm.isBossWave(), '关内第15波应判定为Boss波');
        assert.equal(types.filter(t => t === 'boss').length, 0, '开局不刷boss');
        const minionCount = types.filter(t => t !== 'boss').length;
        assert.equal(minionCount, enemyCountForWave(15, 1) + eliteSlots(15, 1), 'Boss波小兵量×0.8');
        for (const e of game.enemies) e.dead = true;
        wm.update(0.1, game);
        assert.equal(game.enemies.filter(e => e.type === 'boss').length, 1, '小兵清空后刷出boss');
    } finally {
        Math.random = originalRandom;
    }
});

test('小首领固定槽位:第1章W5×1/W10×2/W14×1(普通档),其余波为0', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const game = makeMockGame();
        const wm = mkWm(1);
        wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
        const counts = {};
        for (let w = 1; w <= 14; w++) {
            const types = runWave(wm, game);
            counts[w] = types.filter(t => MINI_IDS.has(t));
            if (w !== 5 && w !== 10 && w !== 14) {
                assert.equal(counts[w].length, 0, `第${w}波不应有小首领`);
            }
        }
        assert.equal(counts[5].length, 1, 'W5 试炼 ×1');
        assert.equal(counts[10].length, 2, 'W10 关中战 ×2');
        assert.equal(new Set(counts[10]).size, 2, '同波不重复');
        assert.equal(counts[14].length, 1, 'W14 守卫 ×1');
        for (const id of [...counts[5], ...counts[10], ...counts[14]]) {
            assert.equal(TIER[id], '普通', '第1章只用普通档');
        }
    } finally {
        Math.random = originalRandom;
    }
});

test('小首领档位随章爬升:第4章W5史诗/W14地狱,第6章W10双地狱', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const tiersAt = (chapter, wave) => {
            const game = makeMockGame();
            const wm = mkWm(chapter);
            wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
            for (let w = 1; w < wave; w++) runWave(wm, game);
            const types = runWave(wm, game);
            return types.filter(t => MINI_IDS.has(t)).map(t => TIER[t]);
        };
        assert.deepEqual(tiersAt(4, 5), ['史诗'], '第4章 W5 史诗');
        assert.deepEqual(tiersAt(4, 14), ['地狱'], '第4章 W14 地狱');
        assert.deepEqual(tiersAt(6, 10).sort(), ['地狱', '地狱'], '第6章 W10 双地狱');
    } finally {
        Math.random = originalRandom;
    }
});

test('完整15波可全部生成且数量与公式一致(第1章普通)', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const game = makeMockGame();
        const wm = mkWm(1);
        wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
        for (let w = 1; w <= 15; w++) {
            const types = runWave(wm, game);
            // 小兵总数 = 数量公式 + 精英固定槽 + 小首领槽 + 掠金虫事件批
            const expectedBase = enemyCountForWave(w, 1) + eliteSlots(w, 1)
                + (w === 5 || w === 10 || w === 14 ? 1 + (w === 10 ? 1 : 0) : 0);
            const scavengers = types.filter(t => t === 'gold_scavenger').length;
            const coreCount = types.length - scavengers;
            assert.equal(coreCount, expectedBase, `第${w}波核心单位数(小兵+精英+小首领)`);
            if (w === 11) assert.ok(scavengers >= 2 && scavengers <= 3, 'W11 固定 2~3 只掠金虫');
        }
        assert.equal(wm.wave, 15);
        assert.equal(WAVES_PER_CHAPTER, 15);
    } finally {
        Math.random = originalRandom;
    }
});

test('批次编组:普通波5-7只/批,兽潮波10-14只/批', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const collectBatches = (wave) => {
            const game = makeMockGame();
            const wm = mkWm(1);
            const batches = [];
            let clock = 0, lastFire = -1, recording = false;
            wm.onSpawnEnemy = (type) => {
                if (!recording) return;
                if (clock !== lastFire) { batches.push([]); lastFire = clock; }
                batches[batches.length - 1].push(type);
            };
            for (let w = 1; w < wave; w++) { game.enemies = []; wm.startWave(game); drainSpawning(wm, game); }
            game.enemies = [];
            recording = true;
            wm.startWave(game);
            while (wm.state === 'spawning') { clock += 1.5; wm.update(1.5, game); }
            return batches;
        };
        const normal = collectBatches(7);
        for (const b of normal) assert.ok(b.length >= 3 && b.length <= 7, `普通批应3-7只,实际${b.length}`);
        const beast = collectBatches(9);
        assert.ok(beast.some(b => b.length >= 10), '兽潮波应出现10只以上的大批');
        for (const b of beast) assert.ok(b.length <= 14, `兽潮批不超过14,实际${b.length}`);
    } finally {
        Math.random = originalRandom;
    }
});

test('第1章池子十六怪分布:W1纯近战,W2远程登场(毒射手/断针射手)', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const game = makeMockGame();
        const wm = mkWm(1);
        wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
        const w1 = runWave(wm, game);
        const ranged = new Set(['archer', 'needle_gunner', 'ember_acolyte', 'frost_acolyte', 'acid_sac', 'arc_leech']);
        assert.ok(w1.every(t => !ranged.has(t)), 'W1 开场热身:纯近战无远程');
        const w2 = runWave(wm, game);
        assert.ok(w2.some(t => t === 'archer'), 'W2 毒射手首次出现');
    } finally {
        Math.random = originalRandom;
    }
});

test('困难模式兽潮对齐W9/W13,非困难/其他波不触发', () => {
    const calls = [];
    const mkGame = (diff) => makeMockGame({
        _difficulty: diff ? { id: diff } : undefined,
        spawnBeastTide: (chapter) => calls.push(chapter),
    });
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const game = mkGame('hard');
        const wm = mkWm(1);
        wm.onSpawnEnemy = () => {};
        for (let w = 1; w <= 15; w++) wm.startWave(game);
        assert.deepEqual(calls, [1, 1], '仅 W9/W13 触发兽潮（原为每3波）');
        for (const diff of [undefined, 'normal', 'easy', 'hell']) {
            calls.length = 0;
            const g2 = mkGame(diff);
            const wm2 = mkWm(1);
            wm2.onSpawnEnemy = () => {};
            for (let w = 1; w <= 15; w++) wm2.startWave(g2);
            assert.equal(calls.length, 0, `${diff ?? '无'}难度不触发兽潮`);
        }
    } finally {
        Math.random = originalRandom;
    }
});

test('变异mirrorArmy在Boss波使boss数量×2(小兵清空后登场)', () => {
    const game = makeMockGame({ _mutationMods: { mirrorArmy: true } });
    const wm = mkWm(1);
    wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
    for (let w = 1; w <= 15; w++) runWave(wm, game);
    for (const e of game.enemies) e.dead = true;
    wm.update(0.1, game);
    assert.equal(game.enemies.filter(e => e.type === 'boss').length, 2, 'mirrorArmy 应使 Boss 波生成 2 个 boss');
});

test('变异cloneWar使普通波敌人数量变为3倍(count + count*2)', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        const run = (mods) => {
            const game = makeMockGame({ _mutationMods: mods });
            const wm = mkWm(1);
            const spawned = [];
            wm.onSpawnEnemy = (type) => { spawned.push(type); game.enemies.push({ type, alive: true, dead: false }); };
            wm.startWave(game); drainSpawning(wm, game);
            // 剥离固定槽/掠金虫等事件批，只对比核心小兵量
            const base = enemyCountForWave(1, 1);
            return { spawned, base };
        };
        const plain = run({});
        const mut = run({ cloneWar: true });
        // cloneWar 追加 count×2 只近战：总 spawned 差值 = base×2
        assert.equal(mut.spawned.length - plain.spawned.length, plain.base * 2, 'cloneWar 三倍 = count + count*2');
    } finally {
        Math.random = originalRandom;
    }
});

test('波次清空后进入intermission(1.0秒),倒计时结束触发onWaveCleared', () => {
    const game = makeMockGame();
    const wm = mkWm(1);
    let cleared = false;
    wm.onSpawnEnemy = (type) => { game.enemies.push({ type, alive: true, dead: false }); };
    wm.onWaveCleared = () => { cleared = true; };
    wm.startWave(game);
    drainSpawning(wm, game);
    assert.equal(wm.state, 'fighting');
    for (const e of game.enemies) e.dead = true;
    wm.update(0.1, game);
    assert.equal(wm.state, 'intermission');
    wm.update(1.1, game);   // 超过 1.0 秒间歇
    assert.ok(cleared, 'intermission 结束应回调 onWaveCleared');
    assert.equal(wm.state, 'idle');
});

test('变异chaosBeat每5秒对活着敌人的40%施加临时buff', () => {
    const game = makeMockGame({ _mutationMods: { chaosBeat: true } });
    game.enemies = Array.from({ length: 10 }, () => ({ dead: false, alive: true, applyChaosBuff(m, d) { this._buffed = [m, d]; } }));
    const wm = new WaveManager();
    wm.state = 'fighting';
    wm.update(5, game);
    assert.equal(game.enemies.filter(e => e._buffed).length, 4, 'ceil(10*0.4)=4 个敌人应被 buff');
});

test('reset()清空波次状态回到初始值', () => {
    const game = makeMockGame();
    const wm = mkWm(3, { countMult: 1.1 });
    wm.onSpawnEnemy = () => {};
    wm.startWave(game);
    wm.reset();
    assert.equal(wm.wave, 0);
    assert.equal(wm.chapter, 1);
    assert.equal(wm.state, 'idle');
    assert.equal(wm.countMult, 1, '难度数量倍率随 reset 归位');
});

test('兽潮怪物向屏幕中心收拢,进入中心区后恢复常规AI', () => {
    const { EnemyBase } = require('../dist/entities/EnemyBase');
    const game = makeMockGame();
    const player = makePlayer({ x: 10, y: 324 });
    const e = new EnemyBase();
    e.init('grunt', 1, game);
    e.x = 300; e.y = 324;
    e.tideConverge = true;
    e.update(0.5, player, game);
    assert.ok(e.x > 300, '收拢期朝屏幕中心移动');
    e.x = 640; e.y = 324;
    e.update(0.5, player, game);
    assert.equal(e.tideConverge, false, '进入中心区后恢复常规AI');
});

test('兽潮强化数值与触发条件(源码门禁,v4:对齐W9/W13)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const gm = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/scripts/core/GameManager.ts'), 'utf8');
    const wm = fs.readFileSync(path.resolve(__dirname, '..', '..', 'assets/scripts/systems/WaveManager.ts'), 'utf8');
    assert.match(gm, /spawnBeastTide\(chapter: number\): void/, '兽潮入口');
    assert.match(gm, /e\.maxHp = Math\.round\(e\.maxHp \* 1\.5\)/, '血量+50%');
    assert.match(gm, /e\.armor \+= 40/, '护甲+40');
    assert.match(gm, /Math\.round\(e\.maxHp \* 0\.2\)/, '护盾=20%血量');
    assert.match(gm, /e\.tideConverge = true/, '标记向中心收拢');
    assert.match(wm, /_difficulty\?\.id === 'hard' && kind === 'beast'/, '困难模式仅兽潮波触发');
});
