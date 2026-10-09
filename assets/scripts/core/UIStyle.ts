// ============================================================
//  UIStyle.ts — Hexblast 代码原生 UI 视觉组件
// ============================================================
import { Color, Component, Graphics, Node, UITransform } from 'cc';

export interface HexButtonSkin {
    setDisabled(disabled: boolean): void;
}
type ButtonVisualState = 'normal' | 'hover' | 'pressed' | 'disabled';

export interface KeyboardFocusTarget {
    isDisabled(): boolean;
    setFocused(focused: boolean): void;
    activate?(): void;
    onDirection?(direction: -1 | 1): boolean;
}

const keyboardFocusTargets = new WeakMap<Node, KeyboardFocusTarget>();
const keyboardModalScopes = new WeakSet<Node>();

export function keyboardFocusTarget(node: Node): KeyboardFocusTarget | undefined {
    return keyboardFocusTargets.get(node);
}

export function unregisterKeyboardFocus(node: Node): void {
    keyboardFocusTargets.delete(node);
}

export function registerKeyboardModalScope(node: Node): void {
    keyboardModalScopes.add(node);
}

export function isKeyboardModalScope(node: Node): boolean {
    return keyboardModalScopes.has(node);
}

/** 无共用皮肤的卡片、任务节点和滑杆也使用同一种金色键盘焦点框。 */
export function registerKeyboardFocus(
    node: Node, width: number, height: number,
    options: Partial<KeyboardFocusTarget> = {},
): void {
    const ring = new Node('KeyboardFocusRing'); ring.setParent(node);
    const g = ring.addComponent(Graphics);
    keyboardFocusTargets.set(node, {
        isDisabled: () => false,
        setFocused(focused: boolean) {
            g.clear();
            if (!focused) return;
            g.strokeColor = new Color(255, 214, 90, 255);
            g.lineWidth = 3;
            g.roundRect(-width / 2 - 3, -height / 2 - 3, width + 6, height + 6, 10);
            g.stroke();
        },
        ...options,
    });
}

/** A 的圆整控件造型、B 的文字/主体明度。页面与 HUD 共用。 */
export const UI_PALETTE = {
    deep: new Color(20, 34, 53, 255),
    panel: new Color(27, 48, 70, 245),
    text: new Color(238, 244, 250, 255),
    muted: new Color(187, 201, 215, 255),
    cyan: new Color(35, 215, 232, 255),
    danger: new Color(245, 103, 84, 255),
    reward: new Color(255, 200, 92, 255),
};

/** 战斗 HUD 的 A 图轮廓：短切角、黑色装甲外沿与细蓝灰内沿。 */
export function combatOutline(g: Graphics, x: number, y: number, w: number, h: number, cut = 6): void {
    g.moveTo(x + cut, y); g.lineTo(x + w - cut, y);
    g.lineTo(x + w, y + cut); g.lineTo(x + w, y + h - cut);
    g.lineTo(x + w - cut, y + h); g.lineTo(x + cut, y + h);
    g.lineTo(x, y + h - cut); g.lineTo(x, y + cut); g.close();
}

export function drawCombatFrame(g: Graphics, x: number, y: number, w: number, h: number, cut = 6): void {
    // 三层填充避免 Cocos 对重叠宽/窄描边的三角化覆盖，实机仍保留细蓝边。
    g.fillColor = new Color(5, 12, 19, 255);
    combatOutline(g, x - 2, y - 2, w + 4, h + 4, cut + 2); g.fill();
    g.fillColor = new Color(109, 161, 181, 255);
    combatOutline(g, x, y, w, h, cut); g.fill();
    g.fillColor = new Color(9, 20, 29, 244);
    combatOutline(g, x + 1.5, y + 1.5, w - 3, h - 3, Math.max(1, cut - 1.5)); g.fill();
}

