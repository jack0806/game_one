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
    private _dimG!:        Graphics;
    private _panelG!:      Graphics;
    private _titleLabel!:  Label;
    private _passiveLabel!: Label;
    private _statCells:    Label[] = [];
    private _skillRows:    { key: Label; name: Label; desc: Label }[] = [];
    private _progressLabel!: Label;
    private _augRows:      { root: Node; icon: Sprite; name: Label; desc: Label }[] = [];

    // 与 AugmentManager 的词条上限对齐（六角特权可到10）。
    private readonly MAX_AUG_ROWS = 10;

    onLoad() { this._build(); }

    onEnable() {
        // 节点从未激活时 onLoad 不会触发，_build() 由 refresh() 兜底执行；
        // 而未激活状态下下发的 Graphics 绘制命令在激活后可能丢失
        // （表现为只有文字、没有底板，面板"全透明"），所以每次激活都重画一遍。
        if (this._built) this._drawChrome();
    }

    // ── build ─────────────────────────────────────────────────

    private _build() {
        if (this._built) return;
        this._built = true;

        // 全屏暗化遮罩：面板弹出时压暗背后的战斗画面
        const dim = new Node('Dim'); dim.setParent(this.node);
        dim.addComponent(UITransform).setContentSize(1280, 720);
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

        // 左栏 — Q/E/R 三行：按键 / 技能名 / 描述 分层排版
        const keys = ['Q', 'E', 'R'];
        for (let i = 0; i < 3; i++) {
            const y = -78 - i * 32;

            const kn = new Node(`SkKey_${i}`); kn.setParent(panel);
            kn.setPosition(new Vec3(-498, y, 0));
            kn.addComponent(UITransform).setContentSize(24, 24);
            const kl = kn.addComponent(Label);
            kl.string = keys[i];
            kl.fontSize = 15;
            kl.color = new Color(100, 220, 255, 255);
            styleLabel(kl);

            const nn = new Node(`SkName_${i}`); nn.setParent(panel);
            nn.setPosition(new Vec3(-415, y, 0));
            nn.addComponent(UITransform).setContentSize(130, 24);
            const nl = nn.addComponent(Label);
            nl.fontSize = 16;
            nl.horizontalAlign = HorizontalTextAlignment.LEFT;
            nl.color = new Color(245, 248, 255, 255);
            nl.overflow = Label.Overflow.SHRINK;
            styleLabel(nl);

            const dn = new Node(`SkDesc_${i}`); dn.setParent(panel);
            dn.setPosition(new Vec3(-190, y, 0));
            dn.addComponent(UITransform).setContentSize(310, 22);
            const dl = dn.addComponent(Label);
            dl.fontSize = 13;
            dl.horizontalAlign = HorizontalTextAlignment.LEFT;
            dl.color = new Color(165, 175, 195, 235);
            dl.overflow = Label.Overflow.SHRINK;
            styleLabel(dl);

            this._skillRows.push({ key: kl, name: nl, desc: dl });
        }

        // 左栏底部 — 进度行
        const gn = new Node('Progress'); gn.setParent(panel);
        gn.setPosition(new Vec3(-265, -200, 0));
        gn.addComponent(UITransform).setContentSize(510, 20);
        this._progressLabel = gn.addComponent(Label);
        this._progressLabel.fontSize = 14;
        this._progressLabel.horizontalAlign = HorizontalTextAlignment.LEFT;
        this._progressLabel.color = new Color(160, 170, 190, 230);
        styleLabel(this._progressLabel);

        // 右栏 — 10 行词条：图标 + 名称行 + 描述行
        const y0 = 156, rowH = 42;
        for (let i = 0; i < this.MAX_AUG_ROWS; i++) {
            const row = new Node(`Aug_${i}`); row.setParent(panel);
            row.setPosition(new Vec3(265, y0 - i * rowH, 0));
            row.addComponent(UITransform).setContentSize(510, 38);

            const iconN = new Node('Icon'); iconN.setParent(row);
            iconN.setPosition(new Vec3(-232, 0, 0));
            iconN.addComponent(UITransform).setContentSize(30, 30);
            const iconSp = iconN.addComponent(Sprite);
            iconSp.sizeMode = Sprite.SizeMode.CUSTOM;

            const nn = new Node('Name'); nn.setParent(row);
            nn.setPosition(new Vec3(14, 10, 0));
            nn.addComponent(UITransform).setContentSize(436, 20);
            const nl = nn.addComponent(Label);
            nl.fontSize = 16;
            nl.horizontalAlign = HorizontalTextAlignment.LEFT;
            nl.verticalAlign = VerticalTextAlignment.CENTER;
            nl.color = new Color(240, 240, 250, 255);
            styleLabel(nl);

            const dn = new Node('Desc'); dn.setParent(row);
            dn.setPosition(new Vec3(14, -12, 0));
            dn.addComponent(UITransform).setContentSize(436, 18);
            const dl = dn.addComponent(Label);
            dl.fontSize = 13;
            dl.horizontalAlign = HorizontalTextAlignment.LEFT;
            dl.verticalAlign = VerticalTextAlignment.CENTER;
            dl.overflow = Label.Overflow.SHRINK;
            dl.color = new Color(170, 180, 195, 235);
            styleLabel(dl);

            row.active = false;
            this._augRows.push({ root: row, icon: iconSp, name: nl, desc: dl });
        }

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
        this._dimG.fillRect(-640, -360, 1280, 720);

        const g = this._panelG;
        g.clear();
        g.fillColor = new Color(10, 14, 24, 255);
        g.fillRect(-hw, -hh, PANEL_W, PANEL_H);
        g.strokeColor = new Color(90, 130, 180, 255);
        g.lineWidth = 2;
        g.rect(-hw, -hh, PANEL_W, PANEL_H);
        g.stroke();
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
        this._drawChrome();

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
            row.name.string = sk ? sk.name : '';
            row.desc.string = sk ? sk.desc : '';
        }

        this._progressLabel.string = d.progress;

        for (let i = 0; i < this._augRows.length; i++) {
            const row = this._augRows[i];
            const aug = d.augments[i];
            if (!aug) { row.root.active = false; continue; }

            row.root.active = true;
            const col  = Color.fromHEX(new Color(), RARITY_COLOR[aug.rarity] ?? '#888888');
            const tier = aug.tier ?? 1;
            row.name.string = tier > 1 ? `${aug.name}  Lv${tier}` : aug.name;
            row.name.color  = new Color(col.r, col.g, col.b, 255);
            row.desc.string = aug.desc;
            applyArtSprite(row.icon, `ui_icon_${aug.icon}`);
        }
    }
}
