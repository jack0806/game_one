// ============================================================
//  DropDB.ts — 掉落物 v3 数据表与纯逻辑（两币制版）
// ============================================================
// 规格：docs/掉落物清单v3.xlsx。data 层只放静态数据与无副作用函数，
// 不依赖 systems/entities（分层规则同 BossDB/EquipmentDB）。
// 掉落链路：EnemyBase._die 掷取 → Economy.spawnDrop(kind) 世界掉落 →
// 拾取回调入档/生效（GameManager.onMaterialPicked / onConsumablePicked 等）。

import { mapOf } from './LevelIndex';

// ── 局末结算：剩余金币 → 核心币（200:1，不足 1 枚按 1 枚） ─────
export function settleGoldToCoreCoins(gold: number, rate = 200, minCoin = 1): number {
    if (gold <= 0) return 0;
    return Math.max(minCoin, Math.floor(gold / rate));
}

// ── 图末大 Boss 专属掉落（每家 2~3 件，共 16 件） ──────────────
export type BossUniqueKind = 'consumable' | 'passive' | 'trophy';

export interface BossUniqueDef {
    /** 唯一 id；消耗型专属的充能材料同名入 materials。 */
    id: string;
    /** 所属 Boss 显式 id（BossDB BOSSES.id：ch1~ch6）。 */
    bossId: string;
    name: string;
    kind: BossUniqueKind;
    desc: string;
    /** 消耗型专属的充能材料 key（pickup 时写入 materials 计数）。 */
    charge?: string;
}

export const BOSS_UNIQUES: BossUniqueDef[] = [
    // 图1 废土领主·腐肉（3）
    { id: 'unsc_badge',  bossId: 'ch1', name: '不屈徽记',   kind: 'consumable', desc: '下局首次阵亡时以 30% 生命原地复活', charge: 'core_revive' },
    { id: 'unsc_totem',  bossId: 'ch1', name: '掠夺者图腾', kind: 'passive',    desc: '永久：小兵金币掉落 +5%' },
    { id: 'unsc_throne', bossId: 'ch1', name: '腐肉王座',   kind: 'trophy',     desc: '六王座之一 · 集齐解锁「六王座陈列柜」' },
    // 图2 钢铁之王·熔炉（3）
    { id: 'forge_core',  bossId: 'ch2', name: '熔火核心',   kind: 'consumable', desc: '仓库内重铸 1 件装备的词缀（品质保留）', charge: 'core_reforge' },
    { id: 'forge_plate', bossId: 'ch2', name: '装配线铭牌', kind: 'passive',    desc: '永久：装备卖出价 +20%' },
    { id: 'forge_throne',bossId: 'ch2', name: '熔炉王座',   kind: 'trophy',     desc: '六王座之二' },
    // 图3 海克斯异变体·无限核（2）
    { id: 'core_infinity', bossId: 'ch3', name: '无限核',     kind: 'consumable', desc: '下局海克斯商店 3 次免费刷新', charge: 'core_refresh' },
    { id: 'core_atlas',    bossId: 'ch3', name: '变异图谱',   kind: 'passive',   desc: '永久：金色海克斯出现率 +3%' },
    // 图4 混沌深渊·终焉之门（3）
    { id: 'abyss_prism', bossId: 'ch4', name: '混沌棱镜',   kind: 'consumable', desc: '下局商店首次开页必含 1 张彩色卡', charge: 'core_prism' },
    { id: 'abyss_eye',   bossId: 'ch4', name: '深渊之瞳',   kind: 'passive',    desc: '永久：精英击杀的材料掉率 +10%' },
    { id: 'abyss_throne',bossId: 'ch4', name: '深渊王座',   kind: 'trophy',     desc: '六王座之三' },
    // 图5 机械高达X-剑（2）
    { id: 'xblade_mod',   bossId: 'ch5', name: 'X-剑刃模组', kind: 'passive',  desc: '永久：解锁装备第 6 词缀「高频刃」' },
    { id: 'xblade_key',   bossId: 'ch5', name: '军械库钥匙', kind: 'passive',  desc: '永久：军需商店装备箱价格 -20%' },
    // 图6 灭世机神·天罚（3）
    { id: 'judge_core',  bossId: 'ch6', name: '天罚核心',   kind: 'passive',    desc: '永久：每局开局 +50 金币' },
    { id: 'judge_plate', bossId: 'ch6', name: '天罚装甲板', kind: 'passive',    desc: '永久：每局开局护盾 +15' },
    { id: 'judge_throne',bossId: 'ch6', name: '天罚王座',   kind: 'trophy',     desc: '六王座之四（图3/5 无王座时陈列柜按持有件展示）' },
];

