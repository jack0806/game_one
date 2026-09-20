// ============================================================
//  WaveData.ts — 章节/波次/变异定义（纯数据）
// ============================================================

export interface ChapterDef {
    id: number;
    name: string;
    bgKey: string;
    waves: number;
    bossWave: number;
    enemyScale: number;
    desc: string;
}

export interface MutationDef {
    id: string;
    name: string;
    color: string;
    desc: string;
    apply: (game: any) => void;
}

// 每章改为 5 波小怪 + 1 波 Boss（2026-08-26 玩家要求：boss 波会跟小怪关一样正常刷小怪，
// 全章节节奏统一为 5 波）。bossWave 是全局波次号：5/10/15/20/25。
export const CHAPTERS: ChapterDef[] = [
    { id: 1, name: '废土街道',   bgKey: 'bg_chapter1', waves: 5, bossWave: 5,  enemyScale: 1.0, desc: '废弃的城市废墟，腐肉横行' },
    { id: 2, name: '钢铁工厂',   bgKey: 'bg_chapter2', waves: 5, bossWave: 10, enemyScale: 1.3, desc: '轰鸣的熔炉，钢铁巨兽苏醒' },
    { id: 3, name: '海克斯实验室', bgKey: 'bg_chapter3', waves: 5, bossWave: 15, enemyScale: 1.7, desc: '高能辐射区域，异变体涌现' },
    { id: 4, name: '混沌位面',   bgKey: 'bg_chapter4', waves: 5, bossWave: 20, enemyScale: 2.2, desc: '现实崩塌，终焉之门大开' },
    // 第5章复用第4章背景（暂无新美术）；第5章 Boss=机械高达X-剑（BossDB）
    { id: 5, name: '天罚领域',   bgKey: 'bg_chapter4', waves: 5, bossWave: 25, enemyScale: 2.8, desc: '钢铁巨神镇守天罚之门' },
    // 第6章（2026-09-21 新增）：灭世机神·天罚的最终领域
    { id: 6, name: '终焉天罚',   bgKey: 'bg_chapter4', waves: 5, bossWave: 30, enemyScale: 3.2, desc: '天空撕裂，灭世机神降临' },
];

/**
 * 按全局波次反推 1-based 章节号（波次超出最后一章时钳到最后章节，
 * 无尽模式沿用最后一章敌群与章节显示）。
 */
export function chapterForWave(wave: number): number {
    let acc = 0;
    for (const c of CHAPTERS) {
        acc += c.waves;
        if (wave <= acc) return c.id;
    }
    return CHAPTERS[CHAPTERS.length - 1].id;
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

// 2026-09-07 玩家反馈"怪的密度还是太低"：总量曲线整体上调——
// 起点 4+2/wave/封顶28 → 6+3/wave/封顶48（后期同屏约为旧版两倍）。
// 2026-09-14 玩家要求：从第三章开始（全局波次11起，含无尽沿用章节）怪物数量×2，
// 封顶同步翻倍到 96。
export const ENEMY_COUNT_BY_WAVE = (wave: number, difficulty: 'normal' | 'nightmare' | 'chaos'): number => {
    const base = Math.min(6 + wave * 3, 48);
    const mult = { normal: 1, nightmare: 1.5, chaos: 2 }[difficulty] || 1;
    const chapterMult = chapterForWave(wave) >= 3 ? 2 : 1;
    return Math.floor(base * mult * chapterMult);
};
