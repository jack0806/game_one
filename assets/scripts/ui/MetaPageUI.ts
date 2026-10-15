// ============================================================
//  MetaPageUI.ts — 首页元进度页面（图鉴 / 成就墙）
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
import { applyHexButtonSkin, drawHexPanel, registerKeyboardFocus, UI_PALETTE } from '../core/UIStyle';
import {
    CodexCategory, CodexEntry, CODEX_ENTRIES, codexByCategory,
} from '../data/MetaProgressionDB';
import { AchievementAdmin } from '../systems/AchievementAdmin';
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

    private _codexCategory: CodexCategory = 'monster';
    private _codexRoots = new Map<CodexCategory, Node>();
    private _codexSelectedId = '';
    private _codexStats!: Label;
    private _codexArtSprite!: Sprite;
    private _codexQuestion!: Label;
    private _codexDetailName!: Label;
    private _codexDetailSub!: Label;
    private _codexDetailDesc!: Label;
    private _codexDetailTraits!: Label;
    private _codexLockHint!: Label;

    private _achievementCards: AchievementCardView[] = [];
    private _achievementSummary!: Label;
    // ── 成就墙滚动：视口（Mask 裁剪）+ 内容节点 + 滚动条 ──
    private _achieveViewport!: Node;
    private _achieveContent!: Node;
    private _achieveScrollbar!: Graphics;
    private _achieveTabs!: Node;
    /** 当前选中的类型（一级分组；空 = 取第一个分类）。 */
    private _achieveCategory = '';
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
        const page = this._mkPage('codex', '海克斯图鉴', 'ARCHIVE TERMINAL / 样本档案', 'bg_chapter3', new Color(69, 204, 255, 255));
        const monsterTab = this._mkButton(page, '怪物档案', -507, 221, 154, 42, new Color(255, 95, 76, 255));
        const heroTab = this._mkButton(page, '英雄档案', -337, 221, 154, 42, new Color(69, 204, 255, 255));
        monsterTab.on(Node.EventType.TOUCH_END, () => this._showCodexCategory('monster'));
        heroTab.on(Node.EventType.TOUCH_END, () => this._showCodexCategory('hero'));
        this._codexStats = this._mkLabel(page, 38, 222, 380, 26, '', 14, MUTED, HorizontalTextAlignment.RIGHT);

        const gridPanel = new Node('CodexGridPanel'); gridPanel.setParent(page);
        gridPanel.setPosition(new Vec3(-178, -35, 0));
        const gridG = gridPanel.addComponent(Graphics); drawPanel(gridG, 856, 478, new Color(69, 204, 255, 255));
        this._mkLabel(gridPanel, -212, 208, 360, 24, '已收录样本 / 选择卡片读取完整档案', 14, MUTED, HorizontalTextAlignment.LEFT);

        for (const category of ['monster', 'hero'] as CodexCategory[]) {
            const root = new Node(`${category}_grid`); root.setParent(gridPanel);
            this._codexRoots.set(category, root);
            const defs = codexByCategory(category);
            defs.slice(0, 8).forEach((def, i) => {
                const col = i % 4, row = Math.floor(i / 4);
                const card = new Node(`Codex_${def.id}`); card.setParent(root);
                card.setPosition(new Vec3(-312 + col * 208, 80 - row * 196, 0));
                card.addComponent(UITransform).setContentSize(184, 172);
                registerKeyboardFocus(card, 184, 172);
                const g = card.addComponent(Graphics);
                this._drawCodexCard(g, def, 184, 172);

                const frame = new Node('ImageFrame'); frame.setParent(card);
                frame.setPosition(new Vec3(0, 27, 0));
                const fg = frame.addComponent(Graphics);
                fg.fillColor = new Color(3, 9, 16, 245); fg.rect(-47, -47, 94, 94); fg.fill();
                fg.strokeColor = new Color(hexColor(def.color).r, hexColor(def.color).g, hexColor(def.color).b, 120);
                fg.lineWidth = 1; fg.rect(-47, -47, 94, 94); fg.stroke();

                if (def.unlocked) this._mkArt(card, def.artKey, 88, 88, 0, 27);
                else this._mkLabel(card, 0, 28, 88, 88, '?', 56, new Color(105, 126, 143, 255));

                this._mkLabel(card, 0, -47, 164, 26, def.unlocked ? def.name : '未知样本', 16,
                    def.unlocked ? WHITE : new Color(126, 139, 151, 255));
                this._mkLabel(card, 0, -70, 164, 20, def.unlocked ? def.rarity : '未解锁', 14,
                    def.unlocked ? hexColor(def.color) : new Color(91, 105, 118, 255));
                card.on(Node.EventType.TOUCH_END, () => this._selectCodex(def));
            });
        }

        const detail = new Node('CodexDetail'); detail.setParent(page);
        detail.setPosition(new Vec3(431, -35, 0));
        const detailG = detail.addComponent(Graphics); drawPanel(detailG, 334, 478, new Color(69, 204, 255, 255));
        this._mkLabel(detail, 0, 208, 268, 22, '样本分析', 14, new Color(69, 204, 255, 255), HorizontalTextAlignment.LEFT);

        const artFrame = new Node('DetailArtFrame'); artFrame.setParent(detail);
        artFrame.setPosition(new Vec3(0, 103, 0));
        artFrame.addComponent(UITransform).setContentSize(166, 166);
        const afg = artFrame.addComponent(Graphics);
        afg.fillColor = new Color(2, 8, 15, 245); afg.rect(-83, -83, 166, 166); afg.fill();
        afg.strokeColor = new Color(69, 204, 255, 110); afg.lineWidth = 2; afg.rect(-83, -83, 166, 166); afg.stroke();
        const detailArt = new Node('DetailArt'); detailArt.setParent(artFrame);
        detailArt.addComponent(UITransform).setContentSize(156, 156);
        this._codexArtSprite = detailArt.addComponent(Sprite);
        this._codexArtSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this._codexQuestion = this._mkLabel(detail, 0, 103, 150, 150, '?', 74, new Color(107, 130, 148, 255));

        this._codexDetailName = this._mkLabel(detail, 0, 2, 268, 32, '', 20, WHITE, HorizontalTextAlignment.LEFT);
        this._codexDetailSub = this._mkLabel(detail, 0, -29, 268, 22, '', 14, new Color(69, 204, 255, 255), HorizontalTextAlignment.LEFT);
        this._mkDivider(detail, 0, -53, 268, new Color(69, 204, 255, 255));
        this._codexDetailDesc = this._mkLabel(detail, 0, -111, 268, 94, '', 16, new Color(194, 211, 224, 255), HorizontalTextAlignment.LEFT, true);
        this._codexDetailTraits = this._mkLabel(detail, 0, -174, 268, 28, '', 14, GOLD, HorizontalTextAlignment.LEFT);
        this._codexLockHint = this._mkLabel(detail, 0, -205, 300, 22, '', 14, MUTED, HorizontalTextAlignment.LEFT);

        this._showCodexCategory('monster');
    }

    private _drawCodexCard(g: Graphics, def: CodexEntry, w: number, h: number): void {
        const c = def.unlocked ? hexColor(def.color) : new Color(80, 96, 110, 255);
        g.fillColor = new Color(6, 14, 24, 246); clippedPath(g, w, h, 12); g.fill();
        g.fillColor = new Color(c.r, c.g, c.b, def.unlocked ? 18 : 8); clippedPath(g, w - 5, h - 5, 10); g.fill();
        g.strokeColor = new Color(c.r, c.g, c.b, def.unlocked ? 160 : 75);
        g.lineWidth = 1.5; clippedPath(g, w, h, 12); g.stroke();
        g.strokeColor = new Color(c.r, c.g, c.b, 180); g.lineWidth = 3;
        g.moveTo(-w / 2 + 22, h / 2 - 5); g.lineTo(w / 2 - 22, h / 2 - 5); g.stroke();
    }

    private _showCodexCategory(category: CodexCategory): void {
        this._codexCategory = category;
        this._codexRoots.forEach((root, key) => root.active = key === category);
        const defs = codexByCategory(category);
        const unlocked = defs.filter(d => d.unlocked).length;
        const monsters = codexByCategory('monster');
        const heroes = codexByCategory('hero');
        this._codexStats.string = `怪物 ${monsters.filter(x => x.unlocked).length}/${monsters.length}   ·   英雄 ${heroes.filter(x => x.unlocked).length}/${heroes.length}`;
        const selected = defs.find(d => d.id === this._codexSelectedId) ?? defs.find(d => d.unlocked) ?? defs[0];
        if (selected) this._selectCodex(selected);
        void unlocked;
    }

    private _selectCodex(def: CodexEntry): void {
        this._codexSelectedId = def.id;
        this._codexDetailName.string = def.unlocked ? def.name : '未知样本';
        this._codexDetailSub.string = def.unlocked ? `${def.rarity} · ${def.subtitle}` : '数据未解锁';
        this._codexDetailDesc.string = def.unlocked ? def.desc : '该档案仍处于加密状态。完成对应遭遇或解锁条件后，将显示图片、名称与完整介绍。';
        this._codexDetailTraits.string = def.unlocked ? def.traits.map(t => `[ ${t} ]`).join('  ') : '[ ??? ]';
        this._codexLockHint.string = def.unlocked ? '档案已同步' : '未解锁条目使用问号隐藏视觉与身份信息';
        this._codexQuestion.node.active = !def.unlocked;
        this._codexArtSprite.spriteFrame = null;
        if (def.unlocked) {
            const selectedId = def.id;
            loadArtSprite(def.artKey, frame => {
                if (this._codexSelectedId === selectedId && this._codexArtSprite.isValid) {
                    this._codexArtSprite.spriteFrame = frame;
                }
            });
        }
    }

    private _buildAchievementPage(): void {
        const page = this._mkPage('achievements', '成就档案库', 'ACHIEVEMENT VAULT / 永久记录', 'bg_chapter4', GOLD);
        this._achievementSummary = this._mkLabel(page, -80, 292, 450, 38, '', 15, GOLD, HorizontalTextAlignment.RIGHT);

        // 类型页签容器（一级分组，随后台分类数据重建）+ 右侧说明
        this._achieveTabs = new Node('AchTabs'); this._achieveTabs.setParent(page);
        this._achieveTabs.setPosition(new Vec3(0, 226, 0));
        this._mkLabel(page, 500, 226, 200, 24, '等级：普通→稀有→史诗→传奇', 12, MUTED, HorizontalTextAlignment.RIGHT);

        // 滚动视口：Mask 裁剪 + 内容节点承载卡片；滚轮/拖拽滚动。
        const VIEW_W = 1180, VIEW_H = 520;
        const viewport = new Node('AchieveViewport'); viewport.setParent(page);
        viewport.setPosition(new Vec3(0, -80, 0));
        viewport.addComponent(UITransform).setContentSize(VIEW_W, VIEW_H);
        const mask = viewport.addComponent(Mask); mask.type = Mask.Type.GRAPHICS_STENCIL;
        const mg = viewport.addComponent(Graphics);
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

    /** 类型页签（一级分组，随后台成就管理分类数据重建，带已解锁/总数角标）。 */
    private _rebuildAchievementTabs(): void {
        for (const child of [...this._achieveTabs.children]) child.destroy();
        const cats = AchievementAdmin.categories();
        const all = SaveSystem.allAchievements();
        const profile = SaveSystem.load();
        if (cats.indexOf(this._achieveCategory) < 0) this._achieveCategory = cats[0] ?? '';
        cats.forEach((cat, i) => {
            const list = all.filter(a => a.category === cat);
            const done = list.filter(a => profile.achievements.indexOf(a.id) >= 0).length;
            const selected = cat === this._achieveCategory;
            const btn = this._mkButton(this._achieveTabs, `${cat} ${done}/${list.length}`,
                -520 + i * 178, 0, 170, 40,
                selected ? GOLD : new Color(56, 72, 92, 255));
            btn.on(Node.EventType.TOUCH_END, () => {
                if (this._achieveCategory === cat) return;
                this._achieveCategory = cat;
                this._callbacks.onButtonSfx();
                this._rebuildAchievementTabs();
                this._rebuildAchievementCards();
            }, this);
        });
    }

    /**
     * 按当前类型重建成就卡片：先按等级（普通→稀有→史诗→传奇）排序，
     * 等级之间插细分隔行；排序键 = 类型 + 等级 + 定义顺序（与达成状态无关，
     * 解锁新成就不会引起卡片跳动）。后台改动后每次进入页面/切页签都重建。
     */
    private _rebuildAchievementCards(): void {
        const content = this._achieveContent;
        for (const child of [...content.children]) child.destroy();
        this._achievementCards = [];

        const cats = AchievementAdmin.categories();
        if (cats.indexOf(this._achieveCategory) < 0) this._achieveCategory = cats[0] ?? '';
        const order = ['普通', '稀有', '史诗', '传奇'];
        const list = SaveSystem.allAchievements()
            .filter(a => a.category === this._achieveCategory)
            .map((def, i) => ({ def, i }))
            .sort((a, b) =>
                (order.indexOf(a.def.rarity) - order.indexOf(b.def.rarity)) || (a.i - b.i))
            .map(x => x.def);

        const VIEW_H = 520, VIEW_W = 1180;
        const COL_X = [-390, 0, 390], ROW_H = 128, DIV_H = 30;
        // 预排版：条目序列 = 等级分隔行 + 卡片（每行 3 张）
        type Entry = { kind: 'div'; rarity: AchievementDef['rarity'] } | { kind: 'card'; def: AchievementDef; col: number };
        const entries: Entry[] = [];
        let prevRarity = '';
        let col = 0;
        for (const def of list) {
            if (def.rarity !== prevRarity) {
                prevRarity = def.rarity;
                entries.push({ kind: 'div', rarity: def.rarity });
                col = 0;
            }
            entries.push({ kind: 'card', def, col });
            col++;
        }
        const divCount = entries.filter(e => e.kind === 'div').length;
        const cardCount = entries.filter(e => e.kind === 'card').length;
        const contentH = Math.max(VIEW_H, divCount * DIV_H + cardCount * ROW_H + 12);
        content.getComponent(UITransform)!.setContentSize(VIEW_W, contentH);
        this._achieveMaxScroll = Math.max(0, contentH - VIEW_H);

        // 顶部原点游标（自上而下）：分隔行占 DIV_H 且独占一行，卡片按 3 列排布
        let y = contentH - 6;
        let rowCols = 0;
        for (const e of entries) {
            if (e.kind === 'div') {
                const c = this._achievementRarityColor(e.rarity);
                const dn = new Node(`Div_${e.rarity}`); dn.setParent(content);
                dn.setPosition(new Vec3(0, y - DIV_H / 2, 0));
                const dg = dn.addComponent(Graphics);
                dg.strokeColor = new Color(c.r, c.g, c.b, 120); dg.lineWidth = 1;
                dg.moveTo(-570, 0); dg.lineTo(570, 0); dg.stroke();
                dg.fillColor = c; dg.circle(-578, 0, 3); dg.circle(578, 0, 3); dg.fill();
                this._mkLabel(dn, -520, 0, 120, 22, e.rarity, 13, c, HorizontalTextAlignment.LEFT);
                y -= DIV_H;
                rowCols = 0;
                continue;
            }
            if (rowCols === 0) y -= ROW_H;
            this._mkAchievementCard(e.def, COL_X[e.col], y + ROW_H / 2);
            rowCols++;
        }
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
        this._mkLabel(card, -38, -24, 200, 22, `奖励  ${def.reward}`, 14, GOLD, HorizontalTextAlignment.LEFT);
        const progress = this._mkLabel(card, 145, -45, 70, 22, '', 14, MUTED, HorizontalTextAlignment.RIGHT);
        const bar = new Node('ProgressBar'); bar.setParent(card); bar.setPosition(new Vec3(-28, -47, 0));
        const pg = bar.addComponent(Graphics);
        this._achievementCards.push({ def, graphics: g, name, desc, rarity, progress, progressGraphics: pg });
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

            view.graphics.clear();
            view.graphics.fillColor = done ? new Color(22, 20, 10, 248) : new Color(7, 13, 23, 246);
            clippedPath(view.graphics, 370, 116, 12); view.graphics.fill();
            view.graphics.fillColor = new Color(c.r, c.g, c.b, done ? 32 : 12);
            clippedPath(view.graphics, 364, 110, 10); view.graphics.fill();
            view.graphics.strokeColor = new Color(c.r, c.g, c.b, done ? 235 : 115);
            view.graphics.lineWidth = done ? 2.5 : 1.2;
            clippedPath(view.graphics, 370, 116, 12); view.graphics.stroke();
            view.graphics.strokeColor = new Color(c.r, c.g, c.b, 220); view.graphics.lineWidth = 3;
            view.graphics.moveTo(-157, 54); view.graphics.lineTo(157, 54); view.graphics.stroke();

            view.name.color = done ? WHITE : new Color(165, 179, 191, 255);
            view.rarity.color = c;
            // 隐藏成就（滑稽猴彩蛋等）：未解锁时以"？？？"遮掩名称/描述与进度
            const secretPending = !!view.def.hidden && !done;
            view.name.string = secretPending ? '？？？' : view.def.name;
            if (view.desc) view.desc.string = secretPending ? '隐藏成就：达成后揭晓' : view.def.desc;
            view.progress.string = done ? '已达成' : secretPending ? '?' : `${Math.floor(current)}/${view.def.goal}`;
            view.progress.color = done ? new Color(104, 230, 150, 255) : MUTED;
            const pg = view.progressGraphics; pg.clear();
            pg.fillColor = new Color(24, 33, 43, 255); pg.fillRect(-122, -3, 240, 6);
            pg.fillColor = done ? new Color(89, 222, 143, 255) : c;
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
        const n = new Node(`Art_${key}`); n.setParent(parent); n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(width, height);
        const sprite = n.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadArtSprite(key, frame => {
            if (sprite.isValid) sprite.spriteFrame = frame;
        });
        return sprite;
    }
}
