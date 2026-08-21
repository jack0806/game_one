import {
    _decorator, Component, Node, Label, Graphics,
    Color, Vec3, UITransform
} from 'cc';
import { Economy, ShopItem } from '../systems/Economy';
import { RARITY_COLOR } from '../core/Constants';
import { styleLabel } from '../core/LabelUtils';
import { applyHexButtonSkin } from '../core/UIStyle';

const { ccclass } = _decorator;

/**
 * ShopUI — shown at intermission / chapter clear.
 * Call show(items, gold, spendFn, leaveFn) to open.
 */
@ccclass('ShopUI')
export class ShopUI extends Component {
    private _itemNodes: Node[]    = [];
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
    }

    refreshGold(gold: number) {
        this._currentGold = gold;
        this._goldLabel.string = `⬡ ${gold}`;
    }

    hide() { this.node.active = false; }

    // ── builders ──────────────────────────────────────────────

    private _buildDimmer() {
        const n = new Node('Dimmer'); n.setParent(this.node);
        n.addComponent(UITransform).setContentSize(1280, 720);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 170);
        g.fillRect(-640, -360, 1280, 720);
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

        // background
        const bg = row.addComponent(Graphics);
        bg.fillColor = new Color(30, 30, 48, 200);
        bg.fillRect(-280, -30, 560, 60);
        bg.strokeColor = new Color(80, 80, 110, 180);
        bg.lineWidth = 1; bg.rect(-280, -30, 560, 60); bg.stroke();

        // item name
        const nameN = new Node('N'); nameN.setParent(row);
        nameN.setPosition(new Vec3(-130, 0, 0));
        nameN.addComponent(UITransform).setContentSize(260, 50);
        const nameLbl = nameN.addComponent(Label);
        nameLbl.string = item.name; nameLbl.fontSize = 15;
        nameLbl.color = new Color(220, 220, 220, 255);
        styleLabel(nameLbl);

        // desc
        const descN = new Node('D'); descN.setParent(row);
        descN.setPosition(new Vec3(-130, -16, 0));
        descN.addComponent(UITransform).setContentSize(260, 22);
        const descLbl = descN.addComponent(Label);
        descLbl.string = item.desc ?? ''; descLbl.fontSize = 11;
        descLbl.color = new Color(150, 150, 170, 200);
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
        btn.setPosition(new Vec3(230, 0, 0));
        btn.addComponent(UITransform).setContentSize(80, 36);
        const btnSkin = applyHexButtonSkin(btn, 80, 36, new Color(55, 205, 105, 255));
        const btnLN = new Node('L'); btnLN.setParent(btn);
        btnLN.addComponent(UITransform).setContentSize(80, 36);
        const btnLbl = btnLN.addComponent(Label);
        btnLbl.string = '购买'; btnLbl.fontSize = 14;
        btnLbl.color = new Color(200, 255, 200, 255);
        styleLabel(btnLbl);

        btn.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            if (!this._spendFn) return;
            const ok = this._spendFn(item.cost, item);
            if (ok) {
                this.onBuySfx?.();
                btnSkin.setDisabled(true);
                btnLbl.string = '已售出'; btnLbl.color = new Color(120, 120, 120, 180);
                btn.off(Node.EventType.TOUCH_END);
                this._goldLabel.string = `⬡ ${this._currentGold}`;
            }
        }, this);

        return row;
    }
}
