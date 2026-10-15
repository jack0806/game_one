// ============================================================
//  SaveSystem.ts — 多槽位玩家存档 + 成就系统
// ============================================================
// 跨局持久化玩家数据(总局数/累计击杀/最远进度/最高连击等)，存于
// Cocos 的 sys.localStorage(web 为浏览器 localStorage，原生平台为
// 本地文件，API 一致)。提供 3 个独立存档槽：首页「进入游戏」先选槽，
// 之后大厅/成就墙/局末统计都读写当前选中槽。
import { sys } from 'cc';
import { equipmentKey } from '../data/EquipmentDB';
import { TOTAL_CHAPTERS } from '../data/LevelIndex';
import { AchievementAdmin, CustomAchievementSpec } from './AchievementAdmin';

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
    /** v4：核心币余额（通关结算金币折算 20% 封顶 80；元进度货币）。 */
    coreCoins: number;
    /** v5：已通关的最高全局章号（1~30；解锁链=chaptersCleared+1，第 1 章恒解锁）。 */
    chaptersCleared: number;
    /** v4：装备仓库（跨局永久；uid/affix/quality，见 data/EquipmentDB.ts）。 */
    equipments: any[];
    /** v4：出战装备格（3 格，存装备 uid；空位为 null）。 */
    equipLoadout: (string | null)[];
    /** v4：旧档一次性迁移标记（六章连打时代的 bestWave → 章节解锁链）。 */
    migratedV4?: boolean;
    /** 滑稽猴彩蛋：已拾取的玩偶猴数量（≥1 解锁隐藏成就「这不是真的我哟」）。 */
    jokerDolls: number;
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
    /** 稀有度（类型内的等级梯度：普通→稀有→史诗→传奇）。 */
    rarity: '普通' | '稀有' | '史诗' | '传奇';
    /** 类型（一级分组/成就墙页签；后台成就管理可扩展自建分类）。 */
    category: string;
    /** 展示文案奖励（核心币类见 rewardCoins 真实发放）。 */
    reward: string;
    /** 解锁即发放的核心币（后台成就管理可编辑；缺省不发）。 */
    rewardCoins?: number;
    hidden?: boolean;
    goal: number;
    /** 当前进度值（达成时 >= goal）。 */
    progress: (p: PlayerProfile) => number;
}

/**
 * 自建成就的进度来源白名单：全部是 PlayerProfile 已有统计字段，
 * 不为自建成就改战斗内核（与任务线挑战星同一原则）。
 */
export const ACHIEVEMENT_STAT_FIELDS: { key: string; label: string; read: (p: PlayerProfile) => number }[] = [
    { key: 'totalRuns',         label: '累计局数',     read: p => p.totalRuns },
    { key: 'totalWins',         label: '通关局数',     read: p => p.totalWins },
    { key: 'totalKills',        label: '累计击杀',     read: p => p.totalKills },
    { key: 'bossKills',         label: '累计首领击杀', read: p => p.bossKills },
    { key: 'chaptersCleared',   label: '已通关章号',   read: p => p.chaptersCleared ?? 0 },
    { key: 'bestWave',          label: '最远波次',     read: p => p.bestWave ?? 0 },
    { key: 'totalGoldEarned',   label: '累计金币',     read: p => p.totalGoldEarned ?? 0 },
    { key: 'bestCombo',         label: '最高连击',     read: p => p.bestCombo ?? 0 },
    { key: 'bestAugmentCount',  label: '单局最多强化', read: p => p.bestAugmentCount ?? 0 },
    { key: 'bestKillsInRun',    label: '单局最多击杀', read: p => p.bestKillsInRun ?? 0 },
    { key: 'charsPlayedCount',  label: '使用过英雄数', read: p => p.charsPlayed.length },
    { key: 'coreCoins',         label: '核心币余额',   read: p => p.coreCoins ?? 0 },
    { key: 'equipmentsCount',   label: '仓库装备数',   read: p => p.equipments.length },
    { key: 'jokerDolls',        label: '玩偶猴数',     read: p => p.jokerDolls ?? 0 },
];

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
    { id: 'chapter_2',  name: '初入混沌',   desc: '通关第 2 张地图',       icon: '🌿', artKey: 'summon', rarity: '稀有', category: '探索', reward: '核心币 × 160', goal: 10,
      progress: p => p.bestChapter },
    { id: 'chapter_4',  name: '深渊行者',   desc: '通关第 4 张地图',       icon: '🌌', artKey: 'chaos', rarity: '史诗', category: '探索', reward: '紫晶档案框', goal: 20,
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
    // 隐藏成就：滑稽猴击杀后 20% 掉落玩偶猴，拾取即解锁（AchievementDef.hidden）
    { id: 'joker_doll', name: '这不是真的我哟', desc: '获得滑稽猴掉落的玩偶猴', icon: '🐵', artKey: 'summon', rarity: '传奇', category: '收集', reward: '玩偶猴摆件', hidden: true, goal: 1,
      progress: p => p.jokerDolls ?? 0 },
];

