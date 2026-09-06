// ============================================================
//  SaveSystem.ts — 多槽位玩家存档 + 成就系统
// ============================================================
// 跨局持久化玩家数据(总局数/累计击杀/最远进度/最高连击等)，存于
// Cocos 的 sys.localStorage(web 为浏览器 localStorage，原生平台为
// 本地文件，API 一致)。提供 3 个独立存档槽：首页「进入游戏」先选槽，
// 之后大厅/成就墙/局末统计都读写当前选中槽。
import { sys } from 'cc';

/** 一局结束时的汇总数据（由 GameManager 在死亡/通关时填写）。 */
export interface RunSummary {
    charId: string;        // 本局使用的角色
    chapter: number;       // 最远到达章节(1-based)
    wave: number;          // 最远到达波次
    kills: number;         // 本局击杀
    bossKills: number;     // 本局Boss击杀
    goldEarned: number;    // 本局累计获得金币(含已花费)
    maxCombo: number;      // 本局最高连击
    augmentCount: number;  // 本局装备的强化数
    won: boolean;          // 是否通关全部章节
}

/** 玩家档案（localStorage 持久化的全部字段）。 */
export interface PlayerProfile {
    version: number;
    /** 档案创建时间戳(ms)；旧档无此字段时按 0 处理，首次记录时补齐。 */
    createdAt: number;
    /** 最近一次写入时间戳(ms)，存档选择页显示「最后游玩」。 */
    updatedAt: number;
    totalRuns: number;         // 完成局数
    totalWins: number;         // 通关局数
    totalKills: number;        // 累计击杀
    bossKills: number;         // 累计Boss击杀
    bestChapter: number;       // 最远章节(1-based)
    bestWave: number;
    totalGoldEarned: number;   // 累计获得金币
    bestCombo: number;         // 历史最高连击
    bestAugmentCount: number;  // 单局最多强化数
    bestKillsInRun: number;    // 单局最多击杀
    charsPlayed: string[];     // 使用过的角色id
    achievements: string[];    // 已解锁成就id
}

/** 存档槽概览（存档选择页渲染用；exists=false 即空槽）。 */
export interface SaveSlotSummary {
    /** 槽位下标(0-based)，显示时 +1。 */
    slot: number;
    exists: boolean;
    profile: PlayerProfile | null;
}

export interface AchievementDef {
    id: string;
    name: string;
    desc: string;
    icon: string;
    /** 成就墙使用的现有 ui_icon_* 美术 key（不含 ui_icon_ 前缀）。 */
    artKey: string;
    rarity: '普通' | '稀有' | '史诗' | '传奇';
    category: '挑战' | '探索' | '收集';
    /** 当前仅展示预览，正式奖励结算接入后可沿用该字段。 */
    reward: string;
    hidden?: boolean;
    goal: number;
    /** 当前进度值（达成时 >= goal）。 */
    progress: (p: PlayerProfile) => number;
}

