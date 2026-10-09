// ============================================================
//  arena.test.js — 六章残骸的世界坐标与碰撞规则
// ============================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ARENA_OBSTACLE_SLOTS, CHAPTER_ARENAS, arenaForChapter,
    arenasForChapter, arenaWithObstacles, obstacleCandidatesForChapter } = require('../dist/data/ChapterArenaDB');
const {
    arenaIsConnected, isArenaFree, moveInArena, dashInArena, randomArenaForChapter, safeArenaPoint,
    firstArenaBulletHit, arenaLineClear, arenaSteerTarget, overlapsObstacle,
} = require('../dist/core/ArenaGeometry');
const { ARENA_COLLISION_MASKS } = require('../dist/data/ArenaCollisionMasks');
const { spawnExplosion } = require('../dist/data/AugmentDB');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { BulletPool } = require('../dist/entities/BulletController');
const { makeMockGame, makePlayer } = require('./mockGame');

const arena = arenaForChapter(1);

test('六章每章十五个候选落点，重复进图随机展示三个更大的独立残骸', () => {
    assert.equal(ARENA_OBSTACLE_SLOTS.length, 15);
    for (let chapter = 1; chapter <= 6; chapter++) {
        const candidates = obstacleCandidatesForChapter(chapter);
        assert.equal(candidates.length, 15);
        assert.equal(new Set(candidates.map(prop => `${prop.x},${prop.y}`)).size, 15);
        assert.ok(candidates.every(prop => prop.visualW > 130));
        const edges = arenaWithObstacles(chapter, []);
        for (const prop of candidates) {
            for (const sx of [-0.5, 0, 0.5]) for (const sy of [-0.5, 0, 0.5]) {
                assert.equal(isArenaFree(edges, prop.x + sx * prop.w, prop.y + sy * prop.h, 18), true,
                    `第${chapter}章${prop.id}没有压住背景边缘建筑`);
            }
            assert.equal(isArenaFree(arenaWithObstacles(chapter, [prop]), 640, 360, 70), true,
                `第${chapter}章${prop.id}让出 Boss 出生区`);
            assert.equal(arenaIsConnected(arenaWithObstacles(chapter, [prop]), 70), true,
                `第${chapter}章${prop.id}不围出 Boss 孤岛`);
            assert.equal(arenaIsConnected(arenaWithObstacles(chapter, [prop]), 18), true,
                `第${chapter}章${prop.id}不围出英雄孤岛`);
        }
        const layouts = new Set();
        for (let seed = 1; seed <= 40; seed++) {
            let state = seed;
            const selected = randomArenaForChapter(chapter, (min, max) => {
                state = (state * 1664525 + 1013904223) >>> 0;
                return min + state % (max - min + 1);
            });
            assert.equal(selected.obstacles.length, 3, `第${chapter}章总是出现三个`);
            assert.equal(new Set(selected.obstacles.map(prop => prop.id)).size, 3);
            assert.equal(isArenaFree(selected, 640, 360, 70), true);
            for (const prop of selected.obstacles) {
                assert.equal(isArenaFree(selected, prop.x, prop.y, 16), false);
            }
            layouts.add(selected.id);
        }
        assert.ok(layouts.size >= 10, `第${chapter}章进图布局有明显变化`);
    }
});

