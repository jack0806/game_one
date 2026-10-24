import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, BlockInputEvents,
    HorizontalTextAlignment, VerticalTextAlignment
} from 'cc';
import { styleLabel } from '../core/LabelUtils';
import { applyHexButtonSkin, attachEnableRedraw, drawHexPanel,
    registerKeyboardFocus, registerKeyboardModalScope, unregisterKeyboardFocus, UI_PALETTE } from '../core/UIStyle';
import { visibleDesignWidth } from '../core/ScreenFit';
import { applyArtSprite } from '../core/SpriteUtils';
import { loadPortraitArt } from '../core/PortraitArt';
import { clamp } from '../core/MathUtils';
import { UNIT_CATALOG, UnitCategory } from '../data/BossDB';
import { CHARS } from '../data/CharacterDB';
import { AUGMENT_DB, rarityForLevel } from '../data/AugmentDB';
import { statScaleFor, countScaleFor, goldStageMult, mapOf, chapterInMap, TOTAL_CHAPTERS } from '../data/LevelIndex';
import { chapterTuning, setChapterTuning, clearChapterTuning, clearAllTuning,
    saveTuning, hasUnsavedTuning, TUNING_STEP, ChapterTuning } from '../data/DifficultyTuning';
import { RARITY_COLOR } from '../core/Constants';

const { ccclass } = _decorator;
const UNIT_PAGE_SIZE = 6;
const AUG_PAGE_SIZE = 6;

