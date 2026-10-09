// ============================================================
//  LevelIndex.ts — 地图 × 章节双层结构（v5《关卡设计-六图五章.md》）
// ============================================================
// 全局章号 k ∈ 1~30 是唯一真源（1-based，全链路统一）：
//   图号 m = ceil(k/5)；图内章 c = ((k-1) % 5) + 1。
// 地图层（MapDef，6 份）= 环境身份：背景/场地/怪池全集/小首领池/图末 Boss/BGM/主题色。
// 章节层（ChapterNode，30 份）= 推进节点：数值档/怪池渐进/固定变异/关底/任务线/战备包。
// 解锁链：通关全局第 k 节点解锁第 k+1 节点（存档 chaptersCleared 1~30 线性承载），
// 图 N 五章全通自然解锁图 N+1 第一章，无需图级独立字段。
//
// 数值基线：2026-10-09 提案 6 节（stat 1.0→4.2 / count 1.0→2.21 / 战备包 0→14 抽），
// 均为占位，试玩按"图 m 章 c 首通成功率 40~60%"校准。

import { MiniBossTier } from './BossDB';

export const MAP_COUNT = 6;
export const CHAPTERS_PER_MAP = 5;
export const TOTAL_CHAPTERS = MAP_COUNT * CHAPTERS_PER_MAP;

export function globalChapter(mapId: number, chapterInMap: number): number {
    return (mapId - 1) * CHAPTERS_PER_MAP + chapterInMap;
}

export function mapOf(globalChapterId: number): number {
    return Math.min(MAP_COUNT, Math.max(1, Math.ceil(globalChapterId / CHAPTERS_PER_MAP)));
}

export function chapterInMap(globalChapterId: number): number {
    return ((globalChapterId - 1) % CHAPTERS_PER_MAP) + 1;
}

// ── 任务线（提案 8 节：章节是任务线唯一推进器） ────────────────

/** 挑战星条件白名单：只用结算/存档已有的统计项，不为任务系统改战斗内核。 */
export type QuestStat = 'timeSec' | 'kills' | 'goldLeft' | 'combo' | 'shopFree';

export interface QuestChallenge {
    id: string;
    desc: string;
    stat: QuestStat;
    goal: number;
}

export interface QuestDef {
    title: string;
    desc: string;
    /** 章前剧情引子（首进弹窗；第二批填充，骨架期可空串）。 */
    intro: string;
    /** 首通剧情（结算面板；第二批填充）。 */
    outro: string;
    reward: { coreCoins: number; equipmentBox?: boolean };
    challenges: QuestChallenge[];
}

// ── 关底（提案 5.1：图末章打图鉴大 Boss，前 4 章小首领组合） ──

export type FinaleDef =
    | { kind: 'boss' }
    | { kind: 'mini'; tiers: MiniBossTier[] };

// ── 地图层 ────────────────────────────────────────────────────

export type MapBgmCue = 'ch1' | 'ch2' | 'ch3' | 'ch4';

export interface MiniPoolDef {
    普通: string[];
    史诗: string[];
    地狱: string[];
}

export interface MapRoster {
    /** 图池近战全集（重复条目 = 权重）。 */
    melee: string[];
    /** 图池远程全集。 */
    ranged: string[];
    /** 图内渐进锁定序：unlocks[c-2] = 第 c 章新解锁进池的怪 id；章 1 只出未锁定怪。 */
    unlocks: string[][];
    /** 图末章（第 5 章）额外追加的权重条目。 */
    finaleBoost?: string[];
}

export interface MapDef {
    id: number;
    name: string;
    bgKey: string;
    desc: string;
    /** 选图卡主题色。 */
    accent: string;
    /** BGM 键（图 5/6 沿用 ch4 回落，音频素材补齐后改）。 */
    bgmCue: MapBgmCue;
    roster: MapRoster;
    miniPool: MiniPoolDef;
    /** 图末大 Boss（BossDB 显式 id）。 */
    bossId: string;
    /** 图内 5 章名（占位，文案第二批可改）。 */
    chapterNames: string[];
    arcIntro: string;
    arcOutro: string;
}

