// ============================================================
//  arena.test.js — 六章残骸的世界坐标与碰撞规则
// ============================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ARENA_ART_SOLID_TOP, CHAPTER_ARENAS, arenaForChapter, arenasForChapter } = require('../dist/data/ChapterArenaDB');
const {
    isArenaFree, moveInArena, safeArenaPoint, firstArenaBulletHit, arenaSteerTarget,
} = require('../dist/core/ArenaGeometry');
const { BulletPool } = require('../dist/entities/BulletController');
const { makeMockGame, makePlayer } = require('./mockGame');

const arena = arenaForChapter(1);

test('六章各有两套场地并保留中央 Boss 区', () => {
    assert.equal(CHAPTER_ARENAS.length, 12);
    for (let chapter = 1; chapter <= 6; chapter++) {
        const layouts = arenasForChapter(chapter);
        assert.equal(layouts.length, 2);
        assert.equal(arenaForChapter(chapter, 1), layouts[1]);
        for (const layout of layouts) {
            assert.equal(layout.chapter, chapter);
            assert.ok(layout.obstacles.length >= 2);
            assert.equal(isArenaFree(layout, 640, 360, 70), true);
            for (const prop of layout.obstacles) {
                assert.equal(isArenaFree(layout, prop.x, prop.y, 16), false);
                const safe = safeArenaPoint(layout, prop.x, prop.y, 70);
                assert.equal(isArenaFree(layout, safe.x, safe.y, 70), true);
            }
        }
    }
});

test('六章布局的可站立区域都连通中央出生区', () => {
    for (const layout of CHAPTER_ARENAS) {
        for (const radius of [18, 70]) {
            const step = 16;
            const cols = Math.floor((1280 - radius * 2) / step) + 1;
            const rows = Math.floor((648 - radius * 2) / step) + 1;
            const free = new Uint8Array(cols * rows);
            let total = 0;
            let start = -1;
            let nearest = Infinity;
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const x = radius + col * step;
                    const y = radius + row * step;
                    if (!isArenaFree(layout, x, y, radius)) continue;
                    const id = row * cols + col;
                    free[id] = 1;
                    total++;
                    const distance = Math.hypot(x - 640, y - 360);
                    if (distance < nearest) { nearest = distance; start = id; }
                }
            }
            assert.ok(start >= 0, `${layout.id} 半径${radius} 有中央出生区`);
            const queue = [start];
            free[start] = 0;
            for (let head = 0; head < queue.length; head++) {
                const id = queue[head];
                const col = id % cols;
                const row = Math.floor(id / cols);
                for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    const nc = col + dc, nr = row + dr;
                    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
                    const next = nr * cols + nc;
                    if (!free[next]) continue;
                    free[next] = 0;
                    queue.push(next);
                }
            }
            const stranded = [];
            for (let id = 0; id < free.length; id++) {
                if (free[id]) stranded.push([radius + id % cols * step,
                    radius + Math.floor(id / cols) * step]);
            }
            assert.equal(queue.length, total,
                `${layout.id} 半径${radius} 没有孤立可站立区：${JSON.stringify(stranded)}`);
        }
    }
});

test('第一章残骸保留中心出生区并阻挡角色', () => {
    assert.equal(arena.obstacles.length, 3);
    assert.equal(isArenaFree(arena, 640, 360, 20), true);
    for (const prop of arena.obstacles) assert.equal(isArenaFree(arena, prop.x, prop.y, 16), false);
});

test('六章底图边缘的实体建筑挡住角色且保留中心通路', () => {
    for (const layout of CHAPTER_ARENAS) {
        assert.ok(layout.boundaries.length >= 8, `${layout.id} 有独立边缘碰撞`);
        assert.equal(isArenaFree(layout, 30, 360, 18), false);
        assert.equal(isArenaFree(layout, 1250, 360, 18), false);
        assert.equal(isArenaFree(layout, 640, 30, 18), false);
        assert.equal(isArenaFree(layout, 640, 635, 18), false);
        assert.equal(isArenaFree(layout, 640, 360, 70), true);
        assert.ok(moveInArena(layout, 640, 360, 0, -500, 18).y >= 80);
        assert.ok(moveInArena(layout, 640, 360, 0, 500, 18).y <= 602);
    }
    assert.ok(moveInArena(arena, 640, 150, -700, 0, 18).x >= 143);
    // 左侧岗哨的箱体延伸到画面约 x=155、y=390，角色脚底不能压在箱体上。
    assert.ok(moveInArena(arena, 640, 350, -700, 0, 18).x >= 183);
    assert.ok(moveInArena(arena, 300, 520, -400, 0, 18).x >= 243);
    // 各章侧边的熔炉、培养罐、装甲和破损框架都画在背景里，也要挡住角色。
    for (const [chapter, minX] of [[2, 148], [3, 163], [5, 158], [6, 183]]) {
        for (const layout of arenasForChapter(chapter)) {
            assert.ok(moveInArena(layout, 640, 360, -700, 0, 18).x >= minX,
                `${layout.id} 左侧设备挡住角色`);
        }
    }
});

