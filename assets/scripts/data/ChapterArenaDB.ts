// ============================================================
//  ChapterArenaDB.ts — 世界坐标场地、独立残骸与碰撞布局
// ============================================================

export interface ArenaSolid {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    /** 实心边界和高大残骸挡住双方弹体。 */
    blocksBullets: boolean;
    /** 高架横杆只挡弹体，地面可通行。 */
    blocksActors?: boolean;
    /** 背景结构的世界坐标轮廓。 */
    vertices?: readonly [number, number][];
    /** 侧角细碰撞只补小半径单位；大单位的主矩形已覆盖同一贴图外沿。 */
    maxActorRadius?: number;
    /** 贴图本身为斜向路障时，碰撞体沿相同方向旋转（角度为屏幕坐标）。 */
    angleDeg?: number;
}

export interface ArenaObstacle extends ArenaSolid {
    kind: 'wreck' | 'wall' | 'barrier' | 'machine' | 'conveyor' | 'vat' | 'console'
        | 'portal' | 'pillar' | 'mech' | 'rail' | 'reactor' | 'support';
    artKey: string;
    visualW: number;
    visualH: number;
    /** 个别布局的侧角比同图其它位置更容易被走到，可单独补落地上沿。 */
    sideTop?: { left?: number; right?: number };
    /** 主矩形已能挡住较大单位时，不让细碰撞段扰动其绕行。 */
    sideMaxRadius?: { left?: number; right?: number };
}

export interface ArenaLayout {
    id: string;
    chapter: number;
    obstacles: readonly ArenaObstacle[];
    /** 背景里已经画出的建筑、围栏和机械边界；无需另画贴图。 */
    boundaries?: readonly ArenaSolid[];
}

/** 残骸 PNG 的实体像素上沿（alpha >= 128），按原图高度归一化。 */
export const ARENA_ART_SOLID_TOP: Readonly<Record<string, number>> = {
    arena_barrier_ch1: 100 / 809,
    arena_console_ch3: 90 / 887,
    arena_conveyor_ch2: 130 / 809,
    arena_machine_ch2: 75 / 1024,
    arena_mech_ch5: 82 / 887,
    arena_pillar_ch4: 181 / 923,
    arena_portal_ch4: 85 / 972,
    arena_rail_ch5: 109 / 887,
    arena_reactor_ch6: 83 / 971,
    arena_support_ch6: 18 / 856,
    arena_vat_ch3: 98 / 1060,
    arena_wall_ch1: 139 / 768,
    arena_wreck_ch1: 112 / 961,
};

/** 第一章残骸的角色脚底与实体像素之间额外留白，避免缩放取整后看似踩入。 */
export const ARENA_ART_FOOT_CLEARANCE: Readonly<Record<string, number>> = {
    arena_wall_ch1: 4,
    arena_wreck_ch1: 4,
    arena_barrier_ch1: 4,
};

/** 圆形残骸侧角的可见实体起点；比例按 Cocos 裁切后的 SpriteFrame 可见高度计算。 */
export const ARENA_ART_SIDE_TOP: Readonly<Record<string, { left?: number; right?: number }>> = {
    arena_mech_ch5: { left: 0.60, right: 0.60 },
    arena_portal_ch4: { right: 0.47 },
    arena_rail_ch5: { left: 0.58 },
    arena_reactor_ch6: { right: 0.55 },
};

function edge(id: string, left: number, top: number, right: number, bottom: number): ArenaSolid {
    return { id, x: (left + right) / 2, y: (top + bottom) / 2,
        w: right - left, h: bottom - top, blocksBullets: true };
}

function outline(id: string, vertices: readonly [number, number][]): ArenaSolid {
    const xs = vertices.map(point => point[0]), ys = vertices.map(point => point[1]);
    const left = Math.min(...xs), right = Math.max(...xs);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    return { id, x: (left + right) / 2, y: (top + bottom) / 2,
        w: right - left, h: bottom - top, vertices, blocksBullets: true };
}

