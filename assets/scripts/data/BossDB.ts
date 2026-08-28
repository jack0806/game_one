// ============================================================
//  BossDB.ts — Boss 静态数据表（4 章首领）
// ============================================================
// 原 BossController._setupForChapter 内联数值表的独立化：测试房间的
// Boss 选择卡与数值配置、BossController 的章节初始化共用这一份单一
// 数据源，避免配置 UI 手抄数值后与生成逻辑漂移。
// 数值与抽取前逐字一致，不影响正式局平衡。

export interface BossDef {
    /** 1-based 章节号（1~4），与 BossController.chapter 语义一致。 */
    chapter: number;
    maxHp: number;
    damage: number;
    speed: number;
    armor: number;
    goldValue: number;
    radius: number;
    color: string;
    glow: string;
    label: string;
    spriteKey: string;
    /** Sprite 染色（复用贴图时区分单位），缺省白。 */
    tintColor?: string;
    visualScale: number;
    attackWindupMax: number;
}

export const BOSSES: BossDef[] = [
    { chapter: 1, maxHp: 3000,  damage: 42,  speed: 62, armor: 10, goldValue: 200, radius: 45, color: '#cc3300', glow: '#ff0000', label: '废土领主·腐肉',       spriteKey: 'enemy_boss_ch1', visualScale: 2.0, attackWindupMax: 0.42 },
    // 熔炉橙：钢蓝工厂背景下蓝色 Boss 几乎隐形（视觉评审 2026-08-18），改互补暖色
    { chapter: 2, maxHp: 5500,  damage: 66,  speed: 68, armor: 20, goldValue: 400, radius: 45, color: '#cc7a33', glow: '#ffaa44', label: '钢铁之王·熔炉',       spriteKey: 'enemy_boss_ch2', visualScale: 2.0, attackWindupMax: 0.42 },
    { chapter: 3, maxHp: 9000,  damage: 94,  speed: 74, armor: 30, goldValue: 600, radius: 45, color: '#00cc88', glow: '#00ffcc', label: '海克斯异变体·无限核', spriteKey: 'enemy_boss_ch3', visualScale: 2.0, attackWindupMax: 0.42 },
    { chapter: 4, maxHp: 14000, damage: 132, speed: 80, armor: 40, goldValue: 800, radius: 45, color: '#8800cc', glow: '#cc44ff', label: '混沌深渊·终焉之门',   spriteKey: 'enemy_boss_ch4', visualScale: 2.0, attackWindupMax: 0.42 },
];

/** 按 0-based 章节号取 Boss 定义，越界回落到最后一章。 */
export function getBossDef(chapter0Based: number): BossDef {
    return BOSSES[Math.min(Math.max(0, chapter0Based), BOSSES.length - 1)];
}

// ============================================================
//  测试房间专用 Boss（仅测试房间可生成，不进正式章节流程）
// ============================================================
// 来自设计文档（boss.docx）：第二章「机械高达X-剑」、第三章「深海恐惧」。
// 文档只给技能描述，无数值——数值按对应章节档位自行定档（mech 取第二章
// 5500/66/68/20，abyss 取第三章 9000/94/74/30），复用 enemy_boss 素体+染色。

export interface TestBossDef extends BossDef {
    /** 技能集标识：BossController._useSkill 按此分支。 */
    kind: 'mech' | 'abyss' | 'vespa' | 'crucible_city' | 'manyfold';
}

