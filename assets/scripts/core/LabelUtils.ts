// ============================================================
//  LabelUtils.ts — 文字清晰度统一处理
// ============================================================
//
// 界面统一使用项目内简体中文 TTF，避免各设备以不同系统字体代替。
// 已创建的页面标签在字体异步载入后统一切换；之后新建的标签由 styleLabel
// 直接绑定。小字号和战斗浮字的描边仍由此处统一控制。
//
// 用法：Label 的 fontSize / color 赋值完成后调用 styleLabel(lbl)，
// outlineWidth 会按当前 fontSize 自动选取（大字号描边更粗，小字号避免
// 描边把字形吃掉变成黑团）。

import { Label, Color, Font, Node, resources } from 'cc';

let uiFont: Font | null = null;

/** 启动时载入项目内字体；异步完成后更新已创建的全部页面标签。 */
export function loadUIFont(root: Node): void {
    resources.load('fonts/NotoSansSC-Regular', Font, (err, font) => {
        if (err || !font) {
            console.warn('[LabelUtils] 无法加载界面字体', err);
            return;
        }
        uiFont = font;
        const applyToTree = (node: Node) => {
            if (!node.isValid) return;
            const label = node.getComponent(Label);
            if (label?.isValid) label.font = font;
            for (const child of node.children) applyToTree(child);
        };
        applyToTree(root);
    });
}

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
    if (uiFont) lbl.font = uiFont;
    lbl.isBold = opts.bold ?? true;
    if (opts.outline ?? true) {
        lbl.enableOutline = true;
        lbl.outlineColor  = opts.outlineColor ?? new Color(0, 0, 0, 145);
        lbl.outlineWidth  = opts.outlineWidth ?? (lbl.fontSize >= 22 ? 2 : 1);
    }
}

/**
 * 强制刷新子树内全部 Label 的字形渲染数据。
 * 窗口最大化/还原/进全屏后，画布缩放变化但 Label 的字形纹理与渲染数据
 * 可能停留在旧尺寸（用户反馈"字体不会跟着刷新"）：这里对每个 Label 做
 * 一次 fontSize +1 再写回的脏标记（两次触发重建）并 markForUpdateRenderData
 * 提交重绘，让文字按新缩放重新光栅化。仅在 resize 等低频事件调用。
 */
export function refreshAllLabels(root: Node): void {
    if (!root || !root.isValid) return;
    const lbl = root.getComponent(Label);
    if (lbl && lbl.isValid) {
        const fs = lbl.fontSize;
        if (fs > 0) {
            lbl.fontSize = fs + 1;
            lbl.fontSize = fs;
        }
        lbl.markForUpdateRenderData?.();
    }
    const children = root.children;
    for (let i = 0; i < children.length; i++) refreshAllLabels(children[i]);
}
