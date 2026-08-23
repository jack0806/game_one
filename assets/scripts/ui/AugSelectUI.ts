import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform
} from 'cc';
import { AugDef } from '../data/AugmentDB';
import { RARITY_COLOR, RARITY_LABEL } from '../core/Constants';
import { styleLabel } from '../core/LabelUtils';
import { applyArtSprite } from '../core/SpriteUtils';
import { applyHexButtonSkin } from '../core/UIStyle';

const { ccclass } = _decorator;

interface CardSlot {
    root:        Node;
    bg:          Graphics;
    iconSprite:  Sprite;
    tierLabel:   Label;
    nameLabel:   Label;
    descLabel:   Label;
    rarityLabel: Label;
}

/**
 * AugSelectUI — shown after each wave clear.
 * Call show(options, cb) to present 3 augment cards.
 * cb is fired with the chosen AugDef, or null if skipped.
 */
@ccclass('AugSelectUI')
export class AugSelectUI extends Component {
    private _cards:    CardSlot[] = [];
    private _skipBtn!: Node;
    private _options:  AugDef[]  = [];
    private _cb?: (aug: AugDef | null) => void;
    onButtonSfx?: () => void;
    onPickSfx?: () => void;

    private readonly CARD_W = 272;
    private readonly CARD_H = 300;
    private readonly GAP    = 34;

    onLoad() {
        this._buildDimmer();
        this._buildTitle();
        this._buildCards();
        this._buildSkipBtn();
        this.node.active = false;
    }

    // ── public API ────────────────────────────────────────────

    show(options: AugDef[], cb: (aug: AugDef | null) => void) {
        this._options = options;
        this._cb      = cb;
        // 三选一是模态弹窗，必须盖在商店等后创建的面板之上：每次显示都把本节点
        // 移到 UI 层末尾（绘制顺序最顶），否则会被商店商品压在下面。
        if (this.node.parent) this.node.setSiblingIndex(this.node.parent.children.length - 1);
        // 先激活再填充：Graphics 在未激活节点上下发的绘制命令，激活后会丢失。
        this.node.active = true;
        this._populate();
    }

    hide() { this.node.active = false; }

    // ── builders ──────────────────────────────────────────────

    private _buildDimmer() {
        const n = new Node('Dimmer'); n.setParent(this.node);
        n.addComponent(UITransform).setContentSize(1280, 720);
        const g = n.addComponent(Graphics);
        // 完全不透明遮罩：弹窗期间压住底下的商店商品/战场画面，避免文字被
        // 压花的商品图标干扰(见用户反馈"移到上面 为不透明模式")。
        g.fillColor = new Color(0, 0, 0, 255);
        g.fillRect(-640, -360, 1280, 720);
    }

    private _buildTitle() {
        const n = new Node('Title'); n.setParent(this.node);
        n.setPosition(new Vec3(0, 270, 0));
        n.addComponent(UITransform).setContentSize(520, 42);
        const lbl = n.addComponent(Label);
        lbl.string = '— 选择一项海克斯强化 —';
        lbl.fontSize = 26;
        lbl.color = new Color(255, 215, 90, 255);
        styleLabel(lbl);
    }

    private _buildCards() {
        const total = 3 * this.CARD_W + 2 * this.GAP;
        const x0    = -total / 2 + this.CARD_W / 2;
        for (let i = 0; i < 3; i++) {
            this._cards.push(this._mkCard(i, x0 + i * (this.CARD_W + this.GAP)));
        }
    }

