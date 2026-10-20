import {
    _decorator, BlockInputEvents, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, HorizontalTextAlignment, VerticalTextAlignment
} from 'cc';
import { AugDef } from '../data/AugmentDB';
import { RARITY_COLOR, RARITY_LABEL } from '../core/Constants';
import { styleLabel } from '../core/LabelUtils';
import { applyArtSprite } from '../core/SpriteUtils';
import { applyHexButtonSkin, attachEnableRedraw, drawHexPanel, HexButtonSkin,
    keyboardFocusTarget, registerKeyboardFocus, registerKeyboardModalScope,
    UI_PALETTE } from '../core/UIStyle';
import { visibleDesignWidth } from '../core/ScreenFit';

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
    /** 左上角出现率徽标：本卡稀有度在本波的出现概率（随刷新/波次更新）。 */
    odds:        Label;
}

interface ChipSlot {
    root:  Node;
    g:     Graphics;
    label: Label;
    /** 右缘内嵌「卖 N」按钮：唯一的卖出入口（点击弹确认框，不直接卖）。 */
    sellBtn:  Node;
    sellSkin: HexButtonSkin;
    sellLabel: Label;
    id:    string;
}

/** 商店上下文： GameManager 提供（金币/购买/固定/刷新/卖出/继续）。 */
export interface AugShopCtx {
    gold(): number;
    buy(card: AugDef): boolean;
    /** 固定强化：收取一次性 +5% 附加费（同一强化只收一次），刷新与下次开页都保留。 */
    pin(card: AugDef): void;
    /** 取消固定：解除跨波保留（附加费不退）。 */
    unpin(card: AugDef): void;
    /** 当前固定中的海克斯 id（开页回显"已固定"状态）。 */
    pinnedIds(): string[];
    refreshCost(): number;
    /** 剩余免费刷新次数（开局战备包显示在刷新按钮上；缺省按 0）。 */
    freeRefreshes?: () => number;
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
 * 卡片左上角"固定 +5%"页签：刷新与后续波次开页都保留该卡（占前几张，
 * 见 AugmentManager.pinCard/shopOptions），代价是该卡定价 +5%
 * （同一强化无论固定几次只收一次附加费）；购买后自动解除固定。
 */
@ccclass('AugSelectUI')
export class AugSelectUI extends Component {
    private _cards:    CardSlot[] = [];
    private _chips:    ChipSlot[] = [];
    private _chipRoot!: Node;
    private _chipPager!: Node;
    private _chipPageLabel!: Label;
    private _chipPrevSkin!: HexButtonSkin;
    private _chipNextSkin!: HexButtonSkin;
    private _chipPage = 0;
    private _ownedLbl!: Label;
    private _goldLbl!: Label;
    private _oddsLbl!: Label;
    private _refreshLbl!: Label;
    private _refreshSkin!: HexButtonSkin;
    private _options:  AugDef[]  = [];
    private _bought:   Set<string> = new Set();
    /** 卖出确认弹窗当前目标海克斯 id（空串=弹窗关闭）。 */
    private _confirmId = '';
    private _confirmNode?: Node;
    private _confirmName?: Label;
    private _confirmRefund?: Label;
    private _ctx?:     AugShopCtx;
    private _dimNode!: Node;
    private _drawDim!: () => void;
    /** 标题后缀「· 开局战备包」（战备包模式显示，普通波次隐藏）。 */
    private _titleSuffix?: Label;
    private _continueLbl!: Label;
    onButtonSfx?: () => void;
    onPickSfx?: () => void;

    private readonly CARD_W = 272;
    private readonly CARD_H = 360;
    private readonly GAP    = 34;

    onLoad() {
        this._buildDimmer();
        this._buildTitle();
        this._buildCards();
        this._buildActionRow();
        this._buildOwnedStrip();
        // 卖出确认弹窗最后创建，保证压在持有标签/商品卡之上
        this._buildSellConfirm();
        this.node.active = false;
    }

    // ── public API ────────────────────────────────────────────

