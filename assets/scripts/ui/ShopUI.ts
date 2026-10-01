import {
    _decorator, Component, Node, Label, Graphics,
    Color, Vec3, UITransform, HorizontalTextAlignment
} from 'cc';
import { Economy, ShopItem } from '../systems/Economy';
import { RARITY_COLOR } from '../core/Constants';
import { styleLabel } from '../core/LabelUtils';
import { applyHexButtonSkin, attachEnableRedraw, drawHexPanel, HexButtonSkin, UI_PALETTE } from '../core/UIStyle';
import { visibleDesignWidth } from '../core/ScreenFit';

const { ccclass } = _decorator;

/**
 * ShopUI — shown at intermission / chapter clear.
 * Call show(items, gold, spendFn, leaveFn) to open.
 */
@ccclass('ShopUI')
export class ShopUI extends Component {
    private _itemNodes: Node[]    = [];
    private _rowStates: { item: ShopItem; skin: HexButtonSkin; label: Label; sold: boolean }[] = [];
    private _dimNode!: Node;
    private _drawDim!: () => void;
    private _goldLabel!: Label;
    private _leaveBtn!:  Node;
    private _spendFn?: (cost: number, item: ShopItem) => boolean;
    private _leaveFn?: () => void;
    private _currentGold = 0;
    onButtonSfx?: () => void;
    onBuySfx?: () => void;

    onLoad() {
        this._buildDimmer();
        this._buildTitle();
        this._buildGoldDisplay();
        this._buildItemArea();
        this._buildLeaveBtn();
        this.node.active = false;
    }

    // ── public API ────────────────────────────────────────────

    show(
        items:   ShopItem[],
        gold:    number,
        spendFn: (cost: number, item: ShopItem) => boolean,
        leaveFn: () => void
    ) {
        this._spendFn     = spendFn;
        this._leaveFn     = leaveFn;
        this._currentGold = gold;
        this._populate(items);
        this._goldLabel.string = `⬡ ${gold}`;
        this.node.active = true;
        this.fitToVisible();
        this._refreshAffordability();
    }

    refreshGold(gold: number) {
        this._currentGold = gold;
        this._goldLabel.string = `⬡ ${gold}`;
        this._refreshAffordability();
    }

    hide() { this.node.active = false; }
    /** 从神秘强化二级弹窗返回，保留已售出按钮与当前金币。 */
    resume() {
        this.node.active = true;
        this.fitToVisible();
        this._refreshAffordability();
    }

    fitToVisible(): void {
        if (!this._dimNode) return;
        this._dimNode.getComponent(UITransform)!.setContentSize(visibleDesignWidth(), 720);
        this._drawDim();
    }

    // ── builders ──────────────────────────────────────────────

    private _buildDimmer() {
        const n = new Node('Dimmer'); n.setParent(this.node);
        n.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        this._dimNode = n;
        const g = n.addComponent(Graphics);
        const drawDim = () => {
            g.clear();
            g.fillColor = new Color(UI_PALETTE.deep.r, UI_PALETTE.deep.g, UI_PALETTE.deep.b, 224);
            const width = visibleDesignWidth();
            g.fillRect(-width / 2, -360, width, 720);
        };
        this._drawDim = drawDim;

        // 商品列表拥有自己的近乎不透明金属面板。即使未来再叠确认框，底层
        // 战斗/强化卡也不会穿过六行商品文字造成“整个商店变透明”的错觉。
        const panel = new Node('ShopPanel'); panel.setParent(this.node);
        panel.addComponent(UITransform).setContentSize(640, 560);
        const pg = panel.addComponent(Graphics);
        const drawPanel = () => {
            pg.clear();
            drawHexPanel(pg, -320, -280, 640, 560, UI_PALETTE.cyan, 252);
        };
        drawDim();
        drawPanel();
        // 遮罩/面板为一次性绘制：节点 停用→再激活（如神秘强化二级弹窗往返回来）
        // 后内容会丢，激活时重画兜底。
        attachEnableRedraw(n, drawDim);
        attachEnableRedraw(panel, drawPanel);
    }

    private _buildTitle() {
        const n = new Node('Title'); n.setParent(this.node);
        n.setPosition(new Vec3(0, 280, 0));
        n.addComponent(UITransform).setContentSize(400, 40);
        const lbl = n.addComponent(Label);
        lbl.string = '— 商店 —';
        lbl.fontSize = 28; lbl.color = new Color(255, 215, 90, 255);
        styleLabel(lbl);
    }

    private _buildGoldDisplay() {
        const n = new Node('Gold'); n.setParent(this.node);
        n.setPosition(new Vec3(0, 235, 0));
        n.addComponent(UITransform).setContentSize(200, 30);
        this._goldLabel = n.addComponent(Label);
        this._goldLabel.fontSize = 20;
        this._goldLabel.color = new Color(255, 210, 50, 255);
        styleLabel(this._goldLabel);
    }

    private _buildItemArea() {
        // placeholder — items are created dynamically in _populate
    }