test('第二章管线与第六章反应堆的前侧底座挡住向上行走的角色', () => {
    for (const [chapter, bottom] of [[2, 285], [6, 325]]) {
        for (const layout of arenasForChapter(chapter)) {
            const point = moveInArena(layout, 1200, 360, 0, -220, 18);
            assert.ok(point.y >= bottom + 18, `${layout.id} 角色没有踩进右上建筑底座`);
            assert.equal(isArenaFree(layout, 1050, 350, 18), true,
                `${layout.id} 建筑左侧仍有通路`);
        }
    }
});

test('底图上突出的废车、熔炉和反应堆碎石不能被角色踩过', () => {
    for (const layout of arenasForChapter(1)) {
        const point = moveInArena(layout, 350, 580, -180, 0, 18);
        assert.ok(point.x >= 303, `${layout.id} 左下废车车头挡住横向行走`);
        assert.equal(isArenaFree(layout, 340, 510, 18), true, `${layout.id} 车头上方仍能绕行`);
    }
    for (const layout of arenasForChapter(2)) {
        const point = moveInArena(layout, 1030, 300, 0, -200, 18);
        assert.ok(point.y >= 223, `${layout.id} 熔炉前沿挡住向上行走`);
        assert.equal(isArenaFree(layout, 900, 160, 18), true, `${layout.id} 熔炉左侧仍有通路`);
    }
    for (const layout of arenasForChapter(6)) {
        const point = moveInArena(layout, 900, 280, 0, -220, 18);
        assert.ok(point.y >= 193, `${layout.id} 反应堆碎石挡住向上行走`);
        assert.equal(isArenaFree(layout, 700, 150, 18), true, `${layout.id} 碎石左侧仍有通路`);
    }
});

test('炉台管线、传送门与后段机械的外凸底座挡住脚底', () => {
    for (const layout of arenasForChapter(2)) {
        assert.ok(moveInArena(layout, 400, 540, -260, 0, 18).x >= 262,
            `${layout.id} 左下炉台管线前沿`);
        assert.ok(moveInArena(layout, 900, 570, 260, 0, 18).x <= 1023,
            `${layout.id} 右下炉台管线前沿`);
    }
    for (const layout of arenasForChapter(4)) {
        assert.ok(moveInArena(layout, 900, 175, 260, 0, 18).x <= 998,
            `${layout.id} 右上传送门基座`);
        assert.ok(moveInArena(layout, 400, 540, -260, 0, 18).x >= 272,
            `${layout.id} 左下遗迹石台`);
    }
    for (const layout of arenasForChapter(5)) {
        assert.ok(moveInArena(layout, 400, 540, -260, 0, 18).x >= 257,
            `${layout.id} 左下机械残骸`);
    }
    for (const layout of arenasForChapter(6)) {
        assert.ok(moveInArena(layout, 400, 540, -260, 0, 18).x >= 287,
            `${layout.id} 左下核心碎块`);
        assert.ok(moveInArena(layout, 900, 560, 260, 0, 18).x <= 993,
            `${layout.id} 右下核心碎块`);
    }
});

test('背景岗哨和遗迹的上沿不被角色脚底踩入', () => {
    const guardrail = moveInArena(arena, 145, 220, 0, 180, 18);
    assert.ok(guardrail.y + 37 <= 270, `第一章岗哨脚底停在上沿：${guardrail.y + 37}`);
    const ruin = moveInArena(arenaForChapter(4), 150, 360, 0, 200, 18);
    assert.ok(ruin.y + 37 <= 470, `第四章遗迹脚底停在上沿：${ruin.y + 37}`);
});

test('第一章三个残骸的上沿不再被玩家脚底踩入', () => {
    // 上沿来自当前透明素材在游戏尺寸下的不透明像素，而非逻辑矩形自身。
    const artTop = { 'west-wall': 255, 'east-wreck': 235, 'south-barrier': 519 };
    for (const prop of arena.obstacles) {
        const point = moveInArena(arena, prop.x, prop.y - 160, 0, 250, 18);
        assert.ok(point.y + 37 <= artTop[prop.id] + 1, `${prop.id} 的脚底停在素材上沿之前`);
    }
});