    show(options: AugDef[], ctx: AugShopCtx, starter = false) {
        this._options = options;
        this._ctx     = ctx;
        this._bought  = new Set();
        this._chipPage = 0;
        this._closeConfirm();
        // 开局战备包模式：标题后缀亮出、按钮为「开始战斗」（随时结束战备期）；
        // 普通波清空无后缀、按钮为「继续战斗」
        if (this._titleSuffix) this._titleSuffix.node.active = starter;
        if (this._continueLbl) this._continueLbl.string = starter ? '开始战斗' : '继续战斗';
        // 三选一是模态弹窗，必须盖在商店等后创建的面板之上：每次显示都把本节点
        // 移到 UI 层末尾（绘制顺序最顶），否则会被商店商品压在下面。
        if (this.node.parent) this.node.setSiblingIndex(this.node.parent.children.length - 1);
        // 先激活再填充：Graphics 在未激活节点上下发的绘制命令，激活后会丢失。
        this.node.active = true;
        this.fitToVisible();
        this._populate();
    }

    hide() { this.node.active = false; }

    fitToVisible(): void {
        if (!this._dimNode) return;
        this._dimNode.getComponent(UITransform)!.setContentSize(visibleDesignWidth(), 720);
        this._drawDim();
        // 卖出确认弹窗的遮罩热区跟随可见宽度（超售弹窗激活时 attachEnableRedraw 重画）
        if (this._confirmNode) {
            this._confirmNode.getComponent(UITransform)!.setContentSize(visibleDesignWidth(), 720);
        }
    }

    // ── builders ──────────────────────────────────────────────

    private _buildDimmer() {
        const n = new Node('Dimmer'); n.setParent(this.node);
        n.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        this._dimNode = n;
        const g = n.addComponent(Graphics);
        // 完全不透明遮罩：弹窗期间压住底下的商店商品/战场画面，避免文字被
        // 压花的商品图标干扰(见用户反馈"移到上面 为不透明模式")。
        const draw = () => {
            g.clear();
            g.fillColor = UI_PALETTE.deep;
            const width = visibleDesignWidth();
            g.fillRect(-width / 2, -360, width, 720);
        };
        this._drawDim = draw;
        draw();
        // 遮罩是构建期一次性绘制：节点 停用→再激活（如神秘强化二级弹窗往返回来）
        // 后内容会丢、战场会透出来，激活时重画兜底。
        attachEnableRedraw(n, draw);
    }