export const TEST_BOSSES: TestBossDef[] = [
    { kind: 'mech',  chapter: 2, maxHp: 5500,  damage: 66,  speed: 68, armor: 20, goldValue: 400, radius: 45, color: '#99c4ff', glow: '#88ccff', label: '机械高达X-剑', spriteKey: 'enemy_boss', tintColor: '#9db8ff', visualScale: 2.0, attackWindupMax: 0.42 },
    { kind: 'abyss', chapter: 3, maxHp: 9000,  damage: 94,  speed: 74, armor: 30, goldValue: 600, radius: 45, color: '#33aaff', glow: '#00ccff', label: '深海恐惧',       spriteKey: 'enemy_boss', tintColor: '#33ccff', visualScale: 2.0, attackWindupMax: 0.42 },
    // 《怪物设计与数值》5.2~5.4：独立俯视轮廓，逐字使用文档基础数值。
    { kind: 'vespa', chapter: 3, maxHp: 6800, damage: 42, speed: 78, armor: 14, goldValue: 480, radius: 46, color: '#132b4c', glow: '#69ff4a', label: '疫晶跳蛛·维斯帕', spriteKey: 'enemy_boss_vespa', tintColor: '#ffffff', visualScale: 1.85, attackWindupMax: 0.50 },
    { kind: 'crucible_city', chapter: 3, maxHp: 9800, damage: 60, speed: 50, armor: 30, goldValue: 680, radius: 50, color: '#38281f', glow: '#ff8b2c', label: '磁潮铸城兽·坩埚', spriteKey: 'enemy_boss_crucible_city', tintColor: '#ffffff', visualScale: 1.84, attackWindupMax: 0.70 },
    { kind: 'manyfold', chapter: 4, maxHp: 14500, damage: 82, speed: 64, armor: 38, goldValue: 920, radius: 48, color: '#271737', glow: '#c991ff', label: '折界裁缝·万相', spriteKey: 'enemy_boss_manyfold', tintColor: '#ffffff', visualScale: 1.88, attackWindupMax: 0.55 },
];

// ============================================================
//  测试房间小 Boss（仅测试房间可生成）
// ============================================================
// 既有 6 个章节小 Boss 来自 boss.docx；其后追加《怪物设计与数值》的 5 个机制小 Boss。
// 普通 ≈1200血/30攻、史诗 ≈2200血/40攻、地狱 ≈2800血/45攻。
// 全部复用现有贴图+染色（同 elite/archer 套路），不新增美术资源。

export type MiniBossTier = '普通' | '史诗' | '地狱';

export interface MiniBossDef {
    /** 敌人类型 key，即 EnemyBase._applyTypeDef 新增的 type。 */
    id: string;
    label: string;
    tier: MiniBossTier;
    maxHp: number;
    damage: number;
    speed: number;
    armor: number;
    color: string;
    glow: string;
    spriteKey: string;
    tintColor: string;
    visualScale: number;
    radius: number;
    goldValue: number;
    attackWindupMax: number;
}

export const MINI_BOSSES: MiniBossDef[] = [
    { id: 'squid',    label: '深海鱿鱼',   tier: '史诗', maxHp: 2200, damage: 40, speed: 50, armor: 15, color: '#33aaff', glow: '#22ccff', spriteKey: 'enemy_boss',       tintColor: '#33aaff', visualScale: 1.5, radius: 30, goldValue: 120, attackWindupMax: 0.5 },
    { id: 'turtle',   label: '盾龟',       tier: '普通', maxHp: 1400, damage: 28, speed: 40, armor: 30, color: '#55cc66', glow: '#33ff66', spriteKey: 'enemy_shield',    tintColor: '#7dff8f', visualScale: 1.5, radius: 32, goldValue: 90,  attackWindupMax: 0.5 },
    { id: 'shrimp',   label: '锯齿剑虾',   tier: '地狱', maxHp: 2800, damage: 45, speed: 75, armor: 25, color: '#ff8844', glow: '#ffaa44', spriteKey: 'enemy_boss',       tintColor: '#ff9966', visualScale: 1.5, radius: 30, goldValue: 150, attackWindupMax: 0.45 },
    { id: 'jelly',    label: '毒刺鬼水母', tier: '普通', maxHp: 1200, damage: 30, speed: 45, armor: 5,  color: '#cc66ff', glow: '#cc44ff', spriteKey: 'enemy_boss',       tintColor: '#cc88ff', visualScale: 1.4, radius: 28, goldValue: 90,  attackWindupMax: 0.5 },
    { id: 'drone_a',  label: '攻击性无人机', tier: '普通', maxHp: 900,  damage: 24, speed: 90, armor: 10, color: '#ff5555', glow: '#ff3333', spriteKey: 'turret_base_vivian', tintColor: '#ff6666', visualScale: 1.2, radius: 22, goldValue: 70,  attackWindupMax: 0.4 },
    { id: 'drone_s',  label: '支援型无人机', tier: '史诗', maxHp: 1600, damage: 10, speed: 70, armor: 15, color: '#55ff88', glow: '#44ff88', spriteKey: 'turret_base_vivian', tintColor: '#66ff99', visualScale: 1.2, radius: 24, goldValue: 100, attackWindupMax: 0.4 },
    { id: 'chain_hound', label: '铆链猎犬·卡扣', tier: '普通', maxHp: 1250, damage: 22, speed: 92, armor: 8, color: '#522722', glow: '#ff4138', spriteKey: 'enemy_chain_hound', tintColor: '#ffffff', visualScale: 1.88, radius: 28, goldValue: 90, attackWindupMax: 0.40 },
    { id: 'prism_snail', label: '棱壳巡灯兽·澜镜', tier: '普通', maxHp: 1450, damage: 18, speed: 46, armor: 14, color: '#2f5961', glow: '#8eeaff', spriteKey: 'enemy_prism_snail', tintColor: '#ffffff', visualScale: 1.98, radius: 32, goldValue: 100, attackWindupMax: 0.55 },
    { id: 'triune_priest', label: '三相祭司·赫黎', tier: '史诗', maxHp: 2300, damage: 34, speed: 58, armor: 16, color: '#394654', glow: '#d8f7ff', spriteKey: 'enemy_triune_priest', tintColor: '#ffffff', visualScale: 1.72, radius: 30, goldValue: 145, attackWindupMax: 0.50 },
    { id: 'rail_butcher', label: '磁轨屠夫·零扳机', tier: '史诗', maxHp: 2650, damage: 40, speed: 72, armor: 22, color: '#4b3133', glow: '#ff4fb9', spriteKey: 'enemy_rail_butcher', tintColor: '#ffffff', visualScale: 1.78, radius: 34, goldValue: 165, attackWindupMax: 0.55 },
    { id: 'bell_devourer', label: '葬钟吞噬者·赫兹', tier: '地狱', maxHp: 3900, damage: 52, speed: 62, armor: 28, color: '#2c1f3c', glow: '#fff0a6', spriteKey: 'enemy_bell_devourer', tintColor: '#ffffff', visualScale: 1.86, radius: 38, goldValue: 240, attackWindupMax: 0.60 },
];

