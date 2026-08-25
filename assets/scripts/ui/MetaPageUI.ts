// ============================================================
//  MetaPageUI.ts — 首页元进度页面（任务树 / 图鉴 / 成就墙）
// ============================================================
// 三个页面均由代码构建，不依赖 prefab。页面只消费静态数据表与存档视图，
// 后续替换任务、图鉴和成就配置时不需要重做布局。

import {
    Color, Graphics, HorizontalTextAlignment, Label, Node, Sprite,
    UITransform, Vec3, VerticalTextAlignment,
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { loadArtSprite, applyArtSprite } from '../core/SpriteUtils';
import { applyHexButtonSkin } from '../core/UIStyle';
import {
    CodexCategory, CodexEntry, CODEX_ENTRIES, codexByCategory,
    QuestBranch, QuestDef, questsByBranch,
} from '../data/MetaProgressionDB';
import { ACHIEVEMENTS, AchievementDef, SaveSystem } from '../systems/SaveSystem';

export type MetaPageName = 'tasks' | 'codex' | 'achievements';

export interface MetaPageCallbacks {
    onBack: () => void;
    onButtonSfx: () => void;
}

interface TaskNodeView {
    def: QuestDef;
    node: Node;
    graphics: Graphics;
    title: Label;
    status: Label;
}

interface AchievementCardView {
    def: AchievementDef;
    graphics: Graphics;
    name: Label;
    rarity: Label;
    progress: Label;
    progressGraphics: Graphics;
}

const WHITE = new Color(232, 244, 250, 255);
const MUTED = new Color(145, 166, 184, 255);
const CYAN = new Color(40, 224, 218, 255);
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
    g.fillColor = new Color(5, 12, 22, alpha);
    clippedPath(g, w, h, 14); g.fill();
    g.strokeColor = new Color(accent.r, accent.g, accent.b, 150);
    g.lineWidth = 1.5;
    clippedPath(g, w, h, 14); g.stroke();
    g.strokeColor = new Color(220, 248, 255, 42);
    g.lineWidth = 1;
    g.moveTo(-w / 2 + 26, h / 2 - 6); g.lineTo(w / 2 - 26, h / 2 - 6); g.stroke();
}

export class MetaPageUI {
    private readonly _panels = new Map<MetaPageName, Node>();
    private _taskBranch: QuestBranch = 'main';
    private _taskRoots = new Map<QuestBranch, Node>();
    private _taskViews: TaskNodeView[] = [];
    private _taskSelected = '';
    private _taskBranchLabel!: Label;
    private _taskDetailChapter!: Label;
    private _taskDetailName!: Label;
    private _taskDetailDesc!: Label;
    private _taskDetailObjective!: Label;
    private _taskDetailProgress!: Label;
    private _taskDetailReward!: Label;

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

    constructor(private readonly _root: Node, private readonly _callbacks: MetaPageCallbacks) {
        this._buildTaskPage();
        this._buildCodexPage();
        this._buildAchievementPage();
        this._panels.forEach(p => p.active = false);
    }

    entries(): [MetaPageName, Node][] {
        return Array.from(this._panels.entries());
    }

    refresh(name: MetaPageName): void {
        if (name === 'tasks') this._showTaskBranch(this._taskBranch);
        else if (name === 'codex') this._showCodexCategory(this._codexCategory);
        else this._refreshAchievements();
    }

