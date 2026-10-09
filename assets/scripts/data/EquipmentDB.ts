// ============================================================
//  EquipmentDB.ts — 装备体系（跨局掉落物，2026-10-03 v4 第 10 节）
// ============================================================
// 定位：唯一跨局的战斗掉落物。金币与海克斯词条均局内；装备只做纯属性
// 加成、不给新技能（新能力 100% 来自海克斯技能卡）。3 个装备格，大厅配装
// 带入对局。品质按图（v5）：图 1 普通 / 图 2~3 稀有 / 图 4~6 史诗。
// 局内卖出：普通 80 / 稀有 200 / 史诗 450 金（卖出 = 永久失去）。

import { mapOf } from './LevelIndex';

export interface EquipAffixDef {
    id: string;
    label: string;
    /** 玩家 stats 上的字段名（百分比词缀乘算 / 数值词缀直加）。 */
    stat: string;
    /** 普通/稀有/史诗三档数值。 */
    values: [number, number, number];
    /** 数值型词缀（非百分比）直加到 stats。 */
    flat?: boolean;
}

export const EQUIP_AFFIXES: EquipAffixDef[] = [
    { id: 'hp',    label: '强化装甲', stat: 'maxHpPct',    values: [0.04, 0.08, 0.12] },
    { id: 'dmg',   label: '火力核心', stat: 'dmgPct',      values: [0.03, 0.06, 0.10] },
    { id: 'spd',   label: '推进器',   stat: 'speedPct',    values: [0.03, 0.06, 0.09] },
    { id: 'crit',  label: '瞄准镜',   stat: 'critRate',    values: [0.02, 0.04, 0.06], flat: true },
    { id: 'greed', label: '吸金器',   stat: 'goldPickupRange', values: [15, 30, 50], flat: true },
];

export const EQUIP_QUALITY_LABEL = ['普通', '稀有', '史诗'];

/** 品质上限按图（0=普通 1=稀有 2=史诗；v5 提案 6.3：图 1 普通、图 2~3 稀有、图 4~6 史诗）。 */
export function qualityCapForChapter(globalChapterId: number): number {
    const mapId = mapOf(globalChapterId);
    return mapId >= 4 ? 2 : mapId >= 2 ? 1 : 0;
}

/** 局内卖出价（v4 9.7）。 */
export function equipmentSellValue(quality: number): number {
    return [80, 200, 450][Math.max(0, Math.min(2, quality))] ?? 80;
}

/** 装备实例（存档持久化；uid 由调用方生成保证唯一）。 */
export interface Equipment {
    uid: string;
    affix: string;
    quality: number;
}

let _uidSeq = 0;
export function newEquipmentUid(): string {
    return `eq_${Date.now().toString(36)}_${(_uidSeq++).toString(36)}`;
}

/**
 * Boss 掉落掷取（防刷去重：未拥有的 affix×quality 组合优先，全部拥有后
 * 返回 null —— 调用方改掉核心币包）。品质在章节上限内随机。
 */
export function rollEquipmentDrop(
    chapterId: number,
    ownedKeys: Set<string>,
    rand: () => number = Math.random,
): Equipment | null {
    const cap = qualityCapForChapter(chapterId);
    const candidates: Equipment[] = [];
    for (const affix of EQUIP_AFFIXES) {
        for (let q = 0; q <= cap; q++) {
            const key = `${affix.id}:${q}`;
            if (ownedKeys.has(key)) continue;
            candidates.push({ uid: '', affix: affix.id, quality: q });
        }
    }
    if (!candidates.length) return null;
    const pick = candidates[Math.min(candidates.length - 1, Math.floor(rand() * candidates.length))];
    pick.uid = newEquipmentUid();
    return pick;
}

/** 装备的唯一键（去重表用）。 */
export function equipmentKey(e: Equipment): string {
    return `${e.affix}:${e.quality}`;
}

/** 装备显示名。 */
export function equipmentLabel(e: Equipment): string {
    const affix = EQUIP_AFFIXES.find(a => a.id === e.affix) ?? EQUIP_AFFIXES[0];
    return `${EQUIP_QUALITY_LABEL[e.quality] ?? '普通'}·${affix.label}`;
}

/** 装备的属性数值（按品质档）。 */
export function equipmentValue(e: Equipment): number {
    const affix = EQUIP_AFFIXES.find(a => a.id === e.affix) ?? EQUIP_AFFIXES[0];
    return affix.values[Math.max(0, Math.min(2, e.quality))];
}

/**
 * 把一件装备的加成应用到玩家 stats（带入对局时调用，player.init 之后）。
 * 百分比词缀直接乘到现有字段（PlayerController 无 Pct 通道）；maxHp 乘算后
 * 由调用方同步 hp。
 */
export function applyEquipmentToStats(e: Equipment, stats: any): void {
    const affix = EQUIP_AFFIXES.find(a => a.id === e.affix);
    if (!affix) return;
    const v = equipmentValue(e);
    switch (e.affix) {
        case 'hp':   stats.maxHp   = Math.round((stats.maxHp ?? 100) * (1 + v)); break;
        case 'dmg':  stats.damage  = (stats.damage ?? 10) * (1 + v); break;
        case 'spd':  stats.speed   = (stats.speed ?? 300) * (1 + v); break;
        case 'crit': stats.critRate = (stats.critRate ?? 0) + v; break;
        case 'greed': stats.goldPickupRange = (stats.goldPickupRange ?? 60) + v; break;
    }
}
