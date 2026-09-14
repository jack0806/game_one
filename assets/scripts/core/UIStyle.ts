// ============================================================
//  UIStyle.ts — Hexblast 代码原生 UI 视觉组件
// ============================================================
import { Color, Component, Graphics, Node, Vec3 } from 'cc';

export interface HexButtonSkin {
    setDisabled(disabled: boolean): void;
}
type ButtonVisualState = 'normal' | 'hover' | 'pressed' | 'disabled';

/**
 * 皮肤重绘代理：按钮常在所属页面仍隐藏时创建（如强化弹窗 onLoad），
 * 此时下发的 Graphics 绘制命令在页面激活后会丢失——表现就是
 * "按钮背景/边框看不见，鼠标放上去（触发 hover 重绘）才显示"。
 * 挂一个空组件在 onEnable（每次激活）时强制重绘皮肤即可根治。
 */
class HexSkinRelay extends Component {
    redraw: (() => void) | null = null;
    onEnable() { this.redraw?.(); }
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
    const cut = Math.max(6, Math.min(13, height * 0.24));

    const draw = () => {
        g.clear();
        const activeAccent = disabled ? new Color(92, 104, 116, 210) : accent;
        const lift = state === 'hover' ? 22 : state === 'pressed' ? -8 : 0;

        // 独立投影 + 双层底板形成厚度，避免“一个带颜色的长方形”。
        g.fillColor = new Color(0, 0, 0, disabled ? 80 : 155);
        clippedRect(g, width, height, cut, -4); g.fill();

        g.fillColor = new Color(8, 14, 24, disabled ? 220 : 246);
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
    };

    const setState = (next: ButtonVisualState, scale: number) => {
        if (disabled && next !== 'disabled') return;
        state = next;
        node.setScale(new Vec3(scale, scale, 1));
        draw();
    };

    node.on(Node.EventType.MOUSE_ENTER, () => setState('hover', 1.025));
    node.on(Node.EventType.MOUSE_LEAVE, () => setState(disabled ? 'disabled' : 'normal', 1));
    node.on(Node.EventType.TOUCH_START, () => setState('pressed', 0.975));
    node.on(Node.EventType.TOUCH_END, () => setState(disabled ? 'disabled' : 'hover', disabled ? 1 : 1.025));
    node.on(Node.EventType.TOUCH_CANCEL, () => setState(disabled ? 'disabled' : 'normal', 1));

    draw();
    // 页面激活时皮肤可能因"隐藏状态下绘制丢失"而不可见，onEnable 强制重绘兜底
    try {
        const relay = node.addComponent(HexSkinRelay);
        relay.redraw = draw;
    } catch { /* headless/测试环境无组件系统时忽略 */ }
    return {
        setDisabled(value: boolean) {
            disabled = value;
            setState(value ? 'disabled' : 'normal', 1);
        },
    };
}