    private _buildTitle() {
        const n = new Node('Title'); n.setParent(this.node);
        n.setPosition(new Vec3(-60, 312, 0));
        n.addComponent(UITransform).setContentSize(520, 42);
        const lbl = n.addComponent(Label);
        lbl.string = '海克斯强化';
        lbl.fontSize = 26;
        lbl.color = UI_PALETTE.text;
        styleLabel(lbl);

        // 标题后缀：开局战备包模式下显示（show 时切换显隐）
        const suffix = new Node('TitleSuffix'); suffix.setParent(this.node);
        suffix.setPosition(new Vec3(288, 312, 0));
        suffix.addComponent(UITransform).setContentSize(240, 42);
        const slbl = suffix.addComponent(Label);
        slbl.string = '· 开局战备包';
        slbl.fontSize = 20;
        slbl.color = new Color(255, 214, 90, 255);
        slbl.horizontalAlign = HorizontalTextAlignment.LEFT;
        styleLabel(slbl, { outline: false });
        suffix.active = false;
        this._titleSuffix = slbl;

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
        rarityLabel.fontSize = 14;
        rarityLabel.lineHeight = 18;
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
        dN.setPosition(new Vec3(0, -70, 0));
        dN.addComponent(UITransform).setContentSize(this.CARD_W - 34, 140);
        const descLabel = dN.addComponent(Label);
        descLabel.fontSize = 14;
        descLabel.lineHeight = 18;
        descLabel.color = new Color(228, 232, 240, 255);
        descLabel.overflow = Label.Overflow.SHRINK;
        descLabel.enableWrapText = true;
        styleLabel(descLabel);

        // 售价
        const pN = new Node('Price'); pN.setParent(root);
        pN.setPosition(new Vec3(0, -160, 0));
        pN.addComponent(UITransform).setContentSize(this.CARD_W - 30, 30);
        const priceLabel = pN.addComponent(Label);
        priceLabel.fontSize = 18;
        priceLabel.color = new Color(255, 214, 64, 255);
        styleLabel(priceLabel);

        root.on(Node.EventType.TOUCH_END, () => this._buy(idx), this);
        // 点击热区始终与卡片尺寸一致，悬停由描边反馈。
        registerKeyboardFocus(root, this.CARD_W, this.CARD_H, {
            isDisabled: () => {
                const aug = this._options[idx];
                return !aug || this._bought.has(aug.id) || (this._ctx?.gold() ?? 0) < (aug._price ?? 0);
            },
        });

        // 出现率徽标：贴在卡片左上角边框外，显示本卡稀有度在本波的出现概率
        // （文案由 _populate 按稀有度从 ctx.odds() 回填，随刷新/波次实时变化；
        // 2026-10-20 取代旧「固定 +5%」页签——新稀有度曲线下固定机制已移除）。
        const oddsN = new Node('OddsTag'); oddsN.setParent(root);
        oddsN.setPosition(new Vec3(-this.CARD_W / 2 + 56, this.CARD_H / 2 + 15, 0));
        oddsN.addComponent(UITransform).setContentSize(110, 28);
        const oddsLbl = oddsN.addComponent(Label);
        oddsLbl.fontSize = 13;
        oddsLbl.color = new Color(255, 214, 90, 255);
        styleLabel(oddsLbl);

        return { root, bg, iconSprite, tierLabel, nameLabel, descLabel, rarityLabel, priceLabel, odds: oddsLbl };
    }

    /** 刷新 / 跳过 按钮。 */
    private _buildActionRow() {
        const refresh = new Node('RefreshBtn'); refresh.setParent(this.node);
        refresh.setPosition(new Vec3(-170, -178, 0));
        refresh.addComponent(UITransform).setContentSize(230, 44);
        this._refreshSkin = applyHexButtonSkin(refresh, 230, 44, new Color(42, 108, 128, 255));
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
        this._continueLbl = skl;
        skip.on(Node.EventType.TOUCH_END, () => this._skip(), this);
    }

