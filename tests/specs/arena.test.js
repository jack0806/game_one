// ============================================================
//  arena.test.js — 六章残骸的世界坐标与碰撞规则
// ============================================================
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ARENA_ART_SOLID_TOP, CHAPTER_ARENAS, arenaForChapter, arenasForChapter } = require('../dist/data/ChapterArenaDB');
const {
    isArenaFree, moveInArena, safeArenaPoint, firstArenaBulletHit, arenaSteerTarget, overlapsObstacle,
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
        const edges = { ...layout, obstacles: [] };
        const top = moveInArena(edges, 640, 360, 0, -500, 16);
        assert.ok(top.y >= 60 && top.y <= 72,
            `${layout.id} 顶部空地可走到护栏前：${top.y}`);
        assert.equal(isArenaFree(edges, 640, 64, 16), true,
            `${layout.id} 顶部空地不再被提前封住`);
        assert.equal(isArenaFree(edges, 640, 56, 16), false,
            `${layout.id} 护栏后方仍有实体边界`);
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
        const point = moveInArena(layout, 1000, 280, 0, -220, 18);
        assert.ok(point.y >= 208, `${layout.id} 反应堆右侧碎石挡住向上行走`);
        assert.equal(isArenaFree(layout, 700, 150, 18), true, `${layout.id} 碎石左侧仍有通路`);
    }
});

test('第六章右上碎石按画面外形分段，空地可走而碎石仍挡脚底', () => {
    const edges = { ...arenaForChapter(6), obstacles: [] };
    const across = moveInArena(edges, 650, 180, 600, 0, 18);
    assert.ok(across.x >= 895 && across.x <= 925, `沿空地走到右侧碎石前：${across.x}`);
    const left = moveInArena(edges, 850, 280, 0, -220, 18);
    assert.ok(left.y >= 163 && left.y <= 185, `左侧碎石上沿：${left.y}`);
    const right = moveInArena(edges, 1000, 280, 0, -220, 18);
    assert.ok(right.y >= 208, `右侧碎石下沿：${right.y}`);
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
        assert.ok(point.x >= 185, `${layout.id} 装甲墙外凸顶面：${point.x}`);
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
        assert.ok(upper.x >= 204 && upper.x <= 216,
            `${layout.id} 上段走到石块外沿而非被空地挡住：${upper.x}`);
        assert.ok(lower.x >= 269 && lower.x <= 279,
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
        assert.ok(stops[0] >= 166 && stops[0] <= 178,
            `${layout.id} 上段地面可走到炉台外沿：${stops[0]}`);
        assert.ok(stops[1] >= 228 && stops[1] <= 240,
            `${layout.id} 中段机座挡住角色：${stops[1]}`);
        assert.ok(stops[2] >= 257 && stops[2] <= 267,
            `${layout.id} 下段管线挡住角色：${stops[2]}`);
    }
});

test('第六章左侧断框与核心之间的碎石不让角色踩上去', () => {
    for (const layout of arenasForChapter(6)) {
        const edges = { ...layout, obstacles: [] };
        const upper = moveInArena(edges, 400, 430, -360, 0, 18);
        const lower = moveInArena(edges, 400, 450, -360, 0, 18);
        assert.ok(upper.x >= 255, `${layout.id} 断框下沿碎石：${upper.x}`);
        assert.ok(lower.x >= 255, `${layout.id} 核心上沿碎石：${lower.x}`);
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
        assert.ok(stops[0] >= 255 && stops[0] <= 270,
            `${layout.id} 上段仍挡住碎石：${stops[0]}`);
        assert.ok(stops[1] >= 268 && stops[1] <= 280,
            `${layout.id} 中段可走到碎石外沿：${stops[1]}`);
        assert.ok(stops[2] >= 285 && stops[2] <= 295,
            `${layout.id} 下段宽底座仍挡住角色：${stops[2]}`);
    }
});