/** 方形技能装甲与下方快捷键凸耳；PC 和真实触控键使用同一造型。 */
export function drawCombatSkill(g: Graphics, radius: number, ratio: number): void {
    g.clear();
    const outline = (inset: number) => {
        const half = radius * 1.34 - inset, cut = radius * 0.34, tab = radius * 0.58 - inset;
        g.moveTo(-half + cut, half); g.lineTo(half - cut, half);
        g.lineTo(half, half - cut); g.lineTo(half, -half + cut);
        g.lineTo(half - cut, -half); g.lineTo(tab, -half);
        g.lineTo(tab, -half - 10); g.lineTo(tab - 6, -half - 16);
        g.lineTo(-tab + 6, -half - 16); g.lineTo(-tab, -half - 10);
        g.lineTo(-tab, -half); g.lineTo(-half + cut, -half);
        g.lineTo(-half, -half + cut); g.lineTo(-half, half - cut); g.close();
    };
    g.fillColor = new Color(3, 12, 20, 255); outline(-2); g.fill();
    g.fillColor = new Color(119, 174, 191, 255); outline(0); g.fill();
    g.fillColor = new Color(9, 22, 32, 240); outline(1.5); g.fill();
    g.strokeColor = new Color(25, 49, 63, 255); g.lineWidth = 4;
    g.circle(0, 0, radius); g.stroke();
    if (ratio > 0) {
        g.strokeColor = new Color(61, 241, 248, ratio >= 1 ? 255 : 230); g.lineWidth = 4;
        // A 图从十二点顺时针填充；完整圆单独绘制避免 arc 的同起终点退化。
        if (ratio >= 1) g.circle(0, 0, radius);
        else g.arc(0, 0, radius, Math.PI / 2 - ratio * Math.PI * 2, Math.PI / 2, false);
        g.stroke();
    }
}

/** 普通怪红槽、精英金色装甲边；位置继续取真实动作帧顶部。 */
export function drawCombatEnemyBar(g: Graphics, x: number, y: number, w: number, h: number,
                                   hpRatio: number, elite = false, shieldRatio = 0): void {
    g.fillColor = new Color(5, 13, 20, 255);
    g.roundRect(x - 2, y - 1.5, w + 4, h + 3, 2.5); g.fill();
    if (elite) {
        g.strokeColor = new Color(213, 172, 101, 255); g.lineWidth = 1;
        g.roundRect(x - 2, y - 1.5, w + 4, h + 3, 2.5); g.stroke();
    }
    const width = w * Math.max(0, Math.min(1, hpRatio));
    if (width > 0) {
        g.fillColor = new Color(248, 74, 65, 255); g.roundRect(x, y, width, h, Math.min(1, width / 2)); g.fill();
        g.fillColor = new Color(255, 159, 133, 220); g.fillRect(x + 1, y + h - 1, Math.max(0, width - 2), 1);
    }
    if (shieldRatio > 0) {
        g.fillColor = new Color(69, 193, 247, 255);
        g.fillRect(x, y + h + 2, w * Math.min(1, shieldRatio), 2);
    }
}

/** 暂停与属性入口沿用 A 图的圆整小方框，图标/文字仍独立可操作。 */
export function applyCombatButtonSkin(node: Node, w: number, h: number): void {
    const g = node.addComponent(Graphics);
    let hover = false;
    const draw = () => {
        g.clear();
        g.fillColor = new Color(3, 12, 20, 255);
        g.roundRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 6); g.fill();
        g.fillColor = hover ? UI_PALETTE.cyan : new Color(132, 201, 221, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 4); g.fill();
        g.fillColor = new Color(8, 24, 36, 246);
        g.roundRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, 3); g.fill();
    };
    draw(); attachEnableRedraw(node, () => { hover = false; draw(); });
    node.on(Node.EventType.MOUSE_ENTER, () => { hover = true; draw(); });
    node.on(Node.EventType.MOUSE_LEAVE, () => { hover = false; draw(); });
    // 点击中不缩放节点：皮肤可重绘，点击热区始终与画出的按钮重合。
    keyboardFocusTargets.set(node, {
        isDisabled: () => false,
        setFocused(value: boolean) { hover = value; draw(); },
    });
}

/** 统一圆角面板：每次重绘都保留独立文本/数值节点。 */
export function drawHexPanel(g: Graphics, x: number, y: number, w: number, h: number,
                             accent: Color = UI_PALETTE.cyan, alpha = 242): void {
    const r = Math.max(8, Math.min(18, h * 0.16));
    g.fillColor = new Color(5, 12, 22, Math.round(alpha * 0.48));
    g.roundRect(x + 2, y - 4, w, h, r); g.fill();
    g.fillColor = new Color(UI_PALETTE.panel.r, UI_PALETTE.panel.g, UI_PALETTE.panel.b, alpha);
    g.roundRect(x, y, w, h, r); g.fill();
    g.strokeColor = new Color(accent.r, accent.g, accent.b, 170);
    g.lineWidth = 2;
    g.roundRect(x, y, w, h, r); g.stroke();
    g.strokeColor = new Color(220, 244, 250, 92);
    g.lineWidth = 1;
    g.moveTo(x + r + 6, y + h - 5); g.lineTo(x + w - r - 6, y + h - 5); g.stroke();
}

