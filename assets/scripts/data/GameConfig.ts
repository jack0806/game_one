// ============================================================
//  GameConfig.ts — 后台管理系统：可调参数注册表（管理员专用）
// ============================================================
// 后台面板（ui/AdminUI.ts）的唯一数据源：每项 = 一行注册，面板自动渲染。
// 原则：不改策划定稿表（DifficultyDB/金币曲线/30章曲线保持原值），
// 配置在公式出口做外层乘区/覆盖；恢复默认 = 完全回到现状。
// 持久化：localStorage（hexblast_admin_config_v1），设备级全局，不分存档槽；
// 存储不可用时（Node 测试环境）退化为内存字典，恒读默认值。

/** 数值型配置项定义。percent=true 时值域/默认值按 0~1 小数存取，面板显示百分比。 */
export interface ConfigItemDef {
    key: string;
    /** 面板分组标题（同组连排）。 */
    group: string;
    name: string;
    /** 一句话说明（面板展示）。 */
    desc: string;
    def: number;
    min: number;
    max: number;
    step: number;
    percent?: boolean;
}

/** 六大组配置全集（顺序即面板渲染顺序）。 */
export const CONFIG_ITEMS: ConfigItemDef[] = [
    // ── A. 金币与经济 ──
    { key: 'goldGainMult',       group: '金币与经济', name: '全局金币产出系数', desc: '所有获得的金币总乘区（局内即时）',   def: 1,    min: 0.1,  max: 20,    step: 0.1 },
    { key: 'killGoldMult',       group: '金币与经济', name: '击杀掉落金系数',   desc: '敌人死亡掉落金（下局生效）',         def: 1,    min: 0.1,  max: 20,    step: 0.1 },
    { key: 'killGoldCapMult',    group: '金币与经济', name: '掉落上限系数',     desc: '单局击杀掉落预算 2000 基数（下局）', def: 1,    min: 0.5,  max: 10,    step: 0.1 },
    { key: 'goldStageCurveMult', group: '金币与经济', name: '章节金币曲线倍率', desc: '1.0~1.75 章节曲线输出（下局）',      def: 1,    min: 0,    max: 3,     step: 0.05 },
    { key: 'coreCoinsRate',      group: '金币与经济', name: '核心币折算率',     desc: '通关结算金币折核心币（结算时）',     def: 0.2,  min: 0,    max: 1,     step: 0.01, percent: true },
    { key: 'coreCoinsCap',       group: '金币与经济', name: '核心币单局封顶',   desc: '通关结算核心币上限（结算时）',       def: 80,   min: 0,    max: 10000, step: 10 },
    { key: 'shopCostMult',       group: '金币与经济', name: '商店价格系数',     desc: '波间商店定价（下局生效）',           def: 1,    min: 0.1,  max: 10,    step: 0.1 },
    { key: 'equipSellRate',      group: '金币与经济', name: '装备卖出回收率',   desc: '仓库装备卖出折算（即时）',           def: 0.2,  min: 0.01, max: 1,     step: 0.01, percent: true },
    { key: 'augSellRate',        group: '金币与经济', name: '海克斯卖出回收率', desc: '持有海克斯卖出折算（即时）',         def: 0.75, min: 0.01, max: 1,     step: 0.01, percent: true },
    { key: 'augRefreshBase',     group: '金币与经济', name: '刷新基础价',       desc: '海克斯商店首次刷新价（即时）',       def: 5,    min: 0,    max: 100,   step: 1 },
    { key: 'augRefreshPremium',  group: '金币与经济', name: '刷新溢价系数',     desc: '多次刷新逐次溢价（即时）',           def: 1.75, min: 1,    max: 5,     step: 0.05 },
    { key: 'freeRefreshCount',   group: '金币与经济', name: '免费刷新次数',     desc: 'hex29 每波附带免费刷新（即时）',     def: 5,    min: 0,    max: 50,    step: 1 },
    // ── B. 掉落 ──
    { key: 'jokerDollChance',    group: '掉落', name: '玩偶猴掉率',     desc: '滑稽猴击杀掉玩偶猴概率（下局）',     def: 0.2,  min: 0,  max: 1,   step: 0.01, percent: true },
    { key: 'bossEquipChance',    group: '掉落', name: 'Boss装备掉率',   desc: '首领击杀掉装备概率（下局）',         def: 1,    min: 0,  max: 1,   step: 0.01, percent: true },
    { key: 'bossUniqueChance',   group: '掉落', name: 'Boss专属掉率',   desc: '图末Boss专属掉落概率（下局）',       def: 0.25, min: 0,  max: 1,   step: 0.01, percent: true },
    { key: 'bossPityMax',        group: '掉落', name: '专属软保底次数', desc: '连续N-1次未掉第N次必掉（下局）',     def: 4,    min: 2,  max: 20,  step: 1 },
    { key: 'materialDropMult',   group: '掉落', name: '材料掉率乘区',   desc: '材料类掉落总乘区（局内即时）',       def: 1,    min: 0.1, max: 10,  step: 0.1 },
    { key: 'amberBugChance',     group: '掉落', name: '金虫琥珀掉率',   desc: '掠金虫截获掉收藏品概率（局内即时）', def: 0.1,  min: 0,  max: 1,   step: 0.01, percent: true },
    { key: 'settleGoldRate',     group: '掉落', name: '结算兑换比',     desc: '局末剩余金币兑核心币比率（结算时）', def: 200,  min: 1,  max: 10000, step: 10 },
    { key: 'settleMinCoin',      group: '掉落', name: '结算保底核心币', desc: '有剩余金但不足兑换时保底（结算时）', def: 1,    min: 1,  max: 100, step: 1 },
    { key: 'goldPickupRangeMult', group: '掉落', name: '拾取范围系数',  desc: '金币拾取半径乘区（局内即时）',       def: 1,    min: 0.1, max: 10,  step: 0.1 },
    // ── C. 波次与怪物 ──
    { key: 'waveCountMult',      group: '波次与怪物', name: '波次数量系数',     desc: '每波小兵总量乘区（下局生效）',       def: 1, min: 0.1, max: 10,  step: 0.1 },
    { key: 'enemyCountCap',      group: '波次与怪物', name: '单波数量封顶',     desc: '同波单位上限（下局生效）',           def: 128, min: 16, max: 999, step: 1 },
    { key: 'statScaleMult',      group: '波次与怪物', name: '怪物数值曲线系数', desc: '1.0→4.2 章节曲线输出（下局）',       def: 1, min: 0.1, max: 10,  step: 0.1 },
    { key: 'countScaleMult',     group: '波次与怪物', name: '章节数量曲线系数', desc: '1.0→2.2 章节曲线输出（下局）',       def: 1, min: 0.1, max: 10,  step: 0.1 },
    { key: 'enemyStatMult',      group: '波次与怪物', name: '怪物属性总乘区',   desc: '血/盾/伤/甲再乘区（下局生效）',      def: 1, min: 0.1, max: 10,  step: 0.1 },
    { key: 'fastBossKillSec',    group: '波次与怪物', name: '速杀Boss判定秒数', desc: '「速杀艺术」成就：Boss登场到倒下阈值（即时）', def: 20, min: 5, max: 120, step: 5 },
    // ── D. 难度微调 ──
    { key: 'diffStatMult',       group: '难度微调', name: '难度强度乘区', desc: '四档 statMult 输出（下局生效）',  def: 1, min: 0.1, max: 5, step: 0.05 },
    { key: 'diffCountMult',      group: '难度微调', name: '难度数量乘区', desc: '四档 countMult 输出（下局生效）', def: 1, min: 0.1, max: 5, step: 0.05 },
    { key: 'diffGoldMult',       group: '难度微调', name: '难度金币乘区', desc: '四档 goldMult 输出（下局生效）',  def: 1, min: 0.1, max: 5, step: 0.05 },
    // ── E. 海克斯商店 ──
    { key: 'augRarityLuck',      group: '海克斯商店', name: '金/彩出现权重加成', desc: '金色/彩色权重 ×此值（即时）', def: 1,    min: 0.1, max: 20,  step: 0.1 },
    { key: 'augPriceMult',       group: '海克斯商店', name: '海克斯售价系数',   desc: '三档定价乘区（即时）',         def: 1,    min: 0.1, max: 10,  step: 0.1 },
    { key: 'augSkipGoldMult',     group: '海克斯商店', name: '跳档金卡权重',   desc: '未购买银档时三档卡金档(Lv2)刷出权重 ×此值', def: 0.5, min: 0.05, max: 1, step: 0.05 },
    { key: 'augSkipPrismMult',    group: '海克斯商店', name: '跳档彩卡权重',   desc: '未购买银档时三档卡彩档(Lv3)刷出权重 ×此值', def: 0.25, min: 0.05, max: 1, step: 0.05 },
    { key: 'pinFeeRate',         group: '海克斯商店', name: '固定附加费率',     desc: '固定强化页签加价（即时）',     def: 0.05, min: 0,   max: 0.5, step: 0.01, percent: true },
    // ── E2. 海克斯特权（方案 D：升级档横向特权，数值曲线不动） ──
    { key: 'perkWarmupSec',      group: '海克斯特权', name: '热机时长',     desc: '加速齿轮Lv2：每波开场攻速加成秒数',   def: 5,    min: 1, max: 30,  step: 1 },
    { key: 'perkWarmupAtk',      group: '海克斯特权', name: '热机攻速',     desc: '加速齿轮Lv2：开场攻速额外加成',       def: 0.10, min: 0, max: 1,   step: 0.01, percent: true },
    { key: 'perkFrenzySec',      group: '海克斯特权', name: '狂热时长',     desc: '加速齿轮Lv3：击杀后狂热秒数',         def: 1,    min: 0.2, max: 5, step: 0.1 },
    { key: 'perkFrenzyAtk',      group: '海克斯特权', name: '狂热攻速',     desc: '加速齿轮Lv3：狂热攻速加成',           def: 0.15, min: 0, max: 1,   step: 0.01, percent: true },
    { key: 'perkCritCapDamage',  group: '海克斯特权', name: '过载电容比例', desc: '力量核心Lv2：暴击附加攻击力比例',     def: 0.10, min: 0, max: 1,   step: 0.01, percent: true },
    { key: 'perkHealRatio',      group: '海克斯特权', name: '涌泉活水比例', desc: '生命涌泉Lv2：波间回复已损生命比例',   def: 0.15, min: 0, max: 1,   step: 0.01, percent: true },
    { key: 'perkLowHpRatio',     group: '海克斯特权', name: '泉眼触发血线', desc: '生命涌泉Lv3：减伤生效的血量阈值',     def: 0.30, min: 0.05, max: 1, step: 0.05, percent: true },
    { key: 'perkLowHpReduce',    group: '海克斯特权', name: '泉眼减伤',     desc: '生命涌泉Lv3：低血线受伤降低',         def: 0.15, min: 0, max: 0.8, step: 0.01, percent: true },
    { key: 'perkFocusCritStep',  group: '海克斯特权', name: '弱点习惯步长', desc: '精准仪轨Lv2：连击同目标每跳暴击加成', def: 0.01, min: 0, max: 0.05, step: 0.005, percent: true },
    { key: 'perkFocusCritMax',   group: '海克斯特权', name: '弱点习惯上限', desc: '精准仪轨Lv2：暴击加成上限',           def: 0.05, min: 0.01, max: 0.3, step: 0.01, percent: true },
    { key: 'perkCritQcd',        group: '海克斯特权', name: '致命节奏减CD', desc: '精准仪轨Lv3：暴击缩短Q冷却秒数',      def: 0.3,  min: 0, max: 2,   step: 0.1 },
    { key: 'perkFarShotFrom',    group: '海克斯特权', name: '透镜触发段',   desc: '延展力场Lv2：飞行进度伤害加成起点',   def: 0.75, min: 0.3, max: 1, step: 0.05, percent: true },
    { key: 'perkFarShotBonus',   group: '海克斯特权', name: '透镜伤害',     desc: '延展力场Lv2：远段命中伤害加成',       def: 0.10, min: 0, max: 1,   step: 0.01, percent: true },
    { key: 'perkRangePierceFrom', group: '海克斯特权', name: '贯穿触发段',  desc: '延展力场Lv3：飞行进度获得穿透起点',   def: 0.80, min: 0.3, max: 1, step: 0.05, percent: true },
    { key: 'perkCompoundMax',    group: '海克斯特权', name: '复利上限',     desc: '点金手Lv2：存款拾取加成上限',         def: 0.10, min: 0, max: 1,   step: 0.01, percent: true },
    { key: 'perkEliteGold',      group: '海克斯特权', name: '黄金之手精英金', desc: '点金手Lv3：精英击杀额外金币',       def: 5,    min: 0, max: 50,  step: 1 },
    { key: 'perkSettleRate',     group: '海克斯特权', name: '黄金之手结算比', desc: '点金手Lv3：局末兑换比改善为 X:1',   def: 180,  min: 50, max: 200, step: 5 },
    { key: 'perkWindPushChance', group: '海克斯特权', name: '风压概率',     desc: '风元素Lv2：命中推开小兵概率',         def: 0.15, min: 0, max: 1,   step: 0.01, percent: true },
    { key: 'perkWindPushDist',   group: '海克斯特权', name: '风压距离',     desc: '风元素Lv2：推开码数',                 def: 36,   min: 0, max: 120, step: 4 },
    { key: 'perkFireSpreadRatio', group: '海克斯特权', name: '蔓延转移比',  desc: '火元素Lv2：死亡转移灼烧比例',         def: 0.5,  min: 0, max: 1,   step: 0.05, percent: true },
    { key: 'perkFireSpreadRange', group: '海克斯特权', name: '蔓延范围',    desc: '火元素Lv2：转移搜寻码数',             def: 150,  min: 50, max: 400, step: 10 },
    { key: 'perkBurnoutBonus',   group: '海克斯特权', name: '燃终终结伤',   desc: '火元素Lv3：灼烧到期终结伤害（DPS倍数）', def: 0.5, min: 0, max: 3, step: 0.1 },
    { key: 'perkBurnoutRange',   group: '海克斯特权', name: '燃尽范围',     desc: '火元素Lv3：精英死亡点燃码数',         def: 120,  min: 50, max: 400, step: 10 },
    { key: 'perkPierceBonus',    group: '海克斯特权', name: '厚重穿透加成', desc: '土元素Lv2：每穿透一个目标伤害加成',   def: 0.05, min: 0, max: 0.5, step: 0.01, percent: true },
    { key: 'perkQuakeRatio',     group: '海克斯特权', name: '地震伤害比',   desc: '土元素Lv3：震地攻击力比例',           def: 0.30, min: 0.1, max: 1, step: 0.05, percent: true },
    { key: 'perkQuakeCd',        group: '海克斯特权', name: '地震冷却',     desc: '土元素Lv3：震地内置冷却秒数',         def: 2,    min: 0.5, max: 10, step: 0.5 },
    { key: 'perkTideFrom',       group: '海克斯特权', name: '潮汐起算秒',   desc: '水元素Lv2：受减速超过 N 秒后易伤',    def: 2,    min: 0.5, max: 10, step: 0.5 },
    { key: 'perkTideBonus',      group: '海克斯特权', name: '潮汐易伤',     desc: '水元素Lv2：潮汐目标受伤加成',         def: 0.10, min: 0, max: 1,   step: 0.01, percent: true },
    { key: 'perkFrostCrit',      group: '海克斯特权', name: '冰点暴击',     desc: '水元素Lv3：对减速目标暴击率加成',     def: 0.05, min: 0, max: 1,   step: 0.01, percent: true },
    // ── 元素体系扩展（2026-11-09：雷/冰/光/暗，见 docs/元素强化扩展方案.md）──
    { key: 'perkThunderArc',       group: '海克斯特权', name: '静电概率',     desc: '雷元素Lv2：感电目标被再次命中的落雷概率', def: 0.20, min: 0, max: 1, step: 0.01, percent: true },
    { key: 'perkThunderArcDmg',    group: '海克斯特权', name: '静电落雷伤',   desc: '雷元素Lv2：落雷攻击力比例',           def: 0.30, min: 0.1, max: 1, step: 0.05, percent: true },
    { key: 'perkThunderArcRange',  group: '海克斯特权', name: '静电落雷范围', desc: '雷元素Lv2：落雷半径码数',             def: 120,  min: 40, max: 300, step: 10 },
    { key: 'perkThunderChainRange',group: '海克斯特权', name: '引雷针转移范围', desc: '雷元素Lv3：死亡转移感电的搜寻码数',  def: 150,  min: 50, max: 400, step: 10 },
    { key: 'perkFrostBonus',       group: '海克斯特权', name: '霜甲增伤',     desc: '冰元素Lv2：冻结/寒潮目标受伤加成',     def: 0.15, min: 0, max: 1, step: 0.01, percent: true },
    { key: 'perkShatterDmg',       group: '海克斯特权', name: '碎冰伤害',     desc: '冰元素Lv3：碎冰攻击力比例',           def: 0.80, min: 0.2, max: 2, step: 0.1, percent: true },
    { key: 'perkFrostBossSec',     group: '海克斯特权', name: '寒潮时长',     desc: '冰元素：Boss叠满寒意的易伤秒数',       def: 3,    min: 1, max: 8, step: 0.5 },
    { key: 'perkLightExpose',      group: '海克斯特权', name: '曝光追加伤',   desc: '光元素Lv2：破隐追加真伤攻击力比例',     def: 0.20, min: 0, max: 1, step: 0.05, percent: true },
    { key: 'perkLightFocusStep',   group: '海克斯特权', name: '聚焦步长',     desc: '光元素Lv3：连续同目标每跳光伤加成',     def: 0.02, min: 0, max: 0.1, step: 0.01, percent: true },
    { key: 'perkLightFocusMax',    group: '海克斯特权', name: '聚焦上限',     desc: '光元素Lv3：连续同目标光伤加成上限',     def: 0.20, min: 0.05, max: 1, step: 0.05, percent: true },
    { key: 'perkShadowLeech',      group: '海克斯特权', name: '汲取比例',     desc: '暗元素Lv2：腐蚀目标伤害转生命比例',     def: 0.08, min: 0, max: 0.5, step: 0.01, percent: true },
    { key: 'perkShadowLeechCap',   group: '海克斯特权', name: '汲取每秒上限', desc: '暗元素Lv2：每秒回血上限',             def: 6,    min: 0, max: 30, step: 1 },
    { key: 'perkShadowKillReq',    group: '海克斯特权', name: '暗蚀击杀数',   desc: '暗元素Lv3：触发暗影之力所需腐蚀击杀',   def: 10,   min: 3, max: 30, step: 1 },
    { key: 'perkShadowPowerSec',   group: '海克斯特权', name: '暗影之力时长', desc: '暗元素Lv3：暗影之力持续秒数',         def: 4,    min: 1, max: 10, step: 0.5 },
    { key: 'perkShadowPower',      group: '海克斯特权', name: '暗影之力增伤', desc: '暗元素Lv3：暗影之力伤害加成',         def: 0.15, min: 0, max: 1, step: 0.01, percent: true },
    { key: 'perkElementLuck',       group: '海克斯特权', name: '元素倾向倍数', desc: '持有≥2张元素卡时元素卡出现率倍数（商店刷出概率）', def: 3, min: 1, max: 10, step: 0.5 },
    // ── F. 玩家调试 ──
    { key: 'playerDamageMult',   group: '玩家调试', name: '玩家伤害系数', desc: '基础伤害乘区（下局生效）',   def: 1,    min: 0.1,  max: 100, step: 0.1 },
    { key: 'playerHpMult',       group: '玩家调试', name: '玩家生命系数', desc: '基础最大生命乘区（下局）',   def: 1,    min: 0.1,  max: 100, step: 0.1 },
    { key: 'playerSpeedMult',    group: '玩家调试', name: '玩家移速系数', desc: '基础移速乘区（下局生效）',   def: 1,    min: 0.1,  max: 10,  step: 0.1 },
    { key: 'playerCooldownMult', group: '玩家调试', name: '技能冷却系数', desc: '技能冷却乘区（<1 更快）',     def: 1,    min: 0.05, max: 10,  step: 0.05 },
];