test('六章全部独立残骸的实体像素上沿挡住玩家脚底', () => {
    for (const layout of CHAPTER_ARENAS) {
        for (const prop of layout.obstacles) {
            const opaqueTopFraction = ARENA_ART_SOLID_TOP[prop.artKey];
            assert.ok(Number.isFinite(opaqueTopFraction), `${prop.artKey} 有实体像素边界数据`);
            const artTop = prop.y - prop.visualH / 2 + opaqueTopFraction * prop.visualH;
            const point = moveInArena(layout, prop.x, prop.y - 160, 0, 250, 18);
            assert.ok(point.y + 37 <= artTop + 1,
                `${layout.id}/${prop.id} 脚底 ${point.y + 37} 不压入上沿 ${artTop}`);
        }
    }
});

test('玩家沿断墙滑动且不会穿过薄墙', () => {
    const next = moveInArena(arena, 172, 280, 180, 30, 18);
    assert.equal(isArenaFree(arena, next.x, next.y, 18), true);
    assert.ok(next.x < 220, `横向被挡：${next.x}`);
    assert.ok(next.y > 280, `贴墙可沿纵向滑动：${next.y}`);
});

test('刷怪和掉落能从残骸内部移到合法位置', () => {
    for (const prop of arena.obstacles) {
        const p = safeArenaPoint(arena, prop.x, prop.y, 30);
        assert.equal(isArenaFree(arena, p.x, p.y, 30), true);
    }
});

test('高大残骸扫掠挡住快弹，低矮路障允许弹体穿过', () => {
    assert.equal(firstArenaBulletHit(arena, 190, 280, 500, 280, 5)?.id, 'west-wall');
    assert.equal(firstArenaBulletHit(arena, 390, 544, 520, 544, 5), undefined);
});

test('敌人追击被断墙隔开时取得合法绕行角点', () => {
    const target = arenaSteerTarget(arena, { x: 190, y: 280 }, { x: 550, y: 280 }, 18);
    assert.notDeepEqual(target, { x: 550, y: 280 });
    assert.equal(isArenaFree(arena, target.x, target.y, 18), true);
});

test('普通敌人和大型 Boss 都能绕过断墙抵达玩家', () => {
    for (const radius of [18, 70]) {
        let point = safeArenaPoint(arena, 100, 280, radius);
        const player = { x: 550, y: 280 };
        for (let frame = 0; frame < 600; frame++) {
            const waypoint = arenaSteerTarget(arena, point, player, radius);
            const dx = waypoint.x - point.x, dy = waypoint.y - point.y;
            const length = Math.hypot(dx, dy) || 1;
            point = moveInArena(arena, point.x, point.y, dx / length * 3, dy / length * 3, radius);
            assert.equal(isArenaFree(arena, point.x, point.y, radius), true);
        }
        assert.ok(Math.hypot(point.x - player.x, point.y - player.y) < 10, `半径 ${radius} 绕行成功`);
    }
});

test('六章残骸两侧均有普通敌人和大型 Boss 的绕行通路', () => {
    for (const layout of CHAPTER_ARENAS) {
        for (const prop of layout.obstacles) {
            for (const radius of [18, 70]) {
                let point = safeArenaPoint(layout, Math.max(radius + 1, prop.x - 180), prop.y, radius);
                const target = safeArenaPoint(layout, Math.min(1280 - radius - 1, prop.x + 180), prop.y, radius);
                assert.equal(isArenaFree(layout, point.x, point.y, radius), true);
                assert.equal(isArenaFree(layout, target.x, target.y, radius), true);
                for (let frame = 0; frame < 450; frame++) {
                    const waypoint = arenaSteerTarget(layout, point, target, radius);
                    const dx = waypoint.x - point.x, dy = waypoint.y - point.y;
                    const length = Math.hypot(dx, dy) || 1;
                    point = moveInArena(layout, point.x, point.y, dx / length * 3, dy / length * 3, radius);
                }
                assert.ok(Math.hypot(point.x - target.x, point.y - target.y) < 10,
                    `${layout.id}/${prop.id}/半径${radius} 可绕行`);
            }
        }
    }
});

test('友敌高速弹均在残骸前释放，穿透数不允许穿墙', () => {
    const game = makeMockGame({
        firstArenaBulletHit(ax, ay, bx, by, radius) {
            return firstArenaBulletHit(arena, ax, ay, bx, by, radius);
        },
    });
    const player = makePlayer({ x: 500, y: 280 });
    const friendly = new BulletPool(4);
    friendly.spawn({ x: 100, y: 280, vx: 8000, vy: 0, radius: 5, damage: 10, pierceLeft: 9 });
    friendly.update(0.05, [], player, game);
    assert.equal(friendly.active.length, 0);

    const hostile = new BulletPool(4);
    hostile.spawn({ x: 100, y: 280, vx: 8000, vy: 0, radius: 5, damage: 10, isEnemyBullet: true, owner: 'enemy' });
    hostile.updateEnemyBullets(0.05, player, game);
    assert.equal(hostile.active.length, 0);
    assert.equal(player.hp, 100);
});
