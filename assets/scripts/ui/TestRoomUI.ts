import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, BlockInputEvents,
    HorizontalTextAlignment, VerticalTextAlignment
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { applyHexButtonSkin } from '../core/UIStyle';
import { applyArtSprite } from '../core/SpriteUtils';
import { clamp } from '../core/MathUtils';
import { UNIT_CATALOG, UnitCategory } from '../data/BossDB';
import { CHARS } from '../data/CharacterDB';

const { ccclass } = _decorator;
const UNIT_PAGE_SIZE = 6;

/**
 * TestRoomUI — 测试房间底部工具条（常驻、非模态，仅 testRoom 状态激活）。
 * 行1：数量 −/+、玩家无敌、英雄选择、停火观摩、清场、返回主页、推进Boss阶段；
 * 行2：分类页签（首领/小boss/小兵）+ 单位卡（点卡即按数量生成）。
 * 英雄选择为工具条上的浮层（3×2 角色卡），点击即切换出战英雄。
 */
@ccclass('TestRoomUI')
export class TestRoomUI extends Component {
    // callbacks set by GameManager
    onSpawnUnit?:      (id: string, count: number) => void;
    onClear?:          () => void;
    onToggleInvincible?: (on: boolean) => void;
    onToggleCeasefire?:   (on: boolean) => void;
    onReturnMenu?:     () => void;
    onButtonSfx?:      () => void;
    onSelectHero?:     (charId: string) => void;
    /** 查询当前出战英雄（浮层高亮用）。 */
    onGetHero?:        () => string;
    onAdvanceBossPhase?: () => void;
    /** 轮换测试背景并返回新的1-based章节号。 */
    onCycleChapter?:   () => number;
    onToggleTargetPause?: (on: boolean) => void;

    private _category: UnitCategory = 'boss';
    private _count = 5;
    private _invincible = false;
    private _ceasefire = false;
    private _targetPaused = false;
    private _heroId = 'kai';
    private _unitPage = 0;
    private _countLbl!: Label;
    private _invLbl!: Label;
    private _ceasefireLbl!: Label;
    private _chapterLbl!: Label;
    private _targetPauseLbl!: Label;
    private _unitCards: Node[] = [];
    private _tabs: { g: Graphics; key: UnitCategory }[] = [];
    private _heroPanel!: Node;
    private _heroCards: { g: Graphics; id: string }[] = [];

    onLoad() {
        // 工具条固定在画布底部（local y=-312 覆盖底部 96px，避开顶部 HUD 区）
        this.node.setPosition(new Vec3(0, -312, 0));
        this._buildToolbar();
        this._buildHeroPanel();
        this.node.active = false;
    }

    /** 每次进入测试房间时复位工具条状态（无敌/数量/分类不跨房保留）。 */
    resetState() {
        this._invincible = false;
        this._ceasefire = false;
        this._targetPaused = false;
        this._count = 5;
        this._category = 'boss';
        this._unitPage = 0;
        this._refreshCount();
        this._refreshInv();
        this._refreshCeasefire();
        this._chapterLbl.string = '章节:1';
        this._refreshTargetPause();
        this._refreshTabs();
        this._rebuildCards();
        this._hideHeroPanel();
    }

    // ── builders ──────────────────────────────────────────────

    private _buildToolbar() {
        // 底部常驻条：半透明金属底 + 顶部描边（位置 local y=-312，覆盖画布底部 96px）
        const g = this.node.addComponent(Graphics);
        g.fillColor = new Color(6, 12, 20, 235);
        g.fillRect(-640, -48, 1280, 96);
        g.strokeColor = new Color(90, 160, 210, 160);
        g.lineWidth = 2; g.moveTo(-640, 48); g.lineTo(640, 48); g.stroke();
        g.strokeColor = new Color(30, 60, 90, 120);
        g.lineWidth = 1; g.rect(-640, -48, 1280, 96); g.stroke();

        this._buildRow1();
        this._buildTabs();
        this._rebuildCards();
    }