// 小首领池按 6 图重排（提案 5.1 草案，补齐图 1~3 地狱档空缺）。
// 怪池渐进按提案 5.2 草案：章 1 出场基础怪，每章 +1~2 至全池。
export const MAPS: MapDef[] = [
    {
        id: 1, name: '废土街道', bgKey: 'bg_chapter1', accent: '#4ec8c8', bgmCue: 'ch1',
        desc: '废弃的城市废墟，腐肉横行',
        roster: {
            melee: ['grunt', 'grunt', 'grunt', 'rust_biter', 'blast_tick', 'exploder'],
            ranged: ['archer'],
            unlocks: [['rust_biter'], ['blast_tick'], ['exploder'], []],
            finaleBoost: ['grunt'],
        },
        miniPool: { 普通: ['chain_hound', 'jelly'], 史诗: ['turtle', 'prism_snail'], 地狱: ['drone_s'] },
        bossId: 'ch1',
        chapterNames: ['荒芜外围', '废弃街区', '腐肉巢穴', '坍塌高架', '废土领主之核'],
        arcIntro: '', arcOutro: '',
    },
    {
        id: 2, name: '钢铁工厂', bgKey: 'bg_chapter2', accent: '#c8874e', bgmCue: 'ch2',
        desc: '轰鸣的熔炉，钢铁巨兽苏醒',
        roster: {
            melee: ['grunt', 'shield', 'shield', 'rivet_beast', 'blast_tick'],
            ranged: ['archer', 'needle_gunner'],
            unlocks: [['needle_gunner'], ['rivet_beast'], ['blast_tick'], []],
        },
        miniPool: { 普通: ['turtle', 'prism_snail'], 史诗: ['drone_s', 'squid'], 地狱: ['triune_priest'] },
        bossId: 'ch2',
        chapterNames: ['装卸货场', '熔炉车间', '装配流水线', '核心轧机', '熔炉王座'],
        arcIntro: '', arcOutro: '',
    },
    {
        id: 3, name: '海克斯实验室', bgKey: 'bg_chapter3', accent: '#4ecc8e', bgmCue: 'ch3',
        desc: '高能辐射区域，异变体涌现',
        roster: {
            melee: ['shield', 'rivet_beast', 'golem', 'elite_grunt'],
            ranged: ['needle_gunner', 'ember_acolyte', 'frost_acolyte', 'acid_sac'],
            unlocks: [['golem', 'ember_acolyte'], ['rivet_beast', 'frost_acolyte'], ['elite_grunt', 'acid_sac'], []],
        },
        miniPool: { 普通: ['jelly', 'squid'], 史诗: ['triune_priest', 'rail_butcher'], 地狱: ['shrimp'] },
        bossId: 'ch3',
        chapterNames: ['收容区', '培养槽区', '辐照走廊', '异变核心', '无限核之心'],
        arcIntro: '', arcOutro: '',
    },
    {
        id: 4, name: '混沌位面', bgKey: 'bg_chapter4', accent: '#a06ee0', bgmCue: 'ch4',
        desc: '现实崩塌，终焉之门大开',
        roster: {
            melee: ['golem', 'exploder', 'elite_grunt', 'rust_biter', 'miniboss'],
            ranged: ['ember_acolyte', 'frost_acolyte', 'acid_sac', 'arc_leech'],
            unlocks: [['exploder', 'frost_acolyte'], ['elite_grunt', 'acid_sac'], ['rust_biter', 'arc_leech'], ['miniboss']],
        },
        miniPool: { 普通: ['drone_a'], 史诗: ['squid', 'rail_butcher'], 地狱: ['shrimp', 'bell_devourer'] },
        bossId: 'ch4',
        chapterNames: ['裂隙边缘', '镜像回廊', '崩解街区', '终焉前庭', '终焉之门'],
        arcIntro: '', arcOutro: '',
    },
    {
        id: 5, name: '天罚领域', bgKey: 'bg_chapter5', accent: '#6e9fe0', bgmCue: 'ch4',
        desc: '钢铁巨神镇守天罚之门',
        roster: {
            melee: ['golem', 'rivet_beast', 'elite_grunt', 'elite_grunt', 'miniboss'],
            ranged: ['needle_gunner', 'arc_leech', 'archer'],
            unlocks: [['rivet_beast', 'arc_leech'], ['elite_grunt', 'archer'], ['miniboss'], []],
        },
        miniPool: { 普通: ['drone_a'], 史诗: ['drone_s', 'rail_butcher'], 地狱: ['shrimp', 'bell_devourer'] },
        bossId: 'ch5',
        chapterNames: ['磁轨平台', '机甲坟场', '天罚炮台', '反应堆层', 'X-剑格纳库'],
        arcIntro: '', arcOutro: '',
    },
    {
        id: 6, name: '终焉天罚', bgKey: 'bg_chapter6', accent: '#e06e5a', bgmCue: 'ch4',
        desc: '天空撕裂，灭世机神降临',
        roster: {
            melee: ['golem', 'rivet_beast', 'elite_grunt', 'elite_grunt', 'miniboss', 'blast_tick'],
            ranged: ['arc_leech', 'ember_acolyte', 'frost_acolyte', 'acid_sac'],
            unlocks: [['rivet_beast', 'ember_acolyte'], ['elite_grunt', 'frost_acolyte'], ['miniboss', 'blast_tick', 'acid_sac'], []],
        },
        miniPool: { 普通: [], 史诗: ['triune_priest', 'drone_s'], 地狱: ['bell_devourer', 'shrimp'] },
        bossId: 'ch6',
        chapterNames: ['崩坏防线', '毁灭回廊', '机神近卫', '天罚圣所', '灭世机神'],
        arcIntro: '', arcOutro: '',
    },
];

