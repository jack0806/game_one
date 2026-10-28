// 军需商店 / 装备库共用全屏终端；真实存档驱动，插画不烧录文字或状态。
import { BlockInputEvents, Color, Graphics, Label, Node, Sprite, UITransform } from 'cc';
import { applyArtSprite } from '../core/SpriteUtils';
import { visibleDesignWidth, visibleDesignHeight } from '../core/ScreenFit';
import { attachEnableRedraw, registerKeyboardModalScope } from '../core/UIStyle';
import { Rng } from '../core/MathUtils';
import {
    DEPOT_COLORS as C, depotBadge, depotControl, depotItemArt, depotLabel,
    depotNode, depotPlate,
} from '../core/DepotStyle';
import {
    DEPOT_PRODUCTS, DepotProduct, EQUIPMENT_TILES, depotBoxAvailable,
    depotEquipmentName, depotEquipmentStat, depotInventory,
} from '../data/DepotCatalog';
import { Equipment, EQUIP_QUALITY_LABEL, equipmentSellValue, rollEquipmentDrop } from '../data/EquipmentDB';
import { GameConfig } from '../data/GameConfig';
import { SaveSystem } from '../systems/SaveSystem';

type DepotPage = 'armory' | 'shop';

export class DepotUI {
    readonly node: Node;
    private _canvas: Node;
    private _background: Node;
    private _body?: Node;
    private _page: DepotPage = 'armory';
    private _selectedUid = '';
    private _productId: DepotProduct['id'] = 'box';
    private _quality = -1;
    private _inventoryPage = 0;
    private _confirmSale = '';
    private _choosingSlot = false;
    private _notice = '';
    private _noticeColor = C.cyan;
    private _balance!: Label;

    constructor(parent: Node, private readonly _onSfx: () => void) {
        this.node = depotNode(parent, 'Depot', 0, 0, 1280, 720);
        this.node.addComponent(BlockInputEvents);
        registerKeyboardModalScope(this.node);
        const dim = this.node.addComponent(Graphics);
        const draw = () => {
            dim.clear(); dim.fillColor = new Color(4, 14, 26);
            dim.fillRect(-visibleDesignWidth() / 2, -visibleDesignHeight() / 2, visibleDesignWidth(), visibleDesignHeight());
        };
        draw(); attachEnableRedraw(this.node, draw);
        this._canvas = depotNode(this.node, 'DepotCanvas', 0, 0, 1280, 720);
        this._background = depotNode(this._canvas, 'DepotBackdrop', 0, 0, 1280, 720);
        applyArtSprite(this._background.addComponent(Sprite), 'ui_depot_background');
        this.node.active = false;
    }

    show(page: DepotPage): void {
        this._page = page;
        this._confirmSale = ''; this._choosingSlot = false; this._notice = '';
        this._quality = -1; this._inventoryPage = 0;
        this.node.active = true;
        this.fitToVisible(); this._render();
    }

    hide(): void {
        this.node.active = false;
        this._confirmSale = ''; this._choosingSlot = false;
    }

    fitToVisible(): void {
        const width = visibleDesignWidth(), height = visibleDesignHeight();
        this.node.getComponent(UITransform)!.setContentSize(width, height);
        // 宽屏延展仓库背景，中心内容保持 1280×720，避免拉宽道具与按钮。
        this._background.getComponent(UITransform)!.setContentSize(width, height);
        const dim = this.node.getComponent(Graphics)!;
        dim.clear(); dim.fillColor = new Color(4, 14, 26);
        dim.fillRect(-width / 2, -height / 2, width, height);
    }

    private _button(parent: Node, name: string, text: string, x: number, y: number, w: number, h: number,
                    action: () => void, accent = C.cyan,
                    options: { selected?: boolean; disabled?: boolean; size?: number } = {}): Node {
        return depotControl(parent, name, text, x, y, w, h, () => { this._onSfx(); action(); }, accent, options);
    }