/** 成就墙全集（12 个），进度函数直接读档案字段。 */
export const ACHIEVEMENTS: AchievementDef[] = [
    { id: 'first_run',  name: '初次出击',   desc: '完成第一局战斗',        icon: '🚀', artKey: 'speed', rarity: '普通', category: '探索', reward: '核心币 × 50', goal: 1,
      progress: p => p.totalRuns },
    { id: 'runs_25',    name: '百战不殆',   desc: '累计完成 25 局',        icon: '🎖️', artKey: 'shield', rarity: '史诗', category: '挑战', reward: '金色档案框', goal: 25,
      progress: p => p.totalRuns },
    { id: 'kills_100',  name: '百人斩',     desc: '累计击杀 100 个敌人',   icon: '⚔️', artKey: 'crit', rarity: '普通', category: '挑战', reward: '核心币 × 100', goal: 100,
      progress: p => p.totalKills },
    { id: 'kills_1000', name: '千人斩',     desc: '累计击杀 1000 个敌人',  icon: '💀', artKey: 'explosion', rarity: '传奇', category: '挑战', reward: '称号「清场者」', goal: 1000,
      progress: p => p.totalKills },
    { id: 'boss_10',    name: '屠龙者',     desc: '累计击杀 10 个首领',    icon: '👑', artKey: 'chaos', rarity: '传奇', category: '挑战', reward: '首领猎手徽记', goal: 10,
      progress: p => p.bossKills },
    { id: 'chapter_2',  name: '初入混沌',   desc: '到达第 2 章',           icon: '🌿', artKey: 'summon', rarity: '稀有', category: '探索', reward: '核心币 × 160', goal: 2,
      progress: p => p.bestChapter },
    { id: 'chapter_4',  name: '深渊行者',   desc: '到达第 4 章',           icon: '🌌', artKey: 'chaos', rarity: '史诗', category: '探索', reward: '紫晶档案框', goal: 4,
      progress: p => p.bestChapter },
    { id: 'gold_5000',  name: '富甲一方',   desc: '累计获得 5000 金币',    icon: '💰', artKey: 'gold', rarity: '稀有', category: '收集', reward: '核心币 × 300', goal: 5000,
      progress: p => p.totalGoldEarned },
    { id: 'combo_50',   name: '连击大师',   desc: '单局连击达到 50',       icon: '🔥', artKey: 'combo', rarity: '史诗', category: '挑战', reward: '动态连击徽记', goal: 50,
      progress: p => p.bestCombo },
    { id: 'aug_6',      name: '收藏家',     desc: '单局装备 6 个海克斯强化', icon: '🔷', artKey: 'summon', rarity: '稀有', category: '收集', reward: '刷新许可 × 1', goal: 6,
      progress: p => p.bestAugmentCount },
    { id: 'run_150',    name: '战场主宰',   desc: '单局击杀 150 个敌人',   icon: '🌟', artKey: 'fire', rarity: '史诗', category: '挑战', reward: '核心币 × 400', goal: 150,
      progress: p => p.bestKillsInRun },
    { id: 'all_chars',  name: '全明星',     desc: '使用过全部 6 名英雄',   icon: '🏆', artKey: 'heart', rarity: '传奇', category: '收集', reward: '称号「六芒星」', goal: 6,
      progress: p => p.charsPlayed.length },
];

function freshProfile(): PlayerProfile {
    return {
        version: 1,
        createdAt: 0, updatedAt: 0,
        totalRuns: 0, totalWins: 0, totalKills: 0, bossKills: 0,
        bestChapter: 0, bestWave: 0, totalGoldEarned: 0,
        bestCombo: 0, bestAugmentCount: 0, bestKillsInRun: 0,
        charsPlayed: [], achievements: [],
    };
}

/** 从 localStorage 原文解析档案；损坏/不存在时返回 null（区别于空白新档）。 */
function parseProfileRaw(raw: string | null): PlayerProfile | null {
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') return Object.assign(freshProfile(), data);
    } catch (_e) { /* 存档损坏按空槽处理，不中断游戏 */ }
    return null;
}

export class SaveSystem {
    /** 存档槽数量（首页进入游戏后任选其一）。 */
    static readonly SLOT_COUNT = 3;
    /** 旧单档案时代的存储 key；仅在迁移时读取，不再写入。 */
    private static readonly LEGACY_KEY = 'hexblast_profile_v1';
    /** 槽位存储 key 前缀，实际 key 为 `${BASE}${槽位号1-based}`。 */
    private static readonly KEY_BASE = 'hexblast_slot_v1_';
    private static _slot = 0;
    private static _cache: PlayerProfile | null = null;

    /** 槽位实际使用的 localStorage key。 */
    static slotKey(slot: number): string {
        return this.KEY_BASE + (slot + 1);
    }

    /** 当前选中的槽位(0-based)。未选择过时默认 0 号槽。 */
    static currentSlot(): number {
        return this._slot;
    }

    /** 切换当前槽位：换槽即清内存缓存，后续 load/save/recordRun 都作用于新槽。 */
    static selectSlot(slot: number): void {
        const s = Math.min(Math.max(0, Math.floor(slot)), this.SLOT_COUNT - 1);
        if (s === this._slot) { this._cache = null; return; }
        this._slot = s;
        this._cache = null;
    }

