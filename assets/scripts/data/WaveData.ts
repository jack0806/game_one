// ============================================================
//  WaveData.ts — 章节/波次/变异定义（纯数据）
// ============================================================
// 2026-10-03 v4《关卡设计-15波.md》：一局一章 × 15 波。
// - 章节解耦：一局只打选定的章，Boss 波恒为关内 W15；
//   全局波次号 / chapterForWave / bossWave 全部退役。
// - 数量与数值分离：countScale 管每波小兵量，statScale 管血量/伤害。

export interface ChapterDef {
    id: number;
    name: string;
    bgKey: string;
    waves: number;
    /** 章节血量/伤害系数（小兵与小首领共用；Boss 沿用 BossDB 现表不吃此项）。 */
    statScale: number;
    /** 章节数量系数（每波小兵总量）。 */
    countScale: number;
    desc: string;
}

export interface MutationDef {
    id: string;
    name: string;
    color: string;
    desc: string;
    apply: (game: any) => void;
}

/** 各章固定 15 波（关内波次 1~15，HUD 显示 X/15）。 */
export const WAVES_PER_CHAPTER = 15;

export const CHAPTERS: ChapterDef[] = [
    { id: 1, name: '废土街道',   bgKey: 'bg_chapter1', waves: 15, statScale: 1.0,  countScale: 1.0, desc: '废弃的城市废墟，腐肉横行' },
    { id: 2, name: '钢铁工厂',   bgKey: 'bg_chapter2', waves: 15, statScale: 1.2,  countScale: 1.2, desc: '轰鸣的熔炉，钢铁巨兽苏醒' },
    { id: 3, name: '海克斯实验室', bgKey: 'bg_chapter3', waves: 15, statScale: 1.45, countScale: 1.4, desc: '高能辐射区域，异变体涌现' },
    { id: 4, name: '混沌位面',   bgKey: 'bg_chapter4', waves: 15, statScale: 1.7,  countScale: 1.6, desc: '现实崩塌，终焉之门大开' },
    // 第5章使用独立的天罚领域背景；第5章 Boss=机械高达X-剑（BossDB）。
    { id: 5, name: '天罚领域',   bgKey: 'bg_chapter5', waves: 15, statScale: 2.0,  countScale: 1.8, desc: '钢铁巨神镇守天罚之门' },
    // 第6章：灭世机神·天罚的最终领域。
    { id: 6, name: '终焉天罚',   bgKey: 'bg_chapter6', waves: 15, statScale: 2.3,  countScale: 2.0, desc: '天空撕裂，灭世机神降临' },
];

export function chapterDef(id: number): ChapterDef {
    return CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, id - 1))];
}

// ── 波型槽位（15 波节奏模板，所有章节共用） ──────────────────

export type WaveKind = 'normal' | 'breather' | 'beast' | 'miniGuard' | 'guard' | 'boss';

/**
 * 关内波次 → 波型：
 * W1~4 普通爬升；W5 小首领①试炼；W6/W11 呼吸波；W8 精英群（波后商店）；
 * W9/W13 兽潮（密度峰）；W10 小首领②关中战；W12 混编高压；W14 守卫波；W15 大 Boss。
 */
export function waveKind(wave: number): WaveKind {
    if (wave === 15) return 'boss';
    if (wave === 9 || wave === 13) return 'beast';
    if (wave === 6 || wave === 11) return 'breather';
    if (wave === 5 || wave === 10) return 'miniGuard';
    if (wave === 14) return 'guard';
    return 'normal';
}

/** 波型数量系数：普通 1.0；兽潮 ×1.45；呼吸 ×0.7；小首领护卫/守卫 ×0.85；Boss 波小兵 ×0.8。 */
export const WAVE_KIND_MULT: Record<WaveKind, number> = {
    normal: 1.0,
    breather: 0.7,
    beast: 1.45,
    miniGuard: 0.85,
    guard: 0.85,
    boss: 0.8,
};

/** 同屏/单波小兵总量封顶（v4：96→128，第 6 章 W13 ≈ 120 只需要）。 */
export const ENEMY_COUNT_CAP = 128;

/**
 * 关内某波的小兵总量（v4 4.1 公式）：
 * round((10 + 2.4×波次) × 波型 × 章节数量 × 难度数量系数)，封顶 128。
 * wave 为关内波次 1~15；chapterId 1~6；diffMult 为难度数量倍率
 * （DifficultyDB.countMult，2026-10-07 起：0.85/1/1.1/1.2；缺省 1 = 普通基准）。
 */
