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
}

export interface ArenaObstacle extends ArenaSolid {
    kind: 'wreck' | 'wall' | 'barrier' | 'machine' | 'conveyor' | 'vat' | 'console'
        | 'portal' | 'pillar' | 'mech' | 'rail' | 'reactor' | 'support';
    artKey: string;
    visualW: number;
    visualH: number;
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

function edge(id: string, left: number, top: number, right: number, bottom: number): ArenaSolid {
    return { id, x: (left + right) / 2, y: (top + bottom) / 2,
        w: right - left, h: bottom - top, blocksBullets: true };
}

const COMMON_EDGES: readonly ArenaSolid[] = [
    edge('left-outer-wall', 0, 66, 58, 620),
    edge('right-outer-wall', 1222, 66, 1280, 620),
    edge('bottom-outer-wall', 0, 620, 1280, 648),
];

/** 保守地覆盖六章底图上能看见的实心边缘，留出中间通路。 */
const CHAPTER_EDGES: Record<number, readonly ArenaSolid[]> = {
    1: [
        ...COMMON_EDGES,
        edge('top-structure', 0, 0, 1280, 66),
        edge('upper-left-building', 0, 0, 125, 195),
        edge('upper-right-building', 1135, 0, 1280, 225),
        edge('left-guardrail', 0, 270, 165, 440),
        edge('lower-left-wreckage', 0, 475, 225, 648),
        edge('lower-left-van-front', 225, 545, 285, 625),
        edge('lower-right-crates', 1110, 492, 1280, 648),
    ],
    2: [
        ...COMMON_EDGES,
        edge('top-foundry', 0, 0, 1280, 72),
        edge('upper-left-furnace', 0, 0, 165, 190),
        edge('upper-left-furnace-front', 165, 70, 190, 175),
        edge('upper-right-furnace', 1090, 0, 1280, 215),
        edge('upper-right-furnace-front', 970, 72, 1090, 205),
        edge('upper-right-pipe-base', 1160, 215, 1280, 285),
        edge('left-pipes', 0, 235, 130, 435),
        edge('lower-left-furnace', 0, 450, 175, 648),
        edge('lower-left-furnace-front', 175, 490, 245, 620),
        edge('lower-right-pipes', 1110, 490, 1280, 648),
        edge('lower-right-pipes-front', 1040, 525, 1110, 620),
    ],
    3: [
        ...COMMON_EDGES,
        edge('top-lab', 0, 0, 1280, 68),
        edge('upper-left-vats', 0, 0, 180, 205),
        edge('upper-left-vats-front', 180, 80, 195, 180),
        edge('upper-right-vats', 1110, 0, 1280, 260),
        edge('left-lab-wall', 0, 215, 145, 450),
        edge('lower-left-vats', 0, 390, 155, 648),
        edge('lower-left-vat-front', 155, 445, 182, 550),
        edge('lower-right-lab', 1120, 430, 1280, 648),
    ],
    4: [
        ...COMMON_EDGES,
        edge('top-rift-wall', 0, 0, 1280, 66),
        edge('upper-left-ruin', 0, 0, 165, 190),
        edge('upper-right-portal', 1085, 0, 1280, 210),
        edge('upper-right-portal-front', 1015, 90, 1085, 210),
        edge('left-rift-pillar', 0, 220, 95, 390),
        edge('lower-left-ruin', 0, 470, 225, 648),
        edge('lower-left-ruin-front', 225, 490, 255, 620),
        edge('lower-right-ruin', 1110, 435, 1280, 648),
    ],
    5: [
        ...COMMON_EDGES,
        edge('top-mech-wall', 0, 0, 1280, 70),
        edge('upper-left-mech', 0, 0, 175, 230),
        edge('upper-right-mech', 1080, 0, 1280, 245),
        edge('left-armored-wall', 0, 225, 140, 455),
        edge('lower-left-mech', 0, 470, 215, 648),
        edge('lower-left-mech-front', 215, 500, 240, 620),
        edge('lower-right-platform', 1100, 445, 1280, 648),
    ],
    6: [
        ...COMMON_EDGES,
        edge('top-core-wall', 0, 0, 1280, 70),
        edge('upper-left-frame', 0, 0, 175, 225),
        edge('upper-left-frame-rubble', 175, 75, 210, 185),
        edge('upper-right-reactor', 1080, 0, 1280, 255),
        edge('upper-reactor-rubble', 790, 70, 1080, 175),
        edge('upper-right-reactor-base', 1170, 255, 1280, 325),
        edge('left-broken-frame', 0, 230, 165, 430),
        edge('lower-left-core', 0, 470, 220, 648),
        edge('lower-left-core-front', 220, 500, 270, 620),
        edge('lower-right-core', 1090, 435, 1280, 648),
        edge('lower-right-core-front', 1010, 515, 1090, 620),
    ],
};

/** 每章两套手工布局；进入章节时选一套，同章波次保持不变。 */
export const CHAPTER_ARENAS: readonly ArenaLayout[] = [
    {
        id: 'ch1-checkpoint', chapter: 1, boundaries: CHAPTER_EDGES[1],
        obstacles: [
            { id: 'west-wall', kind: 'wall', x: 278, y: 280, w: 112, h: 42, artKey: 'arena_wall_ch1', visualW: 160, visualH: 78, blocksBullets: true },
            { id: 'east-wreck', kind: 'wreck', x: 998, y: 270, w: 116, h: 66, artKey: 'arena_wreck_ch1', visualW: 154, visualH: 90, blocksBullets: true },
            { id: 'south-barrier', kind: 'barrier', x: 456, y: 544, w: 84, h: 32, artKey: 'arena_barrier_ch1', visualW: 114, visualH: 65, blocksBullets: false },
        ],
    },
    {
        id: 'ch1-crossroad', chapter: 1, boundaries: CHAPTER_EDGES[1],
        obstacles: [
            { id: 'north-wall', kind: 'wall', x: 905, y: 245, w: 110, h: 42, artKey: 'arena_wall_ch1', visualW: 158, visualH: 78, blocksBullets: true },
            { id: 'west-wreck', kind: 'wreck', x: 275, y: 445, w: 116, h: 66, artKey: 'arena_wreck_ch1', visualW: 154, visualH: 90, blocksBullets: true },
            { id: 'south-barrier', kind: 'barrier', x: 570, y: 545, w: 84, h: 32, artKey: 'arena_barrier_ch1', visualW: 114, visualH: 65, blocksBullets: false },
        ],
    },
    {
        id: 'ch2-foundry', chapter: 2, boundaries: CHAPTER_EDGES[2],
        obstacles: [
            { id: 'west-press', kind: 'machine', x: 260, y: 270, w: 126, h: 62, artKey: 'arena_machine_ch2', visualW: 168, visualH: 104, blocksBullets: true },
            { id: 'east-press', kind: 'machine', x: 1010, y: 515, w: 112, h: 58, artKey: 'arena_machine_ch2', visualW: 150, visualH: 94, blocksBullets: true },
            { id: 'south-conveyor', kind: 'conveyor', x: 470, y: 505, w: 92, h: 32, artKey: 'arena_conveyor_ch2', visualW: 124, visualH: 65, blocksBullets: false },
        ],
    },
    {
        id: 'ch2-offset-line', chapter: 2, boundaries: CHAPTER_EDGES[2],
        obstacles: [
            { id: 'north-press', kind: 'machine', x: 990, y: 250, w: 126, h: 62, artKey: 'arena_machine_ch2', visualW: 168, visualH: 104, blocksBullets: true },
            { id: 'west-conveyor', kind: 'conveyor', x: 290, y: 475, w: 92, h: 32, artKey: 'arena_conveyor_ch2', visualW: 124, visualH: 65, blocksBullets: false },
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
            { id: 'west-gate', kind: 'portal', x: 270, y: 270, w: 134, h: 46, artKey: 'arena_portal_ch4', visualW: 178, visualH: 104, blocksBullets: true },
            { id: 'east-gate', kind: 'portal', x: 1000, y: 455, w: 126, h: 44, artKey: 'arena_portal_ch4', visualW: 166, visualH: 98, blocksBullets: true },
            { id: 'south-pillar', kind: 'pillar', x: 500, y: 505, w: 98, h: 36, artKey: 'arena_pillar_ch4', visualW: 132, visualH: 72, blocksBullets: true },
        ],
    },
    {
        id: 'ch4-fracture', chapter: 4, boundaries: CHAPTER_EDGES[4],
        obstacles: [
            { id: 'north-gate', kind: 'portal', x: 310, y: 250, w: 130, h: 46, artKey: 'arena_portal_ch4', visualW: 172, visualH: 100, blocksBullets: true },
            { id: 'east-pillar', kind: 'pillar', x: 980, y: 465, w: 98, h: 36, artKey: 'arena_pillar_ch4', visualW: 132, visualH: 72, blocksBullets: true },
        ],
    },
    {
        id: 'ch5-magnetic-rail', chapter: 5, boundaries: CHAPTER_EDGES[5],
        obstacles: [
            { id: 'west-mech', kind: 'mech', x: 290, y: 270, w: 138, h: 56, artKey: 'arena_mech_ch5', visualW: 182, visualH: 96, blocksBullets: true },
            { id: 'east-mech', kind: 'mech', x: 850, y: 355, w: 124, h: 52, artKey: 'arena_mech_ch5', visualW: 166, visualH: 88, blocksBullets: true },
            { id: 'south-rail', kind: 'rail', x: 490, y: 505, w: 102, h: 32, artKey: 'arena_rail_ch5', visualW: 140, visualH: 68, blocksBullets: false },
        ],
    },
    {
        id: 'ch5-armored-islands', chapter: 5, boundaries: CHAPTER_EDGES[5],
        obstacles: [
            { id: 'north-mech', kind: 'mech', x: 840, y: 250, w: 138, h: 56, artKey: 'arena_mech_ch5', visualW: 182, visualH: 96, blocksBullets: true },
            { id: 'west-rail', kind: 'rail', x: 295, y: 475, w: 102, h: 32, artKey: 'arena_rail_ch5', visualW: 140, visualH: 68, blocksBullets: false },
        ],
    },
    {
        id: 'ch6-final-core', chapter: 6, boundaries: CHAPTER_EDGES[6],
        obstacles: [
            { id: 'west-reactor', kind: 'reactor', x: 270, y: 270, w: 126, h: 64, artKey: 'arena_reactor_ch6', visualW: 174, visualH: 108, blocksBullets: true },
            { id: 'east-reactor', kind: 'reactor', x: 1010, y: 490, w: 116, h: 60, artKey: 'arena_reactor_ch6', visualW: 160, visualH: 100, blocksBullets: true },
            { id: 'south-support', kind: 'support', x: 490, y: 505, w: 104, h: 36, artKey: 'arena_support_ch6', visualW: 142, visualH: 72, blocksBullets: true },
        ],
    },
    {
        id: 'ch6-broken-frame', chapter: 6, boundaries: CHAPTER_EDGES[6],
        obstacles: [
            { id: 'north-reactor', kind: 'reactor', x: 870, y: 245, w: 126, h: 64, artKey: 'arena_reactor_ch6', visualW: 174, visualH: 108, blocksBullets: true },
            { id: 'west-support', kind: 'support', x: 285, y: 470, w: 104, h: 36, artKey: 'arena_support_ch6', visualW: 142, visualH: 72, blocksBullets: true },
        ],
    },
];

export const EMPTY_ARENA: ArenaLayout = { id: 'open', chapter: 0, obstacles: [] };

export function arenasForChapter(chapter: number): readonly ArenaLayout[] {
    return CHAPTER_ARENAS.filter(layout => layout.chapter === chapter);
}

export function arenaForChapter(chapter: number, variant = 0): ArenaLayout {
    const layouts = arenasForChapter(chapter);
    return layouts.length ? layouts[Math.abs(Math.floor(variant)) % layouts.length] : EMPTY_ARENA;
}
