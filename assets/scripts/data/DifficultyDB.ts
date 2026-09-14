// ============================================================
//  DifficultyDB.ts — 开局难度定义（纯数据）
// ============================================================
// 流程：存档大厅传送门 → 难度选择 → 英雄选择 → 开战。
// 难度只作用于怪物侧数值：移速与攻击节奏不变，
// 血量/护盾/伤害/护甲/赏金按 statMult 缩放；
// 简单难度额外让 Boss 只保留原本 1/3 的技能（bossSkillCut=3）。
// 测试房间不注入难度，单位数值精确等于表内值。

export type DifficultyId = 'easy' | 'normal' | 'hard' | 'hell';

export interface DifficultyDef {
    id: DifficultyId;
    name: string;
    /** 主题色（hex），难度卡/选人页标签/HUD 共用。 */
    color: string;
    /** 怪物非移速数值倍率（血量/护盾/伤害/护甲/赏金）。 */
    statMult: number;
    /** 难度卡上的两行说明。 */
    desc: string;
    /** Boss 技能保留比例分母（3 = 只保留 1/3 技能），缺省 = 技能完整。 */
    bossSkillCut?: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
    { id: 'easy',   name: '简单', color: '#52d97a', statMult: 0.25, bossSkillCut: 3,
      desc: '怪物数值 ×0.25\nBoss 仅保留 1/3 技能' },
    { id: 'normal', name: '普通', color: '#58c8ff', statMult: 0.5,
      desc: '怪物数值 ×0.5\n技能完整' },
    { id: 'hard',   name: '困难', color: '#ffb347', statMult: 1,
      desc: '怪物数值 ×1.0\n技能完整' },
    { id: 'hell',   name: '地狱', color: '#ff5a5a', statMult: 1.5,
      desc: '怪物数值 ×1.5\n技能完整' },
];

export function getDifficulty(id: DifficultyId): DifficultyDef {
    return DIFFICULTIES.find(d => d.id === id) ?? DIFFICULTIES[2]!;
}