    private _render(): void {
        if (this._body) { this._body.removeFromParent(); this._body.destroy(); }
        this._body = depotNode(this._canvas, 'DepotContent', 0, 0, 1280, 720);
        const body = this._body;
        this._button(body, 'DepotBack', '‹  返回大厅', -493, 307, 172, 44, () => this.hide(), C.border, { size: 20 });
        depotLabel(body, this._page === 'armory' ? '装备库' : '军需商店', -32, 312, 310, 55, 38);
        this._button(body, 'DepotSwitch', this._page === 'armory' ? '军需商店' : '装备库', 138, 307, 125, 40,
            () => this.show(this._page === 'armory' ? 'shop' : 'armory'), C.border, { size: 18 });
        depotLabel(body, this._page === 'armory' ? '跨局装备 · 最多携带 3 件出战' : '核心币购买 · 装备入仓 · 战备下局生效',
            0, 269, 650, 28, 18, C.cyan);
        const wallet = depotPlate(body, 'CoreWallet', 472, 307, 226, 44, C.border);
        this._coin(wallet, -91, 0, 14);
        depotLabel(wallet, '核心币', -38, 0, 72, 35, 19);
        this._balance = depotLabel(wallet, (SaveSystem.coreCoins()).toLocaleString('en-US'), 60, 0, 90, 36, 23, C.gold);
        if (this._page === 'armory') this._renderArmory(body);
        else this._renderShop(body);
        if (this._notice) depotLabel(body, this._notice, 0, -322, 1040, 27, 16, this._noticeColor);
    }

