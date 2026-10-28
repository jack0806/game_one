// ============================================================
//  LobbyUI.ts — 存档大厅（选定存档后的中枢页面）
// ============================================================
// 左侧：存档概要 + 图鉴/成就档案入口（自首页迁移而来）。
// 右侧：出击传送门——半透明全息门场、能量核心与旋转刻度环，
// 点击进入角色选择开战。页面由代码构建，不依赖 prefab。

import {
    Color, Graphics, HorizontalTextAlignment, Label, Node, Sprite,
    UITransform, Vec3, VerticalTextAlignment, tween, sys,
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { mapOf, chapterInMap } from '../data/LevelIndex';
import { visibleDesignWidth } from '../core/ScreenFit';
import { applyArtSprite } from '../core/SpriteUtils';
import { applyHexButtonSkin, attachEnableRedraw, drawHexPanel, registerKeyboardFocus, UI_PALETTE } from '../core/UIStyle';
import { DT_MAX } from '../core/Constants';
import { ACHIEVEMENTS, SaveSystem } from '../systems/SaveSystem';
import { CHARS } from '../data/CharacterDB';
import { MetaPageName } from './MetaPageUI';
import { DepotUI } from './DepotUI';

export interface LobbyCallbacks {
    /** 点击右侧出击传送门（进入角色选择）。 */
    onPortalPressed: () => void;
    /** 左侧元进度入口（图鉴/成就档案）。 */
    onMetaPage: (page: MetaPageName) => void;
    /** 当前档案面板「切换档案」：打开档案列表（选择后退回大厅）。 */
    onSwitchSave: () => void;
    onBack: () => void;
    onButtonSfx: () => void;
}

const WHITE = new Color(232, 244, 250, 255);
const MUTED = new Color(145, 166, 184, 255);
const CYAN = new Color(40, 224, 218, 255);
const GOLD = new Color(255, 205, 82, 255);

const SLOT_TITLES = ['存档 一', '存档 二', '存档 三'];

function drawPanel(g: Graphics, w: number, h: number, accent: Color): void {
    const draw = () => {
        g.clear();
        drawHexPanel(g, -w / 2, -h / 2, w, h, accent, 232);
    };
    draw();
    attachEnableRedraw(g.node, draw);
}

export class LobbyUI {
    private readonly _panel: Node;
    private _portalCoreGfx!: Graphics;
    private _portalGfx!: Graphics;
    private _portalT = 0;
    private _portalHovered = false;
    private _portalFocused = false;
    private _summaryTitle!: Label;
    private _summaryLines: Label[] = [];
    /** 商店和装备库共用军需终端的围框、陈列与详情布局。 */
    private _depot!: DepotUI;

    constructor(private readonly _root: Node, private readonly _callbacks: LobbyCallbacks) {
        this._panel = this._buildPage();
        this.fitToVisible();
        this._panel.active = false;
        // Graphics 在 onLoad 阶段可能尚未完成渲染组件注册，首帧先画一次静态门体，
        // update() 只在大厅可见时推进动画。
        this._drawPortal(0);
    }

    entries(): [string, Node][] {
        return [['lobby', this._panel]];
    }

    fitToVisible(): void {
        this._depot?.fitToVisible();
        const width = visibleDesignWidth();
        this._panel.getComponent(UITransform)!.setContentSize(width, 720);
        const bg = this._panel.getComponent(Graphics)!;
        bg.clear(); bg.fillColor = UI_PALETTE.deep;
        bg.fillRect(-width / 2, -360, width, 720);
        this._panel.getChildByName('AmbientArt')!.getComponent(UITransform)!.setContentSize(width, 720);
        const veil = this._panel.getChildByName('Veil')!.getComponent(Graphics)!;
        veil.clear();
        veil.fillColor = new Color(15, 27, 43, 155); veil.fillRect(-width / 2, -360, width, 720);
        veil.fillColor = new Color(CYAN.r, CYAN.g, CYAN.b, 12); veil.fillRect(-width / 2, 250, width, 110);
        veil.strokeColor = new Color(CYAN.r, CYAN.g, CYAN.b, 90); veil.lineWidth = 1;
        veil.moveTo(-600, 250); veil.lineTo(600, 250); veil.stroke();
    }

    /** 每次 show() 时由 ScreenManager 调用：按当前选中槽刷新左侧存档概要。 */
    refresh(): void {
        this._depot.hide();
        this._portalHovered = false;
        this._portalFocused = false;
        const p = SaveSystem.load();
        const slot = SaveSystem.currentSlot();
        this._summaryTitle.string = SLOT_TITLES[slot] ?? `存档 ${slot + 1}`;
        this._summaryLines[0].string = `总局数 ${p.totalRuns}  ·  通关 ${p.totalWins}`;
        this._summaryLines[1].string = `最远进度  图${mapOf(Math.max(1, p.bestChapter))}-${chapterInMap(Math.max(1, p.bestChapter))} · 第${Math.max(1, p.bestWave)}波`;
        this._summaryLines[2].string = `累计击杀 ${p.totalKills}  ·  精英 ${p.eliteKills ?? 0} · 小首领 ${p.miniBossKills ?? 0} · Boss ${p.bossKills}`;
        // 英雄总数对齐 CHARS（v5 全明星成就同源，避免图标与实际解锁数漂移）
        const achCount = ACHIEVEMENTS.filter(a => p.achievements.indexOf(a.id) >= 0).length;
        this._summaryLines[3].string = `成就 ${achCount}/${ACHIEVEMENTS.length}  ·  英雄 ${p.charsPlayed.length}/${CHARS.length}`;
    }

    /** 由 ScreenManager.update 每帧转发；大厅隐藏时不推进动画也不重绘。 */
    update(dt: number): void {
        if (!this._panel.active) return;
        this._portalT += Math.min(dt, DT_MAX);
        this._drawPortal(this._portalT);
    }

    // ── 页面骨架 ─────────────────────────────────────────────

    private _buildPage(): Node {
        const page = new Node('lobby'); page.setParent(this._root);
        page.addComponent(UITransform).setContentSize(1280, 720);

        const bg = page.addComponent(Graphics);
        bg.fillColor = UI_PALETTE.deep; bg.fillRect(-640, -360, 1280, 720);

        // 压低远景明度，让半透明终端与全息门场处于同一视觉层。
        const artN = new Node('AmbientArt'); artN.setParent(page);
        artN.addComponent(UITransform).setContentSize(1280, 720);
        const art = artN.addComponent(Sprite); art.sizeMode = Sprite.SizeMode.CUSTOM;
        art.color = new Color(220, 232, 244, 135);
        applyArtSprite(art, 'bg_chapter1');

        const veilN = new Node('Veil'); veilN.setParent(page);
        veilN.addComponent(Graphics);

        this._mkLabel(page, -427, 326, 320, 22, 'OPERATION LOBBY / 存档大厅', 14,
            new Color(CYAN.r, CYAN.g, CYAN.b, 220), HorizontalTextAlignment.LEFT);
        this._mkLabel(page, -272, 291, 560, 48, '作战大厅', 30, WHITE, HorizontalTextAlignment.LEFT);

        const back = this._mkButton(page, '返回首页', 526, 306, 150,
            sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 72 : 42, new Color(78, 111, 135, 255));
        back.on(Node.EventType.TOUCH_END, this._callbacks.onBack);

        this._buildSummaryPanel(page);
        this._buildMetaDock(page);
        this._buildPortal(page);
        this._depot = new DepotUI(page, this._callbacks.onButtonSfx);
        return page;
    }

    /** 左上：当前存档概要面板 + 切换档案入口（refresh 按选中槽填充）。 */
    private _buildSummaryPanel(page: Node): void {
        const panel = new Node('SaveSummary'); panel.setParent(page);
        panel.setPosition(new Vec3(-431, 90, 0));
        const g = panel.addComponent(Graphics); drawPanel(g, 334, 272, CYAN);
        this._mkLabel(panel, 0, 106, 268, 24, '当前档案', 14, MUTED, HorizontalTextAlignment.LEFT);
        this._summaryTitle = this._mkLabel(panel, 0, 74, 268, 34, '', 22, GOLD, HorizontalTextAlignment.LEFT);
        const rowY = [28, -6, -40, -70];
        for (let i = 0; i < 4; i++) {
            this._summaryLines.push(this._mkLabel(panel, 0, rowY[i], 292, 26, '', 14,
                new Color(197, 214, 226, 255), HorizontalTextAlignment.LEFT));
        }
        // 档案切换入口：打开档案列表（3 槽），选定后退回大厅并切换当前档案
        const switchBtn = this._mkButton(panel, '切换档案', 0, -106, 292, 40, new Color(56, 96, 122, 255));
        switchBtn.on(Node.EventType.TOUCH_END, () => this._callbacks.onSwitchSave());
    }

    /** 左下：商店/图鉴/成就档案入口（自首页 MetaDock 迁入大厅）+ v4 装备库。
     *  商店占旧「任务树」位（顶部）：核心币购买装备箱与下一局战备补给。 */
    private _buildMetaDock(page: Node): void {
        const dock = new Node('MetaDock'); dock.setParent(page);
        dock.setPosition(new Vec3(-431, -160, 0));
        dock.addComponent(UITransform).setContentSize(334, 300);

        // 旧「情报终端」分组标题已按玩家要求移除（按钮自明，且加高的档案
        // 面板会压住该标题位置）
        const entries: [MetaPageName, string, Color][] = [
            ['codex', '图鉴', new Color(62, 164, 235, 255)],
            ['achievements', '成就档案', GOLD],
        ];
        entries.forEach(([name, label, accent], i) => {
            const btn = this._mkButton(dock, label, 0, 6 - i * 68, 334,
                sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 64 : 54, accent);
            btn.on(Node.EventType.TOUCH_END, () => this._callbacks.onMetaPage(name));
        });
        // v5：军需商店入口（本页浮层，不走路由）——占旧任务树位，置于终端组顶部
        const shopBtn = this._mkButton(dock, '商店', 0, 74, 334,
            sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 64 : 54, new Color(86, 200, 120, 255));
        shopBtn.on(Node.EventType.TOUCH_END, () => {
            this._callbacks.onButtonSfx();
            this._depot.show('shop');
        });
        // v4：装备库入口（本页浮层，不走路由）；按钮位置在终端组下方
        const armoryBtn = this._mkButton(dock, '装备库', 0, -128 - (sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 4 : 0), 334,
            sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 56 : 46, new Color(150, 108, 220, 255));
        armoryBtn.on(Node.EventType.TOUCH_END, () => {
            this._callbacks.onButtonSfx();
            this._depot.show('armory');
        });
    }

    /** 右侧：代码绘制的全息刻度环，仅核心保留能量贴图。 */
    private _buildPortal(page: Node): void {
        const portal = new Node('Portal'); portal.setParent(page);
        portal.setPosition(new Vec3(430, -20, 0));
        portal.addComponent(UITransform).setContentSize(360, 460);
        registerKeyboardFocus(portal, 360, 460, {
            setFocused: (focused) => { this._portalFocused = focused; },
        });
        portal.on(Node.EventType.MOUSE_ENTER, () => { this._portalHovered = true; });
        portal.on(Node.EventType.MOUSE_LEAVE, () => { this._portalHovered = false; });
        portal.on(Node.EventType.TOUCH_START, () => { this._portalHovered = true; });
        portal.on(Node.EventType.TOUCH_CANCEL, () => { this._portalHovered = false; });

        const coreNode = new Node('PortalCore'); coreNode.setParent(portal);
        coreNode.addComponent(UITransform).setContentSize(340, 340);
        this._portalCoreGfx = coreNode.addComponent(Graphics);

        const coreArtNode = new Node('PortalCoreArt'); coreArtNode.setParent(portal);
        coreArtNode.addComponent(UITransform).setContentSize(190, 190);
        const coreArt = coreArtNode.addComponent(Sprite);
        coreArt.sizeMode = Sprite.SizeMode.CUSTOM;
        // 核心图标保留素材原色与完整亮度，不再额外降低透明度。
        coreArt.color = new Color(255, 255, 255, 255);
        applyArtSprite(coreArt, 'fx_hex_ring');
        tween(coreArtNode).by(32, { angle: 360 }).repeatForever().start();

        const dial = new Node('PortalDial'); dial.setParent(portal);
        const dialGfx = dial.addComponent(Graphics);
        const drawDial = () => {
            dialGfx.clear();
            // 细线、留白与刻度构成投影轮廓，背景能透过整个门场。
            for (const radius of [116, 146, 163]) {
                dialGfx.strokeColor = new Color(63, 202, 224, radius === 146 ? 115 : 50);
                dialGfx.lineWidth = 1;
                dialGfx.circle(0, 0, radius); dialGfx.stroke();
            }
            for (let i = 0; i < 60; i++) {
                const a = i * Math.PI / 30;
                const major = i % 5 === 0;
                const r = major ? 151 : 155;
                dialGfx.strokeColor = new Color(95, 220, 237, major ? 165 : 60);
                dialGfx.lineWidth = major ? 1.5 : 1;
                dialGfx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                dialGfx.lineTo(Math.cos(a) * 159, Math.sin(a) * 159); dialGfx.stroke();
            }
        };
        drawDial(); attachEnableRedraw(dial, drawDial);

        const gfxNode = new Node('PortalGfx'); gfxNode.setParent(portal);
        gfxNode.addComponent(UITransform).setContentSize(360, 460);
        this._portalGfx = gfxNode.addComponent(Graphics);

        portal.on(Node.EventType.TOUCH_END, () => {
            this._portalHovered = false;
            this._callbacks.onButtonSfx();
            this._callbacks.onPortalPressed();
        });

        this._mkLabel(portal, 0, -190, 340, 38, '出击传送门', 24, WHITE);
        this._mkLabel(portal, 0, -220, 340, 24, '选择章节  ·  难度  ·  英雄', 14, CYAN);
    }

    /** 缓慢反向流动的能量弧与轻微呼吸光，悬停/键盘聚焦时增强反馈。 */
    private _drawPortal(t: number): void {
        const core = this._portalCoreGfx;
        const g = this._portalGfx;
        if (!core || !g) return;
        core.clear();
        g.clear();

        const active = this._portalHovered || this._portalFocused;
        const breath = (Math.sin(t * 1.6) + 1) / 2;
        // 由外向内渐亮的半透明场，避免实心圆盘或机械门框。
        for (let i = 0; i < 10; i++) {
            core.fillColor = new Color(35, 175, 215, 3 + Math.round(breath * 2) + (active ? 2 : 0));
            core.circle(0, 0, 142 - i * 11); core.fill();
        }
        // 弧线用多层低透明描边形成柔光，主体仍为细线。
        for (let i = 0; i < 3; i++) {
            const start = t * 0.16 + i * Math.PI * 2 / 3;
            for (const [width, alpha] of [[10, 10], [5, 24], [1.5, active ? 240 : 180]]) {
                g.strokeColor = new Color(64, 225, 242, alpha); g.lineWidth = width;
                g.arc(0, 0, 139, start, start + 1.3, false); g.stroke();
            }
            const innerStart = -t * 0.22 + i * Math.PI * 2 / 3;
            g.strokeColor = new Color(118, 165, 245, active ? 155 : 90); g.lineWidth = 1.5;
            g.arc(0, 0, 109, innerStart, innerStart + 0.7, false); g.stroke();
        }
        if (active) {
            g.strokeColor = new Color(122, 241, 250, 190); g.lineWidth = 1.5;
            g.circle(0, 0, 168); g.stroke();
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