    /** 全部槽位概览（存档选择页用）；只读存储，不动当前槽与缓存。 */
    static listSlots(): SaveSlotSummary[] {
        const out: SaveSlotSummary[] = [];
        for (let i = 0; i < this.SLOT_COUNT; i++) {
            let p: PlayerProfile | null = null;
            try {
                p = parseProfileRaw(sys.localStorage.getItem(this.slotKey(i)));
            } catch (_e) { p = null; }
            out.push({ slot: i, exists: !!p, profile: p });
        }
        return out;
    }

    /** 删除槽位存档（存档选择页两步确认后调用）。当前槽被删则缓存一并失效。 */
    static deleteSlot(slot: number): void {
        try { sys.localStorage.removeItem(this.slotKey(slot)); } catch (_e) { /* 忽略 */ }
        if (slot === this._slot) this._cache = null;
    }

    /**
     * 旧单档案（hexblast_profile_v1）一次性迁移到 1 号槽：
     * 仅当旧 key 存在且所有槽位都为空时执行，避免覆盖任何新档。
     * GameManager 启动时调用；幂等，迁移失败（损坏旧档）静默跳过。
     */
    static migrateLegacyProfile(): void {
        try {
            const raw = sys.localStorage.getItem(this.LEGACY_KEY);
            if (!raw) return;
            for (let i = 0; i < this.SLOT_COUNT; i++) {
                if (sys.localStorage.getItem(this.slotKey(i))) return;
            }
            const p = parseProfileRaw(raw);
            if (p) sys.localStorage.setItem(this.slotKey(0), JSON.stringify(p));
        } catch (_e) { /* 旧档损坏时跳过迁移 */ }
    }

    /** 读取当前槽档案（带内存缓存；localStorage 损坏/不存在时回退空白档案）。 */
    static load(): PlayerProfile {
        if (this._cache) return this._cache;
        let p: PlayerProfile;
        try {
            p = parseProfileRaw(sys.localStorage.getItem(this.slotKey(this._slot))) ?? freshProfile();
        } catch (_e) { p = freshProfile(); }
        this._cache = p;
        return p;
    }

    static save(): void {
        if (!this._cache) return;
        this._cache.updatedAt = Date.now();
        if (!this._cache.createdAt) this._cache.createdAt = this._cache.updatedAt;
        try {
            sys.localStorage.setItem(this.slotKey(this._slot), JSON.stringify(this._cache));
        } catch (_e) { /* 隐私模式/存储满时静默失败 */ }
    }

    /** 局末记录一局数据，返回本次新解锁的成就列表（供浮字/弹提示）。 */
    static recordRun(run: RunSummary): AchievementDef[] {
        const p = this.load();
        p.totalRuns++;
        if (run.won) p.totalWins++;
        p.totalKills    += run.kills;
        p.bossKills     += run.bossKills;
        p.totalGoldEarned += run.goldEarned;
        if (run.chapter > p.bestChapter) p.bestChapter = run.chapter;
        if (run.wave     > p.bestWave)   p.bestWave   = run.wave;
        if (run.maxCombo > p.bestCombo)  p.bestCombo  = run.maxCombo;
        if (run.augmentCount > p.bestAugmentCount) p.bestAugmentCount = run.augmentCount;
        if (run.kills    > p.bestKillsInRun) p.bestKillsInRun = run.kills;
        if (run.charId && p.charsPlayed.indexOf(run.charId) < 0) p.charsPlayed.push(run.charId);
        const unlocked = this.checkAchievements();
        this.save();
        return unlocked;
    }

    /** 检查全部成就，把新达成的 id 写入档案并返回成就定义列表。 */
    static checkAchievements(): AchievementDef[] {
        const p = this.load();
        const fresh: AchievementDef[] = [];
        for (const a of ACHIEVEMENTS) {
            if (p.achievements.indexOf(a.id) < 0 && a.progress(p) >= a.goal) {
                p.achievements.push(a.id);
                fresh.push(a);
            }
        }
        return fresh;
    }

    /** 已解锁成就的进度/解锁状态视图（成就墙渲染用）。 */
    static isUnlocked(a: AchievementDef): boolean {
        return this.load().achievements.indexOf(a.id) >= 0;
    }

    /** 清空内存缓存（下次 load 重新读存储）——测试与手动删档用。 */
    static resetCache(): void { this._cache = null; }
}
