// ============================================================
//  MetaPageUI.ts — 大厅元进度页面（图鉴 / 成就墙）
// ============================================================
// 两个页面均由代码构建，不依赖 prefab。页面只消费静态数据表与存档视图，
// 后续替换图鉴和成就配置时不需要重做布局。

import {
    Color, Graphics, HorizontalTextAlignment, Label, Mask, Node, Sprite,
    UITransform, Vec3, VerticalTextAlignment, sys,
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { visibleDesignWidth } from '../core/ScreenFit';
import { loadArtSprite, applyArtSprite } from '../core/SpriteUtils';
import { createPortraitViewport, fitPortraitFrame, loadPortraitArt } from '../core/PortraitArt';
import { applyHexButtonSkin, drawHexPanel, registerKeyboardFocus, UI_PALETTE } from '../core/UIStyle';
import { CodexCategory, CodexEntry, CODEX_ENTRIES, codexByCategory } from '../data/MetaProgressionDB';
import { AchievementDef, SaveSystem } from '../systems/SaveSystem';

export type MetaPageName = 'codex' | 'achievements';

export interface MetaPageCallbacks {
    onBack: () => void;
    onButtonSfx: () => void;
}

interface AchievementCardView {
    def: AchievementDef;
    graphics: Graphics;
    name: Label;
    /** 描述标签：隐藏成就未解锁时以占位文案遮掩。 */
    desc?: Label;
    rarity: Label;
    /** 奖励行（称号/核心币文案）：未解锁置灰、解锁后金色。 */
    reward: Label;
    progress: Label;
    progressGraphics: Graphics;
}

const WHITE = new Color(232, 244, 250, 255);
const MUTED = new Color(145, 166, 184, 255);
const GOLD = new Color(255, 205, 82, 255);

function hexColor(hex: string, alpha = 255): Color {
    const c = Color.fromHEX(new Color(), hex);
    c.a = alpha;
    return c;
}

function clippedPath(g: Graphics, w: number, h: number, cut: number): void {
    const l = -w / 2, r = w / 2, b = -h / 2, t = h / 2;
    g.moveTo(l + cut, b); g.lineTo(r - cut, b);
    g.lineTo(r, b + cut); g.lineTo(r, t - cut);
    g.lineTo(r - cut, t); g.lineTo(l + cut, t);
    g.lineTo(l, t - cut); g.lineTo(l, b + cut); g.close();
}

function drawPanel(g: Graphics, w: number, h: number, accent: Color, alpha = 242): void {
    g.clear();
    drawHexPanel(g, -w / 2, -h / 2, w, h, accent, alpha);
}

export class MetaPageUI {
    private readonly _panels = new Map<MetaPageName, Node>();
    private readonly _pageAccents = new Map<MetaPageName, Color>();

    private _codexCategory: CodexCategory = 'hero';
    private _codexPage = 0;
    private _codexTabs!: Node;
    private _codexGrid!: Node;
    private _codexGridTitle!: Label;
    private _codexPageLabel!: Label;
    private _codexCardGraphics = new Map<string, Graphics>();
    private _codexSelectedId = '';
    private _codexStats!: Label;
    private _codexArtSprite!: Sprite;
    private _codexArtFrame!: Graphics;
    private _codexDetailName!: Label;
    private _codexDetailSub!: Label;
    private _codexDetailDesc!: Label;
    private _codexDetailTraits!: Label;
    private _codexDetailEncounter!: Label;
    private _codexDetailCombat!: Label;

    private _achievementCards: AchievementCardView[] = [];
    private _achievementSummary!: Label;
    // ── 成就墙滚动：视口（Mask 裁剪）+ 内容节点 + 滚动条 ──
    private _achieveViewport!: Node;
    private _achieveContent!: Node;
    private _achieveScrollbar!: Graphics;
    private _achieveTabs!: Node;
    /** 当前选中的稀有度页签（2026-10-19 玩家定稿：按 普通/稀有/史诗/传奇 一级分组）。 */
    private _achieveRarity = '';
    private _achieveScroll = 0;
    private _achieveMaxScroll = 0;
    private _achieveDragY = 0;
    private _achieveDragging = false;

    constructor(private readonly _root: Node, private readonly _callbacks: MetaPageCallbacks) {
        this._buildCodexPage();
        this._buildAchievementPage();
        this.fitToVisible();
        this._panels.forEach(p => p.active = false);
    }

    entries(): [MetaPageName, Node][] {
        return Array.from(this._panels.entries());
    }

    refresh(name: MetaPageName): void {
        if (name === 'codex') this._showCodexCategory(this._codexCategory);
        else {
            // 成就墙：后台改动（参数/成就管理）后进入页面即重建（页签+卡片）
            this._rebuildAchievementTabs();
            this._rebuildAchievementCards();
        }
    }

    /** 页面背景独立覆盖可见宽度；不依赖战斗底图是否已经加载。 */
    fitToVisible(): void {
        const width = visibleDesignWidth();
        for (const [name, page] of this._panels) {
            page.getComponent(UITransform)!.setContentSize(width, 720);
            const bg = page.getComponent(Graphics)!;
            bg.clear(); bg.fillColor = UI_PALETTE.deep;
            bg.fillRect(-width / 2, -360, width, 720);
            page.getChildByName('AmbientArt')!.getComponent(UITransform)!.setContentSize(width, 720);
            const accent = this._pageAccents.get(name)!;
            const veil = page.getChildByName('Veil')!.getComponent(Graphics)!;
            veil.clear();
            veil.fillColor = new Color(20, 34, 53, 130);
            veil.fillRect(-width / 2, -360, width, 720);
            veil.fillColor = new Color(accent.r, accent.g, accent.b, 12);
            veil.fillRect(-width / 2, 250, width, 110);
            veil.strokeColor = new Color(accent.r, accent.g, accent.b, 90);
            veil.lineWidth = 1;
            veil.moveTo(-600, 250); veil.lineTo(600, 250); veil.stroke();
        }
    }

    private _mkPage(name: MetaPageName, title: string, eyebrow: string, bgKey: string, accent: Color): Node {
        const page = new Node(name); page.setParent(this._root);
        page.addComponent(UITransform).setContentSize(1280, 720);
        this._panels.set(name, page);
        this._pageAccents.set(name, accent);

        page.addComponent(Graphics);

        const artN = new Node('AmbientArt'); artN.setParent(page);
        artN.addComponent(UITransform).setContentSize(1280, 720);
        const art = artN.addComponent(Sprite); art.sizeMode = Sprite.SizeMode.CUSTOM;
        art.color = new Color(174, 198, 218, 114);
        applyArtSprite(art, bgKey);

        const veilN = new Node('Veil'); veilN.setParent(page);
        veilN.addComponent(Graphics);

        this._mkLabel(page, -427, 326, 320, 22, eyebrow, 14,
            new Color(accent.r, accent.g, accent.b, 220), HorizontalTextAlignment.LEFT);
        const titleLbl = this._mkLabel(page, -272, 291, 560, 48, title, 30, WHITE, HorizontalTextAlignment.LEFT);
        titleLbl.overflow = Label.Overflow.SHRINK;

        const back = this._mkButton(page, '返回大厅', 526, 306, 150,
            sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 72 : 42, new Color(78, 111, 135, 255));
        back.on(Node.EventType.TOUCH_END, this._callbacks.onBack);

        // 顶栏两端的切角光标，强化两个页面共用的工业终端语言。
        const marks = new Node('HeaderMarks'); marks.setParent(page);
        const mg = marks.addComponent(Graphics);
        mg.strokeColor = new Color(accent.r, accent.g, accent.b, 185); mg.lineWidth = 3;
        mg.moveTo(-606, 336); mg.lineTo(-606, 286); mg.lineTo(-590, 270); mg.stroke();
        mg.moveTo(606, 270); mg.lineTo(606, 286); mg.stroke();
        return page;
    }

    private _buildCodexPage(): void {
        const cyan = UI_PALETTE.cyan;
        const page = this._mkPage('codex', '战区图鉴', 'FIELD CODEX / 战区情报库', 'bg_chapter3', cyan);
        this._codexTabs = new Node('CodexTabs'); this._codexTabs.setParent(page);
        this._codexStats = this._mkLabel(page, 404, 225, 340, 25, '', 14, MUTED, HorizontalTextAlignment.RIGHT);

        const gridPanel = new Node('CodexGridPanel'); gridPanel.setParent(page);
        gridPanel.setPosition(new Vec3(-205, -43, 0));
        drawPanel(gridPanel.addComponent(Graphics), 780, 490, cyan);
        this._codexGridTitle = this._mkLabel(gridPanel, 0, 211, 700, 24, '', 15, WHITE, HorizontalTextAlignment.LEFT);
        this._codexGrid = new Node('CodexGrid'); this._codexGrid.setParent(gridPanel);
        const prev = this._mkButton(gridPanel, '上一页', -270, -212, 116, 36, new Color(86, 128, 153, 255));
        const next = this._mkButton(gridPanel, '下一页', 270, -212, 116, 36, new Color(86, 128, 153, 255));
        this._codexPageLabel = this._mkLabel(gridPanel, 0, -212, 150, 25, '', 15, WHITE);
        prev.on(Node.EventType.TOUCH_END, () => this._turnCodexPage(-1));
        next.on(Node.EventType.TOUCH_END, () => this._turnCodexPage(1));

        const detail = new Node('CodexDetail'); detail.setParent(page);
        detail.setPosition(new Vec3(393, -43, 0));
        drawPanel(detail.addComponent(Graphics), 396, 490, cyan);
        this._mkLabel(detail, -3, 215, 338, 24, '战术档案 / 单位识别', 15, cyan, HorizontalTextAlignment.LEFT);

        const artFrame = new Node('DetailArtFrame'); artFrame.setParent(detail);
        artFrame.setPosition(new Vec3(0, 93, 0));
        artFrame.addComponent(UITransform).setContentSize(352, 208);
        this._codexArtFrame = artFrame.addComponent(Graphics);
        this._codexArtSprite = createPortraitViewport(artFrame, 'DetailArt', 340, 196);

        this._codexDetailName = this._mkLabel(detail, 0, -33, 344, 32, '', 22, WHITE, HorizontalTextAlignment.LEFT);
        this._codexDetailSub = this._mkLabel(detail, 0, -61, 344, 21, '', 14, cyan, HorizontalTextAlignment.LEFT);
        this._mkDivider(detail, 0, -78, 344, cyan);
        this._codexDetailDesc = this._mkLabel(detail, 0, -116, 344, 61, '', 15, WHITE, HorizontalTextAlignment.LEFT, true);
        this._codexDetailCombat = this._mkLabel(detail, 0, -171, 344, 45, '', 14, new Color(190, 213, 226, 255), HorizontalTextAlignment.LEFT, true);
        this._codexDetailTraits = this._mkLabel(detail, 0, -208, 344, 22, '', 14, GOLD, HorizontalTextAlignment.LEFT);
        this._codexDetailEncounter = this._mkLabel(detail, 0, -230, 344, 18, '', 13, MUTED, HorizontalTextAlignment.LEFT);
        this._showCodexCategory('hero');
    }

    private _buildCodexTabs(): void {
        for (const child of [...this._codexTabs.children]) { child.active = false; child.destroy(); }
        const tabs: [CodexCategory, string, Color][] = [
            ['hero', '英雄', UI_PALETTE.cyan],
            ['boss', '首领', UI_PALETTE.reward],
            ['miniboss', '小首领', new Color(190, 136, 239, 255)],
            ['grunt', '小兵', UI_PALETTE.danger],
        ];
        tabs.forEach(([category, title, color], i) => {
            const selected = category === this._codexCategory;
            const btn = this._mkButton(this._codexTabs, `${title}  ${codexByCategory(category).length}`,
                -500 + i * 168, 224, 156, 42, selected ? color : new Color(77, 103, 126, 255));
            btn.on(Node.EventType.TOUCH_END, () => {
                if (this._codexCategory !== category) this._showCodexCategory(category);
            });
        });
    }

    private _drawCodexCard(g: Graphics, def: CodexEntry, selected: boolean): void {
        const c = hexColor(def.color);
        g.clear();
        g.fillColor = new Color(8, 21, 33, 250);
        g.roundRect(-114, -75, 228, 150, 12); g.fill();
        g.fillColor = new Color(c.r, c.g, c.b, selected ? 41 : 15);
        g.roundRect(-110, -71, 220, 142, 10); g.fill();
        g.strokeColor = new Color(c.r, c.g, c.b, selected ? 255 : 138);
        g.lineWidth = selected ? 2.5 : 1.5;
        g.roundRect(-113, -74, 226, 148, 11); g.stroke();
        g.fillColor = new Color(c.r, c.g, c.b, selected ? 245 : 169);
        g.roundRect(-103, 66, 206, 3, 1); g.fill();
        g.fillColor = new Color(4, 14, 24, 154);
        g.roundRect(-103, -69, 206, 34, 5); g.fill();
    }

    private _renderCodexPage(): void {
        for (const child of [...this._codexGrid.children]) { child.active = false; child.destroy(); }
        this._codexCardGraphics.clear();
        const defs = codexByCategory(this._codexCategory);
        const pages = Math.max(1, Math.ceil(defs.length / 6));
        this._codexPage = Math.max(0, Math.min(pages - 1, this._codexPage));
        const current = defs.slice(this._codexPage * 6, this._codexPage * 6 + 6);
        const names: Record<CodexCategory, string> = { hero: '英雄阵容', boss: '区域首领', miniboss: '小首领', grunt: '战场小兵' };
        this._codexGridTitle.string = `${names[this._codexCategory]}  /  点击单位读取战术档案`;
        this._codexPageLabel.string = `${this._codexPage + 1} / ${pages}`;
        this._codexStats.string = `已收录 ${CODEX_ENTRIES.length} 份单位档案`;

        current.forEach((def, i) => {
            const card = new Node(`Codex_${def.id}`); card.setParent(this._codexGrid);
            card.setPosition(new Vec3(-250 + (i % 3) * 250, 86 - Math.floor(i / 3) * 163, 0));
            card.addComponent(UITransform).setContentSize(228, 150);
            registerKeyboardFocus(card, 228, 150, { activate: () => this._selectCodex(def) });
            const g = card.addComponent(Graphics);
            this._codexCardGraphics.set(def.id, g);
            if (def.category === 'hero') {
                loadPortraitArt(card, def.artKey, 208, 99, 0, 16, 'cover', true);
            } else {
                loadPortraitArt(card, def.artKey, 196, 99, 0, 16);
            }
            this._mkLabel(card, 0, -48, 208, 24, def.name, 16, WHITE);
            this._mkLabel(card, 0, -66, 208, 17, def.subtitle, 12, hexColor(def.color));
            card.on(Node.EventType.TOUCH_END, () => this._selectCodex(def));
        });
        const selected = current.find(x => x.id === this._codexSelectedId) ?? current[0];
        if (selected) this._selectCodex(selected);
    }

    private _turnCodexPage(delta: number): void {
        const pages = Math.ceil(codexByCategory(this._codexCategory).length / 6);
        const next = Math.max(0, Math.min(pages - 1, this._codexPage + delta));
        if (next === this._codexPage) return;
        this._codexPage = next;
        this._renderCodexPage();
    }

    private _showCodexCategory(category: CodexCategory): void {
        if (category !== this._codexCategory) {
            this._codexPage = 0;
            this._codexSelectedId = '';
        }
        this._codexCategory = category;
        this._buildCodexTabs();
        this._renderCodexPage();
    }

    private _selectCodex(def: CodexEntry): void {
        this._codexSelectedId = def.id;
        this._codexCardGraphics.forEach((g, id) => {
            const entry = codexByCategory(this._codexCategory).find(x => x.id === id);
            if (entry) this._drawCodexCard(g, entry, id === def.id);
        });
        const c = hexColor(def.color);
        const frame = this._codexArtFrame; frame.clear();
        frame.fillColor = new Color(5, 17, 28, 245);
        frame.roundRect(-176, -104, 352, 208, 12); frame.fill();
        frame.fillColor = new Color(c.r, c.g, c.b, 18);
        frame.roundRect(-170, -98, 340, 196, 10); frame.fill();
        frame.strokeColor = new Color(c.r, c.g, c.b, 150); frame.lineWidth = 1.5;
        frame.roundRect(-175, -103, 350, 206, 11); frame.stroke();
        frame.strokeColor = new Color(c.r, c.g, c.b, 90); frame.lineWidth = 1;
        frame.moveTo(-136, -83); frame.lineTo(136, -83); frame.stroke();
        this._codexDetailName.string = def.name;
        this._codexDetailSub.string = def.subtitle;
        this._codexDetailDesc.string = def.desc;
        this._codexDetailCombat.string = `应对 / ${def.combat}`;
        this._codexDetailTraits.string = def.traits.map(t => `[ ${t} ]`).join('  ');
        this._codexDetailEncounter.string = `发现地 / ${def.encounter}`;
        this._codexArtSprite.spriteFrame = null;
        const selectedId = def.id;
        loadArtSprite(def.artKey, art => {
            if (art && this._codexSelectedId === selectedId && this._codexArtSprite.isValid) {
                fitPortraitFrame(this._codexArtSprite, art, 340, 196,
                    def.category === 'hero' ? 'cover' : 'contain', def.category === 'hero');
            }
        });
    }

    private _buildAchievementPage(): void {
        const page = this._mkPage('achievements', '成就档案库', 'ACHIEVEMENT VAULT / 永久记录', 'bg_chapter4', GOLD);
        this._achievementSummary = this._mkLabel(page, -80, 292, 450, 38, '', 15, GOLD, HorizontalTextAlignment.RIGHT);

        // 稀有度页签容器（2026-10-19 玩家定稿：普通/稀有/史诗/传奇 一级分组）
        this._achieveTabs = new Node('AchTabs'); this._achieveTabs.setParent(page);
        this._achieveTabs.setPosition(new Vec3(0, 226, 0));

        // 滚动视口：Mask 裁剪 + 内容节点承载卡片；滚轮/拖拽滚动。
        const VIEW_W = 1180, VIEW_H = 520;
        const viewport = new Node('AchieveViewport'); viewport.setParent(page);
        viewport.setPosition(new Vec3(0, -80, 0));
        viewport.addComponent(UITransform).setContentSize(VIEW_W, VIEW_H);
        const mask = viewport.addComponent(Mask); mask.type = Mask.Type.GRAPHICS_STENCIL;
        // Mask(GRAPHICS_STENCIL) 在 type 赋值时已在同节点创建内部 Graphics，必须复用；
        // 再 addComponent 会挂上第二个渲染组件（uiComp 冲突 + 渲染管线崩溃）
        const mg = viewport.getComponent(Graphics)!;
        mg.fillColor = Color.WHITE; mg.rect(-VIEW_W / 2, -VIEW_H / 2, VIEW_W, VIEW_H); mg.fill();
        this._achieveViewport = viewport;

        const content = new Node('AchieveContent'); content.setParent(viewport);
        content.addComponent(UITransform).setContentSize(VIEW_W, VIEW_H);
        this._achieveContent = content;

        // 滚动条：视口右缘细槽 + 位置滑块，随滚动重画。
        const sb = new Node('AchieveScrollbar'); sb.setParent(page);
        sb.setPosition(new Vec3(VIEW_W / 2 + 14, -80, 0));
        this._achieveScrollbar = sb.addComponent(Graphics);

        // 滚轮：向上滚回顶部（s 减小），向下翻页（s 增大）。
        viewport.on(Node.EventType.MOUSE_WHEEL, (ev: any) => {
            this._scrollAchievements(this._achieveScroll - (ev.getScrollY?.() ?? 0) * 0.5);
        }, this);
        // 触屏/鼠标拖拽翻页。
        viewport.on(Node.EventType.TOUCH_START, (ev: any) => {
            this._achieveDragging = true;
            this._achieveDragY = ev.getUILocation?.().y ?? 0;
        }, this);
        viewport.on(Node.EventType.TOUCH_MOVE, (ev: any) => {
            if (!this._achieveDragging) return;
            const y = ev.getUILocation?.().y ?? 0;
            this._scrollAchievements(this._achieveScroll - (y - this._achieveDragY));
            this._achieveDragY = y;
        }, this);
        viewport.on(Node.EventType.TOUCH_END, () => this._achieveDragging = false, this);
        viewport.on(Node.EventType.TOUCH_CANCEL, () => this._achieveDragging = false, this);

        this._rebuildAchievementTabs();
        this._rebuildAchievementCards();
    }

    /** 稀有度页签（一级分组：普通/稀有/史诗/传奇，带已解锁/总数角标）。 */
    private _rebuildAchievementTabs(): void {
        for (const child of [...this._achieveTabs.children]) child.destroy();
        const rarities: AchievementDef['rarity'][] = ['普通', '稀有', '史诗', '传奇'];
        const all = SaveSystem.allAchievements();
        const profile = SaveSystem.load();
        if (rarities.indexOf(this._achieveRarity as any) < 0) this._achieveRarity = rarities[0];
        rarities.forEach((rarity, i) => {
            const list = all.filter(a => a.rarity === rarity);
            const done = list.filter(a => profile.achievements.indexOf(a.id) >= 0).length;
            const selected = rarity === this._achieveRarity;
            const btn = this._mkButton(this._achieveTabs, `${rarity} ${done}/${list.length}`,
                -267 + i * 178, 0, 170, 40,
                selected ? GOLD : new Color(56, 72, 92, 255));
            btn.on(Node.EventType.TOUCH_END, () => {
                if (this._achieveRarity === rarity) return;
                this._achieveRarity = rarity;
                this._callbacks.onButtonSfx();
                this._rebuildAchievementTabs();
                this._rebuildAchievementCards();
            }, this);
        });
    }

    /**
     * 按当前稀有度页签重建成就卡片（每行 3 张，定义顺序即展示顺序，与达成
     * 状态无关——解锁新成就不会引起卡片跳动）。后台改动后每次进入页面/切
     * 页签都重建。
     * 排版游标从内容节点的**本地顶缘**（contentH/2）起步——此前用 contentH
     * 当顶缘导致卡片整体高出节点一倍、被 Mask 裁掉（2026-10-19 修复）。
     */
    private _rebuildAchievementCards(): void {
        const content = this._achieveContent;
        for (const child of [...content.children]) child.destroy();
        this._achievementCards = [];

        const rarities: AchievementDef['rarity'][] = ['普通', '稀有', '史诗', '传奇'];
        if (rarities.indexOf(this._achieveRarity as any) < 0) this._achieveRarity = rarities[0];
        const list = SaveSystem.allAchievements().filter(a => a.rarity === this._achieveRarity);

        const VIEW_H = 520, VIEW_W = 1180;
        const COL_X = [-390, 0, 390], ROW_H = 128;
        const rowCount = Math.max(1, Math.ceil(list.length / 3));
        const contentH = Math.max(VIEW_H, rowCount * ROW_H + 12);
        content.getComponent(UITransform)!.setContentSize(VIEW_W, contentH);
        this._achieveMaxScroll = Math.max(0, contentH - VIEW_H);

        let y = contentH / 2 - 6;
        list.forEach((def, i) => {
            if (i % 3 === 0) y -= ROW_H;
            this._mkAchievementCard(def, COL_X[i % 3], y + ROW_H / 2);
        });
        this._scrollAchievements(0);
        this._refreshAchievements();
    }

    private _mkAchievementCard(def: AchievementDef, cx: number, cy: number): Node {
        const card = new Node(`Achievement_${def.id}`); card.setParent(this._achieveContent);
        card.setPosition(new Vec3(cx, cy, 0));
        card.addComponent(UITransform).setContentSize(370, 116);
        const g = card.addComponent(Graphics);

        this._mkArt(card, `ui_icon_${def.artKey}`, 50, 50, -150, 17);
        const name = this._mkLabel(card, -24, 30, 200, 30, def.name, 19, WHITE, HorizontalTextAlignment.LEFT);
        const rarity = this._mkLabel(card, 146, 31, 62, 24, def.rarity, 14, GOLD, HorizontalTextAlignment.RIGHT);
        const desc = this._mkLabel(card, 14, 2, 276, 24, def.desc, 15, new Color(182, 201, 215, 255), HorizontalTextAlignment.LEFT);
        const reward = this._mkLabel(card, -38, -24, 260, 22, `奖励  ${def.reward}`, 14, GOLD, HorizontalTextAlignment.LEFT);
        const progress = this._mkLabel(card, 145, -45, 70, 22, '', 14, MUTED, HorizontalTextAlignment.RIGHT);
        const bar = new Node('ProgressBar'); bar.setParent(card); bar.setPosition(new Vec3(-28, -47, 0));
        const pg = bar.addComponent(Graphics);
        this._achievementCards.push({ def, graphics: g, name, desc, rarity, reward, progress, progressGraphics: pg });
        return card;
    }

    /** 应用滚动位置：钳制范围、移动内容节点、重画滚动条。 */
    private _scrollAchievements(s: number): void {
        this._achieveScroll = Math.max(0, Math.min(this._achieveMaxScroll, s));
        const content = this._achieveContent;
        const viewH = this._achieveViewport.getComponent(UITransform)!.contentSize.height;
        const contentH = Math.max(viewH, content.getComponent(UITransform)!.contentSize.height);
        content.setPosition(new Vec3(0, (viewH - contentH) / 2 + this._achieveScroll, 0));
        // 内容不满一屏时不显示滚动条
        const g = this._achieveScrollbar;
        g.clear();
        if (this._achieveMaxScroll <= 0) return;
        const trackH = viewH - 24;
        const thumbH = Math.max(48, trackH * viewH / contentH);
        const t = this._achieveScroll / this._achieveMaxScroll;
        const thumbY = trackH / 2 - thumbH / 2 - t * (trackH - thumbH);
        g.fillColor = new Color(24, 33, 43, 200);
        g.rect(0, -trackH / 2, 4, trackH); g.fill();
        g.fillColor = new Color(255, 205, 82, 190);
        g.rect(-1, thumbY - thumbH / 2, 6, thumbH); g.fill();
    }

    private _refreshAchievements(): void {
        const profile = SaveSystem.load();
        let unlocked = 0;
        for (const view of this._achievementCards) {
            const done = profile.achievements.indexOf(view.def.id) >= 0;
            if (done) unlocked++;
            const current = Math.min(view.def.progress(profile), view.def.goal);
            const ratio = view.def.goal > 0 ? current / view.def.goal : 0;
            const c = this._achievementRarityColor(view.def.rarity);

            // 2026-10-19 玩家定稿：未解锁整卡置灰（名称/描述/稀有度/奖励/进度全部
            // 灰阶），解锁后彩色（白名 + 稀有度色边 + 金色奖励 + 绿色进度）。
            view.graphics.clear();
            view.graphics.fillColor = done ? new Color(22, 20, 10, 248) : new Color(10, 14, 21, 240);
            clippedPath(view.graphics, 370, 116, 12); view.graphics.fill();
            view.graphics.fillColor = new Color(c.r, c.g, c.b, done ? 32 : 8);
            clippedPath(view.graphics, 364, 110, 10); view.graphics.fill();
            view.graphics.strokeColor = new Color(c.r, c.g, c.b, done ? 235 : 60);
            view.graphics.lineWidth = done ? 2.5 : 1;
            clippedPath(view.graphics, 370, 116, 12); view.graphics.stroke();
            view.graphics.strokeColor = new Color(c.r, c.g, c.b, done ? 220 : 45); view.graphics.lineWidth = 3;
            view.graphics.moveTo(-157, 54); view.graphics.lineTo(157, 54); view.graphics.stroke();

            view.name.color = done ? WHITE : new Color(132, 146, 158, 255);
            view.rarity.color = done ? c : new Color(120, 136, 150, 255);
            view.reward.color = done ? GOLD : new Color(116, 132, 146, 255);
            // 隐藏成就（滑稽猴彩蛋等）：未解锁时以"？？？"遮掩名称/描述与进度
            const secretPending = !!view.def.hidden && !done;
            view.name.string = secretPending ? '？？？' : view.def.name;
            if (view.desc) {
                view.desc.string = secretPending ? '隐藏成就：达成后揭晓' : view.def.desc;
                view.desc.color = done ? new Color(182, 201, 215, 255) : new Color(108, 122, 136, 255);
            }
            view.progress.string = done ? '已达成' : secretPending ? '?' : `${Math.floor(current)}/${view.def.goal}`;
            view.progress.color = done ? new Color(104, 230, 150, 255) : new Color(116, 132, 146, 255);
            const pg = view.progressGraphics; pg.clear();
            pg.fillColor = new Color(24, 33, 43, 255); pg.fillRect(-122, -3, 240, 6);
            pg.fillColor = done ? new Color(89, 222, 143, 255) : new Color(96, 110, 122, 255);
            pg.fillRect(-122, -3, 240 * (secretPending ? 0 : Math.max(0, Math.min(1, ratio))), 6);
        }
        const legendary = SaveSystem.allAchievements().filter(a => a.rarity === '传奇' && !a.hidden).length;
        const total = SaveSystem.allAchievements().length;
        this._achievementSummary.string = `已解锁 ${unlocked} / ${total}   ·   明面传奇成就 ${legendary}`;
    }

    private _achievementRarityColor(rarity: AchievementDef['rarity']): Color {
        if (rarity === '传奇') return new Color(255, 208, 90, 255);
        if (rarity === '史诗') return new Color(176, 96, 255, 255);
        if (rarity === '稀有') return new Color(68, 170, 255, 255);
        return new Color(143, 167, 184, 255);
    }

    private _mkLabel(
        parent: Node, x: number, y: number, width: number, height: number,
        text: string, fontSize: number, color: Color,
        align = HorizontalTextAlignment.CENTER, wrap = false,
    ): Label {
        const n = new Node(`Label_${text.slice(0, 8)}`); n.setParent(parent);
        n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(width, height);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = fontSize; l.lineHeight = Math.round(fontSize * 1.45);
        l.color = color; l.horizontalAlign = align; l.verticalAlign = VerticalTextAlignment.CENTER;
        l.overflow = wrap ? Label.Overflow.SHRINK : Label.Overflow.SHRINK;
        l.enableWrapText = wrap;
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

    private _mkDivider(parent: Node, x: number, y: number, width: number, color: Color): void {
        const n = new Node('Divider'); n.setParent(parent); n.setPosition(new Vec3(x, y, 0));
        const g = n.addComponent(Graphics);
        g.strokeColor = new Color(color.r, color.g, color.b, 90); g.lineWidth = 1;
        g.moveTo(-width / 2, 0); g.lineTo(width / 2, 0); g.stroke();
        g.fillColor = new Color(color.r, color.g, color.b, 190);
        g.circle(-width / 2, 0, 2); g.circle(width / 2, 0, 2); g.fill();
    }

    private _mkArt(parent: Node, key: string, width: number, height: number, x: number, y: number): Sprite {
        return loadPortraitArt(parent, key, width, height, x, y);
    }
}
