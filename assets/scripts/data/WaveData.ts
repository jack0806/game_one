// ============================================================
//  WaveData.ts — 15 波节奏模板与变异定义（纯数据）
// ============================================================
// 2026-10-09 v5《关卡设计-六图五章.md》：章节/地图结构与 30 节数值曲线
// 迁往 data/LevelIndex.ts（全局章号 1~30 唯一真源）；本文件只保留
// 关内 15 波节奏模板（波型/数量公式）与变异表。
// v4（2026-10-03）遗留的 CHAPTERS/statScale 表/开局战备包/精英槽已上移。

import { countScaleFor } from './LevelIndex';

export { starterPack, eliteSlots } from './LevelIndex';

export interface MutationDef {
    id: string;
    name: string;
    color: string;
    desc: string;
    apply: (game: any) => void;
}

/** 各章固定 15 波（关内波次 1~15，HUD 显示 X/15）。 */
export const WAVES_PER_CHAPTER = 15;

// ── 波型槽位（15 波节奏模板，所有章节共用） ──────────────────

export type WaveKind = 'normal' | 'breather' | 'beast' | 'miniGuard' | 'guard' | 'boss';

/**
 * 关内波次 → 波型：
 * W1~4 普通爬升；W5 小首领①试炼；W6/W11 呼吸波；W8 精英群（波后商店）；
 * W9/W13 兽潮（密度峰）；W10 小首领②关中战；W12 混编高压；W14 守卫波；W15 关底。
 * （v5：图末章 W15 = 图鉴大 Boss，前 4 章 W15 = 小首领关底组合，见 LevelIndex.finaleFor。）
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

/** 同屏/单波小兵总量封顶（v4：96→128；v5 复核见提案 6.4）。 */
export const ENEMY_COUNT_CAP = 128;

/**
 * 关内某波的小兵总量（v4 4.1 公式，章节系数改由 LevelIndex 30 档曲线供给）：
 * round((10 + 2.4×波次) × 波型 × 章节数量 × 难度数量系数)，封顶 128。
 * wave 为关内波次 1~15；globalChapterId 为全局章号 1~30；diffMult 为难度数量倍率
 * （DifficultyDB.countMult，缺省 1 = 普通基准）。
 */
export function enemyCountForWave(wave: number, globalChapterId: number, diffMult = 1): number {
    const base = 10 + 2.4 * wave;
    const kind = WAVE_KIND_MULT[waveKind(wave)];
    const chapter = countScaleFor(globalChapterId);
    return Math.min(Math.round(base * kind * chapter * diffMult), ENEMY_COUNT_CAP);
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