    private _buildLeaveBtn() {
        this._leaveBtn = new Node('LeaveBtn'); this._leaveBtn.setParent(this.node);
        this._leaveBtn.setPosition(new Vec3(0, -295, 0));
        this._leaveBtn.addComponent(UITransform).setContentSize(160, 40);
        applyHexButtonSkin(this._leaveBtn, 160, 40, new Color(95, 145, 175, 255));
        const ln = new Node('L'); ln.setParent(this._leaveBtn);
        ln.addComponent(UITransform).setContentSize(160, 40);
        const lbl = ln.addComponent(Label);
        lbl.string = '离开'; lbl.fontSize = 18;
        lbl.color = new Color(180, 180, 220, 220);
        styleLabel(lbl);
        this._leaveBtn.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this.hide(); this._leaveFn?.();
        }, this);
    }

    // ── populate ──────────────────────────────────────────────

    private _populate(items: ShopItem[]) {
        // destroy old item nodes
        for (const n of this._itemNodes) n.destroy();
        this._itemNodes = [];
        this._rowStates = [];

        const startY = 160;
        const rowH   = 72;
        items.forEach((item, i) => {
            const row = this._mkItemRow(item, 0, startY - i * rowH);
            this._itemNodes.push(row);
        });
    }

    private _mkItemRow(item: ShopItem, x: number, y: number): Node {
        const row = new Node(`Item_${item.id}`);
        row.setParent(this.node);
        row.setPosition(new Vec3(x, y, 0));
        row.addComponent(UITransform).setContentSize(560, 60);

        // 行底板在重新激活商店时重画，避免从二级强化页返回后丢失。
        const bg = row.addComponent(Graphics);
        const drawRow = () => {
            bg.clear();
            drawHexPanel(bg, -280, -30, 560, 60, UI_PALETTE.cyan, 248);
        };
        drawRow();
        attachEnableRedraw(row, drawRow);

        // item name
        const nameN = new Node('N'); nameN.setParent(row);
        nameN.setPosition(new Vec3(-110, 14, 0));
        nameN.addComponent(UITransform).setContentSize(300, 22);
        const nameLbl = nameN.addComponent(Label);
        nameLbl.string = item.name; nameLbl.fontSize = 17;
        nameLbl.lineHeight = 21;
        nameLbl.horizontalAlign = HorizontalTextAlignment.LEFT;
        nameLbl.overflow = Label.Overflow.SHRINK;
        nameLbl.color = UI_PALETTE.text;
        styleLabel(nameLbl);

        // desc
        const descN = new Node('D'); descN.setParent(row);
        descN.setPosition(new Vec3(-110, -14, 0));
        descN.addComponent(UITransform).setContentSize(300, 26);
        const descLbl = descN.addComponent(Label);
        descLbl.string = item.desc ?? ''; descLbl.fontSize = 16;
        descLbl.lineHeight = 20;
        descLbl.horizontalAlign = HorizontalTextAlignment.LEFT;
        descLbl.overflow = Label.Overflow.CLAMP;
        descLbl.enableWrapText = false;
        descLbl.color = UI_PALETTE.muted;
        styleLabel(descLbl, { outlineWidth: 1 });

        // price
        const priceN = new Node('P'); priceN.setParent(row);
        priceN.setPosition(new Vec3(130, 0, 0));
        priceN.addComponent(UITransform).setContentSize(100, 30);
        const priceLbl = priceN.addComponent(Label);
        priceLbl.string = `⬡ ${item.cost}`; priceLbl.fontSize = 16;
        priceLbl.color = new Color(255, 210, 50, 255);
        styleLabel(priceLbl);

        // buy button
        const btn = new Node('Buy'); btn.setParent(row);
        btn.setPosition(new Vec3(220, 0, 0));
        btn.addComponent(UITransform).setContentSize(100, 36);
        const btnSkin = applyHexButtonSkin(btn, 100, 36, new Color(55, 205, 105, 255));
        const btnLN = new Node('L'); btnLN.setParent(btn);
        btnLN.addComponent(UITransform).setContentSize(100, 36);
        const btnLbl = btnLN.addComponent(Label);
        btnLbl.string = '购买'; btnLbl.fontSize = 14;
        btnLbl.lineHeight = 20;
        btnLbl.overflow = Label.Overflow.CLAMP;
        btnLbl.enableWrapText = false;
        btnLbl.color = new Color(200, 255, 200, 255);
        styleLabel(btnLbl);
        const state = { item, skin: btnSkin, label: btnLbl, sold: false };
        this._rowStates.push(state);

        btn.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            if (state.sold || this._currentGold < item.cost || !this._spendFn) return;
            const ok = this._spendFn(item.cost, item);
            if (ok) {
                this.onBuySfx?.();
                state.sold = true;
                this._refreshAffordability();
            }
        }, this);

        return row;
    }

    private _refreshAffordability(): void {
        for (const row of this._rowStates) {
            const affordable = !row.sold && this._currentGold >= row.item.cost;
            row.skin.setDisabled(!affordable);
            row.label.string = row.sold ? '已售出' : affordable ? '购买' : '金币不足';
            row.label.color = row.sold
                ? new Color(155, 168, 180, 255)
                : affordable ? new Color(215, 255, 226, 255) : UI_PALETTE.muted;
            row.label.fontSize = 14;
        }
    }
}