    private _coin(parent: Node, x: number, y: number, radius: number): void {
        const node = depotNode(parent, 'CoreCoin', x, y, radius * 2, radius * 2);
        const g = node.addComponent(Graphics);
        const hex = (r: number) => {
            for (let i = 0; i < 6; i++) {
                const a = (i * 60 + 30) * Math.PI / 180;
                if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            g.close();
        };
        const draw = () => {
            g.clear(); g.fillColor = new Color(73, 39, 5); hex(radius + 2); g.fill();
            g.fillColor = C.gold; hex(radius); g.fill();
            g.fillColor = new Color(232, 151, 24); hex(radius * 0.72); g.fill();
            g.strokeColor = new Color(255, 235, 146); g.lineWidth = 1; hex(radius * 0.72); g.stroke();
        };
        draw(); attachEnableRedraw(node, draw);
    }

    private _section(parent: Node, name: string, title: string, x: number, y: number, w: number, h: number): Node {
        const panel = depotPlate(parent, name, x, y, w, h);
        depotLabel(panel, '▎', -w / 2 + 18, h / 2 - 24, 10, 27, 25, C.cyan);
        depotLabel(panel, title, -w / 2 + 181, h / 2 - 25, 314, 34, 24, C.text, true);
        return panel;
    }

    private _renderArmory(body: Node): void {
        const profile = SaveSystem.load();
        const items: Equipment[] = profile.equipments ?? [];
        const loadout = profile.equipLoadout ?? [null, null, null];
        const byUid = new Map(items.map(e => [e.uid, e]));
        const equipped = new Set(loadout.filter(uid => byUid.has(uid)));
        const slots = this._section(body, 'LoadoutPanel', `出战配装  ${equipped.size}/3`, -195, 141, 772, 202);
        for (let i = 0; i < 3; i++) {
            const eq = byUid.get(loadout[i]);
            const slot = depotPlate(slots, `LoadoutSlot${i}`, -253 + i * 253, -18, 240, 140,
                eq ? C.qualities[eq.quality] ?? C.border : C.border);
            if (eq) {
                depotItemArt(slot, EQUIPMENT_TILES[eq.affix] ?? 0, -67, 6, 100);
                depotBadge(slot, EQUIP_QUALITY_LABEL[eq.quality], 11, 47, 42, C.qualities[eq.quality] ?? C.border);
                depotBadge(slot, '已出战', 77, 47, 59, C.cyan);
                depotLabel(slot, depotEquipmentName(eq), 49, 15, 127, 30, 19);
                depotLabel(slot, depotEquipmentStat(eq), 49, -12, 127, 24, 16, C.cyan);
                this._button(slot, `Unequip${i}`, '卸下', 49, -46, 120, 32, () => {
                    SaveSystem.setEquipSlot(i, null); this._clearAction(); this._render();
                }, C.border, { size: 16 });
            } else {
                depotLabel(slot, `0${i + 1}`, -73, 7, 64, 70, 35, C.border);
                depotLabel(slot, '空出战槽', 35, 14, 135, 27, 19, C.muted);
                depotLabel(slot, '在下方选择装备', 35, -18, 140, 25, 14, C.muted);
            }
        }

        const warehouse = this._section(body, 'WarehousePanel', `装备仓库  ${items.length}/15`, -195, -132, 772, 326);
        const filters = ['全部', '普通', '稀有', '史诗'];
        filters.forEach((label, index) => {
            const quality = index - 1;
            this._button(warehouse, `QualityFilter${quality}`, label, 68 + index * 86, 137, 78, 30, () => {
                this._quality = quality; this._inventoryPage = 0; this._clearAction(); this._render();
            }, index ? C.qualities[index - 1] : C.cyan, { selected: this._quality === quality, size: 15 });
        });
        const filtered = depotInventory(items, this._quality);
        const pages = Math.max(1, Math.ceil(filtered.length / 10));
        this._inventoryPage = Math.max(0, Math.min(pages - 1, this._inventoryPage));
        const shown = filtered.slice(this._inventoryPage * 10, this._inventoryPage * 10 + 10);
        if (!shown.some(e => e.uid === this._selectedUid)) this._selectedUid = shown[0]?.uid ?? '';
        for (let i = 0; i < 10; i++) {
            const x = -301 + (i % 5) * 150.5, y = 53 - Math.floor(i / 5) * 133;
            const eq = shown[i];
            if (!eq) {
                const empty = depotPlate(warehouse, `EmptyInventory${i}`, x, y, 143, 125, new Color(47, 71, 90));
                depotLabel(empty, '—', 0, 0, 80, 28, 20, new Color(62, 89, 111));
                continue;
            }
            const card = this._button(warehouse, `Equipment_${eq.uid}`, '', x, y, 143, 125, () => {
                this._selectedUid = eq.uid; this._clearAction(); this._render();
            }, C.qualities[eq.quality] ?? C.border, { selected: this._selectedUid === eq.uid });
            depotItemArt(card, EQUIPMENT_TILES[eq.affix] ?? 0, 0, 15, 90);
            depotBadge(card, EQUIP_QUALITY_LABEL[eq.quality], -45, 47, 43, C.qualities[eq.quality] ?? C.border);
            if (equipped.has(eq.uid)) depotBadge(card, '已出战', 37, 47, 58, C.cyan);
            depotLabel(card, depotEquipmentName(eq), 0, -30, 132, 24, 16);
            depotLabel(card, depotEquipmentStat(eq), 0, -50, 132, 20, 14, C.cyan);
        }
        if (!filtered.length) {
            const cover = depotPlate(warehouse, 'EmptyWarehouse', 0, -13, 748, 242, C.border);
            depotLabel(cover, items.length ? '暂无该品质装备' : '仓库暂无装备', 0, 36, 600, 36, 24);
            depotLabel(cover, items.length ? '切换上方筛选查看其他装备' : '击败章节首领，或在军需商店购买装备箱', 0, -8, 660, 32, 17, C.muted);
            if (!items.length) this._button(cover, 'EmptyShopLink', '前往军需商店', 0, -65, 214, 42, () => this.show('shop'));
        }
        if (pages > 1) {
            this._button(warehouse, 'InventoryPrev', '‹', 225, -149, 36, 24, () => this._turnPage(-1), C.border,
                { disabled: this._inventoryPage === 0, size: 18 });
            depotLabel(warehouse, `${this._inventoryPage + 1} / ${pages}`, 284, -149, 65, 23, 14, C.muted);
            this._button(warehouse, 'InventoryNext', '›', 344, -149, 36, 24, () => this._turnPage(1), C.border,
                { disabled: this._inventoryPage >= pages - 1, size: 18 });
        }
        this._renderEquipmentDetail(body, byUid.get(this._selectedUid));
    }

    private _turnPage(direction: number): void {
        this._inventoryPage += direction; this._clearAction();
        const items = depotInventory(SaveSystem.load().equipments ?? [], this._quality);
        this._selectedUid = items[this._inventoryPage * 10]?.uid ?? '';
        this._render();
    }

    private _clearAction(): void {
        this._confirmSale = ''; this._choosingSlot = false; this._notice = '';
    }

    private _pedestal(parent: Node): void {
        const node = depotNode(parent, 'DisplayPedestal', 0, 4, 310, 46);
        const g = node.addComponent(Graphics);
        const draw = () => {
            g.clear();
            g.fillColor = new Color(3, 11, 20); g.ellipse(0, -6, 146, 22); g.fill();
            g.fillColor = new Color(53, 83, 104); g.ellipse(0, 0, 146, 20); g.fill();
            g.fillColor = new Color(13, 38, 58); g.ellipse(0, 2, 132, 15); g.fill();
            g.strokeColor = new Color(34, 205, 230, 170); g.lineWidth = 2; g.ellipse(0, 2, 123, 13); g.stroke();
            g.strokeColor = new Color(33, 175, 220, 75); g.lineWidth = 4; g.ellipse(0, 2, 92, 11); g.stroke();
        };
        draw(); attachEnableRedraw(node, draw);
    }

    private _renderEquipmentDetail(body: Node, eq?: Equipment): void {
        const detail = this._section(body, 'EquipmentDetail', '装备详情', 390, -26, 374, 538);
        if (!eq) {
            depotItemArt(detail, 0, 0, 63, 220);
            depotLabel(detail, '选择一件装备', 0, -93, 320, 42, 25);
            depotLabel(detail, '查看属性，配置出战装备', 0, -133, 320, 30, 17, C.muted);
            return;
        }
        const profile = SaveSystem.load();
        const slot = (profile.equipLoadout ?? []).indexOf(eq.uid);
        const price = Math.max(1, Math.round(equipmentSellValue(eq.quality) * GameConfig.get('equipSellRate')));
        depotBadge(detail, EQUIP_QUALITY_LABEL[eq.quality], 124, 242, 66, C.qualities[eq.quality] ?? C.border);
        this._pedestal(detail);
        depotItemArt(detail, EQUIPMENT_TILES[eq.affix] ?? 0, 0, 107, 283);
        depotLabel(detail, depotEquipmentName(eq), 0, -40, 330, 40, 29);
        depotLabel(detail, depotEquipmentStat(eq), 0, -77, 330, 36, 25, C.cyan);
        depotLabel(detail, '纯属性加成 · 跨局保留', 0, -112, 330, 29, 18, C.muted);
        depotLabel(detail, slot >= 0 ? `已装备于出战槽 0${slot + 1}` : '尚未加入出战配装', 0, -161, 330, 28, 18, slot >= 0 ? C.cyan : C.muted);
        if (this._choosingSlot) {
            depotLabel(detail, '选择替换槽位', -43, -198, 235, 25, 17, C.gold);
            this._button(detail, 'CancelReplacement', '取消', 124, -198, 80, 29, () => {
                this._choosingSlot = false; this._render();
            }, C.border, { size: 15 });
            for (let i = 0; i < 3; i++) {
                this._button(detail, `ReplaceSlot${i}`, `替换 0${i + 1}`, -113 + i * 113, -237, 105, 43, () => {
                    SaveSystem.setEquipSlot(i, eq.uid); this._clearAction(); this._render();
                }, C.cyan, { size: 16 });
            }
            return;
        }
        const full = (profile.equipLoadout ?? []).filter(uid => (profile.equipments ?? []).some(e => e.uid === uid)).length >= 3;
        this._button(detail, 'EquipAction', slot >= 0 ? '卸下装备' : full ? '选择替换槽位' : '装备出战', -87, -232, 166, 54, () => {
            this._clearAction();
            if (slot >= 0) SaveSystem.setEquipSlot(slot, null);
            else if (full) this._choosingSlot = true;
            else {
                const index = [0, 1, 2].find(i => !(profile.equipments ?? []).some(e => e.uid === profile.equipLoadout?.[i]));
                SaveSystem.setEquipSlot(index ?? 0, eq.uid);
            }
            this._render();
        }, C.cyan, { size: full && slot < 0 ? 18 : 21 });
        const sale = this._button(detail, 'SellAction', this._confirmSale === eq.uid ? '确认永久卖出' : '', 88, -232, 164, 54, () => {
            if (this._confirmSale !== eq.uid) {
                this._confirmSale = eq.uid; this._notice = '再次点击确认：卖出后该装备将永久移出仓库'; this._noticeColor = C.danger;
            } else {
                SaveSystem.removeEquipment(eq.uid); SaveSystem.addCoreCoins(price);
                this._clearAction(); this._notice = `已卖出 ${depotEquipmentName(eq)} · 获得 ${price} 核心币`; this._noticeColor = C.gold;
            }
            this._render();
        }, this._confirmSale === eq.uid ? C.danger : C.gold, { size: 18 });
        if (this._confirmSale !== eq.uid) {
            depotLabel(sale, '卖出', -43, 0, 64, 38, 21);
            this._coin(sale, 10, 1, 11);
            depotLabel(sale, String(price), 47, 5, 53, 30, 22, C.gold);
            depotLabel(sale, '核心币', 47, -16, 60, 18, 11, C.muted);
        }
    }

    private _renderShop(body: Node): void {
        const supply = SaveSystem.shopSupply();
        const supplies = this._section(body, 'PurchasedSupplies', '已购战备', -195, 181, 772, 122);
        depotLabel(supplies, '下一局开局生效', 245, 36, 250, 28, 15, C.muted);
        const columns = [{ tile: 6, label: `金币 +${supply.gold}` }, { tile: 7, label: `连抽 +${supply.draws}` }, { tile: 8, label: `护盾 +${supply.shield}` }];
        columns.forEach((item, i) => {
            depotItemArt(supplies, item.tile, -320 + i * 250, -12, 62);
            depotLabel(supplies, item.label, -211 + i * 250, -12, 180, 33, 21, C.cyan);
        });
        const catalog = this._section(body, 'ShopCatalog', '军需陈列', -195, -99, 772, 392);
        depotLabel(catalog, '选择商品查看详情', 245, 170, 250, 27, 15, C.muted);
        DEPOT_PRODUCTS.forEach((product, i) => {
            const card = this._button(catalog, `Product_${product.id}`, '', -187 + (i % 2) * 374, 65 - Math.floor(i / 2) * 166,
                360, 153, () => {
                    this._productId = product.id; this._notice = ''; this._render();
                }, C.border, { selected: this._productId === product.id });
            depotItemArt(card, product.tile, -100, -2, 137);
            depotBadge(card, product.id === 'box' ? '永久装备' : '下局生效', 91, 51, 100, product.id === 'box' ? C.cyan : C.gold);
            depotLabel(card, product.name, 72, 17, 193, 35, 23);
            depotLabel(card, product.id === 'box' ? '随机未拥有装备' : product.benefit.replace('海克斯三选一', ''), 72, -17, 191, 27, 15, C.muted);
            depotLabel(card, `⬡ ${product.price} 核心币`, 72, -49, 193, 30, 20, C.gold);
        });
        const product = DEPOT_PRODUCTS.find(p => p.id === this._productId)!;
        const detail = this._section(body, 'ProductDetail', '商品详情', 390, -26, 374, 538);
        depotBadge(detail, product.id === 'box' ? '永久装备' : '下局生效', 114, 242, 90, product.id === 'box' ? C.cyan : C.gold);
        this._pedestal(detail);
        depotItemArt(detail, product.tile, 0, 107, 283);
        depotLabel(detail, product.name, 0, -40, 330, 40, 29);
        depotLabel(detail, product.benefit, 0, -81, 334, 34, 21, C.cyan);
        depotLabel(detail, product.description, 0, -126, 333, 54, 17, C.muted);
        const coins = SaveSystem.coreCoins();
        const available = product.id !== 'box' || depotBoxAvailable(SaveSystem.load().equipments ?? [], SaveSystem.unlockedChapterCount());
        depotLabel(detail, !available ? '当前进度可购装备已集齐' : coins < product.price ? '核心币不足' : product.id === 'box' ? '购买后自动入仓' : '可重复购买 · 累加至战备',
            0, -177, 330, 29, 17, !available || coins < product.price ? C.gold : C.cyan);
        this._button(detail, 'PurchaseAction', !available ? '当前装备已集齐' : coins < product.price ? `核心币不足 · 需要 ${product.price}` : `购买  ⬡ ${product.price} 核心币`,
            0, -232, 338, 54, () => this._buyProduct(product), C.cyan,
            { disabled: !available || coins < product.price, size: 23 });
    }

    private _buyProduct(product: DepotProduct): void {
        // 点击时重新验货与验资，避免旧控件状态扣款后无法发货。
        const profile = SaveSystem.load();
        let equipment: Equipment | null = null;
        if (product.id === 'box') {
            equipment = rollEquipmentDrop(SaveSystem.unlockedChapterCount(),
                new Set((profile.equipments ?? []).map(e => `${e.affix}:${e.quality}`)), () => Rng.float(0, 1));
            if (!equipment) { this._render(); return; }
        }
        if (!SaveSystem.spendCoreCoins(product.price)) { this._render(); return; }
        if (equipment) SaveSystem.addEquipment(equipment);
        else if (product.id === 'gold') SaveSystem.addShopSupply(150, 0, 0);
        else if (product.id === 'draws') SaveSystem.addShopSupply(0, 3, 0);
        else SaveSystem.addShopSupply(0, 0, 60);
        this._notice = equipment ? `获得 ${EQUIP_QUALITY_LABEL[equipment.quality]}·${depotEquipmentName(equipment)}，已存入装备库` : `${product.name}已购买，下局开局生效`;
        this._noticeColor = C.cyan;
        this._render();
    }
}