export function mapDef(mapId: number): MapDef {
    return MAPS[Math.min(MAP_COUNT, Math.max(1, mapId)) - 1];
}

// ── 章节层：30 节点曲线与派生查询 ─────────────────────────────

/** 怪物血量/伤害系数（1.0 → 4.2，提案 6.1 线性基线）。 */
export function statScaleFor(globalChapterId: number): number {
    return 1 + (globalChapterId - 1) * 3.2 / (TOTAL_CHAPTERS - 1);
}

/** 每波小兵数量系数（1.0 → 2.21）。 */
export function countScaleFor(globalChapterId: number): number {
    return 1 + (globalChapterId - 1) * 1.2 / (TOTAL_CHAPTERS - 1);
}

/** 开局战备包（0 抽/0 金 → 14 抽/900 金，提案 6.2 基线）。 */
export function starterPack(globalChapterId: number): { draws: number; gold: number } {
    const k = Math.min(TOTAL_CHAPTERS, Math.max(1, globalChapterId));
    return {
        draws: Math.round((k - 1) * 14 / (TOTAL_CHAPTERS - 1)),
        gold: Math.round((k - 1) * 900 / (TOTAL_CHAPTERS - 1) / 10) * 10,
    };
}

/** 单局金币软上限系数（1.0 → 1.75，对齐旧 6 章端点；校准见提案 6.3）。 */
export function goldStageMult(globalChapterId: number): number {
    return 1 + (globalChapterId - 1) * 0.75 / (TOTAL_CHAPTERS - 1);
}

/** 图内某 id 的解锁章号：不在 unlocks 里的恒为 1（章 1 起在场）。 */
function unlockLevelOf(roster: MapRoster, id: string): number {
    for (let i = 0; i < roster.unlocks.length; i++) {
        if (roster.unlocks[i].indexOf(id) >= 0) return i + 2;
    }
    return 1;
}

/** 全局章 k 的近战池（渐进过滤 + 图末章权重加成）。 */
export function meleePoolFor(globalChapterId: number): string[] {
    const map = mapDef(mapOf(globalChapterId));
    const c = chapterInMap(globalChapterId);
    const pool = map.roster.melee.filter(id => unlockLevelOf(map.roster, id) <= c);
    return c === CHAPTERS_PER_MAP && map.roster.finaleBoost ? [...pool, ...map.roster.finaleBoost] : pool;
}

/** 全局章 k 的远程池（渐进过滤）。 */
export function rangedPoolFor(globalChapterId: number): string[] {
    const map = mapDef(mapOf(globalChapterId));
    const c = chapterInMap(globalChapterId);
    return map.roster.ranged.filter(id => unlockLevelOf(map.roster, id) <= c);
}

/**
 * W5/W10/W14 小首领槽位档位（提案 5.1：档位随图与图内章爬升）。
 * 等价旧章 = (m-1)×2 + (c≥3) + 1，复用 v4 六档节奏；地图末章对应旧奇数章。
 */
export function miniBossTiers(globalChapterId: number, wave: number): MiniBossTier[] {
    const eq = Math.min(6, (mapOf(globalChapterId) - 1) * 2 + (chapterInMap(globalChapterId) >= 3 ? 1 : 0) + 1);
    const T = (w5: MiniBossTier, w10a: MiniBossTier, w10b: MiniBossTier, w14: MiniBossTier): MiniBossTier[] =>
        wave === 5 ? [w5] : wave === 10 ? [w10a, w10b] : wave === 14 ? [w14] : [];
    switch (eq) {
        case 1:  return T('普通', '普通', '普通', '普通');
        case 2:  return T('普通', '普通', '史诗', '史诗');
        case 3:  return T('史诗', '史诗', '史诗', '史诗');
        case 4:  return T('史诗', '史诗', '史诗', '地狱');
        case 5:  return T('史诗', '史诗', '地狱', '地狱');
        default: return T('史诗', '地狱', '地狱', '地狱');
    }
}