/**
 * 重绘代理：Graphics 的绘制内容在节点 停用→再激活 后会丢失（渲染数据随
 * onDisable 销毁，重新激活时不会自动重传）——表现就是"底板/遮罩/按钮皮肤
 * 变透明，悬停（触发重绘）才显示"。挂一个空组件在 onEnable（每次激活）时
 * 强制重绘即可根治。按钮皮肤、面板底板、全屏遮罩等一次性 Graphics 都应挂上。
 */
class EnableRedrawRelay extends Component {
    redraw: (() => void) | null = null;
    onEnable() { this.redraw?.(); }
}

/** 给节点挂"激活即重绘"代理：redraw 会在该节点每次 onEnable 时执行。 */
export function attachEnableRedraw(node: Node, redraw: () => void): void {
    try {
        const relay = node.addComponent(EnableRedrawRelay);
        relay.redraw = redraw;
    } catch { /* headless/测试环境无组件系统时忽略 */ }
}

function clippedRect(g: Graphics, w: number, h: number, cut: number, offsetY = 0): void {
    const l = -w / 2, r = w / 2, b = -h / 2 + offsetY, t = h / 2 + offsetY;
    g.moveTo(l + cut, b);
    g.lineTo(r - cut, b);
    g.lineTo(r, b + cut);
    g.lineTo(r, t - cut);
    g.lineTo(r - cut, t);
    g.lineTo(l + cut, t);
    g.lineTo(l, t - cut);
    g.lineTo(l, b + cut);
    g.close();
}

/**
 * 给任意带 UITransform 的 Node 安装统一的海克斯工业按钮皮肤。
 * 视觉由 Graphics 绘制，文字仍是独立 Label，因此可本地化且点击热区永远一致。
 */
export function applyHexButtonSkin(
    node: Node, width: number, height: number, accent: Color, initiallyDisabled = false,
): HexButtonSkin {
    const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    let disabled = initiallyDisabled;
    let state: ButtonVisualState = disabled ? 'disabled' : 'normal';
    let focused = false;
    const cut = Math.max(6, Math.min(10, height * 0.18));

    const draw = () => {
        g.clear();
        const activeAccent = disabled ? new Color(92, 104, 116, 210) : accent;
        const lift = state === 'hover' ? 22 : state === 'pressed' ? -8 : 0;

        // 独立投影 + 双层底板形成厚度，避免“一个带颜色的长方形”。
        g.fillColor = new Color(0, 0, 0, disabled ? 80 : 155);
        clippedRect(g, width, height, cut, -4); g.fill();

        g.fillColor = new Color(20, 37, 55, disabled ? 220 : 246);
        clippedRect(g, width, height, cut); g.fill();

        g.fillColor = new Color(
            Math.min(255, activeAccent.r + lift),
            Math.min(255, activeAccent.g + lift),
            Math.min(255, activeAccent.b + lift),
            disabled ? 20 : state === 'pressed' ? 44 : state === 'hover' ? 58 : 34,
        );
        clippedRect(g, width - 5, height - 5, Math.max(4, cut - 2)); g.fill();

        // 外轮廓、上沿高光和下沿暗边共同形成斜切金属框。
        g.strokeColor = new Color(activeAccent.r, activeAccent.g, activeAccent.b, disabled ? 120 : 235);
        g.lineWidth = state === 'hover' ? 2.5 : 1.8;
        clippedRect(g, width, height, cut); g.stroke();

        const l = -width / 2, r = width / 2, b = -height / 2, t = height / 2;
        g.strokeColor = new Color(220, 245, 255, disabled ? 30 : state === 'hover' ? 150 : 90);
        g.lineWidth = 1;
        g.moveTo(l + cut + 5, t - 4); g.lineTo(r - cut - 5, t - 4); g.stroke();
        g.strokeColor = new Color(0, 0, 0, 150);
        g.moveTo(l + cut + 5, b + 4); g.lineTo(r - cut - 5, b + 4); g.stroke();

        // 两侧短能量槽是全局按钮识别元素，所有页面保持相同位置和比例。
        g.strokeColor = new Color(activeAccent.r, activeAccent.g, activeAccent.b, disabled ? 70 : 210);
        g.lineWidth = 3;
        g.moveTo(l + 5, -height * 0.18); g.lineTo(l + 5, height * 0.18); g.stroke();
        g.moveTo(r - 5, -height * 0.18); g.lineTo(r - 5, height * 0.18); g.stroke();
        if (focused && !disabled) {
            g.strokeColor = new Color(255, 214, 90, 255);
            g.lineWidth = 3;
            clippedRect(g, width + 6, height + 6, cut + 2); g.stroke();
        }
    };

    const setState = (next: ButtonVisualState) => {
        if (disabled && next !== 'disabled') return;
        state = next;
        draw();
    };

    node.on(Node.EventType.MOUSE_ENTER, () => setState('hover'));
    node.on(Node.EventType.MOUSE_LEAVE, () => setState(disabled ? 'disabled' : 'normal'));
    node.on(Node.EventType.TOUCH_START, () => setState('pressed'));
    node.on(Node.EventType.TOUCH_END, () => setState(disabled ? 'disabled' : 'hover'));
    node.on(Node.EventType.TOUCH_CANCEL, () => setState(disabled ? 'disabled' : 'normal'));

    draw();
    // 页面激活时皮肤可能因"隐藏状态下绘制丢失"而不可见，onEnable 强制重绘兜底
    attachEnableRedraw(node, () => {
        state = disabled ? 'disabled' : 'normal';
        focused = false;
        draw();
    });
    keyboardFocusTargets.set(node, {
        isDisabled: () => disabled,
        setFocused(value: boolean) { focused = value && !disabled; draw(); },
    });
    return {
        setDisabled(value: boolean) {
            disabled = value;
            if (disabled) focused = false;
            setState(value ? 'disabled' : 'normal');
        },
    };
}

