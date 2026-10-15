// ============================================================
//  AdminUI.ts — 后台管理面板（管理员专用：系统参数 + 成就管理）
// ============================================================
// 入口：首页/暂停的设置页「后台管理」按钮（ScreenManager 接线）。
// 非管理员先见密码门（默认 hex2026，GameConfig 持久化），验证通过后
// 本机记住管理员身份（localStorage hexblast_admin_v1），可随时退出。
// 页签1 系统参数：GameConfig 注册表驱动的滑条列表，即改即存；
// 页签2 成就管理：分类（可新建）+ 成就列表 + 新增/编辑/下架/删除表单，
// 数据走 AchievementAdmin，成就墙与局末判定即时生效。
// 全代码构建不依赖 prefab；测试仅做源码断言，不实例化本类。

import {
    BlockInputEvents, Color, EditBox, Graphics, HorizontalTextAlignment, Label,
    Mask, Node, UITransform, Vec3, VerticalTextAlignment, sys,
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { visibleDesignWidth } from '../core/ScreenFit';
import { applyHexButtonSkin, drawHexPanel, HexButtonSkin, UI_PALETTE } from '../core/UIStyle';
import { CONFIG_ITEMS, ConfigItemDef, GameConfig } from '../data/GameConfig';
import { AchievementAdmin, DEFAULT_ACHIEVEMENT_CATEGORIES } from '../systems/AchievementAdmin';
import { ACHIEVEMENT_STAT_FIELDS, SaveSystem } from '../systems/SaveSystem';

const ADMIN_KEY = 'hexblast_admin_v1';
const RARITIES: AchievementRarity[] = ['普通', '稀有', '史诗', '传奇'];
type AchievementRarity = '普通' | '稀有' | '史诗' | '传奇';

/** 管理员身份存取（设备级；验证通过后本机免密进入）。 */
export function isAdminUnlocked(): boolean {
    try { return (globalThis as any).localStorage?.getItem(ADMIN_KEY) === '1'; } catch (_e) { return false; }
}
export function setAdminUnlocked(v: boolean): void {
    try {
        const ls = (globalThis as any).localStorage;
        if (!ls) return;
        if (v) ls.setItem(ADMIN_KEY, '1'); else ls.removeItem(ADMIN_KEY);
    } catch (_e) { /* 忽略 */ }
}

const WHITE = new Color(232, 244, 250, 255);
const MUTED = new Color(145, 166, 184, 255);
const GOLD = new Color(255, 205, 82, 255);
const PURPLE = new Color(150, 108, 220, 255);
const RARITY_COLOR: Record<string, Color> = {
    普通: new Color(143, 167, 184, 255),
    稀有: new Color(68, 170, 255, 255),
    史诗: new Color(176, 96, 255, 255),
    传奇: new Color(255, 208, 90, 255),
};

export interface AdminUICallbacks {
    onClose?: () => void;
    /** 成就数据变化（新增/编辑/下架/删除）后通知，成就墙下次显示即重建。 */
    onAchievementsChanged?: () => void;
}

/** 面板内滚动区：Mask 视口 + 内容节点 + 滚轮/拖拽 + 右缘滚动条（同成就墙实现）。 */
class ScrollArea {
    readonly content: Node;
    private readonly viewport: Node;
    private readonly sb: Graphics;
    private scroll = 0;
    private maxScroll = 0;
    private dragY = 0;
    private dragging = false;

    constructor(parent: Node, x: number, y: number, w: number, h: number) {
        const vp = new Node(`Scroll_${w}x${h}`); vp.setParent(parent);
        vp.setPosition(new Vec3(x, y, 0));
        vp.addComponent(UITransform).setContentSize(w, h);
        const mask = vp.addComponent(Mask); mask.type = Mask.Type.GRAPHICS_STENCIL;
        const mg = vp.addComponent(Graphics);
        mg.fillColor = Color.WHITE; mg.rect(-w / 2, -h / 2, w, h); mg.fill();
        this.viewport = vp;
        // 裸 Node 不会自动带 UITransform，滚动定位与内容高度都依赖它
        this.content = new Node('Content'); this.content.setParent(vp);
        this.content.addComponent(UITransform).setContentSize(w, h);
        const sbN = new Node('SB'); sbN.setParent(parent);
        sbN.setPosition(new Vec3(x + w / 2 + 12, y, 0));
        this.sb = sbN.addComponent(Graphics);

        vp.on(Node.EventType.MOUSE_WHEEL, (ev: any) => {
            this.set(this.scroll - (ev.getScrollY?.() ?? 0) * 0.5);
        }, this);
        vp.on(Node.EventType.TOUCH_START, (ev: any) => {
            this.dragging = true;
            this.dragY = ev.getUILocation?.().y ?? 0;
        }, this);
        vp.on(Node.EventType.TOUCH_MOVE, (ev: any) => {
            if (!this.dragging) return;
            const yNow = ev.getUILocation?.().y ?? 0;
            this.set(this.scroll - (yNow - this.dragY));
            this.dragY = yNow;
        }, this);
        vp.on(Node.EventType.TOUCH_END, () => this.dragging = false, this);
        vp.on(Node.EventType.TOUCH_CANCEL, () => this.dragging = false, this);
    }

    /** 设定内容总高并重置到顶部（重建列表后调用）。 */
    setContentHeight(viewH: number, contentH: number): void {
        this.content.getComponent(UITransform)!.setContentSize(100, Math.max(viewH, contentH));
        this.maxScroll = Math.max(0, contentH - viewH);
        this.scroll = 0;
        this.apply(viewH, contentH);
    }

    set(s: number): void {
        this.scroll = Math.max(0, Math.min(this.maxScroll, s));
        const viewH = this.viewport.getComponent(UITransform)!.contentSize.height;
        const contentH = Math.max(viewH, this.content.getComponent(UITransform)!.contentSize.height);
        this.apply(viewH, contentH);
    }

    private apply(viewH: number, contentH: number): void {
        this.content.setPosition(new Vec3(0, (viewH - contentH) / 2 + this.scroll, 0));
        const g = this.sb;
        g.clear();
        if (this.maxScroll <= 0) return;
        const trackH = viewH - 16;
        const thumbH = Math.max(40, trackH * viewH / contentH);
        const t = this.maxScroll > 0 ? this.scroll / this.maxScroll : 0;
        const thumbY = trackH / 2 - thumbH / 2 - t * (trackH - thumbH);
        g.fillColor = new Color(24, 33, 43, 200);
        g.rect(0, -trackH / 2, 4, trackH); g.fill();
        g.fillColor = new Color(255, 205, 82, 190);
        g.rect(-1, thumbY - thumbH / 2, 6, thumbH); g.fill();
    }
}

export class AdminUI {
    private readonly _root: Node;
    private readonly _callbacks: AdminUICallbacks;
    /** 按钮皮肤引用（选择态高亮 setAccent 用）。 */
    private readonly _skins = new Map<Node, HexButtonSkin>();
    private _panel!: Node;
    private _body!: Node;
    private _tab: 'config' | 'achv' = 'config';
    private _achvCategory = DEFAULT_ACHIEVEMENT_CATEGORIES[0];
    /** 新建分类的输入行是否展开。 */
    private _newCategoryOpen = false;
    /** 成就编辑表单：null=关闭；''=新增自建；其他=编辑目标 id（内置或自建）。 */
    private _editingId: string | null = null;
    private _gateStatus?: Label;
    private _configStatus?: Label;

    constructor(parent: Node, callbacks: AdminUICallbacks) {
        this._callbacks = callbacks;
        this._root = new Node('AdminUI'); this._root.setParent(parent);
        this._root.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        const dim = this._root.addComponent(BlockInputEvents);
        void dim;
        const bgN = new Node('Dim'); bgN.setParent(this._root);
        bgN.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        const bg = bgN.addComponent(Graphics);
        const drawDim = () => {
            bg.clear();
            bg.fillColor = new Color(2, 6, 12, 235);
            const w = visibleDesignWidth();
            bg.fillRect(-w / 2, -360, w, 720);
        };
        drawDim();

        this._panel = new Node('Panel'); this._panel.setParent(this._root);
        this._panel.addComponent(UITransform).setContentSize(1120, 660);
        const pg = this._panel.addComponent(Graphics);
        drawHexPanel(pg, -560, -330, 1120, 660, PURPLE, 248);
        this._body = new Node('Body'); this._body.setParent(this._panel);
        this._root.active = false;
    }

    open(): void {
        if (this._root.parent) {
            this._root.setSiblingIndex(this._root.parent.children.length - 1);
        }
        this._root.active = true;
        this._editingId = null;
        this._render();
    }

    close(): void {
        // 先销毁内容再隐藏：EditBox 挂着 Web 端 DOM 输入元素，仅隐藏节点树
        // 可能让 DOM 输入残留屏幕（表现为固定位置的一条横线）
        this._body.destroyAllChildren();
        this._root.active = false;
        this._callbacks.onClose?.();
    }

    // ── 骨架 ──────────────────────────────────────────────────

    private _render(): void {
        this._body.destroyAllChildren();
        // 旧渲染的标签引用随节点销毁一并失效，重置避免残留
        this._gateStatus = undefined;
        this._configStatus = undefined;
        this._mkHeader();
        // 内容框架：与头部（标题/页签）明确分区，页签内容只出现在框架内
        const frame = new Node('ContentFrame'); frame.setParent(this._body);
        frame.setPosition(new Vec3(0, 0, 0));
        frame.addComponent(UITransform).setContentSize(1080, 456);
        const fg = frame.addComponent(Graphics);
        fg.fillColor = new Color(10, 17, 28, 160);
        fg.roundRect(-540, -228, 1080, 456, 10); fg.fill();
        fg.strokeColor = new Color(96, 118, 148, 140);
        fg.lineWidth = 1; fg.roundRect(-540, -228, 1080, 456, 10); fg.stroke();
        // 头部分隔线 + 底部操作条分隔线（_body 自身常驻，重画前先清）
        let hd = this._body.getComponent(Graphics);
        if (!hd) hd = this._body.addComponent(Graphics);
        hd.clear();
        hd.strokeColor = new Color(150, 108, 220, 130);
        hd.lineWidth = 1.5;
        hd.moveTo(-540, 236); hd.lineTo(540, 236); hd.stroke();
        hd.strokeColor = new Color(96, 118, 148, 110);
        hd.lineWidth = 1;
        hd.moveTo(-540, -256); hd.lineTo(540, -256); hd.stroke();
        if (!isAdminUnlocked()) { this._renderGate(); return; }
        if (this._editingId !== null) { this._renderEditForm(); return; }
        if (this._tab === 'config') this._renderConfigTab();
        else this._renderAchievementsTab();
    }

    private _mkHeader(): void {
        const title = this._mkLabel(this._body, -430, 296, 240, 32, '后台管理', 22, GOLD, HorizontalTextAlignment.LEFT);
        void title;
        const tabs: [string, 'config' | 'achv'][] = [['系统参数', 'config'], ['成就管理', 'achv']];
        tabs.forEach(([label, tab], i) => {
            const btn = this._mkButton(this._body, label, -230 + i * 170, 296, 150, 42,
                this._tab === tab ? PURPLE : new Color(60, 78, 96, 255));
            btn.on(Node.EventType.TOUCH_END, () => {
                if (this._tab === tab) return;
                this._tab = tab;
                this._editingId = null;
                this.onButtonSfx();
                this._render();
            }, this);
        });
        if (isAdminUnlocked()) {
            const logout = this._mkButton(this._body, '退出管理员', 366, 296, 130, 42, new Color(120, 70, 60, 255));
            logout.on(Node.EventType.TOUCH_END, () => {
                setAdminUnlocked(false);
                this.onButtonSfx();
                this._render();
            }, this);
        }
        const close = this._mkButton(this._body, '关闭', 488, 296, 90, 42, new Color(60, 100, 80, 255));
        close.on(Node.EventType.TOUCH_END, () => { this.onButtonSfx(); this.close(); }, this);
    }

    /** 密码门：非管理员先验证。 */
    private _renderGate(): void {
        this._mkLabel(this._body, 0, 130, 600, 32, '后台管理', 24, GOLD);
        this._mkLabel(this._body, 0, 92, 620, 22, '请输入管理员密码 · 仅设备持有者使用', 13, MUTED);

        // 密码输入框：带边框的明确输入控件，PASSWORD 旗标输入时打点隐藏明文
        const box = new Node('PwdBox'); box.setParent(this._body);
        box.setPosition(new Vec3(0, 18, 0));
        box.addComponent(UITransform).setContentSize(400, 54);
        const bg = box.addComponent(Graphics);
        bg.fillColor = new Color(8, 13, 22, 245);
        bg.roundRect(-200, -27, 400, 54, 8); bg.fill();
        bg.strokeColor = new Color(150, 108, 220, 230);
        bg.lineWidth = 1.5; bg.roundRect(-200, -27, 400, 54, 8); bg.stroke();
        this._mkLabel(box, -172, 0, 50, 44, '密码', 15, GOLD);
        const eb = this._mkEditBox(box, 18, 0, 300, 46, '点击此处输入密码', '', true);

        const tryLogin = (): void => {
            if (eb.string === GameConfig.getPassword()) {
                setAdminUnlocked(true);
                this.onButtonSfx();
                this._render();
            } else {
                if (this._gateStatus) this._gateStatus.string = '密码错误，请重试';
                this.onButtonSfx();
            }
        };
        const enter = this._mkButton(this._body, '进入后台', 0, -66, 220, 50, PURPLE);
        enter.on(Node.EventType.TOUCH_END, tryLogin, this);
        // 输入框内按回车直接提交
        eb.node.on('editing-return', tryLogin, this);

        this._mkLabel(this._body, 0, -118, 600, 22, '输入内容以 ● 隐藏显示 · 回车或点「进入后台」提交', 12, MUTED);
        const status = this._mkLabel(this._body, 0, -146, 400, 24, '', 14, new Color(255, 120, 110, 255));
        this._gateStatus = status;
    }

    // ── 页签1：系统参数 ───────────────────────────────────────

    private _renderConfigTab(): void {
        // 内容框架（±540 × 228..-228）内滚动，滚动条贴框架右缘
        const scroll = new ScrollArea(this._body, 0, -2, 1008, 436);
        // 注册表驱动：分组连排，每项一行（改即存，无需保存按钮）。
        // 先按行高算出内容总高，再从内容顶部原点逐行绘制。
        let lastGroup = '';
        let contentH = 8;
        for (const item of CONFIG_ITEMS) {
            if (item.group !== lastGroup) { lastGroup = item.group; contentH += 34; }
            contentH += 62;
        }
        scroll.setContentHeight(436, contentH);
        this._drawConfigRows(scroll, contentH);

        // 底部固定操作条：右下角恢复默认（避开左下性能统计面板），密码区居中
        const resetAll = this._mkButton(this._body, '全部恢复默认', 425, -296, 190, 46, new Color(140, 70, 60, 255));
        resetAll.on(Node.EventType.TOUCH_END, () => {
            GameConfig.resetAll();
            if (this._configStatus) this._configStatus.string = '已恢复全部默认';
            this.onButtonSfx();
            this._render();
        }, this);

        this._mkLabel(this._body, -415, -296, 110, 42, '修改密码', 15, WHITE, HorizontalTextAlignment.RIGHT);
        const pw = this._mkEditBox(this._body, -260, -296, 190, 42, '新密码', '', true);
        const saveBtn = this._mkButton(this._body, '保存密码', -105, -296, 110, 42, new Color(70, 105, 130, 255));
        saveBtn.on(Node.EventType.TOUCH_END, () => {
            const v = pw.string.trim();
            if (v) {
                GameConfig.setPassword(v);
                pw.string = '';
                if (this._configStatus) this._configStatus.string = '密码已更新';
            }
            this.onButtonSfx();
        }, this);
        const status = this._mkLabel(this._body, 55, -296, 250, 42, '', 14, GOLD, HorizontalTextAlignment.LEFT);
        this._configStatus = status;
    }

    /** 配置行绘制（content 顶部原点坐标系；y 向下累加）。 */
    private _drawConfigRows(scroll: ScrollArea, contentH: number): void {
        let y = 0;
        let lastGroup = '';
        for (const item of CONFIG_ITEMS) {
            if (item.group !== lastGroup) {
                lastGroup = item.group;
                this._mkLabel(scroll.content, -300, contentH / 2 - y - 14, 400, 26,
                    `▣ ${item.group}`, 16, GOLD, HorizontalTextAlignment.LEFT);
                y += 34;
            }
            this._mkConfigRow(scroll.content, contentH / 2, y, item);
            y += 62;
        }
    }

    /** 单个配置项行：名称+说明 | 滑条（拖动即存） | 数值框（手动改值） | 保存 | 默认。 */
    private _mkConfigRow(parent: Node, contentHalfH: number, topY: number, item: ConfigItemDef): void {
        const row = new Node(`Cfg_${item.key}`); row.setParent(parent);
        row.setPosition(new Vec3(0, contentHalfH - topY - 31, 0));
        row.addComponent(UITransform).setContentSize(1000, 58);

        const modified = GameConfig.isModified(item.key);
        this._mkLabel(row, -300, 8, 300, 24, `${modified ? '● ' : ''}${item.name}`, 15,
            modified ? GOLD : WHITE, HorizontalTextAlignment.LEFT);
        this._mkLabel(row, -300, -14, 340, 20, item.desc, 12, MUTED, HorizontalTextAlignment.LEFT);
        // 行分隔细线，长列表滚动时更易对行
        const sep = row.addComponent(Graphics);
        sep.strokeColor = new Color(255, 255, 255, 16);
        sep.lineWidth = 1;
        sep.moveTo(-470, -27); sep.lineTo(470, -27); sep.stroke();

        // 数值显示/手输框：percent 项以百分数整数显示（20 ↔ 0.2）
        const display = (v: number): string =>
            item.percent ? `${Math.round(v * 100)}` : `${Math.round(v * 100) / 100}`;
        const valueEb = this._mkEditBox(row, 250, 0, 90, 36, '数值', display(GameConfig.get(item.key)), false);

        // 滑条：拖动即写入配置，并同步数值框显示
        this._mkSlider(row, 40, item, GameConfig.get(item.key), v => { valueEb.string = display(v); });

        // 保存：把手动输入写入配置（非法输入忽略），随后刷新行上的修改标记
        const saveBtn = this._mkButton(row, '保存', 330, 0, 60, 34, new Color(60, 110, 90, 255));
        saveBtn.on(Node.EventType.TOUCH_END, () => {
            const num = Number(valueEb.string.trim());
            if (!Number.isFinite(num)) { valueEb.string = display(GameConfig.get(item.key)); return; }
            GameConfig.set(item.key, item.percent ? num / 100 : num);
            valueEb.string = display(GameConfig.get(item.key));
            this.onButtonSfx();
            this._render();
        }, this);

        if (modified) {
            const reset = this._mkButton(row, '默认', 410, 0, 64, 34, new Color(70, 92, 110, 255));
            reset.on(Node.EventType.TOUCH_END, () => {
                GameConfig.reset(item.key);
                this.onButtonSfx();
                this._render();
            }, this);
        }
    }

    /** 数值滑条（值域 min~max，步长 step；拖动即 GameConfig.set 并回调显示同步）。 */
    private _mkSlider(parent: Node, x: number, item: ConfigItemDef, initValue: number,
                      onChanged?: (v: number) => void): void {
        const WIDTH = 300;
        const track = new Node(`Track_${item.key}`); track.setParent(parent);
        track.setPosition(new Vec3(x, 0, 0));
        track.addComponent(UITransform).setContentSize(WIDTH, 46);
        const tg = track.addComponent(Graphics);
        const knob = new Node('Knob'); knob.setParent(track);
        const kg = knob.addComponent(Graphics);

        const ratioOf = (v: number) =>
            (v - item.min) / Math.max(1e-6, item.max - item.min);
        const valueOf = (r: number) => {
            const raw = item.min + r * (item.max - item.min);
            const stepped = Math.round(raw / item.step) * item.step;
            return Math.min(item.max, Math.max(item.min, stepped));
        };

        const draw = (r: number) => {
            tg.clear();
            tg.fillColor = new Color(22, 30, 42, 245);
            tg.fillRect(-WIDTH / 2, -4, WIDTH, 8);
            tg.fillColor = new Color(150, 108, 220, 235);
            tg.fillRect(-WIDTH / 2, -4, WIDTH * r, 8);
            tg.strokeColor = new Color(96, 118, 148, 200);
            tg.lineWidth = 1.5; tg.rect(-WIDTH / 2, -4, WIDTH, 8); tg.stroke();
            kg.clear();
            kg.fillColor = new Color(10, 16, 26, 250);
            kg.circle(0, 0, 12); kg.fill();
            kg.fillColor = new Color(196, 160, 255, 255);
            kg.circle(0, 0, 8); kg.fill();
        };

        const apply = (v: number) => {
            const clamped = Math.min(item.max, Math.max(item.min, v));
            knob.setPosition(new Vec3(-WIDTH / 2 + ratioOf(clamped) * WIDTH, 0, 0));
            draw(ratioOf(clamped));
        };
        apply(initValue);

        const applyFromEvent = (ev: any) => {
            const ui = ev.getUILocation ? ev.getUILocation() : ev.getLocation();
            const local = track.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
            const v = valueOf(Math.min(1, Math.max(0, (local.x + WIDTH / 2) / WIDTH)));
            GameConfig.set(item.key, v);
            apply(v);
            onChanged?.(v);
        };
        track.on(Node.EventType.TOUCH_START, applyFromEvent, this);
        track.on(Node.EventType.TOUCH_MOVE, applyFromEvent, this);
    }

    // ── 页签2：成就管理 ───────────────────────────────────────

    private _renderAchievementsTab(): void {
        // 左：分类列表 + 新建分类（收紧行距，整体落在内容框架内）
        const categories = AchievementAdmin.categories();
        this._mkLabel(this._body, -430, 212, 190, 24, '类型（一级分组）', 14, MUTED, HorizontalTextAlignment.LEFT);
        categories.forEach((cat, i) => {
            const count = SaveSystem.allAchievements().filter(a => a.category === cat).length;
            const btn = this._mkButton(this._body,
                `${cat} ${count}`, -430, 166 - i * 48, 190, 40,
                this._achvCategory === cat ? PURPLE : new Color(56, 72, 92, 255));
            btn.on(Node.EventType.TOUCH_END, () => {
                this._achvCategory = cat;
                this.onButtonSfx();
                this._render();
            }, this);
        });
        const addCatY = 166 - categories.length * 48;
        const addCat = this._mkButton(this._body, '+ 新建分类', -430, addCatY, 190, 38, new Color(70, 105, 130, 255));
        addCat.on(Node.EventType.TOUCH_END, () => {
            this._newCategoryOpen = !this._newCategoryOpen;
            this.onButtonSfx();
            this._render();
        }, this);
        if (this._newCategoryOpen) {
            const eb = this._mkEditBox(this._body, -430, addCatY - 54, 190, 36, '分类名', '', false);
            const ok = this._mkButton(this._body, '确定', -430, addCatY - 100, 190, 34, new Color(60, 120, 90, 255));
            ok.on(Node.EventType.TOUCH_END, () => {
                if (AchievementAdmin.addCategory(eb.string)) {
                    this._achvCategory = eb.string.trim();
                    this._newCategoryOpen = false;
                }
                this.onButtonSfx();
                this._render();
            }, this);
        }

        // 右：该分类下成就列表（滚动），操作按钮在框架顶部一行
        const rightX = 120;
        const addBtn = this._mkButton(this._body, '+ 新增成就', -220, 206, 160, 38, new Color(60, 120, 90, 255));
        addBtn.on(Node.EventType.TOUCH_END, () => {
            this._editingId = '';
            this.onButtonSfx();
            this._render();
        }, this);
        const clearMods = this._mkButton(this._body, '清空成就改动', 60, 206, 170, 38, new Color(120, 70, 60, 255));
        clearMods.on(Node.EventType.TOUCH_END, () => {
            AchievementAdmin.resetAll();
            this.onButtonSfx();
            this._render();
        }, this);

        const scroll = new ScrollArea(this._body, rightX, -20, 800, 408);
        const list = SaveSystem.allAchievements().filter(a => a.category === this._achvCategory);
        const overrides = AchievementAdmin.overrides();
        const customs = new Set(AchievementAdmin.custom().map(c => c.id));
        const ROW = 64;
        const contentH = Math.max(ROW, list.length * ROW + 6);
        scroll.setContentHeight(408, contentH);
        // content 顶部原点逐行绘制（首行贴顶）
        list.forEach((a, i) => {
            const row = new Node(`Ach_${a.id}`); row.setParent(scroll.content);
            row.setPosition(new Vec3(0, contentH / 2 - 3 - (ROW - 6) / 2 - i * ROW, 0));
            row.addComponent(UITransform).setContentSize(790, ROW - 6);
            const g = row.addComponent(Graphics);
            g.fillColor = new Color(14, 20, 32, 235);
            g.roundRect(-395, -(ROW - 6) / 2, 790, ROW - 6, 8); g.fill();
            g.strokeColor = new Color(RARITY_COLOR[a.rarity].r, RARITY_COLOR[a.rarity].g, RARITY_COLOR[a.rarity].b, 110);
            g.lineWidth = 1; g.roundRect(-395, -(ROW - 6) / 2, 790, ROW - 6, 8); g.stroke();

            this._mkLabel(row, -245, 8, 280, 24, a.name, 16, WHITE, HorizontalTextAlignment.LEFT);
            const retired = !!overrides[a.id]?.retired;
            this._mkLabel(row, -200, -12, 360, 18,
                `等级 ${a.rarity} · 目标 ${a.goal}${overrides[a.id] ? ' · 已改' : ''}`,
                12, RARITY_COLOR[a.rarity], HorizontalTextAlignment.LEFT);
            if (retired) this._mkLabel(row, 170, 0, 80, 24, '已下架', 13, new Color(255, 120, 110, 255));

            const edit = this._mkButton(row, '编辑', 238, 0, 58, 36, new Color(70, 105, 130, 255));
            edit.on(Node.EventType.TOUCH_END, () => { this._editingId = a.id; this.onButtonSfx(); this._render(); }, this);
            const retire = this._mkButton(row, retired ? '恢复' : '下架', 302, 0, 58, 36, new Color(110, 90, 60, 255));
            retire.on(Node.EventType.TOUCH_END, () => {
                AchievementAdmin.setOverride(a.id, { retired: !retired });
                this._callbacks.onAchievementsChanged?.();
                this.onButtonSfx();
                this._render();
            }, this);
            if (customs.has(a.id)) {
                const del = this._mkButton(row, '删除', 366, 0, 58, 36, new Color(140, 60, 60, 255));
                del.on(Node.EventType.TOUCH_END, () => {
                    AchievementAdmin.deleteCustom(a.id);
                    this._callbacks.onAchievementsChanged?.();
                    this.onButtonSfx();
                    this._render();
                }, this);
            }
        });
    }

    // ── 成就编辑表单（新增/编辑共用） ─────────────────────────

    private _renderEditForm(): void {
        const isCustomNew = this._editingId === '';
        const merged = SaveSystem.allAchievements();
        const target = isCustomNew ? null : merged.find(a => a.id === this._editingId) ?? null;
        const existingCustom = isCustomNew ? null
            : AchievementAdmin.custom().find(c => c.id === this._editingId) ?? null;
        const ov = target && !existingCustom ? AchievementAdmin.overrides()[target.id] ?? {} : {};
        const base = target ?? {
            name: '', desc: '', rarity: '普通' as AchievementRarity,
            category: this._achvCategory, goal: 10, reward: '', rewardCoins: 0, hidden: false,
            statField: existingCustom?.statField ?? 'totalKills',
        };

        this._mkLabel(this._body, -390, 252, 280, 26,
            isCustomNew ? '新增成就（自建）' : `编辑成就 · ${target?.id ?? ''}`, 17, GOLD, HorizontalTextAlignment.LEFT);
        const closeForm = this._mkButton(this._body, '返回列表', 240, 296, 130, 42, new Color(60, 78, 96, 255));
        closeForm.on(Node.EventType.TOUCH_END, () => { this._editingId = null; this.onButtonSfx(); this._render(); }, this);

        // 名称 / 描述（行首标签收紧到框架内，避免压住输入控件）
        this._mkLabel(this._body, -478, 206, 70, 24, '名称', 14, MUTED, HorizontalTextAlignment.RIGHT);
        const nameEb = this._mkEditBox(this._body, -270, 206, 300, 40, '成就名称', base.name, false);
        this._mkLabel(this._body, -20, 206, 60, 24, '描述', 14, MUTED, HorizontalTextAlignment.RIGHT);
        const descEb = this._mkEditBox(this._body, 250, 206, 360, 40, '达成条件描述', base.desc, false);

        // 稀有度（类型内等级）
        this._mkLabel(this._body, -478, 152, 70, 24, '等级', 14, MUTED, HorizontalTextAlignment.RIGHT);
        const save = {
            rarity: (ov.rarity ?? existingCustom?.rarity ?? base.rarity) as AchievementRarity,
            category: ov.category ?? existingCustom?.category ?? base.category,
            hidden: ov.hidden ?? existingCustom?.hidden ?? !!base.hidden,
            statField: existingCustom?.statField ?? 'totalKills',
        };
        const highlightRarity = () => rarityBtns.forEach(({ node, r }) =>
            this._skins.get(node)?.setAccent(r === save.rarity ? RARITY_COLOR[r] : new Color(56, 72, 92, 255)));
        const rarityBtns: { node: Node; r: AchievementRarity }[] = [];
        RARITIES.forEach((r, i) => {
            const btn = this._mkButton(this._body, r, -390 + i * 110, 152, 100, 38, RARITY_COLOR[r]);
            rarityBtns.push({ node: btn, r });
            btn.on(Node.EventType.TOUCH_END, () => {
                save.rarity = r;
                highlightRarity();
                this.onButtonSfx();
            }, this);
        });
        highlightRarity();

        // 分类（一级分组）
        this._mkLabel(this._body, -478, 100, 70, 24, '类型', 14, MUTED, HorizontalTextAlignment.RIGHT);
        const cats = AchievementAdmin.categories();
        const catBtns: { node: Node; c: string }[] = [];
        const highlightCat = () => catBtns.forEach(({ node, c }) =>
            this._skins.get(node)?.setAccent(c === save.category ? this._achvCategoryColor(c) : new Color(56, 72, 92, 255)));
        cats.forEach((c, i) => {
            const btn = this._mkButton(this._body, c, -390 + (i % 6) * 110, 100 - Math.floor(i / 6) * 46, 100, 38,
                this._achvCategoryColor(c));
            catBtns.push({ node: btn, c });
            btn.on(Node.EventType.TOUCH_END, () => {
                save.category = c;
                highlightCat();
                this.onButtonSfx();
            }, this);
        });
        highlightCat();

        // 目标值 / 奖励 / 核心币 / 隐藏
        this._mkLabel(this._body, -478, 40, 70, 24, '目标值', 14, MUTED, HorizontalTextAlignment.RIGHT);
        const goalEb = this._mkEditBox(this._body, -370, 40, 140, 40, '数字', `${ov.goal ?? existingCustom?.goal ?? base.goal}`, false);
        this._mkLabel(this._body, -180, 40, 70, 24, '奖励', 14, MUTED, HorizontalTextAlignment.RIGHT);
        const rewardEb = this._mkEditBox(this._body, 60, 40, 240, 40, '如：核心币 × 300', ov.reward ?? existingCustom?.reward ?? base.reward, false);
        this._mkLabel(this._body, 220, 40, 90, 24, '核心币奖励', 14, MUTED, HorizontalTextAlignment.RIGHT);
        const coinsEb = this._mkEditBox(this._body, 380, 40, 120, 40, '数字', `${ov.rewardCoins ?? existingCustom?.rewardCoins ?? base.rewardCoins ?? 0}`, false);
        this._mkLabel(this._body, -380, -12, 300, 22, '核心币奖励解锁即入档（0 = 仅展示文案）', 12, MUTED, HorizontalTextAlignment.CENTER);

        // 进度来源（仅自建可改；内置固定为其定义）——两分支互斥，避免文字叠加
        this._mkLabel(this._body, -478, -56, 70, 24, '进度来源', 14, MUTED, HorizontalTextAlignment.RIGHT);
        const fieldLabel = () => ACHIEVEMENT_STAT_FIELDS.find(f => f.key === save.statField)?.label ?? save.statField;
        if (isCustomNew || existingCustom) {
            const statLbl = this._mkLabel(this._body, -180, -56, 220, 24, fieldLabel(), 15, WHITE);
            const step = (d: number) => {
                const i = ACHIEVEMENT_STAT_FIELDS.findIndex(f => f.key === save.statField);
                const n = (i + d + ACHIEVEMENT_STAT_FIELDS.length) % ACHIEVEMENT_STAT_FIELDS.length;
                save.statField = ACHIEVEMENT_STAT_FIELDS[n].key;
                statLbl.string = fieldLabel();
                this.onButtonSfx();
            };
            const prev = this._mkButton(this._body, '◀', -310, -56, 44, 34, new Color(70, 105, 130, 255));
            prev.on(Node.EventType.TOUCH_END, () => step(-1), this);
            const next = this._mkButton(this._body, '▶', -50, -56, 44, 34, new Color(70, 105, 130, 255));
            next.on(Node.EventType.TOUCH_END, () => step(1), this);
        } else {
            this._mkLabel(this._body, -180, -56, 220, 24, '内置成就不可更改', 13, MUTED);
        }

        // 隐藏开关
        const hiddenBtn = this._mkButton(this._body, '', 380, -56, 150, 34, new Color(56, 72, 92, 255));
        const hiddenLabel = this._mkLabel(hiddenBtn, 0, 0, 140, 34, '', 14, WHITE);
        const paintHidden = () => {
            hiddenLabel.string = save.hidden ? '隐藏成就：是' : '隐藏成就：否';
            this._skins.get(hiddenBtn)?.setAccent(save.hidden ? new Color(120, 90, 50, 255) : new Color(56, 72, 92, 255));
        };
        paintHidden();
        hiddenBtn.on(Node.EventType.TOUCH_END, () => {
            save.hidden = !save.hidden;
            paintHidden();
            this.onButtonSfx();
        }, this);

        // 保存
        const doSave = this._mkButton(this._body, isCustomNew ? '创建成就' : '保存修改', -200, -122, 220, 48, new Color(60, 130, 95, 255));
        doSave.on(Node.EventType.TOUCH_END, () => {
            const name = nameEb.string.trim() || (isCustomNew ? '未命名成就' : base.name);
            const goal = Math.max(1, Math.round(Number(goalEb.string) || (ov.goal ?? base.goal)));
            const coins = Math.max(0, Math.round(Number(coinsEb.string) || 0));
            const patch = {
                name,
                desc: descEb.string.trim(),
                rarity: save.rarity,
                category: save.category,
                goal,
                reward: rewardEb.string.trim(),
                rewardCoins: coins,
                hidden: save.hidden,
            };
            if (isCustomNew) {
                AchievementAdmin.addCustom({ ...patch, statField: save.statField });
            } else if (existingCustom) {
                AchievementAdmin.updateCustom(existingCustom.id, { ...patch, statField: save.statField });
            } else if (target) {
                AchievementAdmin.setOverride(target.id, patch);
            }
            this._editingId = null;
            this._callbacks.onAchievementsChanged?.();
            this.onButtonSfx();
            this._render();
        }, this);
        const cancel = this._mkButton(this._body, '取消', 60, -122, 160, 48, new Color(70, 92, 110, 255));
        cancel.on(Node.EventType.TOUCH_END, () => { this._editingId = null; this.onButtonSfx(); this._render(); }, this);
    }

    private _achvCategoryColor(cat: string): Color {
        const preset = DEFAULT_ACHIEVEMENT_CATEGORIES.indexOf(cat);
        if (preset === 0) return new Color(200, 90, 80, 255);      // 挑战·红
        if (preset === 1) return new Color(62, 164, 235, 255);     // 探索·蓝
        if (preset === 2) return new Color(80, 160, 120, 255);     // 收集·绿
        return PURPLE;                                             // 自建·紫
    }

    // ── 控件小工场 ────────────────────────────────────────────

    private onButtonSfx(): void { /* 音效由调用方环境决定，面板内默认静默 */ }

    private _mkLabel(
        parent: Node, x: number, y: number, w: number, h: number, text: string, size: number,
        color: Color, align = HorizontalTextAlignment.CENTER,
    ): Label {
        const n = new Node(`L_${text.slice(0, 6)}`); n.setParent(parent);
        n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(w, h);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.lineHeight = Math.round(size * 1.35);
        l.color = color; l.horizontalAlign = align; l.verticalAlign = VerticalTextAlignment.CENTER;
        l.overflow = Label.Overflow.SHRINK;
        styleLabel(l);
        return l;
    }

    private _mkButton(parent: Node, text: string, x: number, y: number, w: number, h: number, accent: Color): Node {
        const btn = new Node(`Btn_${text.slice(0, 8)}`); btn.setParent(parent);
        btn.setPosition(new Vec3(x, y, 0));
        btn.addComponent(UITransform).setContentSize(w, h);
        this._skins.set(btn, applyHexButtonSkin(btn, w, h, accent));
        this._mkLabel(btn, 0, 0, w - 12, h, text, Math.max(12, Math.round(h * 0.36)), WHITE);
        return btn;
    }

    private _mkEditBox(parent: Node, x: number, y: number, w: number, h: number,
                       placeholder: string, init: string, password: boolean): EditBox {
        const n = new Node(`EB_${placeholder.slice(0, 6)}`); n.setParent(parent);
        n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(8, 13, 22, 245);
        g.roundRect(-w / 2, -h / 2, w, h, 6); g.fill();
        g.strokeColor = new Color(90, 110, 140, 200);
        g.lineWidth = 1.2; g.roundRect(-w / 2, -h / 2, w, h, 6); g.stroke();

        // 引擎约定：EditBox 的内部标签节点名为 TEXT_LABEL / PLACEHOLDER_LABEL，
        // 定位在框内左上角 ((-w/2, +h/2))，要求锚点 (0,1) 顶左——纯代码创建时
        // 锚点默认是中心，文字会整体飘到框外上方（已在真机验证过的坑）。
        const mkInner = (name: string, color: Color): Label => {
            const ln = new Node(name); ln.setParent(n);
            ln.addComponent(UITransform).setAnchorPoint(0, 1);
            const l = ln.addComponent(Label);
            // 引擎 prefab 约定：lineHeight = 框高，verticalAlign CENTER 才能垂直居中
            l.fontSize = 15; l.lineHeight = h;
            l.color = color;
            l.verticalAlign = VerticalTextAlignment.CENTER;
            l.horizontalAlign = HorizontalTextAlignment.LEFT;
            l.overflow = Label.Overflow.SHRINK;
            styleLabel(l);
            return l;
        };
        const textLabel = mkInner('TEXT_LABEL', WHITE.clone());
        const phLabel = mkInner('PLACEHOLDER_LABEL', new Color(120, 140, 160, 255));

        const eb = n.addComponent(EditBox);
        eb.textLabel = textLabel;
        eb.placeholderLabel = phLabel;
        eb.placeholder = placeholder;
        eb.string = init;
        eb.inputFlag = password ? EditBox.InputFlag.PASSWORD : EditBox.InputFlag.DEFAULT;
        // 双保险：引擎 onLoad 布局后强制纠偏一次（锚点/位置/尺寸对齐 prefab 约定），
        // 防止个别时机下内部标签骑在框顶边线上
        const enforceLayout = (): void => {
            if (!n.isValid || !textLabel.isValid) return;
            for (const ln of [textLabel.node, phLabel.node]) {
                const ut = ln.getComponent(UITransform)!;
                ut.setAnchorPoint(0, 1);
                ut.setContentSize(w - 4, h);
                ln.setPosition(-w / 2 + 2, h / 2);
            }
        };
        enforceLayout();
        if (sys.isBrowser) {
            setTimeout(enforceLayout, 60);
            setTimeout(enforceLayout, 600);
        }
        return eb;
    }
}