    /** 底部：已持有海克斯（技能 5 格 + 功能双行展示，功能性海克斯不占技能格）。 */
    private _buildOwnedStrip() {
        this._chipRoot = new Node('OwnedStrip'); this._chipRoot.setParent(this.node);
        this._chipRoot.setPosition(new Vec3(0, -284, 0));

        const oN = new Node('OwnedLbl'); oN.setParent(this._chipRoot);
        oN.setPosition(new Vec3(-486, 58, 0));
        oN.addComponent(UITransform).setContentSize(300, 26);
        this._ownedLbl = oN.addComponent(Label);
        this._ownedLbl.fontSize = 15;
        this._ownedLbl.color = new Color(170, 190, 208, 255);
        this._ownedLbl.horizontalAlign = HorizontalTextAlignment.LEFT;
        styleLabel(this._ownedLbl);

        const hint = new Node('Hint'); hint.setParent(this._chipRoot);
        hint.setPosition(new Vec3(345, 58, 0));
        hint.addComponent(UITransform).setContentSize(570, 26);
        const hl = hint.addComponent(Label);
        hl.string = '点「卖」按钮并确认后回收 75% 购价 · 功能海克斯不占技能格';
        hl.fontSize = 14;
        hl.lineHeight = 18;
        hl.color = new Color(174, 194, 211, 245);
        styleLabel(hl);

        // 双行 × 5 = 10 格；功能性海克斯可无限叠加，超出一页时翻页查看。
        // 每格右缘内嵌「卖 N」按钮（N=回收额）：卖出只走按钮+确认弹窗，
        // 标签本体不再绑定任何卖出行为（防连点误卖）。
        for (let i = 0; i < 10; i++) {
            const col = i % 5, row = Math.floor(i / 5);
            const chip = new Node(`Chip${i}`); chip.setParent(this._chipRoot);
            chip.setPosition(new Vec3(-392 + col * 196, row === 0 ? 12 : -40, 0));
            chip.addComponent(UITransform).setContentSize(188, 44);
            const g = chip.addComponent(Graphics);
            const ln = new Node('L'); ln.setParent(chip);
            ln.setPosition(new Vec3(-33, 0, 0));
            ln.addComponent(UITransform).setContentSize(118, 40);
            const label = ln.addComponent(Label);
            label.fontSize = 13;
            label.color = new Color(228, 236, 244, 255);
            styleLabel(label);
            const sellBtn = new Node('SellBtn'); sellBtn.setParent(chip);
            sellBtn.setPosition(new Vec3(66, 0, 0));
            sellBtn.addComponent(UITransform).setContentSize(52, 36);
            const sellSkin = applyHexButtonSkin(sellBtn, 52, 36, new Color(128, 56, 46, 255));
            const sl = new Node('L'); sl.setParent(sellBtn);
            sl.addComponent(UITransform).setContentSize(48, 36);
            const sellLabel = sl.addComponent(Label);
            sellLabel.fontSize = 13;
            sellLabel.color = new Color(244, 214, 200, 255);
            styleLabel(sellLabel);
            sellBtn.on(Node.EventType.TOUCH_END, () => this._requestSell(i), this);
            registerKeyboardFocus(sellBtn, 52, 36);
            chip.active = false;
            this._chips.push({ root: chip, g, label, sellBtn, sellSkin, sellLabel, id: '' });
        }

        const pager = new Node('OwnedPager'); pager.setParent(this._chipRoot);
        this._chipPager = pager;
        const pageNode = new Node('Page'); pageNode.setParent(pager);
        pageNode.setPosition(new Vec3(-110, 58, 0));
        pageNode.addComponent(UITransform).setContentSize(150, 26);
        this._chipPageLabel = pageNode.addComponent(Label);
        this._chipPageLabel.fontSize = 14;
        this._chipPageLabel.lineHeight = 18;
        this._chipPageLabel.color = UI_PALETTE.text;
        styleLabel(this._chipPageLabel);
        const makePageButton = (name: string, labelText: string, x: number, step: number): HexButtonSkin => {
            const button = new Node(name); button.setParent(pager);
            button.setPosition(new Vec3(x, -14, 0));
            button.addComponent(UITransform).setContentSize(72, 40);
            const skin = applyHexButtonSkin(button, 72, 40, UI_PALETTE.cyan);
            const textNode = new Node('Label'); textNode.setParent(button);
            textNode.addComponent(UITransform).setContentSize(68, 30);
            const label = textNode.addComponent(Label);
            label.string = labelText;
            label.fontSize = 14;
            label.lineHeight = 18;
            label.color = UI_PALETTE.text;
            styleLabel(label);
            button.on(Node.EventType.TOUCH_END, () => this._changeChipPage(step), this);
            return skin;
        };
        this._chipPrevSkin = makePageButton('Prev', '上一页', -545, -1);
        this._chipNextSkin = makePageButton('Next', '下一页', 545, 1);
        pager.active = false;
    }

    // ── 交互 ──────────────────────────────────────────────────