export function bossUniquesOf(bossId: string): BossUniqueDef[] {
    return BOSS_UNIQUES.filter(u => u.bossId === bossId);
}

export interface BossUniqueRoll {
    /** 命中的专属（null=未掉落或已全拥有）。 */
    def: BossUniqueDef | null;
    /** 回写档案的软保底计数（连续未掉次数）。 */
    nextPity: number;
    /** 已全拥有转保底包（材料×2 + 核心币×40）。 */
    fallback: boolean;
}

/**
 * Boss 专属掉落判定：25% 掷中 → 从该 Boss「未拥有的专属」中随机 1 件；
 * 全拥有 → fallback 保底包。软保底：连续 pityMax-1 次未掉则第 pityMax 次必掉。
 */
export function rollBossUnique(
    bossId: string,
    ownedIds: Set<string>,
    pity: number,
    chance: number,
    pityMax: number,
    rand: () => number,
): BossUniqueRoll {
    const pool = bossUniquesOf(bossId).filter(u => !ownedIds.has(u.id));
    if (!pool.length) return { def: null, nextPity: pity, fallback: true };
    const must = pity + 1 >= pityMax;
    if (must || rand() < chance) {
        return { def: pool[Math.floor(rand() * pool.length)], nextPity: 0, fallback: false };
    }
    return { def: null, nextPity: pity + 1, fallback: false };
}

// ── 材料体系（15 种：6 图域 + 4 通用零件 + 陨星 + 资源/收藏） ──
export interface MaterialDef {
    id: string;
    name: string;
    /** 入仓库出售价（核心币）；0=不可售（即时消耗类不入库）。 */
    sell: number;
    desc: string;
}

export const MATERIALS: MaterialDef[] = [
    { id: 'mat_waste', name: '废土残钢', sell: 5, desc: '图域材料 · 图1（兑换/出售）' },
    { id: 'mat_gear',  name: '精密齿轮', sell: 5, desc: '图域材料 · 图2' },
    { id: 'mat_flesh', name: '异变组织', sell: 5, desc: '图域材料 · 图3' },
    { id: 'mat_chaos', name: '混沌尘晶', sell: 5, desc: '图域材料 · 图4' },
    { id: 'mat_alloy', name: '军械合金', sell: 5, desc: '图域材料 · 图5' },
    { id: 'mat_ember', name: '天罚余烬', sell: 5, desc: '图域材料 · 图6' },
    { id: 'part_mech',  name: '机械零件', sell: 4, desc: '通用零件 · 机械系怪定向' },
    { id: 'part_bio',   name: '生物质',   sell: 4, desc: '通用零件 · 咒仆/水母/寄生系定向' },
    { id: 'part_elem',  name: '元素结晶', sell: 4, desc: '通用零件 · 焚芯/冻脉/酸囊/闪弧定向' },
    { id: 'part_psyon', name: '异能粉尘', sell: 4, desc: '通用零件 · 远程射手系定向' },
    { id: 'mat_star',   name: '陨星碎片', sell: 25, desc: '稀有材料 · 任意怪 0.2%（星陨锻造主材）' },
    { id: 'elite_mark', name: '精英徽记', sell: 10, desc: '材料 · 3 枚 = 1 张重铸（仓库兑换）' },
];

/** 图号(1~6) → 图域材料 id。 */
export const MAP_MATERIAL_IDS = ['mat_waste', 'mat_gear', 'mat_flesh', 'mat_chaos', 'mat_alloy', 'mat_ember'];