export function enemyCountForWave(wave: number, chapterId: number, diffMult = 1): number {
    const base = 10 + 2.4 * wave;
    const kind = WAVE_KIND_MULT[waveKind(wave)];
    const chapter = chapterDef(chapterId).countScale;
    return Math.min(Math.round(base * kind * chapter * diffMult), ENEMY_COUNT_CAP);
}

// ── 开局战备包（第 2 章起的成长补偿，v4 2.3） ─────────────────

/** 各章开局三选一连抽次数（第 1 章 0 次）。 */
export const STARTER_PACK_DRAWS = [0, 2, 4, 6, 8, 10];
/** 各章开局起始金币。 */
export const STARTER_PACK_GOLD  = [0, 100, 220, 360, 520, 700];

export function starterPack(chapterId: number): { draws: number; gold: number } {
    const i = Math.max(0, Math.min(STARTER_PACK_DRAWS.length - 1, chapterId - 1));
    return { draws: STARTER_PACK_DRAWS[i], gold: STARTER_PACK_GOLD[i] };
}

// ── 精英固定槽（v4 7.1：W4/W8/W14，随章爬升） ─────────────────

export function eliteSlots(wave: number, chapterId: number): number {
    const slot = wave === 4 ? 0 : wave === 8 ? 1 : wave === 14 ? 2 : -1;
    if (slot < 0) return 0;
    const tiers = [
        [2, 3, 3],   // 第 1~2 章：W4=2 / W8=3 / W14=3，合计 8
        [3, 4, 4],   // 第 3~4 章：合计 11
        [4, 5, 5],   // 第 5~6 章：合计 14
    ];
    const tier = chapterId >= 5 ? 2 : chapterId >= 3 ? 1 : 0;
    return tiers[tier][slot];
}

export const MUTATIONS: MutationDef[] = [
    { id: 'iron_skin',       name: '铁甲洪潮',   color: '#888',    desc: '所有敌人护甲+100',
      apply(game) { game._mutationMods.armor = (game._mutationMods.armor || 0) + 100; } },

    { id: 'speed_rush',      name: '疾速冲锋',   color: '#ffaa00', desc: '所有敌人移速×1.5',
      apply(game) { game._mutationMods.speedMult = (game._mutationMods.speedMult || 1) * 1.5; } },

    { id: 'clone_war',       name: '分身之战',   color: '#cc44ff', desc: '每波额外生成2倍普通敌人',
      apply(game) { game._mutationMods.cloneWar = true; } },

    { id: 'explosion_cosmos', name: '爆炸宇宙',  color: '#ff6600', desc: '所有敌人死亡时爆炸',
      apply(game) { game._mutationMods.deathExplode = true; } },

    { id: 'chaos_beat',      name: '混沌节拍',   color: '#ff00ff', desc: '每5秒随机buff一批敌人',
      apply(game) { game._mutationMods.chaosBeat = true; } },

    { id: 'time_crack',      name: '时间裂缝',   color: '#aaddff', desc: '敌人攻速+50%，移速+30%',
      apply(game) { game._mutationMods.timeCrack = true; } },

    { id: 'mirror_army',     name: '镜像军队',   color: '#ffffff', desc: '每波 Boss型敌人数量×2',
      apply(game) { game._mutationMods.mirrorArmy = true; } },

    { id: 'endless_summon',  name: '无尽召唤',   color: '#ff4444', desc: '击杀敌人时有30%概率原地复活',
      apply(game) { game._mutationMods.endlessSummon = true; } },

    { id: 'doom_collapse',   name: '毁灭坍缩',   color: '#440044', desc: '所有敌人HP×3，但掉落金币×5',
      apply(game) { game._mutationMods.hpMult = (game._mutationMods.hpMult || 1) * 3; game._mutationMods.goldMult = (game._mutationMods.goldMult || 1) * 5; } },

    { id: 'full_chaos',      name: '全面混沌',   color: '#ff0000', desc: '同时激活前三个变异效果',
      apply(game) {
          game._mutationMods.armor     = (game._mutationMods.armor || 0) + 50;
          game._mutationMods.speedMult = (game._mutationMods.speedMult || 1) * 1.3;
          game._mutationMods.cloneWar  = true;
      } },
];