/** 按敌人类型取小 Boss 定义。 */
export function getMiniBossDef(type: string): MiniBossDef | undefined {
    return MINI_BOSSES.find(m => m.id === type);
}

// ============================================================
//  《怪物设计与数值》测试房炮灰（逐批落地，验证后再进入正式波次）
// ============================================================

export interface TestGruntDef {
    id: string;
    label: string;
    maxHp: number;
    damage: number;
    speed: number;
    armor: number;
    attackInterval: number;
    goldValue: number;
    radius: number;
    color: string;
    glow: string;
    spriteKey: string;
    visualScale: number;
    attackWindupMax: number;
}

/**
 * 新怪先只进入测试房，数值逐字对应 docs/怪物设计与数值.md。
 * 每一项都必须有独立轮廓与攻击行为，禁止再复用石狮子临时贴图。
 */
export const TEST_GRUNTS: TestGruntDef[] = [
    {
        id: 'rust_biter', label: '锈齿扑兵', maxHp: 75, damage: 7, speed: 82,
        armor: 0, attackInterval: 0.95, goldValue: 7, radius: 21,
        color: '#a83d2f', glow: '#ff4935', spriteKey: 'enemy_rust_biter',
        visualScale: 1.55, attackWindupMax: 0.28,
    },
    {
        id: 'needle_gunner', label: '断针射手', maxHp: 58, damage: 6, speed: 58,
        armor: 0, attackInterval: 1.65, goldValue: 9, radius: 20,
        color: '#305f96', glow: '#fff06a', spriteKey: 'enemy_needle_gunner',
        visualScale: 1.60, attackWindupMax: 0.55,
    },
    {
        id: 'ember_acolyte', label: '焚芯咒仆', maxHp: 68, damage: 5, speed: 50,
        armor: 2, attackInterval: 2.40, goldValue: 11, radius: 21,
        color: '#542e20', glow: '#ff7a24', spriteKey: 'enemy_ember_acolyte',
        visualScale: 1.58, attackWindupMax: 0.85,
    },
    {
        id: 'frost_acolyte', label: '冻脉咒仆', maxHp: 74, damage: 5, speed: 48,
        armor: 2, attackInterval: 2.60, goldValue: 11, radius: 22,
        color: '#314a5c', glow: '#85e7ff', spriteKey: 'enemy_frost_acolyte',
        visualScale: 1.58, attackWindupMax: 0.75,
    },
    {
        id: 'acid_sac', label: '酸囊投手', maxHp: 62, damage: 4, speed: 55,
        armor: 0, attackInterval: 2.20, goldValue: 10, radius: 22,
        color: '#547230', glow: '#72ff38', spriteKey: 'enemy_acid_sac',
        visualScale: 1.58, attackWindupMax: 0.70,
    },
    {
        id: 'rivet_beast', label: '铆甲兽', maxHp: 230, damage: 9, speed: 34,
        armor: 18, attackInterval: 1.35, goldValue: 14, radius: 29,
        color: '#46505b', glow: '#a9e5ff', spriteKey: 'enemy_rivet_beast',
        visualScale: 1.72, attackWindupMax: 0.55,
    },
    {
        id: 'arc_leech', label: '闪弧寄生体', maxHp: 82, damage: 5, speed: 68,
        armor: 4, attackInterval: 2.00, goldValue: 12, radius: 22,
        color: '#354853', glow: '#7df4ff', spriteKey: 'enemy_arc_leech',
        visualScale: 1.60, attackWindupMax: 0.45,
    },
    {
        id: 'gold_scavenger', label: '掠金虫', maxHp: 46, damage: 0, speed: 105,
        armor: 0, attackInterval: 999, goldValue: 24, radius: 20,
        color: '#78502f', glow: '#ffd75a', spriteKey: 'enemy_gold_scavenger',
        visualScale: 1.62, attackWindupMax: 0,
    },
    {
        id: 'blast_tick', label: '熔爆蜱', maxHp: 44, damage: 28, speed: 92,
        armor: 0, attackInterval: 999, goldValue: 10, radius: 20,
        color: '#66311f', glow: '#ff6b1f', spriteKey: 'enemy_blast_tick',
        visualScale: 1.56, attackWindupMax: 0.80,
    },
];