test('冲刺撞到建筑或画布边界时沿原路径停止，斜墙外的空地可以通行', () => {
    const wall = arena.obstacles.find(prop => prop.kind === 'wall');
    assert.ok(wall.angleDeg > 0);
    const startX = wall.x - 150, startY = wall.y;
    const landing = dashInArena(arena, startX, startY, 360, 0, 16);
    assert.ok(landing.x < wall.x - 30, '不可越过路障');
    assert.equal(landing.y, startY, '冲刺不会自动沿墙滑到另一侧');
    assert.equal(isArenaFree(arena, landing.x, landing.y, 16), true);
    const boundary = dashInArena(arena, 1000, 360, 500, 0, 16);
    assert.ok(boundary.x < 1256, '不可冲进边界建筑');
    const road = dashInArena(arena, 170, 340, 0, 100, 16);
    assert.ok(road.y >= 430, '横杆右侧的空白路面可走');
    const cabinet = dashInArena(arena, 110, 230, 0, 180, 16);
    assert.ok(cabinet.y < 340, '左侧机柜仍挡住落脚点');
    const tilted = { id: 'test', chapter: 0, obstacles: [{
        id: 'sloped', x: 640, y: 360, w: 160, h: 32, angleDeg: 22,
        blocksBullets: true,
    }] };
    assert.equal(isArenaFree(tilted, 570, 370, 8), true, '旧横向矩形遮住的斜墙外空地可通行');
    assert.equal(isArenaFree(tilted, 570, 335, 8), false, '斜墙实际实体仍挡人');
});

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
    const checkedLayouts = [...CHAPTER_ARENAS];
    for (let chapter = 1; chapter <= 6; chapter++) for (let seed = 1; seed <= 5; seed++) {
        let state = chapter * 100 + seed;
        checkedLayouts.push(randomArenaForChapter(chapter, (min, max) => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return min + state % (max - min + 1);
        }));
    }
    for (const layout of checkedLayouts) for (const radius of [18, 70]) {
        assert.equal(arenaIsConnected(layout, radius), true, `${layout.id} 半径${radius} 没有孤岛`);
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
        const edges = { ...layout, obstacles: [] };
        const top = moveInArena(edges, 640, 360, 0, -500, 16);
        assert.ok(top.y >= 60 && top.y <= 72,
            `${layout.id} 顶部空地可走到护栏前：${top.y}`);
        assert.equal(isArenaFree(edges, 640, 64, 16), true,
            `${layout.id} 顶部空地不再被提前封住`);
        assert.equal(isArenaFree(edges, 640, 56, 16), false,
            `${layout.id} 护栏后方仍有实体边界`);
        assert.ok(moveInArena(layout, 640, 360, 0, 500, 18).y <= 630);
    }
    assert.ok(moveInArena(arena, 640, 150, -700, 0, 18).x >= 100);
    // 左侧岗哨的底座仍是实体，右侧已露出的路面可以贴近它。
    assert.ok(moveInArena(arena, 640, 380, -700, 0, 18).x >= 160);
    assert.ok(moveInArena(arena, 300, 520, -400, 0, 18).x >= 243);
    // 各章侧边的熔炉、培养罐、装甲和破损框架都画在背景里，也要挡住角色。
    for (const [chapter, minX] of [[2, 110], [3, 110], [5, 158], [6, 110]]) {
        for (const layout of arenasForChapter(chapter)) {
            assert.ok(moveInArena(layout, 640, 360, -700, 0, 18).x >= minX,
                `${layout.id} 左侧设备挡住角色`);
        }
    }
});

test('六章右侧中段空地可贴近画布边缘，上下建筑仍挡住角色', () => {
    for (const chapter of [1, 2, 3, 4, 5, 6]) {
        for (const layout of arenasForChapter(chapter)) {
            const edges = { ...layout, obstacles: [] };
            const point = moveInArena(edges, 1000, 360, 300, 0, 16);
            assert.ok(point.x >= 1235 && point.x <= 1241,
                `${layout.id} 右侧地面没有被宽边界提前封住：${point.x}`);
            assert.equal(isArenaFree(edges, 1236, 360, 16), true,
                `${layout.id} 中段贴边的可见地面保持开放`);
            assert.equal(isArenaFree(edges, 1236, 150, 16), false,
                `${layout.id} 上方建筑仍封住右侧`);
            assert.equal(isArenaFree(edges, 1236, 560, 16), false,
                `${layout.id} 下方设备仍封住右侧`);
        }
    }
});