test('第四章遗迹与第六章核心的左侧碎块挡住从上方走来的玩家脚底', () => {
    // 按运行时玩家半径与连续帧的小步长推进，避免一次大位移提前停住而误判通过。
    for (const [chapter, x, visualTop] of [[4, 120, 430], [6, 240, 435]]) {
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
    for (const [chapter, minX] of [[2, 208], [3, 213], [6, 228]]) {
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
    assert.ok(guardrail.y + 37 <= 270, `第一章岗哨脚底停在上沿：${guardrail.y + 37}`);
    const ruin = moveInArena(arenaForChapter(4), 150, 360, 0, 200, 18);
    assert.ok(ruin.y + 37 <= 470, `第四章遗迹脚底停在上沿：${ruin.y + 37}`);
});

test('第一章两套布局的三个残骸与玩家脚底保留可见余量', () => {
    // 上沿来自当前透明素材在游戏尺寸下的不透明像素，而非逻辑矩形自身。
    for (const layout of arenasForChapter(1)) {
        for (const prop of layout.obstacles) {
            const artTop = prop.y - prop.visualH / 2 + ARENA_ART_SOLID_TOP[prop.artKey] * prop.visualH;
            const startY = Math.max(125, prop.y - 120);
            assert.equal(isArenaFree(layout, prop.x, startY, 16), true, `${layout.id}/${prop.id} 的起点可通行`);
            const point = moveInArena(layout, prop.x, startY, 0, 250, 16);
            assert.ok(point.y > startY + 20, `${layout.id}/${prop.id} 从上方走到残骸边缘`);
            assert.ok(point.y + 36 <= artTop - 2, `${layout.id}/${prop.id} 的脚底与素材上沿保留可见余量`);
            assert.ok(point.y + 36 >= artTop - 25, `${layout.id}/${prop.id} 没有过早停步`);
        }
    }
});

test('六章全部独立残骸的实体像素上沿挡住玩家脚底', () => {
    for (const layout of CHAPTER_ARENAS) {
        for (const prop of layout.obstacles) {
            const opaqueTopFraction = ARENA_ART_SOLID_TOP[prop.artKey];
            assert.ok(Number.isFinite(opaqueTopFraction), `${prop.artKey} 有实体像素边界数据`);
            const artTop = prop.y - prop.visualH / 2 + opaqueTopFraction * prop.visualH;
            const startY = Math.max(125, prop.y - 120);
            // 个别北侧残骸嵌在背景建筑下方，正上方起点本身是建筑实体。
            if (!isArenaFree(layout, prop.x, startY, 16)) {
                assert.ok(layout.boundaries.some(b => overlapsObstacle(prop.x, startY, 16, b)),
                    `${layout.id}/${prop.id} 的上方由背景建筑封住`);
                continue;
            }
            const point = moveInArena(layout, prop.x, startY, 0, 250, 16);
            assert.ok(point.y > startY + 20, `${layout.id}/${prop.id} 从合法起点抵达残骸`);
            assert.ok(point.y + 36 <= artTop + 1,
                `${layout.id}/${prop.id} 脚底 ${point.y + 36} 不压入上沿 ${artTop}`);
            assert.ok(point.y + 36 >= artTop - 25,
                `${layout.id}/${prop.id} 脚底没有离上沿过远`);
        }
    }
});

test('传送门、机械和反应堆的落地侧角不让玩家从上方踩入', () => {
    // 这些列在主矩形外；上下限按实机贴图侧角的实体像素带留几像素余量。
    const cases = [
        ['ch4-rift', 'west-gate', 353, 263, 270],
        ['ch5-magnetic-rail', 'west-mech', 203, 275, 284],
        ['ch5-magnetic-rail', 'west-mech', 377, 275, 284],
        ['ch5-magnetic-rail', 'east-mech', 771, 360, 372],
        ['ch5-armored-islands', 'north-mech', 753, 255, 266],
        ['ch5-armored-islands', 'north-mech', 927, 255, 266],
        ['ch5-magnetic-rail', 'south-rail', 423, 508, 518],
        ['ch6-final-core', 'west-reactor', 349, 271, 279],
    ];
    for (const [layoutId, propId, x, minFoot, maxFoot] of cases) {
        const layout = CHAPTER_ARENAS.find(a => a.id === layoutId);
        const prop = layout.obstacles.find(o => o.id === propId);
        const startY = Math.max(110, prop.y - prop.visualH / 2 - 60);
        assert.equal(isArenaFree(layout, x, startY, 16), true, `${layoutId}/${propId} 从地面起步`);
        let y = startY;
        for (let i = 0; i < 180; i++) {
            const next = moveInArena(layout, x, y, 0, 2, 16);
            if (next.y === y) break;
            y = next.y;
        }
        const foot = y + 36;
        assert.ok(foot > startY + 40, `${layoutId}/${propId} 走到了侧角前`);
        assert.ok(foot >= minFoot && foot <= maxFoot,
            `${layoutId}/${propId} 脚底 ${foot} 停在贴图侧角前 ${minFoot}–${maxFoot}`);
    }
});

test('机械、门环和磁轨的斜向贴边停在实体像素前', () => {
    const cases = [
        ['ch4-rift', 'west-gate', -45, 20, 353, 270],
        ['ch5-armored-islands', 'north-mech', -165, 0, 755, 266],
        ['ch5-magnetic-rail', 'south-rail', -165, 20, 423, 518],
    ];
    for (const [layoutId, propId, degrees, offset, edgeX, maxFoot] of cases) {
        const layout = CHAPTER_ARENAS.find(a => a.id === layoutId);
        const prop = layout.obstacles.find(o => o.id === propId);
        const angle = degrees * Math.PI / 180;
        const vx = Math.cos(angle), vy = Math.sin(angle);
        const distance = Math.max(prop.visualW, prop.visualH) / 2 + 75;
        let x = prop.x + vx * distance - vy * offset;
        let y = prop.y + vy * distance + vx * offset;
        assert.equal(isArenaFree(layout, x, y, 16), true, `${layoutId}/${propId} 从合法地面起步`);
        let nearest = Infinity, footAtEdge = -Infinity;
        for (let i = 0; i < 180; i++) {
            const next = moveInArena(layout, x, y, -vx * 2, -vy * 2, 16);
            x = next.x; y = next.y;
            const separation = Math.abs(x - edgeX);
            if (separation <= 3) {
                nearest = Math.min(nearest, separation);
                footAtEdge = Math.max(footAtEdge, y + 36);
            }
        }
        assert.ok(nearest <= 3, `${layoutId}/${propId} 确实到达侧角`);
        assert.ok(footAtEdge <= maxFoot, `${layoutId}/${propId} 斜向脚底 ${footAtEdge} 不压入实体`);
    }
});

test('第六章第二套反应堆左缘挡住斜向贴边且保留外侧通路', () => {
    const layout = CHAPTER_ARENAS.find(a => a.id === 'ch6-broken-frame');
    let point = { x: 753, y: 136 };
    assert.equal(isArenaFree(layout, point.x, point.y, 16), true);
    for (let i = 0; i < 150; i++) {
        point = moveInArena(layout, point.x, point.y, 2, 2, 16);
    }
    assert.ok(point.x >= 789 && point.x <= 793, `玩家已贴到反应堆左缘：${point.x}`);
    assert.ok(point.y + 36 <= 258, `脚底未沿侧角滑入贴图：${point.y + 36}`);
    const bypass = moveInArena(layout, 750, 136, 0, 160, 16);
    assert.ok(bypass.y >= 290, `残骸左侧地面仍可走：${bypass.y}`);
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
