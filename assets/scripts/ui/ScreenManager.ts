import {
    _decorator, Component, EditBox, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, BlockInputEvents, HorizontalTextAlignment, VerticalTextAlignment,
    Input, input, KeyCode, EventKeyboard, game, sys,
} from 'cc';
import { CharDef } from '../data/CharacterDB';
import { CHARS, splitSkillText, SKILL_Q_CD, SKILL_E_CD } from '../data/CharacterDB';
import { DIFFICULTIES, DifficultyDef } from '../data/DifficultyDB';
import {
    MAPS, MAP_COUNT, CHAPTERS_PER_MAP, TOTAL_CHAPTERS,
    mapDef, mapOf, chapterInMap, globalChapter, chapterNode, finaleFor,
} from '../data/LevelIndex';
import { MUTATIONS } from '../data/WaveData';
import { getBossDefById } from '../data/BossDB';
import { applyArtSprite, loadArtSprite } from '../core/SpriteUtils';
import { createPortraitViewport, fitPortraitFrame, loadPortraitArt } from '../core/PortraitArt';
import { styleLabel } from '../core/LabelUtils';
import { applyHexButtonSkin, applyHexCardSkin, attachEnableRedraw, drawHexPanel, editBoxSupported,
    isKeyboardModalScope, keyboardFocusTarget, registerKeyboardFocus,
    registerKeyboardModalScope, UI_PALETTE } from '../core/UIStyle';
import { clamp } from '../core/MathUtils';
import { visibleDesignWidth, visibleDesignHeight } from '../core/ScreenFit';
import { CANVAS_H } from '../core/Constants';
import { MetaPageName, MetaPageUI } from './MetaPageUI';
import { AdminUI } from './AdminUI';
import { SaveSelectUI } from './SaveSelectUI';
import { LobbyUI } from './LobbyUI';
import { defaultTutorialStorage, setTutorialEnabled, tutorialEnabled } from './TutorialState';

const { ccclass } = _decorator;

const WHITE = new Color(232, 244, 250, 255);

export type ScreenName =
    | 'menu' | 'login' | 'saveSelect' | 'lobby' | 'difficultySelect' | 'charSelect' | 'charDetail'
    | 'playing'
    | 'gameover' | 'chapterClear' | 'pause' | 'settings' | 'exitVeil' | 'mapSelect'
    | 'chapterSelect'
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
    /** v4：通关结算折算的核心币（20% 封顶 80）；gameover 恒 0。 */
    coinsEarned?: number;
    /** v5：本局新解锁成就名（含图标），空数组/缺省隐藏"本局新解锁"行。 */
    newAchievements?: string[];
}

interface RunReportView {
    title: Label;
    subtitle: Label;
    values: Label[];
    metrics: Label[];
    primary: Label;
    /** v5："本局新解锁"成就行（无解锁时隐藏）。 */
    achievements: Label;
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
    /** 后台管理面板（设置页「后台管理」入口；管理员验证 + 参数/成就管理）。 */
    private _adminUI?: AdminUI;
    private _saveSelect!: SaveSelectUI;
    /** v4 章节选择页(v5 选图页)的卡片区容器（每次进入页面按存档解锁链重建）。 */
    private _mapCardsRoot!: Node;
    private _mapProgressLabel!: Label;
    /** v5 图内章节页的卡片区容器。 */
    private _chapterCardsRoot!: Node;
    private _chapterPreview!: Sprite;
    private _chapterPreviewAccent: Color = UI_PALETTE.cyan;
    private _drawChapterPreview?: () => void;
    private _chapterMapName!: Label;
    private _chapterMapDesc!: Label;
    private _chapterMapProgress!: Label;
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
    private _canvasElement?: HTMLCanvasElement;

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
    private _detailSkillOverlay!: Node;
    private _detailSkillTitle!: Label;
    private _detailSkillFullDesc!: Label;
    /** 选人页标题下的作战难度徽标（setRunDifficulty 填充）。 */
    private _charDiffLabel!: Label;

    // callbacks set by GameManager
    onPlayPressed?:        BtnCallback;   // 进入游戏 → 存档选择
    onSaveSelectBack?:     BtnCallback;   // 存档选择 → 首页，状态由 GameManager 同步
    onSlotPicked?:         (slot: number) => void;   // 存档选择 → 进入存档大厅
    onLobbyPortal?:        BtnCallback;   // 大厅传送门 → 作战地图选择
    onLobbyBack?:         BtnCallback;   // 存档大厅 → 首页，状态由 GameManager 同步
    onMapPicked?:          (mapId: number) => void;      // 选图卡（1~6）→ 图内章节页
    onMapBack?:            BtnCallback;   // 地图页返回 → 存档大厅
    /** v5：查询已解锁节点数（GameManager 注入 SaveSystem.unlockedChapterCount）。 */
    onQueryChapterUnlock?: () => number;
    /** v5：查询当前浏览图号（GameManager 注入 _selectedMap）。 */
    onQueryActiveMap?:     () => number;
    onChapterPicked?:      (chapterId: number) => void;   // 章节卡选定（全局章号 1~30）→ 难度选择
    onChapterBack?:        BtnCallback;   // 章节页返回 → 选图页
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
    /** 大厅「切换档案」：打开档案列表页（选定/返回都回大厅）。 */
    onSwitchSave?:         BtnCallback;
    /** 登录页「登录/注册」：GameManager 异步处理（同步档案到本机服务器）。 */
    onLoginAction?:        (mode: 'login' | 'register', account: string, password: string) => void;
    /** 登录页「游客离线」：跳过登录，纯本地游玩。 */
    onGuestMode?:          BtnCallback;
    onButtonSfx?:          BtnCallback;

