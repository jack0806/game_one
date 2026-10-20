// ============================================================
//  TutorialHints.ts — 第一局实战引导的分步提示条（非阻塞，可跳过）
// ============================================================
// 正式游戏内新手引导的第二段（图文卡见 ui/TutorialUI.ts）。参考业界分步
// 强引导做法（步骤标记 x/N + 条件达成打 ✓ 进下一步 + 可随时跳过）：
//   · showStep(step, total, text, done)——【引导 x/N】徽标 + 文案，条件达成
//     时带 ✓ 停留一拍再进下一步（步进逻辑在 GameManager，本类只负责显示）；
//   · 右侧常驻「跳过引导」小按钮：点击即结束整段引导（回调交 GameManager
//     写标记与发完成奖励）；
//   · 不挂输入遮挡——除跳过按钮外点击全部穿透，不打断战斗。
// 本文件不进 headless 测试编译，行为断言走源码断言。
import {
    Color, Graphics, HorizontalTextAlignment, Label, Node,
    UITransform, Vec3, VerticalTextAlignment,
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { drawHexPanel, applyHexButtonSkin, registerKeyboardFocus } from '../core/UIStyle';

const BAR_W = 700;
const BAR_H = 44;

export interface TutorialHintCallbacks {
    /** 点击「跳过引导」：结束整段引导（写标记与奖励由接管方处理）。 */
    onSkip: () => void;
    onButtonSfx?: () => void;
}

export class TutorialHints {
    private readonly _root: Node;
    private readonly _label: Label;
    private readonly _g: Graphics;

    constructor(root: Node, cb: TutorialHintCallbacks) {
        this._root = new Node('TutorialHints');
        this._root.setParent(root);
        this._root.setPosition(new Vec3(0, 236, 0));
        this._root.addComponent(UITransform).setContentSize(BAR_W, BAR_H);
        this._g = this._root.addComponent(Graphics);
        this._drawBar();
        const ln = new Node('L'); ln.setParent(this._root);
        ln.setPosition(new Vec3(-30, 0, 0));
        ln.addComponent(UITransform).setContentSize(BAR_W - 130, BAR_H);
        this._label = ln.addComponent(Label);
        this._label.fontSize = 16;
        this._label.lineHeight = 22;
        this._label.color = new Color(238, 246, 252, 255);
        this._label.horizontalAlign = HorizontalTextAlignment.CENTER;
        this._label.verticalAlign = VerticalTextAlignment.CENTER;
        this._label.overflow = Label.Overflow.SHRINK;
        styleLabel(this._label, { outline: false });

        // 跳过引导：小按钮挂在提示条右端（唯一可点击元素）
        const skip = new Node('SkipBtn'); skip.setParent(this._root);
        skip.setPosition(new Vec3(BAR_W / 2 - 62, 0, 0));
        skip.addComponent(UITransform).setContentSize(112, 32);
        applyHexButtonSkin(skip, 112, 32, new Color(78, 96, 118, 235));
        const sl = new Node('L'); sl.setParent(skip);
        sl.addComponent(UITransform).setContentSize(108, 32);
        const skipLbl = sl.addComponent(Label);
        skipLbl.string = '跳过引导 ›'; skipLbl.fontSize = 13;
        skipLbl.color = new Color(220, 232, 240, 255);
        styleLabel(skipLbl);
        skip.on(Node.EventType.TOUCH_END, () => {
            this._root.active = false;
            cb.onButtonSfx?.();
            cb.onSkip();
        }, this);
        registerKeyboardFocus(skip, 112, 32);

        this._root.active = false;
    }

    /** 显示一步：step 从 1 计；done=条件已达成（文案带 ✓，停留一拍再进下一步）。 */
    showStep(step: number, total: number, text: string, done = false): void {
        this._label.string = `【引导 ${step}/${total}】${text}${done ? '  ✓' : ''}`;
        this._label.color = done ? new Color(150, 255, 190, 255) : new Color(238, 246, 252, 255);
        this._root.active = true;
    }

    /** 行动门提示：等玩家实操时的纯文案（无步骤徽标）。 */
    showGate(text: string): void {
        this._label.string = text;
        this._label.color = new Color(255, 224, 130, 255);
        this._root.active = true;
    }

    hide(): void {
        this._root.active = false;
    }

    get showing(): boolean {
        return this._root.active;
    }

    private _drawBar(): void {
        this._g.clear();
        drawHexPanel(this._g, -BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, new Color(20, 46, 66, 228), 242);
        this._g.strokeColor = new Color(70, 200, 220, 190);
        this._g.lineWidth = 1.5;
        this._g.rect(-BAR_W / 2 + 4, -BAR_H / 2 + 4, BAR_W - 8, BAR_H - 8);
        this._g.stroke();
    }
}