const COMMON_EDGES: readonly ArenaSolid[] = [
    edge('left-outer-wall', 0, 66, 58, 620),
    edge('right-outer-wall', 1256, 66, 1280, 620),
];

/** 按六张 1280×720 底图逐章描出建筑与路面的交界，避免矩形覆盖空地。 */
const CHAPTER_EDGES: Record<number, readonly ArenaSolid[]> = {
    1: [
        ...COMMON_EDGES,
        edge('top-structure', 0, 0, 1280, 44),
        outline('upper-left-building', [[0, 0], [125, 0], [125, 105],
            [100, 145], [75, 175], [0, 200]]),
        outline('upper-right-building', [[1125, 0], [1280, 0], [1280, 230],
            [1250, 222], [1220, 202], [1190, 176], [1165, 143], [1140, 90]]),
        // 横杆悬空，只挡平射弹；立柱与机柜按落地轮廓阻挡移动。
        { ...edge('left-guardrail-bar', 45, 284, 164, 300), blocksActors: false },
        outline('left-guardrail-base', [[0, 260], [48, 260], [58, 344],
            [100, 344], [128, 380], [154, 410], [120, 428], [0, 428]]),
        outline('lower-left-wreckage', [[0, 445], [125, 445], [180, 475],
            [235, 515], [265, 570], [285, 615], [345, 645], [440, 680],
            [440, 720], [0, 720]]),
        outline('lower-right-crates', [[1280, 445], [1280, 720], [780, 720],
            [820, 675], [880, 640], [950, 605], [1030, 565], [1080, 525],
            [1140, 490], [1220, 460]]),
    ],
    2: [
        ...COMMON_EDGES,
        edge('top-foundry', 0, 0, 1280, 44),
        outline('upper-left-furnace', [[0, 0], [520, 0], [500, 43],
            [420, 45], [405, 105], [365, 100], [320, 65], [275, 80],
            [245, 110], [195, 143], [160, 157], [112, 183], [0, 208]]),
        outline('upper-right-furnace', [[850, 0], [1280, 0], [1280, 286],
            [1220, 264], [1190, 234], [1170, 222], [1130, 207],
            [1090, 179], [1050, 142], [1025, 90], [975, 70],
            [925, 63], [870, 65]]),
        outline('left-pipes', [[0, 225], [65, 225], [80, 278],
            [65, 340], [100, 380], [105, 415], [0, 415]]),
        outline('lower-left-furnace', [[0, 395], [140, 395], [148, 440],
            [195, 455], [215, 498], [225, 545], [270, 575],
            [375, 610], [480, 650], [480, 720], [0, 720]]),
        outline('lower-right-pipes', [[1280, 395], [1280, 720], [790, 720],
            [800, 675], [880, 635], [950, 605], [1030, 575],
            [1090, 530], [1110, 490], [1150, 455], [1230, 420]]),
    ],
    3: [
        ...COMMON_EDGES,
        edge('top-lab', 0, 0, 1280, 44),
        outline('upper-left-vats', [[0, 0], [540, 0], [520, 45],
            [430, 70], [370, 75], [305, 45], [255, 48], [220, 95],
            [190, 160], [155, 185], [85, 220], [0, 230]]),
        outline('upper-right-vats', [[860, 0], [1280, 0], [1280, 305],
            [1225, 295], [1190, 275], [1160, 245], [1140, 205],
            [1090, 175], [1060, 140], [1010, 110], [970, 90],
            [930, 70], [870, 50]]),
        outline('left-lab-wall', [[0, 275], [45, 275], [55, 320],
            [85, 330], [98, 370], [98, 408], [0, 430]]),
        outline('lower-left-vats', [[0, 360], [80, 360], [115, 405],
            [155, 430], [185, 485], [190, 535], [220, 565],
            [310, 615], [400, 660], [400, 720], [0, 720]]),
        outline('lower-right-lab', [[1280, 430], [1280, 720], [800, 720],
            [830, 665], [900, 625], [975, 590], [1040, 555],
            [1120, 520], [1160, 470], [1210, 435]]),
    ],
    4: [
        ...COMMON_EDGES,
        edge('top-rift-wall', 0, 0, 1280, 44),
        outline('upper-left-ruin', [[0, 0], [500, 0], [470, 45],
            [410, 65], [365, 75], [280, 65], [215, 95],
            [160, 135], [100, 165], [0, 190]]),
        outline('upper-right-portal', [[950, 0], [1280, 0], [1280, 235],
            [1230, 225], [1190, 210], [1135, 178], [1100, 150],
            [1060, 125], [1025, 95], [1000, 70]]),
        outline('left-rift-pillar', [[0, 195], [50, 195], [55, 240],
            [80, 280], [80, 315], [105, 340], [70, 365], [0, 365]]),
        outline('lower-left-ruin', [[0, 400], [75, 400], [115, 445],
            [160, 470], [210, 510], [235, 550], [310, 590],
            [410, 640], [470, 685], [470, 720], [0, 720]]),
        outline('lower-right-ruin', [[1280, 430], [1280, 720], [800, 720],
            [850, 655], [930, 615], [1000, 575], [1060, 545],
            [1100, 500], [1160, 465], [1220, 440]]),
    ],
    5: [
        ...COMMON_EDGES,
        edge('top-mech-wall', 0, 0, 1280, 44),
        outline('upper-left-mech', [[0, 0], [525, 0], [495, 45],
            [420, 80], [370, 75], [330, 40], [265, 65],
            [210, 95], [165, 145], [130, 195], [0, 230]]),
        outline('upper-right-mech', [[880, 0], [1280, 0], [1280, 260],
            [1220, 245], [1170, 228], [1140, 202], [1110, 180],
            [1080, 150], [1040, 115], [995, 95], [940, 62], [890, 55]]),
        outline('left-armored-wall', [[0, 225], [80, 225], [100, 265],
            [105, 310], [125, 330], [145, 370], [160, 410],
            [130, 450], [0, 455]]),
        outline('lower-left-mech', [[0, 445], [180, 445], [215, 490],
            [230, 535], [280, 585], [380, 630], [470, 680],
            [470, 720], [0, 720]]),
        outline('lower-right-platform', [[1280, 430], [1280, 720], [770, 720],
            [800, 675], [880, 625], [960, 595], [1030, 560],
            [1090, 520], [1160, 480], [1220, 445]]),
    ],
    6: [
        ...COMMON_EDGES,
        edge('top-core-wall', 0, 0, 1280, 44),
        outline('upper-left-frame', [[0, 0], [560, 0], [530, 40],
            [455, 55], [400, 88], [335, 83], [280, 60],
            [230, 85], [190, 120], [160, 155], [95, 190], [0, 215]]),
        outline('upper-right-reactor', [[700, 0], [1280, 0], [1280, 335],
            [1230, 323], [1190, 305], [1170, 270], [1135, 245],
            [1090, 220], [1030, 195], [985, 170], [940, 135],
            [870, 100], [810, 82], [740, 70]]),
        // 横杆固定在左侧柱体上，脚底可从下方路面穿过。
        { ...edge('left-broken-frame-bar', 45, 289, 160, 304), blocksActors: false },
        outline('left-broken-frame', [[0, 220], [60, 220], [80, 255],
            [85, 310], [80, 370], [105, 390], [120, 425], [0, 450]]),
        outline('lower-left-core', [[0, 430], [160, 430], [200, 465],
            [225, 500], [260, 540], [305, 585], [400, 625],
            [480, 680], [480, 720], [0, 720]]),
        outline('lower-right-core', [[1280, 400], [1280, 720], [770, 720],
            [815, 670], [870, 630], [940, 595], [1000, 555],
            [1050, 520], [1120, 485], [1180, 450], [1230, 420]]),
    ],
};