    onLoad() {
        this._buildLoginPanel();
        this._buildMenuPanel();
        this._saveSelect = new SaveSelectUI(this.node, {
            onSlotPicked: (slot) => this.onSlotPicked?.(slot),
            onBack: () => this.onSaveSelectBack?.(),
            onButtonSfx: () => this.onButtonSfx?.(),
        });
        for (const [name, panel] of this._saveSelect.entries()) this._panels.set(name as ScreenName, panel);
        this._lobby = new LobbyUI(this.node, {
            onPortalPressed: () => this.onLobbyPortal?.(),
            onMetaPage: (page) => this.transition('lobby', page),
            onSwitchSave: () => this.onSwitchSave?.(),
            onBack: () => this.onLobbyBack?.(),
            onButtonSfx: () => this.onButtonSfx?.(),
        });
        for (const [name, panel] of this._lobby.entries()) this._panels.set(name as ScreenName, panel);
        this._metaPages = new MetaPageUI(this.node, {
            onBack: () => this.transition(this._currentMetaPage(), 'lobby'),
            onButtonSfx: () => this.onButtonSfx?.(),
        });
        for (const [name, panel] of this._metaPages.entries()) this._panels.set(name, panel);
        this._buildMapSelectPanel();
        this._buildChapterSelectPanel();
        this._buildDifficultySelectPanel();
        this._buildCharSelectPanel();
        // 英雄介绍弹窗在选人页之后构建，保证层级在选人卡之上（点击遮罩不穿透）
        this._buildCharDetailPanel();
        this._buildGameoverPanel();
        this._buildChapterClearPanel();
        this._buildPausePanel();
        this._buildSettingsPanel();
        // 后台管理面板（设置页入口）：最后创建保证压在所有面板之上
        this._adminUI = new AdminUI(this.node, {
            onAchievementsChanged: () => this._metaPages?.refresh('achievements'),
        });
        // start with everything hidden
        this._panels.forEach(p => p.active = false);
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this._onKeyUp, this);
        if (typeof document !== 'undefined') {
            this._canvasElement = document.querySelector('canvas') ?? undefined;
            this._canvasElement?.addEventListener('focus', this._onCanvasFocus);
        }
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this._onKeyUp, this);
        this._canvasElement?.removeEventListener('focus', this._onCanvasFocus);
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
        for (const name of ['mapSelect', 'chapterSelect', 'difficultySelect', 'charSelect'] as ScreenName[]) {
            this._panels.get(name)?.getComponent(UITransform)?.setContentSize(width, 720);
            const backdrop = this._selectionBackdrops.get(name);
            backdrop?.art.getComponent(UITransform)?.setContentSize(width, 720);
            backdrop?.redraw();
        }
        this._panels.get('exitVeil')?.getComponent(UITransform)?.setContentSize(width, visibleDesignHeight());
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
            || name === 'mapSelect' || name === 'chapterSelect' || name === 'difficultySelect' || name === 'charSelect') {
            this.fitToVisible();
        }
        if (name === 'codex' || name === 'achievements') {
            this._metaPages.fitToVisible();
            this._metaPages.refresh(name);
        } else if (name === 'settings') {
            this._refreshSettings();
        } else if (name === 'saveSelect') {
            this._saveSelect.refresh();
        } else if (name === 'lobby') {
            this._lobby.refresh();
        } else if (name === 'mapSelect') {
            // 解锁状态随通关进度变化，每次进入都重读存档重建卡片
            this._rebuildMapCards();
        } else if (name === 'chapterSelect') {
            this._rebuildChapterCards();
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

    /** 只在最上层可见页面或波间浮层循环焦点。 */
    private _keyboardPanel(): Node | undefined {
        const layer = this.node.parent;
        if (!layer) return undefined;
        for (let i = layer.children.length - 1; i >= 0; i--) {
            const surface = layer.children[i];
            if (!surface.activeInHierarchy) continue;
            if (surface === this.node) {
                for (let j = this.node.children.length - 1; j >= 0; j--) {
                    const panel = this.node.children[j];
                    if (panel.active && this._panels.get(panel.name as ScreenName) === panel) {
                        // 大厅军需终端等页内浮层优先接管键盘，避免 Tab 落到背后的传送门。
                        return this._activeKeyboardModal(panel) ?? panel;
                    }
                }
            } else if (['AugSelect', 'Shop', 'Stats', 'TestRoom'].indexOf(surface.name) >= 0) {
                const modal = this._activeKeyboardModal(surface);
                if (modal) return modal;
                if (this._keyboardControls(surface).length) return surface;
            }
        }
        return undefined;
    }

    private _activeKeyboardModal(root: Node): Node | undefined {
        for (let i = root.children.length - 1; i >= 0; i--) {
            const child = root.children[i];
            if (!child.activeInHierarchy) continue;
            const nested = this._activeKeyboardModal(child);
            if (nested) return nested;
            if (isKeyboardModalScope(child)) return child;
        }
        return undefined;
    }

    private _isTestRoomScope(panel: Node): boolean {
        const testRoom = this.node.parent?.getChildByName('TestRoom');
        if (!testRoom) return false;
        for (let current: Node | null = panel; current; current = current.parent) {
            if (current === testRoom) return true;
        }
        return false;
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

    /** 浏览器首次 Tab 聚焦画布时，直接显示页面内第一个可操作控件。 */
    private _onCanvasFocus = () => {
        const panel = this._keyboardPanel();
        if (panel && !this._focusedControl) this._moveKeyboardFocus(panel, 1);
    };

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
            // 测试房方向键仍负责移动角色；页面控件仅由 Tab 切换。
            if (key !== KeyCode.TAB && this._isTestRoomScope(panel)) return;
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
        const pos = `图${mapOf(data.chapter)}-${chapterInMap(data.chapter)}`;
        view.title.string = won
            ? (data.finalChapter ? '终局达成！' : `${pos} 通关！`)
            : '行动终止';
        view.subtitle.string = won
            ? `击败章节关底 · 用时内完成 ${data.wave} 波 · 剩余金币折算核心币`
            : `止步${pos} · 第 ${data.wave} 波`;
        // v4：通关面板第 4 格显示核心币折算（20% 封顶 80），gameover 仍显示积分
        const values = won
            ? [data.kills, data.maxCombo, data.goldEarned, data.coinsEarned ?? 0]
            : [data.kills, data.maxCombo, data.goldEarned, data.score];
        view.values.forEach((label, i) => { label.string = String(Math.max(0, Math.floor(values[i]))); });
        view.metrics.forEach((label, i) => {
            label.string = won && i === 3 ? '核心币获得' : ['累计击败', '最高连击', '本局金币', '作战积分'][i];
        });
        view.primary.string = won ? '领取奖励' : '重新开始';
        // v5：本局新解锁成就行（无解锁隐藏；触屏端按钮更大，行位随之上移）
        const names = data.newAchievements ?? [];
        view.achievements.node.active = names.length > 0;
        if (names.length) {
            view.achievements.string = `本局新解锁：${names.join('、')}`;
        }
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
        const btn = this._mkBtn(menuActions, '开始游戏', 0, 84, 330, 46, new Color(20, 220, 210, 255));
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
        // 图鉴/成就档案入口已迁入存档大厅（LobbyUI 情报终端），首页不再展示。
    }

    // ── 登录页（存档服务器账号体系，方案 B） ──────────────────

    private _loginStatus?: Label;
    private _loginAccount?: EditBox;
    private _loginPassword?: EditBox;

    /** 登录页状态文字（登录中/同步中/错误提示），由 GameManager 异步更新。 */
    setLoginStatus(text: string): void {
        if (this._loginStatus) this._loginStatus.string = text;
    }

    /**
     * 登录页：账号+密码（注册/登录共用输入）+ 游客离线。
     * 按钮只回调 onLoginAction/onGuestMode，网络与档案合并由 GameManager 处理。
     */
    private _buildLoginPanel(): void {
        const p = this._mkPanel('login', 1280, 720);
        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(12, 8, 22, 255);
        bg.fillRect(-1600, -360, 3200, 720);

        const tn = new Node('Title'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 220, 0));
        tn.addComponent(UITransform).setContentSize(600, 52);
        const tl = tn.addComponent(Label);
        tl.string = 'HEXBLAST'; tl.fontSize = 40; tl.color = UI_PALETTE.text;
        styleLabel(tl, { outlineWidth: 3 });

        const st = new Node('SubTitle'); st.setParent(p);
        st.setPosition(new Vec3(0, 172, 0));
        st.addComponent(UITransform).setContentSize(600, 28);
        const sl = st.addComponent(Label);
        sl.string = '账号登录 · 存档随账号走（同一账号登录即恢复档案）';
        sl.fontSize = 16; sl.color = UI_PALETTE.muted;
        styleLabel(sl, { outline: false });

        // 登录表单居中一列：标签(60) + 间距 + 输入框(380)，整行宽 460 居中
        this._mkLabel(p, -200, 108, 60, 26, '账号', 16, UI_PALETTE.text, HorizontalTextAlignment.RIGHT);
        this._loginAccount = this._mkEditBox(p, 40, 108, 380, 44, '手机号 / 昵称', '', false);
        this._mkLabel(p, -200, 52, 60, 26, '密码', 16, UI_PALETTE.text, HorizontalTextAlignment.RIGHT);
        this._loginPassword = this._mkEditBox(p, 40, 52, 380, 44, '至少 4 位', '', true);

        const status = new Node('Status'); status.setParent(p);
        status.setPosition(new Vec3(0, -4, 0));
        status.addComponent(UITransform).setContentSize(560, 24);
        this._loginStatus = status.addComponent(Label);
        this._loginStatus.string = '';
        this._loginStatus.fontSize = 14; this._loginStatus.lineHeight = 20;
        this._loginStatus.color = new Color(255, 214, 90, 255);
        this._loginStatus.horizontalAlign = HorizontalTextAlignment.CENTER;
        styleLabel(this._loginStatus, { outline: false });

        const doLogin = this._mkBtn(p, '登录', -140, -62, 190, 48, new Color(24, 170, 120, 255));
        doLogin.on(Node.EventType.TOUCH_END, () => {
            this.onLoginAction?.('login', this._loginAccount?.string ?? '', this._loginPassword?.string ?? '');
        }, this);
        const doRegister = this._mkBtn(p, '注册并登录', 140, -62, 190, 48, new Color(42, 158, 207, 255));
        doRegister.on(Node.EventType.TOUCH_END, () => {
            this.onLoginAction?.('register', this._loginAccount?.string ?? '', this._loginPassword?.string ?? '');
        }, this);

        const guest = this._mkBtn(p, '游客离线（本地游玩，不上传）', 0, -132, 360, 44, new Color(70, 92, 110, 255));
        guest.on(Node.EventType.TOUCH_END, () => this.onGuestMode?.(), this);

        // 描述性语言统一放页面底部
        const hint = new Node('Hint'); hint.setParent(p);
        hint.setPosition(new Vec3(0, -216, 0));
        hint.addComponent(UITransform).setContentSize(760, 60);
        const hl = hint.addComponent(Label);
        hl.string = '需先启动本机存档服务器：node server/server.mjs\n（局域网设备请用同一网络访问）';
        hl.fontSize = 13; hl.lineHeight = 20;
        hl.color = new Color(140, 158, 174, 220);
        hl.horizontalAlign = HorizontalTextAlignment.CENTER;
        hl.verticalAlign = VerticalTextAlignment.CENTER;
        hl.overflow = Label.Overflow.SHRINK;
        hl.enableWrapText = true;
        styleLabel(hl, { outline: false });
    }

    /** 登录输入框（AdminUI._mkEditBox 同款约定：锚点(0,1) + 预建内部标签）。
     *  原生模拟器降级：EditBox 原生实现段错误（见 UIStyle.editBoxSupported），只画展示框。 */
    private _mkEditBox(parent: Node, x: number, y: number, w: number, h: number,
                       placeholder: string, init: string, password: boolean): EditBox {
        const n = new Node(`EB_${placeholder.slice(0, 4)}`); n.setParent(parent);
        n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(8, 13, 22, 245);
        g.roundRect(-w / 2, -h / 2, w, h, 6); g.fill();
        g.strokeColor = new Color(90, 110, 140, 200);
        g.lineWidth = 1.2; g.roundRect(-w / 2, -h / 2, w, h, 6); g.stroke();

        if (!editBoxSupported()) {
            // 原生端不可输入：占位文案直接提示替代方案，登录走「游客离线」
            const l = this._mkLabel(n, 0, 0, w - 16, h,
                `${placeholder} · 模拟器不支持输入，请点「游客离线」`, 12,
                new Color(120, 140, 160, 255), HorizontalTextAlignment.CENTER);
            l.verticalAlign = VerticalTextAlignment.CENTER;
            return { string: init } as unknown as EditBox;
        }

        const mkInner = (name: string, color: Color): Label => {
            const ln = new Node(name); ln.setParent(n);
            ln.addComponent(UITransform).setAnchorPoint(0, 1);
            const l = ln.addComponent(Label);
            l.fontSize = 14; l.lineHeight = 18;
            l.color = color;
            l.verticalAlign = VerticalTextAlignment.CENTER;
            l.horizontalAlign = HorizontalTextAlignment.LEFT;
            l.overflow = Label.Overflow.SHRINK;
            styleLabel(l);
            return l;
        };
        const textLabel = mkInner('TEXT_LABEL', WHITE.clone());
        const phLabel = mkInner('PLACEHOLDER_LABEL', new Color(120, 140, 160, 255));
        const eb = n.addComponent(EditBox);
        eb.textLabel = textLabel;
        eb.placeholderLabel = phLabel;
        eb.placeholder = placeholder;
        eb.string = init;
        eb.inputFlag = password ? EditBox.InputFlag.PASSWORD : EditBox.InputFlag.DEFAULT;
        return eb;
    }

    /** 行内小标签（登录页专用，中心锚点，挂载在登录面板内）。 */
    private _mkLabel(parent: Node, x: number, y: number, w: number, h: number, text: string,
                     size: number, color: Color, align: HorizontalTextAlignment): Label {
        const n = new Node(`Lbl_${text}`); n.setParent(parent);
        n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(w, h);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.color = color;
        l.horizontalAlign = align; l.verticalAlign = VerticalTextAlignment.CENTER;
        l.overflow = Label.Overflow.SHRINK;
        styleLabel(l, { outline: false });
        return l;
    }

    /** 返回按钮只会在两个元进度页面内触发；取当前激活页作为 transition 来源。 */
    private _currentMetaPage(): MetaPageName {
        for (const name of ['codex', 'achievements'] as MetaPageName[]) {
            if (this._panels.get(name)?.active) return name;
        }
        return 'codex';
    }

    /** 当前打开的元进度页（图鉴/成就），未打开返回 null——新手引导轮询用。 */
    openMetaPage(): MetaPageName | null {
        for (const name of ['codex', 'achievements'] as MetaPageName[]) {
            if (this._panels.get(name)?.activeInHierarchy) return name;
        }
        return null;
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

    /** 选图与章节页共用的档案文字：明确左对齐，避免信息卡看起来像按钮墙。 */
    private _selectionLabel(parent: Node, name: string, value: string,
                            x: number, y: number, w: number, h: number,
                            size: number, color: Color, centered = false): Label {
        const node = new Node(name); node.setParent(parent);
        node.setPosition(new Vec3(x, y, 0));
        node.addComponent(UITransform).setContentSize(w, h);
        const label = node.addComponent(Label);
        label.string = value;
        label.fontSize = size;
        label.lineHeight = size + 6;
        label.color = color;
        label.horizontalAlign = centered ? HorizontalTextAlignment.CENTER : HorizontalTextAlignment.LEFT;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        styleLabel(label, { outline: false });
        return label;
    }

    /** 六张场景档案按 3×2 排列；实景、任务进度、交互状态各占独立视觉层。 */
    private _buildMapSelectPanel() {
        const p = this._mkPanel('mapSelect', 1280, 720);

        const bg = p.addComponent(Graphics);
        bg.fillColor = UI_PALETTE.deep;
        bg.fillRect(-1600, -360, 3200, 720);
        this._buildSelectionBackdrop(p);

        const backBtn = this._mkBtn(p, '返回大厅', -540, 320, 160,
            sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 72 : 42, new Color(78, 111, 135, 255));
        backBtn.on(Node.EventType.TOUCH_END, () => this.onMapBack?.(), this);

        this._selectionLabel(p, 'Eyebrow', '战区档案  /  01', 0, 314, 280, 22,
            14, UI_PALETTE.cyan, true);
        this._selectionLabel(p, 'T', '选择作战地图', 0, 272, 560, 46,
            30, UI_PALETTE.text, true);
        this._selectionLabel(p, 'Sub', '六图 × 每图五章 · 一局一章 15 波 · 通关整张图解锁下一张',
            0, 236, 830, 24, 14, UI_PALETTE.muted, true);
        this._mapProgressLabel = this._selectionLabel(p, 'TotalProgress', '', 470, 274,
            260, 30, 16, UI_PALETTE.reward, true);

        // 每次进入重新读取存档，首通后立即更新地图状态。
        this._mapCardsRoot = new Node('Cards'); this._mapCardsRoot.setParent(p);
        this._rebuildMapCards();
    }

    /**
     * 按当前存档解锁链重建 6 张地图卡。锁定判定在构建时读取一次快照的旧实现
     * 会导致"通关后回章节页仍是锁定"——现在每次进入页面都重读
     * onQueryChapterUnlock（SaveSystem.unlockedChapterCount）。
     */
    private _rebuildMapCards(): void {
        const p = this._mapCardsRoot;
        for (const child of [...p.children]) {
            child.off(Node.EventType.TOUCH_END);
            child.removeFromParent();
            child.destroy();
        }
        const unlocked = Math.max(1, this.onQueryChapterUnlock?.() ?? 1);
        const cleared = unlocked - 1;
        this._mapProgressLabel.string = `战线进度  ${Math.min(cleared, TOTAL_CHAPTERS)} / ${TOTAL_CHAPTERS}`;
        const CARD_W = 356, CARD_H = 222;

        const mkCard = (x: number, y: number, mapId: number): void => {
            const map = mapDef(mapId);
            const boss = getBossDefById(map.bossId)?.label ?? '';
            const locked = globalChapter(mapId, 1) > unlocked;
            const clearedInMap = clamp(cleared - (mapId - 1) * CHAPTERS_PER_MAP, 0, CHAPTERS_PER_MAP);
            const swept = clearedInMap >= CHAPTERS_PER_MAP;
            const accent = Color.fromHEX(new Color(), map.accent);

            const card = new Node(`Map_${mapId}`); card.setParent(p);
            card.setPosition(new Vec3(x, y, 0));
            card.addComponent(UITransform).setContentSize(CARD_W, CARD_H);

            applyHexCardSkin(card, CARD_W, CARD_H, accent, locked);
            // 实景缩略图展示地图身份；锁定区域压暗而不泄露后续章节细节。
            const scene = new Node('Scene'); scene.setParent(card);
            scene.setPosition(new Vec3(0, 9, 0));
            scene.addComponent(UITransform).setContentSize(CARD_W - 12, 194);
            const sceneSp = scene.addComponent(Sprite);
            sceneSp.sizeMode = Sprite.SizeMode.CUSTOM;
            sceneSp.color = locked ? new Color(110, 125, 139, 150) : new Color(235, 243, 249, 255);
            applyArtSprite(sceneSp, map.bgKey);
            const shade = new Node('SceneShade'); shade.setParent(card);
            const sg = shade.addComponent(Graphics);
            const drawShade = () => {
                sg.clear();
                sg.fillColor = new Color(9, 19, 31, locked ? 132 : 42);
                sg.fillRect(-172, -30, 344, 132);
                sg.fillColor = new Color(12, 25, 39, 240);
                sg.fillRect(-172, -105, 344, 74);
                sg.fillColor = new Color(accent.r, accent.g, accent.b, locked ? 85 : 230);
                sg.fillRect(-172, -33, 344 * clearedInMap / CHAPTERS_PER_MAP, 3);
            };
            drawShade(); attachEnableRedraw(shade, drawShade);

            this._selectionLabel(card, 'Index', `0${mapId}  /  战区`, -80, 83, 160, 22,
                13, locked ? UI_PALETTE.muted : accent);
            this._selectionLabel(card, 'Name', map.name, -2, 37, 310, 42,
                27, UI_PALETTE.text, true);
            this._selectionLabel(card, 'Status', locked ? '尚未解锁' : swept ? '区域肃清' : '可进入',
                119, 84, 105, 22, 13, locked ? UI_PALETTE.muted : UI_PALETTE.reward, true);
            this._selectionLabel(card, 'Boss', `关底  ${boss}`, -14, -60, 320, 25,
                14, locked ? UI_PALETTE.muted : UI_PALETTE.text, true);
            this._selectionLabel(card, 'Info', locked ? `通关战区 0${mapId - 1} 后解锁`
                : `章节进度  ${clearedInMap} / ${CHAPTERS_PER_MAP}   ·   进入选择章节  ›`,
                0, -91, 320, 23, 14, locked ? UI_PALETTE.muted : accent, true);
            if (!locked) {
                card.on(Node.EventType.TOUCH_END, () => this.onMapPicked?.(mapId), this);
            }
        };
        const xs = [-380, 0, 380];
        for (let i = 0; i < MAP_COUNT; i++) mkCard(xs[i % 3], i < 3 ? 93 : -153, i + 1);
    }

    // ── 图内章节选择页（v5 新增） ─────────────────────────────

    /** 左侧场景档案，右侧章节卡片列表；扫描顺序与实际推进顺序一致。 */
    private _buildChapterSelectPanel() {
        const p = this._mkPanel('chapterSelect', 1280, 720);

        const bg = p.addComponent(Graphics);
        bg.fillColor = UI_PALETTE.deep;
        bg.fillRect(-1600, -360, 3200, 720);
        this._buildSelectionBackdrop(p);

        const backBtn = this._mkBtn(p, '返回选图', -540, 320, 160,
            sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 72 : 42, new Color(78, 111, 135, 255));
        backBtn.on(Node.EventType.TOUCH_END, () => this.onChapterBack?.(), this);

        this._selectionLabel(p, 'Eyebrow', '战区档案  /  02', 0, 314, 280, 22,
            14, UI_PALETTE.cyan, true);
        this._chapterTitleLabel = this._selectionLabel(p, 'T', '', 0, 271, 780, 44,
            30, UI_PALETTE.text, true);
        this._selectionLabel(p, 'Sub', '选择章节后配置难度与出战英雄', 0, 235, 760, 24,
            14, UI_PALETTE.muted, true);

        const preview = new Node('MapPreview'); preview.setParent(p);
        preview.setPosition(new Vec3(-390, -29, 0));
        preview.addComponent(UITransform).setContentSize(376, 434);
        const previewG = preview.addComponent(Graphics);
        const drawPreview = () => {
            previewG.clear();
            drawHexPanel(previewG, -188, -217, 376, 434, this._chapterPreviewAccent, 246);
        };
        this._drawChapterPreview = drawPreview;
        drawPreview(); attachEnableRedraw(preview, drawPreview);
        const scene = new Node('Scene'); scene.setParent(preview);
        scene.setPosition(new Vec3(0, 100, 0));
        scene.addComponent(UITransform).setContentSize(352, 198);
        this._chapterPreview = scene.addComponent(Sprite);
        this._chapterPreview.sizeMode = Sprite.SizeMode.CUSTOM;
        const veil = new Node('SceneVeil'); veil.setParent(preview);
        const vg = veil.addComponent(Graphics);
        const drawVeil = () => {
            vg.clear();
            vg.fillColor = new Color(12, 25, 39, 70);
            vg.fillRect(-176, 1, 352, 198);
        };
        drawVeil(); attachEnableRedraw(veil, drawVeil);
        this._chapterMapName = this._selectionLabel(preview, 'MapName', '', -1, -90, 336, 40,
            27, UI_PALETTE.text, true);
        this._chapterMapDesc = this._selectionLabel(preview, 'MapDesc', '', -1, -130, 336, 52,
            15, UI_PALETTE.muted, true);
        this._chapterMapProgress = this._selectionLabel(preview, 'Progress', '', -1, -180, 336, 29,
            16, UI_PALETTE.reward, true);

        this._chapterCardsRoot = new Node('Cards'); this._chapterCardsRoot.setParent(p);
        this._rebuildChapterCards();
    }

    private _chapterTitleLabel!: Label;

    /** 进入页面时按当前图 + 存档解锁链重建 5 张章节卡。 */
    private _rebuildChapterCards(): void {
        const p = this._chapterCardsRoot;
        for (const child of [...p.children]) {
            child.off(Node.EventType.TOUCH_END);
            child.removeFromParent();
            child.destroy();
        }
        const mapId = clamp(this.onQueryActiveMap?.() ?? 1, 1, MAP_COUNT);
        const map = mapDef(mapId);
        const unlocked = Math.max(1, this.onQueryChapterUnlock?.() ?? 1);
        const cleared = unlocked - 1;
        const accent = Color.fromHEX(new Color(), map.accent);
        this._chapterPreviewAccent = accent;
        this._drawChapterPreview?.();

        this._chapterTitleLabel.string = `图${mapId} · ${map.name}  /  选择章节`;
        this._chapterMapName.string = map.name;
        this._chapterMapDesc.string = map.desc;
        this._chapterMapProgress.string = `已肃清  ${clamp(cleared - (mapId - 1) * 5, 0, 5)} / 5  章`;
        applyArtSprite(this._chapterPreview, map.bgKey);
        const backdrop = this._selectionBackdrops.get('chapterSelect');
        if (backdrop) applyArtSprite(backdrop.art.getComponent(Sprite)!, map.bgKey);

        const CARD_W = 700, CARD_H = 75;
        const mkCard = (x: number, y: number, c: number): void => {
            const k = globalChapter(mapId, c);
            const node = chapterNode(k);
            const locked = k > unlocked;
            const done = k <= cleared;
            const fin = finaleFor(k);
            const mutNames = node.mutations
                .map(id => MUTATIONS.find(m => m.id === id)?.name ?? id).join('·');
            const finaleText = fin.kind === 'boss'
                ? `Boss：${getBossDefById(map.bossId)?.label ?? ''}`
                : `关底：小首领 ×${fin.tiers.length}`;

            const card = new Node(`Ch_${k}`); card.setParent(p);
            card.setPosition(new Vec3(x, y, 0));
            card.addComponent(UITransform).setContentSize(CARD_W, CARD_H);
            applyHexCardSkin(card, CARD_W, CARD_H, accent, locked);
            const decor = new Node('AccentBar'); decor.setParent(card);
            const dg = decor.addComponent(Graphics);
            const drawDecor = () => {
                dg.clear();
                dg.fillColor = new Color(accent.r, accent.g, accent.b, locked ? 60 : 225);
                dg.fillRect(-344, -26, 4, 52);
                if (node.isMapFinale) {
                    dg.fillColor = new Color(255, 200, 92, locked ? 60 : 220);
                    dg.fillRect(335, -26, 4, 52);
                }
            };
            drawDecor(); attachEnableRedraw(decor, drawDecor);
            const textColor = locked ? new Color(148, 163, 178, 245) : UI_PALETTE.text;
            this._selectionLabel(card, 'Number', `0${c}`, -302, 0, 55, 48,
                26, locked ? UI_PALETTE.muted : accent, true);
            this._selectionLabel(card, 'Name', node.name, -130, 13, 270, 26,
                19, textColor);
            this._selectionLabel(card, 'Quest', locked
                ? (c === 1 ? `通关图 ${mapId - 1} 全部章节解锁` : `通关第 ${c - 1} 章解锁`)
                : `第 ${c}/5 章  ·  15 波`, -126, -16, 280, 23,
                13, locked ? UI_PALETTE.muted : UI_PALETTE.reward);
            this._selectionLabel(card, 'Encounter', locked ? '未知威胁'
                : node.isMapFinale ? finaleText : mutNames ? `变异  ${mutNames}` : finaleText,
                146, -15, 258, 22, 13, UI_PALETTE.muted);
            this._selectionLabel(card, 'Status', locked ? '锁定' : done ? '已通关  ·  重战 ›'
                : node.isMapFinale ? '决战  ·  进入 ›' : '可出击  ·  进入 ›',
                214, 15, 210, 27, 15,
                locked ? UI_PALETTE.muted : done ? accent : UI_PALETTE.reward, true);
            if (!locked) {
                card.on(Node.EventType.TOUCH_END, () => this.onChapterPicked?.(k), this);
            }
        };
        for (let c = 1; c <= CHAPTERS_PER_MAP; c++) mkCard(214, 151 - (c - 1) * 85, c);
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

        const backBtn = this._mkBtn(p, '返回大厅', -540, 320, 160,
            sys.hasFeature(sys.Feature.INPUT_TOUCH) ? 72 : 42, new Color(78, 111, 135, 255));
        backBtn.on(Node.EventType.TOUCH_END, () => this.onDifficultyBack?.(), this);

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 280, 0));
        tn.addComponent(UITransform).setContentSize(500, 44);
        const tl = tn.addComponent(Label);
        tl.string = '选择作战难度';
        tl.fontSize = 28; tl.color = UI_PALETTE.text;
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
        const touch = sys.hasFeature(sys.Feature.INPUT_TOUCH);
        const label = (parent: Node, name: string, text: string, x: number, y: number,
                       w: number, h: number, size: number, color = UI_PALETTE.text) => {
            const n = new Node(name); n.setParent(parent); n.setPosition(x, y);
            n.addComponent(UITransform).setContentSize(w, h);
            const l = n.addComponent(Label); l.string = text;
            l.fontSize = size; l.lineHeight = size + 7; l.color = color;
            l.horizontalAlign = HorizontalTextAlignment.LEFT;
            l.verticalAlign = VerticalTextAlignment.CENTER;
            l.overflow = Label.Overflow.SHRINK;
            styleLabel(l, { outline: false });
            return l;
        };
        const back = this._mkBtn(p, '返回大厅', -510, 305, 170, touch ? 72 : 48, UI_PALETTE.muted);
        back.on(Node.EventType.TOUCH_END, () => this.onCharSelectBack?.(), this);
        label(p, 'T', '选择出战英雄', 0, 305, 600, 44, 30).horizontalAlign = HorizontalTextAlignment.CENTER;
        this._charDiffLabel = label(p, 'DiffBadge', '', 130, 260, 920, 25, 15, UI_PALETTE.muted);

        // 当前英雄占据主舞台，名单只负责切换；完整技能说明在介绍页展开。
        const focusPanels: Node[] = [];
        const markers: Graphics[] = [];
        const focusHero = (idx: number) => {
            focusPanels.forEach((n, i) => { n.active = i === idx; });
            markers.forEach((g, i) => {
                g.clear();
                if (i !== idx) return;
                g.strokeColor = UI_PALETTE.reward;
                g.lineWidth = 2.5;
                g.roundRect(-74, -59, 148, 118, 10); g.stroke();
                g.fillColor = UI_PALETTE.reward;
                g.roundRect(-59, -60, 118, 4, 2); g.fill();
            });
        };
        const roles = ['贯穿射击 / 爆发输出', '炮台部署 / 火力支援', '近身作战 / 吸血续航',
            '时空切换 / 灵活突袭', '混沌法术 / 范围压制', '远程狙击 / 冰霜控制',
            '技能窃取 / 灵活诡诈', '召唤军团 / 灵魂滚雪球'];
        CHARS.forEach((def, i) => {
            const accent = Color.fromHEX(new Color(), def.color);
            const focus = new Node(`HeroFocus_${i}`); focus.setParent(p); focus.setPosition(0, 45);
            focus.addComponent(UITransform).setContentSize(1180, 360);
            const g = focus.addComponent(Graphics);
            const draw = () => {
                g.clear();
                drawHexPanel(g, -590, -180, 1180, 360, new Color(86, 116, 139), 242);
                g.fillColor = new Color(11, 24, 36, 210);
                g.roundRect(-570, -158, 326, 316, 12); g.fill();
                g.fillColor = accent; g.fillRect(-225, -146, 3, 290);
            };
            draw(); attachEnableRedraw(focus, draw);
            const portrait = new Node('PortraitMount'); portrait.setParent(focus); portrait.setPosition(-407, 0);
            loadPortraitArt(portrait, `ui_hero_display_${def.id}`, 306, 306);
            label(focus, 'HeroName', def.name, 170, 125, 730, 48, 34);
            label(focus, 'Role', roles[i], 170, 81, 730, 28, 17, accent);
            label(focus, 'Passive', `被动  ${def.desc}`, 170, 30, 730, 66, 19, UI_PALETTE.muted);
            const keys = ['q', 'e', 'r'] as const;
            keys.forEach((key, k) => {
                const x = -174 + k * 246;
                const icon = new Node(`Skill_${key}`); icon.setParent(focus); icon.setPosition(x, -45);
                icon.addComponent(UITransform).setContentSize(36, 36);
                const sp = icon.addComponent(Sprite); sp.sizeMode = Sprite.SizeMode.CUSTOM;
                applyArtSprite(sp, `ui_icon_${def.skillIcons[key]}`);
                label(focus, `SkillName_${key}`, `${key.toUpperCase()}  ${splitSkillText(def.skills[key])[0]}`,
                    x + 116, -45, 180, 34, 17);
            });
            const locked = !def.unlocked;
            const select = this._mkBtn(focus, locked ? '尚未解锁' : '确认出战', 365, -130, 300, 64,
                UI_PALETTE.reward, locked);
            select.on(Node.EventType.TOUCH_END, () => { if (def.unlocked) this.onCharSelected?.(def); }, this);
            if (locked) {
                label(focus, 'UnlockHint', def.unlockHint ?? '尚未解锁', -10, -130, 390, 48, 18, UI_PALETTE.reward);
            } else {
                const detail = this._mkBtn(focus, '英雄介绍', -50, -130, 280, 64, UI_PALETTE.muted);
                detail.on(Node.EventType.TOUCH_END, () => this.showCharDetail(def), this);
            }
            focusPanels.push(focus);
            // 专门绘制的高清半身像；名单显示头肩，完整展示图在主卡中等比呈现。
            const tile = new Node(`HeroTile_${i}`); tile.setParent(p);
            tile.setPosition(-560 + i * 160, -254);
            tile.addComponent(UITransform).setContentSize(150, 120);
            const tileG = tile.addComponent(Graphics);
            const drawTile = () => {
                tileG.clear();
                drawHexPanel(tileG, -75, -60, 150, 120, accent, 244);
                tileG.fillColor = new Color(6, 18, 29, 190);
                tileG.roundRect(-69, -29, 138, 82, 8); tileG.fill();
                tileG.fillColor = new Color(accent.r, accent.g, accent.b, 180);
                tileG.roundRect(-65, -31, 130, 2, 1); tileG.fill();
            };
            drawTile(); attachEnableRedraw(tile, drawTile);
            registerKeyboardFocus(tile, 150, 120, { activate: () => focusHero(i) });
            loadPortraitArt(tile, `ui_hero_display_${def.id}`, 138, 82, 0, 12, 'cover', true);
            label(tile, 'HeroTileName', def.name.split('·').pop()!.trim(), 0, -43, 132, 27, 16)
                .horizontalAlign = HorizontalTextAlignment.CENTER;
            if (locked) label(tile, 'Locked', '未解锁', 42, -15, 58, 18, 11, UI_PALETTE.reward);
            const marker = new Node('Selected'); marker.setParent(tile);
            markers.push(marker.addComponent(Graphics));
            tile.on(Node.EventType.TOUCH_END, () => focusHero(i), this);
        });
        focusHero(0);
        attachEnableRedraw(p, () => focusHero(0));
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
        dlg.addComponent(UITransform).setContentSize(1020, 620);
        this._detailGfx = dlg.addComponent(Graphics);
        const detailLabel = (parent: Node, name: string, value: string,
                             x: number, y: number, w: number, h: number,
                             size: number, color: Color,
                             align = HorizontalTextAlignment.LEFT): Label => {
            const node = new Node(name); node.setParent(parent);
            node.setPosition(new Vec3(x, y, 0));
            node.addComponent(UITransform).setContentSize(w, h);
            const label = node.addComponent(Label);
            label.string = value;
            label.fontSize = size;
            label.color = color;
            label.horizontalAlign = align;
            label.verticalAlign = VerticalTextAlignment.CENTER;
            label.overflow = Label.Overflow.SHRINK;
            styleLabel(label, { outline: size >= 20 });
            return label;
        };

        const eyebrow = new Node('Eyebrow'); eyebrow.setParent(dlg);
        eyebrow.setPosition(new Vec3(0, 295, 0));
        eyebrow.addComponent(UITransform).setContentSize(560, 21);
        const el = eyebrow.addComponent(Label);
        el.string = '英雄档案  /  HERO DOSSIER';
        el.fontSize = 13; el.color = UI_PALETTE.cyan;
        styleLabel(el, { outline: false });

        const tn = new Node('Title'); tn.setParent(dlg);
        tn.setPosition(new Vec3(0, 261, 0));
        tn.addComponent(UITransform).setContentSize(700, 40);
        this._detailTitle = tn.addComponent(Label);
        this._detailTitle.fontSize = 32;
        this._detailTitle.overflow = Label.Overflow.SHRINK;
        this._detailTitle.enableWrapText = false;
        styleLabel(this._detailTitle);

        // 左列：立绘成为角色身份焦点，属性收在同一装甲卡内。
        const pf = new Node('PortraitFrame'); pf.setParent(dlg);
        pf.setPosition(new Vec3(-350, 94, 0));
        pf.addComponent(UITransform).setContentSize(246, 246);
        this._detailPortraitGfx = pf.addComponent(Graphics);

        this._detailPortrait = createPortraitViewport(dlg, 'HeroDetailPortrait', 230, 230, -350, 94);

        const stN = new Node('Stats'); stN.setParent(dlg);
        stN.setPosition(new Vec3(-350, -136, 0));
        stN.addComponent(UITransform).setContentSize(240, 169);
        this._detailStats = stN.addComponent(Label);
        this._detailStats.fontSize = 16;
        this._detailStats.lineHeight = 23;
        this._detailStats.color = new Color(198, 212, 230, 250);
        this._detailStats.horizontalAlign = HorizontalTextAlignment.LEFT;
        this._detailStats.verticalAlign = VerticalTextAlignment.TOP;
        styleLabel(this._detailStats);

        // 右列：被动与 Q/E/R 四张阅读卡，长说明不再挤成灰色注脚。
        const RX = 180, RW = 590;
        const headY = [188, 88, -12, -112];
        const descY = [151, 51, -49, -149];
        for (let k = 0; k < 4; k++) {
            if (k > 0) {
                const icon = new Node(`SkillIcon${k}`); icon.setParent(dlg);
                icon.setPosition(new Vec3(-166, headY[k] - 7, 0));
                icon.addComponent(UITransform).setContentSize(46, 46);
                const sp = icon.addComponent(Sprite);
                sp.sizeMode = Sprite.SizeMode.CUSTOM;
                this._detailSkillIcons.push(sp);
            }
            const hd = new Node(`SkillHead${k}`); hd.setParent(dlg);
            hd.setPosition(new Vec3(RX, headY[k], 0));
            hd.addComponent(UITransform).setContentSize(RW, 31);
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
            dc.addComponent(UITransform).setContentSize(RW, 50);
            const dl = dc.addComponent(Label);
            dl.fontSize = 16;
            dl.lineHeight = 24;
            dl.color = new Color(212, 224, 240, 242);
            dl.horizontalAlign = HorizontalTextAlignment.LEFT;
            dl.verticalAlign = VerticalTextAlignment.TOP;
            dl.overflow = Label.Overflow.CLAMP;
            dl.enableWrapText = true;
            styleLabel(dl);
            this._detailSkillDescs.push(dl);
        }

        // 底部：弹窗内可直接出战，或返回选人页
        const touch = sys.hasFeature(sys.Feature.INPUT_TOUCH);
        const selBtn = this._mkBtn(dlg, '选择出战', -174, -268,
            260, touch ? 72 : 52, new Color(24, 170, 120, 255));
        selBtn.on(Node.EventType.TOUCH_END, () => {
            if (this._detailDef) this.onCharSelected?.(this._detailDef);
        }, this);
        const backBtn = this._mkBtn(dlg, '返回', 174, -268,
            260, touch ? 72 : 52, new Color(70, 90, 130, 255));
        backBtn.on(Node.EventType.TOUCH_END, () => this.hide('charDetail'), this);

        detailLabel(dlg, 'SkillTapHint', '点按技能卡查看完整说明',
            180, -219, 400, 19, 13, UI_PALETTE.muted, HorizontalTextAlignment.CENTER);
        for (let k = 0; k < 4; k++) {
            const tap = new Node(`SkillCardTap${k}`); tap.setParent(dlg);
            tap.setPosition(new Vec3(145, 173 - k * 100, 0));
            tap.addComponent(UITransform).setContentSize(682, 92);
            tap.on(Node.EventType.TOUCH_END, () => this._showCharSkillDetail(k));
            registerKeyboardFocus(tap, 682, 92);
        }

        const overlay = new Node('SkillDetail'); overlay.setParent(dlg);
        overlay.addComponent(UITransform).setContentSize(1020, 620);
        overlay.addComponent(BlockInputEvents);
        registerKeyboardModalScope(overlay);
        const overlayG = overlay.addComponent(Graphics);
        const drawSkillOverlay = () => {
            overlayG.clear();
            overlayG.fillColor = new Color(3, 9, 17, 224);
            overlayG.fillRect(-510, -310, 1020, 620);
            drawHexPanel(overlayG, -380, -215, 760, 430, UI_PALETTE.cyan, 255);
            overlayG.fillColor = new Color(46, 195, 216, 180);
            overlayG.fillRect(-333, 124, 666, 2);
        };
        drawSkillOverlay(); attachEnableRedraw(overlay, drawSkillOverlay);
        this._detailSkillTitle = detailLabel(overlay, 'Title', '',
            0, 162, 650, 42, 26, UI_PALETTE.text, HorizontalTextAlignment.CENTER);
        this._detailSkillFullDesc = detailLabel(overlay, 'FullDescription', '',
            0, 0, 640, 222, 18, UI_PALETTE.text);
        this._detailSkillFullDesc.verticalAlign = VerticalTextAlignment.TOP;
        this._detailSkillFullDesc.lineHeight = 29;
        this._detailSkillFullDesc.enableWrapText = true;
        this._detailSkillFullDesc.overflow = Label.Overflow.CLAMP;
        const closeSkill = this._mkBtn(overlay, '关闭说明', 0, -166, 206, 48, UI_PALETTE.cyan);
        closeSkill.on(Node.EventType.TOUCH_END, () => { overlay.active = false; }, this);
        overlay.active = false;
        this._detailSkillOverlay = overlay;
    }

    private _showCharSkillDetail(slot: number): void {
        const def = this._detailDef;
        if (!def) return;
        const skills = [def.skills.q, def.skills.e, def.skills.r];
        const skill = slot === 0 ? null : splitSkillText(skills[slot - 1]);
        this._detailSkillTitle.string = slot === 0 ? '被动天赋' : `${['Q', 'E', 'R'][slot - 1]} · ${skill![0]}`;
        this._detailSkillTitle.color = slot === 0 ? UI_PALETTE.reward : Color.fromHEX(new Color(), def.color);
        this._detailSkillFullDesc.string = slot === 0 ? def.desc : skill![1];
        this._detailSkillOverlay.active = true;
    }

    /** 打开英雄介绍弹窗：按角色填充立绘、基础属性与被动/Q/E/R 详细描述。 */
    showCharDetail(def: CharDef) {
        this._detailDef = def;
        this._detailSkillOverlay.active = false;
        const col = Color.fromHEX(new Color(), def.color);

        const g = this._detailGfx;
        g.clear();
        drawHexPanel(g, -510, -310, 1020, 620, new Color(86, 116, 139), 255);
        g.fillColor = new Color(8, 20, 32, 255);
        g.roundRect(-490, -224, 280, 450, 12); g.fill();
        for (const y of [127, 27, -73, -173]) {
            g.fillColor = new Color(10, 26, 41, 250);
            g.roundRect(-196, y, 682, 92, 10); g.fill();
            g.fillColor = new Color(col.r, col.g, col.b, 170);
            g.fillRect(-196, y + 10, 3, 72);
        }
        g.strokeColor = new Color(col.r, col.g, col.b, 135);
        g.lineWidth = 2;
        g.moveTo(-470, 229); g.lineTo(470, 229); g.stroke();

        const pg = this._detailPortraitGfx;
        pg.clear();
        pg.fillColor = new Color(9, 15, 24, 245);
        pg.fillRect(-123, -123, 246, 246);
        pg.strokeColor = new Color(col.r, col.g, col.b, 170);
        pg.lineWidth = 1.5;
        pg.rect(-123, -123, 246, 246); pg.stroke();

        this._detailTitle.string = def.name;
        this._detailTitle.color = col;

        this._detailPortrait.spriteFrame = null;
        loadArtSprite(`ui_hero_display_${def.id}`, (frame) => {
            if (frame && this._detailPortrait.isValid && this._detailDef?.id === def.id) {
                fitPortraitFrame(this._detailPortrait, frame, 230, 230);
            }
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
        this._buildRunReportPanel('chapterClear', new Color(104, 190, 158, 255));
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
        const metricsLabels: Label[] = [];
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
            metricsLabels.push(keyLabel);
            const val = new Node('Value'); val.setParent(cell);
            val.setPosition(new Vec3(0, -10, 0));
            val.addComponent(UITransform).setContentSize(260, 34);
            const value = val.addComponent(Label);
            value.string = '0'; value.fontSize = 26; value.color = UI_PALETTE.text;
            styleLabel(value);
            values.push(value);
        }

        const primaryText = name === 'gameover' ? '重新开始' : '进入下一章';
        const touch = sys.hasFeature(sys.Feature.INPUT_TOUCH);
        const primaryBtn = this._mkBtn(p, primaryText, touch ? -160 : 0,
            touch ? -178 : -149, touch ? 260 : 230, touch ? 72 : 46,
            name === 'gameover' ? new Color(55, 145, 102, 255) : new Color(42, 158, 207, 255));
        const backBtn = this._mkBtn(p, '返回大厅', touch ? 160 : 0,
            touch ? -178 : -208, touch ? 260 : 230, touch ? 72 : 46,
            new Color(78, 111, 135, 255));
        primaryBtn.on(Node.EventType.TOUCH_END, () => {
            if (name === 'gameover') this.onRestartPressed?.();
            else this.onContinuePressed?.();
        }, this);
        backBtn.on(Node.EventType.TOUCH_END, () => this.onMainMenuPressed?.(), this);
        const primary = primaryBtn.getChildByName('L')!.getComponent(Label)!;
        // v5："本局新解锁"成就行——贴面板底缘，按钮布局保持不动
        const achNode = new Node('NewAchievements'); achNode.setParent(p);
        achNode.setPosition(new Vec3(0, touch ? -232 : -238, 0));
        achNode.addComponent(UITransform).setContentSize(690, 22);
        const achLabel = achNode.addComponent(Label);
        achLabel.fontSize = 14; achLabel.lineHeight = 18;
        achLabel.color = new Color(255, 214, 96, 245);
        achLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        achLabel.verticalAlign = VerticalTextAlignment.CENTER;
        achLabel.overflow = Label.Overflow.SHRINK;
        styleLabel(achLabel, { outline: false });
        achNode.active = false;
        this._runReports.set(name, { title, subtitle, values, metrics: metricsLabels, primary, achievements: achLabel, redraw });
    }

    private _buildPausePanel() {
        const touch = sys.hasFeature(sys.Feature.INPUT_TOUCH);
        const p = this._mkPanel('pause', 500, touch ? 430 : 360);

        const bg = p.addComponent(Graphics);
        drawHexPanel(bg, -250, touch ? -215 : -180, 500, touch ? 430 : 360, UI_PALETTE.cyan, 244);

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, touch ? 155 : 130, 0));
        tn.addComponent(UITransform).setContentSize(300, 44);
        const tl = tn.addComponent(Label);
        tl.string = '游戏暂停';
        tl.fontSize = 36; tl.color = UI_PALETTE.text;
        styleLabel(tl);

        // 文案用中性的「退出战斗」：正式局退回存档大厅，测试房退回首页（由 GameManager 按来源分流）
        const btnW = touch ? 280 : 200;
        const btnH = touch ? 72 : 44;
        const r = this._mkBtn(p, '继续游戏', 0, touch ? 50 : 30, btnW, btnH, new Color(40, 140, 80, 230));
        const m = this._mkBtn(p, '退出战斗', 0, touch ? -45 : -40, btnW, btnH, new Color(60, 60, 90, 230));
        const st = this._mkBtn(p, '设置', 0, touch ? -140 : -110, btnW, btnH, new Color(70, 105, 130, 230));
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
        veil.addComponent(UITransform).setContentSize(visibleDesignWidth(), visibleDesignHeight());
        const vg = veil.addComponent(Graphics);
        const content = new Node('Content'); content.setParent(veil);
        const t = new Node('T'); t.setParent(content);
        t.addComponent(UITransform).setContentSize(700, 60);
        const tl = t.addComponent(Label);
        tl.string = '感谢游玩 · 游戏已退出';
        tl.fontSize = 40; tl.color = new Color(220, 228, 238, 255);
        styleLabel(tl);
        const sub = new Node('S'); sub.setParent(content);
        sub.setPosition(new Vec3(0, -56, 0));
        sub.addComponent(UITransform).setContentSize(700, 68);
        const sl = sub.addComponent(Label);
        sl.string = '浏览器拦截了自动关闭，可直接关闭窗口/标签页退出';
        sl.fontSize = 16; sl.color = new Color(140, 158, 174, 230);
        styleLabel(sl);
        const drawVeil = () => {
            const width = visibleDesignWidth();
            const height = visibleDesignHeight();
            const portrait = height > CANVAS_H;
            veil.getComponent(UITransform)!.setContentSize(width, height);
            vg.clear();
            vg.fillColor = new Color(4, 6, 12, 250);
            vg.fillRect(-width / 2, -height / 2, width, height);
            content.setScale(new Vec3(portrait ? 2.4 : 1, portrait ? 2.4 : 1, 1));
            t.setPosition(new Vec3(0, portrait ? 50 : 0, 0));
            tl.fontSize = portrait ? 44 : 40;
            sub.setPosition(new Vec3(0, portrait ? -45 : -56, 0));
            sl.fontSize = portrait ? 22 : 16;
            sl.lineHeight = portrait ? 28 : 22;
            sl.string = portrait
                ? '浏览器未能自动关闭\n请关闭此窗口或标签页'
                : '浏览器拦截了自动关闭，可直接关闭窗口/标签页退出';
        };
        this._drawExitVeil = drawVeil;
        drawVeil();
        attachEnableRedraw(veil, drawVeil);
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
        tl.string = '设置'; tl.fontSize = 34; tl.color = UI_PALETTE.text;
        styleLabel(tl);

        const v = this.getAudioVolumes?.() ?? { bgm: 0.48, sfx: 1 };
        this._sliderMusic = this._mkVolumeSlider(p, 92, '音乐音量', v.bgm,
            r => this._applyVolumes(r, this._sliderSfx ? this._currentRatio(this._sliderSfx) : v.sfx));
        this._sliderSfx = this._mkVolumeSlider(p, 22, '音效音量', v.sfx,
            r => this._applyVolumes(this._currentRatio(this._sliderMusic), r));

        const hint = new Node('Hint'); hint.setParent(p);
        hint.setPosition(new Vec3(0, -34, 0));
        hint.addComponent(UITransform).setContentSize(440, 22);
        const hl = hint.addComponent(Label);
        hl.string = '拖动滑杆实时调节，设置自动保存';
        hl.fontSize = 14; hl.lineHeight = 20;
        hl.color = new Color(140, 158, 174, 220);
        styleLabel(hl);

        const touch = sys.hasFeature(sys.Feature.INPUT_TOUCH);

        // 后台管理入口（管理员验证后进入：系统参数配置 + 成就管理）
        const adminBtn = this._mkBtn(p, '后台管理', 0, -80, 240,
            touch ? 56 : 44, new Color(150, 108, 220, 255));
        adminBtn.on(Node.EventType.TOUCH_END, () => this._adminUI?.open(), this);

        // 新手引导开关（2026-10-19 玩家定稿：引导在第一局实战中进行，设置页
        // 只控制启停）：点击切换 开/关，设备级持久化（hexblast_tutorial_enabled_v1）。
        const tutorialBtn = this._mkBtn(p, '', 0, -130, 240,
            touch ? 56 : 44, new Color(42, 140, 168, 255));
        const tutorialLbl = tutorialBtn.getChildByName('L')!.getComponent(Label)!;
        const refreshTutorialBtn = () => {
            const on = tutorialEnabled(defaultTutorialStorage());
            tutorialLbl.string = `新手引导：${on ? '开' : '关'}`;
            tutorialLbl.color = on ? new Color(140, 235, 255, 255) : new Color(150, 162, 172, 235);
        };
        tutorialBtn.on(Node.EventType.TOUCH_END, () => {
            const next = !tutorialEnabled(defaultTutorialStorage());
            setTutorialEnabled(defaultTutorialStorage(), next);
            refreshTutorialBtn();
        }, this);
        refreshTutorialBtn();

        const close = this._mkBtn(p, '关闭', 0, -182, touch ? 240 : 200,
            touch ? 64 : 42, new Color(60, 100, 80, 235));
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
        const touch = sys.hasFeature(sys.Feature.INPUT_TOUCH);
        const hitHeight = touch ? 64 : 34;
        const row = new Node(`Slider_${label}`); row.setParent(parent);
        row.setPosition(new Vec3(40, y, 0));
        row.addComponent(UITransform).setContentSize(520, hitHeight);

        const nameN = new Node('Name'); nameN.setParent(row);
        nameN.setPosition(new Vec3(-210, 0, 0));
        nameN.addComponent(UITransform).setContentSize(110, 26);
        const nl = nameN.addComponent(Label);
        nl.string = label; nl.fontSize = touch ? 20 : 17;
        nl.color = new Color(205, 218, 228, 255);
        nl.horizontalAlign = HorizontalTextAlignment.RIGHT;
        styleLabel(nl);

        // 轨道：触屏端扩大隐形热区，绘制条仍保持细线便于观察当前值。
        const track = new Node('Track'); track.setParent(row);
        track.addComponent(UITransform).setContentSize(WIDTH, hitHeight);
        const tg = track.addComponent(Graphics);
        const knob = new Node('Knob'); knob.setParent(track);
        const kg = knob.addComponent(Graphics);
        const pctN = new Node('Pct'); pctN.setParent(row);
        pctN.setPosition(new Vec3(WIDTH / 2 + 36, 0, 0));
        pctN.addComponent(UITransform).setContentSize(56, 26);
        const pct = pctN.addComponent(Label);
        pct.fontSize = touch ? 18 : 16; pct.color = new Color(255, 214, 90, 255);
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
            kg.circle(0, 0, touch ? 16 : 13); kg.fill();
            kg.fillColor = new Color(120, 235, 205, 255);
            kg.circle(0, 0, touch ? 11 : 9); kg.fill();
            kg.strokeColor = new Color(180, 255, 235, 255);
            kg.lineWidth = 1.5; kg.circle(0, 0, touch ? 16 : 13); kg.stroke();
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
        registerKeyboardFocus(track, WIDTH, hitHeight, {
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

    private _mkBtn(parent: Node, text: string,
                   x: number, y: number, w: number, h: number,
                   fillCol: Color, disabled = false): Node {
        const btn = new Node(`Btn_${text}`); btn.setParent(parent);
        btn.setPosition(new Vec3(x, y, 0));
        btn.addComponent(UITransform).setContentSize(w, h);
        const menuButton = parent.name === 'MenuActions';
        applyHexButtonSkin(btn, w, h, fillCol, disabled, { focusScale: menuButton ? 1.08 : undefined });
        if (menuButton && !disabled) {
            const select = () => {
                this._clearKeyboardFocus();
                this._focusedControl = btn;
                keyboardFocusTarget(btn)?.setFocused(true);
            };
            btn.on(Node.EventType.MOUSE_ENTER, select);
            btn.on(Node.EventType.TOUCH_START, select);
            const reset = () => {
                if (this._focusedControl === btn) this._clearKeyboardFocus();
            };
            btn.on(Node.EventType.MOUSE_LEAVE, reset);
            btn.on(Node.EventType.TOUCH_CANCEL, reset);
        }

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