/** 大尺寸选项卡沿用面板造型，鼠标与触摸状态由同一节点绘制。 */
export function applyHexCardSkin(
    node: Node, width: number, height: number, accent: Color, initiallyDisabled = false,
): HexButtonSkin {
    const g = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    // 放在内容节点之后：缩略图和文字不再截走 MOUSE_ENTER，触摸仍冒泡到卡片。
    const hitArea = new Node('CardHitArea'); hitArea.setParent(node);
    hitArea.addComponent(UITransform).setContentSize(width, height);
    let disabled = initiallyDisabled;
    let state: ButtonVisualState = disabled ? 'disabled' : 'normal';
    let focused = false;
    const radius = Math.max(8, Math.min(18, height * 0.16));
    const draw = () => {
        g.clear();
        drawHexPanel(g, -width / 2, -height / 2, width, height, accent, disabled ? 205 : 246);
        if (disabled) return;
        if (state !== 'normal') {
            g.fillColor = new Color(accent.r, accent.g, accent.b, state === 'pressed' ? 30 : 16);
            g.roundRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, radius - 2);
            g.fill();
            g.strokeColor = new Color(accent.r, accent.g, accent.b, 245);
            g.lineWidth = state === 'pressed' ? 2 : 3;
            g.roundRect(-width / 2, -height / 2, width, height, radius);
            g.stroke();
        }
        if (focused) {
            g.strokeColor = new Color(255, 214, 90, 255);
            g.lineWidth = 3;
            g.roundRect(-width / 2 - 3, -height / 2 - 3, width + 6, height + 6, radius + 3);
            g.stroke();
        }
    };
    const setState = (next: ButtonVisualState) => {
        if (disabled && next !== 'disabled') return;
        state = next;
        draw();
    };
    node.on(Node.EventType.MOUSE_ENTER, () => setState('hover'));
    node.on(Node.EventType.MOUSE_LEAVE, () => setState(disabled ? 'disabled' : 'normal'));
    hitArea.on(Node.EventType.MOUSE_ENTER, () => setState('hover'));
    hitArea.on(Node.EventType.MOUSE_LEAVE, () => setState(disabled ? 'disabled' : 'normal'));
    node.on(Node.EventType.TOUCH_START, () => setState('pressed'));
    node.on(Node.EventType.TOUCH_END, () => setState(disabled ? 'disabled' : 'hover'));
    node.on(Node.EventType.TOUCH_CANCEL, () => setState(disabled ? 'disabled' : 'normal'));
    draw();
    attachEnableRedraw(node, () => {
        state = disabled ? 'disabled' : 'normal';
        focused = false;
        draw();
    });
    keyboardFocusTargets.set(node, {
        isDisabled: () => disabled,
        setFocused(value: boolean) { focused = value && !disabled; draw(); },
    });
    return {
        setDisabled(value: boolean) {
            disabled = value;
            if (disabled) focused = false;
            setState(value ? 'disabled' : 'normal');
        },
    };
}
