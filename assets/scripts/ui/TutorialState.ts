// ============================================================
//  TutorialState.ts — 新手引导纯逻辑（无 cc 依赖，headless 可测）
// ============================================================
// 正式游戏内的新手引导（2026-10-19 玩家定稿：引导在第一局实战中进行，
// 不在首页/设置里展示；设置页只放「开/关」）：
//   · 完成标记是设备/浏览器级（hexblast_tutorial_v1），不进 PlayerProfile；
//   · 播放判定：开关开启 且 未播过 且 设备上没有任何存档（含 legacy 旧档，
//     老玩家升级静默补标记不打扰）→ 在第一局（第 1 章）开战前播放；
//   · 设置开关（hexblast_tutorial_enabled_v1）：缺省=开；关闭后不再播放；
//   · 战斗内提示文案也在此统一定义（页 3 同源的键位/摇杆文案）。
// 视图层在 ui/TutorialUI.ts 与 ui/TutorialHints.ts（不进 headless 编译）。

/**
 * 引导完成标记的存储 key（值 'done'）。
 * v2（2026-10-20）：v1 曾被"老玩家静默补标记"的初版逻辑写死，导致改版后
 * 引导永不触发——升 key 让全体设备重新走一次引导（开关仍可关闭）。
 */
export const TUTORIAL_KEY = 'hexblast_tutorial_v2';

/** 走完整段引导（不跳过）的一次性奖励：核心币（业界惯例：引导阶段给甜头）。 */
export const TUTORIAL_REWARD_COINS = 50;

/** 设置开关的存储 key：值 'on'/'off'，缺省视为开。 */
export const TUTORIAL_ENABLED_KEY = 'hexblast_tutorial_enabled_v1';

/** 可注入存储（默认 globalThis.localStorage，无存储环境退化内存）。 */
export interface TutorialStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const _memStore: Record<string, string> = {};

/** 默认存储：浏览器 localStorage，不可用时退化为进程内 Map（与 AchievementAdmin 同款兜底）。 */
export function defaultTutorialStorage(): TutorialStorage {
    try {
        const ls = (globalThis as any).localStorage;
        if (ls) return ls as TutorialStorage;
    } catch (_e) { /* 非浏览器环境 */ }
    return {
        getItem: (k: string) => (k in _memStore ? _memStore[k] : null),
        setItem: (k: string, v: string) => { _memStore[k] = v; },
    };
}

/** 引导是否已播放过/跳过（标记存在即不再播放）。 */
export function tutorialDone(storage: TutorialStorage): boolean {
    try { return storage.getItem(TUTORIAL_KEY) === 'done'; } catch (_e) { return false; }
}

/** 写入完成标记（完成与跳过同路径；幂等）。 */
export function markTutorialDone(storage: TutorialStorage): void {
    try { storage.setItem(TUTORIAL_KEY, 'done'); } catch (_e) { /* 存储失败下次再问 */ }
}

/** 新手引导开关是否开启（缺省=开）。 */
export function tutorialEnabled(storage: TutorialStorage): boolean {
    try { return storage.getItem(TUTORIAL_ENABLED_KEY) !== 'off'; } catch (_e) { return true; }
}

/** 写入设置开关（on/off）。 */
export function setTutorialEnabled(storage: TutorialStorage, on: boolean): void {
    try { storage.setItem(TUTORIAL_ENABLED_KEY, on ? 'on' : 'off'); } catch (_e) { /* 存储失败保持默认 */ }
}

/**
 * 是否播放正式游戏内引导：开关开启 且 未播过（完成标记设备级，每设备只播一次；
 * 是否要播由设置开关控制，不再按"有无存档"区分新老玩家）。
 */
export function shouldAutoShowTutorial(storage: TutorialStorage): boolean {
    return tutorialEnabled(storage) && !tutorialDone(storage);
}

// ── 战斗内浮字提示（第一局实战引导，见 ui/TutorialHints.ts） ────

/** 提示 1：移动与瞄准（随普攻自动发射的设定，玩家只需走位）。 */
export function tutorialHintMove(isTouch: boolean): string {
    return isTouch ? '左下摇杆移动 · 普攻自动发射，专心走位'
        : 'WASD / 方向键移动 · 鼠标瞄准（普攻自动发射）';
}

