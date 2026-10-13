// ============================================================
//  StatsPanel.ts — 战斗中角色档案 / 海克斯构筑
//  把身份、作战参数、技能和本局构筑按阅读目的分成两个页签。
// ============================================================
import {
    _decorator, Component, Node, Label, Graphics, Sprite, BlockInputEvents,
    Color, Vec3, UITransform, HorizontalTextAlignment, VerticalTextAlignment,
} from 'cc';
import { AugDef } from '../data/AugmentDB';
import { RARITY_COLOR } from '../core/Constants';
import { applyArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';
import { visibleDesignWidth } from '../core/ScreenFit';
import {
    applyHexButtonSkin, attachEnableRedraw, drawHexPanel, HexButtonSkin,
    registerKeyboardFocus, registerKeyboardModalScope, UI_PALETTE,
} from '../core/UIStyle';

const { ccclass } = _decorator;
const PANEL_W = 1160, PANEL_H = 650;
const TEXT = UI_PALETTE.text, MUTED = UI_PALETTE.muted;
type StatsTab = 'overview' | 'augments';

/** GameManager 在暂停战斗后传入的一帧快照。 */
export interface StatsPanelData {
    charId: string;
    charName: string;
    charColor: string;
    passiveDesc: string;
    stats: { label: string; value: string }[];
    progress: string;
    augments: AugDef[];
    skillStates: { name: string; desc: string; cd?: number; maxCd?: number }[];
    skillIcons: { q: string; e: string; r: string };
}

interface AugRow {
    root: Node;
    icon: Sprite;
    name: Label;
    desc: Label;
    accent: Color;
    redraw: () => void;
}

@ccclass('StatsPanel')
export class StatsPanel extends Component {
    onClose?: () => void;

    private _built = false;
    private _dimNode!: Node;
    private _dimG!: Graphics;
    private _panelG!: Graphics;
    private _accent: Color = UI_PALETTE.cyan;
    private _title!: Label;
    private _progress!: Label;
    private _portrait!: Sprite;
    private _portraitKey = '';
    private _heroG!: Graphics;
    private _drawHero!: () => void;
    private _passive!: Label;
    private _passiveDesc = '';
    private _overview!: Node;
    private _augmentsPage!: Node;
    private _tabs: { name: StatsTab; skin: HexButtonSkin; label: Label; bar: Graphics }[] = [];
    private _statCells: { name: Label; value: Label }[] = [];
    private _skillRows: { icon: Sprite; name: Label; desc: Label; status: Label }[] = [];
    private _skillStates: StatsPanelData['skillStates'] = [];
    private _augmentTabLabel!: Label;
    private _augRows: AugRow[] = [];
    private _emptyAug!: Node;
    private _augments: AugDef[] = [];
    private _augPage = 0;
    private _augPager!: Node;
    private _augPageLabel!: Label;
    private _prevSkin!: HexButtonSkin;
    private _nextSkin!: HexButtonSkin;
    private _augDetail!: Node;
    private _augDetailTitle!: Label;
    private _augDetailDesc!: Label;
    private readonly MAX_AUG_ROWS = 10;

    onLoad() { this._build(); }
    onEnable() { if (this._built) this.fitToVisible(); }

    fitToVisible(): void {
        if (!this._built) return;
        this._dimNode.getComponent(UITransform)!.setContentSize(visibleDesignWidth(), 720);
        this._drawChrome();
    }

    private _label(parent: Node, name: string, value: string, x: number, y: number,
                   w: number, h: number, size: number, color: Color,
                   align = HorizontalTextAlignment.LEFT): Label {
        const node = new Node(name); node.setParent(parent);
        node.setPosition(new Vec3(x, y, 0));
        node.addComponent(UITransform).setContentSize(w, h);
        const label = node.addComponent(Label);
        label.string = value;
        label.fontSize = size;
        label.lineHeight = size + 6;
        label.color = color;
        label.horizontalAlign = align;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        styleLabel(label, { outline: size >= 20 });
        return label;
    }

    private _build(): void {
        if (this._built) return;
        this._built = true;

        this._dimNode = new Node('Dim'); this._dimNode.setParent(this.node);
        this._dimNode.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        this._dimG = this._dimNode.addComponent(Graphics);

        const panel = new Node('Panel'); panel.setParent(this.node);
        panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        this._panelG = panel.addComponent(Graphics);
        this._drawChrome();

        this._title = this._label(panel, 'HeroTitle', '', -327, 288, 430, 38, 29, TEXT);
        this._label(panel, 'Eyebrow', '角色详情  /  FIELD DOSSIER', -358, 253,
            370, 20, 13, UI_PALETTE.cyan);
        this._buildTabs(panel);

        const close = new Node('ReturnToCombat'); close.setParent(panel);
        close.setPosition(new Vec3(489, 275, 0));
        close.addComponent(UITransform).setContentSize(134, 44);
        applyHexButtonSkin(close, 134, 44, UI_PALETTE.muted);
        this._label(close, 'Label', '返回战斗  ×', 0, 0, 128, 30, 16, TEXT,
            HorizontalTextAlignment.CENTER);
        close.on(Node.EventType.TOUCH_END, () => this.onClose?.());

        this._overview = new Node('Overview'); this._overview.setParent(panel);
        this._buildOverview();
        this._augmentsPage = new Node('Augments'); this._augmentsPage.setParent(panel);
        this._buildAugments();
        this._buildAugDetail(panel);

        this._progress = this._label(panel, 'Progress', '', 0, -290, 1030, 26,
            15, MUTED, HorizontalTextAlignment.CENTER);
        this._selectTab('overview');
    }

    private _drawChrome(): void {
        this._dimG.clear();
        this._dimG.fillColor = new Color(3, 8, 16, 223);
        const width = visibleDesignWidth();
        this._dimG.fillRect(-width / 2, -360, width, 720);

        const g = this._panelG;
        g.clear();
        drawHexPanel(g, -PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, UI_PALETTE.cyan, 255);
        g.fillColor = new Color(8, 19, 31, 255);
        g.roundRect(-567, 233, 1134, 81, 11); g.fill();
        g.fillColor = new Color(this._accent.r, this._accent.g, this._accent.b, 230);
        g.fillRect(-555, 229, 1110, 3);
        g.strokeColor = new Color(117, 156, 177, 84);
        g.lineWidth = 1;
        g.moveTo(-550, -266); g.lineTo(550, -266); g.stroke();
    }

    private _buildTabs(panel: Node): void {
        const defs: { name: StatsTab; title: string; x: number; w: number }[] = [
            { name: 'overview', title: '角色概览', x: 35, w: 174 },
            { name: 'augments', title: '海克斯构筑', x: 254, w: 212 },
        ];
        for (const def of defs) {
            const button = new Node(`Tab_${def.name}`); button.setParent(panel);
            button.setPosition(new Vec3(def.x, 275, 0));
            button.addComponent(UITransform).setContentSize(def.w, 44);
            const skin = applyHexButtonSkin(button, def.w, 44, MUTED);
            const label = this._label(button, 'Label', def.title, 0, 1, def.w - 12, 32,
                16, MUTED, HorizontalTextAlignment.CENTER);
            if (def.name === 'augments') this._augmentTabLabel = label;
            const barNode = new Node('ActiveBar'); barNode.setParent(button);
            barNode.setPosition(new Vec3(0, -19, 0));
            const bar = barNode.addComponent(Graphics);
            this._tabs.push({ name: def.name, skin, label, bar });
            button.on(Node.EventType.TOUCH_END, () => this._selectTab(def.name));
        }
    }

    private _selectTab(name: StatsTab): void {
        this._overview.active = name === 'overview';
        this._augmentsPage.active = name === 'augments';
        this._augDetail.active = false;
        for (const tab of this._tabs) {
            const active = tab.name === name;
            tab.skin.setAccent(active ? this._accent : MUTED);
            tab.label.color = active ? TEXT : MUTED;
            tab.bar.clear();
            if (active) {
                tab.bar.fillColor = new Color(this._accent.r, this._accent.g, this._accent.b, 255);
                tab.bar.fillRect(-55, -2, 110, 4);
            }
        }
    }

    private _buildOverview(): void {
        const root = this._overview;
        const hero = new Node('HeroIdentity'); hero.setParent(root);
        hero.setPosition(new Vec3(-405, -14, 0));
        hero.addComponent(UITransform).setContentSize(300, 452);
        this._heroG = hero.addComponent(Graphics);
        this._drawHero = () => {
            const g = this._heroG;
            g.clear();
            drawHexPanel(g, -150, -226, 300, 452, this._accent, 255);
            g.fillColor = new Color(8, 21, 34, 255);
            g.roundRect(-137, -77, 274, 260, 10); g.fill();
            g.fillColor = new Color(this._accent.r, this._accent.g, this._accent.b, 28);
            g.roundRect(-137, -77, 274, 260, 10); g.fill();
            g.fillColor = new Color(this._accent.r, this._accent.g, this._accent.b, 225);
            g.fillRect(-133, -87, 266, 3);
        };
        this._drawHero(); attachEnableRedraw(hero, this._drawHero);
        this._label(hero, 'RoleEyebrow', '当前出战  /  OPERATIVE', 0, 207, 260, 21,
            13, UI_PALETTE.cyan, HorizontalTextAlignment.CENTER);
        const portraitNode = new Node('Portrait'); portraitNode.setParent(hero);
        portraitNode.setPosition(new Vec3(0, 50, 0));
        portraitNode.addComponent(UITransform).setContentSize(248, 248);
        this._portrait = portraitNode.addComponent(Sprite);
        this._portrait.sizeMode = Sprite.SizeMode.CUSTOM;
        this._label(hero, 'PassiveHeader', '被动能力', -80, -116, 100, 24, 16,
            UI_PALETTE.reward);
        this._label(hero, 'PassiveOpenHint', '完整说明 ›', 69, -116, 115, 22, 13,
            UI_PALETTE.reward, HorizontalTextAlignment.RIGHT);
        this._passive = this._label(hero, 'Passive', '', 0, -170, 260, 78,
            15, TEXT);
        this._passive.enableWrapText = true;
        this._passive.lineHeight = 22;
        this._passive.overflow = Label.Overflow.CLAMP;
        const passiveTap = new Node('PassiveTap'); passiveTap.setParent(hero);
        passiveTap.setPosition(new Vec3(0, -161, 0));
        passiveTap.addComponent(UITransform).setContentSize(274, 130);
        passiveTap.on(Node.EventType.TOUCH_END, () => this._showPassiveDetail());
        registerKeyboardFocus(passiveTap, 274, 130);

        const statPanel = new Node('CombatStats'); statPanel.setParent(root);
        statPanel.setPosition(new Vec3(156, 126, 0));
        statPanel.addComponent(UITransform).setContentSize(778, 196);
        const sg = statPanel.addComponent(Graphics);
        const drawStats = () => {
            sg.clear();
            drawHexPanel(sg, -389, -98, 778, 196, UI_PALETTE.muted, 254);
            sg.strokeColor = new Color(107, 142, 163, 72);
            sg.lineWidth = 1;
            for (const x of [-128, 128]) {
                sg.moveTo(x, -79); sg.lineTo(x, 49); sg.stroke();
            }
            for (const y of [-2, -40]) {
                sg.moveTo(-374, y); sg.lineTo(374, y); sg.stroke();
            }
        };
        drawStats(); attachEnableRedraw(statPanel, drawStats);
        this._label(statPanel, 'StatsHeader', '作战参数  /  COMBAT PARAMETERS',
            -181, 73, 390, 24, 15, UI_PALETTE.cyan);
        const order = [0, 1, 5, 2, 3, 4, 6, 7, 8, 10, 9, 11];
        for (let position = 0; position < order.length; position++) {
            const col = position % 3, row = Math.floor(position / 3);
            const x = [-257, 0, 257][col], y = 37 - row * 37;
            const name = this._label(statPanel, `StatName_${position}`, '',
                x - 55, y, 120, 27, 14, MUTED);
            const value = this._label(statPanel, `StatValue_${position}`, '',
                x + 62, y, 116, 29, 18, TEXT, HorizontalTextAlignment.RIGHT);
            this._statCells[order[position]] = { name, value };
        }

        this._label(root, 'SkillHeader', '主动技能  /  ACTIVE SKILLS',
            -30, 17, 380, 24, 15, UI_PALETTE.cyan);
        const keys = ['Q', 'E', 'R'];
        for (let i = 0; i < 3; i++) {
            const row = new Node(`Skill_${keys[i]}`); row.setParent(root);
            row.setPosition(new Vec3(156, -35 - i * 76, 0));
            row.addComponent(UITransform).setContentSize(778, 70);
            const g = row.addComponent(Graphics);
            const accent = i === 2 ? UI_PALETTE.reward : UI_PALETTE.cyan;
            const draw = () => {
                g.clear();
                drawHexPanel(g, -389, -35, 778, 70, accent, 250);
                g.fillColor = new Color(accent.r, accent.g, accent.b, 215);
                g.fillRect(-379, -22, 3, 44);
            };
            draw(); attachEnableRedraw(row, draw);
            const iconN = new Node('Icon'); iconN.setParent(row);
            iconN.setPosition(new Vec3(-337, 0, 0));
            iconN.addComponent(UITransform).setContentSize(46, 46);
            const icon = iconN.addComponent(Sprite);
            icon.sizeMode = Sprite.SizeMode.CUSTOM;
            this._label(row, 'Key', keys[i], -288, 15, 34, 24, 14, accent,
                HorizontalTextAlignment.CENTER);
            const name = this._label(row, 'Name', '', -70, 16, 385, 27, 18, TEXT);
            const desc = this._label(row, 'Description', '', 49, -15, 620, 39,
                14, MUTED);
            desc.enableWrapText = true;
            desc.lineHeight = 18;
            desc.overflow = Label.Overflow.CLAMP;
            const status = this._label(row, 'Status', '', 292, 18, 156, 23, 14,
                accent, HorizontalTextAlignment.RIGHT);
            this._label(row, 'OpenHint', '›', 371, -17, 24, 25, 20, accent,
                HorizontalTextAlignment.CENTER);
            row.on(Node.EventType.TOUCH_END, () => this._showSkillDetail(i));
            registerKeyboardFocus(row, 778, 70);
            this._skillRows.push({ icon, name, desc, status });
        }
    }

    private _buildAugments(): void {
        const root = this._augmentsPage;
        const augColX = [-273, 273], y0 = 180, rowH = 87;
        for (let i = 0; i < this.MAX_AUG_ROWS; i++) {
            const row = new Node(`Aug_${i}`); row.setParent(root);
            row.setPosition(new Vec3(augColX[i % 2], y0 - Math.floor(i / 2) * rowH, 0));
            row.addComponent(UITransform).setContentSize(528, 80);
            const rowG = row.addComponent(Graphics);
            const view: AugRow = {
                root: row, icon: null as any, name: null as any, desc: null as any,
                accent: UI_PALETTE.muted,
                redraw: () => {
                    rowG.clear();
                    drawHexPanel(rowG, -264, -40, 528, 80, view.accent, 251);
                },
            };
            view.redraw(); attachEnableRedraw(row, view.redraw);
            const iconNode = new Node('Icon'); iconNode.setParent(row);
            iconNode.setPosition(new Vec3(-219, 0, 0));
            iconNode.addComponent(UITransform).setContentSize(48, 48);
            view.icon = iconNode.addComponent(Sprite);
            view.icon.sizeMode = Sprite.SizeMode.CUSTOM;
            view.name = this._label(row, 'Name', '', -31, 18, 300, 27, 18, TEXT);
            view.desc = this._label(row, 'Summary', '', 15, -13, 390, 36, 14, MUTED);
            view.desc.enableWrapText = true;
            view.desc.lineHeight = 18;
            view.desc.overflow = Label.Overflow.CLAMP;
            this._label(row, 'OpenHint', '查看 ›', 213, 18, 72, 20, 13, MUTED,
                HorizontalTextAlignment.CENTER);
            row.on(Node.EventType.TOUCH_END, () => this._showAugDetail(i));
            registerKeyboardFocus(row, 528, 80);
            row.active = false;
            this._augRows.push(view);
        }

        this._emptyAug = new Node('EmptyBuild'); this._emptyAug.setParent(root);
        this._emptyAug.addComponent(UITransform).setContentSize(720, 340);
        const eg = this._emptyAug.addComponent(Graphics);
        const drawEmpty = () => {
            eg.clear();
            drawHexPanel(eg, -360, -170, 720, 340, UI_PALETTE.muted, 245);
            eg.strokeColor = new Color(68, 155, 177, 90);
            eg.lineWidth = 2;
            eg.circle(0, 61, 68); eg.stroke();
        };
        drawEmpty(); attachEnableRedraw(this._emptyAug, drawEmpty);
        const emblem = new Node('HexEmblem'); emblem.setParent(this._emptyAug);
        emblem.setPosition(new Vec3(0, 61, 0));
        emblem.addComponent(UITransform).setContentSize(92, 92);
        const emblemSp = emblem.addComponent(Sprite);
        emblemSp.sizeMode = Sprite.SizeMode.CUSTOM;
        emblemSp.color = new Color(145, 187, 203, 190);
        applyArtSprite(emblemSp, 'ui_icon_hex01');
        this._label(this._emptyAug, 'EmptyTitle', '尚未装备海克斯强化',
            0, -35, 520, 38, 24, TEXT, HorizontalTextAlignment.CENTER);
        this._label(this._emptyAug, 'EmptyHint', '波次间获得的强化会收录于此，可点按查看完整效果。',
            0, -85, 590, 38, 16, MUTED, HorizontalTextAlignment.CENTER);

        this._augPager = new Node('AugPager'); this._augPager.setParent(root);
        const pagerButton = (name: string, title: string, x: number, direction: number): HexButtonSkin => {
            const button = new Node(name); button.setParent(this._augPager);
            button.setPosition(new Vec3(x, -243, 0));
            button.addComponent(UITransform).setContentSize(120, 38);
            const skin = applyHexButtonSkin(button, 120, 38, UI_PALETTE.cyan);
            this._label(button, 'Label', title, 0, 0, 108, 27, 14, TEXT,
                HorizontalTextAlignment.CENTER);
            button.on(Node.EventType.TOUCH_END, () => this._changeAugPage(direction));
            return skin;
        };
        this._prevSkin = pagerButton('Prev', '上一页', -145, -1);
        this._nextSkin = pagerButton('Next', '下一页', 145, 1);
        this._augPageLabel = this._label(this._augPager, 'Page', '', 0, -243, 100, 27,
            15, TEXT, HorizontalTextAlignment.CENTER);
        this._augPager.active = false;
    }

    private _buildAugDetail(panel: Node): void {
        const detail = new Node('AugDetail'); detail.setParent(panel);
        detail.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        detail.addComponent(BlockInputEvents);
        registerKeyboardModalScope(detail);
        const dim = detail.addComponent(Graphics);
        const drawDim = () => {
            dim.clear();
            dim.fillColor = new Color(3, 9, 17, 216);
            dim.fillRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H);
        };
        drawDim(); attachEnableRedraw(detail, drawDim);
        const dialog = new Node('DetailCard'); dialog.setParent(detail);
        dialog.addComponent(UITransform).setContentSize(760, 430);
        const g = dialog.addComponent(Graphics);
        const draw = () => {
            g.clear();
            drawHexPanel(g, -380, -215, 760, 430, UI_PALETTE.cyan, 255);
            g.fillColor = new Color(46, 195, 216, 180);
            g.fillRect(-333, 124, 666, 2);
        };
        draw(); attachEnableRedraw(dialog, draw);
        this._augDetailTitle = this._label(dialog, 'Title', '', 0, 162, 650, 42,
            26, TEXT, HorizontalTextAlignment.CENTER);
        const descNode = new Node('Description'); descNode.setParent(dialog);
        descNode.setPosition(new Vec3(0, 0, 0));
        descNode.addComponent(UITransform).setContentSize(640, 222);
        this._augDetailDesc = descNode.addComponent(Label);
        this._augDetailDesc.fontSize = 18;
        this._augDetailDesc.lineHeight = 29;
        this._augDetailDesc.color = TEXT;
        this._augDetailDesc.horizontalAlign = HorizontalTextAlignment.LEFT;
        this._augDetailDesc.verticalAlign = VerticalTextAlignment.TOP;
        this._augDetailDesc.enableWrapText = true;
        this._augDetailDesc.overflow = Label.Overflow.CLAMP;
        styleLabel(this._augDetailDesc, { outline: false });
        const close = new Node('Close'); close.setParent(dialog);
        close.setPosition(new Vec3(0, -166, 0));
        close.addComponent(UITransform).setContentSize(206, 48);
        applyHexButtonSkin(close, 206, 48, UI_PALETTE.cyan);
        this._label(close, 'Label', '关闭说明', 0, 0, 190, 32, 17, TEXT,
            HorizontalTextAlignment.CENTER);
        close.on(Node.EventType.TOUCH_END, () => { detail.active = false; });
        detail.active = false;
        this._augDetail = detail;
    }

    private _augPreview(desc: string): string {
        let units = 0, preview = '';
        for (const ch of desc) {
            const width = ch.charCodeAt(0) < 128 ? 1 : 2;
            if (units + width > 90) return `${preview.replace(/\s+$/, '')}…`;
            preview += ch; units += width;
        }
        return preview;
    }

    private _showAugDetail(slot: number): void {
        const aug = this._augments[this._augPage * this.MAX_AUG_ROWS + slot];
        if (!aug) return;
        const tier = aug.tier ?? 1;
        this._augDetailTitle.string = tier > 1 ? `${aug.name} · ${tier}级` : aug.name;
        this._augDetailTitle.color = Color.fromHEX(new Color(), RARITY_COLOR[aug.rarity] ?? '#ffffff');
        this._augDetailDesc.string = aug.desc ?? '';
        this._augDetail.active = true;
    }

    private _showSkillDetail(slot: number): void {
        const skill = this._skillStates[slot];
        if (!skill) return;
        const [name, ...description] = skill.desc.split('—').map(part => part.trim());
        this._augDetailTitle.string = `${['Q', 'E', 'R'][slot]} · ${name || skill.name}`;
        this._augDetailTitle.color = slot === 2 ? UI_PALETTE.reward : this._accent;
        this._augDetailDesc.string = description.join(' — ') || skill.desc;
        this._augDetail.active = true;
    }

    private _showPassiveDetail(): void {
        this._augDetailTitle.string = '被动能力';
        this._augDetailTitle.color = UI_PALETTE.reward;
        this._augDetailDesc.string = this._passiveDesc || '暂无被动能力';
        this._augDetail.active = true;
    }

    private _changeAugPage(direction: number): void {
        const last = Math.max(0, Math.ceil(this._augments.length / this.MAX_AUG_ROWS) - 1);
        const next = Math.max(0, Math.min(last, this._augPage + direction));
        if (next === this._augPage) return;
        this._augPage = next;
        this._augDetail.active = false;
        this._renderAugPage();
    }

    private _renderAugPage(): void {
        this._emptyAug.active = this._augments.length === 0;
        const pages = Math.max(1, Math.ceil(this._augments.length / this.MAX_AUG_ROWS));
        this._augPager.active = pages > 1;
        this._augPageLabel.string = `${this._augPage + 1} / ${pages}`;
        this._prevSkin.setDisabled(this._augPage === 0);
        this._nextSkin.setDisabled(this._augPage >= pages - 1);
        for (let i = 0; i < this._augRows.length; i++) {
            const view = this._augRows[i];
            const aug = this._augments[this._augPage * this.MAX_AUG_ROWS + i];
            if (!aug) { view.root.active = false; continue; }
            const col = Color.fromHEX(new Color(), RARITY_COLOR[aug.rarity] ?? '#888888');
            view.accent = col;
            view.root.active = true;
            view.redraw();
            const tier = aug.tier ?? 1;
            view.name.string = tier > 1 ? `${aug.name} · ${tier}级` : aug.name;
            view.name.color = col;
            view.desc.string = this._augPreview(aug.desc ?? '');
            applyArtSprite(view.icon, `ui_icon_${aug.icon}`);
        }
    }

    refresh(d: StatsPanelData): void {
        this._build();
        this._accent = Color.fromHEX(new Color(), d.charColor || '#22d7e8');
        this.fitToVisible();
        this._drawHero();
        this._title.string = d.charName;
        this._title.color = this._accent;
        this._passive.string = d.passiveDesc || '暂无被动能力';
        this._passiveDesc = d.passiveDesc;
        this._skillStates = d.skillStates;
        if (this._portraitKey !== d.charId) {
            this._portraitKey = d.charId;
            applyArtSprite(this._portrait, `char_${d.charId}`);
        }
        for (let i = 0; i < this._statCells.length; i++) {
            const stat = d.stats[i];
            this._statCells[i].name.string = stat?.label ?? '';
            this._statCells[i].value.string = stat?.value ?? '';
        }
        for (let i = 0; i < this._skillRows.length; i++) {
            const row = this._skillRows[i], state = d.skillStates[i];
            const parts = state?.desc?.split('—').map(v => v.trim()) ?? [];
            row.name.string = state ? (parts[0] || state.name) : '';
            row.desc.string = state ? (parts.slice(1).join(' — ') || state.desc) : '';
            const remaining = state?.cd ?? 0;
            row.status.string = i === 2
                ? `充能 ${Math.round((1 - remaining) * 100)}%`
                : remaining > 0 ? `冷却 ${remaining.toFixed(1)} 秒` : '已就绪';
            const key = (['q', 'e', 'r'] as const)[i];
            applyArtSprite(row.icon, `ui_icon_${d.skillIcons[key]}`);
        }
        this._progress.string = d.progress;
        this._augments = d.augments;
        this._augmentTabLabel.string = `海克斯构筑  ${this._augments.length}`;
        this._augPage = 0;
        this._renderAugPage();
        this._selectTab('overview');
    }
}
