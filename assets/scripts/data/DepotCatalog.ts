// 军需终端的展示数据；价格、加成仍与既有存档规则一致。
import { Equipment, EQUIP_AFFIXES, equipmentValue, qualityCapForChapter } from './EquipmentDB';

export interface DepotProduct {
    id: 'box' | 'gold' | 'draws' | 'shield';
    name: string;
    price: number;
    tile: number;
    benefit: string;
    description: string;
}

export const DEPOT_PRODUCTS: DepotProduct[] = [
    { id: 'box', name: '装备箱', price: 60, tile: 5, benefit: '随机获得一件未拥有装备', description: '品质上限随通关进度提升\n永久入仓，可在装备库配装' },
    { id: 'gold', name: '战备金库', price: 25, tile: 6, benefit: '开局金币 +150', description: '下一局开局生效\n可重复购买，叠加生效' },
    { id: 'draws', name: '战备情报', price: 40, tile: 7, benefit: '海克斯三选一连抽 +3', description: '下一局开局生效\n可重复购买，叠加生效' },
    { id: 'shield', name: '战备护盾', price: 30, tile: 8, benefit: '开局护盾 +60', description: '下一局开局生效\n可重复购买，叠加生效' },
];

export const DEPOT_ART_KEYS = ['ui_depot_background', 'ui_depot_items'];
export const EQUIPMENT_TILES: Record<string, number> = { dmg: 0, hp: 1, crit: 2, spd: 3, greed: 4 };
const STAT_LABELS: Record<string, string> = { dmg: '伤害', hp: '生命', crit: '暴击率', spd: '移速', greed: '拾取范围' };

export function depotEquipmentName(e: Equipment): string {
    return EQUIP_AFFIXES.find(a => a.id === e.affix)?.label ?? '未知装备';
}

export function depotEquipmentStat(e: Equipment): string {
    const value = equipmentValue(e);
    return `${STAT_LABELS[e.affix] ?? '加成'} +${e.affix === 'greed' ? value : Math.round(value * 100) + '%'}`;
}

/** 不生成掉落、不消耗随机数；只根据可解锁品质判断箱子是否还有货。 */
export function depotBoxAvailable(items: Equipment[], chapter: number): boolean {
    const cap = qualityCapForChapter(chapter);
    const owned = new Set(items.map(e => `${e.affix}:${e.quality}`));
    return EQUIP_AFFIXES.some(a => Array.from({ length: cap + 1 }, (_, q) => q).some(q => !owned.has(`${a.id}:${q}`)));
}

/** 先品质后种类，保留 uid 作为稳定排序，不修改存档中的原始顺序。 */
export function depotInventory(items: Equipment[], quality = -1): Equipment[] {
    return items.filter(e => quality < 0 || e.quality === quality).slice().sort((a, b) =>
        b.quality - a.quality || (EQUIPMENT_TILES[a.affix] ?? 9) - (EQUIPMENT_TILES[b.affix] ?? 9) || a.uid.localeCompare(b.uid));
}
