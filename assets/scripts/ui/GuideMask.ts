// ============================================================
//  GuideMask.ts — 遮罩聚光式分步引导层（整页置灰 + 目标高亮 + 下一步）
// ============================================================
// 业界标准强引导（2026-10-20 玩家定稿）：
//   · 全屏半透明遮罩，目标功能区域"挖孔"高亮（亮色边框），其余全部置灰；
//   · 高亮区旁边放描述卡（标题 + 说明 + 步骤徽标 + 「下一步」按钮）；
//   · 右上角常驻「跳过引导」；除两个按钮外整层拦截输入，防误触页面；
//   · 每一页一组步骤（ui/TutorialState 的 *GuideSteps()），由 GameManager
//     按"翻页即换组"推进，本类只负责渲染与按钮回调。
// 本文件不进 headless 测试编译，行为断言走源码断言。
import {
    BlockInputEvents, Color, Graphics, HorizontalTextAlignment, Label, Node,
    UITransform, Vec3, VerticalTextAlignment,
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { visibleDesignWidth } from '../core/ScreenFit';
import { applyHexButtonSkin, drawHexPanel, registerKeyboardFocus } from '../core/UIStyle';
import { GuideStepDef } from './TutorialState';

const CARD_W = 420;
const CARD_H = 168;
const HOLE_PAD = 12;

export interface GuideMaskCallbacks {
    /** 点「下一步」（末步按钮文字为「完成」）。 */
    onNext: () => void;
    /** 点「跳过引导」：整段视为已读。 */
    onSkip: () => void;
    onButtonSfx?: () => void;
}

export class GuideMask {
    private readonly _root: Node;
    private readonly _g: Graphics;
    private readonly _title!: Label;
    private readonly _text!: Label;
    private readonly _badge!: Label;
    private readonly _nextLbl!: Label;

    constructor(root: Node, private readonly _cb: GuideMaskCallbacks) {
        this._root = new Node('GuideMask');
        this._root.setParent(root);
        this._root.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        this._root.addComponent(BlockInputEvents);
        this._g = this._root.addComponent(Graphics);

        const card = new Node('Card'); card.setParent(this._root);
        card.addComponent(UITransform).setContentSize(CARD_W, CARD_H);
        const cg = card.addComponent(Graphics);
        const drawCard = () => {
            cg.clear();
            drawHexPanel(cg, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, new Color(70, 200, 220), 250);
        };
        drawCard();

        const mk = (name: string, y: number, w: number, h: number, size: number, color: Color,
                    align = HorizontalTextAlignment.LEFT): Label => {
            const n = new Node(name); n.setParent(card);
            n.setPosition(new Vec3(0, y, 0));
            n.addComponent(UITransform).setContentSize(w, h);
            const l = n.addComponent(Label);
            l.fontSize = size; l.lineHeight = size + 7; l.color = color;
            l.horizontalAlign = align; l.verticalAlign = VerticalTextAlignment.CENTER;
            l.overflow = Label.Overflow.SHRINK; l.enableWrapText = size < 17;
            styleLabel(l, { outline: size >= 20 });
            return l;
        };
        this._badge = mk('Badge', 58, 120, 22, 13, new Color(90, 210, 230, 255), HorizontalTextAlignment.CENTER);
        this._title = mk('Title', 30, CARD_W - 40, 32, 20, new Color(240, 248, 252, 255));
        this._text = mk('Text', -18, CARD_W - 48, 92, 14, new Color(206, 222, 234, 250));

        const next = new Node('NextBtn'); next.setParent(card);
        next.setPosition(new Vec3(CARD_W / 2 - 110, -CARD_H / 2 + 34, 0));
        next.addComponent(UITransform).setContentSize(180, 42);
        applyHexButtonSkin(next, 180, 42, new Color(24, 170, 120, 255));
        const nl = new Node('L'); nl.setParent(next);
        nl.addComponent(UITransform).setContentSize(176, 42);
        this._nextLbl = nl.addComponent(Label);
        this._nextLbl.fontSize = 16;
        this._nextLbl.color = new Color(236, 248, 244, 255);
        styleLabel(this._nextLbl);
        registerKeyboardFocus(next, 180, 42);
        next.on(Node.EventType.TOUCH_END, () => {
            this._root.active = false;
            this._cb.onButtonSfx?.();
            this._cb.onNext();
        }, this);

        const skip = new Node('SkipBtn'); skip.setParent(this._root);
        skip.addComponent(UITransform).setContentSize(130, 36);
        applyHexButtonSkin(skip, 130, 36, new Color(78, 96, 118, 235));
        const sl = new Node('L'); sl.setParent(skip);
        sl.addComponent(UITransform).setContentSize(126, 36);
        const skipLbl = sl.addComponent(Label);
        skipLbl.string = '跳过引导 ›'; skipLbl.fontSize = 13;
        skipLbl.color = new Color(210, 224, 234, 240);
        styleLabel(skipLbl);
        registerKeyboardFocus(skip, 130, 36);
        skip.on(Node.EventType.TOUCH_END, () => {
            this._root.active = false;
            this._cb.onButtonSfx?.();
            this._cb.onSkip();
        }, this);

        this._root.active = false;
    }

    /** 显示第 index 步（1-based）；末步按钮文字为「完成」。 */
    showStep(steps: GuideStepDef[], index: number): void {
        const step = steps[Math.min(index, steps.length - 1) - 1] ?? steps[0];
        const width = visibleDesignWidth();
        this._root.getComponent(UITransform)!.setContentSize(width, 720);
        this._root.setSiblingIndex(this._root.parent!.children.length - 1);

        this._badge.string = `引导 ${index} / ${steps.length}`;
        this._title.string = step.title;
        this._text.string = step.text;
        this._nextLbl.string = index >= steps.length ? '完成' : '下一步';

        // 遮罩：目标四周挖孔（4 块灰矩形拼合），孔缘亮色描边
        const g = this._g;
        g.clear();
        const hw = width / 2, hh = 360;
        const t = step.target;
        const l = Math.max(-hw, t.x - t.w / 2 - HOLE_PAD);
        const r = Math.min(hw, t.x + t.w / 2 + HOLE_PAD);
        const b = Math.max(-hh, t.y - t.h / 2 - HOLE_PAD);
        const tp = Math.min(hh, t.y + t.h / 2 + HOLE_PAD);
        g.fillColor = new Color(4, 8, 15, 205);
        g.fillRect(-hw, tp, width, hh - tp);            // 上
        g.fillRect(-hw, -hh, width, b + hh);            // 下
        g.fillRect(-hw, b, l - (-hw), tp - b);          // 左
        g.fillRect(r, b, hw - r, tp - b);               // 右
        g.strokeColor = new Color(90, 225, 245, 235);
        g.lineWidth = 2.5;
        g.rect(l, b, r - l, tp - b); g.stroke();

        // 描述卡定位：按方位贴高亮区，并钳回画布
        let cx = t.x, cy = t.y;
        const side = step.side ?? 'below';
        if (side === 'below') { cx = t.x; cy = b - 8 - CARD_H / 2; }
        else if (side === 'above') { cx = t.x; cy = tp + 8 + CARD_H / 2; }
        else if (side === 'left') { cx = l - 8 - CARD_W / 2; cy = t.y; }
        else { cx = r + 8 + CARD_W / 2; cy = t.y; }
        cx = Math.max(-hw + CARD_W / 2 + 6, Math.min(hw - CARD_W / 2 - 6, cx));
        cy = Math.max(-hh + CARD_H / 2 + 6, Math.min(hh - CARD_H / 2 - 6, cy));
        const card = this._g.node.getChildByName('Card')!;
        card.setPosition(new Vec3(cx, cy, 0));

        // 跳过按钮贴右上角
        const skip = this._g.node.getChildByName('SkipBtn')!;
        skip.setPosition(new Vec3(width / 2 - 85, 330, 0));

        this._root.active = true;
    }

    hide(): void {
        this._root.active = false;
    }

    get showing(): boolean {
        return this._root.active;
    }
}
