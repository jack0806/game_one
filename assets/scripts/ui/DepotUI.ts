// 军需商店 / 仓库（原装备库）/ 兑换台共用全屏终端；真实存档驱动，插画不烧录文字或状态。
import { BlockInputEvents, Color, Graphics, Label, Node, Sprite, UITransform } from 'cc';
import { applyArtSprite } from '../core/SpriteUtils';
import { visibleDesignWidth, visibleDesignHeight } from '../core/ScreenFit';
import { attachEnableRedraw, registerKeyboardModalScope } from '../core/UIStyle';
import { Rng } from '../core/MathUtils';
import {
    DEPOT_COLORS as C, depotBadge, depotControl, depotItemArt, depotDropArt, depotLabel,
    depotNode, depotPlate,
} from '../core/DepotStyle';
import {
    DEPOT_PRODUCTS, DepotProduct, EQUIPMENT_TILES, depotBoxAvailable,
    depotEquipmentName, depotEquipmentStat, depotInventory,
} from '../data/DepotCatalog';
import { Equipment, EQUIP_AFFIXES, EQUIP_QUALITY_LABEL, equipmentSellValue, rollEquipmentDrop } from '../data/EquipmentDB';
import { MATERIALS, RECIPES, RecipeDef, recipeConsume, recipeCostMet } from '../data/DropDB';
import { globalChapter } from '../data/LevelIndex';
import { GameConfig } from '../data/GameConfig';
import { DROP_VISUALS, DropCategory, recipeVisualId } from '../data/DropVisualDB';
import { SaveSystem } from '../systems/SaveSystem';

