// ============================================================
//  LobbyUI.ts — 存档大厅（选定存档后的中枢页面）
// ============================================================
// 左侧：存档概要 + 任务树/图鉴/成就档案入口（自首页迁移而来）。
// 右侧：出击传送门——纯 Graphics 逐帧绘制的三层旋转符文环 + 环绕粒子，
// 点击进入角色选择开战。页面由代码构建，不依赖 prefab。

import {
    Color, Graphics, HorizontalTextAlignment, Label, Node, Sprite,
    UITransform, Vec3, VerticalTextAlignment,
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { applyArtSprite } from '../core/SpriteUtils';
import { applyHexButtonSkin } from '../core/UIStyle';
import { ACHIEVEMENTS, SaveSystem } from '../systems/SaveSystem';
import { MetaPageName } from './MetaPageUI';

export interface LobbyCallbacks {
    /** 点击右侧出击传送门（进入角色选择）。 */
    onPortalPressed: () => void;
    /** 左侧元进度入口（任务树/图鉴/成就档案）。 */
    onMetaPage: (page: MetaPageName) => void;
    onBack: () => void;
    onButtonSfx: () => void;
}

const WHITE = new Color(232, 244, 250, 255);
const MUTED = new Color(145, 166, 184, 255);
const CYAN = new Color(40, 224, 218, 255);
const GOLD = new Color(255, 205, 82, 255);
const VIOLET = new Color(184, 104, 255, 255);

const SLOT_TITLES = ['存档 一', '存档 二', '存档 三'];

function clippedPath(g: Graphics, w: number, h: number, cut: number): void {
    const l = -w / 2, r = w / 2, b = -h / 2, t = h / 2;
    g.moveTo(l + cut, b); g.lineTo(r - cut, b);
    g.lineTo(r, b + cut); g.lineTo(r, t - cut);
    g.lineTo(r - cut, t); g.lineTo(l + cut, t);
    g.lineTo(l, t - cut); g.lineTo(l, b + cut); g.close();
}

function drawPanel(g: Graphics, w: number, h: number, accent: Color, alpha = 242): void {
    g.clear();
    g.fillColor = new Color(5, 12, 22, alpha);
    clippedPath(g, w, h, 14); g.fill();
    g.strokeColor = new Color(accent.r, accent.g, accent.b, 150);
    g.lineWidth = 1.5;
    clippedPath(g, w, h, 14); g.stroke();
    g.strokeColor = new Color(220, 248, 255, 42);
    g.lineWidth = 1;
    g.moveTo(-w / 2 + 26, h / 2 - 6); g.lineTo(w / 2 - 26, h / 2 - 6); g.stroke();
}

export class LobbyUI {
    private readonly _panel: Node;
    private _portalGfx!: Graphics;
    private _portalT = 0;
    private _summaryTitle!: Label;
    private _summaryLines: Label[] = [];

    constructor(private readonly _root: Node, private readonly _callbacks: LobbyCallbacks) {
        this._panel = this._buildPage();
        this._panel.active = false;
        // Graphics 在 onLoad 阶段可能尚未完成渲染组件注册，首帧先画一次静态门体，
        // update() 只在大厅可见时推进动画。
        this._drawPortal(0);
    }

    entries(): [string, Node][] {
        return [['lobby', this._panel]];
    }

    /** 每次 show() 时由 ScreenManager 调用：按当前选中槽刷新左侧存档概要。 */
    refresh(): void {
        const p = SaveSystem.load();
        const slot = SaveSystem.currentSlot();
        this._summaryTitle.string = SLOT_TITLES[slot] ?? `存档 ${slot + 1}`;
        this._summaryLines[0].string = `总局数 ${p.totalRuns}  ·  通关 ${p.totalWins}`;
        this._summaryLines[1].string = `最远进度  第${Math.max(1, p.bestChapter)}章 · 第${Math.max(1, p.bestWave)}波`;
        this._summaryLines[2].string = `累计击杀 ${p.totalKills}  ·  Boss ${p.bossKills}`;
        this._summaryLines[3].string = `成就 ${p.achievements.length}/${ACHIEVEMENTS.length}  ·  英雄 ${p.charsPlayed.length}/6`;
    }

    /** 由 ScreenManager.update 每帧转发；大厅隐藏时不推进动画也不重绘。 */
    update(dt: number): void {
        if (!this._panel.active) return;
        this._portalT += dt;
        this._drawPortal(this._portalT);
    }

    // ── 页面骨架 ─────────────────────────────────────────────

    private _buildPage(): Node {
        const page = new Node('lobby'); page.setParent(this._root);
        page.addComponent(UITransform).setContentSize(1280, 720);

        const bg = page.addComponent(Graphics);
        bg.fillColor = new Color(3, 7, 14, 255); bg.fillRect(-640, -360, 1280, 720);

        // 大厅用第 1 章废土街道做远景，压暗后与首页标题图区分开。
        const artN = new Node('AmbientArt'); artN.setParent(page);
        artN.addComponent(UITransform).setContentSize(1280, 720);
        const art = artN.addComponent(Sprite); art.sizeMode = Sprite.SizeMode.CUSTOM;
        art.color = new Color(90, 115, 135, 58);
        applyArtSprite(art, 'bg_chapter1');

        const veilN = new Node('Veil'); veilN.setParent(page);
        const veil = veilN.addComponent(Graphics);
        veil.fillColor = new Color(2, 7, 14, 200); veil.fillRect(-640, -360, 1280, 720);
        veil.fillColor = new Color(CYAN.r, CYAN.g, CYAN.b, 12); veil.fillRect(-640, 250, 1280, 110);
        veil.strokeColor = new Color(CYAN.r, CYAN.g, CYAN.b, 90); veil.lineWidth = 1;
        veil.moveTo(-600, 250); veil.lineTo(600, 250); veil.stroke();

        this._mkLabel(page, -467, 326, 190, 20, 'OPERATION LOBBY / 存档大厅', 12,
            new Color(CYAN.r, CYAN.g, CYAN.b, 220), HorizontalTextAlignment.LEFT);
        this._mkLabel(page, -272, 291, 560, 48, '作战大厅', 30, WHITE, HorizontalTextAlignment.LEFT);

        const back = this._mkButton(page, '返回首页', 526, 306, 150, 42, new Color(78, 111, 135, 255));
        back.on(Node.EventType.TOUCH_END, this._callbacks.onBack);

        this._buildSummaryPanel(page);
        this._buildMetaDock(page);
        this._buildPortal(page);
        return page;
    }

    /** 左上：当前存档概要面板（refresh 按选中槽填充）。 */
    private _buildSummaryPanel(page: Node): void {
        const panel = new Node('SaveSummary'); panel.setParent(page);
        panel.setPosition(new Vec3(-431, 130, 0));
        const g = panel.addComponent(Graphics); drawPanel(g, 334, 226, CYAN);
        this._mkLabel(panel, 0, 88, 268, 24, '当前档案', 13, MUTED, HorizontalTextAlignment.LEFT);
        this._summaryTitle = this._mkLabel(panel, 0, 56, 268, 34, '', 22, GOLD, HorizontalTextAlignment.LEFT);
        const rowY = [12, -24, -60, -92];
        for (let i = 0; i < 4; i++) {
            this._summaryLines.push(this._mkLabel(panel, 0, rowY[i], 292, 26, '', 13,
                new Color(197, 214, 226, 255), HorizontalTextAlignment.LEFT));
        }
    }

    /** 左下：任务树/图鉴/成就档案入口（自首页 MetaDock 迁入大厅）。 */
    private _buildMetaDock(page: Node): void {
        const dock = new Node('MetaDock'); dock.setParent(page);
        dock.setPosition(new Vec3(-431, -160, 0));
        dock.addComponent(UITransform).setContentSize(334, 300);

        this._mkLabel(dock, 0, 128, 334, 22, '情报终端', 13, MUTED, HorizontalTextAlignment.LEFT);
        const entries: [MetaPageName, string, Color][] = [
            ['tasks', '任务树', CYAN],
            ['codex', '图鉴', new Color(62, 164, 235, 255)],
            ['achievements', '成就档案', GOLD],
        ];
        entries.forEach(([name, label, accent], i) => {
            const btn = this._mkButton(dock, label, 0, 74 - i * 68, 334, 54, accent);
            btn.on(Node.EventType.TOUCH_END, () => this._callbacks.onMetaPage(name));
        });
    }

    /** 右侧：出击传送门（逐帧重绘的三层符文环 + 环绕粒子）。 */
    private _buildPortal(page: Node): void {
        const portal = new Node('Portal'); portal.setParent(page);
        portal.setPosition(new Vec3(430, -20, 0));
        portal.addComponent(UITransform).setContentSize(360, 460);
        const gfxNode = new Node('PortalGfx'); gfxNode.setParent(portal);
        gfxNode.addComponent(UITransform).setContentSize(360, 460);
        this._portalGfx = gfxNode.addComponent(Graphics);

        portal.on(Node.EventType.TOUCH_END, () => {
            this._callbacks.onButtonSfx();
            this._callbacks.onPortalPressed();
        });

        this._mkLabel(portal, 0, -180, 340, 40, '出击传送门', 26, WHITE);
        this._mkLabel(portal, 0, -212, 340, 24, '选择难度  ·  选择英雄', 13, CYAN);
    }

    /** t=0 画静态门体；t>0 按时间推进旋转/脉冲/环绕粒子。 */
    private _drawPortal(t: number): void {
        const g = this._portalGfx;
        if (!g) return;
        g.clear();

        // 中心辉光：三层低透明度圆叠加出发光核心
        const glow: [number, number][] = [[86, 22], [62, 38], [36, 64]];
        for (const [r, a] of glow) {
            g.fillColor = new Color(40, 224, 218, a);
            g.circle(0, 0, r + Math.sin(t * 2.4) * 3); g.fill();
        }

        // 内环：整圈呼吸脉冲
        const pulse = 108 + Math.sin(t * 2.4) * 5;
        g.strokeColor = new Color(40, 224, 218, 130);
        g.lineWidth = 5; g.circle(0, 0, pulse); g.stroke();

        // 中环：6 段符文弧，反向旋转
        g.strokeColor = new Color(184, 104, 255, 190);
        g.lineWidth = 3;
        const midBase = -t * 0.9;
        for (let i = 0; i < 6; i++) {
            const a = midBase + i * (Math.PI * 2 / 6);
            g.arc(0, 0, 132, a, a + 0.42, false); g.stroke();
        }

        // 外环：8 段长弧，正向旋转
        g.strokeColor = new Color(40, 224, 218, 210);
        g.lineWidth = 3;
        const outBase = t * 0.6;
        for (let i = 0; i < 8; i++) {
            const a = outBase + i * (Math.PI * 2 / 8);
            g.arc(0, 0, 158, a, a + 0.52, false); g.stroke();
        }

        // 环绕粒子：5 颗青/紫交替，沿最大环缓慢公转
        for (let i = 0; i < 5; i++) {
            const a = -t * 0.8 + i * (Math.PI * 2 / 5);
            const px = Math.cos(a) * 176, py = Math.sin(a) * 176;
            g.fillColor = i % 2 === 0 ? new Color(40, 224, 218, 235) : new Color(184, 104, 255, 235);
            g.circle(px, py, 4.5); g.fill();
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