/** 定向通用零件：怪物类型 → 零件 id。 */
export const PART_BY_TYPE: Record<string, string> = {
    // 机械系：无人机 / 炮台 / 机械与铆甲
    drone_a: 'part_mech', drone_s: 'part_mech', rivet_beast: 'part_mech',
    // 生物系：咒仆 / 水母 / 寄生体
    ember_acolyte: 'part_bio', frost_acolyte: 'part_bio', jelly: 'part_bio', arc_leech: 'part_bio',
    // 元素系：焚芯 / 冻脉 / 酸囊 / 闪弧
    acid_sac: 'part_elem',
    // 远程射手系
    needle_gunner: 'part_psyon', archer: 'part_psyon',
};
// 元素系与生物系在焚芯/冻脉/闪弧上重叠：按"元素优先"补充（酸囊已列元素）。
PART_BY_TYPE.ember_acolyte = 'part_elem';
PART_BY_TYPE.frost_acolyte = 'part_elem';
PART_BY_TYPE.arc_leech = 'part_elem';

export function consumableDef(id: string): ConsumableDef | undefined {
    return CONSUMABLES.find(c => c.id === id);
}

export function materialDef(id: string): MaterialDef | undefined {
    return MATERIALS.find(m => m.id === id);
}

export type DropTier = 'grunt' | 'elite' | 'miniboss' | 'boss';

/**
 * 材料掉落判定（一次击杀最多 1 件）：
 * ①陨星碎片 0.2%（任意怪）→ ②图域材料（按图，档位掉率）→
 * ③定向零件（按怪物类型，4%~5%）→ ④精英徽记（仅精英 8%）。
 */
export function rollMaterialFor(
    tier: DropTier,
    mapId: number,
    type: string,
    opts: { eliteBonus?: number; luckMult?: number; rand: () => number },
): string | null {
    const luck = opts.luckMult ?? 1;
    const rand = opts.rand;
    // ①陨星碎片：任意怪 0.2%（不吃精英加成，吃幸运）
    if (rand() < 0.002 * luck) return 'mat_star';
    // ②图域材料：小兵 3% / 精英 20% / 小Boss 35%
    const mapRate = tier === 'grunt' ? 0.03 : tier === 'elite' ? 0.20 : tier === 'miniboss' ? 0.35 : 0;
    if (mapRate > 0 && rand() < mapRate * luck) {
        return MAP_MATERIAL_IDS[Math.min(5, Math.max(0, mapId - 1))];
    }
    // ③定向零件：按类型 4%~5%
    const part = PART_BY_TYPE[type];
    if (part && rand() < 0.05 * luck) return part;
    // ④精英徽记：仅精英 8%（深渊之瞳被动 +10% 相对加成）
    if (tier === 'elite' && rand() < 0.08 * luck * (1 + (opts.eliteBonus ?? 0))) return 'elite_mark';
    return null;
}

// ── 局内道具（34 条：小Boss 11 + 炮灰/精英 23） ────────────────
export type ConsumableEffect =
    | 'shield' | 'heal' | 'dmgUp' | 'atkSpdUp' | 'speedUp' | 'armorUp'
    | 'strongSlowHit' | 'slowHit' | 'acidHit' | 'poisonHit' | 'killSplash'
    | 'wingman' | 'repair' | 'pull' | 'reflect' | 'skillRune' | 'guaranteedCrit'
    | 'massStun' | 'interceptGold' | 'blastImmune' | 'chainLightning'
    | 'collideImmune' | 'riskAtkSpd' | 'freezeBurst' | 'decoy' | 'bombShot'
    | 'powerShot' | 'resetCd' | 'dice' | 'luckUp' | 'goldBag' | 'cursedGold'
    | 'cloakShard' | 'turret';

export interface ConsumableDef {
    id: string;
    name: string;
    /** 掉落来源：tier=grunt|elite|miniboss|any；types 限定怪物类型。 */
    tier: DropTier | 'any';
    types?: string[];
    rate: number;
    effect: ConsumableEffect;
    /** 效果参数（护盾量/治疗比例/时长等）。 */
    value?: number;
    desc: string;
}

