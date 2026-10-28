// 军需商店与装备库共用的切角装甲、槽位与可交互控件。
import { Color, Graphics, HorizontalTextAlignment, Label, Node, Sprite, UITransform, VerticalTextAlignment } from 'cc';
import { applyAnimationFrame } from './SpriteUtils';
import { styleLabel } from './LabelUtils';
import { attachEnableRedraw, combatOutline, registerKeyboardFocus } from './UIStyle';

export const DEPOT_COLORS = {
    text: new Color(238, 244, 250), muted: new Color(169, 191, 211),
    cyan: new Color(35, 223, 242), gold: new Color(255, 205, 82),
    border: new Color(99, 146, 173), danger: new Color(255, 135, 112),
    qualities: [new Color(161, 182, 196), new Color(43, 179, 244), new Color(193, 105, 246)],
};

export function depotNode(parent: Node, name: string, x: number, y: number, w: number, h: number): Node {
    const node = new Node(name); node.setParent(parent); node.setPosition(x, y);
    node.addComponent(UITransform).setContentSize(w, h);
    return node;
}

export function depotLabel(parent: Node, text: string, x: number, y: number, w: number, h: number,
                           size = 18, color = DEPOT_COLORS.text, left = false): Label {
    const node = depotNode(parent, `Text_${text.slice(0, 12)}`, x, y, w, h);
    const label = node.addComponent(Label);
    label.string = text; label.fontSize = size; label.lineHeight = Math.round(size * 1.35);
    label.horizontalAlign = left ? HorizontalTextAlignment.LEFT : HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER; label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = text.includes('\n'); label.color = color;
    styleLabel(label, { outlineWidth: 1 });
    return label;
}

/** 多层实体底板与细亮边还原概念图中的金属厚度。 */
export function drawDepotPlate(g: Graphics, w: number, h: number, accent: Color, selected = false, hover = false): void {
    g.clear();
    const shape = (inset: number, color: Color) => {
        g.fillColor = color;
        combatOutline(g, -w / 2 + inset, -h / 2 + inset, w - inset * 2, h - inset * 2, Math.max(3, 11 - inset)); g.fill();
    };
    shape(-2, new Color(3, 10, 18));
    shape(0, selected ? DEPOT_COLORS.cyan : accent);
    shape(1.5, new Color(7, 20, 34));
    shape(4, new Color(44, 70, 90));
    shape(5.5, new Color(13, 32, 51, 250));
    if (hover || selected) {
        shape(7, new Color(accent.r, accent.g, accent.b, hover ? 28 : 13));
    }
    const l = -w / 2, r = w / 2, t = h / 2, b = -h / 2;
    g.strokeColor = new Color(151, 190, 213, 140); g.lineWidth = 1;
    g.moveTo(l + 13, t - 4); g.lineTo(r - 13, t - 4); g.stroke();
    g.strokeColor = new Color(0, 5, 12, 255); g.lineWidth = 2;
    g.moveTo(l + 13, b + 4); g.lineTo(r - 13, b + 4); g.stroke();
    // 短角能量槽，不让整块底板变成高饱和霓虹色。
    g.strokeColor = accent; g.lineWidth = selected ? 3 : 2;
    for (const x of [l + 3, r - 3]) {
        g.moveTo(x, t - 21); g.lineTo(x, t - 10); g.stroke();
        g.moveTo(x, b + 10); g.lineTo(x, b + 21); g.stroke();
    }
}

export function depotPlate(parent: Node, name: string, x: number, y: number, w: number, h: number,
                           accent = DEPOT_COLORS.border): Node {
    const node = depotNode(parent, name, x, y, w, h);
    const g = node.addComponent(Graphics);
    const draw = () => drawDepotPlate(g, w, h, accent);
    draw(); attachEnableRedraw(node, draw);
    return node;
}

export function depotControl(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number,
                             onClick: () => void, accent = DEPOT_COLORS.cyan, options: { selected?: boolean; disabled?: boolean; size?: number } = {}): Node {
    const node = depotNode(parent, name, x, y, w, h);
    const g = node.addComponent(Graphics);
    let hovered = false, focused = false, pressed = false;
    const disabled = !!options.disabled;
    const color = disabled ? new Color(73, 96, 115) : accent;
    const draw = () => {
        drawDepotPlate(g, w, h, color, !disabled && (!!options.selected || focused), !disabled && (hovered || pressed));
        if (focused && !disabled) {
            g.strokeColor = DEPOT_COLORS.gold; g.lineWidth = 2;
            combatOutline(g, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 12); g.stroke();
        }
    };
    draw(); attachEnableRedraw(node, draw);
    if (text) depotLabel(node, text, 0, 0, w - 16, h - 4, options.size ?? 18, disabled ? DEPOT_COLORS.muted : DEPOT_COLORS.text);
    registerKeyboardFocus(node, w, h, {
        isDisabled: () => disabled,
        setFocused: value => { focused = value; draw(); },
        activate: () => { if (!disabled) onClick(); },
    });
    node.on(Node.EventType.MOUSE_ENTER, () => { hovered = true; draw(); });
    node.on(Node.EventType.MOUSE_LEAVE, () => { hovered = false; draw(); });
    node.on(Node.EventType.TOUCH_START, () => { pressed = true; draw(); });
    node.on(Node.EventType.TOUCH_CANCEL, () => { pressed = false; draw(); });
    node.on(Node.EventType.TOUCH_END, event => {
        // 槽位内按钮、筛选与网格都各自处理一次，禁止嵌套触摸冒泡重复操作。
        if (event) event.propagationStopped = true;
        pressed = false; draw(); if (!disabled) onClick();
    });
    return node;
}

export function depotBadge(parent: Node, text: string, x: number, y: number, w: number, color: Color): void {
    const node = depotNode(parent, `Badge_${text}`, x, y, w, 23);
    const g = node.addComponent(Graphics);
    const draw = () => {
        g.clear(); g.fillColor = new Color(color.r, color.g, color.b, text === '已出战' ? 245 : 25);
        combatOutline(g, -w / 2, -11.5, w, 23, 5); g.fill();
        g.strokeColor = color; g.lineWidth = 1;
        combatOutline(g, -w / 2, -11.5, w, 23, 5); g.stroke();
    };
    draw(); attachEnableRedraw(node, draw);
    depotLabel(node, text, 0, 0, w - 4, 22, 13, text === '已出战' ? new Color(5, 25, 38) : color);
}

/** 网格切片复用同一纹理；所有加载仍经 SpriteUtils → artPath。 */
export function depotItemArt(parent: Node, tile: number, x: number, y: number, size: number): void {
    const node = depotNode(parent, `ItemArt_${tile}`, x, y, size, size);
    const sprite = node.addComponent(Sprite);
    applyAnimationFrame(sprite, { sheet: 'ui_depot_items', columns: 3, rows: 3, cellSize: 512, loop: false, frames: [] },
        { index: tile, pivot: [0.5, 0.5], seconds: 1 });
}