    private _mkCard(idx: number, cx: number): CardSlot {
        const root = new Node(`Card${idx}`); root.setParent(this.node);
        root.setPosition(new Vec3(cx, 0, 0));
        root.addComponent(UITransform).setContentSize(this.CARD_W, this.CARD_H);

        // background graphics
        const bgN = new Node('Bg'); bgN.setParent(root);
        const bg  = bgN.addComponent(Graphics);

        // rarity line
        const rN = new Node('Rar'); rN.setParent(root);
        rN.setPosition(new Vec3(0, this.CARD_H / 2 - 18, 0));
        rN.addComponent(UITransform).setContentSize(this.CARD_W - 16, 22);
        const rarityLabel = rN.addComponent(Label);
        rarityLabel.fontSize = 12;
        styleLabel(rarityLabel);

        // tier stars
        const tN = new Node('Tier'); tN.setParent(root);
        tN.setPosition(new Vec3(0, this.CARD_H / 2 - 40, 0));
        tN.addComponent(UITransform).setContentSize(this.CARD_W - 16, 24);
        const tierLabel = tN.addComponent(Label);
        tierLabel.fontSize = 18; tierLabel.color = new Color(255, 200, 80, 255);
        styleLabel(tierLabel);

        // name
        const nN = new Node('Name'); nN.setParent(root);
        nN.setPosition(new Vec3(0, this.CARD_H / 2 - 70, 0));
        nN.addComponent(UITransform).setContentSize(this.CARD_W - 16, 32);
        const nameLabel = nN.addComponent(Label);
        nameLabel.fontSize = 19; nameLabel.color = new Color(245, 245, 245, 255);
        styleLabel(nameLabel);

        // 词条图标承担卡片的第一视觉焦点。此前卡片中央完全留空，玩家只能
        // 逐字阅读小号说明；72px 图标与 HUD 中同一资源建立了稳定的识别关系。
        const iN = new Node('Icon'); iN.setParent(root);
        iN.setPosition(new Vec3(0, 36, 0));
        iN.addComponent(UITransform).setContentSize(72, 72);
        const iconSprite = iN.addComponent(Sprite);
        iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;

        // desc (word-wrap)
        const dN = new Node('Desc'); dN.setParent(root);
        dN.setPosition(new Vec3(0, -70, 0));
        dN.addComponent(UITransform).setContentSize(this.CARD_W - 34, 76);
        const descLabel = dN.addComponent(Label);
        descLabel.fontSize = 14;
        descLabel.lineHeight = 21;
        descLabel.color = new Color(214, 216, 224, 255);
        descLabel.overflow = Label.Overflow.SHRINK;
        descLabel.enableWrapText = true;
        styleLabel(descLabel);

        // click handler (simple: store idx on node, check in _populate)
        root.on(Node.EventType.TOUCH_END, () => this._pick(idx), this);

        return { root, bg, iconSprite, tierLabel, nameLabel, descLabel, rarityLabel };
    }

    private _buildSkipBtn() {
        this._skipBtn = new Node('SkipBtn'); this._skipBtn.setParent(this.node);
        this._skipBtn.setPosition(new Vec3(0, -this.CARD_H / 2 - 38, 0));
        this._skipBtn.addComponent(UITransform).setContentSize(140, 36);
        applyHexButtonSkin(this._skipBtn, 140, 36, new Color(105, 125, 165, 255));
        const ln = new Node('L'); ln.setParent(this._skipBtn);
        ln.addComponent(UITransform).setContentSize(140, 36);
        const l = ln.addComponent(Label);
        l.string = '跳过'; l.fontSize = 16;
        l.color = new Color(160, 160, 200, 220);
        styleLabel(l);
        this._skipBtn.on(Node.EventType.TOUCH_END, () => this._pick(-1), this);
    }

    // ── logic ─────────────────────────────────────────────────

    private _populate() {
        for (let i = 0; i < 3; i++) {
            const aug = this._options[i];
            const c   = this._cards[i];
            if (!aug) { c.root.active = false; continue; }
            c.root.active = true;

            const hex = RARITY_COLOR[aug.rarity] ?? '#888888';
            const col = Color.fromHEX(new Color(), hex);

            // card background — fully opaque dark base tinted by rarity color, plus a
            // thin rarity-colored tint layer on top. 半透明底会让商店商品/战场画面从
            // 文字底下透出来(用户反馈"为不透明模式")，这里改为 255 全不透明。
            c.bg.clear();
            c.bg.fillColor = new Color(18, 16, 24, 255);
            c.bg.fillRect(-this.CARD_W/2, -this.CARD_H/2, this.CARD_W, this.CARD_H);
            c.bg.fillColor = new Color(col.r, col.g, col.b, 40);
            c.bg.fillRect(-this.CARD_W/2, -this.CARD_H/2, this.CARD_W, this.CARD_H);
            c.bg.strokeColor = col; c.bg.lineWidth = 2;
            c.bg.rect(-this.CARD_W/2, -this.CARD_H/2, this.CARD_W, this.CARD_H);
            c.bg.stroke();

            c.rarityLabel.string = RARITY_LABEL[aug.rarity] ?? aug.rarity;
            c.rarityLabel.color  = col;
            c.tierLabel.string   = '★'.repeat(aug.tier ?? 1) + '☆'.repeat(Math.max(0, 3 - (aug.tier ?? 1)));
            c.nameLabel.string   = aug.name;
            c.descLabel.string   = aug.desc;
            c.iconSprite.color   = Color.WHITE;
            applyArtSprite(c.iconSprite, `ui_icon_${aug.icon}`);
        }
    }

    private _pick(idx: number) {
        const aug = idx >= 0 ? (this._options[idx] ?? null) : null;
        if (aug) this.onPickSfx?.(); else this.onButtonSfx?.();
        this.hide();
        this._cb?.(aug);
    }
}