export function getTestGruntDef(type: string): TestGruntDef | undefined {
    return TEST_GRUNTS.find(m => m.id === type);
}

// ============================================================
//  测试房间单位目录（底部工具条渲染用，与生成 id 一一对应）
// ============================================================

export type UnitCategory = 'boss' | 'miniboss' | 'grunt';

export interface UnitEntry {
    /** 生成 id：boss_ch1~4 / boss_<测试Boss kind> / 敌人类型名。 */
    id: string;
    label: string;
    category: UnitCategory;
    color: string;
}

export const UNIT_CATALOG: UnitEntry[] = [
    // 首领：4 章大 Boss + 测试房机制 Boss
    { id: 'boss_ch1',  label: '废土领主·腐肉', category: 'boss', color: '#cc3300' },
    { id: 'boss_ch2',  label: '钢铁之王·熔炉', category: 'boss', color: '#cc7a33' },
    { id: 'boss_ch3',  label: '海克斯异变体',  category: 'boss', color: '#00cc88' },
    { id: 'boss_ch4',  label: '混沌深渊',      category: 'boss', color: '#8800cc' },
    { id: 'boss_mech', label: '机械高达X-剑',  category: 'boss', color: '#88ccff' },
    { id: 'boss_abyss', label: '深海恐惧',     category: 'boss', color: '#33ccff' },
    { id: 'boss_vespa', label: '疫晶跳蛛·维斯帕', category: 'boss', color: '#69ff4a' },
    { id: 'boss_crucible_city', label: '磁潮铸城兽·坩埚', category: 'boss', color: '#ff8b2c' },
    { id: 'boss_manyfold', label: '折界裁缝·万相', category: 'boss', color: '#c991ff' },
    // 小 Boss（文档 6 个）
    ...MINI_BOSSES.map(m => ({ id: m.id, label: m.label, category: 'miniboss' as UnitCategory, color: m.color })),
    // 小兵：保留现有样例，新文档单位追加在后，便于并排对比验收。
    { id: 'grunt',       label: '小兵',     category: 'grunt', color: '#ff4444' },
    { id: 'shield',      label: '护盾兵',   category: 'grunt', color: '#4488ff' },
    { id: 'exploder',    label: '爆炸怪',   category: 'grunt', color: '#ff8800' },
    { id: 'golem',       label: '石像鬼',   category: 'grunt', color: '#888888' },
    { id: 'elite_grunt', label: '精英',     category: 'grunt', color: '#ff44ff' },
    { id: 'archer',      label: '毒射手',   category: 'grunt', color: '#88ff44' },
    { id: 'miniboss',    label: '暗影猎手', category: 'grunt', color: '#aa44ff' },
    ...TEST_GRUNTS.map(m => ({ id: m.id, label: m.label, category: 'grunt' as UnitCategory, color: m.color })),
];