    private _mkPage(name: MetaPageName, title: string, eyebrow: string, bgKey: string, accent: Color): Node {
        const page = new Node(name); page.setParent(this._root);
        page.addComponent(UITransform).setContentSize(1280, 720);
        this._panels.set(name, page);

        const bg = page.addComponent(Graphics);
        bg.fillColor = new Color(3, 7, 14, 255); bg.fillRect(-640, -360, 1280, 720);

        const artN = new Node('AmbientArt'); artN.setParent(page);
        artN.addComponent(UITransform).setContentSize(1280, 720);
        const art = artN.addComponent(Sprite); art.sizeMode = Sprite.SizeMode.CUSTOM;
        art.color = new Color(95, 125, 150, 66);
        applyArtSprite(art, bgKey);

        const veilN = new Node('Veil'); veilN.setParent(page);
        const veil = veilN.addComponent(Graphics);
        veil.fillColor = new Color(2, 7, 14, 198); veil.fillRect(-640, -360, 1280, 720);
        veil.fillColor = new Color(accent.r, accent.g, accent.b, 12); veil.fillRect(-640, 250, 1280, 110);
        veil.strokeColor = new Color(accent.r, accent.g, accent.b, 90); veil.lineWidth = 1;
        veil.moveTo(-600, 250); veil.lineTo(600, 250); veil.stroke();

        this._mkLabel(page, -467, 326, 170, 20, eyebrow, 12,
            new Color(accent.r, accent.g, accent.b, 220), HorizontalTextAlignment.LEFT);
        const titleLbl = this._mkLabel(page, -272, 291, 560, 48, title, 30, WHITE, HorizontalTextAlignment.LEFT);
        titleLbl.overflow = Label.Overflow.SHRINK;

        const back = this._mkButton(page, '返回首页', 526, 306, 150, 42, new Color(78, 111, 135, 255));
        back.on(Node.EventType.TOUCH_END, this._callbacks.onBack);

        // 顶栏两端的切角光标，强化三个页面共用的工业终端语言。
        const marks = new Node('HeaderMarks'); marks.setParent(page);
        const mg = marks.addComponent(Graphics);
        mg.strokeColor = new Color(accent.r, accent.g, accent.b, 185); mg.lineWidth = 3;
        mg.moveTo(-606, 336); mg.lineTo(-606, 286); mg.lineTo(-590, 270); mg.stroke();
        mg.moveTo(606, 270); mg.lineTo(606, 286); mg.stroke();
        return page;
    }

    private _buildTaskPage(): void {
        const page = this._mkPage('tasks', '行动任务树', 'MISSION NETWORK / 占位数据', 'bg_chapter2', CYAN);
        const mainTab = this._mkButton(page, '主线任务', -507, 221, 154, 42, CYAN);
        const sideTab = this._mkButton(page, '支线任务', -337, 221, 154, 42, new Color(174, 101, 255, 255));
        mainTab.on(Node.EventType.TOUCH_END, () => this._showTaskBranch('main'));
        sideTab.on(Node.EventType.TOUCH_END, () => this._showTaskBranch('side'));
        this._taskBranchLabel = this._mkLabel(page, 48, 222, 370, 28, '', 13, MUTED, HorizontalTextAlignment.RIGHT);

        const treePanel = new Node('TaskTreePanel'); treePanel.setParent(page);
        treePanel.setPosition(new Vec3(-178, -35, 0));
        const treeG = treePanel.addComponent(Graphics); drawPanel(treeG, 856, 478, CYAN);
        this._mkLabel(treePanel, -217, 208, 350, 26, '任务链路 / 点击节点查看详情', 13, MUTED, HorizontalTextAlignment.LEFT);

        for (const branch of ['main', 'side'] as QuestBranch[]) {
            const root = new Node(`${branch}_tree`); root.setParent(treePanel);
            this._taskRoots.set(branch, root);
            const defs = questsByBranch(branch);
            const pos = [
                new Vec3(-315, 72, 0), new Vec3(-110, -60, 0),
                new Vec3(95, 72, 0), new Vec3(300, -60, 0),
            ];

            const links = new Node('Links'); links.setParent(root);
            const lg = links.addComponent(Graphics);
            lg.strokeColor = branch === 'main' ? new Color(40, 224, 218, 115) : new Color(184, 104, 255, 115);
            lg.lineWidth = 3;
            for (let i = 0; i < Math.min(defs.length, pos.length) - 1; i++) {
                const a = pos[i], b = pos[i + 1];
                lg.moveTo(a.x + 83, a.y); lg.lineTo((a.x + b.x) / 2, a.y);
                lg.lineTo((a.x + b.x) / 2, b.y); lg.lineTo(b.x - 83, b.y); lg.stroke();
                lg.fillColor = new Color(lg.strokeColor.r, lg.strokeColor.g, lg.strokeColor.b, 220);
                lg.circle((a.x + b.x) / 2, (a.y + b.y) / 2, 4); lg.fill();
            }

            defs.slice(0, 4).forEach((def, i) => {
                const n = new Node(`Quest_${def.id}`); n.setParent(root); n.setPosition(pos[i]);
                n.addComponent(UITransform).setContentSize(170, 104);
                const g = n.addComponent(Graphics);
                const title = this._mkLabel(n, 0, 15, 144, 30, def.name, 16, WHITE);
                const status = this._mkLabel(n, 0, -24, 144, 20, '', 12, MUTED);
                const view = { def, node: n, graphics: g, title, status };
                this._taskViews.push(view);
                n.on(Node.EventType.TOUCH_END, () => this._selectQuest(def));
            });
        }

        const detail = new Node('TaskDetail'); detail.setParent(page);
        detail.setPosition(new Vec3(431, -35, 0));
        const detailG = detail.addComponent(Graphics); drawPanel(detailG, 334, 478, GOLD);
        this._mkLabel(detail, 0, 208, 268, 22, '任务简报', 12, GOLD, HorizontalTextAlignment.LEFT);
        this._taskDetailChapter = this._mkLabel(detail, 0, 169, 266, 22, '', 12, MUTED, HorizontalTextAlignment.LEFT);
        this._taskDetailName = this._mkLabel(detail, 0, 131, 266, 34, '', 21, WHITE, HorizontalTextAlignment.LEFT);
        this._taskDetailDesc = this._mkLabel(detail, 0, 54, 268, 90, '', 14, new Color(197, 214, 226, 255), HorizontalTextAlignment.LEFT, true);
        this._mkDivider(detail, 0, -5, 268, CYAN);
        this._taskDetailObjective = this._mkLabel(detail, 0, -36, 268, 45, '', 13, WHITE, HorizontalTextAlignment.LEFT, true);
        this._taskDetailProgress = this._mkLabel(detail, 0, -88, 268, 24, '', 13, CYAN, HorizontalTextAlignment.LEFT);
        this._mkDivider(detail, 0, -119, 268, GOLD);
        this._mkLabel(detail, 0, -148, 268, 20, '奖励预览', 12, MUTED, HorizontalTextAlignment.LEFT);
        this._taskDetailReward = this._mkLabel(detail, 0, -181, 268, 30, '', 16, GOLD, HorizontalTextAlignment.LEFT);

        this._showTaskBranch('main');
    }

