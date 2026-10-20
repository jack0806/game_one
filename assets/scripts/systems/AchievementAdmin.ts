// ============================================================
//  AchievementAdmin.ts — 后台成就管理：覆盖 / 下架 / 自建
// ============================================================
// 后台管理面板（ui/AdminUI.ts）的数据层。存储运行时覆盖，不回写静态数据：
//   · overrides  内置成就的目标/文案/稀有度/奖励/隐藏修改与下架（id 不可删）；
//   · custom     自建成就（可删），进度来源限定 PlayerProfile 已有统计字段白名单。
// 分组统一走稀有度（普通/稀有/史诗/传奇，2026-10-19 玩家定稿，与成就档案库
// 一致）；旧版 挑战/探索/收集 分类体系已废弃——存量存储里的 categories 键
// 与自定义 category 字段仅作兼容保留、不再读取分组。
// 生效列表 = 静态 ACHIEVEMENTS（套用 overrides，过滤下架）+ custom，
// 由 SaveSystem.allAchievements() 合并（本文件不 import SaveSystem，避免环）。
// 持久化 localStorage（hexblast_admin_achievements_v1）；无存储环境退化为内存。

/** 内置成就的单项覆盖（未提供的字段沿用静态定义）。 */
export interface AchievementOverride {
    name?: string;
    desc?: string;
    goal?: number;
    rarity?: '普通' | '稀有' | '史诗' | '传奇';
    /** 已废弃（2026-10-19 分类改版）：仅为兼容旧覆盖数据保留，不再用于分组。 */
    category?: string;
    reward?: string;
    rewardCoins?: number;
    hidden?: boolean;
    /** 下架：不再展示与判定（已解锁记录保留，可恢复）。 */
    retired?: boolean;
}

/** 自建成就规格（statField 在 SaveSystem 的白名单内，非法时进度恒 0）。 */
export interface CustomAchievementSpec {
    id: string;
    name: string;
    desc: string;
    /** 已废弃：新增自建时自动等于 rarity，仅为兼容旧存储保留。 */
    category?: string;
    rarity: '普通' | '稀有' | '史诗' | '传奇';
    statField: string;
    goal: number;
    reward: string;
    rewardCoins?: number;
    hidden?: boolean;
}

interface AdminStore {
    overrides: Record<string, AchievementOverride>;
    custom: CustomAchievementSpec[];
}

const STORAGE_KEY = 'hexblast_admin_achievements_v1';

export interface AdminStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

function defaultStorage(): AdminStorage {
    try {
        const ls = (globalThis as any).localStorage;
        if (ls) return ls as AdminStorage;
    } catch (_e) { /* 非浏览器环境 */ }
    return {
        getItem: (k: string) => (k in _memStore ? _memStore[k] : null),
        setItem: (k: string, v: string) => { _memStore[k] = v; },
        removeItem: (k: string) => { delete _memStore[k]; },
    };
}
const _memStore: Record<string, string> = {};

export class AchievementAdmin {
    private static _store: AdminStore | null = null;
    static storage: AdminStorage | null = null;

    private static _load(): AdminStore {
        if (this._store) return this._store;
        this._store = { overrides: {}, custom: [] };
        try {
            const raw = (this.storage ?? defaultStorage()).getItem(STORAGE_KEY);
            if (!raw) return this._store;
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                if (data.overrides && typeof data.overrides === 'object') this._store.overrides = data.overrides;
                if (Array.isArray(data.custom)) this._store.custom = data.custom;
            }
        } catch (_e) { /* 存储损坏按默认处理 */ }
        return this._store;
    }

    private static _flush(): void {
        if (!this._store) return;
        try {
            (this.storage ?? defaultStorage()).setItem(STORAGE_KEY, JSON.stringify({
                overrides: this._store.overrides,
                custom: this._store.custom,
            }));
        } catch (_e) { /* 写失败不中断游戏 */ }
    }

    static overrides(): Record<string, AchievementOverride> { return { ...this._load().overrides }; }

    /** 合并一项覆盖（patch 里 undefined 字段不覆盖已有值）。 */
    static setOverride(id: string, patch: AchievementOverride): void {
        const store = this._load();
        const cur = { ...(store.overrides[id] ?? {}) };
        for (const k of Object.keys(patch)) {
            const v = (patch as any)[k];
            if (v === undefined) continue;
            cur[k] = v;
        }
        store.overrides[id] = cur;
        this._flush();
    }

    static clearOverride(id: string): void {
        const store = this._load();
        delete store.overrides[id];
        this._flush();
    }

    static custom(): CustomAchievementSpec[] { return this._load().custom.map(c => ({ ...c })); }

    /** 新增自建成就（id 缺省按时间戳生成；分类字段自动等于稀有度）。 */
    static addCustom(spec: Omit<CustomAchievementSpec, 'id'> & { id?: string }): CustomAchievementSpec {
        const store = this._load();
        const full: CustomAchievementSpec = {
            ...spec,
            category: spec.category ?? spec.rarity,
            id: spec.id || `custom_${Date.now().toString(36)}`,
        };
        store.custom.push(full);
        this._flush();
        return { ...full };
    }

    static updateCustom(id: string, patch: Partial<CustomAchievementSpec>): void {
        const store = this._load();
        const i = store.custom.findIndex(c => c.id === id);
        if (i < 0) return;
        store.custom[i] = { ...store.custom[i], ...patch, id };
        // 分类改版后 category 恒等于稀有度：改稀有度时自动跟随
        if (patch.rarity) store.custom[i].category = patch.rarity;
        this._flush();
    }

    static deleteCustom(id: string): void {
        const store = this._load();
        store.custom = store.custom.filter(c => c.id !== id);
        this._flush();
    }

    /** 后台"全部重置"调用：成就管理数据一并清空。 */
    static resetAll(): void {
        this._store = { overrides: {}, custom: [] };
        this._flush();
    }

    /** 测试辅助：清内存缓存（下次访问重新从存储加载）。 */
    static _reloadForTest(): void { this._store = null; }
}