test('六章底图逐张核对四角：可见路面可走，建筑实体挡人与子弹', () => {
    // 取样坐标按六张底图逐张叠图确认，覆盖先前矩形误挡的第2/3章空地。
    const samples = {
        1: { road: [[180, 320], [1070, 200], [1100, 350]],
            solid: [[50, 150], [1220, 170], [80, 550], [1200, 550]] },
        2: { road: [[190, 190], [970, 160], [1080, 250], [180, 300]],
            solid: [[100, 100], [1140, 130], [60, 320], [1200, 530]] },
        3: { road: [[170, 240], [140, 300], [1040, 220], [1120, 315]],
            solid: [[90, 130], [1180, 180], [50, 380], [1200, 520]] },
        4: { road: [[180, 200], [1050, 230], [140, 360], [1100, 420]],
            solid: [[50, 120], [1170, 120], [50, 270], [80, 550]] },
        5: { road: [[200, 200], [1040, 240], [180, 300], [1100, 400]],
            solid: [[50, 140], [1170, 120], [60, 330], [1200, 550]] },
        6: { road: [[210, 200], [1020, 250], [140, 300], [1100, 380]],
            solid: [[50, 140], [1170, 150], [50, 330], [1200, 550]] },
    };
    for (let chapter = 1; chapter <= 6; chapter++) {
        const edges = arenaWithObstacles(chapter, []);
        for (const [x, y] of samples[chapter].road) {
            assert.equal(isArenaFree(edges, x, y, 16), true,
                `第${chapter}章路面 ${x},${y} 可走`);
        }
        for (const [x, y] of samples[chapter].solid) {
            assert.equal(isArenaFree(edges, x, y, 16), false,
                `第${chapter}章建筑 ${x},${y} 挡人`);
        }
        const [rx, ry] = samples[chapter].road[1];
        const [sx, sy] = samples[chapter].solid[1];
        assert.ok(firstArenaBulletHit(edges, rx, ry, sx, sy, 0),
            `第${chapter}章建筑挡子弹`);
    }
    assert.equal(arenaLineClear(arenaWithObstacles(2, []), 970, 160, 1080, 250), true,
        '第二章右上炉台前的空地不再被矩形遮住');
    assert.equal(arenaLineClear(arenaWithObstacles(3, []), 1040, 220, 1120, 315), true,
        '第三章右上培养罐前的空地不再被矩形遮住');
});

test('第二、三章截图中的大片空地允许行走与位移，悬空横杆下也可通过', () => {
    for (const [chapter, x, y, dx, dy] of [
        [2, 900, 170, 100, 0], [2, 930, 250, 170, 0],
        [3, 300, 300, -160, 0], [3, 900, 300, 200, 0],
        [6, 220, 300, -80, 0],
    ]) {
        const edges = arenaWithObstacles(chapter, []);
        const walked = moveInArena(edges, x, y, dx, dy, 16);
        const dashed = dashInArena(edges, x, y, dx, dy, 16);
        assert.ok(Math.hypot(walked.x - x - dx, walked.y - y - dy) < 0.01,
            `第${chapter}章可见路面可完整走过`);
        assert.ok(Math.hypot(dashed.x - x - dx, dashed.y - y - dy) < 0.01,
            `第${chapter}章可见路面可完整位移`);
    }
});

test('第二章管线与第六章反应堆的前侧底座挡住向上行走的角色', () => {
    for (const [chapter, stopY] of [[2, 235], [6, 305]]) {
        for (const layout of arenasForChapter(chapter)) {
            const point = moveInArena(layout, 1200, 360, 0, -220, 18);
            assert.ok(point.y >= stopY, `${layout.id} 角色没有踩进右上建筑底座`);
            assert.equal(isArenaFree(layout, 1050, 350, 18), true,
                `${layout.id} 建筑左侧仍有通路`);
        }
    }
});

test('底图上突出的废车、熔炉和反应堆碎石不能被角色踩过', () => {
    for (const layout of arenasForChapter(1)) {
        const point = moveInArena(layout, 350, 580, -180, 0, 18);
        assert.ok(point.x >= 300, `${layout.id} 左下废车车头挡住横向行走`);
        assert.equal(isArenaFree(layout, 340, 510, 18), true, `${layout.id} 车头上方仍能绕行`);
    }
    for (const layout of arenasForChapter(2)) {
        const point = moveInArena(layout, 1030, 300, 0, -200, 18);
        assert.ok(point.y >= 105, `${layout.id} 熔炉前沿挡住向上行走`);
        assert.equal(isArenaFree(layout, 900, 160, 18), true, `${layout.id} 熔炉左侧仍有通路`);
    }
    for (const layout of arenasForChapter(6)) {
        const point = moveInArena(layout, 1000, 280, 0, -220, 18);
        assert.ok(point.y >= 170, `${layout.id} 反应堆右侧碎石挡住向上行走`);
        assert.equal(isArenaFree(layout, 700, 150, 18), true, `${layout.id} 碎石左侧仍有通路`);
    }
});