    /** 行1：数量 −/+ | 无敌 | 英雄 | 停火 | 清场 | 返回主页 */
    private _buildRow1() {
        const capN = new Node('Cap'); capN.setParent(this.node);
        capN.setPosition(new Vec3(-600, 20, 0));
        capN.addComponent(UITransform).setContentSize(48, 26);
        const capLbl = capN.addComponent(Label);
        capLbl.string = '数量'; capLbl.fontSize = 13;
        capLbl.color = new Color(170, 180, 200, 255);
        styleLabel(capLbl);

        const minus = this._mkSmallBtn(this.node, '−', -545, 20, 44, 28, new Color(105, 60, 90, 255));
        minus.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._count = clamp(this._count - 1, 1, 50);
            this._refreshCount();
        }, this);

        const cntN = new Node('Cnt'); cntN.setParent(this.node);
        cntN.setPosition(new Vec3(-488, 20, 0));
        cntN.addComponent(UITransform).setContentSize(56, 26);
        this._countLbl = cntN.addComponent(Label);
        this._countLbl.fontSize = 15;
        this._countLbl.color = new Color(255, 224, 130, 255);
        this._countLbl.horizontalAlign = HorizontalTextAlignment.CENTER;
        styleLabel(this._countLbl);

        const plus = this._mkSmallBtn(this.node, '+', -420, 20, 44, 28, new Color(60, 105, 85, 255));
        plus.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._count = clamp(this._count + 1, 1, 50);
            this._refreshCount();
        }, this);

        const inv = this._mkSmallBtn(this.node, '', -300, 20, 116, 30, new Color(70, 80, 95, 255));
        this._invLbl = inv.getChildByName('L')!.getComponent(Label)!;
        inv.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._invincible = !this._invincible;
            this._refreshInv();
            this.onToggleInvincible?.(this._invincible);
        }, this);

        const hero = this._mkSmallBtn(this.node, '英雄', -160, 20, 90, 30, new Color(60, 100, 160, 255));
        hero.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._showHeroPanel();
        }, this);

        const ceasefire = this._mkSmallBtn(this.node, '', -45, 20, 90, 30, new Color(80, 72, 48, 255));
        this._ceasefireLbl = ceasefire.getChildByName('L')!.getComponent(Label)!;
        ceasefire.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._ceasefire = !this._ceasefire;
            this._refreshCeasefire();
            this.onToggleCeasefire?.(this._ceasefire);
        }, this);

        const clear = this._mkSmallBtn(this.node, '清场', 70, 20, 90, 30, new Color(130, 60, 50, 255));
        clear.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this.onClear?.();
        }, this);

        const back = this._mkSmallBtn(this.node, '返回主页', 185, 20, 100, 30, new Color(60, 60, 90, 230));
        back.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this.onReturnMenu?.();
        }, this);

        const phase = this._mkSmallBtn(this.node, '推进阶段', 295, 20, 96, 30, new Color(92, 48, 118, 245));
        phase.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this.onAdvanceBossPhase?.();
        }, this);

        const chapter = this._mkSmallBtn(this.node, '', 397, 20, 96, 30, new Color(45, 82, 115, 245));
        this._chapterLbl = chapter.getChildByName('L')!.getComponent(Label)!;
        chapter.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            const value = this.onCycleChapter?.() ?? 1;
            this._chapterLbl.string = `章节:${value}`;
        }, this);

        const targetPause = this._mkSmallBtn(this.node, '', 500, 20, 88, 30, new Color(56, 72, 82, 245));
        this._targetPauseLbl = targetPause.getChildByName('L')!.getComponent(Label)!;
        targetPause.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._targetPaused = !this._targetPaused;
            this._refreshTargetPause();
            this.onToggleTargetPause?.(this._targetPaused);
        }, this);

        this._refreshCount();
        this._refreshInv();
        this._refreshCeasefire();
        this._chapterLbl.string = '章节:1';
        this._refreshTargetPause();
    }

    /** 行2：分类页签（首领/小boss/小兵） */
    private _buildTabs() {
        const CATS: { key: UnitCategory; label: string }[] = [
            { key: 'boss', label: '首领' },
            { key: 'miniboss', label: '小boss' },
            { key: 'grunt', label: '小兵' },
        ];
        const xs = [-585, -493, -401];
        CATS.forEach((cat, i) => {
            const tab = new Node(`Tab_${cat.key}`); tab.setParent(this.node);
            tab.setPosition(new Vec3(xs[i], -26, 0));
            tab.addComponent(UITransform).setContentSize(80, 30);
            const g = tab.addComponent(Graphics);
            const ln = new Node('L'); ln.setParent(tab);
            ln.addComponent(UITransform).setContentSize(76, 26);
            const lbl = ln.addComponent(Label);
            lbl.string = cat.label; lbl.fontSize = 14;
            lbl.horizontalAlign = HorizontalTextAlignment.CENTER;
            styleLabel(lbl);
            tab.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                this._category = cat.key;
                this._unitPage = 0;
                this._refreshTabs();
                this._rebuildCards();
            }, this);
            this._tabs.push({ g, key: cat.key });
        });
        this._refreshTabs();
    }

    /** 行2：当前分类的单位卡（点卡即按数量生成） */
    private _rebuildCards() {
        // destroy() 在Cocos中延迟到帧末；先断事件并脱离树，避免翻页后旧卡仍截获同位置点击。
        for (const n of this._unitCards) {
            n.off(Node.EventType.TOUCH_END);
            n.active = false;
            n.removeFromParent();
            n.destroy();
        }
        this._unitCards = [];
        const allEntries = UNIT_CATALOG.filter(u => u.category === this._category);
        const maxPage = Math.max(0, Math.ceil(allEntries.length / UNIT_PAGE_SIZE) - 1);
        this._unitPage = clamp(this._unitPage, 0, maxPage);
        const entries = allEntries.slice(
            this._unitPage * UNIT_PAGE_SIZE,
            (this._unitPage + 1) * UNIT_PAGE_SIZE,
        );
        const startX = -300, stepX = 126;
        entries.forEach((entry, i) => {
            const card = new Node(`Unit_${entry.id}`); card.setParent(this.node);
            card.setPosition(new Vec3(startX + i * stepX, -26, 0));
            card.addComponent(UITransform).setContentSize(116, 34);
            const cg = card.addComponent(Graphics);
            const col = Color.fromHEX(new Color(), entry.color);
            cg.fillColor = new Color(
                Math.floor(col.r * 0.22), Math.floor(col.g * 0.22), Math.floor(col.b * 0.22), 245);
            cg.fillRect(-58, -17, 116, 34);
            cg.strokeColor = new Color(col.r, col.g, col.b, 150);
            cg.lineWidth = 1.5;
            cg.rect(-58, -17, 116, 34); cg.stroke();

            const ln = new Node('L'); ln.setParent(card);
            ln.addComponent(UITransform).setContentSize(112, 30);
            const lbl = ln.addComponent(Label);
            lbl.string = entry.label; lbl.fontSize = 13;
            lbl.color = new Color(235, 246, 250, 255);
            lbl.horizontalAlign = HorizontalTextAlignment.CENTER;
            lbl.verticalAlign = VerticalTextAlignment.CENTER;
            lbl.overflow = Label.Overflow.SHRINK;
            styleLabel(lbl);

            card.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                this.onSpawnUnit?.(entry.id, this._count);
            }, this);
            this._unitCards.push(card);
        });

        // 单位超过一行时分页，避免新增怪卡片越过1280画布右边界。
        if (maxPage > 0) {
            const prev = this._mkSmallBtn(this.node, '‹', 472, -26, 42, 32, new Color(45, 70, 96, 245));
            const page = this._mkSmallBtn(
                this.node, `${this._unitPage + 1}/${maxPage + 1}`,
                526, -26, 58, 32, new Color(30, 42, 58, 245),
            );
            const next = this._mkSmallBtn(this.node, '›', 590, -26, 42, 32, new Color(45, 70, 96, 245));
            page.off(Node.EventType.TOUCH_END);
            prev.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                this._unitPage = (this._unitPage - 1 + maxPage + 1) % (maxPage + 1);
                this._rebuildCards();
            }, this);
            next.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                this._unitPage = (this._unitPage + 1) % (maxPage + 1);
                this._rebuildCards();
            }, this);
            this._unitCards.push(prev, page, next);
        }
    }

    // ── refresh ───────────────────────────────────────────────

    private _refreshCount() {
        this._countLbl.string = String(this._count);
    }

    private _refreshInv() {
        this._invLbl.string = this._invincible ? '无敌:开' : '无敌:关';
        this._invLbl.color = this._invincible
            ? new Color(140, 255, 160, 255)
            : new Color(160, 168, 180, 220);
    }

    private _refreshCeasefire() {
        this._ceasefireLbl.string = this._ceasefire ? '停火:开' : '停火:关';
        this._ceasefireLbl.color = this._ceasefire
            ? new Color(255, 218, 120, 255)
            : new Color(160, 168, 180, 220);
    }

    private _refreshTargetPause() {
        this._targetPauseLbl.string = this._targetPaused ? '靶:静' : '靶:动';
        this._targetPauseLbl.color = this._targetPaused
            ? new Color(135, 235, 255, 255)
            : new Color(160, 168, 180, 220);
    }

    private _refreshTabs() {
        for (const t of this._tabs) {
            const sel = t.key === this._category;
            t.g.clear();
            t.g.fillColor = sel ? new Color(40, 55, 75, 245) : new Color(16, 24, 36, 240);
            t.g.fillRect(-40, -15, 80, 30);
            t.g.strokeColor = sel ? new Color(255, 214, 90, 230) : new Color(70, 84, 104, 150);
            t.g.lineWidth = sel ? 2 : 1;
            t.g.rect(-40, -15, 80, 30); t.g.stroke();
            const lbl = t.g.node.getChildByName('L')?.getComponent(Label);
            if (lbl) lbl.color = sel ? new Color(255, 224, 130, 255) : new Color(170, 180, 200, 255);
        }
    }

    // ── 英雄选择浮层 ─────────────────────────────────────────

    /** 打开英雄选择浮层：先向 GameManager 查询当前英雄用于高亮。 */
    private _showHeroPanel() {
        this._heroId = this.onGetHero?.() ?? this._heroId;
        this._refreshHeroCards();
        this._heroPanel.active = true;
        this._heroPanel.setSiblingIndex(this.node.children.length - 1);
    }

    private _hideHeroPanel() {
        this._heroPanel.active = false;
    }

    private _refreshHeroCards() {
        for (const c of this._heroCards) {
            const sel = c.id === this._heroId;
            const g = c.g;
            g.clear();
            g.fillColor = new Color(16, 22, 34, 250);
            g.fillRect(-75, -54, 150, 108);
            g.strokeColor = sel ? new Color(110, 220, 255, 235) : new Color(70, 80, 100, 140);
            g.lineWidth = sel ? 2.5 : 1.5;
            g.rect(-75, -54, 150, 108); g.stroke();
        }
    }

    /** 英雄选择浮层：全屏半透明遮罩 + 3×2 角色卡，点卡即切换并关闭。 */
    private _buildHeroPanel() {
        const panel = this._heroPanel = new Node('HeroPanel'); panel.setParent(this.node);
        panel.active = false;

        // 遮罩从工具条局部坐标铺满整屏，点遮罩关闭（不挡正式 HUD 之外的战斗区交互）
        const dim = new Node('Dim'); dim.setParent(panel);
        dim.addComponent(UITransform).setContentSize(1280, 720);
        const dg = dim.addComponent(Graphics);
        dg.fillColor = new Color(0, 0, 0, 150);
        dg.fillRect(-640, -48, 1280, 720);
        dim.on(Node.EventType.TOUCH_END, () => this._hideHeroPanel(), this);

        // 面板全局居中（工具条局部 y=312）
        const box = new Node('Box'); box.setParent(panel);
        box.setPosition(new Vec3(0, 312, 0));
        box.addComponent(UITransform).setContentSize(900, 320);
        // 面板必须截断输入，避免点击英雄卡时事件穿透到底层 Dim，出现
        // “浮层关闭但没有换人”的假成功。子卡仍会先收到 TOUCH_END。
        box.addComponent(BlockInputEvents);
        const bg = box.addComponent(Graphics);
        bg.fillColor = new Color(8, 13, 23, 250);
        bg.fillRect(-450, -160, 900, 320);
        bg.strokeColor = new Color(105, 145, 175, 235);
        bg.lineWidth = 2; bg.rect(-450, -160, 900, 320); bg.stroke();

        const tn = new Node('T'); tn.setParent(box);
        tn.setPosition(new Vec3(0, 130, 0));
        tn.addComponent(UITransform).setContentSize(400, 34);
        const tl = tn.addComponent(Label);
        tl.string = '— 选择出战英雄 —';
        tl.fontSize = 22; tl.color = new Color(255, 215, 90, 255);
        styleLabel(tl);

        const xs = [-300, 0, 300];
        const ys = [48, -72];
        for (let i = 0; i < CHARS.length; i++) {
            const def = CHARS[i];
            const card = new Node(`HeroCard_${i}`); card.setParent(box);
            card.setPosition(new Vec3(xs[i % 3], ys[Math.floor(i / 3)], 0));
            card.addComponent(UITransform).setContentSize(150, 108);
            const g = card.addComponent(Graphics);

            const imgN = new Node('Img'); imgN.setParent(card);
            imgN.setPosition(new Vec3(0, 22, 0));
            imgN.addComponent(UITransform).setContentSize(58, 58);
            const sp = imgN.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            applyArtSprite(sp, `char_token_${def.id}`);

            const nameN = new Node('Nm'); nameN.setParent(card);
            nameN.setPosition(new Vec3(0, -36, 0));
            nameN.addComponent(UITransform).setContentSize(140, 22);
            const nl = nameN.addComponent(Label);
            nl.string = def.name; nl.fontSize = 13;
            nl.color = new Color(220, 228, 240, 255);
            styleLabel(nl);

            card.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                this._heroId = def.id;
                this.onSelectHero?.(def.id);
                this._hideHeroPanel();
            }, this);
            this._heroCards.push({ g, id: def.id });
        }
        this._refreshHeroCards();
    }

    /** 小型按钮工厂：皮肤 + 居中文字（音效由调用方挂）。 */
    private _mkSmallBtn(parent: Node, text: string, x: number, y: number, w: number, h: number, accent: Color): Node {
        const btn = new Node(`Btn_${text || 'toggle'}`); btn.setParent(parent);
        btn.setPosition(new Vec3(x, y, 0));
        btn.addComponent(UITransform).setContentSize(w, h);
        applyHexButtonSkin(btn, w, h, accent);

        const ln = new Node('L'); ln.setParent(btn);
        ln.addComponent(UITransform).setContentSize(w - 12, h);
        const lbl = ln.addComponent(Label);
        lbl.string = text; lbl.fontSize = Math.round(h * 0.36);
        lbl.color = new Color(235, 246, 250, 255);
        lbl.horizontalAlign = HorizontalTextAlignment.CENTER;
        lbl.verticalAlign = VerticalTextAlignment.CENTER;
        lbl.overflow = Label.Overflow.SHRINK;
        styleLabel(lbl);
        return btn;
    }
}