/** 每章两套残骸模板；实际进图从十五个候选位置随机选三处。 */
export const CHAPTER_ARENAS: readonly ArenaLayout[] = [
    {
        id: 'ch1-checkpoint', chapter: 1, boundaries: CHAPTER_EDGES[1],
        obstacles: [
            { id: 'west-wall', kind: 'wall', x: 278, y: 280, w: 112, h: 42, angleDeg: 9, artKey: 'arena_wall_ch1', visualW: 160, visualH: 78, blocksBullets: true },
            { id: 'east-wreck', kind: 'wreck', x: 998, y: 270, w: 116, h: 66, artKey: 'arena_wreck_ch1', visualW: 154, visualH: 90, blocksBullets: true },
            { id: 'south-barrier', kind: 'barrier', x: 456, y: 544, w: 84, h: 32, artKey: 'arena_barrier_ch1', visualW: 114, visualH: 65, blocksBullets: true },
        ],
    },
    {
        id: 'ch1-crossroad', chapter: 1, boundaries: CHAPTER_EDGES[1],
        obstacles: [
            { id: 'north-wall', kind: 'wall', x: 905, y: 245, w: 110, h: 42, angleDeg: 9, artKey: 'arena_wall_ch1', visualW: 158, visualH: 78, blocksBullets: true },
            { id: 'west-wreck', kind: 'wreck', x: 275, y: 445, w: 116, h: 66, artKey: 'arena_wreck_ch1', visualW: 154, visualH: 90, blocksBullets: true },
            { id: 'south-barrier', kind: 'barrier', x: 570, y: 545, w: 84, h: 32, artKey: 'arena_barrier_ch1', visualW: 114, visualH: 65, blocksBullets: true },
        ],
    },
    {
        id: 'ch2-foundry', chapter: 2, boundaries: CHAPTER_EDGES[2],
        obstacles: [
            { id: 'west-press', kind: 'machine', x: 260, y: 270, w: 126, h: 62, artKey: 'arena_machine_ch2', visualW: 168, visualH: 104, blocksBullets: true },
            { id: 'east-press', kind: 'machine', x: 980, y: 480, w: 112, h: 58, artKey: 'arena_machine_ch2', visualW: 150, visualH: 94, blocksBullets: true },
            { id: 'south-conveyor', kind: 'conveyor', x: 500, y: 500, w: 92, h: 32, artKey: 'arena_conveyor_ch2', visualW: 124, visualH: 65, blocksBullets: true },
        ],
    },
    {
        id: 'ch2-offset-line', chapter: 2, boundaries: CHAPTER_EDGES[2],
        obstacles: [
            { id: 'north-press', kind: 'machine', x: 990, y: 250, w: 126, h: 62, artKey: 'arena_machine_ch2', visualW: 168, visualH: 104, blocksBullets: true },
            { id: 'west-conveyor', kind: 'conveyor', x: 290, y: 475, w: 92, h: 32, artKey: 'arena_conveyor_ch2', visualW: 124, visualH: 65, blocksBullets: true },
        ],
    },
    {
        id: 'ch3-containment', chapter: 3, boundaries: CHAPTER_EDGES[3],
        obstacles: [
            { id: 'west-vat', kind: 'vat', x: 275, y: 260, w: 92, h: 70, artKey: 'arena_vat_ch3', visualW: 136, visualH: 112, blocksBullets: true },
            { id: 'east-vat', kind: 'vat', x: 990, y: 465, w: 86, h: 66, artKey: 'arena_vat_ch3', visualW: 126, visualH: 104, blocksBullets: true },
            { id: 'south-console', kind: 'console', x: 490, y: 505, w: 100, h: 42, artKey: 'arena_console_ch3', visualW: 140, visualH: 78, blocksBullets: true },
        ],
    },
    {
        id: 'ch3-split-lab', chapter: 3, boundaries: CHAPTER_EDGES[3],
        obstacles: [
            { id: 'north-vat', kind: 'vat', x: 900, y: 250, w: 92, h: 70, artKey: 'arena_vat_ch3', visualW: 136, visualH: 112, blocksBullets: true },
            { id: 'west-console', kind: 'console', x: 285, y: 465, w: 100, h: 42, artKey: 'arena_console_ch3', visualW: 140, visualH: 78, blocksBullets: true },
        ],
    },
    {
        id: 'ch4-rift', chapter: 4, boundaries: CHAPTER_EDGES[4],
        obstacles: [
            { id: 'west-gate', kind: 'portal', x: 270, y: 260, w: 134, h: 46, artKey: 'arena_portal_ch4', visualW: 178, visualH: 104, blocksBullets: true },
            { id: 'east-gate', kind: 'portal', x: 1000, y: 455, w: 126, h: 44, artKey: 'arena_portal_ch4', visualW: 166, visualH: 98, blocksBullets: true },
            { id: 'south-pillar', kind: 'pillar', x: 500, y: 505, w: 98, h: 36, artKey: 'arena_pillar_ch4', visualW: 132, visualH: 72, blocksBullets: true },
        ],
    },
    {
        id: 'ch4-fracture', chapter: 4, boundaries: CHAPTER_EDGES[4],
        obstacles: [
            { id: 'north-gate', kind: 'portal', x: 320, y: 250, w: 130, h: 46, artKey: 'arena_portal_ch4', visualW: 172, visualH: 100, blocksBullets: true },
            { id: 'east-pillar', kind: 'pillar', x: 980, y: 465, w: 98, h: 36, artKey: 'arena_pillar_ch4', visualW: 132, visualH: 72, blocksBullets: true },
        ],
    },
    {
        id: 'ch5-magnetic-rail', chapter: 5, boundaries: CHAPTER_EDGES[5],
        obstacles: [
            { id: 'west-mech', kind: 'mech', x: 290, y: 270, w: 138, h: 56, artKey: 'arena_mech_ch5', visualW: 182, visualH: 96, blocksBullets: true },
            { id: 'east-mech', kind: 'mech', x: 850, y: 355, w: 124, h: 52, artKey: 'arena_mech_ch5', visualW: 166, visualH: 88, blocksBullets: true },
            { id: 'south-rail', kind: 'rail', x: 490, y: 505, w: 102, h: 32, artKey: 'arena_rail_ch5', visualW: 140, visualH: 68, blocksBullets: true },
        ],
    },
    {
        id: 'ch5-armored-islands', chapter: 5, boundaries: CHAPTER_EDGES[5],
        obstacles: [
            { id: 'north-mech', kind: 'mech', x: 830, y: 250, w: 138, h: 56, artKey: 'arena_mech_ch5', visualW: 182, visualH: 96, blocksBullets: true },
            { id: 'west-rail', kind: 'rail', x: 295, y: 475, w: 102, h: 32, artKey: 'arena_rail_ch5', visualW: 140, visualH: 68, blocksBullets: true },
        ],
    },
    {
        id: 'ch6-final-core', chapter: 6, boundaries: CHAPTER_EDGES[6],
        obstacles: [
            { id: 'west-reactor', kind: 'reactor', x: 280, y: 270, w: 126, h: 64, artKey: 'arena_reactor_ch6', visualW: 174, visualH: 108, blocksBullets: true },
            { id: 'east-reactor', kind: 'reactor', x: 1010, y: 490, w: 116, h: 60, artKey: 'arena_reactor_ch6', visualW: 160, visualH: 100, blocksBullets: true },
            { id: 'south-support', kind: 'support', x: 490, y: 505, w: 104, h: 36, artKey: 'arena_support_ch6', visualW: 142, visualH: 72, blocksBullets: true },
        ],
    },
    {
        id: 'ch6-broken-frame', chapter: 6, boundaries: CHAPTER_EDGES[6],
        obstacles: [
            { id: 'north-reactor', kind: 'reactor', x: 870, y: 245, w: 126, h: 64, artKey: 'arena_reactor_ch6', visualW: 174, visualH: 108, blocksBullets: true, sideTop: { left: 0.60 }, sideMaxRadius: { left: 18 } },
            { id: 'west-support', kind: 'support', x: 285, y: 470, w: 104, h: 36, artKey: 'arena_support_ch6', visualW: 142, visualH: 72, blocksBullets: true },
        ],
    },
];

