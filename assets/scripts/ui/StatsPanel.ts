// ============================================================
//  StatsPanel.ts — M键暂停的角色详情面板（属性 + 额外技能/词条）
//  左栏：属性 2×6 网格 + Q/E/R 技能 + 进度；右栏：海克斯强化列表。
//  由 GameManager 在 'stats' 状态下激活，再按 M / Esc 返回战斗。
// ============================================================
import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, HorizontalTextAlignment, VerticalTextAlignment
} from 'cc';
import { AugDef } from '../data/AugmentDB';
import { RARITY_COLOR } from '../core/Constants';
import { applyArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';
import { visibleDesignWidth } from '../core/ScreenFit';
import { attachEnableRedraw, drawHexPanel, UI_PALETTE } from '../core/UIStyle';

const { ccclass } = _decorator;

/** 一次快照，由 GameManager._buildStatsData() 聚合后传入 refresh()。 */
export interface StatsPanelData {
    charName: string;
    charColor: string;                              // 身份色 HEX，用于标题
    passiveDesc: string;
    stats: { label: string; value: string }[];       // 左栏属性网格（≤12，已格式化）
    progress: string;                               // 底部进度行（章节/波次/击杀/得分）
    augments: AugDef[];                             // 已装备词条（含 tier）
    skillStates: { name: string; desc: string }[];   // Q/E/R 技能
}

const PANEL_W = 1080, PANEL_H = 620;

@ccclass('StatsPanel')
export class StatsPanel extends Component {
    private _built = false;
    private _dimNode!:     Node;
    private _dimG!:        Graphics;
    private _panelG!:      Graphics;
    private _titleLabel!:  Label;
    private _passiveLabel!: Label;
    private _statCells:    Label[] = [];
    private _skillRows:    { key: Label; name: Label; desc: Label }[] = [];
    private _progressLabel!: Label;
    private _augRows:      { root: Node; icon: Sprite; name: Label; desc: Label }[] = [];
    private _emptyAugLabel!: Label;

    // 与 AugmentManager 的词条上限对齐（六角特权可到10）。
    private readonly MAX_AUG_ROWS = 10;

    onLoad() { this._build(); }

    onEnable() {
        // 节点从未激活时 onLoad 不会触发，_build() 由 refresh() 兜底执行；
        // 而未激活状态下下发的 Graphics 绘制命令在激活后可能丢失
        // （表现为只有文字、没有底板，面板"全透明"），所以每次激活都重画一遍。
        if (this._built) this.fitToVisible();
    }

    fitToVisible(): void {
        if (!this._built) return;
        this._dimNode.getComponent(UITransform)!.setContentSize(visibleDesignWidth(), 720);
        this._drawChrome();
    }

    // ── build ─────────────────────────────────────────────────

    private _build() {
        if (this._built) return;
        this._built = true;

        // 全屏暗化遮罩：面板弹出时压暗背后的战斗画面
        const dim = new Node('Dim'); dim.setParent(this.node);
        dim.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        this._dimNode = dim;
        this._dimG = dim.addComponent(Graphics);

        // 主面板（完全不透明底板）
        const panel = new Node('Panel'); panel.setParent(this.node);
        panel.addComponent(UITransform).setContentSize(PANEL_W, PANEL_H);
        this._panelG = panel.addComponent(Graphics);

        this._drawChrome();

        // 标题（角色身份色）+ 被动说明
        const tn = new Node('Title'); tn.setParent(panel);
        tn.setPosition(new Vec3(0, 276, 0));
        tn.addComponent(UITransform).setContentSize(1000, 36);
        this._titleLabel = tn.addComponent(Label);
        this._titleLabel.fontSize = 26;
        this._titleLabel.color = new Color(255, 215, 90, 255);
        styleLabel(this._titleLabel);

        const pn = new Node('Passive'); pn.setParent(panel);
        pn.setPosition(new Vec3(0, 240, 0));
        pn.addComponent(UITransform).setContentSize(1000, 22);
        this._passiveLabel = pn.addComponent(Label);
        this._passiveLabel.fontSize = 15;
        this._passiveLabel.color = new Color(200, 190, 160, 235);
        styleLabel(this._passiveLabel);

        // 两栏表头
        const lh = this._mkHeader(panel, '角色属性', -265, 204);
        lh.color = new Color(150, 200, 255, 255);
        const rh = this._mkHeader(panel, '海克斯强化（额外技能）', 265, 204);
        rh.color = new Color(255, 200, 120, 255);

        // 左栏 — 属性 2×6 网格，逐格独立Label便于对齐与统一字号
        const colX = [-400, -130];
        for (let i = 0; i < 12; i++) {
            const r = Math.floor(i / 2), c = i % 2;
            const n = new Node(`Stat_${i}`); n.setParent(panel);
            n.setPosition(new Vec3(colX[c], 160 - r * 36, 0));
            n.addComponent(UITransform).setContentSize(250, 28);
            const l = n.addComponent(Label);
            l.fontSize = 17;
            l.horizontalAlign = HorizontalTextAlignment.LEFT;
            l.verticalAlign = VerticalTextAlignment.CENTER;
            l.color = new Color(225, 232, 245, 255);
            styleLabel(l);
            this._statCells.push(l);
        }

        // 左栏 — Q/E/R 三个双行阅读单元。技能名在上、完整说明在下；
        // 单行并排会把奥莉娅等长说明 SHRINK 到接近注脚大小。
        const keys = ['Q', 'E', 'R'];
        for (let i = 0; i < 3; i++) {
            const y = -64 - i * 66;

            const kn = new Node(`SkKey_${i}`); kn.setParent(panel);
            kn.setPosition(new Vec3(-498, y + 14, 0));
            kn.addComponent(UITransform).setContentSize(28, 28);
            const kl = kn.addComponent(Label);
            kl.string = keys[i];
            kl.fontSize = 16;
            kl.color = new Color(100, 220, 255, 255);
            styleLabel(kl);

            const nn = new Node(`SkName_${i}`); nn.setParent(panel);
            nn.setPosition(new Vec3(-350, y + 14, 0));
            nn.addComponent(UITransform).setContentSize(220, 24);
            const nl = nn.addComponent(Label);
            nl.fontSize = 16;
            nl.lineHeight = 22;
            nl.horizontalAlign = HorizontalTextAlignment.LEFT;
            nl.color = new Color(245, 248, 255, 255);
            nl.overflow = Label.Overflow.SHRINK;
            nl.enableWrapText = false;
            styleLabel(nl);

            const dn = new Node(`SkDesc_${i}`); dn.setParent(panel);
            dn.setPosition(new Vec3(-265, y - 18, 0));
            dn.addComponent(UITransform).setContentSize(450, 36);
            const dl = dn.addComponent(Label);
            dl.fontSize = 14;
            dl.lineHeight = 18;
            dl.horizontalAlign = HorizontalTextAlignment.LEFT;
            dl.verticalAlign = VerticalTextAlignment.CENTER;
            dl.color = new Color(190, 205, 220, 245);
            dl.overflow = Label.Overflow.SHRINK;
            dl.enableWrapText = true;
            styleLabel(dl);

            this._skillRows.push({ key: kl, name: nl, desc: dl });
        }

        // 左栏底部 — 进度行
        const gn = new Node('Progress'); gn.setParent(panel);
        gn.setPosition(new Vec3(-265, -252, 0));
        gn.addComponent(UITransform).setContentSize(510, 20);
        this._progressLabel = gn.addComponent(Label);
        this._progressLabel.fontSize = 15;
        this._progressLabel.horizontalAlign = HorizontalTextAlignment.LEFT;
        this._progressLabel.color = new Color(160, 170, 190, 230);
        styleLabel(this._progressLabel);

        // 右栏 — 2列×5行词条卡。单列10行只有18px描述高，长词条最终会被
        // SHRINK 到约6px；双列卡片给每条说明两行空间，在1280×720仍可读。
        const augColX = [132, 398];
        const y0 = 148, rowH = 72;
        for (let i = 0; i < this.MAX_AUG_ROWS; i++) {
            const row = new Node(`Aug_${i}`); row.setParent(panel);
            row.setPosition(new Vec3(augColX[i % 2], y0 - Math.floor(i / 2) * rowH, 0));
            row.addComponent(UITransform).setContentSize(252, 64);
            const rowG = row.addComponent(Graphics);
            const drawRow = () => {
                rowG.clear();
                drawHexPanel(rowG, -126, -32, 252, 64, UI_PALETTE.cyan, 238);
            };
            drawRow();
            attachEnableRedraw(row, drawRow);

            const iconN = new Node('Icon'); iconN.setParent(row);
            iconN.setPosition(new Vec3(-104, 11, 0));
            iconN.addComponent(UITransform).setContentSize(34, 34);
            const iconSp = iconN.addComponent(Sprite);
            iconSp.sizeMode = Sprite.SizeMode.CUSTOM;

            const nn = new Node('Name'); nn.setParent(row);
            nn.setPosition(new Vec3(14, 18, 0));
            nn.addComponent(UITransform).setContentSize(190, 20);
            const nl = nn.addComponent(Label);
            nl.fontSize = 16;
            nl.horizontalAlign = HorizontalTextAlignment.LEFT;
            nl.verticalAlign = VerticalTextAlignment.CENTER;
            nl.color = new Color(240, 240, 250, 255);
            styleLabel(nl);

            const dn = new Node('Desc'); dn.setParent(row);
            dn.setPosition(new Vec3(14, -10, 0));
            dn.addComponent(UITransform).setContentSize(190, 34);
            const dl = dn.addComponent(Label);
            dl.fontSize = 12;
            dl.lineHeight = 15;
            dl.horizontalAlign = HorizontalTextAlignment.LEFT;
            dl.verticalAlign = VerticalTextAlignment.TOP;
            dl.overflow = Label.Overflow.SHRINK;
            dl.enableWrapText = true;
            dl.color = new Color(170, 180, 195, 235);
            styleLabel(dl);

            row.active = false;
            this._augRows.push({ root: row, icon: iconSp, name: nl, desc: dl });
        }

        const empty = new Node('NoAugments'); empty.setParent(panel);
        empty.setPosition(new Vec3(265, 5, 0));
        empty.addComponent(UITransform).setContentSize(480, 42);
        this._emptyAugLabel = empty.addComponent(Label);
        this._emptyAugLabel.string = '本局尚未装备海克斯强化';
        this._emptyAugLabel.fontSize = 18;
        this._emptyAugLabel.color = UI_PALETTE.muted;
        styleLabel(this._emptyAugLabel);

        const fn = new Node('Footer'); fn.setParent(panel);
        fn.setPosition(new Vec3(0, -284, 0));
        fn.addComponent(UITransform).setContentSize(500, 22);
        const fl = fn.addComponent(Label);
        fl.string = '按 M 键返回战斗';
        fl.fontSize = 15;
        fl.color = new Color(150, 160, 180, 230);
        styleLabel(fl);
    }

    /** 底板绘制独立出来：激活/每次打开都重画，规避未激活时绘制命令丢失。 */
    private _drawChrome() {
        const hw = PANEL_W / 2, hh = PANEL_H / 2;

        this._dimG.clear();
        this._dimG.fillColor = new Color(0, 0, 0, 175);
        const width = visibleDesignWidth();
        this._dimG.fillRect(-width / 2, -360, width, 720);

        const g = this._panelG;
        g.clear();
        drawHexPanel(g, -hw, -hh, PANEL_W, PANEL_H, UI_PALETTE.cyan, 250);
        // 中缝竖线 + 表头下横线，把两栏在视觉上彻底分开
        g.strokeColor = new Color(70, 100, 140, 130);
        g.lineWidth = 1;
        g.moveTo(0, 188); g.lineTo(0, -252); g.stroke();
        g.moveTo(-510, 188); g.lineTo(510, 188); g.stroke();
    }

    private _mkHeader(parent: Node, text: string, x: number, y: number): Label {
        const n = new Node(`H_${text}`); n.setParent(parent);
        n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(510, 22);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = 17;
        l.horizontalAlign = HorizontalTextAlignment.LEFT;
        styleLabel(l);
        return l;
    }

    // ── refresh ───────────────────────────────────────────────

    refresh(d: StatsPanelData) {
        // 若 onLoad 尚未触发（节点从未被激活过），这里兜底构建
        this._build();
        this.fitToVisible();

        this._titleLabel.string = `角色详情 — ${d.charName}`;
        this._titleLabel.color  = Color.fromHEX(new Color(), d.charColor || '#ffd700');
        this._passiveLabel.string = d.passiveDesc ? `被动：${d.passiveDesc}` : '';

        for (let i = 0; i < this._statCells.length; i++) {
            const s = d.stats[i];
            this._statCells[i].string = s ? `${s.label}  ${s.value}` : '';
        }

        for (let i = 0; i < this._skillRows.length; i++) {
            const row = this._skillRows[i];
            const sk  = d.skillStates[i];
            const parts = sk?.desc?.split('—').map(v => v.trim()) ?? [];
            row.name.string = sk ? (parts[0] || sk.name) : '';
            const detail = sk ? (parts.slice(1).join(' — ') || sk.desc) : '';
            row.desc.string = detail ? `— ${detail}` : '';
        }

        this._progressLabel.string = d.progress;
        this._emptyAugLabel.node.active = d.augments.length === 0;

        for (let i = 0; i < this._augRows.length; i++) {
            const row = this._augRows[i];
            const aug = d.augments[i];
            if (!aug) { row.root.active = false; continue; }

            row.root.active = true;
            const col  = Color.fromHEX(new Color(), RARITY_COLOR[aug.rarity] ?? '#888888');
            const tier = aug.tier ?? 1;
            row.name.string = tier > 1 ? `${aug.name} · ${tier}级` : aug.name;
            row.name.color  = new Color(col.r, col.g, col.b, 255);
            row.desc.string = aug.desc;
            applyArtSprite(row.icon, `ui_icon_${aug.icon}`);
        }
    }
}
