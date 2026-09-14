import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, HorizontalTextAlignment
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
    priceLabel:  Label;
}

interface ChipSlot {
    root:  Node;
    g:     Graphics;
    label: Label;
    id:    string;
}

/** 商店上下文： GameManager 提供（金币/购买/刷新/卖出/继续）。 */
export interface AugShopCtx {
    gold(): number;
    buy(card: AugDef): boolean;
    refreshCost(): number;
    refresh(): AugDef[] | null;
    owned(): AugDef[];
    sell(inst: AugDef): boolean;
    /** 当前波次三档稀有度的出现概率（百分比，和为 100）。 */
    odds(): { silver: number; gold: number; prismatic: number };
    done(): void;
}

/**
 * AugSelectUI — 每波清场后的海克斯商店（《海克斯.docx》）。
 * 三张卡按稀有度定价，可花钱刷新（首次 5 金币，3 次后每次溢价 75%），
 * 也可卖出已持有海克斯（回收购买价 75%）。跳过则直接进入下一波。
 */
@ccclass('AugSelectUI')
export class AugSelectUI extends Component {
    private _cards:    CardSlot[] = [];
    private _chips:    ChipSlot[] = [];
    private _chipRoot!: Node;
    private _ownedLbl!: Label;
    private _goldLbl!: Label;
    private _oddsLbl!: Label;
    private _refreshLbl!: Label;
    private _options:  AugDef[]  = [];
    private _bought:   Set<string> = new Set();
    private _ctx?:     AugShopCtx;
    onButtonSfx?: () => void;
    onPickSfx?: () => void;

    private readonly CARD_W = 272;
    private readonly CARD_H = 300;
    private readonly GAP    = 34;

    onLoad() {
        this._buildDimmer();
        this._buildTitle();
        this._buildCards();
        this._buildActionRow();
        this._buildOwnedStrip();
        this.node.active = false;
    }

    // ── public API ────────────────────────────────────────────

    show(options: AugDef[], ctx: AugShopCtx) {
        this._options = options;
        this._ctx     = ctx;
        this._bought  = new Set();
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
        n.setPosition(new Vec3(-60, 312, 0));
        n.addComponent(UITransform).setContentSize(520, 42);
        const lbl = n.addComponent(Label);
        lbl.string = '— 海克斯商店 —';
        lbl.fontSize = 26;
        lbl.color = new Color(255, 215, 90, 255);
        styleLabel(lbl);

        const g = new Node('Gold'); g.setParent(this.node);
        g.setPosition(new Vec3(430, 312, 0));
        g.addComponent(UITransform).setContentSize(220, 36);
        this._goldLbl = g.addComponent(Label);
        this._goldLbl.fontSize = 22;
        this._goldLbl.color = new Color(255, 210, 50, 255);
        this._goldLbl.horizontalAlign = HorizontalTextAlignment.RIGHT;
        styleLabel(this._goldLbl);

        // 海克斯强度标注：三档稀有度本波出现率（与 rollOptions 权重同源）
        const oN = new Node('Odds'); oN.setParent(this.node);
        oN.setPosition(new Vec3(0, 278, 0));
        oN.addComponent(UITransform).setContentSize(900, 24);
        this._oddsLbl = oN.addComponent(Label);
        this._oddsLbl.fontSize = 15;
        this._oddsLbl.color = new Color(168, 186, 204, 255);
        styleLabel(this._oddsLbl);
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
        root.setPosition(new Vec3(cx, 40, 0));
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

        // 档位（银/金/彩即 Lv.1/2/3）—— 纯文本与说明文字同字体，星形符号在部分字体下描边发虚
        const tN = new Node('Tier'); tN.setParent(root);
        tN.setPosition(new Vec3(0, this.CARD_H / 2 - 40, 0));
        tN.addComponent(UITransform).setContentSize(this.CARD_W - 16, 24);
        const tierLabel = tN.addComponent(Label);
        tierLabel.fontSize = 18; tierLabel.color = new Color(255, 206, 96, 255);
        styleLabel(tierLabel);

        // name
        const nN = new Node('Name'); nN.setParent(root);
        nN.setPosition(new Vec3(0, this.CARD_H / 2 - 70, 0));
        nN.addComponent(UITransform).setContentSize(this.CARD_W - 16, 32);
        const nameLabel = nN.addComponent(Label);
        nameLabel.fontSize = 20; nameLabel.color = new Color(252, 252, 252, 255);
        styleLabel(nameLabel);

        // 词条图标承担卡片的第一视觉焦点。
        const iN = new Node('Icon'); iN.setParent(root);
        iN.setPosition(new Vec3(0, 36, 0));
        iN.addComponent(UITransform).setContentSize(72, 72);
        const iconSprite = iN.addComponent(Sprite);
        iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;

        // desc (word-wrap)
        const dN = new Node('Desc'); dN.setParent(root);
        dN.setPosition(new Vec3(0, -40, 0));
        dN.addComponent(UITransform).setContentSize(this.CARD_W - 34, 96);
        const descLabel = dN.addComponent(Label);
        descLabel.fontSize = 15;
        descLabel.lineHeight = 22;
        descLabel.color = new Color(228, 232, 240, 255);
        descLabel.overflow = Label.Overflow.SHRINK;
        descLabel.enableWrapText = true;
        styleLabel(descLabel);

        // 售价
        const pN = new Node('Price'); pN.setParent(root);
        pN.setPosition(new Vec3(0, -112, 0));
        pN.addComponent(UITransform).setContentSize(this.CARD_W - 30, 30);
        const priceLabel = pN.addComponent(Label);
        priceLabel.fontSize = 18;
        priceLabel.color = new Color(255, 214, 64, 255);
        styleLabel(priceLabel);

        root.on(Node.EventType.TOUCH_END, () => this._buy(idx), this);
        // 悬停高亮：说明常显 + hover 放大提示可点
        root.on(Node.EventType.MOUSE_ENTER, () => { if (!this._bought.has(this._options[idx]?.id ?? '')) root.setScale(1.03, 1.03, 1); });
        root.on(Node.EventType.MOUSE_LEAVE, () => root.setScale(1, 1, 1));

        return { root, bg, iconSprite, tierLabel, nameLabel, descLabel, rarityLabel, priceLabel };
    }

