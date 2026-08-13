// ============================================================
//  Constants.ts — 全局游戏常量
// ============================================================

export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const DT_MAX   = 0.05;   // 最大帧时间（秒），防止死亡螺旋

export const RARITY_COLOR: Record<string, string> = {
    blue:   '#4488ff',
    purple: '#aa44ff',
    orange: '#ff8800',
    gold:   '#ffd700',
};

export const RARITY_LABEL: Record<string, string> = {
    blue:   '蓝色',
    purple: '紫色',
    orange: '橙色',
    gold:   '金色',
};

/** 章节 Boss 波次偏移（每章10波，第10波为Boss） */
export const BOSS_WAVE_OFFSET = 10;

/** 无尽模式起始波次 */
export const ENDLESS_START_WAVE = 41;
