// ============================================================
//  DifficultyTuning.ts — 关卡难度系数比例调整（测试房调试用，纯数据层）
// ============================================================
// 用途：在测试房间逐关（全局章号 1~30）微调难度系数的比例，保存后
// 正式局同章生效（EnemyBase 强度 / WaveManager 数量 / 金币乘率三路读取点），
// 供反馈测试构建使用；基线曲线仍在 LevelIndex.ts（statScaleFor 等），
// 本模块只承载"基线 × 比例"的覆盖层，比例恒为 1 = 与基线一致。
//
// 持久化：sys.localStorage（web=浏览器、原生平台为平台存储），跨重启生效。
// 数据分层：不依赖 systems/entities/ui；LevelIndex 为同级 data 依赖。

import { sys } from 'cc';
import { statScaleFor, countScaleFor, goldStageMult } from './LevelIndex';

/** localStorage 持久化 key（v1：结构变更时换 key 防旧档解析错位）。 */
const STORAGE_KEY = 'hexblast_diff_tuning_v1';

/** 单关三路比例（1 = 基线值；偏离 1 的项才会落盘）。 */
export interface ChapterTuning { stat: number; count: number; gold: number; }

/** 比例钳制范围与步进：太宽会让某关彻底不可玩/没产出，钳住便于回归。 */
export const TUNING_MIN = 0.2;
export const TUNING_MAX = 3.0;
export const TUNING_STEP = 0.05;

function clampRatio(v: number): number {
    return Math.round(Math.min(TUNING_MAX, Math.max(TUNING_MIN, v)) * 100) / 100;
}

function neutral(): ChapterTuning { return { stat: 1, count: 1, gold: 1 }; }

/** 当前全部覆盖表（章号 → 比例）。仅内存态；落盘走 saveTuning。 */
let _overrides: Record<number, ChapterTuning> = {};

/** 是否已从 localStorage 载入过（GameManager 启动时调用一次；测试可直接跳过）。 */
let _loaded = false;

export function loadTuning(): void {
    _loaded = true;
    _overrides = {};
    let raw: string | null = null;
    try { raw = sys.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;
        const chapters = (parsed as any).chapters;
        if (!chapters || typeof chapters !== 'object') return;
        for (const key of Object.keys(chapters)) {
            const ch = Number(key);
            const t = chapters[key];
            if (!Number.isInteger(ch) || ch < 1 || ch > 30 || !t || typeof t !== 'object') continue;
            const entry = neutral();
            for (const field of ['stat', 'count', 'gold'] as const) {
                const v = Number(t[field]);
                if (Number.isFinite(v) && v !== 1) entry[field] = clampRatio(v);
            }
            // 全 1 的条目等于没有覆盖，直接丢弃（保存端同样会裁剪）
            if (entry.stat !== 1 || entry.count !== 1 || entry.gold !== 1) _overrides[ch] = entry;
        }
    } catch (e) {
        // 损坏数据按无覆盖处理，不抛出（调试工具不得阻断启动）
    }
}

/** 把当前覆盖表写入 localStorage（测试房「保存到关卡」按钮）。 */
export function saveTuning(): void {
    const chapters: Record<string, ChapterTuning> = {};
    for (const key of Object.keys(_overrides)) {
        const t = _overrides[Number(key)];
        const entry: ChapterTuning = { stat: 1, count: 1, gold: 1 };
        if (t.stat !== 1) entry.stat = t.stat;
        if (t.count !== 1) entry.count = t.count;
        if (t.gold !== 1) entry.gold = t.gold;
        if (entry.stat !== 1 || entry.count !== 1 || entry.gold !== 1) chapters[key] = entry;
    }
    try { sys.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, chapters })); }
    catch (e) { /* 存储不可用时静默失败，内存态仍生效 */ }
}