    /** 刷新 / 跳过 按钮。 */
    private _buildActionRow() {
        const refresh = new Node('RefreshBtn'); refresh.setParent(this.node);
        refresh.setPosition(new Vec3(-170, -178, 0));
        refresh.addComponent(UITransform).setContentSize(230, 44);
        applyHexButtonSkin(refresh, 230, 44, new Color(42, 108, 128, 255));
        const rl = new Node('L'); rl.setParent(refresh);
        rl.addComponent(UITransform).setContentSize(226, 44);
        this._refreshLbl = rl.addComponent(Label);
        this._refreshLbl.fontSize = 17;
        this._refreshLbl.color = new Color(235, 246, 250, 255);
        styleLabel(this._refreshLbl);
        refresh.on(Node.EventType.TOUCH_END, () => this._refresh(), this);

        const skip = new Node('SkipBtn'); skip.setParent(this.node);
        skip.setPosition(new Vec3(170, -178, 0));
        skip.addComponent(UITransform).setContentSize(230, 44);
        applyHexButtonSkin(skip, 230, 44, new Color(70, 110, 80, 255));
        const sl = new Node('L'); sl.setParent(skip);
        sl.addComponent(UITransform).setContentSize(226, 44);
        const skl = sl.addComponent(Label);
        skl.string = '继续战斗'; skl.fontSize = 17;
        skl.color = new Color(235, 246, 250, 255);
        styleLabel(skl);
        skip.on(Node.EventType.TOUCH_END, () => this._skip(), this);
    }

    /** 底部：已持有海克斯（格子使用量 + 卖出标签）。 */
    private _buildOwnedStrip() {
        this._chipRoot = new Node('OwnedStrip'); this._chipRoot.setParent(this.node);
        this._chipRoot.setPosition(new Vec3(0, -278, 0));

        const oN = new Node('OwnedLbl'); oN.setParent(this._chipRoot);
        oN.setPosition(new Vec3(-470, 34, 0));
        oN.addComponent(UITransform).setContentSize(200, 26);
        this._ownedLbl = oN.addComponent(Label);
        this._ownedLbl.fontSize = 15;
        this._ownedLbl.color = new Color(170, 190, 208, 255);
        this._ownedLbl.horizontalAlign = HorizontalTextAlignment.LEFT;
        styleLabel(this._ownedLbl);

        const hint = new Node('Hint'); hint.setParent(this._chipRoot);
        hint.setPosition(new Vec3(250, 34, 0));
        hint.addComponent(UITransform).setContentSize(700, 26);
        const hl = hint.addComponent(Label);
        hl.string = '点击持有标签可卖出（回收 75% 购买价）';
        hl.fontSize = 13;
        hl.color = new Color(140, 158, 174, 220);
        styleLabel(hl);

        for (let i = 0; i < 8; i++) {
            const chip = new Node(`Chip${i}`); chip.setParent(this._chipRoot);
            chip.setPosition(new Vec3(-360 + i * 205, -12, 0));
            chip.addComponent(UITransform).setContentSize(196, 44);
            const g = chip.addComponent(Graphics);
            const ln = new Node('L'); ln.setParent(chip);
            ln.addComponent(UITransform).setContentSize(192, 40);
            const label = ln.addComponent(Label);
            label.fontSize = 13;
            label.color = new Color(228, 236, 244, 255);
            styleLabel(label);
            chip.on(Node.EventType.TOUCH_END, () => this._sell(i), this);
            chip.active = false;
            this._chips.push({ root: chip, g, label, id: '' });
        }
    }

    // ── 交互 ──────────────────────────────────────────────────