export const CONSUMABLES: ConsumableDef[] = [
    // ── 小 Boss 战术道具（11） ──
    { id: 'ink_sac', name: '墨汁囊',      tier: 'miniboss', types: ['squid'],    rate: 0.20, effect: 'massStun',    value: 3,    desc: '3 秒内周围敌人丢失攻击目标' },
    { id: 'turtle_shell', name: '龟甲片', tier: 'miniboss', types: ['turtle'],   rate: 0.20, effect: 'shield',     value: 30,   desc: '立即获得 30 点护盾' },
    { id: 'shrimp_blade', name: '剑虾之刃', tier: 'miniboss', types: ['shrimp'],   rate: 0.15, effect: 'dmgUp',      value: 60,   desc: '60 秒攻击伤害 +15%' },
    { id: 'jelly_sting', name: '麻痹毒刺',  tier: 'miniboss', types: ['jelly'],    rate: 0.20, effect: 'strongSlowHit', value: 3, desc: '3 秒内攻击附带强减速（-60%）' },
    { id: 'drone_chip', name: '无人机芯片',   tier: 'miniboss', types: ['drone_a'],  rate: 0.15, effect: 'wingman',    value: 20,   desc: '僚机协同射击 20 秒（50% 攻击）' },
    { id: 'repair_mod', name: '修复模块',   tier: 'miniboss', types: ['drone_s'],  rate: 0.20, effect: 'heal',       value: 0.20, desc: '立即回复 20% 生命' },
    { id: 'hound_chain', name: '猎犬铆链',  tier: 'miniboss', types: ['chain_hound'], rate: 0.15, effect: 'pull',    value: 0.5,  desc: '拉近最近精英/Boss 并眩晕 0.5 秒' },
    { id: 'prism_shell', name: '澜镜棱壳',  tier: 'miniboss', types: ['prism_snail'], rate: 0.15, effect: 'reflect', value: 5,    desc: '5 秒内反弹敌方弹幕' },
    { id: 'triune_rune', name: '三相符文',  tier: 'miniboss', types: ['triune_priest'], rate: 0.15, effect: 'skillRune', value: 60, desc: '60 秒 Q/E/R 随机一项冷却 -20%' },
    { id: 'zero_trigger', name: '零扳机', tier: 'miniboss', types: ['rail_butcher'], rate: 0.15, effect: 'guaranteedCrit', value: 3, desc: '接下来 3 发子弹必定暴击' },
    { id: 'knell_tongue', name: '葬钟钟舌', tier: 'miniboss', types: ['bell_devourer'], rate: 0.15, effect: 'massStun', value: 1.5, desc: '全场小兵眩晕 1.5 秒（Boss 免疫）' },
    // ── 炮灰 / 精英（23） ──
    { id: 'amber_bug', name: '金虫琥珀',    tier: 'grunt', types: ['gold_scavenger'], rate: 0.10, effect: 'interceptGold', value: 6, desc: '收藏 + 本次截获金币翻倍' },
    { id: 'dud_fuse', name: '哑火引信',     tier: 'grunt', types: ['blast_tick'], rate: 0.05, effect: 'blastImmune', value: 0, desc: '本局免疫爆炸伤害（被自爆命中未死并反杀时掉落）' },
    { id: 'acid_vial', name: '浓缩酸囊',    tier: 'grunt', types: ['acid_sac'],   rate: 0.05, effect: 'acidHit',     value: 60,  desc: '60 秒攻击附带酸蚀 DoT' },
    { id: 'ember_ash', name: '焚芯余烬',    tier: 'grunt', types: ['ember_acolyte'], rate: 0.04, effect: 'killSplash', value: 60, desc: '60 秒击杀产生小范围溅射' },
    { id: 'frost_crystal', name: '冻脉冰晶',tier: 'grunt', types: ['frost_acolyte'], rate: 0.04, effect: 'slowHit',   value: 60,  desc: '60 秒攻击附带减速 20%' },
    { id: 'arc_cap', name: '闪弧电容器',      tier: 'grunt', types: ['arc_leech'],  rate: 0.05, effect: 'chainLightning', value: 3, desc: '下次攻击触发 3 连锁闪电' },
    { id: 'needle_mag', name: '断针弹匣',   tier: 'grunt', types: ['needle_gunner'], rate: 0.03, effect: 'atkSpdUp', value: 60, desc: '60 秒攻速 +10%' },
    { id: 'stone_heart', name: '石心',  tier: 'grunt', types: ['golem'],      rate: 0.03, effect: 'armorUp',    value: 60,  desc: '60 秒护甲 +15' },
    { id: 'poison_quiver', name: '毒箭囊',tier: 'grunt', types: ['archer'],     rate: 0.03, effect: 'poisonHit',  value: 60,  desc: '60 秒攻击附带中毒 DoT' },
    { id: 'cloak_shard', name: '暗影斗篷碎片',  tier: 'grunt', types: ['miniboss'],   rate: 0.02, effect: 'cloakShard', value: 5,   desc: '5 碎片合成：下局开局隐身 5 秒' },
    { id: 'shield_pack', name: '护盾发射器',  tier: 'grunt', types: ['shield'],     rate: 0.15, effect: 'shield',     value: 25,  desc: '立即获得 25 点临时护盾（10 秒后消失）' },
    { id: 'unstable_bomb', name: '不稳定炸药',tier: 'grunt', types: ['exploder'],   rate: 0.10, effect: 'bombShot',   value: 0,   desc: '下一次攻击变为范围爆炸' },
    { id: 'overload_cap', name: '过载电容', tier: 'elite',  rate: 0.04, effect: 'resetCd',   value: 0, desc: '立即重置 Q/E/R 全部冷却' },
    { id: 'rivet_plate', name: '铆甲板',  tier: 'grunt', types: ['rivet_beast'], rate: 0.05, effect: 'armorUp',    value: 60,  desc: '60 秒护甲 +10' },
    { id: 'rust_necklace', name: '锈齿项链',tier: 'grunt', types: ['rust_biter'], rate: 0.04, effect: 'speedUp',    value: 60,  desc: '60 秒移速 +8%' },
    { id: 'ration', name: '战地口粮',       tier: 'grunt', types: ['grunt'],      rate: 0.03, effect: 'heal',       value: 0.08, desc: '立即回复 8% 生命' },
    { id: 'decoy', name: '诱饵假人',        tier: 'grunt', types: ['grunt'],      rate: 0.01, effect: 'decoy',      value: 5,   desc: '放置假人吸引仇恨 5 秒' },
    { id: 'power_tip', name: '聚能弹头',    tier: 'elite',  rate: 0.05, effect: 'powerShot',  value: 2, desc: '下一次攻击伤害 ×2' },
    { id: 'chaos_dice', name: '混沌骰子',   tier: 'any',    rate: 0.01, effect: 'dice',       value: 0, desc: '60 秒内当前增益随机翻倍或清空' },
    { id: 'sentry_print', name: '哨戒炮图样', tier: 'grunt', types: ['rivet_beast'], rate: 0.04, effect: 'turret',    value: 10,  desc: '放置哨戒炮协战 10 秒（40% 攻击）' },
    { id: 'phase_pad', name: '相位靴垫',    tier: 'grunt', types: ['rust_biter'], rate: 0.03, effect: 'collideImmune', value: 60, desc: '60 秒内免疫一次近身伤害' },
    { id: 'overheat_valve', name: '过热阀门', tier: 'grunt', types: ['ember_acolyte'], rate: 0.02, effect: 'riskAtkSpd', value: 60, desc: '60 秒攻速 +8%，受到伤害 +5%' },
    { id: 'deepcold_core', name: '深寒核心',tier: 'grunt', types: ['frost_acolyte'], rate: 0.02, effect: 'freezeBurst', value: 1, desc: '冻结周围敌人 1 秒' },
    // ── 幸运与资源（计入道具表但即时结算，非道具拾取） ──
    { id: 'clover', name: '四叶虫草',       tier: 'elite',  rate: 0.008, effect: 'luckUp',    value: 60, desc: '60 秒内全部掉落率 ×2' },
    { id: 'gold_pouch', name: '大额金袋',   tier: 'elite',  rate: 0.12,  effect: 'goldBag',   value: 40, desc: '拾取 +40 局内金币' },
    { id: 'cursed_pouch', name: '诅咒金币袋', tier: 'any',    rate: 0.005, effect: 'cursedGold', value: 150, desc: '+150 金币，本波追加 6 只伏击怪' },
];