const STORAGE_KEY = 'hexblast_admin_config_v1';
export const DEFAULT_ADMIN_PASSWORD = 'hex2026';

/** 存储访问（可注入 stub；无 localStorage 环境退化为内存字典）。 */
export interface ConfigStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

function defaultStorage(): ConfigStorage {
    try {
        const ls = (globalThis as any).localStorage;
        if (ls) return ls as ConfigStorage;
    } catch (_e) { /* 非浏览器环境 */ }
    return {
        getItem: (k: string) => (k in _memStore ? _memStore[k] : null),
        setItem: (k: string, v: string) => { _memStore[k] = v; },
        removeItem: (k: string) => { delete _memStore[k]; },
    };
}
const _memStore: Record<string, string> = {};

function clampItem(item: ConfigItemDef, v: number): number {
    const n = Number.isFinite(v) ? v : item.def;
    return Math.min(item.max, Math.max(item.min, n));
}

export class GameConfig {
    /** 覆盖值缓存（懒加载自存储；key → 数值）。 */
    private static _overrides: Record<string, number> | null = null;
    /** 管理员密码覆盖（同存储；未设置用默认）。 */
    private static _password: string | null = null;
    /** 存储注入点（测试用）。 */
    static storage: ConfigStorage | null = null;

    private static _store(): ConfigStorage { return this.storage ?? defaultStorage(); }
    private static _load(): void {
        if (this._overrides) return;
        this._overrides = {};
        this._password = null;
        try {
            const raw = this._store().getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                const values = (data.values ?? {}) as Record<string, unknown>;
                for (const item of CONFIG_ITEMS) {
                    const v = values[item.key];
                    if (typeof v === 'number') this._overrides![item.key] = clampItem(item, v);
                }
                if (typeof data.password === 'string' && data.password) this._password = data.password;
            }
        } catch (_e) { /* 存储损坏按默认处理 */ }
    }
    private static _flush(): void {
        if (!this._overrides) return;
        try {
            this._store().setItem(STORAGE_KEY, JSON.stringify({
                values: this._overrides,
                password: this._password,
            }));
        } catch (_e) { /* 写失败不中断游戏 */ }
    }

    /** 读配置值（未设置返回默认值）。 */
    static get(key: string): number {
        this._load();
        if (this._overrides && key in this._overrides) return this._overrides[key];
        const item = CONFIG_ITEMS.find(i => i.key === key);
        return item ? item.def : 0;
    }

    /** 写配置（钳制到值域并立即持久化）。 */
    static set(key: string, value: number): void {
        this._load();
        const item = CONFIG_ITEMS.find(i => i.key === key);
        if (!item) return;
        this._overrides![key] = clampItem(item, value);
        this._flush();
    }

    /** 单项恢复默认。 */
    static reset(key: string): void {
        this._load();
        delete this._overrides![key];
        this._flush();
    }

    /** 全部恢复默认（含密码重置）。 */
    static resetAll(): void {
        this._overrides = {};
        this._password = null;
        this._flush();
    }

    /** 是否被改过（面板金色标记）。 */
    static isModified(key: string): boolean {
        this._load();
        return !!this._overrides && key in this._overrides;
    }

    /** 管理员密码（后台入口验证与面板修改用）。 */
    static getPassword(): string {
        this._load();
        return this._password ?? DEFAULT_ADMIN_PASSWORD;
    }
    static setPassword(p: string): void {
        this._load();
        this._password = p;
        this._flush();
    }

    /** 测试辅助：清空内存缓存（模拟重启进程后重新从存储加载）。 */
    static _reloadForTest(): void {
        this._overrides = null;
        this._password = null;
    }
}