    private _populate() {
        const gold = this._ctx?.gold() ?? 0;
        this._goldLbl.string = `金币 ${gold}`;
        // 本波三档出现率（顶部总览 + 每张卡左上角的稀有度徽标共用）
        const odds = this._ctx?.odds();

        for (let i = 0; i < 3; i++) {
            const aug = this._options[i];
            const c   = this._cards[i];
            if (!aug || this._bought.has(aug.id)) {
                c.root.active = !!aug;
                if (aug) this._paintCard(c, aug, gold, true, odds);
                continue;
            }
            c.root.active = true;
            this._paintCard(c, aug, gold, false, odds);
        }

        // 再来一次·强化版(hex29)：refreshCost() 返回 0 表示免费刷新次数未用完
        const refreshCost = this._ctx?.refreshCost() ?? 5;
        const freeRefresh = refreshCost <= 0;
        const canRefresh = freeRefresh || gold >= refreshCost;
        // 免费刷新把剩余次数直接标在按钮上（开局战备包场景）
        const freeLeft = this._ctx?.freeRefreshes?.() ?? 0;
        this._refreshLbl.string = freeRefresh ? `免费刷新（剩 ${freeLeft}）`
            : canRefresh ? `刷新 ${refreshCost} 金币` : `刷新需 ${refreshCost} 金币`;
        this._refreshSkin.setDisabled(!canRefresh);
        this._refreshLbl.color = canRefresh ? UI_PALETTE.text : UI_PALETTE.muted;
        if (odds) {
            this._oddsLbl.string =
                `本波出现率   银色 ${odds.silver}%   ·   金色 ${odds.gold}%   ·   彩色 ${odds.prismatic}%`;
        }
        this._refreshChips();
    }

    private _paintCard(c: CardSlot, aug: AugDef, gold: number, sold: boolean, odds?: { silver: number; gold: number; prismatic: number }) {
        const hex = RARITY_COLOR[aug.rarity] ?? '#888888';
        const col = Color.fromHEX(new Color(), hex);

        c.bg.clear();
        // 与补给商店共用蓝灰装甲底板，稀有度只占上沿色带。
        drawHexPanel(c.bg, -this.CARD_W / 2, -this.CARD_H / 2, this.CARD_W, this.CARD_H,
            sold ? new Color(70, 84, 96) : new Color(96, 123, 144), 255);
        c.bg.fillColor = sold ? new Color(70, 84, 96) : col;
        c.bg.fillRect(-this.CARD_W / 2 + 18, this.CARD_H / 2 - 6, this.CARD_W - 36, 3);

        const price = aug._price ?? 0;
        const afford = gold >= price && !sold;
        c.rarityLabel.string = (RARITY_LABEL[aug.rarity] ?? aug.rarity) + (aug.oneShot ? ' · 一次性' : '');
        c.rarityLabel.color  = col;
        const lvl = aug.level ?? 1;
        c.tierLabel.string = aug.oneShot ? '一次性' : `Lv.${lvl}`;
        if ((aug as any)._isUpgrade) c.tierLabel.string = `升级至 Lv.${lvl}`;
        c.nameLabel.string = sold ? '已售出' : aug.name;
        c.descLabel.string = aug.desc ?? '';
        c.priceLabel.string = sold ? '已购入' : afford ? `购买 ${price} 金币` : `金币不足 · ${price}`;
        c.priceLabel.color  = afford ? new Color(255, 210, 50, 255) : new Color(255, 96, 96, 255);
        c.iconSprite.color  = sold ? new Color(120, 120, 120, 160) : Color.WHITE;
        applyArtSprite(c.iconSprite, `ui_icon_${aug.icon}`);
        // 左上角出现率徽标：本卡稀有度在本波的出现概率（随刷新/波次实时变化；
        // 2026-10-20 取代旧「固定 +5%」页签——新稀有度曲线下固定机制已移除）
        if (c.odds) {
            const pct = aug.rarity === 'gold' ? odds?.gold
                : aug.rarity === 'prismatic' ? odds?.prismatic
                : odds?.silver;
            c.odds.string = sold ? '' : `出现率 ${pct ?? 0}%`;
            c.odds.node.active = !sold;
        }
    }