    private _showTaskBranch(branch: QuestBranch): void {
        this._taskBranch = branch;
        this._taskRoots.forEach((root, key) => root.active = key === branch);
        const defs = questsByBranch(branch);
        const done = defs.filter(d => d.state === 'completed').length;
        this._taskBranchLabel.string = `${branch === 'main' ? '主线链路' : '支线委托'}  ·  已完成 ${done}/${defs.length}`;
        const selected = defs.find(d => d.id === this._taskSelected) ??
            defs.find(d => d.state === 'active') ?? defs[0];
        if (selected) this._selectQuest(selected);
    }

    private _selectQuest(def: QuestDef): void {
        this._taskSelected = def.id;
        for (const view of this._taskViews) this._drawTaskNode(view, view.def.id === def.id);
        this._taskDetailChapter.string = `${def.branch === 'main' ? '主线' : '支线'} · ${def.chapter}`;
        this._taskDetailName.string = def.name;
        this._taskDetailDesc.string = def.desc;
        this._taskDetailObjective.string = `目标  ${def.objective}`;
        const pct = def.goal > 0 ? Math.floor(Math.min(1, def.progress / def.goal) * 100) : 0;
        this._taskDetailProgress.string = `${def.progress} / ${def.goal}   ${pct}%`;
        this._taskDetailReward.string = def.reward;
    }

    private _drawTaskNode(view: TaskNodeView, selected: boolean): void {
        const { def, graphics: g } = view;
        const colors: Record<string, Color> = {
            completed: new Color(78, 215, 137, 255), active: CYAN,
            available: new Color(255, 181, 74, 255), locked: new Color(89, 105, 120, 255),
        };
        const labels: Record<string, string> = {
            completed: '已完成', active: '进行中', available: '可接取', locked: '未解锁',
        };
        const c = colors[def.state];
        g.clear();
        g.fillColor = new Color(7, 15, 25, def.state === 'locked' ? 228 : 250);
        clippedPath(g, 170, 104, 12); g.fill();
        g.fillColor = new Color(c.r, c.g, c.b, selected ? 45 : 22);
        clippedPath(g, 164, 98, 10); g.fill();
        g.strokeColor = new Color(c.r, c.g, c.b, selected ? 255 : 150);
        g.lineWidth = selected ? 3 : 1.5; clippedPath(g, 170, 104, 12); g.stroke();
        g.strokeColor = new Color(c.r, c.g, c.b, 230); g.lineWidth = 4;
        g.moveTo(-67, 48); g.lineTo(67, 48); g.stroke();
        view.title.color = def.state === 'locked' ? new Color(142, 151, 162, 255) : WHITE;
        view.status.string = labels[def.state]; view.status.color = c;
    }