/**
 * 合并后台成就管理后的生效成就全集（成就墙展示与局末判定共用）：
 * 静态表套用 overrides（过滤下架）+ 自建成就。后台改动即改即生效。
 */
export function buildMergedAchievements(): AchievementDef[] {
    const out: AchievementDef[] = [];
    const overrides = AchievementAdmin.overrides();
    for (const base of ACHIEVEMENTS) {
        const o = overrides[base.id];
        if (o?.retired) continue;
        out.push({
            ...base,
            name: o?.name ?? base.name,
            desc: o?.desc ?? base.desc,
            goal: o?.goal ?? base.goal,
            rarity: (o?.rarity ?? base.rarity) as AchievementDef['rarity'],
            category: o?.category ?? base.category,
            reward: o?.reward ?? base.reward,
            rewardCoins: o?.rewardCoins ?? base.rewardCoins,
            hidden: o?.hidden ?? base.hidden,
        });
    }
    for (const c of AchievementAdmin.custom()) {
        out.push(customToDef(c));
    }
    return out;
}

/** 自建成就规格 → 运行时成就定义（进度读白名单统计字段，非法字段恒 0）。 */
function customToDef(c: CustomAchievementSpec): AchievementDef {
    const field = ACHIEVEMENT_STAT_FIELDS.find(f => f.key === c.statField);
    const read = field?.read;
    return {
        id: c.id,
        name: c.name,
        desc: c.desc,
        icon: '🛠️',
        artKey: 'summon',
        rarity: c.rarity,
        category: c.category,
        reward: c.reward,
        rewardCoins: c.rewardCoins,
        hidden: c.hidden,
        goal: c.goal,
        progress: read ?? (() => 0),
    };
}

