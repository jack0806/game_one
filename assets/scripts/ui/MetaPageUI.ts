// ============================================================
//  MetaPageUI.ts — 大厅元进度页面（图鉴 / 成就墙）
// ============================================================
// 两个页面均由代码构建，不依赖 prefab。页面只消费静态数据表与存档视图，
// 后续替换图鉴和成就配置时不需要重做布局。

import {
    Color, Graphics, HorizontalTextAlignment, Label, Node, Sprite,
    UITransform, Vec3, VerticalTextAlignment, sys,
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { visibleDesignWidth } from '../core/ScreenFit';
import { loadArtSprite, applyArtSprite } from '../core/SpriteUtils';
import { createPortraitViewport, fitPortraitFrame, loadPortraitArt } from '../core/PortraitArt';
import { applyHexButtonSkin, attachEnableRedraw, drawHexPanel, registerKeyboardFocus, UI_PALETTE } from '../core/UIStyle';
import { CodexCategory, CodexEntry, CODEX_ENTRIES, codexByCategory } from '../data/MetaProgressionDB';
import { AchievementDef, SaveSystem } from '../systems/SaveSystem';
import { ACHIEVEMENT_TYPES } from '../data/AchievementDB';

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
    icon: Sprite;
}

const WHITE = new Color(232, 244, 250, 255);
const MUTED = new Color(145, 166, 184, 255);
const GOLD = new Color(255, 205, 82, 255);
// 每页三列两行，页脚独立留出翻页操作区。
const ACHIEVE_LAYOUT = { viewW: 960, viewH: 432, viewX: 120, viewY: -82, cardW: 302, cardH: 204, rowH: 216, pageSize: 6 };

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
    private _achievementCompletion!: Label;
    private _achievementOverview!: Graphics;
    private _achievementSection!: Label;
    private _achieveContent!: Node;
    private _achievePager!: Node;
    private _achievePage = 0;
    private _achievePageCount = 1;
    private _achieveTabs!: Node;
    /** 稀有度仍是一级分组，玩法分类放入左侧档案目录。 */
    private _achieveRarity = '普通';
    private _achieveType = '全部';
    private _achieveStatus = '全部';
    private _achieveLegacy = false;
    private _achieveFilters!: Node;

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
            this._rebuildAchievementFilters();
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
            veil.fillColor = name === 'achievements' ? new Color(10, 23, 38, 204) : new Color(20, 34, 53, 130);
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
        this._achievementSummary = this._mkLabel(page, 135, 307, 360, 32, '', 23, WHITE, HorizontalTextAlignment.LEFT);
        this._achievementCompletion = this._mkLabel(page, 135, 279, 360, 23, '', 13, MUTED, HorizontalTextAlignment.LEFT);
        const overview = new Node('AchievementOverview'); overview.setParent(page);
        overview.setPosition(new Vec3(135, 262, 0));
        this._achievementOverview = overview.addComponent(Graphics);

        // 目录承担玩法分类，稀有度保留一级分组；状态切换收进档案列表标题栏。
        const directory = new Node('AchievementDirectory'); directory.setParent(page);
        directory.setPosition(new Vec3(-492, -37, 0));
        const dg = directory.addComponent(Graphics);
        const drawDirectory = () => {
            dg.clear(); dg.fillColor = new Color(11, 25, 40, 246);
            clippedPath(dg, 216, 558, 12); dg.fill();
            dg.strokeColor = new Color(83, 123, 147, 170); dg.lineWidth = 1;
            clippedPath(dg, 216, 558, 12); dg.stroke();
            dg.fillColor = new Color(45, 74, 94, 90); dg.fillRect(-96, 236, 192, 1);
            dg.fillRect(-96, -208, 192, 1);
        };
        drawDirectory(); attachEnableRedraw(directory, drawDirectory);
        this._mkLabel(page, -492, 216, 176, 24, '档案分类', 15, MUTED, HorizontalTextAlignment.LEFT);
        this._achieveTabs = new Node('AchTabs'); this._achieveTabs.setParent(page);
        this._achieveFilters = new Node('AchievementFilters');
        this._achieveFilters.setParent(page);
        this._achievementSection = this._mkLabel(page, -193, 158, 310, 30, '', 17, WHITE, HorizontalTextAlignment.LEFT);
        this._mkDivider(page, 120, 137, 936, new Color(78, 119, 143));
        this._rebuildAchievementFilters();

        // 固定网格只创建当前页六张卡片，切换筛选后回到第一页。
        const { viewW: VIEW_W, viewH: VIEW_H, viewX, viewY } = ACHIEVE_LAYOUT;
        const content = new Node('AchieveContent'); content.setParent(page);
        content.setPosition(new Vec3(viewX, viewY, 0));
        content.addComponent(UITransform).setContentSize(VIEW_W, VIEW_H);
        this._achieveContent = content;
        this._achievePager = new Node('AchievementPager'); this._achievePager.setParent(page);

        this._rebuildAchievementTabs();
        this._rebuildAchievementCards();
    }

    /** 稀有度页签（一级分组：普通/稀有/史诗/传奇，带已解锁/总数角标）。 */
    private _rebuildAchievementTabs(): void {
        for (const child of [...this._achieveTabs.children]) { child.active = false; child.destroy(); }
        const rarities: AchievementDef['rarity'][] = ['普通', '稀有', '史诗', '传奇'];
        const all = SaveSystem.allAchievements();
        const profile = SaveSystem.load();
        if (rarities.indexOf(this._achieveRarity as any) < 0) this._achieveRarity = rarities[0];
        rarities.forEach((rarity, i) => {
            const list = all.filter(a => a.rarity === rarity);
            const done = list.filter(a => profile.achievements.indexOf(a.id) >= 0).length;
            const selected = !this._achieveLegacy && rarity === this._achieveRarity;
            const btn = this._mkAchievementControl(this._achieveTabs, rarity,
                -240 + i * 240, 216, 222, 58, this._achievementRarityColor(rarity), selected, 'tab', `${done} / ${list.length}`);
            btn.on(Node.EventType.TOUCH_END, () => {
                if (this._achieveRarity === rarity && !this._achieveLegacy) return;
                this._achieveRarity = rarity;
                this._achieveLegacy = false;
                this._callbacks.onButtonSfx();
                this._rebuildAchievementTabs();
                this._rebuildAchievementFilters();
                this._rebuildAchievementCards();
            }, this);
        });
        const legacy = this._mkAchievementControl(this._achieveTabs, '历史荣誉', -492, -278, 188, 46,
            GOLD, this._achieveLegacy, 'row', `${SaveSystem.legacyAchievements().length}`, 'combo');
        legacy.on(Node.EventType.TOUCH_END, () => {
            this._achieveLegacy = !this._achieveLegacy;
            this._achieveType = '全部'; this._achieveStatus = '全部';
            this._callbacks.onButtonSfx();
            this._rebuildAchievementFilters(); this._rebuildAchievementTabs(); this._rebuildAchievementCards();
        });
    }

    private _rebuildAchievementFilters(): void {
        for (const child of [...this._achieveFilters.children]) { child.active = false; child.destroy(); }
        const source = SaveSystem.allAchievements().filter(a => a.rarity === this._achieveRarity);
        const icons = ['chaos', 'pierce', 'crit', 'summon', 'shield', 'shield', 'speed', 'gold', 'heart', 'chaos', 'combo'];
        ['全部', ...ACHIEVEMENT_TYPES].forEach((type, i) => {
            const count = type === '全部' ? source.length : source.filter(a => a.category === type).length;
            const btn = this._mkAchievementControl(this._achieveFilters, type === '全部' ? '全部档案' : type,
                -492, 174 - i * 39, 188, 34, UI_PALETTE.cyan,
                !this._achieveLegacy && this._achieveType === type, 'row', `${count}`, icons[i]);
            btn.on(Node.EventType.TOUCH_END, () => {
                this._achieveType = type; this._achieveLegacy = false;
                this._callbacks.onButtonSfx();
                this._rebuildAchievementFilters(); this._rebuildAchievementTabs(); this._rebuildAchievementCards();
            });
        });
        ['全部', '未解锁', '已解锁'].forEach((status, i) => {
            const btn = this._mkAchievementControl(this._achieveFilters, status, 327 + i * 104, 158, 98, 32,
                UI_PALETTE.cyan, this._achieveStatus === status, 'segment');
            btn.on(Node.EventType.TOUCH_END, () => {
                this._achieveStatus = status; this._callbacks.onButtonSfx();
                this._rebuildAchievementFilters(); this._rebuildAchievementCards();
            });
        });
    }

    /** 定义顺序固定；分页只切换展示窗口，筛选变更从第一页开始。 */
    private _rebuildAchievementCards(resetPage = true): void {
        const content = this._achieveContent;
        for (const child of [...content.children]) { child.active = false; child.destroy(); }
        this._achievementCards = [];

        const rarities: AchievementDef['rarity'][] = ['普通', '稀有', '史诗', '传奇'];
        if (rarities.indexOf(this._achieveRarity as any) < 0) this._achieveRarity = rarities[0];
        const profile = SaveSystem.load();
        const source = this._achieveLegacy ? SaveSystem.legacyAchievements() : SaveSystem.allAchievements().filter(a => a.rarity === this._achieveRarity);
        const list = source.filter(a => (this._achieveType === '全部' || a.category === this._achieveType) &&
            (this._achieveStatus === '全部' || (profile.achievements.indexOf(a.id) >= 0) === (this._achieveStatus === '已解锁')));

        const { pageSize, rowH: ROW_H } = ACHIEVE_LAYOUT;
        this._achievePageCount = Math.max(1, Math.ceil(list.length / pageSize));
        this._achievePage = resetPage ? 0 : Math.max(0, Math.min(this._achievePageCount - 1, this._achievePage));
        const current = list.slice(this._achievePage * pageSize, (this._achievePage + 1) * pageSize);
        current.forEach((def, i) => {
            this._mkAchievementCard(def, -320 + (i % 3) * 320, ROW_H / 2 - Math.floor(i / 3) * ROW_H);
        });
        this._achievementSection.string = `${this._achieveLegacy ? '历史荣誉' : this._achieveType === '全部' ? this._achieveRarity + '档案' : this._achieveType + '档案'}   /   ${list.length} 项`;
        if (!list.length) {
            this._mkLabel(content, 0, 64, 400, 48, '—  暂无档案  —', 24, new Color(111, 148, 170));
            this._mkLabel(content, 0, 19, 700, 48,
                this._achieveLegacy && !source.length ? '旧版已解锁荣誉会保存在这里' : '试试其他分类、稀有度或解锁状态', 16, MUTED);
        }
        this._rebuildAchievementPager();
        this._refreshAchievements();
    }

    private _turnAchievementPage(delta: number): void {
        const next = Math.max(0, Math.min(this._achievePageCount - 1, this._achievePage + delta));
        if (next === this._achievePage) return;
        this._achievePage = next;
        this._callbacks.onButtonSfx();
        this._rebuildAchievementCards(false);
    }

    private _rebuildAchievementPager(): void {
        for (const child of [...this._achievePager.children]) { child.active = false; child.destroy(); }
        const prev = this._mkAchievementControl(this._achievePager, '‹  上一页', -34, -326, 124, 34,
            UI_PALETTE.cyan, false, 'page', '', '', this._achievePage === 0);
        const next = this._mkAchievementControl(this._achievePager, '下一页  ›', 274, -326, 124, 34,
            UI_PALETTE.cyan, false, 'page', '', '', this._achievePage >= this._achievePageCount - 1);
        prev.on(Node.EventType.TOUCH_END, () => this._turnAchievementPage(-1));
        next.on(Node.EventType.TOUCH_END, () => this._turnAchievementPage(1));
        this._mkLabel(this._achievePager, 120, -326, 158, 30,
            `第 ${this._achievePage + 1} / ${this._achievePageCount} 页`, 16, WHITE);
    }

    private _mkAchievementCard(def: AchievementDef, cx: number, cy: number): Node {
        const card = new Node(`Achievement_${def.id}`); card.setParent(this._achieveContent);
        card.setPosition(new Vec3(cx, cy, 0));
        card.addComponent(UITransform).setContentSize(ACHIEVE_LAYOUT.cardW, ACHIEVE_LAYOUT.cardH);
        const g = card.addComponent(Graphics);

        const icon = this._mkArt(card, `ui_icon_${def.artKey}`, 28, 28, -115, 64);
        const name = this._mkLabel(card, 24, 68, 220, 28, def.name, 18, WHITE, HorizontalTextAlignment.LEFT);
        const rarity = this._mkLabel(card, 24, 45, 220, 18,
            `${def.rarity}  ·  ${def.category}  /  ${def.number ? ('000' + def.number).slice(-3) : '旧版荣誉'}`, 11, MUTED, HorizontalTextAlignment.LEFT);
        const desc = this._mkLabel(card, 0, -16, 268, 92, def.desc, 14, new Color(182, 201, 215, 255), HorizontalTextAlignment.LEFT, true);
        desc.lineHeight = 20;
        const reward = this._mkLabel(card, -42, -76, 184, 18, `奖励  ${def.reward}`, 12, GOLD, HorizontalTextAlignment.LEFT);
        const progress = this._mkLabel(card, 99, -76, 70, 18, '', 12, MUTED, HorizontalTextAlignment.RIGHT);
        const bar = new Node('ProgressBar'); bar.setParent(card); bar.setPosition(new Vec3(0, -92, 0));
        const pg = bar.addComponent(Graphics);
        this._achievementCards.push({ def, graphics: g, name, desc, rarity, reward, progress, progressGraphics: pg, icon });
        return card;
    }

    private _refreshAchievements(): void {
        const profile = SaveSystem.load();
        const all = SaveSystem.allAchievements();
        const unlocked = all.filter(a => profile.achievements.indexOf(a.id) >= 0).length;
        for (const view of this._achievementCards) {
            const done = profile.achievements.indexOf(view.def.id) >= 0;
            const current = Math.min(view.def.progress(profile), view.def.goal);
            // 2026-10-30 修复（改动点）：已达成一律画满条。此前进度条按实时进度
            // 比例绘制，后台改目标值/成就表版本重排会造成"已达成但条不满"——
            // 解锁记录（profile.achievements）才是唯一事实。
            const ratio = done ? 1 : view.def.goal > 0 ? current / view.def.goal : 0;
            const c = this._achievementRarityColor(view.def.rarity);

            // 稀有度始终可辨；解锁态另用白色标题、金色奖励和绿色进度表示。
            const { cardW, cardH } = ACHIEVE_LAYOUT;
            this._drawAchievementFrame(view.graphics, cardW, cardH, view.def.rarity, done);
            view.graphics.fillColor = new Color(c.r, c.g, c.b, done ? 32 : 18);
            view.graphics.roundRect(-134, 45, 38, 38, 7); view.graphics.fill();
            view.graphics.strokeColor = new Color(c.r, c.g, c.b, done ? 170 : 55); view.graphics.lineWidth = 1;
            view.graphics.roundRect(-134, 45, 38, 38, 7); view.graphics.stroke();
            view.graphics.strokeColor = new Color(c.r, c.g, c.b, 65); view.graphics.lineWidth = 1;
            view.graphics.moveTo(-134, 32); view.graphics.lineTo(134, 32); view.graphics.stroke();

            view.name.color = done ? WHITE : new Color(Math.round(135 + c.r * 0.4), Math.round(135 + c.g * 0.4), Math.round(135 + c.b * 0.4));
            view.rarity.color = c;
            view.reward.color = done ? GOLD : new Color(133, 149, 161, 255);
            view.icon.color = done ? Color.WHITE : new Color(135, 151, 163, 210);
            // 隐藏成就（滑稽猴彩蛋等）：未解锁时以"？？？"遮掩名称/描述与进度
            const secretPending = !!view.def.hidden && !done;
            view.name.string = secretPending ? '？？？' : view.def.name;
            if (view.desc) {
                view.desc.string = secretPending ? '隐藏成就：达成后揭晓' : view.def.desc;
                view.desc.color = done ? new Color(204, 217, 226, 255) : new Color(150, 167, 181, 255);
            }
            view.progress.string = done ? '已达成' : secretPending ? '?' : `${Math.floor(current)}/${view.def.goal}`;
            view.progress.color = done ? new Color(104, 230, 150, 255) : new Color(116, 132, 146, 255);
            const pg = view.progressGraphics; pg.clear();
            pg.fillColor = new Color(7, 18, 29, 255); pg.fillRect(-134, -2, 268, 4);
            pg.fillColor = done ? new Color(89, 222, 143, 255) : c;
            pg.fillRect(-134, -2, 268 * (secretPending ? 0 : Math.max(0, Math.min(1, ratio))), 4);
        }
        const total = SaveSystem.allAchievements().length;
        this._achievementSummary.string = `已解锁 ${unlocked} / ${total}`;
        this._achievementCompletion.string = `档案完成度 ${total ? Math.floor(unlocked / total * 100) : 0}%   ·   历史荣誉 ${SaveSystem.legacyAchievements().length}`;
        const overview = this._achievementOverview; overview.clear();
        overview.fillColor = new Color(56, 76, 91, 210); overview.fillRect(-180, -1, 360, 3);
        overview.fillColor = GOLD; overview.fillRect(-180, -1, total ? 360 * unlocked / total : 0, 3);
    }

    /** 统计签与内容卡共用稀有度装甲：银灰单线、蓝色护角、紫色双沿、金色冠饰。 */
    private _drawAchievementFrame(g: Graphics, w: number, h: number, rarity: AchievementDef['rarity'], emphasized: boolean): void {
        const tier = Math.max(0, ['普通', '稀有', '史诗', '传奇'].indexOf(rarity));
        const c = this._achievementRarityColor(rarity);
        const fills = [new Color(24, 40, 53), new Color(17, 35, 57), new Color(32, 26, 49), new Color(43, 35, 25)];
        g.clear(); g.fillColor = new Color(3, 10, 18);
        clippedPath(g, w, h, 10); g.fill();
        g.fillColor = fills[tier]; clippedPath(g, w - 4, h - 4, 9); g.fill();
        if (emphasized) {
            g.fillColor = new Color(c.r, c.g, c.b, 16);
            clippedPath(g, w - 4, h - 4, 9); g.fill();
        }
        g.strokeColor = new Color(c.r, c.g, c.b, emphasized ? 255 : tier ? 205 : 125);
        g.lineWidth = tier ? 1.5 : 1;
        clippedPath(g, w - 2, h - 2, 10); g.stroke();
        if (tier >= 2) {
            g.strokeColor = new Color(c.r, c.g, c.b, emphasized ? 120 : 75); g.lineWidth = 1;
            clippedPath(g, w - 10, h - 10, 7); g.stroke();
        }
        if (tier >= 1) {
            // 蓝色起增加四角护片；史诗/传奇以更长护片与内沿加重装甲层次。
            g.strokeColor = new Color(c.r, c.g, c.b, 235); g.lineWidth = tier === 3 ? 3 : 2;
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
                g.moveTo(sx * (w / 2 - 4), sy * (h / 2 - 21));
                g.lineTo(sx * (w / 2 - 4), sy * (h / 2 - 12));
                g.lineTo(sx * (w / 2 - 12), sy * (h / 2 - 4));
                g.lineTo(sx * (w / 2 - (tier === 3 ? 41 : 29)), sy * (h / 2 - 4)); g.stroke();
            }
            // 一至三枚顶缘菱形标记，使低饱和显示时也能区分等级。
            g.fillColor = c;
            for (let i = 0; i < tier; i++) {
                const x = (i - (tier - 1) / 2) * 12, y = h / 2 - 5, r = tier === 3 ? 3 : 2;
                g.moveTo(x, y + r); g.lineTo(x + r, y); g.lineTo(x, y - r); g.lineTo(x - r, y); g.close(); g.fill();
            }
        }
    }

    /** 成就页专用导航：目录行、稀有度签、状态切换和翻页分别表达交互层级。 */
    private _mkAchievementControl(parent: Node, text: string, x: number, y: number, w: number, h: number,
        accent: Color, selected: boolean, variant: 'row' | 'tab' | 'segment' | 'page', detail = '', artKey = '', disabled = false): Node {
        const node = new Node(`AchievementFilter_${text}`); node.setParent(parent);
        node.setPosition(new Vec3(x, y, 0)); node.addComponent(UITransform).setContentSize(w, h);
        const g = node.addComponent(Graphics);
        let hover = false, focused = false;
        const draw = () => {
            g.clear();
            if (variant === 'tab') {
                this._drawAchievementFrame(g, w, h, text as AchievementDef['rarity'], selected);
            } else if (variant === 'page') {
                g.fillColor = new Color(19, 36, 51); clippedPath(g, w, h, 6); g.fill();
                g.strokeColor = disabled ? new Color(53, 75, 91) : new Color(100, 151, 175);
                g.lineWidth = 1; clippedPath(g, w, h, 6); g.stroke();
            } else if (selected || hover || focused) {
                g.fillColor = new Color(accent.r, accent.g, accent.b, selected ? 24 : 13);
                clippedPath(g, w, h, 5); g.fill();
            }
            if (selected) {
                g.fillColor = accent;
                if (variant === 'row') g.fillRect(-w / 2, -h / 2 + 6, 3, h - 12);
                else g.fillRect(-w / 2 + 10, -h / 2, w - 20, 2);
            }
            if (!disabled && (hover || focused)) {
                g.strokeColor = focused ? GOLD : new Color(accent.r, accent.g, accent.b, 140);
                g.lineWidth = 1; clippedPath(g, w - 2, h - 2, 5); g.stroke();
            }
        };
        draw(); attachEnableRedraw(node, draw);
        const textColor = disabled ? new Color(76, 101, 118) : variant === 'tab' ? accent : selected ? (variant === 'row' ? accent : WHITE) : new Color(164, 185, 202);
        if (variant === 'row') {
            if (artKey) {
                const icon = this._mkArt(node, `ui_icon_${artKey}`, 22, 22, -w / 2 + 23, 0);
                icon.color = selected ? Color.WHITE : new Color(142, 165, 182, 230);
            }
            this._mkLabel(node, 4, 0, w - 80, h, text, 17, textColor, HorizontalTextAlignment.LEFT);
            this._mkLabel(node, w / 2 - 22, 0, 30, h, detail, 13, selected ? accent : MUTED, HorizontalTextAlignment.RIGHT);
        } else if (variant === 'tab') {
            this._mkLabel(node, -47, 2, 92, 32, text, 22, textColor, HorizontalTextAlignment.LEFT);
            this._mkLabel(node, 63, 1, 68, 30, detail, 16, accent, HorizontalTextAlignment.RIGHT);
        } else this._mkLabel(node, 0, 1, w - 14, h, text, 15, textColor);
        registerKeyboardFocus(node, w, h, { isDisabled: () => disabled, setFocused: value => { focused = value; draw(); } });
        node.on(Node.EventType.MOUSE_ENTER, () => { hover = true; draw(); });
        node.on(Node.EventType.MOUSE_LEAVE, () => { hover = false; draw(); });
        return node;
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