export const EMPTY_ARENA: ArenaLayout = { id: 'open', chapter: 0, obstacles: [] };

/** 十五处候选落点的基准分布；各章按背景建筑轮廓微调。 */
export const ARENA_OBSTACLE_SLOTS: readonly { x: number; y: number }[] = [
    { x: 250, y: 205 }, { x: 430, y: 205 }, { x: 620, y: 195 },
    { x: 810, y: 205 }, { x: 970, y: 210 },
    { x: 245, y: 365 }, { x: 425, y: 365 },
    { x: 845, y: 365 }, { x: 1010, y: 365 },
    { x: 245, y: 510 }, { x: 390, y: 515 }, { x: 535, y: 520 },
    { x: 740, y: 520 }, { x: 885, y: 515 }, { x: 1030, y: 510 },
];

const CHAPTER_OBSTACLE_SLOTS: Readonly<Record<number, readonly [number, number][]>> = {
    1: [[250, 195], [430, 205], [620, 195], [810, 205], [970, 205],
        [260, 355], [420, 355], [840, 365], [1060, 365],
        [320, 465], [420, 525], [540, 515], [740, 515], [880, 480], [1000, 480]],
    2: [[260, 235], [430, 205], [620, 195], [810, 205], [970, 245],
        [240, 355], [420, 365], [840, 365], [1010, 365],
        [300, 495], [410, 515], [530, 515], [740, 515], [880, 525], [540, 285]],
    3: [[270, 205], [430, 205], [620, 195], [810, 205], [970, 205],
        [250, 345], [420, 365], [840, 365], [1010, 365],
        [270, 485], [390, 515], [530, 515], [740, 515], [880, 515], [980, 485]],
    4: [[270, 195], [430, 195], [620, 195], [810, 185], [930, 205],
        [240, 345], [420, 365], [840, 365], [1030, 355],
        [300, 475], [410, 525], [520, 515], [740, 515], [880, 515], [1010, 465]],
    5: [[280, 205], [430, 205], [620, 195], [810, 205], [970, 205],
        [280, 365], [420, 365], [840, 365], [1030, 345],
        [320, 505], [440, 515], [560, 515], [740, 515], [880, 515], [530, 285]],
    6: [[270, 245], [390, 185], [630, 185], [810, 205], [970, 225],
        [320, 335], [440, 365], [830, 345], [990, 375],
        [340, 495], [460, 525], [580, 515], [740, 515], [870, 505], [530, 275]],
};