type DepotPage = 'armory' | 'shop' | 'exchange' | 'catalog';

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
    private _dropCategory: DropCategory = '材料';
    private _dropPage = 0;
    private _dropSelected = '';

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
        // v3：装备库更名「仓库」，页签在 仓库 → 军需商店 → 兑换台 之间循环
        const pageTitles: Record<DepotPage, string> = { armory: '仓库', shop: '军需商店', exchange: '兑换台', catalog: '掉落图鉴' };
        const pageOrder: DepotPage[] = ['armory', 'shop', 'exchange', 'catalog'];
        const pageNext: Record<DepotPage, string> = { armory: '军需商店', shop: '兑换台', exchange: '掉落图鉴', catalog: '仓库' };
        depotLabel(body, pageTitles[this._page], -32, 312, 310, 55, 38);
        this._button(body, 'DepotSwitch', pageNext[this._page], 138, 307, 125, 40,
            () => this.show(pageOrder[(pageOrder.indexOf(this._page) + 1) % pageOrder.length]), C.border, { size: 18 });
        if (this._page !== 'catalog' && this._page !== 'exchange') this._button(body, 'DropCatalog', '掉落图鉴', 268, 307, 116, 40,
            () => this.show('catalog'), C.border, { size: 17 });
        const pageHints: Record<DepotPage, string> = {
            armory: '跨局装备 · 最多携带 3 件出战',
            shop: '核心币购买 · 装备入仓 · 战备下局生效',
            exchange: '材料出售与配方兑换 · 全部使用核心币',
            catalog: '收集战利品 · 查阅用途与持有状态',
        };
        depotLabel(body, pageHints[this._page], 0, 269, 650, 28, 18, C.cyan);
        const wallet = depotPlate(body, 'CoreWallet', 472, 307, 226, 44, C.border);
        this._coin(wallet, -91, 0, 14);
        depotLabel(wallet, '核心币', -38, 0, 72, 35, 19);
        this._balance = depotLabel(wallet, (SaveSystem.coreCoins()).toLocaleString('en-US'), 60, 0, 90, 36, 23, new Color(210, 170, 255));
        if (this._page === 'armory') this._renderArmory(body);
        else if (this._page === 'shop') this._renderShop(body);
        else if (this._page === 'exchange') this._renderExchange(body);
        else this._renderDropCatalog(body);
        if (this._notice) depotLabel(body, this._notice, 0, -322, 1040, 27, 16, this._noticeColor);
    }

    /** 商品实付价：v3「军械库钥匙」（图5 Boss 专属被动）装备箱 -20%。 */
    private _productPrice(product: DepotProduct): number {
        return product.id === 'box' && SaveSystem.hasBossUnique('xblade_key')
            ? Math.round(product.price * 0.8) : product.price;
    }

    private _coin(parent: Node, x: number, y: number, radius: number): void {
        depotDropArt(parent, 'core_coin', x, y, radius * 2 + 4);
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

        const warehouse = this._section(body, 'WarehousePanel', `装备仓库  ${items.length}/${EQUIP_AFFIXES.length * 3}`, -195, -132, 772, 326);
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
        // v3「装配线铭牌」（图2 Boss 专属被动）：装备卖出价 +20%
        const sellMult = SaveSystem.hasBossUnique('forge_plate') ? 1.2 : 1;
        const price = Math.max(1, Math.round(equipmentSellValue(eq.quality) * GameConfig.get('equipSellRate') * sellMult));
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
        // v3「熔火核心」充能：仓库内重铸当前选中装备的词缀（品质保留）
        const reforgeLeft = SaveSystem.materialCount('core_reforge');
        if (reforgeLeft > 0) {
            this._button(detail, 'ReforgeAction', `熔火重铸（剩 ${reforgeLeft}）`, 0, -190, 210, 34, () => {
                if (!SaveSystem.consumeMaterial('core_reforge', 1)) { this._render(); return; }
                const next = SaveSystem.rerollEquipment(eq.uid);
                this._clearAction();
                this._notice = next ? `重铸完成：${EQUIP_QUALITY_LABEL[next.quality]}·${depotEquipmentName(next)}` : '重铸失败：装备不存在';
                this._noticeColor = next ? C.cyan : C.danger;
                this._render();
            }, C.gold, { size: 15 });
        }
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
            depotLabel(card, `${this._productPrice(product)} 核心币`, 72, -49, 193, 30, 20, C.gold);
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
        const price = this._productPrice(product);
        const available = product.id !== 'box' || depotBoxAvailable(SaveSystem.load().equipments ?? [], SaveSystem.unlockedChapterCount());
        depotLabel(detail, !available ? '当前进度可购装备已集齐' : coins < price ? '核心币不足' : product.id === 'box' ? '购买后自动入仓' : '可重复购买 · 累加至战备',
            0, -177, 330, 29, 17, !available || coins < price ? C.gold : C.cyan);
        this._button(detail, 'PurchaseAction', !available ? '当前装备已集齐' : coins < price ? `核心币不足 · 需要 ${price}` : `购买  ${price} 核心币`,
            0, -232, 338, 54, () => this._buyProduct(product), C.cyan,
            { disabled: !available || coins < price, size: 23 });
    }

    private _buyProduct(product: DepotProduct): void {
        // 点击时重新验货与验资，避免旧控件状态扣款后无法发货。
        const profile = SaveSystem.load();
        let equipment: Equipment | null = null;
        if (product.id === 'box') {
            equipment = rollEquipmentDrop(SaveSystem.unlockedChapterCount(),
                new Set((profile.equipments ?? []).map(e => `${e.affix}:${e.quality}`)), () => Rng.float(0, 1),
                SaveSystem.hasBossUnique('xblade_mod'));
            if (!equipment) { this._render(); return; }
        }
        if (!SaveSystem.spendCoreCoins(this._productPrice(product))) { this._render(); return; }
        if (equipment) SaveSystem.addEquipment(equipment);
        else if (product.id === 'gold') SaveSystem.addShopSupply(150, 0, 0);
        else if (product.id === 'draws') SaveSystem.addShopSupply(0, 3, 0);
        else SaveSystem.addShopSupply(0, 0, 60);
        this._notice = equipment ? `获得 ${EQUIP_QUALITY_LABEL[equipment.quality]}·${depotEquipmentName(equipment)}，已存入仓库` : `${product.name}已购买，下局开局生效`;
        this._noticeColor = C.cyan;
        this._render();
    }

    // ── v3 兑换台：材料出售 + 配方兑换（全部核心币结算） ──────────

    private _renderExchange(body: Node): void {
        const profile = SaveSystem.load();
        const materials = profile.materials ?? {};
        // 左侧：材料仓库（12 种网格，点击出售 1 件；顶右一键出售）
        const panel = this._section(body, 'MaterialPanel', '材料仓库 · 点击出售（得核心币）', -195, 48, 772, 368);
        this._button(panel, 'SellAllMats', '一键出售全部', 286, 158, 164, 34, () => {
            const coins = SaveSystem.sellAllMaterials();
            this._clearAction();
            this._notice = coins > 0 ? `材料全部售出 · 获得 ${coins} 核心币` : '没有可出售的材料';
            this._noticeColor = coins > 0 ? C.gold : C.danger;
            this._render();
        }, C.gold, { size: 17 });
        MATERIALS.forEach((mat, i) => {
            const x = -304 + (i % 5) * 152, y = 90 - Math.floor(i / 5) * 106;
            const count = materials[mat.id] ?? 0;
            const tile = this._button(panel, `Mat_${mat.id}`, '', x, y, 140, 92, () => {
                const coins = SaveSystem.sellMaterial(mat.id, 1);
                this._clearAction();
                this._notice = coins > 0 ? `售出 ${mat.name} ×1 · 获得 ${coins} 核心币` : `${mat.name} 库存不足`;
                this._noticeColor = coins > 0 ? C.gold : C.danger;
                this._render();
            }, count > 0 ? C.cyan : C.border, { disabled: count <= 0, size: 15 });
            depotLabel(tile, mat.name, 0, 30, 132, 24, 15, count > 0 ? C.text : C.muted);
            depotDropArt(tile, mat.id, -37, -4, 44);
            depotLabel(tile, `×${count}`, 31, -6, 62, 30, 22, count > 0 ? C.cyan : C.muted, true);
            depotLabel(tile, `售 ${mat.sell}`, 31, -33, 62, 20, 13, C.gold);
        });
        // 左下：消耗型充能一览（Boss 专属的"下局生效"库存）
        const charges = [
            ['不屈徽记·复活', 'core_revive'], ['无限核·免费刷新', 'core_refresh'],
            ['混沌棱镜·彩卡', 'core_prism'], ['熔火核心·重铸', 'core_reforge'],
            ['元素瓶', 'core_element'], ['暗影斗篷·隐身', 'core_stealth'],
        ] as const;
        const chargePanel = this._section(body, 'ChargePanel', '功能物品 · 充能', -195, -219, 772, 130);
        charges.forEach(([label, id], i) => {
            const x = -322 + (i % 6) * 128;
            depotLabel(chargePanel, label, x, 20, 124, 24, 13, C.muted);
            depotDropArt(chargePanel, id, x - 26, -18, 38);
            depotLabel(chargePanel, `×${SaveSystem.materialCount(id)}`, x + 22, -18, 52, 34, 22,
                SaveSystem.materialCount(id) > 0 ? C.gold : C.border, true);
        });
        // 右侧：兑换台配方
        const bench = this._section(body, 'ExchangeBench', '兑换台 · 配方', 390, -26, 374, 516);
        const recipes = RECIPES.filter(r => r.id !== 'r_sellall');
        recipes.forEach((recipe, i) => {
            const ok = recipeCostMet(recipe, materials) && SaveSystem.coreCoins() >= recipe.coins;
            const button = this._button(bench, `Recipe_${recipe.id}`, '', 0, 172 - i * 61, 340, 54, () => {
                this._craftRecipe(recipe);
            }, ok ? C.cyan : C.border, { disabled: !ok, size: 18 });
            depotDropArt(button, recipeVisualId(recipe.id), -137, 0, 44);
            depotLabel(button, recipe.name, 18, 10, 225, 26, 18, ok ? C.text : C.muted);
            depotLabel(button, `手续费 ${recipe.coins} 核心币`, 18, -14, 225, 22, 13, C.muted);
        });
        depotLabel(bench, '材料 + 核心币 · 产出自动入仓',
            0, -239, 350, 24, 14, C.muted);
    }

    /** 独立陈列所有实际身份；不修改任何掉率、收藏状态或存档。 */
    private _renderDropCatalog(body: Node): void {
        const categories: DropCategory[] = ['材料', '战术道具', '首领专属', '装备', '收藏', '充能', '货币', '战备'];
        categories.forEach((category, i) => this._button(body, `DropFilter_${i}`, category,
            -501 + i * 143, 220, 134, 38, () => {
                this._dropCategory = category; this._dropPage = 0; this._dropSelected = ''; this._render();
            }, C.cyan, { selected: this._dropCategory === category, size: 17 }));
        const items = DROP_VISUALS.filter(v => v.category === this._dropCategory);
        const pages = Math.max(1, Math.ceil(items.length / 12));
        this._dropPage = Math.max(0, Math.min(pages - 1, this._dropPage));
        const visible = items.slice(this._dropPage * 12, this._dropPage * 12 + 12);
        const selected = visible.find(v => v.id === this._dropSelected) ?? visible[0];
        const grid = depotPlate(body, 'DropCatalogGrid', -195, -49, 772, 476);
        visible.forEach((v, i) => {
            const x = -280 + (i % 4) * 186, y = 152 - Math.floor(i / 4) * 138;
            const card = this._button(grid, `DropEntry_${v.id}`, '', x, y, 174, 128, () => {
                this._dropSelected = v.id; this._render();
            }, Color.fromHEX(new Color(), v.accent), { selected: selected?.id === v.id });
            depotDropArt(card, v.id, 0, 13, 86);
            depotLabel(card, v.name, 0, -45, 162, 28, 17);
        });
        this._button(grid, 'DropPrev', '上一页', -220, -211, 126, 34, () => {
            this._dropPage--; this._dropSelected = ''; this._render();
        }, C.border, { disabled: this._dropPage <= 0, size: 16 });
        depotLabel(grid, `${this._dropPage + 1} / ${pages} · ${items.length} 件`, 0, -211, 220, 30, 17, C.muted);
        this._button(grid, 'DropNext', '下一页', 220, -211, 126, 34, () => {
            this._dropPage++; this._dropSelected = ''; this._render();
        }, C.border, { disabled: this._dropPage >= pages - 1, size: 16 });
        if (!selected) return;
        const detail = depotPlate(body, 'DropCatalogDetail', 390, -49, 374, 476);
        depotDropArt(detail, selected.id, 0, 118, 192);
        depotLabel(detail, selected.name, 0, -4, 342, 38, 26);
        const p = SaveSystem.load();
        let status: string = selected.category;
        if (selected.category === '首领专属') status = (SaveSystem.hasBossUnique(selected.id) ? '已收藏 · ' : '未获得 · ') + '首领专属';
        else if (selected.id === 'cloak_shard') status = `碎片 ×${p.relics?.cloak_shard ?? 0} · 5 片合成斗篷`;
        else if (selected.category === '材料' || selected.category === '充能') status = `库存 ×${SaveSystem.materialCount(selected.id)}`;
        else if (selected.id === 'amber_bug') status = `收藏 ×${p.relics?.amber_bug ?? 0}`;
        else if (selected.id === 'joker_doll') status = `收藏 ×${p.jokerDolls ?? 0}`;
        depotLabel(detail, status, 0, -48, 336, 28, 17, Color.fromHEX(new Color(), selected.accent));
        const desc = depotLabel(detail, selected.desc, 0, -116, 318, 98, 18, C.text, true);
        desc.enableWrapText = true; desc.lineHeight = 27;
        depotLabel(detail, selected.category === '首领专属' ? '首领专属不可出售' : selected.category === '战术道具' ? '拾取即生效 · 不占背包格' : selected.category === '材料' ? '前往兑换台出售或合成' : '收集与使用，强化下一次行动', 0, -208, 342, 28, 14, C.muted);
    }

    private _craftRecipe(recipe: RecipeDef): void {
        const profile = SaveSystem.load();
        const materials = profile.materials ?? {};
        if (!recipeCostMet(recipe, materials)) { this._render(); return; }
        if (recipe.coins > 0 && !SaveSystem.spendCoreCoins(recipe.coins)) {
            this._notice = '核心币手续费不足'; this._noticeColor = C.danger; this._render(); return;
        }
        if (!recipeConsume(recipe, materials)) { this._render(); return; }
        SaveSystem.save();
        const owned = new Set((profile.equipments ?? []).map(e => `${e.affix}:${e.quality}`));
        const allowHaste = SaveSystem.hasBossUnique('xblade_mod');
        switch (recipe.produce.kind) {
            case 'equipment': {
                // 图域锻造按所耗材料的图定品质档；星陨锻造固定史诗档（优先未拥有）
                const chapter = recipe.id === 'r_star'
                    ? Math.max(SaveSystem.unlockedChapterCount(), globalChapter(4, 1))
                    : SaveSystem.unlockedChapterCount();
                const equip = rollEquipmentDrop(chapter, owned, () => Rng.float(0, 1), allowHaste);
                if (equip) {
                    SaveSystem.addEquipment(equip);
                    this._notice = `锻造获得 ${EQUIP_QUALITY_LABEL[equip.quality]}·${depotEquipmentName(equip)}`;
                } else {
                    SaveSystem.addCoreCoins(40);
                    this._notice = '装备图鉴已集齐 → 核心币 ×40';
                }
                this._noticeColor = C.cyan;
                break;
            }
            case 'reforge':
                SaveSystem.addMaterial('core_reforge', 1);
                this._notice = '获得重铸充能 ×1（到仓库装备详情使用）';
                this._noticeColor = C.cyan;
                break;
            case 'elementBottle':
                SaveSystem.addMaterial('core_element', 1);
                this._notice = '获得元素瓶 ×1（下局开局随机元素附武 60 秒）';
                this._noticeColor = C.cyan;
                break;
            case 'box': {
                const equip = rollEquipmentDrop(SaveSystem.unlockedChapterCount(), owned, () => Rng.float(0, 1), allowHaste);
                if (equip) {
                    SaveSystem.addEquipment(equip);
                    this._notice = `整备获得 ${EQUIP_QUALITY_LABEL[equip.quality]}·${depotEquipmentName(equip)}`;
                } else {
                    SaveSystem.addCoreCoins(40);
                    this._notice = '装备图鉴已集齐 → 核心币 ×40';
                }
                this._noticeColor = C.cyan;
                break;
            }
            case 'prism':
                SaveSystem.addMaterial('core_prism', 1);
                this._notice = '获得混沌棱镜充能 ×1（下局商店首开必出彩卡）';
                this._noticeColor = C.cyan;
                break;
            case 'coins':
                SaveSystem.addCoreCoins(recipe.produce.coins ?? 0);
                this._notice = `献礼完成 · 核心币 +${recipe.produce.coins ?? 0}`;
                this._noticeColor = C.gold;
                break;
        }
        this._render();
    }
}