test('第六章右上碎石按画面外形分段，空地可走而碎石仍挡脚底', () => {
    const edges = { ...arenaForChapter(6), obstacles: [] };
    const across = moveInArena(edges, 650, 180, 600, 0, 18);
    assert.ok(across.x >= 1000 && across.x <= 1020, `沿空地走到右侧碎石前：${across.x}`);
    const left = moveInArena(edges, 850, 280, 0, -220, 18);
    assert.ok(left.y >= 90 && left.y <= 105, `左侧碎石上沿：${left.y}`);
    const right = moveInArena(edges, 1000, 280, 0, -220, 18);
    assert.ok(right.y >= 170, `右侧碎石下沿：${right.y}`);
});

test('右下背景设备和碎石的外凸底座挡住横向行走', () => {
    for (const [chapter, maxX] of [[1, 1060], [3, 1072], [4, 1002], [5, 1050], [6, 965]]) {
        for (const layout of arenasForChapter(chapter)) {
            const point = moveInArena(layout, 850, 560, 400, 0, 18);
            assert.ok(point.x <= maxX, `${layout.id} 右下底座外沿：${point.x}`);
            assert.equal(isArenaFree(layout, 850, 560, 18), true,
                `${layout.id} 中央右侧仍可通行`);
        }
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
        assert.ok(moveInArena(layout, 900, 175, 260, 0, 18).x <= 1145,
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

test('第三章左下培养罐的外凸底座挡住横向行走', () => {
    for (const layout of arenasForChapter(3)) {
        const point = moveInArena(layout, 380, 480, -205, 0, 18);
        assert.ok(point.x >= 200, `${layout.id} 培养罐底座不被脚底踩入`);
        assert.equal(isArenaFree(layout, 380, 480, 18), true,
            `${layout.id} 底座右侧保留通路`);
    }
});

test('第五章左侧装甲墙外凸顶面挡住角色脚底并保留上方通路', () => {
    for (const layout of arenasForChapter(5)) {
        const point = moveInArena(layout, 400, 390, -360, 0, 18);
        assert.ok(point.x >= 180, `${layout.id} 装甲墙外凸顶面：${point.x}`);
        assert.equal(isArenaFree(layout, 180, 300, 18), true,
            `${layout.id} 装甲墙上方仍可通行`);
    }
});

test('第四章左侧遗迹过渡碎石封住两段建筑之间的空档', () => {
    for (const layout of arenasForChapter(4)) {
        const point = moveInArena(layout, 400, 430, -360, 0, 18);
        assert.ok(point.x >= 160, `${layout.id} 左下遗迹顶面不可站立：${point.x}`);
        assert.equal(isArenaFree(layout, 240, 430, 18), true,
            `${layout.id} 遗迹右侧仍可通行`);
    }
});

test('第四章左下遗迹上段让出可见空地，下段底座仍挡住角色', () => {
    for (const layout of arenasForChapter(4)) {
        const edges = { ...layout, obstacles: [] };
        let upper = { x: 400, y: 480 };
        let lower = { x: 400, y: 560 };
        for (let i = 0; i < 180; i++) {
            upper = moveInArena(edges, upper.x, upper.y, -2, 0, 16);
            lower = moveInArena(edges, lower.x, lower.y, -2, 0, 16);
        }
        assert.ok(upper.x >= 210 && upper.x <= 222,
            `${layout.id} 上段走到石块外沿而非被空地挡住：${upper.x}`);
        assert.ok(lower.x >= 310 && lower.x <= 322,
            `${layout.id} 下段底座仍挡住角色：${lower.x}`);
        assert.equal(isArenaFree(edges, 230, 480, 16), true,
            `${layout.id} 石块旁的可见空地开放`);
    }
});

test('第二章左下炉台按阶梯外形开放空地并挡住下方机座', () => {
    for (const layout of arenasForChapter(2)) {
        const edges = { ...layout, obstacles: [] };
        const stops = [480, 520, 560].map(y => {
            let point = { x: 400, y };
            for (let i = 0; i < 180; i++) point = moveInArena(edges, point.x, point.y, -2, 0, 16);
            return point.x;
        });
        assert.ok(stops[0] >= 222 && stops[0] <= 234,
            `${layout.id} 上段地面可走到炉台外沿：${stops[0]}`);
        assert.ok(stops[1] >= 232 && stops[1] <= 244,
            `${layout.id} 中段机座挡住角色：${stops[1]}`);
        assert.ok(stops[2] >= 314 && stops[2] <= 326,
            `${layout.id} 下段管线挡住角色：${stops[2]}`);
    }
});

test('第六章左侧断框与核心之间的碎石不让角色踩上去', () => {
    for (const layout of arenasForChapter(6)) {
        const edges = { ...layout, obstacles: [] };
        const upper = moveInArena(edges, 400, 430, -360, 0, 18);
        const lower = moveInArena(edges, 400, 450, -360, 0, 18);
        assert.ok(upper.x >= 200, `${layout.id} 断框下沿碎石：${upper.x}`);
        assert.ok(lower.x >= 215, `${layout.id} 核心上沿碎石：${lower.x}`);
        assert.equal(isArenaFree(edges, 300, 430, 18), true,
            `${layout.id} 碎石右侧仍可通行`);
    }
});

test('第六章左下核心边界按碎石外形开放中段空地', () => {
    for (const layout of arenasForChapter(6)) {
        const edges = { ...layout, obstacles: [] };
        const stops = [480, 520, 560].map(y => {
            let point = { x: 400, y };
            for (let i = 0; i < 180; i++) point = moveInArena(edges, point.x, point.y, -2, 0, 16);
            return point.x;
        });
        assert.ok(stops[0] >= 234 && stops[0] <= 246,
            `${layout.id} 上段仍挡住碎石：${stops[0]}`);
        assert.ok(stops[1] >= 270 && stops[1] <= 282,
            `${layout.id} 中段可走到碎石外沿：${stops[1]}`);
        assert.ok(stops[2] >= 316 && stops[2] <= 328,
            `${layout.id} 下段宽底座仍挡住角色：${stops[2]}`);
    }
});

test('第四章遗迹与第六章核心的左侧碎块挡住从上方走来的玩家脚底', () => {
    // 按运行时玩家半径与连续帧的小步长推进，避免一次大位移提前停住而误判通过。
    for (const [chapter, x, visualTop] of [[4, 120, 450], [6, 240, 516]]) {
        for (const layout of arenasForChapter(chapter)) {
            const edges = { ...layout, obstacles: [] };
            assert.equal(isArenaFree(edges, x, 360, 16), true, `${layout.id} 从合法地面起步`);
            let y = 360;
            for (let i = 0; i < 200; i++) {
                const next = moveInArena(edges, x, y, 0, 2, 16);
                if (next.y === y) break;
                y = next.y;
            }
            const foot = y + 36;
            assert.ok(foot >= visualTop - 8 && foot <= visualTop,
                `${layout.id} 玩家走到碎块前且脚底不压入：${foot}`);
        }
    }
});

test('第二章右侧炉台斜坡挡住脚底且保留上方地面', () => {
    for (const layout of arenasForChapter(2)) {
        const upper = moveInArena(layout, 900, 420, 360, 0, 18);
        const front = moveInArena(layout, 900, 450, 360, 0, 18);
        assert.ok(upper.x <= 1200, `${layout.id} 炉台斜坡上段：${upper.x}`);
        assert.ok(front.x <= 1160, `${layout.id} 炉台斜坡前沿：${front.x}`);
        assert.equal(isArenaFree(layout, 1150, 390, 18), true,
            `${layout.id} 炉台上方仍可通行`);
    }
});

test('左上外凸炉台、培养罐与支架碎石不被脚底踩入', () => {
    for (const [chapter, minX] of [[2, 208], [3, 208], [6, 185]]) {
        for (const layout of arenasForChapter(chapter)) {
            const point = moveInArena(layout, 450, 130, -400, 0, 18);
            assert.ok(point.x >= minX, `${layout.id} 左上建筑外角挡住横向行走`);
            assert.equal(isArenaFree(layout, 450, 130, 18), true,
                `${layout.id} 中央侧保留通路`);
        }
    }
});

test('背景岗哨和遗迹的上沿不被角色脚底踩入', () => {
    const guardrail = moveInArena(arena, 145, 220, 0, 180, 18);
    assert.ok(guardrail.y + 37 <= 390, `第一章岗哨脚底停在上沿：${guardrail.y + 37}`);
    const ruin = moveInArena(arenaForChapter(4), 150, 360, 0, 200, 18);
    assert.ok(ruin.y + 37 <= 470, `第四章遗迹脚底停在上沿：${ruin.y + 37}`);
});

test('六章独立残骸均有与贴图匹配的轮廓碰撞数据', () => {
    for (const layout of CHAPTER_ARENAS) for (const prop of layout.obstacles) {
        const rows = ARENA_COLLISION_MASKS[prop.artKey];
        assert.equal(rows.length, 16, `${prop.artKey} 有完整轮廓`);
        assert.ok(rows.some(row => parseInt(row, 16) !== 0), `${prop.artKey} 有实体像素`);
        assert.equal(isArenaFree(layout, prop.x, prop.y, 16), false,
            `${layout.id}/${prop.id} 正中央仍为实体`);
    }
});

test('斜向矮路障的透明角可走，实体斜边挡住行走与冲刺', () => {
    const prop = arena.obstacles.find(item => item.kind === 'barrier');
    const isolated = { id: 'barrier-shape', chapter: 0, obstacles: [prop] };
    const cell = (column, row) => ({
        x: prop.x - prop.visualW / 2 + (column + 0.5) * prop.visualW / 32,
        y: prop.y - prop.visualH / 2 + (row + 0.5) * prop.visualH / 16 - 20,
    });
    for (const [column, row] of [[3, 6], [2, 8], [25, 12]]) {
        const point = cell(column, row);
        assert.equal(isArenaFree(isolated, point.x, point.y, 1), true,
            `透明空地 ${column},${row} 可走`);
    }
    for (const [column, row] of [[12, 6], [18, 8], [10, 12]]) {
        const point = cell(column, row);
        assert.equal(isArenaFree(isolated, point.x, point.y, 1), false,
            `可见路障 ${column},${row} 挡人`);
    }
    const row = cell(0, 8);
    const walked = moveInArena(isolated, row.x, row.y, prop.visualW * 1.5, 0, 16);
    const dashed = dashInArena(isolated, row.x, row.y, prop.visualW * 1.5, 0, 16);
    assert.ok(walked.x < prop.x, '行走停在可见斜边前');
    assert.ok(dashed.x < prop.x, '冲刺沿途命中斜边，不穿入路障');
    assert.equal(isArenaFree(isolated, dashed.x, dashed.y, 16), true);
});

test('断墙和磁轨按各自斜向轮廓阻挡，不封死透明角', () => {
    for (const key of ['arena_wall_ch1', 'arena_rail_ch5']) {
        const prop = CHAPTER_ARENAS.flatMap(layout => layout.obstacles).find(item => item.artKey === key);
        const isolated = { id: key, chapter: 0, obstacles: [prop] };
        const at = (column, row) => ({
            x: prop.x - prop.visualW / 2 + (column + 0.5) * prop.visualW / 32,
            y: prop.y - prop.visualH / 2 + (row + 0.5) * prop.visualH / 16 - 20,
        });
        const open = at(2, 3), blocked = at(22, 7);
        assert.equal(isArenaFree(isolated, open.x, open.y, 1), true, `${key} 透明角可走`);
        assert.equal(isArenaFree(isolated, blocked.x, blocked.y, 1), false, `${key} 实体边挡人`);
        const start = at(0, 8);
        const dash = dashInArena(isolated, start.x, start.y, prop.visualW * 1.5, 0, 16);
        assert.ok(dash.x < prop.x, `${key} 冲刺不能穿过实体`);
    }
});

test('刷怪和掉落能从残骸内部移到合法位置', () => {
    for (const prop of arena.obstacles) {
        const p = safeArenaPoint(arena, prop.x, prop.y, 30);
        assert.equal(isArenaFree(arena, p.x, p.y, 30), true);
    }
});

test('高大残骸与低矮路障都挡住扫掠快弹', () => {
    assert.equal(firstArenaBulletHit(arena, 190, 280, 500, 280, 5)?.id, 'west-wall');
    assert.equal(firstArenaBulletHit(arena, 390, 544, 520, 544, 5)?.id, 'south-barrier');
});

test('所有独立残骸的可见实体挡住双向子弹，废车投影不挡路', () => {
    const seen = new Set();
    for (const prop of CHAPTER_ARENAS.flatMap(layout => layout.obstacles)) {
        if (seen.has(prop.artKey)) continue;
        seen.add(prop.artKey);
        const isolated = { id: prop.id, chapter: 0, obstacles: [prop] };
        const left = prop.x - prop.visualW, right = prop.x + prop.visualW;
        assert.equal(firstArenaBulletHit(isolated, left, prop.y, right, prop.y, 3)?.id, prop.id,
            `${prop.artKey} 从左侧挡弹`);
        assert.equal(firstArenaBulletHit(isolated, right, prop.y, left, prop.y, 3)?.id, prop.id,
            `${prop.artKey} 从右侧挡弹`);
        assert.equal(arenaLineClear(isolated, left, prop.y, right, prop.y), false);
    }
    assert.equal(seen.size, 13);
    const wreck = CHAPTER_ARENAS.flatMap(layout => layout.obstacles)
        .find(prop => prop.artKey === 'arena_wreck_ch1');
    const isolated = { id: 'wreck-shadow', chapter: 0, obstacles: [wreck] };
    const x = wreck.x - wreck.visualW / 2 + 20.5 * wreck.visualW / 32;
    const y = wreck.y - wreck.visualH / 2 + 14.5 * wreck.visualH / 16;
    assert.equal(isArenaFree(isolated, x, y - 20, 1), true, '废车右下投影区域可走');
    assert.equal(firstArenaBulletHit(isolated, x, y, x + 1, y, 0), undefined,
        '投影本身不挡子弹');
});

test('悬空横杆只挡弹，右上建筑按斜边留出空路', () => {
    const edges = arenaWithObstacles(1, []);
    assert.equal(isArenaFree(edges, 120, 270, 16), true);
    assert.equal(firstArenaBulletHit(edges, 70, 292, 170, 292, 0)?.id, 'left-guardrail-bar');
    assert.equal(isArenaFree(edges, 1140, 200, 16), true);
    assert.equal(isArenaFree(edges, 1240, 180, 16), false);
    assert.equal(firstArenaBulletHit(edges, 1100, 180, 1260, 180, 0)?.id, 'upper-right-building');
});

test('爆炸范围内隔着残骸的目标不会受到远程伤害', () => {
    const barrier = arena.obstacles.find(prop => prop.kind === 'barrier');
    const isolated = { id: 'blast-cover', chapter: 0, obstacles: [barrier] };
    const source = { x: barrier.x - 110, y: barrier.y };
    const open = { x: source.x + 12, y: source.y, alive: true, damage: 0,
        takeDamage(amount) { this.damage += amount; } };
    const covered = { x: barrier.x + 110, y: barrier.y, alive: true, damage: 0,
        takeDamage(amount) { this.damage += amount; } };
    const game = { enemies: [open, covered], particles: { explode() {} },
        audio: { playSfx() {} }, screenShake: { shake() {} },
        arenaLineClear: (ax, ay, bx, by) => arenaLineClear(isolated, ax, ay, bx, by) };
    spawnExplosion({}, source.x, source.y, 30, 300, game);
    assert.equal(open.damage, 30);
    assert.equal(covered.damage, 0);
});

test('直线鞭击技能命中掩体前的敌人，但不会隔墙伤人', () => {
    const barrier = arena.obstacles.find(prop => prop.kind === 'barrier');
    const isolated = { id: 'whip-cover', chapter: 0, obstacles: [barrier] };
    const player = { x: barrier.x - 110, y: barrier.y, facingX: 1, facingY: 0 };
    const enemy = x => ({ x, y: barrier.y, radius: 12, alive: true, dead: false,
        damage: 0, takeDamage(amount) { this.damage += amount; } });
    const near = enemy(player.x + 20), behind = enemy(barrier.x + 60);
    const game = { enemies: [near, behind], turrets: [], input: { mouse: { active: false } },
        particles: { hexActivate() {} },
        arenaLineClear: (ax, ay, bx, by) => arenaLineClear(isolated, ax, ay, bx, by) };
    CHARACTERS.graf.qSkill(player, game);
    game.turrets[0].update(0.02, game);
    assert.equal(near.damage, 20);
    assert.equal(behind.damage, 0);
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

// 用户标注的第一章左上红框：横杆下方路面可通过，落地机柜仍挡住玩家。
test('第一章悬空横杆下可以通行且不能穿入护栏机柜', () => {
    for (const layout of CHAPTER_ARENAS.filter(a => a.chapter === 1)) {
        const next = moveInArena(layout, 125, 230, 0, 105, 16);
        assert.ok(next.y >= 334, `${layout.id} 可走过红框区域：${next.y}`);
        const blocked = moveInArena(layout, next.x, next.y, 0, 100, 16);
        assert.ok(blocked.y <= 350, `${layout.id} 机柜前停下：${blocked.y}`);
        assert.equal(isArenaFree(layout, blocked.x, blocked.y, 16), true);
    }
});
