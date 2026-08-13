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

export const CHAPTERS: ChapterDef[] = [
    { id: 1, name: '废土街道',   bgKey: 'bg_chapter1', waves: 10, bossWave: 10, enemyScale: 1.0, desc: '废弃的城市废墟，腐肉横行' },
    { id: 2, name: '钢铁工厂',   bgKey: 'bg_chapter2', waves: 10, bossWave: 20, enemyScale: 1.3, desc: '轰鸣的熔炉，钢铁巨兽苏醒' },
    { id: 3, name: '海克斯实验室', bgKey: 'bg_chapter3', waves: 10, bossWave: 30, enemyScale: 1.7, desc: '高能辐射区域，异变体涌现' },
    { id: 4, name: '混沌位面',   bgKey: 'bg_chapter4', waves: 10, bossWave: 40, enemyScale: 2.2, desc: '现实崩塌，终焉之门大开' },
];

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

export const ENEMY_COUNT_BY_WAVE = (wave: number, difficulty: 'normal' | 'nightmare' | 'chaos'): number => {
    const base = Math.min(4 + wave * 2, 28);
    const mult = { normal: 1, nightmare: 1.5, chaos: 2 }[difficulty] || 1;
    return Math.floor(base * mult);
};
