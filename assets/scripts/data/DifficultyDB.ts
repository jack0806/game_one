// ============================================================
//  DifficultyDB.ts — 开局难度定义（纯数据，难度修饰包唯一数据源）
// ============================================================
// 流程：存档大厅传送门 → 难度选择 → 英雄选择 → 开战。
// 每档难度 = 一套比例系数（2026-10-07 玩家定稿）：
//   statMult  怪物血量/护盾/伤害/护甲（移速与攻击节奏不变）
//   countMult 每波小兵总量（WaveManager.enemyCountForWave 乘区）
//   goldMult  金币掉落乘区（Economy.difficultyGoldMult 转发本表）
// 数量增幅取强度增幅的一半，避免高难度密度爆炸击穿单局时长；
// 金币对齐强度再吃数量加成（总产出 ∝ 数量×单价）。
// 简单难度额外让 Boss 只保留原本 1/3 的技能（bossSkillCut=3）。
// 测试房间不注入难度，单位数值精确等于表值。

export type DifficultyId = 'easy' | 'normal' | 'hard' | 'hell';

export interface DifficultyDef {
    id: DifficultyId;
    name: string;
    /** 主题色（hex），难度卡/选人页标签/HUD 共用。 */
    color: string;
    /** 怪物非移速数值倍率（血量/护盾/伤害/护甲）。 */
    statMult: number;
    /** 每波小兵总量倍率（v4 4.1 数量公式的难度乘区）。 */
    countMult: number;
    /** 金币掉落倍率（独立于 statMult，见 Economy.difficultyGoldMult）。 */
    goldMult: number;
    /** 难度卡上的两行说明。 */
    desc: string;
    /** Boss 技能保留比例分母（3 = 只保留 1/3 技能），缺省 = 技能完整。 */
    bossSkillCut?: number;
}

// 2026-10-03 首调 0.75/1/1.5/1.75 → 2026-10-07 玩家定稿 0.75/1/1.25/1.5，
// 并把数量/金币联动系数挂进同一张表。
export const DIFFICULTIES: DifficultyDef[] = [
    { id: 'easy',   name: '简单', color: '#52d97a', statMult: 0.75, countMult: 0.85, goldMult: 0.9, bossSkillCut: 3,
      desc: '怪物 ×0.75 · 数量 ×0.85\n金币 ×0.9 · Boss 仅 1/3 技能' },
    { id: 'normal', name: '普通', color: '#58c8ff', statMult: 1, countMult: 1, goldMult: 1,
      desc: '怪物与数量基准 ×1\n金币基准 · 技能完整' },
    { id: 'hard',   name: '困难', color: '#ffb347', statMult: 1.25, countMult: 1.1, goldMult: 1.2,
      desc: '怪物 ×1.25 · 数量 ×1.1\n金币 ×1.2 · 技能完整' },
    { id: 'hell',   name: '地狱', color: '#ff5a5a', statMult: 1.5, countMult: 1.2, goldMult: 1.35,
      desc: '怪物 ×1.5 · 数量 ×1.2\n金币 ×1.35 · 技能完整' },
];

export function getDifficulty(id: DifficultyId): DifficultyDef {
    return DIFFICULTIES.find(d => d.id === id) ?? DIFFICULTIES[2]!;
}