export function consumablesFor(tier: DropTier | 'any', type: string): ConsumableDef[] {
    return CONSUMABLES.filter(c =>
        (c.tier === tier || c.tier === 'any')
        && (!c.types || c.types.indexOf(type) >= 0));
}

/** 一次击杀最多掉 1 件道具：按表内 rate 独立掷取，命中多件取先查中者。 */
export function rollConsumableFor(
    tier: DropTier | 'any',
    type: string,
    luckMult: number,
    rand: () => number,
): ConsumableDef | null {
    for (const c of consumablesFor(tier, type)) {
        if (rand() < c.rate * luckMult) return c;
    }
    return null;
}

// ── 仓库兑换台配方（8 条；手续費为核心币） ─────────────────────
export interface RecipeDef {
    id: string;
    name: string;
    /** 材料消耗（materialId → 数量）。 */
    cost: Record<string, number>;
    /** 核心币手续费。 */
    coins: number;
    produce: { kind: 'equipment' | 'reforge' | 'elementBottle' | 'box' | 'prism' | 'coins'; mapId?: number; coins?: number };
    desc: string;
}

export const RECIPES: RecipeDef[] = [
    { id: 'r_forge',   name: '图域锻造', cost: { '*map': 3 }, coins: 5,
      produce: { kind: 'equipment' }, desc: '同图图域材料 ×3 → 该图品质上限内随机装备（图鉴去重优先）' },
    { id: 'r_reforge', name: '万用重铸', cost: { '*anyMap': 2, part_mech: 2 }, coins: 10,
      produce: { kind: 'reforge' }, desc: '任意 2 图域材料 + 机械零件 ×2 → 熔火重铸（重铸 1 件装备词缀）' },
    { id: 'r_element', name: '元素提纯', cost: { part_elem: 3, part_bio: 1 }, coins: 5,
      produce: { kind: 'elementBottle' }, desc: '元素结晶 ×3 + 生物质 ×1 → 随机元素瓶（仓库暂存，下局生效）' },
    { id: 'r_arsenal', name: '军械整备', cost: { mat_alloy: 2, part_mech: 3 }, coins: 10,
      produce: { kind: 'box' }, desc: '军械合金 ×2 + 机械零件 ×3 → 装备箱（随机装备，品质随进度）' },
    { id: 'r_chaos',   name: '混沌置换', cost: { mat_chaos: 4 }, coins: 15,
      produce: { kind: 'prism' }, desc: '混沌尘晶 ×4 → 混沌棱镜（单次版：下局商店必出 1 张彩色卡）' },
    { id: 'r_tribute', name: '天罚献礼', cost: { mat_ember: 4 }, coins: 0,
      produce: { kind: 'coins', coins: 200 }, desc: '天罚余烬 ×4 → 核心币 ×200' },
    { id: 'r_star',    name: '星陨锻造', cost: { mat_star: 5, part_psyon: 3 }, coins: 20,
      produce: { kind: 'equipment' }, desc: '陨星碎片 ×5 + 异能粉尘 ×3 → 自选词缀的史诗装备' },
    { id: 'r_sellall', name: '直接出售', cost: {}, coins: 0,
      produce: { kind: 'coins' }, desc: '仓库材料页签：单件 / 批量出售（售价见材料表）' },
];

