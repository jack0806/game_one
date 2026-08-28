// ============================================================
//  TouchControls.ts — 移动端虚拟操控层（代码构建，无 prefab）
// ============================================================
//  布局对齐王者荣耀习惯：
//   · 左下角常驻静态摇杆：默认停在左下角可见，手指按在左半屏任意处
//     可重新锚定（浮动锚点），松手回到默认位置；
//   · 右下角 Q/E/R 三枚大号圆形技能按钮呈扇形弧排布（大招 R 最大、
//     靠角），带冷却进度环与剩余秒数，按下即触发（与键盘 Q/E/R 同一
//     按下沿语义）；
//   · 右上角「暂停 / 属性」两个按钮，触屏端替代 Esc/M 键；
//   · 竖屏时显示「请横屏游玩」全屏遮罩；移动端浏览器首次触摸时以游戏
//     画布为目标请求全屏并锁定横屏（浏览器要求在用户手势内调用），
//     全屏/旋转完成后多次重设适配，规避画布停在中间视口导致的黑屏。
//  摇杆与技能按钮仅在触屏设备显示（sys.hasFeature(INPUT_TOUCH)）；
//  右上角按钮 PC 端同样显示，方便测试。方向向量与技能边沿经
//  TouchInputBridge 写回 InputManager，与 WASD/QER 合并（键盘优先）。
import {
    _decorator, Component, Node, Graphics, Label, Sprite,
    Color, Vec3, UITransform, sys, Input, input, view, game,
} from 'cc';
import { CANVAS_W, CANVAS_H } from '../core/Constants';
import { visibleDesignWidth, applyScreenPolicy } from '../core/ScreenFit';
import { applyArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';
import { applyHexButtonSkin } from '../core/UIStyle';

// web 全屏/屏幕方向 API 按平台存在，any 声明避免依赖 DOM lib 配置
declare const document: any;
declare const screen: any;
declare const window: any;

const { ccclass } = _decorator;

/**
 * GameManager 注入的输入桥：避免 ui 层直接 import systems 层。
 * InputManager 结构上满足该接口（setStick / fireSkillPressed）。
 */
export interface TouchInputBridge {
    setStick(x: number, y: number): void;
    fireSkillPressed(slot: 'q' | 'e' | 'r'): void;
}

type SkillSlot = 'q' | 'e' | 'r';

/**
 * 技能按钮锚点：位置以「可见区右边缘」为基准（fromRight 为相对右缘的偏移），
 * 全面屏横向延展后按钮仍贴住物理右缘；y 为根节点本地纵坐标。
 * 1280 宽时换算结果与固定布局一致：Q(290,-240) E(400,-195) R(530,-170)。
 */
const SKILL_ANCHORS: Record<SkillSlot, { fromRight: number; y: number; r: number }> = {
    q: { fromRight: -350, y: -240, r: 52 },
    e: { fromRight: -240, y: -195, r: 52 },
    r: { fromRight: -110, y: -170, r: 64 },
};

interface SkillButtonView {
    slot: SkillSlot;
    node: Node;
    gfx: Graphics;
    icon: Sprite;
    cdLabel: Label;
    radius: number;
}

@ccclass('TouchControls')
export class TouchControls extends Component {
    // callbacks / 注入（由 GameManager 接线）
    onPausePressed?: () => void;
    onStatsPressed?: () => void;
    onButtonSfx?: () => void;
    /** 适配策略重设/边缘控件重排完成后回调（GameManager 铺满战斗背景用）。 */
    onViewResized?: () => void;

    private _input?: TouchInputBridge;
    private _playerGetter?: () => any;

    private _stickZone!: Node;
    private _joyRoot!: Node;
    private _joyBaseGfx!: Graphics;
    private _joyKnob!: Node;
    private _joyActive = false;
    private _joyBaseX = 0;
    private _joyBaseY = 0;
    /** 摇杆常驻默认位置（左下角，根节点本地坐标；随可见宽度重排）。 */
    private _joyHomeX = -450;
    private _joyHomeY = -190;
    /** 右上角系统按钮（随可见宽度重排）。 */
    private _topRightBtns: Node[] = [];
    /** 竖屏提示遮罩（触屏端）。 */
    private _rotateHint!: Node;
    /** 用户点「继续游戏」后不再弹竖屏遮罩（本局会话内）。 */
    private _hintDismissed = false;
    /** 全屏/横屏锁定成功后不再重复请求（失败可重试）。 */
    private _fsRequested = false;
    /** window 引用（web 事件监听/注销用）。 */
    private _win: any;
    private _layoutTimer: any = null;

    private _skillBtns: SkillButtonView[] = [];
    /** 测试房底部有96px单位工具条，触控摇杆与技能弧整体上移避免遮挡/抢事件。 */
    private _testRoomMode = false;

    /** 摇杆最大拖动半径（超出按边缘方向钳制）。 */
    private readonly STICK_R = 84;
    private readonly KNOB_R   = 36;

    /** 触屏设备才显示摇杆与技能按钮；右上角系统按钮两端都显示。 */
    private readonly _touchMode = sys.hasFeature(sys.Feature.INPUT_TOUCH);

    setInput(bridge: TouchInputBridge): void { this._input = bridge; }
    setPlayerGetter(getter: () => any): void { this._playerGetter = getter; }
    setTestRoomMode(on: boolean): void {
        if (this._testRoomMode === on) return;
        this._testRoomMode = on;
        this._layoutByVisible();
    }

    onLoad() {
        this.node.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
        this._buildTopRightButtons();
        // 全屏/旋转/窗口尺寸变化（PC与触屏都要）→ 去抖后重设适配并重排边缘控件
        this._win = typeof window !== 'undefined' ? window : undefined;
        // 画布跟随浏览器窗口尺寸（进/出全屏、旋转后能自动重算）
        view.resizeWithBrowserSize(true);
        this._win?.addEventListener?.('fullscreenchange', this._onViewChange);
        this._win?.addEventListener?.('orientationchange', this._onViewChange);
        this._win?.addEventListener?.('resize', this._onViewChange);
        if (this._touchMode) {
            this._buildStickZone();
            this._buildSkillButtons();
            this._buildRotateHint();
            // 移动端浏览器：首次触摸请求全屏并锁定横屏（需在用户手势内触发）
            input.on(Input.EventType.TOUCH_START, this._tryFullscreen, this);
        }
        this._layoutByVisible();
    }

    onDestroy(): void {
        if (this._touchMode) input.off(Input.EventType.TOUCH_START, this._tryFullscreen, this);
        this._win?.removeEventListener?.('fullscreenchange', this._onViewChange);
        this._win?.removeEventListener?.('orientationchange', this._onViewChange);
        this._win?.removeEventListener?.('resize', this._onViewChange);
        if (this._layoutTimer) clearTimeout(this._layoutTimer);
    }

    /** 竖屏时全屏提示旋转（触屏端每帧检测物理画布比例；用户选择继续后不再弹）。 */
    update() {
        if (!this._touchMode || !this._rotateHint) return;
        const f = view.getFrameSize();
        this._rotateHint.active = !this._hintDismissed && f.height > f.width;
    }

    /** 全屏/旋转的 resize 会连发多帧，去抖后统一重排。 */
    private _onViewChange = () => {
        if (this._layoutTimer) clearTimeout(this._layoutTimer);
        this._layoutTimer = setTimeout(() => {
            view.resizeWithBrowserSize(true);
            applyScreenPolicy();
            this._layoutByVisible();
            this.onViewResized?.();
        }, 80);
    };

    /**
     * 按当前可见宽度重排所有贴边控件：摇杆/触摸区贴左缘，技能按钮与右上角
     * 系统按钮贴右缘。1280 宽（16:9）时与固定布局完全一致。
     */
    private _layoutByVisible() {
        const right = visibleDesignWidth() / 2;
        // 右上角系统按钮贴可见右缘
        if (this._topRightBtns.length >= 2) {
            this._topRightBtns[0].setPosition(new Vec3(right - 88, 322, 0));
            this._topRightBtns[1].setPosition(new Vec3(right - 32, 322, 0));
        }
        if (!this._touchMode) return;
        // 左半屏触摸区：从可见左缘延伸到中线右侧80px处
        this._stickZone.setPosition(new Vec3(-(right + 80) / 2, -70, 0));
        this._stickZone.getComponent(UITransform)!.setContentSize(right - 80, 580);
        // 摇杆常驻位贴左下角
        this._joyHomeX = -right + 190;
        this._joyHomeY = this._testRoomMode ? -80 : -190;
        if (!this._joyActive) this._joyRoot.setPosition(new Vec3(this._joyHomeX, this._joyHomeY, 0));
        // 技能按钮贴右缘（左低右高曲线不变）
        for (const btn of this._skillBtns) {
            const a = SKILL_ANCHORS[btn.slot];
            btn.node.setPosition(new Vec3(
                right + a.fromRight,
                // Cocos 本地Y轴向上；测试房用+110把整组技能键抬离底栏分页区，
                // 同时保留右下角弧形层级，不让大招键或冷却环被画布裁切。
                a.y + (this._testRoomMode ? 110 : 0),
                0,
            ));
        }
        // 竖屏遮罩铺满可见区（遮罩矩形绘制时已用超大宽度，无需重画）
        this._rotateHint.getComponent(UITransform)!.setContentSize(right * 2, CANVAS_H);
    }

    // ── 构建 ─────────────────────────────────────────────────

    /** 右上角「暂停 / 属性」：触屏替代 Esc/M，PC 端也可点击。位置贴可见右缘。 */
    private _buildTopRightButtons() {
        const mk = (text: string, accent: Color, cb: () => void) => {
            const n = new Node(`Btn_${text}`); n.setParent(this.node);
            n.setPosition(new Vec3(552, 322, 0));
            n.addComponent(UITransform).setContentSize(48, 38);
            applyHexButtonSkin(n, 48, 38, accent);
            const ln = new Node('L'); ln.setParent(n);
            ln.addComponent(UITransform).setContentSize(44, 38);
            const lbl = ln.addComponent(Label);
            lbl.string = text;
            lbl.fontSize = 14;
            lbl.color = new Color(235, 246, 250, 255);
            styleLabel(lbl);
            n.on(Node.EventType.TOUCH_END, () => { this.onButtonSfx?.(); cb(); }, this);
            this._topRightBtns.push(n);
        };
        mk('暂停', new Color(70, 90, 130, 255), () => this.onPausePressed?.());
        mk('属性', new Color(40, 150, 190, 255), () => this.onStatsPressed?.());
    }

    /** 左半屏触摸区：按下处生成动态摇杆。 */
    private _buildStickZone() {
        const z = new Node('StickZone'); z.setParent(this.node);
        // 画布左半（local x -640..-80），顶部避开HUD行（y 上限 220）
        z.setPosition(new Vec3(-360, -70, 0));
        z.addComponent(UITransform).setContentSize(560, 580);
        this._stickZone = z;

        // 摇杆视觉：底环 + 摇杆头，默认隐藏
        this._joyRoot = new Node('Joystick'); this._joyRoot.setParent(this.node);
        this._joyRoot.active = false;
        this._joyBaseGfx = this._joyRoot.addComponent(Graphics);

        this._joyKnob = new Node('Knob'); this._joyKnob.setParent(this._joyRoot);
        this._joyKnob.addComponent(UITransform).setContentSize(this.KNOB_R * 2, this.KNOB_R * 2);
        const knobG = this._joyKnob.addComponent(Graphics);
        knobG.fillColor = new Color(210, 230, 245, 220);
        knobG.circle(0, 0, this.KNOB_R); knobG.fill();
        knobG.strokeColor = new Color(240, 250, 255, 235);
        knobG.lineWidth = 2; knobG.circle(0, 0, this.KNOB_R); knobG.stroke();

        z.on(Node.EventType.TOUCH_START, this._onStickStart, this);
        z.on(Node.EventType.TOUCH_MOVE,  this._onStickMove,  this);
        z.on(Node.EventType.TOUCH_END,   this._onStickEnd,   this);
        z.on(Node.EventType.TOUCH_CANCEL, this._onStickEnd,  this);

        // 静态摇杆常驻左下角；触摸左半屏任意位置时重新锚定到手指处
        this._joyRoot.setPosition(new Vec3(this._joyHomeX, this._joyHomeY, 0));
        this._joyRoot.active = true;
        this._drawJoyBase();
    }

    /** 竖屏提示遮罩：压暗 + 旋转图标 + 文案 + 「继续游戏」逃生按钮（绝不困死在遮罩上）。 */
    private _buildRotateHint() {
        const n = new Node('RotateHint'); n.setParent(this.node);
        n.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(4, 6, 12, 246);
        // 超宽矩形绘制（±1600）：可见宽度变化时无需重画
        g.fillRect(-1600, -CANVAS_H / 2, 3200, CANVAS_H);

        const ln = new Node('L'); ln.setParent(n);
        ln.setPosition(new Vec3(0, 96, 0));
        ln.addComponent(UITransform).setContentSize(460, 54);
        const lbl = ln.addComponent(Label);
        lbl.string = '请横屏游玩';
        lbl.fontSize = 34;
        lbl.color = new Color(235, 246, 250, 255);
        styleLabel(lbl);

        // 旋转图标：竖置手机外框 + 环形箭头
        const iconN = new Node('Icon'); iconN.setParent(n);
        iconN.setPosition(new Vec3(0, 18, 0));
        iconN.addComponent(UITransform).setContentSize(140, 120);
        const ig = iconN.addComponent(Graphics);
        ig.strokeColor = new Color(120, 200, 235, 225);
        ig.lineWidth = 4;
        ig.roundRect(-26, -46, 52, 92, 8); ig.stroke();
        ig.arc(0, 2, 46, -0.35, Math.PI * 1.05, false); ig.stroke();
        ig.fillColor = new Color(120, 200, 235, 235);
        ig.circle(Math.cos(Math.PI * 1.05) * 46, 2 + Math.sin(Math.PI * 1.05) * 46, 7); ig.fill();

        const sub = new Node('S'); sub.setParent(n);
        sub.setPosition(new Vec3(0, -56, 0));
        sub.addComponent(UITransform).setContentSize(520, 36);
        const sl = sub.addComponent(Label);
        sl.string = '点击屏幕进入全屏并锁定横屏；微信内请旋转设备';
        sl.fontSize = 16;
        sl.color = new Color(172, 192, 212, 235);
        styleLabel(sl);

        // 逃生口：全屏不可用（微信/部分浏览器）时也允许竖屏小窗继续游玩
        const contBtn = this._mkHintButton(n, '继续游戏（竖屏小窗）', 0, -118, 280, 46);
        contBtn.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._hintDismissed = true;
            this._rotateHint.active = false;
        }, this);

        const block = (ev: any) => { ev.propagationStopped = true; };
        n.on(Node.EventType.TOUCH_START, block, this);
        n.on(Node.EventType.TOUCH_END, block, this);
        n.active = false;
        this._rotateHint = n;
    }

    /** 遮罩内按钮：比常规按钮更朴素的描边样式，点击热区与视觉一致。 */
    private _mkHintButton(parent: Node, text: string, x: number, y: number, w: number, h: number): Node {
        const n = new Node(`Btn_${text}`); n.setParent(parent);
        n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(14, 24, 38, 235);
        g.roundRect(-w / 2, -h / 2, w, h, 10); g.fill();
        g.strokeColor = new Color(110, 180, 215, 220);
        g.lineWidth = 1.5; g.roundRect(-w / 2, -h / 2, w, h, 10); g.stroke();
        const ln = new Node('L'); ln.setParent(n);
        ln.addComponent(UITransform).setContentSize(w - 16, h);
        const lbl = ln.addComponent(Label);
        lbl.string = text; lbl.fontSize = 17;
        lbl.color = new Color(225, 240, 250, 255);
        styleLabel(lbl);
        return n;
    }

    /**
     * 触摸时进入全屏并锁定横屏。浏览器要求这两个调用发生在用户手势内，
     * 所以任意首次点按（含菜单按钮）都会触发；不支持的环境静默跳过。
     * 先以游戏画布为目标，失败再退回 documentElement（部分内核只支持
     * 根元素全屏）。只有成功才置 _fsRequested，失败后下一次触摸（含竖屏
     * 遮罩上的点按）会重试；两个目标都不可用时只能物理旋转设备或点
     * 「继续游戏」竖屏小窗。
     */
    private _tryFullscreen(_ev?: any) {
        if (this._fsRequested || !this._touchMode || !sys.isBrowser) return;
        const doc = typeof document !== 'undefined' ? document : undefined;
        if (!doc) { this._fsRequested = true; return; }
        const tryTarget = (t: any): Promise<any> => {
            const req = t?.requestFullscreen || t?.webkitRequestFullscreen;
            return req ? Promise.resolve(req.call(t)) : Promise.reject(new Error('fullscreen api unavailable'));
        };
        tryTarget(game?.canvas).catch(() => tryTarget(doc.documentElement))
            .then(() => {
                this._fsRequested = true;
                const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
                return so?.lock?.('landscape')?.catch?.(() => {});
            })
            .then(() => this._reassertLayout())
            .catch(() => {});
    }

    /**
     * 进全屏→锁横屏→resize 是多步过程，引擎偶尔停在中间视口出现黑屏。
     * 这里立即 + 两个延迟档重设适配策略并重排贴边控件，确保按最终视口
     * 强制重算画布尺寸；GameManager 通过 onViewResized 跟着铺满背景。
     */
    private _reassertLayout() {
        const apply = () => {
            view.resizeWithBrowserSize(true);
            applyScreenPolicy();
            this._layoutByVisible();
            this.onViewResized?.();
        };
        apply();
        setTimeout(apply, 150);
        setTimeout(apply, 400);
    }

    /**
     * 右下角 Q/E/R 技能按钮：左低右高的曲线弧（Q 最低靠左 → R 最高靠右），
     * R 顶部不超过画布底部起约1/3屏高。位置按可见右缘锚定，见 SKILL_ANCHORS。
     */
    private _buildSkillButtons() {
        const defs: SkillSlot[] = ['q', 'e', 'r'];
        for (const slot of defs) {
            const d = SKILL_ANCHORS[slot];
            const n = new Node(`Skill_${slot.toUpperCase()}`); n.setParent(this.node);
            n.setPosition(new Vec3(CANVAS_W / 2 + d.fromRight, d.y, 0));
            n.addComponent(UITransform).setContentSize(d.r * 2, d.r * 2);

            const iconN = new Node('Icon'); iconN.setParent(n);
            const iconSize = d.r * 1.15;
            iconN.addComponent(UITransform).setContentSize(iconSize, iconSize);
            const icon = iconN.addComponent(Sprite);
            icon.sizeMode = Sprite.SizeMode.CUSTOM;

            const cdN = new Node('Cd'); cdN.setParent(n);
            cdN.addComponent(UITransform).setContentSize(d.r * 2, d.r * 2);
            const cdLabel = cdN.addComponent(Label);
            cdLabel.fontSize = Math.round(d.r * 0.55);
            cdLabel.color = new Color(255, 240, 200, 255);
            styleLabel(cdLabel);

            const view: SkillButtonView = {
                slot, node: n, gfx: n.addComponent(Graphics),
                icon, cdLabel, radius: d.r,
            };
            this._skillBtns.push(view);

            // 王者习惯：按下即出手（TOUCH_START），不是抬起才触发
            n.on(Node.EventType.TOUCH_START, () => {
                n.setScale(new Vec3(0.92, 0.92, 1));
                this._input?.fireSkillPressed(slot);
                this.onButtonSfx?.();
            }, this);
            n.on(Node.EventType.TOUCH_END,   () => n.setScale(Vec3.ONE), this);
            n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(Vec3.ONE), this);
        }
    }

    // ── 摇杆事件 ─────────────────────────────────────────────

    /** UI 触点坐标（左下原点、y向上）→ 根节点本地坐标（中心原点）。 */
    private _toLocal(ev: any): { x: number; y: number } {
        const loc = ev.getUILocation ? ev.getUILocation() : ev.getLocation();
        return { x: loc.x - CANVAS_W / 2, y: loc.y - CANVAS_H / 2 };
    }

    private _onStickStart(ev: any) {
        const p = this._toLocal(ev);
        this._joyActive = true;
        this._joyBaseX = p.x; this._joyBaseY = p.y;
        this._joyRoot.setPosition(new Vec3(p.x, p.y, 0));
        this._joyRoot.active = true;
        this._joyKnob.setPosition(Vec3.ZERO);
        this._drawJoyBase();
    }

    private _onStickMove(ev: any) {
        if (!this._joyActive) return;
        const p = this._toLocal(ev);
        let dx = p.x - this._joyBaseX, dy = p.y - this._joyBaseY;
        const len = Math.hypot(dx, dy);
        if (len > this.STICK_R) { dx = dx / len * this.STICK_R; dy = dy / len * this.STICK_R; }
        this._joyKnob.setPosition(new Vec3(dx, dy, 0));
        // UI坐标y向上，画布moveY向下为正（S键方向），取负
        this._input?.setStick(dx / this.STICK_R, -dy / this.STICK_R);
    }

    private _onStickEnd(_ev: any) {
        this._joyActive = false;
        // 松手后摇杆回到左下角默认位置并保持可见（静态摇杆），不隐藏
        this._joyRoot.setPosition(new Vec3(this._joyHomeX, this._joyHomeY, 0));
        this._joyKnob.setPosition(Vec3.ZERO);
        this._joyRoot.active = true;
        this._input?.setStick(0, 0);
    }

    private _drawJoyBase() {
        const g = this._joyBaseGfx;
        g.clear();
        g.fillColor = new Color(16, 24, 38, 110);
        g.circle(0, 0, this.STICK_R); g.fill();
        g.strokeColor = new Color(140, 180, 220, 150);
        g.lineWidth = 2.5; g.circle(0, 0, this.STICK_R); g.stroke();
        g.strokeColor = new Color(140, 180, 220, 80);
        g.lineWidth = 1.5; g.circle(0, 0, this.STICK_R * 0.55); g.stroke();
    }

    // ── 每帧刷新（GameManager 战斗渲染帧调用） ────────────────

    /** 按玩家当前技能状态刷新按钮冷却环/图标/数字（与HUD技能环同数据源）。 */
    refresh(player: any) {
        if (!this._touchMode || !player) return;
        const states = player.getSkillStates?.();
        if (!states) return;
        const charCol = Color.fromHEX(new Color(), player.color ?? '#00ffcc');

        for (let i = 0; i < this._skillBtns.length; i++) {
            const btn = this._skillBtns[i];
            const sk = states[i];
            const g = btn.gfx;
            g.clear();
            if (!sk) continue;
            applyArtSprite(btn.icon, `ui_icon_${sk.icon}`);

            const ratio = sk.maxCd > 0 ? Math.max(0, Math.min(1, 1 - sk.cd / sk.maxCd)) : 1;
            const ready = ratio >= 1;
            const r = btn.radius;

            // 底盘
            g.fillColor = ready ? new Color(14, 22, 34, 215) : new Color(10, 14, 22, 235);
            g.circle(0, 0, r); g.fill();

            // 冷却进度环：就绪亮角色色，未就绪暗金
            g.lineWidth = 4.5;
            g.strokeColor = ready
                ? new Color(charCol.r, charCol.g, charCol.b, 255)
                : new Color(185, 150, 70, 220);
            g.arc(0, 0, r - 3, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false);
            g.stroke();

            // 外沿
            g.strokeColor = new Color(charCol.r, charCol.g, charCol.b, ready ? 200 : 90);
            g.lineWidth = 2; g.circle(0, 0, r); g.stroke();

            // 未就绪：数字覆盖层（Q/E为剩余秒数，R为充能百分比）
            btn.cdLabel.string = ready ? '' : (btn.slot === 'r'
                ? `${Math.round(ratio * 100)}%`
                : `${Math.max(1, Math.ceil(sk.cd))}`);
            btn.icon.color = ready ? new Color(255, 255, 255, 255) : new Color(140, 140, 140, 210);
        }
    }
}
