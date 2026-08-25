// ============================================================
//  ScreenFit.ts — 宽屏适配（全面屏手机横屏铺满）
// ============================================================
//  游戏设计分辨率 1280×720（16:9）。全面屏手机横屏约 20:9，比 16:9 更宽：
//  SHOW_ALL 保比例缩放会在左右留黑边。这里按屏幕比例动态选择策略：
//   · 宽高比 ≥ 16:9 → FIXED_HEIGHT：高度锁定 720，可见宽度按比例延展，
//     横向铺满全屏；游戏世界仍以 1280 居中，多出的宽度由背景与边缘UI吸收。
//   · 宽高比 < 16:9（更方的屏幕）→ SHOW_ALL：保高留边，避免裁掉战斗区。
import { view, ResolutionPolicy } from 'cc';
import { CANVAS_W, CANVAS_H } from './Constants';

/** 当前可见设计宽度：宽于16:9时为实际可见宽度（>1280），否则为1280。 */
export function visibleDesignWidth(): number {
    const vis = view.getVisibleSize();
    return Math.max(CANVAS_W, Math.round(vis.width));
}

/** 按当前屏幕比例应用适配策略（窗口尺寸变化后可重复调用）。 */
export function applyScreenPolicy(): void {
    const f = view.getFrameSize();
    const wide = f.width / f.height >= CANVAS_W / CANVAS_H - 1e-3;
    view.setDesignResolutionSize(
        CANVAS_W, CANVAS_H,
        wide ? ResolutionPolicy.FIXED_HEIGHT : ResolutionPolicy.SHOW_ALL,
    );
}
