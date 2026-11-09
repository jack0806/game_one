// 掉落、入仓与奖励共用同一身份；显示名和效果始终取正式数据表。
import { BOSS_UNIQUES, CONSUMABLES, MATERIALS } from './DropDB';
import { EQUIP_AFFIXES } from './EquipmentDB';

export type DropCategory = '材料' | '战术道具' | '首领专属' | '装备' | '收藏' | '充能' | '货币' | '战备';
export interface DropVisual {
    id: string;
    name: string;
    desc: string;
    category: DropCategory;
    artKey: string;
    accent: string;
    size: number;
}

const entry = (id: string, name: string, desc: string, category: DropCategory, accent: string, size = 36): DropVisual =>
    ({ id, name, desc, category, artKey: `drop_${id}`, accent, size });

export const DROP_VISUALS: DropVisual[] = [
    ...MATERIALS.map(m => entry(m.id, m.name, m.desc, '材料', '#7fe3ff', m.id === 'mat_star' ? 42 : 34)),
    ...CONSUMABLES.map(c => entry(c.id, c.name, c.desc, c.id === 'amber_bug' ? '收藏' : c.id === 'cloak_shard' ? '充能' : '战术道具',
        c.id === 'amber_bug' ? '#ffd75a' : ['chaos_dice', 'overheat_valve', 'cursed_pouch'].indexOf(c.id) >= 0 ? '#ff997f' : '#c9a6ff', 38)),
    ...BOSS_UNIQUES.map(u => entry(u.id, u.name, u.desc, '首领专属', '#ffcc72', 46)),
    ...EQUIP_AFFIXES.map(e => entry(`equip_${e.id}`, e.label, '跨局装备 · 品质由槽位边框及文字标示', '装备', '#8dd9ff', 42)),
    entry('joker_doll', '玩偶猴', '滑稽猴彩蛋收藏 · 正式局拾取可解锁隐藏成就', '收藏', '#ffd75a', 42),
    entry('core_element', '元素瓶', '下局开局随机元素附武 60 秒', '充能', '#8ee6cf'),
    entry('core_stealth', '暗影斗篷', '下局开局隐身 5 秒', '充能', '#c9a6ff'),
    entry('supply_box', '装备箱', '随机装备 · 品质上限随进度提升', '战备', '#8dd9ff'),
    entry('supply_gold', '战备金库', '下局开局金币 +150', '战备', '#ffd75a'),
    entry('supply_draws', '战备情报', '下局开局海克斯连抽 +3', '战备', '#8dd9ff'),
    entry('supply_shield', '战备护盾', '下局开局护盾 +60', '战备', '#8dd9ff'),
    entry('shop_heal', '急救包', '波间补给 · 恢复 40 HP', '战备', '#8ee6cf'),
    entry('shop_maxhp', '生命强化', '波间补给 · 永久增加 20 最大 HP', '战备', '#ff9d9d'),
    entry('shop_shield', '护盾强化', '波间补给 · 增加 20 护盾上限', '战备', '#8dd9ff'),
    entry('shop_speed', '移速芯片', '波间补给 · 移速 +10%', '战备', '#8dd9ff'),
    entry('shop_damage', '伤害晶核', '波间补给 · 伤害 +15%', '战备', '#ffcc72'),
    entry('shop_augment', '神秘强化', '波间补给 · 随机选一张强化卡', '战备', '#c9a6ff'),
    { ...entry('gold', '金币', '局内获取与消费；局末剩余金币兑换核心币', '货币', '#ffd75a', 28), artKey: 'ui_gold_coin' },
    { ...entry('core_coin', '核心币', '局外货币 · 仓库、军需商店与兑换台使用', '货币', '#cf9dff', 32), artKey: 'ui_core_coin' },
];

/** 充能沿用原物身份，避免同一件物品入库后换图。 */
export const DROP_VISUAL_ALIASES: Record<string, string> = {
    core_revive: 'unsc_badge', core_refresh: 'core_infinity', core_prism: 'abyss_prism', core_reforge: 'forge_core',
};
const byId = new Map(DROP_VISUALS.map(v => [v.id, v]));

export function dropVisual(kindOrId: string): DropVisual | undefined {
    const id = kindOrId.replace(/^(mat|use|relic):/, '');
    return byId.get(DROP_VISUAL_ALIASES[id] ?? id);
}

export const DROP_ART_KEYS = DROP_VISUALS.map(v => v.artKey);

/** 旧九格入口转向独立高清图；高频刃必须使用 equip_haste，不借用第零格。 */
export const DEPOT_TILE_DROP_IDS = ['equip_dmg', 'equip_hp', 'equip_crit', 'equip_spd', 'equip_greed',
    'supply_box', 'supply_gold', 'supply_draws', 'supply_shield', 'equip_haste'];

export function recipeVisualId(recipeId: string): string {
    return ({ r_forge: 'supply_box', r_reforge: 'core_reforge', r_element: 'core_element', r_arsenal: 'supply_box',
        r_chaos: 'core_prism', r_tribute: 'core_coin', r_star: 'mat_star', r_sellall: 'core_coin' })[recipeId] ?? 'supply_box';
}