/** 不依赖随机数，GameManager 在每次进入章节时从这里无放回抽取三处。 */
export function obstacleCandidatesForChapter(chapter: number): readonly ArenaObstacle[] {
    const examples: ArenaObstacle[] = [];
    for (const layout of arenasForChapter(chapter)) examples.push(...layout.obstacles);
    if (!examples.length) return [];
    const slots = CHAPTER_OBSTACLE_SLOTS[chapter] ?? ARENA_OBSTACLE_SLOTS.map(slot => [slot.x, slot.y] as [number, number]);
    return slots.map(([x, y], index) => {
        const source = examples[index % examples.length];
        const scale = 1.22;
        return { ...source, id: `slot-${index + 1}-${source.kind}`, x, y,
            w: Math.round(source.w * scale), h: Math.round(source.h * scale),
            visualW: Math.round(source.visualW * scale), visualH: Math.round(source.visualH * scale) };
    });
}

export function arenaWithObstacles(chapter: number, obstacles: readonly ArenaObstacle[]): ArenaLayout {
    return { id: `ch${chapter}-random-${obstacles.map(prop => prop.id).join('-')}`,
        chapter, boundaries: CHAPTER_EDGES[chapter], obstacles };
}

export function arenasForChapter(chapter: number): readonly ArenaLayout[] {
    return CHAPTER_ARENAS.filter(layout => layout.chapter === chapter);
}

export function arenaForChapter(chapter: number, variant = 0): ArenaLayout {
    const layouts = arenasForChapter(chapter);
    return layouts.length ? layouts[Math.abs(Math.floor(variant)) % layouts.length] : EMPTY_ARENA;
}