    private _populate() {
        const gold = this._ctx?.gold() ?? 0;
        this._goldLbl.string = `金币 ${gold}`;

        for (let i = 0; i < 3; i++) {
            const aug = this._options[i];
            const c   = this._cards[i];
            if (!aug || this._bought.has(aug.id)) {
                c.root.active = !!aug;
                if (aug) this._paintCard(c, aug, gold, true);
                continue;
            }
            c.root.active = true;
            this._paintCard(c, aug, gold, false);
        }

        this._refreshLbl.string = `刷新 ${this._ctx?.refreshCost() ?? 5} 金币`;
        const odds = this._ctx?.odds();
        if (odds) {
            this._oddsLbl.string =
                `本波出现率   银色 ${odds.silver}%   ·   金色 ${odds.gold}%   ·   彩色 ${odds.prismatic}%`;
        }
        this._refreshChips();
    }

    private _paintCard(c: CardSlot, aug: AugDef, gold: number, sold: boolean) {
        const hex = RARITY_COLOR[aug.rarity] ?? '#888888';
        const col = Color.fromHEX(new Color(), hex);

        c.bg.clear();
        c.bg.fillColor = new Color(30, 27, 38, 255);
        c.bg.fillRect(-this.CARD_W / 2, -this.CARD_H / 2, this.CARD_W, this.CARD_H);
        if (!sold) {
            // 稀有度色调层只作为暗色衬底（低 alpha），保证说明文字对比度
            c.bg.fillColor = new Color(col.r, col.g, col.b, 28);
            c.bg.fillRect(-this.CARD_W / 2, -this.CARD_H / 2, this.CARD_W, this.CARD_H);
        }
        c.bg.strokeColor = sold ? new Color(70, 74, 84, 200) : col;
        c.bg.lineWidth = 2;
        c.bg.rect(-this.CARD_W / 2, -this.CARD_H / 2, this.CARD_W, this.CARD_H);
        c.bg.stroke();

        const price = aug._price ?? 0;
        const afford = gold >= price && !sold;
        c.rarityLabel.string = (RARITY_LABEL[aug.rarity] ?? aug.rarity) + (aug.oneShot ? ' · 一次性' : '');
        c.rarityLabel.color  = col;
        const lvl = aug.level ?? 1;
        c.tierLabel.string = aug.oneShot ? '一次性' : `Lv.${lvl}`;
        if ((aug as any)._isUpgrade) c.tierLabel.string = `升级至 Lv.${lvl}`;
        c.nameLabel.string = sold ? '已售出' : aug.name;
        c.descLabel.string = aug.desc ?? '';
        c.priceLabel.string = sold ? '已购入' : `购买 ${price} 金币`;
        c.priceLabel.color  = afford ? new Color(255, 210, 50, 255) : new Color(255, 96, 96, 255);
        c.iconSprite.color  = sold ? new Color(120, 120, 120, 160) : Color.WHITE;
        applyArtSprite(c.iconSprite, `ui_icon_${aug.icon}`);
    }

    private _refreshChips() {
        const owned = this._ctx?.owned() ?? [];
        this._ownedLbl.string = `已持有 ${owned.length}/${this._ctx ? 5 : 5} 格`;
        for (let i = 0; i < this._chips.length; i++) {
            const chip = this._chips[i];
            const inst = owned[i];
            if (!inst) { chip.root.active = false; chip.id = ''; continue; }
            chip.root.active = true;
            chip.id = inst.id;
            chip.label.string = `${inst.name} Lv${inst.level ?? 1} · 卖 ${Math.round((inst.paid ?? 0) * 0.75)} 金币`;
            const hex = RARITY_COLOR[inst.rarity] ?? '#888888';
            const col = Color.fromHEX(new Color(), hex);
            chip.g.clear();
            chip.g.fillColor = new Color(14, 20, 30, 245);
            chip.g.fillRect(-98, -22, 196, 44);
            chip.g.strokeColor = new Color(col.r, col.g, col.b, 150);
            chip.g.lineWidth = 1.5;
            chip.g.rect(-98, -22, 196, 44);
            chip.g.stroke();
        }
    }

    private _buy(idx: number) {
        const aug = this._options[idx];
        if (!aug || this._bought.has(aug.id)) { this.onButtonSfx?.(); return; }
        if (this._ctx?.buy(aug)) {
            this._bought.add(aug.id);
            this.onPickSfx?.();
        } else {
            this.onButtonSfx?.();
        }
        this._populate();
    }

    private _refresh() {
        const next = this._ctx?.refresh();
        this.onButtonSfx?.();
        if (next) {
            this._options = next;
            this._bought = new Set();
        }
        this._populate();
    }

    private _sell(i: number) {
        const chip = this._chips[i];
        if (!chip?.id) return;
        this.onButtonSfx?.();
        this._ctx?.sell({ id: chip.id } as AugDef);
        this._populate();
    }

    private _skip() {
        this.onButtonSfx?.();
        this.hide();
        this._ctx?.done();
    }
}
