// ============================================================
//  SaveSelectUI.ts — 存档选择页（进入游戏后的第一站）
// ============================================================
// 3 个独立存档槽：空槽点击即新建，已有槽展示进度概览并可两步确认删除。
// 选定槽位后由 GameManager 切换 SaveSystem 当前槽并进入存档大厅(LobbyUI)。
// 页面由代码构建，不依赖 prefab；槽位数据每次 show() 时刷新。

import {
    Color, Graphics, HorizontalTextAlignment, Label, Node, Sprite,
    UITransform, Vec3, VerticalTextAlignment,
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { applyArtSprite } from '../core/SpriteUtils';
import { applyHexButtonSkin } from '../core/UIStyle';
import { ACHIEVEMENTS, SaveSlotSummary, SaveSystem } from '../systems/SaveSystem';

export interface SaveSelectCallbacks {
    /** 点击槽位卡（新建或继续）。参数为 0-based 槽位号。 */
    onSlotPicked: (slot: number) => void;
    onBack: () => void;
    onButtonSfx: () => void;
}

const WHITE = new Color(232, 244, 250, 255);
const MUTED = new Color(145, 166, 184, 255);
const CYAN = new Color(40, 224, 218, 255);
const GOLD = new Color(255, 205, 82, 255);
const RED = new Color(255, 95, 76, 255);

const SLOT_TITLES = ['存档 一', '存档 二', '存档 三'];

function clippedPath(g: Graphics, w: number, h: number, cut: number): void {
    const l = -w / 2, r = w / 2, b = -h / 2, t = h / 2;
    g.moveTo(l + cut, b); g.lineTo(r - cut, b);
    g.lineTo(r, b + cut); g.lineTo(r, t - cut);
    g.lineTo(r - cut, t); g.lineTo(l + cut, t);
    g.lineTo(l, t - cut); g.lineTo(l, b + cut); g.close();
}

/** 存档槽卡片视图：卡片内容随 refresh() 重绘，删除按钮有两步确认态。 */
interface SlotCardView {
    slot: number;
    graphics: Graphics;
    body: Node;      // 整卡点击区（新建/继续）
    lines: Label[];  // 概览文本行（含标题下空行占位）
    deleteBtn: Node;
    deleteLabel: Label;
    deleteArmed: boolean;
}

export class SaveSelectUI {
    private readonly _panel: Node;
    private _cards: SlotCardView[] = [];

    constructor(private readonly _root: Node, private readonly _callbacks: SaveSelectCallbacks) {
        this._panel = this._buildPage();
        this._panel.active = false;
    }

    entries(): [string, Node][] {
        return [['saveSelect', this._panel]];
    }

    /** 每次 show() 时由 ScreenManager 调用：重读槽位存储并重绘卡片。 */
    refresh(): void {
        const slots = SaveSystem.listSlots();
        for (const view of this._cards) {
            const summary = slots[view.slot]!;
            this._drawCard(view, summary);
            view.deleteBtn.active = summary.exists;
            view.deleteArmed = false;
            view.deleteLabel.string = '删除';
            view.deleteLabel.color = MUTED;
        }
    }

    // ── 页面骨架 ─────────────────────────────────────────────

    private _buildPage(): Node {
        const page = new Node('saveSelect'); page.setParent(this._root);
        page.addComponent(UITransform).setContentSize(1280, 720);

        const bg = page.addComponent(Graphics);
        bg.fillColor = new Color(3, 7, 14, 255); bg.fillRect(-640, -360, 1280, 720);

        const artN = new Node('AmbientArt'); artN.setParent(page);
        artN.addComponent(UITransform).setContentSize(1280, 720);
        const art = artN.addComponent(Sprite); art.sizeMode = Sprite.SizeMode.CUSTOM;
        art.color = new Color(95, 125, 150, 60);
        applyArtSprite(art, 'title_screen');

        const veilN = new Node('Veil'); veilN.setParent(page);
        const veil = veilN.addComponent(Graphics);
        veil.fillColor = new Color(2, 7, 14, 205); veil.fillRect(-640, -360, 1280, 720);
        veil.fillColor = new Color(CYAN.r, CYAN.g, CYAN.b, 12); veil.fillRect(-640, 250, 1280, 110);
        veil.strokeColor = new Color(CYAN.r, CYAN.g, CYAN.b, 90); veil.lineWidth = 1;
        veil.moveTo(-600, 250); veil.lineTo(600, 250); veil.stroke();

        this._mkLabel(page, -467, 326, 170, 20, 'SAVE TERMINAL / 选择作战档案', 12,
            new Color(CYAN.r, CYAN.g, CYAN.b, 220), HorizontalTextAlignment.LEFT);
        const title = this._mkLabel(page, -272, 291, 560, 48, '选择存档', 30, WHITE, HorizontalTextAlignment.LEFT);
        title.overflow = Label.Overflow.SHRINK;

        const back = this._mkButton(page, '返回首页', 526, 306, 150, 42, new Color(78, 111, 135, 255));
        back.on(Node.EventType.TOUCH_END, this._callbacks.onBack);

        for (let i = 0; i < SaveSystem.SLOT_COUNT; i++) this._buildCard(page, i);
        return page;
    }

    private _buildCard(page: Node, slot: number): void {
        const card = new Node(`Slot_${slot}`); card.setParent(page);
        card.setPosition(new Vec3(-330 + slot * 330, -66, 0));
        card.addComponent(UITransform).setContentSize(300, 400);

        const g = card.addComponent(Graphics);
        const body = new Node('Body'); body.setParent(card);
        body.addComponent(UITransform).setContentSize(300, 400);
        body.on(Node.EventType.TOUCH_END, () => {
            this._disarmDelete();
            this._callbacks.onButtonSfx();
            this._callbacks.onSlotPicked(slot);
        });

        const lines: Label[] = [];
        const lineTexts = [
            { y: 148, size: 24, color: WHITE },   // 槽位标题
            { y: 96,  size: 17, color: GOLD },    // 一行进度总览
            { y: 66,  size: 13, color: MUTED },   // 成就/英雄
            { y: 42,  size: 13, color: MUTED },   // 最后游玩
        ];
        for (const lt of lineTexts) {
            const n = new Node(`Line${lt.y}`); n.setParent(card);
            n.setPosition(new Vec3(0, lt.y, 0));
            n.addComponent(UITransform).setContentSize(272, lt.size + 8);
            const l = n.addComponent(Label);
            l.string = ''; l.fontSize = lt.size; l.color = lt.color;
            l.horizontalAlign = HorizontalTextAlignment.CENTER;
            l.verticalAlign = VerticalTextAlignment.CENTER;
            l.overflow = Label.Overflow.SHRINK;
            l.enableWrapText = false;
            styleLabel(l);
            lines.push(l);
        }

        // 删除按钮：独立于卡片点击区，第一次点变成红色「确认删除」，再点才真删。
        const deleteBtn = new Node('DeleteBtn'); deleteBtn.setParent(card);
        deleteBtn.setPosition(new Vec3(120, 172, 0));
        deleteBtn.addComponent(UITransform).setContentSize(56, 26);
        applyHexButtonSkin(deleteBtn, 56, 26, new Color(78, 111, 135, 255));
        const dl = new Node('L'); dl.setParent(deleteBtn);
        dl.addComponent(UITransform).setContentSize(50, 22);
        const deleteLabel = dl.addComponent(Label);
        deleteLabel.string = '删除'; deleteLabel.fontSize = 12; deleteLabel.color = MUTED;
        deleteLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        deleteLabel.verticalAlign = VerticalTextAlignment.CENTER;
        deleteLabel.overflow = Label.Overflow.SHRINK;
        styleLabel(deleteLabel);
        const view: SlotCardView = { slot, graphics: g, body, lines, deleteBtn, deleteLabel, deleteArmed: false };
        deleteBtn.on(Node.EventType.TOUCH_END, (ev: any) => {
            // 拦截冒泡：删除点击不能落进卡片 body 触发选档
            ev.propagationStopped = true;
            this._callbacks.onButtonSfx();
            if (!view.deleteArmed) {
                view.deleteArmed = true;
                deleteLabel.string = '确认删除';
                deleteLabel.color = new Color(255, 120, 100, 255);
                return;
            }
            SaveSystem.deleteSlot(view.slot);
            this.refresh();
        });
        this._cards.push(view);
    }

    private _drawCard(view: SlotCardView, summary: SaveSlotSummary): void {
        const g = view.graphics;
        const accent = summary.exists ? CYAN : new Color(96, 118, 134, 255);
        g.clear();
        g.fillColor = new Color(5, 12, 22, 244); clippedPath(g, 300, 400, 14); g.fill();
        g.fillColor = new Color(accent.r, accent.g, accent.b, summary.exists ? 20 : 10);
        clippedPath(g, 293, 393, 11); g.fill();
        g.strokeColor = new Color(accent.r, accent.g, accent.b, summary.exists ? 170 : 110);
        g.lineWidth = 1.5; clippedPath(g, 300, 400, 14); g.stroke();
        g.strokeColor = new Color(accent.r, accent.g, accent.b, 220); g.lineWidth = 3;
        g.moveTo(-118, 186); g.lineTo(118, 186); g.stroke();

        const p = summary.profile;
        if (summary.exists && p) {
            const achCount = p.achievements.length;
            view.lines[0].string = SLOT_TITLES[view.slot];
            view.lines[1].string = `总局数 ${p.totalRuns}  ·  最远 第${Math.max(1, p.bestChapter)}章`;
            view.lines[2].string = `成就 ${achCount}/${ACHIEVEMENTS.length}  ·  英雄 ${p.charsPlayed.length}/6`;
            view.lines[3].string = p.updatedAt > 0
                ? `最后游玩  ${new Date(p.updatedAt).toLocaleDateString()}`
                : '尚未记录对局';
        } else {
            view.lines[0].string = SLOT_TITLES[view.slot];
            view.lines[1].string = '';
            view.lines[2].string = '';
            view.lines[3].string = '';
            // 空槽中央的「+ 新征程」引导
            g.strokeColor = new Color(120, 150, 168, 200); g.lineWidth = 2;
            g.circle(0, -30, 34); g.stroke();
            g.moveTo(-12, -30); g.lineTo(12, -30);
            g.moveTo(0, -42); g.lineTo(0, -18); g.stroke();
        }
        const hint = summary.exists ? '点按继续  ·  进入存档大厅' : '点按新建存档';
        view.body.removeAllChildren();
        const hintN = new Node('Hint'); hintN.setParent(view.body);
        hintN.setPosition(new Vec3(0, -173, 0));
        hintN.addComponent(UITransform).setContentSize(256, 24);
        const hl = hintN.addComponent(Label);
        hl.string = hint; hl.fontSize = 13; hl.color = summary.exists ? CYAN : MUTED;
        hl.horizontalAlign = HorizontalTextAlignment.CENTER;
        hl.verticalAlign = VerticalTextAlignment.CENTER;
        hl.overflow = Label.Overflow.SHRINK;
        styleLabel(hl);
    }

    /** 任一次其它交互都撤销删除按钮的 armed 态，防误删。 */
    private _disarmDelete(): void {
        for (const view of this._cards) {
            if (view.deleteArmed) {
                view.deleteArmed = false;
                view.deleteLabel.string = '删除';
                view.deleteLabel.color = MUTED;
            }
        }
    }

    // ── 小部件 ───────────────────────────────────────────────

    private _mkLabel(
        parent: Node, x: number, y: number, width: number, height: number,
        text: string, fontSize: number, color: Color,
        align = HorizontalTextAlignment.CENTER,
    ): Label {
        const n = new Node(`Label_${text.slice(0, 8)}`); n.setParent(parent);
        n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(width, height);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = fontSize; l.lineHeight = Math.round(fontSize * 1.45);
        l.color = color; l.horizontalAlign = align; l.verticalAlign = VerticalTextAlignment.CENTER;
        l.overflow = Label.Overflow.SHRINK;
        styleLabel(l);
        return l;
    }

    private _mkButton(parent: Node, text: string, x: number, y: number, w: number, h: number, accent: Color): Node {
        const button = new Node(`Btn_${text}`); button.setParent(parent);
        button.setPosition(new Vec3(x, y, 0));
        button.addComponent(UITransform).setContentSize(w, h);
        applyHexButtonSkin(button, w, h, accent);
        this._mkLabel(button, 0, 0, w - 18, h, text, Math.round(h * 0.34), WHITE);
        button.on(Node.EventType.TOUCH_END, this._callbacks.onButtonSfx);
        return button;
    }
}
