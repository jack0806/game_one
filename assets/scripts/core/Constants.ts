// ============================================================
//  Constants.ts — 全局游戏常量
// ============================================================

export const CANVAS_W = 1280;
export const CANVAS_H = 720;
/** 底部 HUD 保留高度（px）：战斗对象不得进入该区域。 */
export const HUD_RESERVED_HEIGHT = 72;
/** 统一战斗区底边：玩家/敌人/Boss/子弹/金币的活动下界。 */
export const PLAYFIELD_BOTTOM = CANVAS_H - HUD_RESERVED_HEIGHT;
export const DT_MAX   = 0.05;   // 最大帧时间（秒），防止死亡螺旋

export const RARITY_COLOR: Record<string, string> = {
    blue:   '#4488ff',
    purple: '#aa44ff',
    orange: '#ff8800',
    gold:   '#ffd700',
    // 海克斯.docx 稀有度（2026-09-14 新海克斯体系使用）
    silver:    '#a8bccc',
    prismatic: '#ff6ec7',
};

export const RARITY_LABEL: Record<string, string> = {
    blue:   '蓝色',
    purple: '紫色',
    orange: '橙色',
    gold:   '金色',
    // 'gold' 键与旧蓝色系冲突，海克斯的金色沿用 'gold'；银/彩为新增键
    silver:    '银色',
    prismatic: '彩色',
};