/** 通配消耗：'*map'=任意同一种图域材料；'*anyMap'=任意图域材料合计。 */
export function recipeCostMet(recipe: RecipeDef, materials: Record<string, number>): boolean {
    const have = { ...materials };
    const mapIds = MAP_MATERIAL_IDS;
    for (const key in recipe.cost) {
        const need = recipe.cost[key];
        if (key === '*map') {
            // 需要同一种图域材料 ×need
            if (!mapIds.some(id => (have[id] ?? 0) >= need)) return false;
        } else if (key === '*anyMap') {
            let total = 0;
            for (const id of mapIds) total += have[id] ?? 0;
            if (total < need) return false;
            // 不实际扣（扣减在 craft 时统一处理），这里只判定
        } else {
            if ((have[key] ?? 0) < need) return false;
        }
    }
    return true;
}

/** 扣材料（含通配规则）：优先扣同一种图域材料。成功返回 true。 */
export function recipeConsume(recipe: RecipeDef, materials: Record<string, number>): boolean {
    if (!recipeCostMet(recipe, materials)) return false;
    for (const key in recipe.cost) {
        const need = recipe.cost[key];
        if (key === '*map') {
            const id = MAP_MATERIAL_IDS.find(m => (materials[m] ?? 0) >= need);
            if (id) materials[id] -= need;
        } else if (key === '*anyMap') {
            let left = need;
            for (const id of MAP_MATERIAL_IDS) {
                while (left > 0 && (materials[id] ?? 0) > 0) { materials[id] -= 1; left -= 1; }
            }
        } else {
            materials[key] = (materials[key] ?? 0) - need;
        }
    }
    return true;
}