/** 精英固定槽数量（W4/W8/W14；档位按图，沿用 v4 三档）。 */
export function eliteSlots(wave: number, globalChapterId: number): number {
    const slot = wave === 4 ? 0 : wave === 8 ? 1 : wave === 14 ? 2 : -1;
    if (slot < 0) return 0;
    const tiers = [
        [2, 3, 3],   // 图 1~2，合计 8
        [3, 4, 4],   // 图 3~4，合计 11
        [4, 5, 5],   // 图 5~6，合计 14
    ];
    const m = mapOf(globalChapterId);
    const tier = m >= 5 ? 2 : m >= 3 ? 1 : 0;
    return tiers[tier][slot];
}

/** W15 关底：图末章打图鉴大 Boss，前 4 章小首领组合（提案 5.1 通用节奏）。 */
export function finaleFor(globalChapterId: number): FinaleDef {
    const c = chapterInMap(globalChapterId);
    if (c === CHAPTERS_PER_MAP) return { kind: 'boss' };
    const base: MiniBossTier = mapOf(globalChapterId) <= 2 ? '普通' : mapOf(globalChapterId) <= 4 ? '史诗' : '地狱';
    switch (c) {
        case 1:  return { kind: 'mini', tiers: [base] };
        case 2:  return { kind: 'mini', tiers: [base, base] };
        case 3:  return { kind: 'mini', tiers: ['史诗', '地狱'] };
        default: return { kind: 'mini', tiers: ['地狱', '地狱'] };
    }
}

// 固定变异排期（提案 5.3 草案：图 1 全图不上、图末章不上、每图 2~3 章）。
const MUTATION_SCHEDULE: Record<number, string[]> = {
    [globalChapter(2, 3)]: ['iron_skin'],
    [globalChapter(3, 2)]: ['speed_rush'],
    [globalChapter(3, 4)]: ['explosion_cosmos'],
    [globalChapter(4, 2)]: ['time_crack'],
    [globalChapter(4, 3)]: ['chaos_beat'],
    [globalChapter(5, 2)]: ['mirror_army'],
    [globalChapter(5, 4)]: ['doom_collapse'],
    [globalChapter(6, 2)]: ['clone_war'],
    [globalChapter(6, 3)]: ['endless_summon'],
    [globalChapter(6, 4)]: ['full_chaos'],
};

// ── 30 节点表 ────────────────────────────────────────────────

export interface ChapterNode {
    /** 全局章号 1~30（1-based 唯一真源）。 */
    id: number;
    mapId: number;
    /** 图内章号 1~5。 */
    index: number;
    name: string;
    statScale: number;
    countScale: number;
    /** 本章固定变异 id（对应 WaveData.MUTATIONS）。 */
    mutations: string[];
    isMapFinale: boolean;
    quest: QuestDef;
    starter: { draws: number; gold: number };
}

/** 30 个章节节点（曲线 + 排期生成；任务文案为占位骨架，第二批填充）。 */
export const CHAPTER_NODES: ChapterNode[] = [];
for (let m = 1; m <= MAP_COUNT; m++) {
    const map = mapDef(m);
    for (let c = 1; c <= CHAPTERS_PER_MAP; c++) {
        const id = globalChapter(m, c);
        const chapterName = map.chapterNames[c - 1];
        CHAPTER_NODES.push({
            id, mapId: m, index: c, name: chapterName,
            statScale: statScaleFor(id),
            countScale: countScaleFor(id),
            mutations: MUTATION_SCHEDULE[id] ?? [],
            isMapFinale: c === CHAPTERS_PER_MAP,
            quest: {
                title: `${chapterName}的威胁`,
                desc: `肃清${map.name} · ${chapterName}（15 波）`,
                intro: '', outro: '',
                // 占位：首通核心币 20+5×图号；数值随经济校准调整。
                reward: { coreCoins: 20 + 5 * m },
                challenges: [],
            },
            starter: starterPack(id),
        });
    }
}

export function chapterNode(globalChapterId: number): ChapterNode {
    return CHAPTER_NODES[Math.min(TOTAL_CHAPTERS, Math.max(1, globalChapterId)) - 1];
}