function freshProfile(): PlayerProfile {
    return {
        version: 2,
        createdAt: 0, updatedAt: 0,
        totalRuns: 0, totalWins: 0, totalKills: 0, bossKills: 0,
        bestChapter: 0, bestWave: 0, totalGoldEarned: 0,
        bestCombo: 0, bestAugmentCount: 0, bestKillsInRun: 0,
        charsPlayed: [], achievements: [],
        coreCoins: 0, chaptersCleared: 0,
        equipments: [], equipLoadout: [null, null, null],
        migratedV4: true, jokerDolls: 0,
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
     * 导出全部槽位为存档码（UTF-8 安全的 base64 JSON）。
     * 用途：跨浏览器/换设备迁移存档（localStorage 按浏览器+地址隔离，
     * 换环境后贴入存档码即可恢复——单机版的"账号"）。
     */
    static exportSaveCode(): string {
        const slots: (PlayerProfile | null)[] = [];
        for (let i = 0; i < this.SLOT_COUNT; i++) {
            try { slots.push(parseProfileRaw(sys.localStorage.getItem(this.slotKey(i)))); }
            catch (_e) { slots.push(null); }
        }
        const json = JSON.stringify({ v: 1, exportedAt: Date.now(), slots });
        const bytes = new TextEncoder().encode(json);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    /** 导入存档码：覆盖全部槽位并清缓存；格式非法返回 false（不动现有存档）。 */
    static importSaveCode(code: string): boolean {
        try {
            const bin = atob(code.trim());
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const data = JSON.parse(new TextDecoder().decode(bytes));
            if (!data || data.v !== 1 || !Array.isArray(data.slots)) return false;
            for (let i = 0; i < this.SLOT_COUNT; i++) {
                const p = data.slots[i] ? parseProfileRaw(JSON.stringify(data.slots[i])) : null;
                if (p) sys.localStorage.setItem(this.slotKey(i), JSON.stringify(p));
                else sys.localStorage.removeItem(this.slotKey(i));
            }
            this._cache = null;
            return true;
        } catch (_e) { return false; }
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
        // v4 一次性迁移：六章连打时代（全局波次 5/章）的老档按 bestWave 折算
        // 章节解锁链，避免老玩家进度清零。新档 bestWave=0 折算结果为 0，
        // 迁移后置标记不再重复执行（新制通关走 recordChapterCleared）。
        if (!p.migratedV4) {
            p.migratedV4 = true;
            const legacyCleared = Math.min(6, Math.floor((p.bestWave ?? 0) / 5));
            if (legacyCleared > (p.chaptersCleared ?? 0)) p.chaptersCleared = legacyCleared;
        }
        // v5 一次性迁移（提案 3.1 规则 B，2026-10-09 定稿）：v4 的 6 章制档
        // 折算进 30 节点链——旧"通关第 N 章"打过图 N 的大 Boss ≈ 新"图 N 全通"，
        // 即全局 N×5。v4 迁移先跑，产出旧语义 1~6 后再统一放大。
        if ((p.version ?? 1) < 2) {
            p.version = 2;
            const oldCleared = Math.min(6, Math.max(0, p.chaptersCleared ?? 0));
            const oldBest = Math.min(6, Math.max(0, p.bestChapter ?? 0));
            p.chaptersCleared = Math.min(TOTAL_CHAPTERS, oldCleared * 5);
            p.bestChapter = Math.min(TOTAL_CHAPTERS, Math.max(oldBest * 5, p.chaptersCleared));
            try { sys.localStorage.setItem(this.slotKey(this._slot), JSON.stringify(p)); } catch (_e) { /* 存储失败下次再迁 */ }
        }
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

    /**
     * 检查全部成就，把新达成的 id 写入档案并返回成就定义列表。
     * 判定走合并列表（含后台覆盖/自建）；核心币类奖励（rewardCoins）
     * 在解锁同帧入档，天然防重复发放。
     */
    static checkAchievements(): AchievementDef[] {
        const p = this.load();
        const fresh: AchievementDef[] = [];
        for (const a of buildMergedAchievements()) {
            if (p.achievements.indexOf(a.id) < 0 && a.progress(p) >= a.goal) {
                p.achievements.push(a.id);
                if (a.rewardCoins && a.rewardCoins > 0) p.coreCoins += a.rewardCoins;
                fresh.push(a);
            }
        }
        return fresh;
    }

    /** 生效成就全集（后台覆盖/下架/自建已合并）；成就墙页与后台管理共用。 */
    static allAchievements(): AchievementDef[] {
        return buildMergedAchievements();
    }

    /**
     * 滑稽猴彩蛋：拾取一只玩偶猴（局内即时调用，不等人局末结算——
     * 测试房没有局末）。返回本次新解锁的成就（供浮字提示）。
     */
    static recordJokerDoll(): AchievementDef[] {
        const p = this.load();
        p.jokerDolls = (p.jokerDolls ?? 0) + 1;
        const fresh = this.checkAchievements();
        this.save();
        return fresh;
    }

    // ── v4：核心币与章节解锁链（《关卡设计-15波.md》2.2 / 9.1） ──

    /** 核心币入账（通关结算折算，20% 封顶 80/局）。 */
    static addCoreCoins(amount: number): void {
        if (amount <= 0) return;
        const p = this.load();
        p.coreCoins += Math.round(amount);
        this.save();
    }

    /** 当前核心币余额。 */
    static coreCoins(): number {
        return this.load().coreCoins ?? 0;
    }

    /** 记录通关全局章号（解锁链：通关第 k 节点解锁第 k+1 节点）。 */
    static recordChapterCleared(chapterId: number): void {
        const p = this.load();
        if (chapterId > (p.chaptersCleared ?? 0)) {
            p.chaptersCleared = chapterId;
            this.save();
        }
    }

    /** 已解锁的节点数（第 1 章恒解锁；1~30 线性链）。 */
    static unlockedChapterCount(): number {
        return Math.min(TOTAL_CHAPTERS, (this.load().chaptersCleared ?? 0) + 1);
    }

    // ── v4：装备仓库（《关卡设计-15波.md》第 10 节） ──

    /** 装备入仓（拾取即永久保留）；自动填入第一个空装备格。 */
    static addEquipment(equip: any): void {
        const p = this.load();
        p.equipments.push(equip);
        const slot = p.equipLoadout.findIndex(s => s === null || s === undefined);
        if (slot >= 0) p.equipLoadout[slot] = equip.uid;
        this.save();
    }

    /** 设置出战装备格（uid 为 null 即卸下该格）。 */
    static setEquipSlot(slot: number, uid: string | null): void {
        const p = this.load();
        if (!p.equipLoadout || p.equipLoadout.length < 3) p.equipLoadout = [null, null, null];
        const i = Math.max(0, Math.min(2, Math.floor(slot)));
        // 卸下/换装时清掉其他格里的同 uid（一件装备只占一格）
        if (uid != null) p.equipLoadout = p.equipLoadout.map(s => (s === uid ? null : s));
        p.equipLoadout[i] = uid;
        this.save();
    }

    /** 当前出战装备（按 3 格配置解析；未配置时自动取仓库前 3 件兜底）。 */
    static equippedItems(): any[] {
        const p = this.load();
        const byUid = new Map((p.equipments ?? []).map(e => [e.uid, e]));
        const loadout = (p.equipLoadout ?? [null, null, null]);
        let picked = loadout.map(uid => (uid != null ? byUid.get(uid) : undefined)).filter(Boolean);
        if (!picked.length) picked = (p.equipments ?? []).slice(0, 3);
        return picked;
    }

    /** 局内卖出：从仓库与装备格移除（永久失去）。 */
    static removeEquipment(uid: string): void {
        const p = this.load();
        p.equipments = (p.equipments ?? []).filter(e => e.uid !== uid);
        p.equipLoadout = (p.equipLoadout ?? [null, null, null]).map(s => (s === uid ? null : s));
        this.save();
    }

    /** 已拥有装备的去重键集合（掉落表"未拥有优先"用）。 */
    static ownedEquipmentKeys(): Set<string> {
        return new Set((this.load().equipments ?? []).map(e => equipmentKey(e)));
    }

    /** 已解锁成就的进度/解锁状态视图（成就墙渲染用）。 */
    static isUnlocked(a: AchievementDef): boolean {
        return this.load().achievements.indexOf(a.id) >= 0;
    }

    /** 清空内存缓存（下次 load 重新读存储）——测试与手动删档用。 */
    static resetCache(): void { this._cache = null; }
}