/** 确保读取点拿到的是已载入的覆盖表（懒加载兜底：正式局未触发 loadTuning 时）。 */
function ensureLoaded(): void {
    if (!_loaded) loadTuning();
}

/** 读某关当前覆盖（未覆盖返回全 1 的中性值；UI 展示用）。 */
export function chapterTuning(globalChapterId: number): ChapterTuning {
    ensureLoaded();
    const t = _overrides[Math.min(30, Math.max(1, Math.round(globalChapterId)))];
    return t ? { ...t } : neutral();
}

/** 调整某关某一路比例（钳制到 [0.2, 3.0]；只改内存，落盘走 saveTuning）。 */
export function setChapterTuning(globalChapterId: number, field: keyof ChapterTuning, value: number): void {
    ensureLoaded();
    const ch = Math.min(30, Math.max(1, Math.round(globalChapterId)));
    const cur = _overrides[ch] ?? neutral();
    cur[field] = clampRatio(value);
    if (cur.stat === 1 && cur.count === 1 && cur.gold === 1) delete _overrides[ch];
    else _overrides[ch] = cur;
}

/** 清掉某关覆盖（回到基线；只改内存）。 */
export function clearChapterTuning(globalChapterId: number): void {
    ensureLoaded();
    delete _overrides[Math.min(30, Math.max(1, Math.round(globalChapterId)))];
}

/** 清掉全部覆盖（只改内存；持久化盘上旧值仍在，需 saveTuning 才真正清除）。 */
export function clearAllTuning(): void {
    ensureLoaded();
    _overrides = {};
}

/** 全部覆盖快照（UI 重绘/测试断言用，深拷贝）。 */
export function tuningSnapshot(): Record<number, ChapterTuning> {
    ensureLoaded();
    const out: Record<number, ChapterTuning> = {};
    for (const key of Object.keys(_overrides)) out[Number(key)] = { ..._overrides[Number(key)] };
    return out;
}

/** 内存覆盖表与盘上已保存内容是否一致（false = 有未保存调整，UI 脏标记用）。 */
export function hasUnsavedTuning(): boolean {
    ensureLoaded();
    let savedChapters: Record<string, any> | null = null;
    try {
        const raw = sys.localStorage.getItem(STORAGE_KEY);
        // 损坏存档按"无已保存内容"处理（与 loadTuning 的兜底一致，不得让面板崩）
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object' && parsed.chapters && typeof parsed.chapters === 'object') {
            savedChapters = parsed.chapters;
        }
    } catch (e) { savedChapters = null; }
    const live = tuningSnapshot();
    const savedCount = savedChapters ? Object.keys(savedChapters).length : 0;
    if (savedCount !== Object.keys(live).length) return true;
    if (!savedChapters) return Object.keys(live).length > 0;
    return Object.keys(live).some(k => {
        const s = savedChapters![String(k)];
        return !s || Number(s.stat) !== live[Number(k)].stat
            || Number(s.count) !== live[Number(k)].count
            || Number(s.gold) !== live[Number(k)].gold;
    });
}

/** 测试专用：重置模块内存态（不触碰 localStorage）。 */
export function _resetForTest(): void {
    _overrides = {};
    _loaded = true;
}

// ── 三个读取点（EnemyBase / WaveData / GameManager 金币乘率） ──

/** 怪物血量/伤害系数：基线曲线 × 本关比例。 */
export function tunedStatScale(globalChapterId: number): number {
    return statScaleFor(globalChapterId) * chapterTuning(globalChapterId).stat;
}

/** 每波数量系数：基线曲线 × 本关比例。 */
export function tunedCountScale(globalChapterId: number): number {
    return countScaleFor(globalChapterId) * chapterTuning(globalChapterId).count;
}

/** 单局金币软上限系数：基线曲线 × 本关比例。 */
export function tunedGoldStage(globalChapterId: number): number {
    return goldStageMult(globalChapterId) * chapterTuning(globalChapterId).gold;
}