    private _refreshChips() {
        const owned = this._ctx?.owned() ?? [];
        // 功能性海克斯不占 5 个技能格：计数分开显示，标签加 [功] 前缀区分
        const funcCount = owned.filter(o => o.category === '功能').length;
        this._ownedLbl.string = `技能 ${owned.length - funcCount}/5 格   ·   功能 ${funcCount}（不占格）`;
        const pages = Math.max(1, Math.ceil(owned.length / this._chips.length));
        this._chipPage = Math.min(this._chipPage, pages - 1);
        this._chipPager.active = pages > 1;
        this._chipPageLabel.string = `${this._chipPage + 1} / ${pages}`;
        this._chipPrevSkin.setDisabled(this._chipPage === 0);
        this._chipNextSkin.setDisabled(this._chipPage >= pages - 1);
        for (let i = 0; i < this._chips.length; i++) {
            const chip = this._chips[i];
            const inst = owned[this._chipPage * this._chips.length + i];
            if (!inst) { chip.root.active = false; chip.id = ''; continue; }
            chip.root.active = true;
            chip.id = inst.id;
            const tag = inst.category === '功能' ? '[功] ' : '';
            chip.label.string = `${tag}${inst.name} Lv${inst.level ?? 1}`;
            // 卖出按钮直接标注回收额（75% 购价），点按后弹确认窗
            chip.sellLabel.string = `卖 ${Math.round((inst.paid ?? 0) * 0.75)}`;
            const hex = RARITY_COLOR[inst.rarity] ?? '#888888';
            const col = Color.fromHEX(new Color(), hex);
            chip.g.clear();
            chip.g.fillColor = new Color(14, 20, 30, 245);
            chip.g.fillRect(-92, -22, 188, 44);
            chip.g.strokeColor = new Color(col.r, col.g, col.b, 150);
            chip.g.lineWidth = 1.5;
            chip.g.rect(-92, -22, 188, 44);
            chip.g.stroke();
        }
    }

    private _changeChipPage(step: number): void {
        const pages = Math.max(1, Math.ceil((this._ctx?.owned().length ?? 0) / this._chips.length));
        const next = Math.max(0, Math.min(pages - 1, this._chipPage + step));
        if (next === this._chipPage) return;
        this._chipPage = next;
        this._refreshChips();
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
        if (this._bought.has(aug.id)) keyboardFocusTarget(this._cards[idx].root)?.setFocused(false);
    }

    // 「固定 +5%」机制已随 2026-10-20 稀有度曲线改版移除（卡片改为显示
    // 本波出现率）；数据层 AugmentManager.pinCard 保留备用。

    private _refresh() {
        if ((this._ctx?.gold() ?? 0) < (this._ctx?.refreshCost() ?? 5)) {
            this.onButtonSfx?.();
            return;
        }
        const next = this._ctx?.refresh();
        this.onButtonSfx?.();
        if (next) {
            this._options = next;
            this._bought = new Set();
        }
        this._populate();
    }

    // ── 卖出确认弹窗 ──────────────────────────────────────────

