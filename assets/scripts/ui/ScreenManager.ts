import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, BlockInputEvents, HorizontalTextAlignment, VerticalTextAlignment,
    Input, input, KeyCode, EventKeyboard, game,
} from 'cc';
import { CharDef } from '../data/CharacterDB';
import { CHARS, splitSkillText, SKILL_Q_CD, SKILL_E_CD } from '../data/CharacterDB';
import { DIFFICULTIES, DifficultyDef } from '../data/DifficultyDB';
import { CHAPTERS } from '../data/WaveData';
import { applyArtSprite, loadArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';
import { applyHexButtonSkin, applyHexCardSkin, attachEnableRedraw, drawHexPanel,
    keyboardFocusTarget, registerKeyboardFocus, UI_PALETTE } from '../core/UIStyle';
import { clamp } from '../core/MathUtils';
import { visibleDesignWidth } from '../core/ScreenFit';
import { MetaPageName, MetaPageUI } from './MetaPageUI';
import { SaveSelectUI } from './SaveSelectUI';
import { LobbyUI } from './LobbyUI';

const { ccclass } = _decorator;

export type ScreenName =
    | 'menu' | 'saveSelect' | 'lobby' | 'difficultySelect' | 'charSelect' | 'charDetail'
    | 'playing'
    | 'gameover' | 'chapterClear' | 'pause' | 'settings' | 'exitVeil' | 'mapSelect'
    | MetaPageName;

type BtnCallback = () => void;
type ReportName = 'gameover' | 'chapterClear';

export interface RunReportData {
    chapter: number;
    wave: number;
    kills: number;
    maxCombo: number;
    goldEarned: number;
    score: number;
    finalChapter: boolean;
}

interface RunReportView {
    title: Label;
    subtitle: Label;
    values: Label[];
    primary: Label;
    redraw: () => void;
}

/**
 * ScreenManager — owns all full-screen panels.
 * Call show(name) / hide(name) or transition(from, to).
 * Wire callbacks via setCallbacks() before showing any screen.
 */
@ccclass('ScreenManager')
export class ScreenManager extends Component {
    private _panels: Map<ScreenName, Node> = new Map();
    private _metaPages!: MetaPageUI;
    private _saveSelect!: SaveSelectUI;
    private _lobby!: LobbyUI;
    private _menuArtNode?: Node;
    private _drawSettingsBg?: () => void;
    private _drawExitVeil?: () => void;
    private _drawCharDetailDim?: () => void;
    private _selectionBackdrops = new Map<ScreenName, { art: Node; redraw: () => void }>();
    private _runReports = new Map<ReportName, RunReportView>();
    private _focusedControl?: Node;
    private _activationHeld = false;
    private _shiftHeld = false;

    // ── 英雄介绍弹窗（charDetail）的复用视图 ─────────────────
    // 面板结构只构建一次，内容（标题/立绘/属性/技能描述）随 showCharDetail 填充
    private _detailDef?: CharDef;
    private _detailGfx!: Graphics;
    private _detailPortraitGfx!: Graphics;
    private _detailTitle!: Label;
    private _detailPortrait!: Sprite;
    private _detailStats!: Label;
    private _detailSkillHeaders: Label[] = [];
    private _detailSkillDescs: Label[] = [];
    private _detailSkillIcons: Sprite[] = [];
    /** 选人页标题下的作战难度徽标（setRunDifficulty 填充）。 */
    private _charDiffLabel!: Label;

    // callbacks set by GameManager
    onPlayPressed?:        BtnCallback;   // 进入游戏 → 存档选择
    onSlotPicked?:         (slot: number) => void;   // 存档选择 → 进入存档大厅
    onLobbyPortal?:        BtnCallback;   // 大厅传送门 → 作战地图选择
    onMapPicked?:          BtnCallback;   // 地图页选定（废土）→ 难度选择
    onMapBack?:            BtnCallback;   // 地图页返回 → 存档大厅
    onDifficultyPicked?:   (d: DifficultyDef) => void;   // 难度选择 → 角色选择
    onDifficultyBack?:     BtnCallback;   // 难度选择返回 → 回存档大厅
    onCharSelectBack?:     BtnCallback;   // 选人页返回 → 回存档大厅
    onTestRoomPressed?:    BtnCallback;   // open test room config
    onCharSelected?:       (char: CharDef) => void;
    onRestartPressed?:     BtnCallback;
    onMainMenuPressed?:    BtnCallback;
    onContinuePressed?:    BtnCallback;   // after chapter clear
    onResumePressed?:      BtnCallback;   // resume from pause
    /** 设置页读取当前音量（GameManager 注入，返回 0~1）。 */
    getAudioVolumes?:      () => { bgm: number; sfx: number };
    /** 设置页拖动音量滑杆时回写（GameManager 负责应用与持久化）。 */
    onAudioVolumesChanged?: (bgm: number, sfx: number) => void;
    onButtonSfx?:          BtnCallback;

    onLoad() {
        this._buildMenuPanel();
        this._saveSelect = new SaveSelectUI(this.node, {
            onSlotPicked: (slot) => this.onSlotPicked?.(slot),
            onBack: () => this.transition('saveSelect', 'menu'),
            onButtonSfx: () => this.onButtonSfx?.(),
        });
        for (const [name, panel] of this._saveSelect.entries()) this._panels.set(name as ScreenName, panel);
        this._lobby = new LobbyUI(this.node, {
            onPortalPressed: () => this.onLobbyPortal?.(),
            onMetaPage: (page) => this.transition('lobby', page),
            onBack: () => this.transition('lobby', 'menu'),
            onButtonSfx: () => this.onButtonSfx?.(),
        });
        for (const [name, panel] of this._lobby.entries()) this._panels.set(name as ScreenName, panel);
        this._metaPages = new MetaPageUI(this.node, {
            onBack: () => this.transition(this._currentMetaPage(), 'lobby'),
            onButtonSfx: () => this.onButtonSfx?.(),
        });
        for (const [name, panel] of this._metaPages.entries()) this._panels.set(name, panel);
        this._buildMapSelectPanel();
        this._buildDifficultySelectPanel();
        this._buildCharSelectPanel();
        // 英雄介绍弹窗在选人页之后构建，保证层级在选人卡之上（点击遮罩不穿透）
        this._buildCharDetailPanel();
        this._buildGameoverPanel();
        this._buildChapterClearPanel();
        this._buildPausePanel();
        this._buildSettingsPanel();
        // start with everything hidden
        this._panels.forEach(p => p.active = false);
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this._onKeyUp, this);
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this._onKeyUp, this);
    }

    /** 大厅传送门动画逐帧推进（ScreenManager 常驻，面板隐藏时 LobbyUI 自行跳过）。 */
    update(dt: number) {
        this._lobby?.update(dt);
    }

    fitToVisible(): void {
        const width = visibleDesignWidth();
        this._panels.get('menu')?.getComponent(UITransform)?.setContentSize(width, 720);
        this._menuArtNode?.getComponent(UITransform)?.setContentSize(width, 720);
        this._panels.get('settings')?.getComponent(UITransform)?.setContentSize(width, 720);
        this._drawSettingsBg?.();
        this._panels.get('charDetail')?.getComponent(UITransform)?.setContentSize(width, 720);
        this._drawCharDetailDim?.();
        for (const name of ['mapSelect', 'difficultySelect', 'charSelect'] as ScreenName[]) {
            this._panels.get(name)?.getComponent(UITransform)?.setContentSize(width, 720);
            const backdrop = this._selectionBackdrops.get(name);
            backdrop?.art.getComponent(UITransform)?.setContentSize(width, 720);
            backdrop?.redraw();
        }
        this._panels.get('exitVeil')?.getComponent(UITransform)?.setContentSize(width, 720);
        this._drawExitVeil?.();
        for (const name of ['gameover', 'chapterClear'] as ReportName[]) {
            this._panels.get(name)?.getComponent(UITransform)?.setContentSize(width, 720);
            this._runReports.get(name)?.redraw();
        }
        this._saveSelect?.fitToVisible();
        this._lobby?.fitToVisible();
        this._metaPages?.fitToVisible();
    }

    // ── public API ────────────────────────────────────────────

    show(name: ScreenName) {
        this._clearKeyboardFocus();
        const p = this._panels.get(name);
        if (p) p.active = true;
        if (name === 'menu' || name === 'saveSelect' || name === 'lobby' || name === 'settings'
            || name === 'gameover' || name === 'chapterClear' || name === 'charDetail'
            || name === 'mapSelect' || name === 'difficultySelect' || name === 'charSelect') {
            this.fitToVisible();
        }
        if (name === 'tasks' || name === 'codex' || name === 'achievements') {
            this._metaPages.fitToVisible();
            this._metaPages.refresh(name);
        } else if (name === 'settings') {
            this._refreshSettings();
        } else if (name === 'saveSelect') {
            this._saveSelect.refresh();
        } else if (name === 'lobby') {
            this._lobby.refresh();
        }
    }

    hide(name: ScreenName) {
        this._clearKeyboardFocus();
        const p = this._panels.get(name);
        if (p) p.active = false;
    }

    hideAll() {
        this._clearKeyboardFocus();
        this._panels.forEach(p => p.active = false);
    }

    /** 只在最上层可见页面循环焦点；隐藏页、锁定卡和空存档删除键均跳过。 */
    private _keyboardPanel(): Node | undefined {
        for (let i = this.node.children.length - 1; i >= 0; i--) {
            const panel = this.node.children[i];
            if (panel.active && this._panels.get(panel.name as ScreenName) === panel) return panel;
        }
        return undefined;
    }

    private _keyboardControls(panel: Node): Node[] {
        const controls: Node[] = [];
        const visit = (node: Node) => {
            if (!node.activeInHierarchy) return;
            const focus = keyboardFocusTarget(node);
            if (focus && !focus.isDisabled()) controls.push(node);
            for (const child of node.children) visit(child);
        };
        visit(panel);
        return controls;
    }

    private _clearKeyboardFocus(): void {
        if (this._focusedControl?.isValid) keyboardFocusTarget(this._focusedControl)?.setFocused(false);
        this._focusedControl = undefined;
        this._activationHeld = false;
    }

    private _moveKeyboardFocus(panel: Node, direction: -1 | 1): void {
        const controls = this._keyboardControls(panel);
        if (!controls.length) return;
        const current = controls.indexOf(this._focusedControl!);
        const next = current < 0
            ? (direction > 0 ? 0 : controls.length - 1)
            : (current + direction + controls.length) % controls.length;
        this._clearKeyboardFocus();
        this._focusedControl = controls[next];
        keyboardFocusTarget(controls[next])?.setFocused(true);
    }

    private _onKeyDown = (event: EventKeyboard) => {
        if (event.keyCode === KeyCode.SHIFT_LEFT || event.keyCode === KeyCode.SHIFT_RIGHT) {
            this._shiftHeld = true;
            return;
        }
        const panel = this._keyboardPanel();
        if (!panel) return;
        const key = event.keyCode;
        if (key === KeyCode.TAB || key === KeyCode.ARROW_UP || key === KeyCode.ARROW_DOWN
            || key === KeyCode.ARROW_LEFT || key === KeyCode.ARROW_RIGHT) {
            (event as any).preventDefault?.();
            const direction: -1 | 1 = key === KeyCode.ARROW_UP || key === KeyCode.ARROW_LEFT
                || (key === KeyCode.TAB && this._shiftHeld) ? -1 : 1;
            if ((key === KeyCode.ARROW_LEFT || key === KeyCode.ARROW_RIGHT) && this._focusedControl) {
                const focus = keyboardFocusTarget(this._focusedControl);
                if (focus?.onDirection?.(direction)) return;
            }
            this._moveKeyboardFocus(panel, direction);
            return;
        }
        if (key !== KeyCode.ENTER && key !== KeyCode.SPACE) return;
        (event as any).preventDefault?.();
        if (this._activationHeld) return;
        this._activationHeld = true;
        const controls = this._keyboardControls(panel);
        if (!this._focusedControl || controls.indexOf(this._focusedControl) < 0) {
            this._moveKeyboardFocus(panel, 1);
            return;
        }
        const node = this._focusedControl;
        const focus = keyboardFocusTarget(node);
        if (focus?.activate) focus.activate();
        else node.emit(Node.EventType.TOUCH_END, { propagationStopped: false });
        if (!node.isValid || !node.activeInHierarchy || this._keyboardPanel() !== panel) {
            this._clearKeyboardFocus();
        }
    };

    private _onKeyUp = (event: EventKeyboard) => {
        if (event.keyCode === KeyCode.SHIFT_LEFT || event.keyCode === KeyCode.SHIFT_RIGHT) this._shiftHeld = false;
        if (event.keyCode === KeyCode.ENTER || event.keyCode === KeyCode.SPACE) this._activationHeld = false;
    };

    /** 失败与章节通关共用行动报告，仅数据和局部状态色不同。 */
    setRunReport(name: ReportName, data: RunReportData): void {
        const view = this._runReports.get(name);
        if (!view) return;
        const won = name === 'chapterClear';
        view.title.string = won
            ? (data.finalChapter ? '六章通关！' : `第 ${data.chapter} 章通关！`)
            : '行动终止';
        view.subtitle.string = won
            ? `完成第 ${data.chapter} 章 · 抵达第 ${data.wave} 波`
            : `止步第 ${data.chapter} 章 · 第 ${data.wave} 波`;
        const values = [data.kills, data.maxCombo, data.goldEarned, data.score];
        view.values.forEach((label, i) => { label.string = String(Math.max(0, Math.floor(values[i]))); });
        view.primary.string = won
            ? (data.finalChapter ? '进入无尽模式' : '进入下一章')
            : '重新开始';
    }

    transition(from: ScreenName, to: ScreenName) {
        this.hide(from);
        this.show(to);
    }

    /** 难度选定后由 GameManager 调用：选人页标题下展示当前作战难度。 */
    setRunDifficulty(def?: DifficultyDef) {
        if (!this._charDiffLabel) return;
        if (!def) { this._charDiffLabel.string = ''; return; }
        this._charDiffLabel.string =
            `作战难度 ${def.name}  ·  怪物数值×${def.statMult}` +
            (def.bossSkillCut ? '  ·  Boss 仅 1/3 技能' : '');
        this._charDiffLabel.color = Color.fromHEX(new Color(), def.color);
    }

    // ── panel builders ────────────────────────────────────────

    private _buildMenuPanel() {
        const p = this._mkPanel('menu', 1280, 720);

        // background — flat color first (fallback while title_screen.png loads / if missing),
        // then a full-screen Sprite drawn on top of it, behind the title text below.
        // 底板与立绘都按可见宽度铺满（全面屏横屏>1280时无左右黑边）。
        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(12, 8, 22, 255);
        bg.fillRect(-1600, -360, 3200, 720);

        const bgArtNode = new Node('BgArt'); bgArtNode.setParent(p);
        this._menuArtNode = bgArtNode;
        const menuW = Math.max(1280, visibleDesignWidth());
        bgArtNode.addComponent(UITransform).setContentSize(menuW, 720);
        const bgArtSprite = bgArtNode.addComponent(Sprite);
        bgArtSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        applyArtSprite(bgArtSprite, 'title_screen');

        const titleNode = new Node('Title'); titleNode.setParent(p);
        titleNode.setPosition(new Vec3(0, 236, 0));
        titleNode.addComponent(UITransform).setContentSize(710, 92);
        const title = titleNode.addComponent(Label);
        title.string = 'HEXBLAST'; title.fontSize = 76;
        title.color = UI_PALETTE.text;
        title.horizontalAlign = HorizontalTextAlignment.CENTER;
        title.verticalAlign = VerticalTextAlignment.CENTER;
        styleLabel(title, { outlineWidth: 3 });

        const subtitleNode = new Node('Subtitle'); subtitleNode.setParent(p);
        subtitleNode.setPosition(new Vec3(0, 178, 0));
        subtitleNode.addComponent(UITransform).setContentSize(560, 32);
        const subtitle = subtitleNode.addComponent(Label);
        subtitle.string = '海克斯行动  ·  废土前线'; subtitle.fontSize = 21;
        subtitle.color = UI_PALETTE.text;
        subtitle.horizontalAlign = HorizontalTextAlignment.CENTER;
        styleLabel(subtitle, { outline: false, bold: false });

        // title_screen 已移除全部烧录按钮，中下部是自然延续的城市天际线。
        // 操作区只负责定位真实代码按钮，不再绘制遮挡背景的大矩形底板。
        const menuActions = new Node('MenuActions'); menuActions.setParent(p);
        menuActions.setPosition(new Vec3(0, -70, 0));
        menuActions.addComponent(UITransform).setContentSize(568, 410);
        const menuPanelG = menuActions.addComponent(Graphics);
        const drawMenuPanel = () => {
            menuPanelG.clear();
            drawHexPanel(menuPanelG, -250, -197, 500, 390, UI_PALETTE.cyan, 219);
        };
        drawMenuPanel();
        attachEnableRedraw(menuActions, drawMenuPanel);

        const btn = this._mkBtn(menuActions, '开始游戏', 0, 105, 450, 64, new Color(20, 220, 210, 255));
        btn.on(Node.EventType.TOUCH_END, () => this.onPlayPressed?.(), this);

        // 测试房间：主页直达的 Boss 训练场入口，配置面板由 GameManager 弹出
        const testBtn = this._mkBtn(menuActions, '测试房间', 0, 24, 330, 46, new Color(190, 120, 255, 255));
        testBtn.on(Node.EventType.TOUCH_END, () => this.onTestRoomPressed?.(), this);

        this._mkBtn(menuActions, '升级  ·  即将开放', 0, -36, 330, 46, new Color(80, 118, 135, 255), true);
        const settingsBtn = this._mkBtn(menuActions, '设置', 0, -96, 330, 46, new Color(70, 105, 130, 255));
        settingsBtn.on(Node.EventType.TOUCH_END, () => this.show('settings'), this);
        // 退出：两步确认避免主页误触；确认后 game.end()（native 关窗、web 尝试
        // 关页）。浏览器拦截 window.close 时落下告别遮罩，提示直接关闭窗口。
        const exitBtn = this._mkBtn(menuActions, '退出', 0, -156, 330, 46, new Color(120, 62, 55, 255));
        const exitLbl = exitBtn.getChildByName('L')!.getComponent(Label)!;
        let exitArmed = false;
        let exitResetTimer: any = 0;
        exitBtn.on(Node.EventType.TOUCH_END, () => {
            if (!exitArmed) {
                exitArmed = true;
                exitLbl.string = '再次点击确认退出';
                clearTimeout(exitResetTimer);
                exitResetTimer = setTimeout(() => { exitArmed = false; exitLbl.string = '退出'; }, 3000);
                return;
            }
            clearTimeout(exitResetTimer);
            game.end();
            // 200ms 后仍在本页（关闭被拦截）→ 告别遮罩兜底
            setTimeout(() => this._showExitVeil(), 200);
        }, this);
        // 任务树/图鉴/成就档案入口已迁入存档大厅（LobbyUI 情报终端），首页不再展示。
    }

    /** 返回按钮只会在三个元进度页面内触发；取当前激活页作为 transition 来源。 */
    private _currentMetaPage(): MetaPageName {
        for (const name of ['tasks', 'codex', 'achievements'] as MetaPageName[]) {
            if (this._panels.get(name)?.active) return name;
        }
        return 'tasks';
    }

    // ── 作战地图选择页 ─────────────────────────────────────────

    /** 作战准备三页沿用大厅的废土远景，宽屏时与页头光带一起重排。 */
    private _buildSelectionBackdrop(panel: Node): void {
        const artNode = new Node('AmbientArt'); artNode.setParent(panel);
        artNode.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        const art = artNode.addComponent(Sprite);
        art.sizeMode = Sprite.SizeMode.CUSTOM;
        art.color = new Color(220, 232, 244, 135);
        applyArtSprite(art, 'bg_chapter1');

        const veilNode = new Node('Veil'); veilNode.setParent(panel);
        const veil = veilNode.addComponent(Graphics);
        const redraw = () => {
            const width = visibleDesignWidth();
            veil.clear();
            veil.fillColor = new Color(15, 27, 43, 155);
            veil.fillRect(-width / 2, -360, width, 720);
            veil.fillColor = new Color(UI_PALETTE.cyan.r, UI_PALETTE.cyan.g, UI_PALETTE.cyan.b, 12);
            veil.fillRect(-width / 2, 210, width, 150);
            veil.strokeColor = new Color(UI_PALETTE.cyan.r, UI_PALETTE.cyan.g, UI_PALETTE.cyan.b, 90);
            veil.lineWidth = 1;
            veil.moveTo(-600, 210); veil.lineTo(600, 210); veil.stroke();
        };
        redraw();
        this._selectionBackdrops.set(panel.name as ScreenName, { art: artNode, redraw });
    }

    /**
     * 大厅传送门之后的第一站：选择出击地图。当前全部章节（第一章~第六章）
     * 位于废土地图；深海地图为占位（2026-09-21 新增，选废土后进入难度选择）。
     */
    private _buildMapSelectPanel() {
        const p = this._mkPanel('mapSelect', 1280, 720);

        const bg = p.addComponent(Graphics);
        bg.fillColor = UI_PALETTE.deep;
        bg.fillRect(-1600, -360, 3200, 720);
        this._buildSelectionBackdrop(p);

        const backBtn = this._mkBtn(p, '返回大厅', -560, 320, 160, 42, new Color(78, 111, 135, 255));
        backBtn.on(Node.EventType.TOUCH_END, () => this.onMapBack?.(), this);

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 280, 0));
        tn.addComponent(UITransform).setContentSize(500, 44);
        const tl = tn.addComponent(Label);
        tl.string = '— 选择作战地图 —';
        tl.fontSize = 28; tl.color = new Color(255, 215, 90, 255);
        styleLabel(tl);

        const sub = new Node('Sub'); sub.setParent(p);
        sub.setPosition(new Vec3(0, 244, 0));
        sub.addComponent(UITransform).setContentSize(760, 22);
        const sl = sub.addComponent(Label);
        sl.string = '主线六章各有独立战场 · 选定后进入难度选择';
        sl.fontSize = 14; sl.color = new Color(150, 172, 190, 235);
        styleLabel(sl);

        // 地图1 废土（可选）：全部章节所在地图
        const maps: { x: number; name: string; desc: string; accent: Color; locked: boolean }[] = [
            { x: -240, name: '地图 1 · 废土', desc: '六章连续战场 · 从废土街道出发', accent: new Color(40, 224, 218, 255), locked: false },
            { x: 240,  name: '地图 2 · 深海', desc: '全新深海战场 · 敬请期待', accent: new Color(90, 90, 110, 255), locked: true },
        ];
        for (const m of maps) {
            const card = new Node(`Map_${m.name}`); card.setParent(p);
            card.setPosition(new Vec3(m.x, -20, 0));
            card.addComponent(UITransform).setContentSize(420, 360);

            if (m.locked) this._buildLockedMapPreview(card);
            else this._buildChapterMapPreview(card);

            const nameN = new Node('Name'); nameN.setParent(card);
            nameN.setPosition(new Vec3(0, -70, 0));
            nameN.addComponent(UITransform).setContentSize(380, 40);
            const nl = nameN.addComponent(Label);
            nl.string = m.locked ? `${m.name} · 即将开放` : m.name;
            nl.fontSize = 24;
            nl.color = m.locked ? new Color(166, 180, 194, 255) : new Color(235, 246, 250, 255);
            styleLabel(nl);

            const descN = new Node('Desc'); descN.setParent(card);
            descN.setPosition(new Vec3(0, -126, 0));
            descN.addComponent(UITransform).setContentSize(380, 60);
            const dl = descN.addComponent(Label);
            dl.string = m.desc;
            dl.fontSize = 15; dl.lineHeight = 22;
            dl.color = m.locked ? new Color(152, 170, 186, 245) : new Color(168, 190, 206, 245);
            dl.horizontalAlign = HorizontalTextAlignment.CENTER;
            dl.overflow = Label.Overflow.SHRINK;
            dl.enableWrapText = true;
            styleLabel(dl);

            applyHexCardSkin(card, 420, 360, m.accent, m.locked);

            if (!m.locked) {
                card.on(Node.EventType.TOUCH_END, () => this.onMapPicked?.(), this);
            }
        }
    }

    /** 主线地图卡展示六章真实场景，避免只用首章画面代表整段旅程。 */
    private _buildChapterMapPreview(card: Node): void {
        const grid = new Node('ChapterPreviews'); grid.setParent(card);
        grid.setPosition(new Vec3(0, 46, 0));
        for (const [i, chapter] of CHAPTERS.slice(0, 6).entries()) {
            const tile = new Node(`Chapter_${chapter.id}`); tile.setParent(grid);
            tile.setPosition(new Vec3(-128 + i % 3 * 128, 38 - Math.floor(i / 3) * 76, 0));
            tile.addComponent(UITransform).setContentSize(120, 68);
            const frame = tile.addComponent(Graphics);
            frame.fillColor = new Color(8, 20, 32, 255);
            frame.roundRect(-60, -34, 120, 68, 6); frame.fill();
            frame.strokeColor = new Color(105, 150, 174, 160);
            frame.lineWidth = 1;
            frame.roundRect(-60, -34, 120, 68, 6); frame.stroke();

            const artNode = new Node('Art'); artNode.setParent(tile);
            artNode.addComponent(UITransform).setContentSize(116, 64);
            const art = artNode.addComponent(Sprite);
            art.sizeMode = Sprite.SizeMode.CUSTOM;
            art.color = new Color(235, 245, 252, 235);
            applyArtSprite(art, chapter.bgKey);

            const caption = new Node('ChapterCaption'); caption.setParent(tile);
            caption.setPosition(new Vec3(0, -22, 0));
            caption.addComponent(UITransform).setContentSize(116, 20);
            const captionBg = caption.addComponent(Graphics);
            captionBg.fillColor = new Color(8, 20, 32, 225);
            captionBg.fillRect(-58, -10, 116, 20);
            const title = new Node('Title'); title.setParent(caption);
            title.addComponent(UITransform).setContentSize(110, 18);
            const label = title.addComponent(Label);
            label.string = `${chapter.id < 10 ? `0${chapter.id}` : chapter.id} ${chapter.name}`;
            label.fontSize = 14; label.lineHeight = 18;
            label.color = new Color(225, 241, 249, 255);
            label.overflow = Label.Overflow.CLAMP;
            label.enableWrapText = false;
            styleLabel(label);
        }
    }

    /** 未开放地图使用明确的雷达占位，不借用现有章节的实验室底图。 */
    private _buildLockedMapPreview(card: Node): void {
        const preview = new Node('LockedPreview'); preview.setParent(card);
        preview.setPosition(new Vec3(0, 46, 0));
        preview.addComponent(UITransform).setContentSize(376, 176);
        const g = preview.addComponent(Graphics);
        g.fillColor = new Color(12, 28, 46, 255);
        g.roundRect(-188, -88, 376, 176, 10); g.fill();
        g.strokeColor = new Color(92, 125, 149, 120);
        g.lineWidth = 1;
        g.roundRect(-188, -88, 376, 176, 10); g.stroke();
        g.strokeColor = new Color(65, 116, 148, 85);
        for (const radius of [34, 64, 78]) { g.circle(0, 0, radius); g.stroke(); }
        g.moveTo(-170, 0); g.lineTo(170, 0); g.stroke();
        g.moveTo(0, -80); g.lineTo(0, 80); g.stroke();
        const title = new Node('UnknownArea'); title.setParent(preview);
        title.addComponent(UITransform).setContentSize(250, 32);
        const label = title.addComponent(Label);
        label.string = '未探明区域';
        label.fontSize = 22; label.lineHeight = 28;
        label.color = new Color(178, 199, 212, 245);
        styleLabel(label);
    }

    // ── 难度选择页 ─────────────────────────────────────────────

    /**
     * 大厅传送门之后、选人页之前的独立页面：四档难度卡（简单/普通/困难/地狱）。
     * 点击卡片选定难度并进入角色选择；数值乘区见 data/DifficultyDB.ts。
     */
    private _buildDifficultySelectPanel() {
        const p = this._mkPanel('difficultySelect', 1280, 720);

        const bg = p.addComponent(Graphics);
        bg.fillColor = UI_PALETTE.deep;
        bg.fillRect(-1600, -360, 3200, 720);
        this._buildSelectionBackdrop(p);

        const backBtn = this._mkBtn(p, '返回大厅', -560, 320, 160, 42, new Color(78, 111, 135, 255));
        backBtn.on(Node.EventType.TOUCH_END, () => this.onDifficultyBack?.(), this);

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 280, 0));
        tn.addComponent(UITransform).setContentSize(500, 44);
        const tl = tn.addComponent(Label);
        tl.string = '— 选择作战难度 —';
        tl.fontSize = 28; tl.color = new Color(255, 215, 90, 255);
        styleLabel(tl);

        const sub = new Node('Sub'); sub.setParent(p);
        sub.setPosition(new Vec3(0, 244, 0));
        sub.addComponent(UITransform).setContentSize(760, 22);
        const sl = sub.addComponent(Label);
        sl.string = '难度只影响怪物数值（移速不变）· 选定后再挑选英雄';
        sl.fontSize = 15; sl.color = new Color(190, 208, 222, 245);
        styleLabel(sl);

        DIFFICULTIES.forEach((def, i) => {
            const col = Color.fromHEX(new Color(), def.color);
            const diffCard = new Node(`Diff_${def.id}`); diffCard.setParent(p);
            diffCard.setPosition(new Vec3(-435 + i * 300, -20, 0));
            diffCard.addComponent(UITransform).setContentSize(270, 280);

            const nameN = new Node('Name'); nameN.setParent(diffCard);
            nameN.setPosition(new Vec3(0, 96, 0));
            nameN.addComponent(UITransform).setContentSize(240, 40);
            const nameLbl = nameN.addComponent(Label);
            nameLbl.string = def.name;
            nameLbl.fontSize = 32;
            nameLbl.color = col;
            styleLabel(nameLbl);

            const lineN = new Node('Line'); lineN.setParent(diffCard);
            const lineG = lineN.addComponent(Graphics);
            lineG.strokeColor = new Color(col.r, col.g, col.b, 90);
            lineG.lineWidth = 1;
            lineG.moveTo(-96, 66); lineG.lineTo(96, 66); lineG.stroke();

            const descN = new Node('Desc'); descN.setParent(diffCard);
            descN.setPosition(new Vec3(0, 8, 0));
            descN.addComponent(UITransform).setContentSize(240, 92);
            const descLbl = descN.addComponent(Label);
            descLbl.string = def.desc;
            descLbl.fontSize = 16;
            descLbl.lineHeight = 26;
            descLbl.color = new Color(212, 224, 240, 245);
            descLbl.horizontalAlign = HorizontalTextAlignment.CENTER;
            descLbl.verticalAlign = VerticalTextAlignment.CENTER;
            descLbl.enableWrapText = true;
            styleLabel(descLbl);

            const hintN = new Node('Hint'); hintN.setParent(diffCard);
            hintN.setPosition(new Vec3(0, -108, 0));
            hintN.addComponent(UITransform).setContentSize(240, 22);
            const hintLbl = hintN.addComponent(Label);
            hintLbl.string = '点击进入英雄选择';
            hintLbl.fontSize = 15;
            hintLbl.color = new Color(196, 214, 228, 245);
            styleLabel(hintLbl);

            applyHexCardSkin(diffCard, 270, 280, col);

            diffCard.on(Node.EventType.TOUCH_END, () => this.onDifficultyPicked?.(def), this);
        });
    }

    private _buildCharSelectPanel() {
        const p = this._mkPanel('charSelect', 1280, 720);

        const bg = p.addComponent(Graphics);
        bg.fillColor = UI_PALETTE.deep;
        bg.fillRect(-1600, -360, 3200, 720);
        this._buildSelectionBackdrop(p);

        // 选人页位于存档大厅之后：左上角提供返回大厅出口（卡片在 y≤240，
        // 按钮放 320 高度不与标题/卡片重叠）。
        const backBtn = this._mkBtn(p, '返回大厅', -560, 320, 160, 42, new Color(78, 111, 135, 255));
        backBtn.on(Node.EventType.TOUCH_END, () => this.onCharSelectBack?.(), this);

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 280, 0));
        tn.addComponent(UITransform).setContentSize(500, 44);
        const tl = tn.addComponent(Label);
        tl.string = '— 选择角色 —';
        tl.fontSize = 28; tl.color = new Color(255, 215, 90, 255);
        styleLabel(tl);

        // 标题下的作战难度徽标：玩家在难度选择页点选后由 setRunDifficulty() 填充
        const diffN = new Node('DiffBadge'); diffN.setParent(p);
        diffN.setPosition(new Vec3(0, 250, 0));
        diffN.addComponent(UITransform).setContentSize(700, 22);
        this._charDiffLabel = diffN.addComponent(Label);
        this._charDiffLabel.string = '';
        this._charDiffLabel.fontSize = 15;
        this._charDiffLabel.color = new Color(150, 172, 190, 235);
        styleLabel(this._charDiffLabel);

        // 6 character cards in a 3×2 grid: portrait on top, nameplate button below
        const names  = CHARS.map(c => c.name);
        // 卡框、名牌、战斗棋子和技能特效共用 CharacterDB 的身份色。
        // 旧手写数组把 Vivian/Olia/Graf/Liana 分别错配成粉/绿/黄/紫，
        // 选人页与进入战斗后的视觉语言完全脱节。
        const colors = CHARS.map(c => Color.fromHEX(new Color(), c.color));
        for (let i = 0; i < 6; i++) {
            const col = i % 3, row = Math.floor(i / 3);
            const cx = -400 + col * 400;
            // 卡片加高到280px容纳14px速览正文与40px双按钮行；行距295保证
            // 两排卡片之间仍有15px间隙，底排距画布底边保留25px安全区。
            const cy = 100 - row * 295;

            const card = new Node(`Card_${i}`); card.setParent(p);
            card.setPosition(new Vec3(cx, cy, 0));
            card.addComponent(UITransform).setContentSize(360, 280);

            const idx = i;
            const def = CHARS[idx];
            const charId = def?.id;
            const locked = !!def && !def.unlocked;

            // 整张卡提供低对比实体底板，把居中的头像、名牌和说明收束为一组；
            // 旧版只有头像框与名牌，四行左对齐文字像漂在页面背景上。
            const cardG = card.addComponent(Graphics);
            const cardCol = colors[i] ?? new Color(80, 140, 180, 255);
            drawHexPanel(cardG, -180, -140, 360, 280, cardCol, locked ? 218 : 242);
            // 整张角色卡才是实际点击单位，因此身份色选框必须包住完整的
            // “立绘—名牌—定位”信息组。只框头像会误导为头像裁切框或选中态。
            cardG.strokeColor = new Color(cardCol.r, cardCol.g, cardCol.b, locked ? 72 : 188);
            cardG.lineWidth = locked ? 1 : 2;
            cardG.roundRect(-180, -140, 360, 280, 18); cardG.stroke();
            if (!locked) {
                cardG.strokeColor = new Color(cardCol.r, cardCol.g, cardCol.b, 255);
                cardG.lineWidth = 3;
                const corner = 18;
                for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                    const x = sx * 178, y = sy * 138;
                    cardG.moveTo(x, y - sy * corner); cardG.lineTo(x, y); cardG.lineTo(x - sx * corner, y);
                    cardG.stroke();
                }
            }

            // 头像框收窄到96px，为底部「选择/介绍」双按钮行腾出高度。
            const frameN = new Node('PortraitFrame'); frameN.setParent(card);
            frameN.setPosition(new Vec3(0, 84, 0));
            frameN.addComponent(UITransform).setContentSize(96, 96);
            const frameG = frameN.addComponent(Graphics);
            frameG.fillColor = new Color(9, 15, 24, 245);
            frameG.fillRect(-48, -48, 96, 96);
            frameG.strokeColor = new Color(cardCol.r, cardCol.g, cardCol.b, 150);
            frameG.lineWidth = 1.5;
            frameG.rect(-48, -48, 96, 96); frameG.stroke();

            if (charId) this._loadPortrait(card, `char_${charId}`, 88, 84);

            // 名牌从按钮降为纯标签：整卡点击不再直接开战，出战入口收口到底部
            // 「选择出战」按钮，玩家想先看技能时不会误触开局。
            const nameN = new Node('Name'); nameN.setParent(card);
            nameN.setPosition(new Vec3(0, 12, 0));
            nameN.addComponent(UITransform).setContentSize(320, 30);
            const nameLbl = nameN.addComponent(Label);
            nameLbl.string = names[i] ?? `Char${i}`;
            nameLbl.fontSize = 20;
            nameLbl.lineHeight = 24;
            nameLbl.color = locked
                ? new Color(150, 150, 150, 220)
                : (colors[i] ?? new Color(80, 140, 180, 255));
            nameLbl.overflow = Label.Overflow.SHRINK;
            nameLbl.enableWrapText = false;
            styleLabel(nameLbl);

            if (locked) {
                // Dim the whole card and show a lock badge + unlock hint instead
                // of wiring the select callback — clicking a locked card does nothing.
                const dim = new Node('LockDim'); dim.setParent(card);
                // LockDim 创建时已是卡片最上层。不要再塞回 sibling 1：Portrait
                // 本身也在 sibling 1，插入后会把立绘推到遮罩上方，造成“黑框只遮
                // 下半张卡、角色仍全亮”的层级穿帮。后续锁标与提示继续创建，
                // 自然位于遮罩之上。
                dim.setPosition(Vec3.ZERO);
                dim.addComponent(UITransform).setContentSize(360, 280);
                const dimG = dim.addComponent(Graphics);
                dimG.fillColor = new Color(0, 0, 0, 115);
                dimG.fillRect(-180, -140, 360, 280);

                const lockNameN = new Node('LockName'); lockNameN.setParent(card);
                lockNameN.setPosition(new Vec3(0, 12, 0));
                lockNameN.addComponent(UITransform).setContentSize(320, 30);
                const lockName = lockNameN.addComponent(Label);
                lockName.string = names[i] ?? `Char${i}`;
                lockName.fontSize = 20;
                lockName.lineHeight = 24;
                lockName.color = new Color(174, 190, 204, 255);
                lockName.overflow = Label.Overflow.SHRINK;
                lockName.enableWrapText = false;
                styleLabel(lockName);

                const lockN = new Node('LockIcon'); lockN.setParent(card);
                lockN.setPosition(new Vec3(0, 56, 0));
                lockN.addComponent(UITransform).setContentSize(180, 40);
                const lockLbl = lockN.addComponent(Label);
                lockLbl.string = '未解锁'; lockLbl.fontSize = 22;
                lockLbl.color = new Color(220, 220, 220, 255);
                styleLabel(lockLbl);

                const hintN = new Node('LockHint'); hintN.setParent(card);
                hintN.setPosition(new Vec3(0, -110, 0));
                hintN.addComponent(UITransform).setContentSize(344, 30);
                const hintLbl = hintN.addComponent(Label);
                hintLbl.string = def?.unlockHint ?? '未解锁';
                hintLbl.fontSize = 16;
                hintLbl.lineHeight = 20;
                hintLbl.color = new Color(255, 202, 112, 255);
                hintLbl.overflow = Label.Overflow.SHRINK;
                hintLbl.enableWrapText = true;
                styleLabel(hintLbl);
            } else {
                // 被动一行 + Q/E/R 技能名一行的速览；完整效果说明、冷却与
                // 基础属性在「英雄介绍」弹窗里展开（见 _buildCharDetailPanel）。
                // 正文14px/行距21px：最长被动（狂战士31字符）换行后共3行，
                // 68px文本框无需触发SHRINK缩字。
                const skN = new Node('Skills'); skN.setParent(card);
                skN.setPosition(new Vec3(0, -40, 0));
                skN.addComponent(UITransform).setContentSize(332, 68);
                const skLbl = skN.addComponent(Label);
                if (def) {
                    skLbl.string = `被动 · ${def.desc}\n` +
                        `Q ${splitSkillText(def.skills.q)[0]}  ·  E ${splitSkillText(def.skills.e)[0]}  ·  R ${splitSkillText(def.skills.r)[0]}`;
                } else {
                    skLbl.string = '';
                }
                skLbl.fontSize = 14;
                skLbl.lineHeight = 21;
                skLbl.color = new Color(210, 222, 238, 248);
                skLbl.horizontalAlign = HorizontalTextAlignment.CENTER;
                skLbl.verticalAlign = VerticalTextAlignment.CENTER;
                skLbl.overflow = Label.Overflow.SHRINK;
                skLbl.enableWrapText = true;
                styleLabel(skLbl);

                // 选择出战：点击后直接开始游戏
                const selBtn = this._mkBtn(card, '选择出战', -85, -110, 150, 40,
                    colors[i] ?? new Color(80, 140, 180, 255));
                selBtn.on(Node.EventType.TOUCH_END,
                    () => this.onCharSelected?.(CHARS[idx]!), this);

                // 英雄介绍：弹出该角色的详细技能介绍，不直接开战
                const introBtn = this._mkBtn(card, '英雄介绍', 85, -110, 150, 40,
                    new Color(62, 120, 200, 255));
                introBtn.on(Node.EventType.TOUCH_END,
                    () => this.showCharDetail(CHARS[idx]!), this);
            }
        }
    }

    // ── 英雄介绍弹窗 ─────────────────────────────────────────

    /**
     * 全屏模态弹窗：左侧立绘 + 基础属性，右侧被动与 Q/E/R 的详细效果和冷却。
     * 覆盖在选人页之上并拦截触摸，防止误点背后的卡片；内容随 showCharDetail()
     * 填充。面板登记进 _panels，因此 hideAll()（含 GameManager 切状态）会一并关闭。
     */
    private _buildCharDetailPanel() {
        const p = this._mkPanel('charDetail', visibleDesignWidth(), 720);

        const dim = p.addComponent(Graphics);
        const drawDim = () => {
            const width = visibleDesignWidth();
            dim.clear();
            dim.fillColor = new Color(4, 6, 12, 170);
            dim.fillRect(-width / 2, -360, width, 720);
        };
        this._drawCharDetailDim = drawDim;
        drawDim();
        attachEnableRedraw(p, drawDim);
        // 拦截触摸：弹窗打开期间，落在遮罩上的点击不会穿透到选人卡按钮
        const block = (ev: any) => { ev.propagationStopped = true; };
        p.on(Node.EventType.TOUCH_START, block, this);
        p.on(Node.EventType.TOUCH_END, block, this);

        const dlg = new Node('Dialog'); dlg.setParent(p);
        dlg.addComponent(UITransform).setContentSize(880, 580);
        this._detailGfx = dlg.addComponent(Graphics);

        const tn = new Node('Title'); tn.setParent(dlg);
        tn.setPosition(new Vec3(0, 244, 0));
        tn.addComponent(UITransform).setContentSize(700, 40);
        this._detailTitle = tn.addComponent(Label);
        this._detailTitle.fontSize = 32;
        this._detailTitle.overflow = Label.Overflow.SHRINK;
        this._detailTitle.enableWrapText = false;
        styleLabel(this._detailTitle);

        // 左列：立绘 + 基础属性
        const pf = new Node('PortraitFrame'); pf.setParent(dlg);
        pf.setPosition(new Vec3(-330, 140, 0));
        pf.addComponent(UITransform).setContentSize(148, 148);
        this._detailPortraitGfx = pf.addComponent(Graphics);

        const pn = new Node('Portrait'); pn.setParent(dlg);
        pn.setPosition(new Vec3(-330, 140, 0));
        pn.addComponent(UITransform).setContentSize(132, 132);
        this._detailPortrait = pn.addComponent(Sprite);
        this._detailPortrait.sizeMode = Sprite.SizeMode.CUSTOM;

        const stN = new Node('Stats'); stN.setParent(dlg);
        stN.setPosition(new Vec3(-330, -46, 0));
        stN.addComponent(UITransform).setContentSize(220, 196);
        this._detailStats = stN.addComponent(Label);
        this._detailStats.fontSize = 16;
        this._detailStats.lineHeight = 27;
        this._detailStats.color = new Color(198, 212, 230, 250);
        this._detailStats.horizontalAlign = HorizontalTextAlignment.LEFT;
        this._detailStats.verticalAlign = VerticalTextAlignment.TOP;
        styleLabel(this._detailStats);

        // 右列：被动 + Q/E/R，每段「标题（含冷却）+ 详细效果说明」。
        // 标题19px、说明16px/行距24px，段间隔约100px，R段说明底部距按钮仍有余量。
        const RX = 90, RW = 560;
        const headY = [198, 102, 6, -90];
        const descY = [158, 62, -34, -130];
        for (let k = 0; k < 4; k++) {
            if (k > 0) {
                const icon = new Node(`SkillIcon${k}`); icon.setParent(dlg);
                icon.setPosition(new Vec3(-218, headY[k], 0));
                icon.addComponent(UITransform).setContentSize(40, 40);
                const sp = icon.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                this._detailSkillIcons.push(sp);
            }
            const hd = new Node(`SkillHead${k}`); hd.setParent(dlg);
            hd.setPosition(new Vec3(RX, headY[k], 0));
            hd.addComponent(UITransform).setContentSize(RW, 30);
            const hl = hd.addComponent(Label);
            hl.fontSize = 19;
            hl.lineHeight = 24;
            hl.horizontalAlign = HorizontalTextAlignment.LEFT;
            hl.overflow = Label.Overflow.SHRINK;
            hl.enableWrapText = false;
            styleLabel(hl);
            this._detailSkillHeaders.push(hl);

            const dc = new Node(`SkillDesc${k}`); dc.setParent(dlg);
            dc.setPosition(new Vec3(RX, descY[k], 0));
            dc.addComponent(UITransform).setContentSize(RW, 48);
            const dl = dc.addComponent(Label);
            dl.fontSize = 16;
            dl.lineHeight = 24;
            dl.color = new Color(212, 224, 240, 242);
            dl.horizontalAlign = HorizontalTextAlignment.LEFT;
            dl.verticalAlign = VerticalTextAlignment.TOP;
            dl.overflow = Label.Overflow.SHRINK;
            dl.enableWrapText = true;
            styleLabel(dl);
            this._detailSkillDescs.push(dl);
        }

        // 底部：弹窗内可直接出战，或返回选人页
        const selBtn = this._mkBtn(dlg, '选择出战', -130, -234, 260, 52, new Color(24, 170, 120, 255));
        selBtn.on(Node.EventType.TOUCH_END, () => {
            if (this._detailDef) this.onCharSelected?.(this._detailDef);
        }, this);
        const backBtn = this._mkBtn(dlg, '返回', 130, -234, 260, 52, new Color(70, 90, 130, 255));
        backBtn.on(Node.EventType.TOUCH_END, () => this.hide('charDetail'), this);
    }

    /** 打开英雄介绍弹窗：按角色填充立绘、基础属性与被动/Q/E/R 详细描述。 */
    showCharDetail(def: CharDef) {
        this._detailDef = def;
        const col = Color.fromHEX(new Color(), def.color);

        const g = this._detailGfx;
        g.clear();
        g.fillColor = new Color(9, 15, 26, 252);
        g.fillRect(-440, -290, 880, 580);
        g.strokeColor = new Color(col.r, col.g, col.b, 205);
        g.lineWidth = 2.5;
        g.rect(-440, -290, 880, 580); g.stroke();
        // 标题下弱分隔线 + 四角高亮，与选人卡的视觉语言保持一致
        g.strokeColor = new Color(col.r, col.g, col.b, 70);
        g.lineWidth = 1;
        g.moveTo(-392, 218); g.lineTo(392, 218); g.stroke();
        const corner = 22;
        g.strokeColor = new Color(col.r, col.g, col.b, 255);
        g.lineWidth = 3;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const x = sx * 438, y = sy * 288;
            g.moveTo(x, y - sy * corner); g.lineTo(x, y); g.lineTo(x - sx * corner, y);
            g.stroke();
        }

        const pg = this._detailPortraitGfx;
        pg.clear();
        pg.fillColor = new Color(9, 15, 24, 245);
        pg.fillRect(-74, -74, 148, 148);
        pg.strokeColor = new Color(col.r, col.g, col.b, 170);
        pg.lineWidth = 1.5;
        pg.rect(-74, -74, 148, 148); pg.stroke();

        this._detailTitle.string = def.name;
        this._detailTitle.color = col;

        loadArtSprite(`char_${def.id}`, (frame) => {
            if (frame && this._detailPortrait.isValid) this._detailPortrait.spriteFrame = frame;
        });

        this._detailStats.string =
            `攻击方式  ${def.attackType === 'melee' ? '近战' : '远程'}\n` +
            `生命  ${def.stats.maxHp}\n` +
            `攻击  ${def.stats.damage}\n` +
            `攻速  ${def.stats.attackSpeed}/秒\n` +
            `护甲  ${def.stats.armor}\n` +
            `移速  ${def.stats.speed}\n` +
            `暴击  ${Math.round(def.stats.critRate * 100)}%`;

        const headers = [
            '被动天赋',
            `Q · ${splitSkillText(def.skills.q)[0]} · 冷却 ${def.qCd ?? SKILL_Q_CD} 秒`,
            `E · ${splitSkillText(def.skills.e)[0]} · 冷却 ${def.eCd ?? SKILL_E_CD} 秒`,
            `R · ${splitSkillText(def.skills.r)[0]} · 充能 ${def.ultCd} 秒`,
        ];
        this._detailSkillHeaders.forEach((lbl, k) => {
            lbl.string = headers[k];
            lbl.color = k === 0 ? new Color(255, 215, 90, 255) : col;
        });

        const descs = [
            def.desc,
            splitSkillText(def.skills.q)[1],
            splitSkillText(def.skills.e)[1],
            splitSkillText(def.skills.r)[1],
        ];
        this._detailSkillDescs.forEach((lbl, k) => { lbl.string = descs[k]; });

        this._detailSkillIcons.forEach((sp, k) => {
            const key = `ui_icon_${def.skillIcons[['q', 'e', 'r'][k] as 'q' | 'e' | 'r']}`;
            loadArtSprite(key, (frame) => {
                if (frame && sp.isValid) sp.spriteFrame = frame;
            });
        });

        this.show('charDetail');
    }

    private _buildGameoverPanel() {
        this._buildRunReportPanel('gameover', UI_PALETTE.danger);
    }

    private _buildChapterClearPanel() {
        this._buildRunReportPanel('chapterClear', new Color(80, 230, 120, 255));
    }

    private _buildRunReportPanel(name: ReportName, accent: Color): void {
        const p = this._mkPanel(name, visibleDesignWidth(), 720);
        p.addComponent(BlockInputEvents);
        const bg = p.addComponent(Graphics);
        const redraw = () => {
            bg.clear();
            const width = visibleDesignWidth();
            bg.fillColor = new Color(5, 10, 20, 174);
            bg.fillRect(-width / 2, -360, width, 720);
            drawHexPanel(bg, -360, -250, 720, 500, accent, 250);
        };
        redraw();
        attachEnableRedraw(p, redraw);

        const makeLabel = (nodeName: string, x: number, y: number, w: number, h: number,
                           value: string, size: number, color: Color): Label => {
            const node = new Node(nodeName); node.setParent(p);
            node.setPosition(new Vec3(x, y, 0));
            node.addComponent(UITransform).setContentSize(w, h);
            const label = node.addComponent(Label);
            label.string = value;
            label.fontSize = size;
            label.color = color;
            styleLabel(label);
            return label;
        };
        makeLabel('Eyebrow', 0, 215, 500, 24, 'ACTION REPORT / 行动报告', 14, accent);
        const title = makeLabel('Title', 0, 169, 600, 52,
            name === 'gameover' ? '行动终止' : '章节通关！', 38, accent);
        const subtitle = makeLabel('Subtitle', 0, 121, 600, 30, '', 17, UI_PALETTE.muted);

        const values: Label[] = [];
        const metrics = ['累计击败', '最高连击', '本局金币', '作战积分'];
        for (let i = 0; i < metrics.length; i++) {
            const x = i % 2 === 0 ? -164 : 164;
            const y = i < 2 ? 42 : -45;
            const cell = new Node(`Metric_${i}`); cell.setParent(p);
            cell.setPosition(new Vec3(x, y, 0));
            const cg = cell.addComponent(Graphics);
            const drawCell = () => {
                cg.clear();
                drawHexPanel(cg, -150, -37, 300, 74, accent, 215);
            };
            drawCell();
            attachEnableRedraw(cell, drawCell);
            const key = new Node('Name'); key.setParent(cell);
            key.setPosition(new Vec3(0, 18, 0));
            key.addComponent(UITransform).setContentSize(260, 20);
            const keyLabel = key.addComponent(Label);
            keyLabel.string = metrics[i]; keyLabel.fontSize = 14; keyLabel.color = UI_PALETTE.muted;
            styleLabel(keyLabel);
            const val = new Node('Value'); val.setParent(cell);
            val.setPosition(new Vec3(0, -10, 0));
            val.addComponent(UITransform).setContentSize(260, 34);
            const value = val.addComponent(Label);
            value.string = '0'; value.fontSize = 26; value.color = UI_PALETTE.text;
            styleLabel(value);
            values.push(value);
        }

        const primaryText = name === 'gameover' ? '重新开始' : '进入下一章';
        const primaryBtn = this._mkBtn(p, primaryText, 0, -149, 230, 46,
            name === 'gameover' ? new Color(55, 145, 102, 255) : new Color(42, 158, 207, 255));
        const backBtn = this._mkBtn(p, '返回大厅', 0, -208, 230, 46, new Color(78, 111, 135, 255));
        primaryBtn.on(Node.EventType.TOUCH_END, () => {
            if (name === 'gameover') this.onRestartPressed?.();
            else this.onContinuePressed?.();
        }, this);
        backBtn.on(Node.EventType.TOUCH_END, () => this.onMainMenuPressed?.(), this);
        const primary = primaryBtn.getChildByName('L')!.getComponent(Label)!;
        this._runReports.set(name, { title, subtitle, values, primary, redraw });
    }

    private _buildPausePanel() {
        const p = this._mkPanel('pause', 500, 360);

        const bg = p.addComponent(Graphics);
        drawHexPanel(bg, -250, -180, 500, 360, UI_PALETTE.cyan, 244);

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 130, 0));
        tn.addComponent(UITransform).setContentSize(300, 44);
        const tl = tn.addComponent(Label);
        tl.string = '游戏暂停';
        tl.fontSize = 36; tl.color = new Color(200, 200, 240, 255);
        styleLabel(tl);

        // 文案用中性的「退出战斗」：正式局退回存档大厅，测试房退回首页（由 GameManager 按来源分流）
        const r = this._mkBtn(p, '继续游戏', 0,  30, 200, 44, new Color(40, 140, 80, 230));
        const m = this._mkBtn(p, '退出战斗', 0, -40, 200, 44, new Color(60, 60, 90, 230));
        const st = this._mkBtn(p, '设置', 0, -110, 200, 44, new Color(70, 105, 130, 230));
        r.on(Node.EventType.TOUCH_END, () => this.onResumePressed?.(), this);
        m.on(Node.EventType.TOUCH_END, () => this.onMainMenuPressed?.(), this);
        // 暂停中调音量：设置面板盖在暂停面板之上，关闭后回到暂停
        st.on(Node.EventType.TOUCH_END, () => this.show('settings'), this);
    }

    /** 退出兜底遮罩：web 下 window.close 被拦截时，盖住全屏提示可直接关窗。 */
    private _showExitVeil(): void {
        const existing = this._panels.get('exitVeil');
        if (existing) {
            existing.active = true;
            this.fitToVisible();
            return;
        }
        const veil = new Node('exitVeil'); veil.setParent(this.node);
        this._panels.set('exitVeil', veil);
        veil.addComponent(UITransform).setContentSize(visibleDesignWidth(), 720);
        const vg = veil.addComponent(Graphics);
        const drawVeil = () => {
            vg.clear();
            vg.fillColor = new Color(4, 6, 12, 250);
            const width = visibleDesignWidth();
            vg.fillRect(-width / 2, -360, width, 720);
        };
        this._drawExitVeil = drawVeil;
        drawVeil();
        attachEnableRedraw(veil, drawVeil);
        const t = new Node('T'); t.setParent(veil);
        t.addComponent(UITransform).setContentSize(700, 60);
        const tl = t.addComponent(Label);
        tl.string = '感谢游玩 · 游戏已退出';
        tl.fontSize = 40; tl.color = new Color(220, 228, 238, 255);
        styleLabel(tl);
        const sub = new Node('S'); sub.setParent(veil);
        sub.setPosition(new Vec3(0, -56, 0));
        sub.addComponent(UITransform).setContentSize(700, 30);
        const sl = sub.addComponent(Label);
        sl.string = '浏览器拦截了自动关闭，可直接关闭窗口/标签页退出';
        sl.fontSize = 16; sl.color = new Color(140, 158, 174, 230);
        styleLabel(sl);
    }

    // ── 设置页：音乐/音量滑杆 ──────────────────────────────

    private _sliderMusic?: { setRatio(r: number): void };
    private _sliderSfx?: { setRatio(r: number): void };

    /** 打开设置页时从 GameManager 读取当前音量刷新滑杆。 */
    private _refreshSettings(): void {
        const v = this.getAudioVolumes?.() ?? { bgm: 0.48, sfx: 1 };
        this._sliderMusic?.setRatio(v.bgm);
        this._sliderSfx?.setRatio(v.sfx);
    }

    /** 音量变化统一出口：立即回写并持久化。 */
    private _applyVolumes(bgm: number, sfx: number): void {
        this.onAudioVolumesChanged?.(bgm, sfx);
    }

    private _buildSettingsPanel(): void {
        const p = this._mkPanel('settings', 520, 440);
        p.getComponent(UITransform)!.setContentSize(visibleDesignWidth(), 720);
        p.addComponent(BlockInputEvents);

        const bg = p.addComponent(Graphics);
        const drawSettingsBg = () => {
            bg.clear();
            bg.fillColor = new Color(5, 10, 20, 180);
            const veilWidth = visibleDesignWidth();
            bg.fillRect(-veilWidth / 2, -360, veilWidth, 720);
            drawHexPanel(bg, -260, -220, 520, 440, UI_PALETTE.cyan, 246);
        };
        this._drawSettingsBg = drawSettingsBg;
        drawSettingsBg();
        attachEnableRedraw(p, drawSettingsBg);

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 168, 0));
        tn.addComponent(UITransform).setContentSize(300, 44);
        const tl = tn.addComponent(Label);
        tl.string = '设置'; tl.fontSize = 34; tl.color = new Color(200, 200, 240, 255);
        styleLabel(tl);

        const v = this.getAudioVolumes?.() ?? { bgm: 0.48, sfx: 1 };
        this._sliderMusic = this._mkVolumeSlider(p, 92, '音乐音量', v.bgm,
            r => this._applyVolumes(r, this._sliderSfx ? this._currentRatio(this._sliderSfx) : v.sfx));
        this._sliderSfx = this._mkVolumeSlider(p, 22, '音效音量', v.sfx,
            r => this._applyVolumes(this._currentRatio(this._sliderMusic), r));

        const hint = new Node('Hint'); hint.setParent(p);
        hint.setPosition(new Vec3(0, -58, 0));
        hint.addComponent(UITransform).setContentSize(440, 22);
        const hl = hint.addComponent(Label);
        hl.string = '拖动滑杆实时调节，设置自动保存';
        hl.fontSize = 14; hl.lineHeight = 20;
        hl.color = new Color(140, 158, 174, 220);
        styleLabel(hl);

        const close = this._mkBtn(p, '关闭', 0, -150, 200, 44, new Color(60, 100, 80, 235));
        close.on(Node.EventType.TOUCH_END, () => this.hide('settings'), this);
    }

    /** 滑杆当前值（0~1）读取：从内部记录取，避免闭包时序问题。 */
    private _currentRatio(slider: { setRatio(r: number): void } | undefined): number {
        return this._ratios.get(slider) ?? 1;
    }
    private _ratios = new Map<{ setRatio(r: number): void }, number>();

    /**
     * 音量滑杆：标签 + 300px 轨道 + 拖动手柄 + 百分比。
     * 触点用 getUILocation 换算到轨道本地坐标（与 TouchControls 同源）。
     */
    private _mkVolumeSlider(parent: Node, y: number, label: string, initRatio: number,
                            onChange: (ratio: number) => void): { setRatio(r: number): void } {
        const WIDTH = 300;
        const row = new Node(`Slider_${label}`); row.setParent(parent);
        row.setPosition(new Vec3(40, y, 0));
        row.addComponent(UITransform).setContentSize(520, 40);

        const nameN = new Node('Name'); nameN.setParent(row);
        nameN.setPosition(new Vec3(-210, 0, 0));
        nameN.addComponent(UITransform).setContentSize(110, 26);
        const nl = nameN.addComponent(Label);
        nl.string = label; nl.fontSize = 17;
        nl.color = new Color(205, 218, 228, 255);
        nl.horizontalAlign = HorizontalTextAlignment.RIGHT;
        styleLabel(nl);

        // 轨道：触摸热区(宽×34) + 绘制条(宽×10)
        const track = new Node('Track'); track.setParent(row);
        track.addComponent(UITransform).setContentSize(WIDTH, 34);
        const tg = track.addComponent(Graphics);
        const knob = new Node('Knob'); knob.setParent(track);
        const kg = knob.addComponent(Graphics);
        const pctN = new Node('Pct'); pctN.setParent(row);
        pctN.setPosition(new Vec3(WIDTH / 2 + 36, 0, 0));
        pctN.addComponent(UITransform).setContentSize(56, 26);
        const pct = pctN.addComponent(Label);
        pct.fontSize = 16; pct.color = new Color(255, 214, 90, 255);
        styleLabel(pct);

        const draw = (r: number) => {
            tg.clear();
            tg.fillColor = new Color(22, 30, 42, 245);
            tg.fillRect(-WIDTH / 2, -5, WIDTH, 10);
            tg.fillColor = new Color(40, 200, 170, 235);
            tg.fillRect(-WIDTH / 2, -5, WIDTH * r, 10);
            tg.strokeColor = new Color(90, 130, 160, 200);
            tg.lineWidth = 1.5; tg.rect(-WIDTH / 2, -5, WIDTH, 10); tg.stroke();
            kg.clear();
            kg.fillColor = new Color(8, 14, 24, 250);
            kg.circle(0, 0, 13); kg.fill();
            kg.fillColor = new Color(120, 235, 205, 255);
            kg.circle(0, 0, 9); kg.fill();
            kg.strokeColor = new Color(180, 255, 235, 255);
            kg.lineWidth = 1.5; kg.circle(0, 0, 13); kg.stroke();
        };

        const slider = { setRatio(r: number): void {} };
        const setRatio = (r: number) => {
            const clamped = Math.min(1, Math.max(0, r));
            this._ratios.set(slider, clamped);
            knob.setPosition(new Vec3(-WIDTH / 2 + clamped * WIDTH, 0, 0));
            pct.string = `${Math.round(clamped * 100)}`;
            draw(clamped);
        };
        slider.setRatio = setRatio;

        const nudge = (direction: -1 | 1) => {
            const ratio = clamp((this._ratios.get(slider) ?? initRatio) + direction * 0.05, 0, 1);
            setRatio(ratio);
            onChange(ratio);
            return true;
        };
        registerKeyboardFocus(track, WIDTH, 34, {
            activate: () => { nudge(1); },
            onDirection: nudge,
        });

        const applyFromEvent = (ev: any) => {
            const ui = ev.getUILocation ? ev.getUILocation() : ev.getLocation();
            const local = track.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
            const r = clamp((local.x + WIDTH / 2) / WIDTH, 0, 1);
            setRatio(r);
            onChange(r);
        };
        track.on(Node.EventType.TOUCH_START, applyFromEvent, this);
        track.on(Node.EventType.TOUCH_MOVE, applyFromEvent, this);
        // 面板隐藏→再激活后 Graphics 会丢，激活时按当前值重画
        attachEnableRedraw(track, () => draw(this._ratios.get(slider) ?? initRatio));
        setRatio(initRatio);
        return slider;
    }

    // ── helpers ───────────────────────────────────────────────

    private _mkPanel(name: ScreenName, w: number, h: number): Node {
        const p = new Node(name); p.setParent(this.node);
        p.setPosition(Vec3.ZERO);
        p.addComponent(UITransform).setContentSize(w, h);
        this._panels.set(name, p);
        return p;
    }

    /**
     * Loads the art resource keyed by `key` (e.g. 'char_kai', WITHOUT the 'art/'
     * prefix) and shows it as a Sprite centered in `size` pixels, anchored
     * `yOffset` above the parent's local origin. Goes through SpriteUtils.loadArtSprite
     * so the key is first resolved by ArtRemap (in case the on-disk file for this
     * key is mis-mapped) and shares the common SpriteFrame cache. Fails silently
     * (logs a warning) if the asset can't be found, so missing art never breaks UI.
     */
    private _loadPortrait(parent: Node, key: string, size: number, yOffset: number, extra = 0) {
        const pn = new Node('Portrait'); pn.setParent(parent);
        pn.setPosition(new Vec3(0, yOffset + extra, 0));
        // PortraitFrame 固定在卡片 sibling 0，立绘必须位于它上方；此前把立绘也
        // 塞到 0 会将深色框底板顶到前景，实际预览中六张角色图都被遮暗。
        pn.setSiblingIndex(1);
        const ui = pn.addComponent(UITransform);
        ui.setContentSize(size, size);
        const sp = pn.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        loadArtSprite(key, (frame) => {
            if (!frame || !sp.isValid) {
                console.warn(`[ScreenManager] portrait not found: ${key}`);
                return;
            }
            sp.spriteFrame = frame;
        });
    }

    private _mkBtn(parent: Node, text: string,
                   x: number, y: number, w: number, h: number,
                   fillCol: Color, disabled = false): Node {
        const btn = new Node(`Btn_${text}`); btn.setParent(parent);
        btn.setPosition(new Vec3(x, y, 0));
        btn.addComponent(UITransform).setContentSize(w, h);
        applyHexButtonSkin(btn, w, h, fillCol, disabled);

        const ln = new Node('L'); ln.setParent(btn);
        ln.addComponent(UITransform).setContentSize(w - 16, h);
        const lbl = ln.addComponent(Label);
        lbl.string = text; lbl.fontSize = Math.round(h * 0.36);
        lbl.color = disabled ? new Color(132, 148, 158, 220) : new Color(235, 246, 250, 255);
        lbl.horizontalAlign = HorizontalTextAlignment.CENTER;
        lbl.verticalAlign = VerticalTextAlignment.CENTER;
        lbl.overflow = Label.Overflow.SHRINK;
        lbl.enableWrapText = false;
        styleLabel(lbl);
        if (!disabled) btn.on(Node.EventType.TOUCH_END, () => this.onButtonSfx?.(), this);
        return btn;
    }
}