/** 提示 2：技能（首次技能就绪时出现）。 */
export function tutorialHintSkill(isTouch: boolean): string {
    return isTouch ? '点右下角 Q 按钮释放技能' : '按 Q 释放技能';
}

/** 提示 3：击杀与拾取（普攻自动，玩家只需命中敌人）。 */
export function tutorialHintKill(): string {
    return '击败敌人，记得拾取金币与装备';
}

// ── 作战大厅步骤提示（引导前段：图鉴 → 成就 → 传送门） ─────────

export function tutorialHintCodex(): string {
    return '打开 情报终端 →「图鉴」，查看敌我与掉落图鉴';
}

export function tutorialHintAchieve(): string {
    return '打开 情报终端 →「成就档案」，查看成就与目标进度';
}

export function tutorialHintPortal(): string {
    return '点击「出击传送门」，选择章节出战';
}

// ── 遮罩聚光式分步引导（2026-10-20 玩家定稿） ────────────────────
// 每页一组步骤：整页置灰、target 高亮挖孔、旁边描述卡 + 「下一步」。
// target 为画布坐标（页面节点均居中于画布，故即页面本地坐标）。

export interface GuideTarget { x: number; y: number; w: number; h: number; }

export interface GuideStepDef {
    title: string;
    text: string;
    target: GuideTarget;
    /** 描述卡相对高亮区的方位，缺省 below。 */
    side?: 'below' | 'above' | 'left' | 'right';
}

/** 作战大厅 5 步：档案 → 传送门 → 图鉴 → 成就 → 装备库。 */
export function lobbyGuideSteps(): GuideStepDef[] {
    return [
        {
            title: '欢迎来到 HEXBLAST',
            text: '顶视角射击 Roguelite：一局一章 15 波，击杀拾取金币装备，波间用海克斯强化滚雪球。这里是你的当前档案，点「切换档案」可随时更换。',
            target: { x: -431, y: 90, w: 334, h: 272 },
            side: 'right',
        },
        {
            title: '出击传送门',
            text: '从这里出击：依次选择战区地图 → 章节 → 难度 → 出战英雄。',
            target: { x: 430, y: -20, w: 360, h: 460 },
            side: 'left',
        },
        {
            title: '情报终端 · 图鉴',
            text: '图鉴收录敌人、英雄与掉落信息，遇到不认识的点开看。',
            target: { x: -431, y: -86, w: 334, h: 54 },
            side: 'right',
        },
        {
            title: '情报终端 · 成就档案',
            text: '成就与目标进度都在这里，完成后直接领核心币。',
            target: { x: -431, y: -154, w: 334, h: 54 },
            side: 'right',
        },
        {
            title: '装备库',
            text: '跨局永久装备：穿戴出战格强化属性，不需要的可卖出换核心币。',
            target: { x: -431, y: -222, w: 334, h: 50 },
            side: 'right',
        },
    ];
}

/** 选图页 1 步：点击战区卡。 */
export function mapGuideSteps(): GuideStepDef[] {
    return [
        {
            title: '选择战区地图',
            text: '点击战区卡进入该图的章节列表；通关整张图解锁下一张。',
            target: { x: -380, y: 93, w: 356, h: 222 },
            side: 'right',
        },
    ];
}

/** 章节页 1 步：点击章节卡。 */
export function chapterGuideSteps(): GuideStepDef[] {
    return [
        {
            title: '选择章节',
            text: '一局打完一个章节：15 波，第 15 波是关底。点击章节卡出战。',
            target: { x: 214, y: 151, w: 700, h: 75 },
            side: 'below',
        },
    ];
}

/** 难度页 1 步：点击难度卡（首推普通）。 */
export function diffGuideSteps(): GuideStepDef[] {
    return [
        {
            title: '选择作战难度',
            text: '难度只影响怪物数值，移速不变；首次出战推荐「普通」。',
            target: { x: -135, y: -20, w: 270, h: 280 },
            side: 'above',
        },
    ];
}

/** 选人页 1 步：确认出战。 */
export function charGuideSteps(): GuideStepDef[] {
    return [
        {
            title: '选择出战英雄',
            text: '每位英雄有独立被动与 Q/E/R 技能。点「确认出战」开战。',
            target: { x: 365, y: -85, w: 300, h: 64 },
            side: 'left',
        },
    ];
}
