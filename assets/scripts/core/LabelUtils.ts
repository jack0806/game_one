// ============================================================
//  LabelUtils.ts — 文字清晰度统一处理
// ============================================================
//
// 现状根因：项目里所有 Label 全部走 Cocos 引擎默认路径——没有描边
// (enableOutline)、没有加粗(isBold)，小字号文字在色彩丰富的章节背景图/
// 特效贴图衬托下边缘发虚，读起来就是"糊成一片"（用户反馈"文字都很模糊"）。
// Cocos 的抗锯齿由字体渲染器统一处理，代码侧唯一能显著改善描边清晰度的
// 手段就是加黑色描边撑出文字轮廓，这里封装成统一入口，避免每处 Label
// 创建点各写一遍还容易漏改。
//
// 用法：Label 的 fontSize / color 赋值完成后调用 styleLabel(lbl)，
// outlineWidth 会按当前 fontSize 自动选取（大字号描边更粗，小字号避免
// 描边把字形吃掉变成黑团）。

import { Label, Color } from 'cc';

export interface LabelStyleOpts {
    /** 是否加黑色描边，默认 true。 */
    outline?: boolean;
    /** 描边宽度，省略时按 fontSize 自动选取。 */
    outlineWidth?: number;
    /** 描边颜色，默认半透明黑，让描边柔和不生硬。 */
    outlineColor?: Color;
    /** 是否加粗，默认 true——粗体笔画更宽，小字号下轮廓更稳定不易糊。 */
    bold?: boolean;
}

export function styleLabel(lbl: Label, opts: LabelStyleOpts = {}): void {
    lbl.isBold = opts.bold ?? true;
    if (opts.outline ?? true) {
        lbl.enableOutline = true;
        lbl.outlineColor  = opts.outlineColor ?? new Color(0, 0, 0, 200);
        lbl.outlineWidth  = opts.outlineWidth ?? (lbl.fontSize >= 22 ? 3 : 2);
    }
}