    private _buildCodexPage(): void {
        const page = this._mkPage('codex', '海克斯图鉴', 'ARCHIVE TERMINAL / 样本档案', 'bg_chapter3', new Color(69, 204, 255, 255));
        const monsterTab = this._mkButton(page, '怪物档案', -507, 221, 154, 42, new Color(255, 95, 76, 255));
        const heroTab = this._mkButton(page, '英雄档案', -337, 221, 154, 42, new Color(69, 204, 255, 255));
        monsterTab.on(Node.EventType.TOUCH_END, () => this._showCodexCategory('monster'));
        heroTab.on(Node.EventType.TOUCH_END, () => this._showCodexCategory('hero'));
        this._codexStats = this._mkLabel(page, 38, 222, 380, 26, '', 13, MUTED, HorizontalTextAlignment.RIGHT);

        const gridPanel = new Node('CodexGridPanel'); gridPanel.setParent(page);
        gridPanel.setPosition(new Vec3(-178, -35, 0));
        const gridG = gridPanel.addComponent(Graphics); drawPanel(gridG, 856, 478, new Color(69, 204, 255, 255));
        this._mkLabel(gridPanel, -212, 208, 360, 24, '已收录样本 / 选择卡片读取完整档案', 13, MUTED, HorizontalTextAlignment.LEFT);

        for (const category of ['monster', 'hero'] as CodexCategory[]) {
            const root = new Node(`${category}_grid`); root.setParent(gridPanel);
            this._codexRoots.set(category, root);
            const defs = codexByCategory(category);
            defs.slice(0, 8).forEach((def, i) => {
                const col = i % 4, row = Math.floor(i / 4);
                const card = new Node(`Codex_${def.id}`); card.setParent(root);
                card.setPosition(new Vec3(-312 + col * 208, 80 - row * 196, 0));
                card.addComponent(UITransform).setContentSize(184, 172);
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

                this._mkLabel(card, 0, -47, 164, 26, def.unlocked ? def.name : '未知样本', 14,
                    def.unlocked ? WHITE : new Color(126, 139, 151, 255));
                this._mkLabel(card, 0, -70, 164, 18, def.unlocked ? def.rarity : '未解锁', 11,
                    def.unlocked ? hexColor(def.color) : new Color(91, 105, 118, 255));
                card.on(Node.EventType.TOUCH_END, () => this._selectCodex(def));
            });
        }

        const detail = new Node('CodexDetail'); detail.setParent(page);
        detail.setPosition(new Vec3(431, -35, 0));
        const detailG = detail.addComponent(Graphics); drawPanel(detailG, 334, 478, new Color(69, 204, 255, 255));
        this._mkLabel(detail, 0, 208, 268, 22, '样本分析', 12, new Color(69, 204, 255, 255), HorizontalTextAlignment.LEFT);

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
        this._codexDetailSub = this._mkLabel(detail, 0, -29, 268, 22, '', 12, new Color(69, 204, 255, 255), HorizontalTextAlignment.LEFT);
        this._mkDivider(detail, 0, -53, 268, new Color(69, 204, 255, 255));
        this._codexDetailDesc = this._mkLabel(detail, 0, -111, 268, 94, '', 13, new Color(194, 211, 224, 255), HorizontalTextAlignment.LEFT, true);
        this._codexDetailTraits = this._mkLabel(detail, 0, -174, 268, 28, '', 12, GOLD, HorizontalTextAlignment.LEFT);
        this._codexLockHint = this._mkLabel(detail, 0, -205, 268, 22, '', 11, MUTED, HorizontalTextAlignment.LEFT);

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

        const legend = new Node('RarityLegend'); legend.setParent(page);
        legend.setPosition(new Vec3(-391, 226, 0));
        const lg = legend.addComponent(Graphics); drawPanel(lg, 420, 42, new Color(133, 100, 201, 255), 224);
        const rarityColors = [
            ['普通', '#8fa7b8'], ['稀有', '#44aaff'], ['史诗', '#b060ff'], ['传奇', '#ffd05a'],
        ];
        rarityColors.forEach((r, i) => {
            const c = hexColor(r[1]);
            const dot = new Node(`Dot_${r[0]}`); dot.setParent(legend); dot.setPosition(new Vec3(-164 + i * 103, 0, 0));
            const dg = dot.addComponent(Graphics); dg.fillColor = c; dg.circle(-22, 0, 4); dg.fill();
            this._mkLabel(dot, 12, 0, 62, 20, r[0], 11, c);
        });
        this._mkLabel(page, 387, 226, 360, 24, '稀有度代表达成条件的特殊性  ·  奖励为预览', 12, MUTED, HorizontalTextAlignment.RIGHT);

        ACHIEVEMENTS.forEach((def, i) => {
            const col = i % 4, row = Math.floor(i / 4);
            const card = new Node(`Achievement_${def.id}`); card.setParent(page);
            card.setPosition(new Vec3(-426 + col * 284, 127 - row * 158, 0));
            card.addComponent(UITransform).setContentSize(270, 146);
            const g = card.addComponent(Graphics);

            this._mkArt(card, `ui_icon_${def.artKey}`, 50, 50, -92, 27);
            const name = this._mkLabel(card, 13, 43, 130, 25, def.name, 15, WHITE, HorizontalTextAlignment.LEFT);
            const rarity = this._mkLabel(card, 103, 44, 55, 20, def.rarity, 11, GOLD, HorizontalTextAlignment.RIGHT);
            this._mkLabel(card, 25, 14, 154, 34, def.desc, 11, new Color(182, 201, 215, 255), HorizontalTextAlignment.LEFT, true);
            this._mkLabel(card, 0, -27, 220, 20, `奖励  ${def.reward}`, 11, GOLD, HorizontalTextAlignment.LEFT);
            const progress = this._mkLabel(card, 82, -52, 64, 18, '', 10, MUTED, HorizontalTextAlignment.RIGHT);
            const bar = new Node('ProgressBar'); bar.setParent(card); bar.setPosition(new Vec3(-17, -53, 0));
            const pg = bar.addComponent(Graphics);
            this._achievementCards.push({ def, graphics: g, name, rarity, progress, progressGraphics: pg });
        });

        this._refreshAchievements();
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
            clippedPath(view.graphics, 270, 146, 12); view.graphics.fill();
            view.graphics.fillColor = new Color(c.r, c.g, c.b, done ? 32 : 12);
            clippedPath(view.graphics, 264, 140, 10); view.graphics.fill();
            view.graphics.strokeColor = new Color(c.r, c.g, c.b, done ? 235 : 115);
            view.graphics.lineWidth = done ? 2.5 : 1.2;
            clippedPath(view.graphics, 270, 146, 12); view.graphics.stroke();
            view.graphics.strokeColor = new Color(c.r, c.g, c.b, 220); view.graphics.lineWidth = 3;
            view.graphics.moveTo(-109, 68); view.graphics.lineTo(109, 68); view.graphics.stroke();

            view.name.color = done ? WHITE : new Color(165, 179, 191, 255);
            view.rarity.color = c;
            view.progress.string = done ? '已达成' : `${Math.floor(current)}/${view.def.goal}`;
            view.progress.color = done ? new Color(104, 230, 150, 255) : MUTED;
            const pg = view.progressGraphics; pg.clear();
            pg.fillColor = new Color(24, 33, 43, 255); pg.fillRect(-91, -3, 146, 6);
            pg.fillColor = done ? new Color(89, 222, 143, 255) : c;
            pg.fillRect(-91, -3, 146 * Math.max(0, Math.min(1, ratio)), 6);
        }
        const legendary = ACHIEVEMENTS.filter(a => a.rarity === '传奇').length;
        this._achievementSummary.string = `已解锁 ${unlocked} / ${ACHIEVEMENTS.length}   ·   传奇成就 ${legendary}`;
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