/**
 * TestRoomUI — 测试房间底部工具条（常驻、非模态，仅 testRoom 状态激活）。
 * 行1：数量 −/+、玩家无敌、英雄选择、停火观摩、清场、返回主页、推进Boss阶段；
 * 行2：分类页签（首领/小boss/小兵）+ 单位卡（点卡即按数量生成）。
 * 英雄选择为工具条上的浮层（3×2 角色卡），点击即切换出战英雄。
 * 上沿右角「强化」授予海克斯、「调试」打开数值调试面板（无CD释放/三路倍率）。
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
    /** 海克斯授予面板：点击卡片授予/升档（满级点击卸下）。 */
    onGrantAugment?:   (hexId: string) => void;
    /** 查询当前持有海克斯（面板高亮用）。 */
    onGetAugments?:    () => any[];
    onAdvanceBossPhase?: () => void;
    /** 轮换测试背景并返回新的1-based章节号。 */
    onCycleChapter?:   () => number;
    onToggleTargetPause?: (on: boolean) => void;
    onToggleVisualGuides?: (on: boolean) => void;
    /** 数值调试面板：无CD释放开关。 */
    onToggleNoCd?:     (on: boolean) => void;
    /** 数值调试面板：三路倍率（玩家伤害/敌方伤害/敌人血量）。 */
    onSetTestMult?:    (kind: 'playerDmg' | 'enemyDmg' | 'enemyHp', value: number) => void;
    /** 关卡系数调试：切到指定全局章号（1~30），返回实际生效章号。 */
    onSetTestChapter?: (globalChapterId: number) => number;
    /** 关卡系数调试：查询测试房当前全局章号（打开面板时同步选择器）。 */
    onGetTestChapter?: () => number;

    private _category: UnitCategory = 'boss';
    private _count = 5;
    private _invincible = false;
    private _ceasefire = false;
    private _targetPaused = false;
    private _visualGuides = false;
    // ── 数值调试面板状态（resetState 一并复位并回推 GameManager） ──
    private _noCd = false;
    private _pDmgMult = 1;
    private _eDmgMult = 1;
    private _eHpMult = 1;
    private _heroId = 'kai';
    private _unitPage = 0;
    private _countLbl!: Label;
    private _invLbl!: Label;
    private _ceasefireLbl!: Label;
    private _chapterLbl!: Label;
    private _targetPauseLbl!: Label;
    private _guideLbl!: Label;
    private _noCdLbl!: Label;
    private _pDmgLbl!: Label;
    private _eDmgLbl!: Label;
    private _eHpLbl!: Label;
    private _unitCards: Node[] = [];
    private _tabs: { g: Graphics; key: UnitCategory }[] = [];
    private _heroPanel!: Node;
    private _heroDimNode!: Node;
    private _heroDimG!: Graphics;
    private _heroBoxG!: Graphics;
    private _heroCards: { g: Graphics; id: string }[] = [];
    private _augPanel!: Node;
    private _augDimNode!: Node;
    private _augDimG!: Graphics;
    private _augBoxG!: Graphics;
    private _augPage = 0;
    private _augPageLbl!: Label;
    private _augCards: { node: Node; g: Graphics; id: string; lvLbl: Label }[] = [];
    private _dbgPanel!: Node;
    private _dbgDimNode!: Node;
    private _dbgDimG!: Graphics;
    private _dbgBoxG!: Graphics;
    // ── 关卡难度系数调试状态 ──
    /** 当前选中的全局章号（1~30）。 */
    private _tuneChapter = 1;
    private _tuneChapterLbl!: Label;
    private _tuneBaseLbl!: Label;
    private _tuneDirtyLbl!: Label;
    private _tuneRows: { field: keyof ChapterTuning; val: Label; eff: Label }[] = [];

    onLoad() {
        // 工具条固定在画布底部（local y=-312 覆盖底部 96px，避开顶部 HUD 区）
        this.node.setPosition(new Vec3(0, -312, 0));
        this._buildToolbar();
        this._buildHeroPanel();
        this._buildAugPanel();
        this._buildDebugPanel();
        this.node.active = false;
    }

    /**
     * 暂停（_setState 把整个工具条 active=false）时收起英雄/海克斯浮层：
     * 暂停面板是模态的，恢复战斗后不应残留挡住战场的半开浮层。
     */
    onDisable() {
        this._hideAugPanel();
        this._hideHeroPanel();
        this._hideDebugPanel();
    }

    fitToVisible(): void {
        if (!this._heroDimNode || !this._augDimNode || !this._dbgDimNode) return;
        const width = visibleDesignWidth();
        this._heroDimNode.getComponent(UITransform)!.setContentSize(width, 720);
        this._augDimNode.getComponent(UITransform)!.setContentSize(width, 720);
        this._dbgDimNode.getComponent(UITransform)!.setContentSize(width, 720);
        this._drawToolbarBg();
        this._drawHeroChrome();
        this._drawAugChrome();
        this._drawDebugChrome();
    }

    /** 每次进入测试房间时复位工具条状态（无敌/数量/分类/数值调试不跨房保留）。 */
    resetState() {
        this._invincible = false;
        this._ceasefire = false;
        this._targetPaused = false;
        this._visualGuides = false;
        this._guideLbl.string = '定位:关';
        this._noCd = false;
        this._pDmgMult = 1;
        this._eDmgMult = 1;
        this._eHpMult = 1;
        this._refreshDebugSwitches();
        this.onToggleNoCd?.(false);
        this.onSetTestMult?.('playerDmg', 1);
        this.onSetTestMult?.('enemyDmg', 1);
        this.onSetTestMult?.('enemyHp', 1);
        // 关卡系数选择回第 1 关（覆盖值本身保留——保存过的调参跨房生效）
        this._tuneChapter = 1;
        this._refreshTuningSection();
        this._count = 5;
        this._category = 'boss';
        this._unitPage = 0;
        this._augPage = 0;
        this._refreshCount();
        this._refreshInv();
        this._refreshCeasefire();
        this._chapterLbl.string = '章节:1';
        this._refreshTargetPause();
        this._refreshTabs();
        this._rebuildCards();
        this._hideHeroPanel();
        this._hideAugPanel();
        this._hideDebugPanel();
    }

    // ── builders ──────────────────────────────────────────────

    private _buildToolbar() {
        this.node.addComponent(Graphics);
        this._drawToolbarBg();
        // 暂停/恢复会让本节点 停用→再激活，一次性底板绘制随之丢失，激活时重画兜底
        attachEnableRedraw(this.node, () => this._drawToolbarBg());

        this._buildRow1();
        this._buildTabs();
        this._rebuildCards();
    }

    /** 底部常驻条：半透明金属底 + 顶部描边（位置 local y=-312，覆盖画布底部 96px）。 */
    private _drawToolbarBg() {
        const g = this.node.getComponent(Graphics)!;
        g.clear();
        g.fillColor = new Color(6, 12, 20, 235);
        const width = visibleDesignWidth();
        g.fillRect(-width / 2, -48, width, 96);
        g.strokeColor = new Color(90, 160, 210, 160);
        g.lineWidth = 2; g.moveTo(-width / 2, 48); g.lineTo(width / 2, 48); g.stroke();
        g.strokeColor = new Color(30, 60, 90, 120);
        g.lineWidth = 1; g.rect(-width / 2, -48, width, 96); g.stroke();
    }

    /** 行1：数量 −/+ | 无敌 | 英雄 | 停火 | 清场 | 返回主页 */
    private _buildRow1() {
        const capN = new Node('Cap'); capN.setParent(this.node);
        capN.setPosition(new Vec3(-600, 20, 0));
        capN.addComponent(UITransform).setContentSize(48, 26);
        const capLbl = capN.addComponent(Label);
        capLbl.string = '数量'; capLbl.fontSize = 14;
        capLbl.lineHeight = 18;
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
        this._chapterLbl.string = '地图:1';
        chapter.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            const value = this.onCycleChapter?.() ?? 1;
            this._chapterLbl.string = `地图:${value}`;
        }, this);

        const targetPause = this._mkSmallBtn(this.node, '', 500, 20, 88, 30, new Color(56, 72, 82, 245));
        this._targetPauseLbl = targetPause.getChildByName('L')!.getComponent(Label)!;
        targetPause.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._targetPaused = !this._targetPaused;
            this._refreshTargetPause();
            this.onToggleTargetPause?.(this._targetPaused);
        }, this);

        const guides = this._mkSmallBtn(this.node, '定位:关', 588, 20, 78, 30, new Color(38, 96, 104, 245));
        this._guideLbl = guides.getChildByName('L')!.getComponent(Label)!;
        guides.on(Node.EventType.TOUCH_END, () => {
            this._visualGuides = !this._visualGuides;
            this._guideLbl.string = this._visualGuides ? '定位:开' : '定位:关';
            this.onToggleVisualGuides?.(this._visualGuides);
        }, this);

        // 海克斯授予入口：行1 已满，按钮浮在工具条上沿右角（测试房专属工具）
        const augBtn = this._mkSmallBtn(this.node, '强化', 600, 66, 76, 30, new Color(128, 52, 96, 245));
        augBtn.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._showAugPanel();
        }, this);

        // 数值调试入口：与「强化」并排（无CD释放 / 三路数值倍率）
        const dbgBtn = this._mkSmallBtn(this.node, '调试', 516, 66, 76, 30, new Color(40, 96, 132, 245));
        dbgBtn.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._showDebugPanel();
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
            attachEnableRedraw(tab, () => this._refreshTabs());
            registerKeyboardFocus(tab, 80, 30);
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
            const drawCard = () => {
                cg.clear();
                cg.fillColor = new Color(
                    Math.floor(col.r * 0.22), Math.floor(col.g * 0.22), Math.floor(col.b * 0.22), 245);
                cg.fillRect(-58, -17, 116, 34);
                cg.strokeColor = new Color(col.r, col.g, col.b, 150);
                cg.lineWidth = 1.5;
                cg.rect(-58, -17, 116, 34); cg.stroke();
            };
            drawCard();
            attachEnableRedraw(card, drawCard);

            const ln = new Node('L'); ln.setParent(card);
            ln.addComponent(UITransform).setContentSize(112, 30);
            const lbl = ln.addComponent(Label);
            lbl.string = entry.label; lbl.fontSize = 14;
            lbl.lineHeight = 20;
            lbl.color = new Color(235, 246, 250, 255);
            lbl.horizontalAlign = HorizontalTextAlignment.CENTER;
            lbl.verticalAlign = VerticalTextAlignment.CENTER;
            lbl.overflow = Label.Overflow.SHRINK;
            styleLabel(lbl);

            card.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                this.onSpawnUnit?.(entry.id, this._count);
            }, this);
            registerKeyboardFocus(card, 116, 34);
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
            unregisterKeyboardFocus(page);
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
        if (this._heroPanel) this._heroPanel.active = false;
    }

    private _refreshHeroCards() {
        for (const c of this._heroCards) {
            const sel = c.id === this._heroId;
            const g = c.g;
            g.clear();
            drawHexPanel(g, -75, -54, 150, 108, sel ? UI_PALETTE.cyan : UI_PALETTE.muted, 245);
        }
    }

    /** 英雄浮层的遮罩 + 底板（一次性结构，可重复重绘）。 */
    private _drawHeroChrome() {
        this._heroDimG.clear();
        this._heroDimG.fillColor = new Color(0, 0, 0, 150);
        const width = visibleDesignWidth();
        this._heroDimG.fillRect(-width / 2, -360, width, 720);

        const bg = this._heroBoxG;
        bg.clear();
        drawHexPanel(bg, -575, -160, 1150, 320, UI_PALETTE.cyan, 250);
    }

    /** 英雄选择浮层：全屏半透明遮罩 + 4×2 角色卡（8名英雄），点卡即切换并关闭。 */
    private _buildHeroPanel() {
        const panel = this._heroPanel = new Node('HeroPanel'); panel.setParent(this.node);
        registerKeyboardModalScope(panel);
        panel.active = false;

        // 遮罩从工具条局部坐标铺满整屏，点遮罩关闭（不挡正式 HUD 之外的战斗区交互）
        const dim = new Node('Dim'); dim.setParent(panel);
        dim.setPosition(new Vec3(0, 312, 0));
        dim.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        this._heroDimNode = dim;
        this._heroDimG = dim.addComponent(Graphics);
        dim.on(Node.EventType.TOUCH_END, () => this._hideHeroPanel(), this);

        // 面板全局居中（工具条局部 y=312）
        const box = new Node('Box'); box.setParent(panel);
        box.setPosition(new Vec3(0, 312, 0));
        box.addComponent(UITransform).setContentSize(1150, 320);
        // 面板必须截断输入，避免点击英雄卡时事件穿透到底层 Dim，出现
        // “浮层关闭但没有换人”的假成功。子卡仍会先收到 TOUCH_END。
        box.addComponent(BlockInputEvents);
        this._heroBoxG = box.addComponent(Graphics);
        this._drawHeroChrome();
        // 浮层随工具条整体 停用→再激活（暂停/恢复）后遮罩与底板绘制会丢，激活时重画
        attachEnableRedraw(dim, () => this._drawHeroChrome());
        attachEnableRedraw(box, () => this._drawHeroChrome());

        const tn = new Node('T'); tn.setParent(box);
        tn.setPosition(new Vec3(0, 130, 0));
        tn.addComponent(UITransform).setContentSize(400, 34);
        const tl = tn.addComponent(Label);
        tl.string = '— 选择出战英雄 —';
        tl.fontSize = 22; tl.color = new Color(255, 215, 90, 255);
        styleLabel(tl);

        // 8名英雄 4×2 网格（面板同步加宽到1150）；列数取自 xs 长度，超出 xs/ys 的英雄数需同步扩表
        const xs = [-435, -145, 145, 435];
        const ys = [48, -72];
        for (let i = 0; i < CHARS.length; i++) {
            const def = CHARS[i];
            const card = new Node(`HeroCard_${i}`); card.setParent(box);
            card.setPosition(new Vec3(xs[i % xs.length], ys[Math.floor(i / xs.length)], 0));
            card.addComponent(UITransform).setContentSize(150, 108);
            const g = card.addComponent(Graphics);

            loadPortraitArt(card, `ui_hero_display_${def.id}`, 134, 70, 0, 14, 'cover', true);

            const nameN = new Node('Nm'); nameN.setParent(card);
            nameN.setPosition(new Vec3(0, -36, 0));
            nameN.addComponent(UITransform).setContentSize(140, 22);
            const nl = nameN.addComponent(Label);
            nl.string = def.name; nl.fontSize = 16;
            nl.lineHeight = 20;
            nl.overflow = Label.Overflow.SHRINK;
            nl.color = new Color(220, 228, 240, 255);
            styleLabel(nl);

            card.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                this._heroId = def.id;
                this.onSelectHero?.(def.id);
                this._hideHeroPanel();
            }, this);
            registerKeyboardFocus(card, 150, 108);
            attachEnableRedraw(card, () => this._refreshHeroCards());
            this._heroCards.push({ g, id: def.id });
        }
        const close = this._mkSmallBtn(box, '关闭', 400, 130, 76, 30, UI_PALETTE.cyan);
        close.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._hideHeroPanel();
        }, this);
        this._refreshHeroCards();
    }

    // ── 海克斯授予浮层 ─────────────────────────────────────

    /** 打开海克斯授予面板；分页保留正文大小，技能海克斯可授予、升档、卸下。 */
    private _showAugPanel() {
        this._hideHeroPanel();
        this._augPage = 0;
        this._refreshAugPage();
        this._refreshAugCards();
        this._augPanel.active = true;
        this._augPanel.setSiblingIndex(this.node.children.length - 1);
    }

    private _hideAugPanel() {
        if (this._augPanel) this._augPanel.active = false;
    }

    private _refreshAugPage() {
        const pageCount = Math.max(1, Math.ceil(AUGMENT_DB.length / AUG_PAGE_SIZE));
        this._augPage = (this._augPage + pageCount) % pageCount;
        this._augCards.forEach((card, index) => card.node.active =
            Math.floor(index / AUG_PAGE_SIZE) === this._augPage);
        this._augPageLbl.string = `${this._augPage + 1} / ${pageCount}`;
    }

    /** 按 GameManager 当前持有列表刷新卡片等级高亮。 */
    private _refreshAugCards() {
        const owned = this.onGetAugments?.() ?? [];
        for (const c of this._augCards) {
            const def = AUGMENT_DB.find(a => a.id === c.id);
            if (!def) continue;
            const insts = owned.filter((a: any) => a.id === c.id);
            const lvl = insts.length ? Math.max(...insts.map((a: any) => a.level ?? 1)) : 0;
            // 边框色随档位稀有度走（Lv.1银 / Lv.2金 / Lv.3彩），未持有时用银档色淡化
            const rarity = rarityForLevel(def, lvl > 0 ? lvl : 1);
            const col = Color.fromHEX(new Color(), RARITY_COLOR[rarity] ?? '#888888');
            c.g.clear();
            drawHexPanel(c.g, -88, -235, 176, 470,
                lvl > 0 ? col : new Color(col.r, col.g, col.b, 155), 245);
            c.lvLbl.string = def.oneShot
                ? '一次性·点击生效'
                : def.category === '功能'
                    // 功能海克斯无卸下循环：满档后点击=叠加新实例，显示叠加份数
                    ? (lvl > 0 ? `Lv${lvl}${insts.length > 1 ? ` ×${insts.length}` : ''}·可叠加` : '未持有')
                    : (lvl > 0 ? `Lv${lvl}${lvl >= 3 ? '·点击卸下' : ''}` : '未持有');
            c.lvLbl.color = lvl > 0
                ? new Color(140, 255, 170, 255)
                : new Color(160, 168, 180, 220);
        }
    }

    /** 海克斯浮层的遮罩 + 底板（一次性结构，可重复重绘）。 */
    private _drawAugChrome() {
        this._augDimG.clear();
        this._augDimG.fillColor = new Color(0, 0, 0, 160);
        const width = visibleDesignWidth();
        this._augDimG.fillRect(-width / 2, -360, width, 720);

        // 每页 6 张高卡，长说明留足空间，不把 23 张卡挤成四行。
        const bg = this._augBoxG;
        bg.clear();
        drawHexPanel(bg, -575, -340, 1150, 680, new Color(170, 120, 225, 255), 250);
    }

    /** 海克斯授予浮层：遮罩 + 每页 6 张高卡（名称/等级/一档说明）。 */
    private _buildAugPanel() {
        const panel = this._augPanel = new Node('AugPanel'); panel.setParent(this.node);
        registerKeyboardModalScope(panel);
        panel.active = false;

        const dim = new Node('Dim'); dim.setParent(panel);
        dim.setPosition(new Vec3(0, 312, 0));
        dim.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        this._augDimNode = dim;
        this._augDimG = dim.addComponent(Graphics);
        dim.on(Node.EventType.TOUCH_END, () => this._hideAugPanel(), this);

        const box = new Node('Box'); box.setParent(panel);
        box.setPosition(new Vec3(0, 312, 0));
        box.addComponent(UITransform).setContentSize(1150, 680);
        box.addComponent(BlockInputEvents);
        this._augBoxG = box.addComponent(Graphics);
        this._drawAugChrome();
        // 浮层随工具条整体 停用→再激活（暂停/恢复）后遮罩与底板绘制会丢，激活时重画
        attachEnableRedraw(dim, () => this._drawAugChrome());
        attachEnableRedraw(box, () => this._drawAugChrome());

        const tn = new Node('T'); tn.setParent(box);
        tn.setPosition(new Vec3(0, 300, 0));
        tn.addComponent(UITransform).setContentSize(500, 32);
        const tl = tn.addComponent(Label);
        tl.string = '— 海克斯授予 —';
        tl.fontSize = 22; tl.color = new Color(255, 215, 90, 255);
        styleLabel(tl);

        const sub = new Node('Sub'); sub.setParent(box);
        sub.setPosition(new Vec3(0, 274, 0));
        sub.addComponent(UITransform).setContentSize(700, 20);
        const sl = sub.addComponent(Label);
        sl.string = '点击卡片授予 / 升档 · 技能海克斯 Lv.3 后点击卸下 · 功能海克斯满档后无限叠加';
        sl.fontSize = 14; sl.lineHeight = 18;
        sl.color = UI_PALETTE.muted;
        styleLabel(sl);

        AUGMENT_DB.forEach((def, i) => {
            const col = i % AUG_PAGE_SIZE;
            const card = new Node(`Hex_${def.id}`); card.setParent(box);
            card.setPosition(new Vec3(-480 + col * 192, -10, 0));
            card.addComponent(UITransform).setContentSize(176, 470);
            const g = card.addComponent(Graphics);

            const iN = new Node('Icon'); iN.setParent(card);
            iN.setPosition(new Vec3(0, 180, 0));
            iN.addComponent(UITransform).setContentSize(40, 40);
            const sp = iN.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            applyArtSprite(sp, `ui_icon_${def.icon}`);

            const nN = new Node('Nm'); nN.setParent(card);
            nN.setPosition(new Vec3(0, 140, 0));
            nN.addComponent(UITransform).setContentSize(168, 26);
            const nl = nN.addComponent(Label);
            nl.string = def.name; nl.fontSize = 16;
            nl.lineHeight = 20;
            nl.color = new Color(228, 236, 244, 255);
            nl.overflow = Label.Overflow.SHRINK;
            styleLabel(nl);

            const lN = new Node('Lv'); lN.setParent(card);
            lN.setPosition(new Vec3(0, 110, 0));
            lN.addComponent(UITransform).setContentSize(168, 18);
            const lvLbl = lN.addComponent(Label);
            lvLbl.string = '未持有'; lvLbl.fontSize = 14;
            styleLabel(lvLbl);

            const dN = new Node('Desc'); dN.setParent(card);
            dN.setPosition(new Vec3(0, -55, 0));
            dN.addComponent(UITransform).setContentSize(166, 270);
            const dl = dN.addComponent(Label);
            dl.string = def.descAt(1);
            dl.fontSize = 14; dl.lineHeight = 20;
            dl.color = UI_PALETTE.muted;
            dl.horizontalAlign = HorizontalTextAlignment.CENTER;
            dl.verticalAlign = VerticalTextAlignment.TOP;
            dl.overflow = Label.Overflow.SHRINK;
            dl.enableWrapText = true;
            styleLabel(dl, { outlineWidth: 1 });

            card.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                this.onGrantAugment?.(def.id);
                this._refreshAugCards();
            }, this);
            registerKeyboardFocus(card, 176, 470);
            attachEnableRedraw(card, () => this._refreshAugCards());
            this._augCards.push({ node: card, g, id: def.id, lvLbl });
        });
        const close = this._mkSmallBtn(box, '关闭', 520, 300, 76, 30, UI_PALETTE.cyan);
        close.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._hideAugPanel();
        }, this);
        const prev = this._mkSmallBtn(box, '上一页', -478, -302, 132, 34, new Color(116, 135, 164, 255));
        prev.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._augPage--;
            this._refreshAugPage();
        }, this);
        const next = this._mkSmallBtn(box, '下一页', 478, -302, 132, 34, new Color(116, 135, 164, 255));
        next.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._augPage++;
            this._refreshAugPage();
        }, this);
        const pageN = new Node('AugPage'); pageN.setParent(box);
        pageN.setPosition(new Vec3(0, -302, 0));
        pageN.addComponent(UITransform).setContentSize(120, 28);
        this._augPageLbl = pageN.addComponent(Label);
        this._augPageLbl.fontSize = 15;
        this._augPageLbl.color = new Color(220, 232, 246, 255);
        styleLabel(this._augPageLbl);
        this._refreshAugPage();
        this._refreshAugCards();
    }

    // ── 数值调试浮层（无CD / 三路倍率） ─────────────────────

    /** 倍率循环档位：点击一次换下一档（绕回 0.5）。 */
    private static readonly DMULT_STEPS = [0.5, 1, 2, 5, 10, 50];

    private _showDebugPanel() {
        this._hideHeroPanel();
        this._hideAugPanel();
        // 选择器同步到测试房当前章节（地图轮换按钮可能已把章节切走）
        if (this.onGetTestChapter) this._tuneChapter = this.onGetTestChapter();
        this._refreshDebugSwitches();
        this._refreshTuningSection();
        this._dbgPanel.active = true;
        this._dbgPanel.setSiblingIndex(this.node.children.length - 1);
    }

    private _hideDebugPanel() {
        if (this._dbgPanel) this._dbgPanel.active = false;
    }

    /** 按当前本地状态刷新四个控件的文案与高亮（打开面板/切档后调用）。 */
    private _refreshDebugSwitches() {
        if (!this._noCdLbl) return;
        this._noCdLbl.string = this._noCd ? '无CD:开' : '无CD:关';
        this._noCdLbl.color = this._noCd
            ? new Color(140, 255, 160, 255)
            : new Color(160, 168, 180, 220);
        this._pDmgLbl.string = `×${this._pDmgMult}`;
        this._eDmgLbl.string = `×${this._eDmgMult}`;
        this._eHpLbl.string = `×${this._eHpMult}`;
    }

    /** 调试浮层的遮罩 + 底板（一次性结构，可重复重绘）。 */
    private _drawDebugChrome() {
        this._dbgDimG.clear();
        this._dbgDimG.fillColor = new Color(0, 0, 0, 160);
        const width = visibleDesignWidth();
        this._dbgDimG.fillRect(-width / 2, -360, width, 720);

        const bg = this._dbgBoxG;
        bg.clear();
        drawHexPanel(bg, -330, -280, 660, 560, new Color(70, 130, 170, 255), 250);
    }

    /** 数值调试浮层：上半区四行开关 + 下半区关卡难度系数逐关调整。 */
    private _buildDebugPanel() {
        const panel = this._dbgPanel = new Node('DebugPanel'); panel.setParent(this.node);
        registerKeyboardModalScope(panel);
        panel.active = false;

        const dim = new Node('Dim'); dim.setParent(panel);
        dim.setPosition(new Vec3(0, 312, 0));
        dim.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        this._dbgDimNode = dim;
        this._dbgDimG = dim.addComponent(Graphics);
        dim.on(Node.EventType.TOUCH_END, () => this._hideDebugPanel(), this);

        const box = new Node('Box'); box.setParent(panel);
        box.setPosition(new Vec3(0, 312, 0));
        box.addComponent(UITransform).setContentSize(660, 560);
        box.addComponent(BlockInputEvents);
        this._dbgBoxG = box.addComponent(Graphics);
        this._drawDebugChrome();
        attachEnableRedraw(dim, () => this._drawDebugChrome());
        attachEnableRedraw(box, () => this._drawDebugChrome());

        const tn = new Node('T'); tn.setParent(box);
        tn.setPosition(new Vec3(0, 240, 0));
        tn.addComponent(UITransform).setContentSize(400, 30);
        const tl = tn.addComponent(Label);
        tl.string = '— 数值调试 —';
        tl.fontSize = 22; tl.color = new Color(255, 215, 90, 255);
        styleLabel(tl);

        const hint = new Node('Hint'); hint.setParent(box);
        hint.setPosition(new Vec3(0, 216, 0));
        hint.addComponent(UITransform).setContentSize(620, 18);
        const hl = hint.addComponent(Label);
        hl.string = '上半区开关退出测试房自动复位 · 下半区关卡系数保存后跨重启生效';
        hl.fontSize = 13; hl.lineHeight = 16;
        hl.color = UI_PALETTE.muted;
        styleLabel(hl);

        // 行工厂：左侧说明 + 右侧档位按钮（切档即回调 GameManager）
        const mkRow = (y: number, label: string, note: string, accent: Color,
            onCycle: () => void): Label => {
            const ln = new Node('Lbl'); ln.setParent(box);
            ln.setPosition(new Vec3(-215, y, 0));
            ln.addComponent(UITransform).setContentSize(190, 26);
            const ll = ln.addComponent(Label);
            ll.string = label; ll.fontSize = 15;
            ll.color = new Color(225, 234, 244, 255);
            styleLabel(ll);
            const nn = new Node('Note'); nn.setParent(box);
            nn.setPosition(new Vec3(-215, y - 20, 0));
            nn.addComponent(UITransform).setContentSize(210, 16);
            const nl = nn.addComponent(Label);
            nl.string = note; nl.fontSize = 12; nl.lineHeight = 15;
            nl.color = UI_PALETTE.muted;
            styleLabel(nl);
            const btn = this._mkSmallBtn(box, '', 105, y - 8, 120, 32, accent);
            const valueLbl = btn.getChildByName('L')!.getComponent(Label)!;
            valueLbl.fontSize = 15;
            btn.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                onCycle();
                this._refreshDebugSwitches();
            }, this);
            return valueLbl;
        };
        const cycle = (cur: number): number => {
            const steps = TestRoomUI.DMULT_STEPS;
            return steps[(steps.indexOf(cur) + 1) % steps.length];
        };

        this._noCdLbl = mkRow(184, '无CD释放', 'Q/E/R 不进冷却，R 不消耗充能',
            new Color(56, 108, 84, 245), () => {
                this._noCd = !this._noCd;
                this.onToggleNoCd?.(this._noCd);
            });
        this._pDmgLbl = mkRow(144, '玩家伤害', '普攻与技能全域倍率',
            new Color(96, 78, 40, 245), () => {
                this._pDmgMult = cycle(this._pDmgMult);
                this.onSetTestMult?.('playerDmg', this._pDmgMult);
            });
        this._eDmgLbl = mkRow(104, '敌方伤害', '弹幕/近战/AoE 承伤倍率',
            new Color(110, 52, 46, 245), () => {
                this._eDmgMult = cycle(this._eDmgMult);
                this.onSetTestMult?.('enemyDmg', this._eDmgMult);
            });
        this._eHpLbl = mkRow(64, '敌人血量', '生成新单位时按倍率缩放',
            new Color(52, 60, 108, 245), () => {
                this._eHpMult = cycle(this._eHpMult);
                this.onSetTestMult?.('enemyHp', this._eHpMult);
            });

        // ── 下半区：关卡难度系数（逐关 stat/count/gold 比例） ──
        const sec = new Node('Sec'); sec.setParent(box);
        sec.setPosition(new Vec3(0, 30, 0));
        sec.addComponent(UITransform).setContentSize(500, 22);
        const sl = sec.addComponent(Label);
        sl.string = '── 关卡难度系数 ──';
        sl.fontSize = 16; sl.color = new Color(255, 215, 90, 255);
        styleLabel(sl);
        const dirty = new Node('Dirty'); dirty.setParent(box);
        dirty.setPosition(new Vec3(245, 30, 0));
        dirty.addComponent(UITransform).setContentSize(90, 18);
        this._tuneDirtyLbl = dirty.addComponent(Label);
        this._tuneDirtyLbl.fontSize = 12; this._tuneDirtyLbl.lineHeight = 15;
        this._tuneDirtyLbl.color = new Color(255, 150, 120, 255);
        styleLabel(this._tuneDirtyLbl);

        // 关卡选择：‹ 图m-章c · 第k关 ›（切换同时把测试房章节切过去，便于即时验证）
        const prevCh = this._mkSmallBtn(box, '‹', -170, 4, 40, 32, new Color(45, 70, 96, 245));
        prevCh.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._tuneChapter = this.onSetTestChapter?.(this._tuneChapter - 1) ?? this._tuneChapter - 1;
            this._refreshTuningSection();
        }, this);
        const chN = new Node('Ch'); chN.setParent(box);
        chN.setPosition(new Vec3(-35, 4, 0));
        chN.addComponent(UITransform).setContentSize(190, 26);
        this._tuneChapterLbl = chN.addComponent(Label);
        this._tuneChapterLbl.fontSize = 16;
        this._tuneChapterLbl.color = new Color(255, 224, 130, 255);
        this._tuneChapterLbl.horizontalAlign = HorizontalTextAlignment.CENTER;
        styleLabel(this._tuneChapterLbl);
        const nextCh = this._mkSmallBtn(box, '›', 85, 4, 40, 32, new Color(45, 70, 96, 245));
        nextCh.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._tuneChapter = this.onSetTestChapter?.(this._tuneChapter + 1) ?? this._tuneChapter + 1;
            this._refreshTuningSection();
        }, this);

        // 基线提示行：LevelIndex 曲线在该关的原值（比例 ×1 时有效值=基线）
        const baseN = new Node('Base'); baseN.setParent(box);
        baseN.setPosition(new Vec3(0, -20, 0));
        baseN.addComponent(UITransform).setContentSize(620, 18);
        this._tuneBaseLbl = baseN.addComponent(Label);
        this._tuneBaseLbl.fontSize = 13; this._tuneBaseLbl.lineHeight = 16;
        this._tuneBaseLbl.color = UI_PALETTE.muted;
        styleLabel(this._tuneBaseLbl);

        // 三路比例行：标签 | − | ×比例 | ＋ | 有效值（基线×比例）
        const mkTuneRow = (y: number, label: string, field: keyof ChapterTuning, accent: Color) => {
            const ln = new Node('Lbl'); ln.setParent(box);
            ln.setPosition(new Vec3(-250, y, 0));
            ln.addComponent(UITransform).setContentSize(110, 24);
            const ll = ln.addComponent(Label);
            ll.string = label; ll.fontSize = 15;
            ll.color = new Color(225, 234, 244, 255);
            styleLabel(ll);
            const minus = this._mkSmallBtn(box, '−', -100, y - 4, 36, 30, accent);
            const plus = this._mkSmallBtn(box, '＋', 50, y - 4, 36, 30, accent);
            const valN = new Node('Val'); valN.setParent(box);
            valN.setPosition(new Vec3(-25, y - 4, 0));
            valN.addComponent(UITransform).setContentSize(100, 26);
            const val = valN.addComponent(Label);
            val.fontSize = 16; val.color = new Color(255, 224, 130, 255);
            val.horizontalAlign = HorizontalTextAlignment.CENTER;
            styleLabel(val);
            const effN = new Node('Eff'); effN.setParent(box);
            effN.setPosition(new Vec3(195, y - 4, 0));
            effN.addComponent(UITransform).setContentSize(130, 26);
            const eff = effN.addComponent(Label);
            eff.fontSize = 14; eff.color = new Color(154, 220, 255, 255);
            eff.horizontalAlign = HorizontalTextAlignment.CENTER;
            styleLabel(eff);
            minus.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                setChapterTuning(this._tuneChapter, field, chapterTuning(this._tuneChapter)[field] - TUNING_STEP);
                this._refreshTuningSection();
            }, this);
            plus.on(Node.EventType.TOUCH_END, () => {
                this.onButtonSfx?.();
                setChapterTuning(this._tuneChapter, field, chapterTuning(this._tuneChapter)[field] + TUNING_STEP);
                this._refreshTuningSection();
            }, this);
            this._tuneRows.push({ field, val, eff });
        };
        mkTuneRow(-50, '强度比例', 'stat', new Color(96, 78, 40, 245));
        mkTuneRow(-84, '数量比例', 'count', new Color(52, 60, 108, 245));
        mkTuneRow(-118, '金币比例', 'gold', new Color(56, 108, 84, 245));

        // 底部操作行：重置本关 / 全部重置 / 保存到关卡（写 localStorage，重启保留）
        const resetOne = this._mkSmallBtn(box, '重置本关', -180, -158, 110, 32, new Color(110, 60, 52, 245));
        resetOne.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            clearChapterTuning(this._tuneChapter);
            this._refreshTuningSection();
        }, this);
        const resetAll = this._mkSmallBtn(box, '全部重置', -40, -158, 110, 32, new Color(110, 60, 52, 245));
        resetAll.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            clearAllTuning();
            this._refreshTuningSection();
        }, this);
        const saveBtn = this._mkSmallBtn(box, '保存到关卡', 150, -158, 140, 32, new Color(40, 110, 88, 245));
        saveBtn.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            saveTuning();
            this._refreshTuningSection();
        }, this);

        const foot = new Node('Foot'); foot.setParent(box);
        foot.setPosition(new Vec3(0, -192, 0));
        foot.addComponent(UITransform).setContentSize(620, 16);
        const fl = foot.addComponent(Label);
        fl.string = '保存后正式局同关立即生效 · 重启保留 · 改基线曲线请回 LevelIndex.ts';
        fl.fontSize = 12; fl.lineHeight = 15;
        fl.color = UI_PALETTE.muted;
        styleLabel(fl);

        const close = this._mkSmallBtn(box, '关闭', 250, 240, 76, 30, UI_PALETTE.cyan);
        close.on(Node.EventType.TOUCH_END, () => {
            this.onButtonSfx?.();
            this._hideDebugPanel();
        }, this);
        this._refreshDebugSwitches();
        this._refreshTuningSection();
    }

    /** 刷新关卡系数区：选关标签 / 基线值 / 三路比例与有效值 / 未保存标记。 */
    private _refreshTuningSection() {
        if (!this._tuneChapterLbl) return;
        this._tuneChapter = Math.min(TOTAL_CHAPTERS, Math.max(1, Math.round(this._tuneChapter)));
        const ch = this._tuneChapter;
        const map = mapOf(ch), c = chapterInMap(ch);
        this._tuneChapterLbl.string = `图${map}-章${c} · 第${ch}/${TOTAL_CHAPTERS}关`;
        const bases: Record<string, number> = {
            stat: statScaleFor(ch), count: countScaleFor(ch), gold: goldStageMult(ch),
        };
        this._tuneBaseLbl.string =
            `基线：强度×${bases.stat.toFixed(2)} · 数量×${bases.count.toFixed(2)} · 金币×${bases.gold.toFixed(2)}`;
        const t = chapterTuning(ch);
        for (const row of this._tuneRows) {
            const ratio = t[row.field];
            row.val.string = `×${ratio.toFixed(2)}`;
            row.eff.string = `有效 ×${(bases[row.field] * ratio).toFixed(2)}`;
        }
        this._tuneDirtyLbl.string = hasUnsavedTuning() ? '未保存' : '已保存';
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
        lbl.string = text; lbl.fontSize = 14;
        lbl.lineHeight = 20;
        lbl.color = new Color(235, 246, 250, 255);
        lbl.horizontalAlign = HorizontalTextAlignment.CENTER;
        lbl.verticalAlign = VerticalTextAlignment.CENTER;
        lbl.overflow = Label.Overflow.SHRINK;
        styleLabel(lbl);
        return btn;
    }
}
