// ============================================================
//  LobbyUI.ts — 存档大厅（选定存档后的中枢页面）
// ============================================================
// 左侧：存档概要 + 任务树/图鉴/成就档案入口（自首页迁移而来）。
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
import { MetaPageName } from './MetaPageUI';
import {
    EQUIP_AFFIXES, equipmentLabel, equipmentSellValue, equipmentValue,
} from '../data/EquipmentDB';

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
    /** v4 装备库浮层（查看仓库 / 3 格配装 / 卖出换核心币）。 */
    private _armory!: Node;
    private _armorySlots: Label[] = [];
    private _armoryGrid!: Node;
    private _armoryCoins!: Label;

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
        this._portalHovered = false;
        this._portalFocused = false;
        const p = SaveSystem.load();
        const slot = SaveSystem.currentSlot();
        this._summaryTitle.string = SLOT_TITLES[slot] ?? `存档 ${slot + 1}`;
        this._summaryLines[0].string = `总局数 ${p.totalRuns}  ·  通关 ${p.totalWins}`;
        this._summaryLines[1].string = `最远进度  图${mapOf(Math.max(1, p.bestChapter))}-${chapterInMap(Math.max(1, p.bestChapter))} · 第${Math.max(1, p.bestWave)}波`;
        this._summaryLines[2].string = `累计击杀 ${p.totalKills}  ·  Boss ${p.bossKills}`;
        this._summaryLines[3].string = `成就 ${p.achievements.length}/${ACHIEVEMENTS.length}  ·  英雄 ${p.charsPlayed.length}/6`;
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
        this._armory = this._buildArmory();
        return page;
    }

    /** 左上：当前存档概要面板（refresh 按选中槽填充）。 */
    private _buildSummaryPanel(page: Node): void {
        const panel = new Node('SaveSummary'); panel.setParent(page);
        panel.setPosition(new Vec3(-431, 104, 0));
        const g = panel.addComponent(Graphics); drawPanel(g, 334, 226, CYAN);
        this._mkLabel(panel, 0, 88, 268, 24, '当前档案', 14, MUTED, HorizontalTextAlignment.LEFT);
        this._summaryTitle = this._mkLabel(panel, 0, 56, 268, 34, '', 22, GOLD, HorizontalTextAlignment.LEFT);
        const rowY = [12, -24, -60, -92];
        for (let i = 0; i < 4; i++) {
            this._summaryLines.push(this._mkLabel(panel, 0, rowY[i], 292, 26, '', 14,
                new Color(197, 214, 226, 255), HorizontalTextAlignment.LEFT));
        }
    }

    /** 左下：任务树/图鉴/成就档案入口（自首页 MetaDock 迁入大厅）+ v4 装备库。 */
    private _buildMetaDock(page: Node): void {
        const dock = new Node('MetaDock'); dock.setParent(page);
        dock.setPosition(new Vec3(-431, -160, 0));
        dock.addComponent(UITransform).setContentSize(334, 300);

        this._mkLabel(dock, 0, 128, 334, 22, '情报终端', 14, MUTED, HorizontalTextAlignment.LEFT);
        const entries: [MetaPageName, string, Color][] = [
            ['tasks', '任务树', CYAN],
            ['codex', '图鉴', new Color(62, 164, 235, 255)],
            ['achievements', '成就档案', GOLD],
        ];
        entries.forEach(([name, label, accent], i) => {
            const btn = this._mkButton(dock, label, 0, 74 - i * 68, 334,
                sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 64 : 54, accent);
            btn.on(Node.EventType.TOUCH_END, () => this._callbacks.onMetaPage(name));
        });
        // v4：装备库入口（本页浮层，不走路由）；按钮位置在三个元进度入口下方
        const armoryBtn = this._mkButton(dock, '装备库', 0, -128 - (sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 4 : 0), 334,
            sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 56 : 46, new Color(150, 108, 220, 255));
        armoryBtn.on(Node.EventType.TOUCH_END, () => {
            this._callbacks.onButtonSfx();
            this._openArmory();
        });
    }

    // ── v4 装备库浮层 ─────────────────────────────────────────

    /** 打开装备库：刷新 3 个出战格与仓库网格。 */
    private _openArmory(): void {
        this._refreshArmory();
        this._armory.active = true;
    }

    private _closeArmory(): void {
        this._armory.active = false;
    }

    private _buildArmory(): Node {
        const layer = new Node('Armory'); layer.setParent(this._panel);
        layer.addComponent(UITransform).setContentSize(1280, 720);
        layer.active = false;

        // 半透明遮罩：点遮罩不关闭（防误触），仅按钮关闭
        const dim = new Node('Dim'); dim.setParent(layer);
        dim.addComponent(UITransform).setContentSize(1280, 720);
        const dg = dim.addComponent(Graphics);
        dg.fillColor = new Color(4, 8, 16, 225); dg.fillRect(-640, -360, 1280, 720);

        const panel = new Node('Panel'); panel.setParent(layer);
        panel.addComponent(UITransform).setContentSize(980, 620);
        const pg = panel.addComponent(Graphics); drawPanel(pg, 980, 620, new Color(150, 108, 220, 255));

        this._mkLabel(panel, 0, 272, 600, 36, '— 装备库 —', 26, GOLD);
        this._mkLabel(panel, 0, 234, 820, 22,
            '跨局战利品 · 3 个出战格 · 卖出换核心币（等价局内卖金折算）', 14, MUTED);
        this._armoryCoins = this._mkLabel(panel, 430, 234, 220, 22, '', 15, GOLD);

        // 顶部：3 个出战装备格（点击卸下）
        for (let i = 0; i < 3; i++) {
            const slot = new Node(`Slot${i}`); slot.setParent(panel);
            slot.setPosition(new Vec3(-260 + i * 260, 168, 0));
            slot.addComponent(UITransform).setContentSize(240, 64);
            const sg = slot.addComponent(Graphics);
            const drawSlot = () => drawPanel(sg, 240, 64, CYAN);
            drawSlot();
            const lbl = this._mkLabel(slot, 0, 0, 226, 44, '空', 16, MUTED);
            this._armorySlots.push(lbl);
            slot.on(Node.EventType.TOUCH_END, () => {
                const p = SaveSystem.load();
                const uid = (p.equipLoadout ?? [])[i];
                if (!uid) return;
                this._callbacks.onButtonSfx();
                SaveSystem.setEquipSlot(i, null);
                this._refreshArmory();
            });
        }

        // 中部：仓库网格容器（_refreshArmory 重建内容）
        this._armoryGrid = new Node('Grid'); this._armoryGrid.setParent(panel);
        this._armoryGrid.setPosition(new Vec3(0, -110, 0));

        const close = this._mkButton(panel, '关闭', 420, 272, 120, 44, new Color(78, 111, 135, 255));
        close.on(Node.EventType.TOUCH_END, () => {
            this._callbacks.onButtonSfx();
            this._closeArmory();
        });
        return layer;
    }

    /** 刷新出战格与仓库网格（每次打开/装卸/卖出后调用）。 */
    private _refreshArmory(): void {
        const p = SaveSystem.load();
        this._armoryCoins.string = `核心币 ${p.coreCoins ?? 0}`;
        const byUid = new Map((p.equipments ?? []).map(e => [e.uid, e]));
        const loadout = p.equipLoadout ?? [null, null, null];

        // 出战格标签
        for (let i = 0; i < 3; i++) {
            const eq = loadout[i] != null ? byUid.get(loadout[i]) : undefined;
            this._armorySlots[i].string = eq ? equipmentLabel(eq) : '空';
            this._armorySlots[i].color = eq ? WHITE : MUTED;
        }

        // 仓库网格：每行 5 张卡（最多 5 词缀×3品质=15 件）
        for (const child of [...this._armoryGrid.children]) {
            child.off(Node.EventType.TOUCH_END);
            child.removeFromParent();
            child.destroy();
        }
        const items = p.equipments ?? [];
        if (!items.length) {
            this._mkLabel(this._armoryGrid, 0, 60, 700, 30,
                '仓库空空如也 —— 击杀章节 Boss 必掉装备（通关第 15 波）', 16, MUTED);
            return;
        }
        const equippedUids = new Set(loadout.filter(u => u != null));
        items.forEach((eq, i) => {
            const col = i % 5, row = Math.floor(i / 5);
            const card = new Node(`Eq_${eq.uid}`); card.setParent(this._armoryGrid);
            card.setPosition(new Vec3(-392 + col * 196, 150 - row * 118, 0));
            card.addComponent(UITransform).setContentSize(186, 108);
            const g = card.addComponent(Graphics);
            const equipped = equippedUids.has(eq.uid);
            drawPanel(g, 186, 108, equipped ? CYAN : new Color(96, 116, 138, 255));

            const affix = EQUIP_AFFIXES.find(a => a.id === eq.affix);
            const isFlat = eq.affix === 'crit' || eq.affix === 'greed';
            const value = equipmentValue(eq);
            this._mkLabel(card, 0, 36, 176, 22, equipmentLabel(eq), 15, equipped ? GOLD : WHITE);
            this._mkLabel(card, 0, 12, 176, 20,
                `${affix?.label ?? eq.affix}  ${isFlat ? '+' + value : '+' + Math.round(value * 100) + '%'}`, 13,
                new Color(197, 214, 226, 255));

            const equipBtn = this._mkButton(card, equipped ? '已出战' : '装备', -40, -34, 88, 30,
                equipped ? new Color(70, 84, 96, 255) : new Color(60, 130, 105, 255));
            equipBtn.on(Node.EventType.TOUCH_END, () => {
                if (equippedUids.has(eq.uid)) return;
                const slot = (SaveSystem.load().equipLoadout ?? [null, null, null]).findIndex(s => s == null);
                if (slot < 0) {
                    this._callbacks.onButtonSfx();
                    return;   // 满格：先在上方格子点击卸下
                }
                SaveSystem.setEquipSlot(slot, eq.uid);
                this._callbacks.onButtonSfx();
                this._refreshArmory();
            });

            // 卖出两段确认（装备永久失去，防误触）
            const state = { confirming: false };
            const sellBtn = this._mkButton(card, `卖 ${equipmentSellValue(eq.quality)}`, 48, -34, 92, 30,
                new Color(140, 70, 60, 255));
            sellBtn.on(Node.EventType.TOUCH_END, () => {
                if (!state.confirming) {
                    state.confirming = true;
                    const l = sellBtn.children[0]?.getComponent(Label);
                    if (l) l.string = '确认?';
                    return;
                }
                const coins = Math.max(1, Math.round(equipmentSellValue(eq.quality) * 0.2));
                SaveSystem.removeEquipment(eq.uid);
                SaveSystem.addCoreCoins(coins);
                this._callbacks.onButtonSfx();
                this._refreshArmory();
            });
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