    /** 构建模态确认弹窗（onLoad 末尾调用，层级压过持有标签与商品卡）。 */
    private _buildSellConfirm() {
        const n = new Node('SellConfirm'); n.setParent(this.node);
        n.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        n.addComponent(BlockInputEvents);
        const g = n.addComponent(Graphics);
        const draw = () => {
            const width = visibleDesignWidth();
            g.clear();
            g.fillColor = new Color(4, 8, 15, 210);
            g.fillRect(-width / 2, -360, width, 720);
            drawHexPanel(g, -280, -150, 560, 300, new Color(200, 108, 92), 252);
        };
        draw();
        attachEnableRedraw(n, draw);

        const mkLabel = (name: string, y: number, w: number, h: number, size: number,
                         color: Color): Label => {
            const ln = new Node(name); ln.setParent(n);
            ln.setPosition(new Vec3(0, y, 0));
            ln.addComponent(UITransform).setContentSize(w, h);
            const l = ln.addComponent(Label);
            l.fontSize = size; l.lineHeight = size + 6; l.color = color;
            l.horizontalAlign = HorizontalTextAlignment.CENTER;
            l.verticalAlign = VerticalTextAlignment.CENTER;
            l.overflow = Label.Overflow.SHRINK;
            l.enableWrapText = size < 16;
            styleLabel(l, { outline: size >= 22 });
            return l;
        };
        mkLabel('Title', 102, 400, 34, 24, UI_PALETTE.text).string = '确认卖出';
        this._confirmName = mkLabel('Name', 56, 480, 30, 21, UI_PALETTE.text);
        this._confirmRefund = mkLabel('Refund', 14, 480, 26, 18, new Color(255, 214, 64, 255));
        mkLabel('Warn', -32, 460, 44, 14, new Color(168, 186, 204, 230)).string =
            '卖出后立即从技能格移除，本局内如需再用须重新购入';
        const cancel = new Node('CancelBtn'); cancel.setParent(n);
        cancel.setPosition(new Vec3(-130, -104, 0));
        cancel.addComponent(UITransform).setContentSize(200, 52);
        applyHexButtonSkin(cancel, 200, 52, new Color(70, 105, 130, 255));
        const cl = new Node('L'); cl.setParent(cancel);
        cl.addComponent(UITransform).setContentSize(184, 52);
        const cancelLbl = cl.addComponent(Label);
        cancelLbl.string = '取消'; cancelLbl.fontSize = 18;
        cancelLbl.color = new Color(235, 246, 250, 255);
        styleLabel(cancelLbl);
        cancel.on(Node.EventType.TOUCH_END, () => { this.onButtonSfx?.(); this._closeConfirm(); }, this);
        const ok = new Node('ConfirmBtn'); ok.setParent(n);
        ok.setPosition(new Vec3(130, -104, 0));
        ok.addComponent(UITransform).setContentSize(200, 52);
        applyHexButtonSkin(ok, 200, 52, new Color(158, 60, 48, 255));
        const ol = new Node('L'); ol.setParent(ok);
        ol.addComponent(UITransform).setContentSize(184, 52);
        const okLbl = ol.addComponent(Label);
        okLbl.string = '确认卖出'; okLbl.fontSize = 18;
        okLbl.color = new Color(250, 226, 216, 255);
        styleLabel(okLbl);
        ok.on(Node.EventType.TOUCH_END, () => this._confirmSell(), this);
        registerKeyboardFocus(cancel, 200, 52);
        registerKeyboardFocus(ok, 200, 52);
        // 弹窗为模态：键盘焦点循环锁定在 取消/确认 两键
        registerKeyboardModalScope(n);
        n.active = false;
        this._confirmNode = n;
    }

    /** 点「卖 N」：记录目标并弹出确认窗（不直接卖出）。 */
    private _requestSell(i: number) {
        const chip = this._chips[i];
        if (!chip?.id || !this._confirmNode) return;
        const inst = (this._ctx?.owned() ?? []).find(o => o.id === chip.id);
        if (!inst) return;
        this._confirmId = chip.id;
        const hex = RARITY_COLOR[inst.rarity] ?? '#888888';
        this._confirmName!.string = `${inst.name}  Lv.${inst.level ?? 1}`;
        this._confirmName!.color = Color.fromHEX(new Color(), hex);
        this._confirmRefund!.string = `回收 ${Math.round((inst.paid ?? 0) * 0.75)} 金币（购价的 75%）`;
        // 弹窗置顶（翻页等兄弟节点之后创建的场景同样保险）
        if (this._confirmNode.parent) {
            this._confirmNode.setSiblingIndex(this._confirmNode.parent.children.length - 1);
        }
        this._confirmNode.active = true;
        this.onButtonSfx?.();
    }

    private _confirmSell() {
        const id = this._confirmId;
        this._closeConfirm();
        this.onButtonSfx?.();
        if (id) this._ctx?.sell({ id } as AugDef);
        this._populate();
    }

    private _closeConfirm() {
        this._confirmId = '';
        if (this._confirmNode) this._confirmNode.active = false;
    }

    private _skip() {
        this.onButtonSfx?.();
        this.hide();
        this._ctx?.done();
    }
}
