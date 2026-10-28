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
    { key: 'equipSellRate',      group: '金币与经济', name: '装备卖出回收率',   desc: '大厅装备库卖出折算（即时）',         def: 0.2,  min: 0.01, max: 1,     step: 0.01, percent: true },
    { key: 'augSellRate',        group: '金币与经济', name: '海克斯卖出回收率', desc: '持有海克斯卖出折算（即时）',         def: 0.75, min: 0.01, max: 1,     step: 0.01, percent: true },
    { key: 'augRefreshBase',     group: '金币与经济', name: '刷新基础价',       desc: '海克斯商店首次刷新价（即时）',       def: 5,    min: 0,    max: 100,   step: 1 },
    { key: 'augRefreshPremium',  group: '金币与经济', name: '刷新溢价系数',     desc: '多次刷新逐次溢价（即时）',           def: 1.75, min: 1,    max: 5,     step: 0.05 },
    { key: 'freeRefreshCount',   group: '金币与经济', name: '免费刷新次数',     desc: 'hex29 每波附带免费刷新（即时）',     def: 5,    min: 0,    max: 50,    step: 1 },
    // ── B. 掉落 ──
    { key: 'jokerDollChance',    group: '掉落', name: '玩偶猴掉率',     desc: '滑稽猴击杀掉玩偶猴概率（下局）',     def: 0.2,  min: 0,  max: 1,   step: 0.01, percent: true },
    { key: 'bossEquipChance',    group: '掉落', name: 'Boss装备掉率',   desc: '首领击杀掉装备概率（下局）',         def: 1,    min: 0,  max: 1,   step: 0.01, percent: true },
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
    { key: 'pinFeeRate',         group: '海克斯商店', name: '固定附加费率',     desc: '固定强化页签加价（即时）',     def: 0.05, min: 0,   max: 0.5, step: 0.01, percent: true },
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
