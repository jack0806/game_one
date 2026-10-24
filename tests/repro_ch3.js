// ============================================================
//  repro_ch3.js — 图一第三章（全局章3）完整章节模拟
//  真实 WaveManager 刷波 + 真实实体 update + 真实碰撞接线，
//  逐帧计时；每波限时 25s 强制清场推进，看门狗报告卡点。
//  用法：node tests/repro_ch3.js [全局章号，默认3]
// ============================================================
'use strict';
const { EnemyBase } = require('./dist/entities/EnemyBase');
const { BossController } = require('./dist/entities/BossController');
const { PlayerController } = require('./dist/entities/PlayerController');
const { WaveManager } = require('./dist/systems/WaveManager');
const { moveEnemyBody, moveCombatBody, separatePlayerBodies } = require('./dist/core/CombatCollision');
const { arenaForChapter } = require('./dist/data/ChapterArenaDB');
const ArenaGeometry = require('./dist/core/ArenaGeometry');
const { CHARACTERS } = require('./dist/data/CharacterDB');
const { makeMockGame } = require('./specs/mockGame');

const CHAPTER = Number(process.argv[2] || 3);       // 全局章号：图一第三章=3
const MAP = Math.ceil(CHAPTER / 5) || 1;
const WAVE_BUDGET = 25;                              // 每波模拟秒数上限
const dt = 1 / 60;

const arena = arenaForChapter(MAP);
const player = new PlayerController();
const game = makeMockGame({
    _chapter: CHAPTER,
    _mutationMods: {},
    _difficulty: { id: 'normal', countMult: 1 },
    playerBullets: [],
    enemies: [],
});
game.input = {
    mouse: { active: true, x: 640, y: 300 },
    consumeMouseClick() { return false; },
    isKeyQPressed() { return false; }, isKeyQ() { return false; },
    isKeyEPressed() { return false; }, isKeyE() { return false; },
    isKeyRPressed() { return false; }, isKeyR() { return false; },
};
const terrain = (x, y, mx, my, r) => ArenaGeometry.moveInArena(arena, x, y, mx, my, r);
game.movePlayerBody = (dx, dy) => moveCombatBody(player, dx, dy, game.enemies, terrain);
game.moveEnemyBody = (enemy, dx, dy) => moveEnemyBody(enemy, player, game.enemies, dx, dy, terrain);
game.spawnEnemy = (type, x, y) => {
    let e;
    if (type === 'boss') { e = new BossController(); e.initBoss(CHAPTER, game); }
    else { e = new EnemyBase(); e.init(type, 15, game); }
    const p = ArenaGeometry.safeArenaPoint(arena, x ?? 640, y ?? 300, e.radius || 20);
    e.x = p.x; e.y = p.y;
    game.enemies.push(e);
    return e;
};

// headless 玩家（对齐 init() 的关键字段）
const def = CHARACTERS['kai'];
player.charId = 'kai'; player._charDef = def; player._game = game;
player.color = def.color;
player.stats = Object.assign({
    extraBullets: 0, bulletBounce: 0, goldPickupRange: 60, cdReduction: 0,
    ultChargeRate: 1, eliteBonus: 0, pierce: 0, critDmg: 0.5, lifestealRate: 0, maxShield: 0,
}, def.stats);
player.alive = true; player.shield = 0;
player.stats.maxHp = 999999; player.hp = 999999;
const start = ArenaGeometry.safeArenaPoint(arena, 640, 320, player.radius);
player.x = start.x; player.y = start.y;

const waveMgr = new WaveManager();
waveMgr.chapter = CHAPTER;
waveMgr.onSpawnEnemy = (t, x, y) => game.spawnEnemy(t, x, y);
let waveDone = false;
waveMgr.onWaveCleared = () => { waveDone = true; };

const MAX_WAVES = 15;
for (let w = 1; w <= MAX_WAVES; w++) {
    waveDone = false;
    waveMgr.startWave(game);
    const tw = waveMgr.wave;
    let frames = 0, worst = 0, worstFrame = -1;
    const tStart = Date.now();
    while (!waveDone && frames < WAVE_BUDGET * 60) {
        const sec = frames * dt;
        const input = {
            moveX: Math.cos(sec * 0.8), moveY: Math.sin(sec * 1.2),
            mouse: game.input.mouse,
            isKeyQPressed: () => frames % 150 === 0, isKeyQ: () => false,
            isKeyEPressed: () => frames % 300 === 60, isKeyE: () => false,
            isKeyRPressed: () => frames % 900 === 400, isKeyR: () => false,
        };
        const t0 = process.hrtime.bigint();
        try { player.tick(dt, input, game); } catch (e) { console.log(`W${tw} f${frames} player.tick: ${e.message}`); }
        for (const e of game.enemies) {
            try { e.update(dt, player, game); } catch (err) {
                console.log(`W${tw} f${frames} enemy(${e.type}) update: ${err.message} | ${err.stack.split('\n')[1].trim()}`);
            }
        }
        try { separatePlayerBodies(player, game.enemies, terrain); } catch (e) { console.log(`W${tw} f${frames} separate: ${e.message}`); }
        try { waveMgr.update(dt, game); } catch (e) { console.log(`W${tw} f${frames} waveMgr: ${e.message}`); }
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        if (ms > worst) { worst = ms; worstFrame = frames; }
        if (ms > 2000) {
            console.log(`W${tw} f${frames} ⚠️ 单帧 ${ms.toFixed(0)}ms 卡死！敌人: ${game.enemies.map(e => e.type).join(',')}`);
            process.exit(2);
        }
        frames++;
        // 玩家弹丸结算简化：每 0.5s 对 240 码内敌人造成击杀推进波次
        if (frames % 30 === 0) {
            for (const e of game.enemies) {
                if (Vec_dist(e, player) < 260) { e.hp = -1; try { e._die(player, game); } catch (err) {} }
            }
            game.enemies = game.enemies.filter(e => e.alive !== false && !e.dead);
        }
    }
    const alive = game.enemies.filter(e => !e.dead).map(e => e.type);
    console.log(`W${tw} (${waveKindName(tw)}) ${frames}帧 ${((Date.now() - tStart) / 1000).toFixed(1)}s | 最慢帧 ${worst.toFixed(1)}ms@f${worstFrame} | 清场剩余 ${alive.length} ${alive.slice(0, 6).join(',')}${alive.length > 6 ? '…' : ''}${waveDone ? '' : ' ⚠️超时强推'}`);
    // 强制清场进入下一波
    for (const e of game.enemies) { try { e.hp = -1; e._die(player, game); } catch (err) {} }
    game.enemies.length = 0;
}
console.log('章节模拟完成，无卡死。');

function Vec_dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function waveKindName(w) {
    if (w === 15) return 'boss'; if (w === 9 || w === 13) return 'beast';
    if (w === 6 || w === 11) return 'breather'; if (w === 5 || w === 10) return 'miniGuard';
    if (w === 14) return 'guard'; return 'normal';
}
