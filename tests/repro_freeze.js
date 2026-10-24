// ============================================================
//  repro_freeze.js — 合并后"游戏卡死"问题的 headless 复现脚本
//  模拟真实引擎路径：moveEnemyBody/movePlayerBody 走真地形+真碰撞，
//  驱动 玩家tick + 敌人update + 身体分离，按帧计时找卡点。
//  用法：node tests/repro_freeze.js [场景A-D]
// ============================================================
'use strict';
const { EnemyBase } = require('./dist/entities/EnemyBase');
const { BossController } = require('./dist/entities/BossController');
const { PlayerController } = require('./dist/entities/PlayerController');
const { moveEnemyBody, moveCombatBody, separatePlayerBodies } = require('./dist/core/CombatCollision');
const { arenaForChapter } = require('./dist/data/ChapterArenaDB');
const ArenaGeometry = require('./dist/core/ArenaGeometry');
const { CHARACTERS } = require('./dist/data/CharacterDB');
const { makeMockGame } = require('./specs/mockGame');

const CHAPTER = Number(process.env.CHAPTER || 6);
const FRAMES = Number(process.env.FRAMES || 7200);   // 120s @60fps
const SCENARIO = process.argv[2] || 'A';

function buildGame(player, arena) {
    const game = makeMockGame({
        _chapter: CHAPTER * 5 - 4,
        playerBullets: [],
        enemies: [],
    });
    game.input = {
        mouse: { active: true, x: 900, y: 300 },
        consumeMouseClick() { if (game._clickPending) { game._clickPending = false; return true; } return false; },
        isKeyQPressed() { return false; }, isKeyQ() { return false; },
        isKeyEPressed() { return false; }, isKeyE() { return false; },
        isKeyRPressed() { return false; }, isKeyR() { return false; },
        _clickPending: false,
    };
    const terrain = (x, y, mx, my, r) => ArenaGeometry.moveInArena(arena, x, y, mx, my, r);
    // 真实引擎接线（GameManager.movePlayerBody / moveEnemyBody 的等价物）
    game.movePlayerBody = (dx, dy) => moveCombatBody(player, dx, dy, game.enemies, terrain);
    game.moveEnemyBody = (enemy, dx, dy) => moveEnemyBody(enemy, player, game.enemies, dx, dy, terrain);
    game.arenaSteerTarget = (x, y, tx, ty, r) => ArenaGeometry.steerTarget ? ArenaGeometry.steerTarget(arena, x, y, tx, ty, r) : { x: tx, y: ty };
    return game;
}

function spawnEnemies(game, arena, player, count) {
    const types = ['grunt', 'runner', 'brute', 'archer', 'needle_gunner', 'acid_sac', 'arc_leech', 'shieldbearer'];
    for (let i = 0; i < count; i++) {
        const e = new EnemyBase();
        e.init(types[i % types.length], 1, game);
        const a = i * Math.PI * 2 / count;
        const p = ArenaGeometry.safeArenaPoint(arena, player.x + Math.cos(a) * 260, player.y + Math.sin(a) * 260, e.radius || 20);
        e.x = p.x; e.y = p.y;
        game.enemies.push(e);
    }
}

// —— 场景执行 ——
function scenario(name, charId, joker, enemyCount) {
    const arena = arenaForChapter(CHAPTER);
    const player = new PlayerController();
    const game = buildGame(player, arena);
    // headless：init 需要引擎节点，手工补齐 tick 依赖的字段（对齐 init() 的赋值）
    const def = CHARACTERS[charId];
    player.charId = charId; player._charDef = def; player._game = game;
    player.color = def.color;
    player.stats = Object.assign({
        extraBullets: 0, bulletBounce: 0, barrageMode: false, novaMode: false,
        goldPickupRange: 60, cdReduction: 0, ultChargeRate: 1, eliteBonus: 0,
        pierce: def.stats.pierce || 0, critDmg: 0.5, lifestealRate: 0, maxShield: 0,
    }, def.stats);
    player.alive = true; player.shield = 0; player.hp = player.stats.maxHp = 999999;
    const start = ArenaGeometry.safeArenaPoint(arena, 640, 320, player.radius);
    player.x = start.x; player.y = start.y;

    if (joker) {
        const boss = new BossController();
        boss.initBossKind('joker', game);
        boss.x = player.x + 300; boss.y = player.y + 100;
        game.enemies.push(boss);
    }
    spawnEnemies(game, arena, player, enemyCount);

    const dt = 1 / 60;
    const times = [];
    let t0 = process.hrtime.bigint();
    for (let f = 0; f < FRAMES; f++) {
        // 模拟玩家：绕圈走 + 周期性放 Q/E/R + 周期点击（放置型E确认）
        const w = f * dt;
        const input = {
            moveX: Math.cos(w * 0.7), moveY: Math.sin(w * 1.1),
            mouse: game.input.mouse,
            isKeyQPressed: () => f % 180 === 0, isKeyQ: () => false,
            isKeyEPressed: () => f % 240 === 100, isKeyE: () => false,
            isKeyRPressed: () => f % 600 === 300, isKeyR: () => false,
        };
        if (f % 240 === 180) game.input._clickPending = true;
        game.input.mouse.x = 640 + Math.cos(w) * 300;
        game.input.mouse.y = 330 + Math.sin(w * 1.3) * 200;

        try {
            player.tick(dt, input, game);
        } catch (err) { console.log(`[${name}] frame ${f} player.tick 异常: ${err.stack.split('\n').slice(0, 4).join(' | ')}`); }
        for (const e of game.enemies) {
            try { e.update(dt, player, game); }
            catch (err) { console.log(`[${name}] frame ${f} enemy(${e.type || e.bossKind}) 异常: ${err.stack.split('\n').slice(0, 3).join(' | ')}`); }
        }
        const terrain = (x, y, mx, my, r) => ArenaGeometry.moveInArena(arena, x, y, mx, my, r);
        try { separatePlayerBodies(player, game.enemies, terrain); }
        catch (err) { console.log(`[${name}] frame ${f} separate 异常: ${err.stack.split('\n').slice(0, 3).join(' | ')}`); }

        const t1 = process.hrtime.bigint();
        times.push(Number(t1 - t0) / 1e6);
        t0 = t1;
        if (times[times.length - 1] > 2000) {
            console.log(`[${name}] ⚠️ frame ${f} 单帧 ${times[times.length - 1].toFixed(0)}ms —— 视为卡死！敌人数=${game.enemies.length}`);
            return;
        }
    }
    const sorted = [...times].sort((a, b) => b - a);
    const avg = times.reduce((s, v) => s + v, 0) / times.length;
    console.log(`[${name}] 完成 ${FRAMES} 帧 | 平均 ${avg.toFixed(2)}ms | 最慢帧 ${sorted[0].toFixed(1)}ms (p99 ${sorted[Math.floor(FRAMES * 0.99)].toFixed(2)}ms) | 存活敌人 ${game.enemies.filter(e => e.alive).length}`);
}

console.log(`场景=${SCENARIO} 章节=${CHAPTER} 帧数=${FRAMES}`);
if (SCENARIO === 'A') scenario('A:亡灵法师+滑稽猴+40敌', 'mortis', true, 40);
else if (SCENARIO === 'B') scenario('B:亡灵法师+40敌(无Boss)', 'mortis', false, 40);
else if (SCENARIO === 'C') scenario('C:滑稽猴单挑', 'mortis', true, 0);
else if (SCENARIO === 'D') scenario('D:kai+40敌', 'kai', false, 40);
else { scenario('A:亡灵法师+滑稽猴+40敌', 'mortis', true, 40); scenario('B:亡灵法师+40敌(无Boss)', 'mortis', false, 40); scenario('C:滑稽猴单挑', 'mortis', true, 0); scenario('D:kai+40敌', 'kai', false, 40); }
