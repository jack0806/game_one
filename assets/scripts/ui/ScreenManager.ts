import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, HorizontalTextAlignment, VerticalTextAlignment
} from 'cc';
import { CharDef } from '../data/CharacterDB';
import { CHARS } from '../data/CharacterDB';
import { applyArtSprite, loadArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';
import { applyHexButtonSkin } from '../core/UIStyle';
import { MetaPageName, MetaPageUI } from './MetaPageUI';

const { ccclass } = _decorator;

export type ScreenName =
    | 'menu' | 'charSelect' | 'playing'
    | 'gameover' | 'chapterClear' | 'pause'
    | MetaPageName;

type BtnCallback = () => void;

/**
 * ScreenManager — owns all full-screen panels.
 * Call show(name) / hide(name) or transition(from, to).
 * Wire callbacks via setCallbacks() before showing any screen.
 */
@ccclass('ScreenManager')
export class ScreenManager extends Component {
    private _panels: Map<ScreenName, Node> = new Map();
    private _metaPages!: MetaPageUI;

    // callbacks set by GameManager
    onPlayPressed?:        BtnCallback;
    onTestRoomPressed?:    BtnCallback;   // open test room config
    onCharSelected?:       (char: CharDef) => void;
    onRestartPressed?:     BtnCallback;
    onMainMenuPressed?:    BtnCallback;
    onContinuePressed?:    BtnCallback;   // after chapter clear
    onResumePressed?:      BtnCallback;   // resume from pause
    onButtonSfx?:          BtnCallback;

    onLoad() {
        this._buildMenuPanel();
        this._metaPages = new MetaPageUI(this.node, {
            onBack: () => this.transition(this._currentMetaPage(), 'menu'),
            onButtonSfx: () => this.onButtonSfx?.(),
        });
        for (const [name, panel] of this._metaPages.entries()) this._panels.set(name, panel);
        this._buildCharSelectPanel();
        this._buildGameoverPanel();
        this._buildChapterClearPanel();
        this._buildPausePanel();
        // start with everything hidden
        this._panels.forEach(p => p.active = false);
    }

    // ── public API ────────────────────────────────────────────

    show(name: ScreenName) {
        const p = this._panels.get(name);
        if (p) p.active = true;
        if (name === 'tasks' || name === 'codex' || name === 'achievements') {
            this._metaPages.refresh(name);
        }
    }

    hide(name: ScreenName) {
        const p = this._panels.get(name);
        if (p) p.active = false;
    }

    hideAll() {
        this._panels.forEach(p => p.active = false);
    }

    transition(from: ScreenName, to: ScreenName) {
        this.hide(from);
        this.show(to);
    }

    // ── panel builders ────────────────────────────────────────

    private _buildMenuPanel() {
        const p = this._mkPanel('menu', 1280, 720);

        // background — flat color first (fallback while title_screen.png loads / if missing),
        // then a full-screen Sprite drawn on top of it, behind the title text below.
        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(12, 8, 22, 255);
        bg.fillRect(-640, -360, 1280, 720);

        const bgArtNode = new Node('BgArt'); bgArtNode.setParent(p);
        bgArtNode.addComponent(UITransform).setContentSize(1280, 720);
        const bgArtSprite = bgArtNode.addComponent(Sprite);
        bgArtSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        applyArtSprite(bgArtSprite, 'title_screen');

        // title_screen 已移除全部烧录按钮，中下部是自然延续的城市天际线。
        // 操作区只负责定位真实代码按钮，不再绘制遮挡背景的大矩形底板。
        const menuActions = new Node('MenuActions'); menuActions.setParent(p);
        menuActions.setPosition(new Vec3(0, -70, 0));
        menuActions.addComponent(UITransform).setContentSize(568, 410);

        const btn = this._mkBtn(menuActions, '开始游戏', 0, 105, 450, 64, new Color(20, 220, 210, 255));
        btn.on(Node.EventType.TOUCH_END, () => this.onPlayPressed?.(), this);

        // 测试房间：主页直达的 Boss 训练场入口，配置面板由 GameManager 弹出
        const testBtn = this._mkBtn(menuActions, '测试房间', 0, 24, 330, 46, new Color(190, 120, 255, 255));
        testBtn.on(Node.EventType.TOUCH_END, () => this.onTestRoomPressed?.(), this);

        this._mkBtn(menuActions, '升级  ·  即将开放', 0, -36, 330, 46, new Color(80, 118, 135, 255), true);
        this._mkBtn(menuActions, '设置  ·  即将开放', 0, -96, 330, 46, new Color(80, 118, 135, 255), true);
        this._mkBtn(menuActions, '退出  ·  即将开放', 0, -156, 330, 46, new Color(80, 118, 135, 255), true);

        // 首页元进度导航：三个入口均跳转到独立全屏页面，不再用窄小弹窗。
        const metaDock = new Node('MetaDock'); metaDock.setParent(p);
        metaDock.setPosition(new Vec3(0, -322, 0));
        metaDock.addComponent(UITransform).setContentSize(700, 62);

        const taskBtn = this._mkBtn(metaDock, '任务树', -224, 0, 194, 44, new Color(40, 216, 205, 255));
        const codexBtn = this._mkBtn(metaDock, '图鉴', 0, 0, 194, 44, new Color(62, 164, 235, 255));
        const achBtn = this._mkBtn(metaDock, '成就档案', 224, 0, 194, 44, new Color(224, 171, 52, 255));
        taskBtn.on(Node.EventType.TOUCH_END, () => this.transition('menu', 'tasks'), this);
        codexBtn.on(Node.EventType.TOUCH_END, () => this.transition('menu', 'codex'), this);
        achBtn.on(Node.EventType.TOUCH_END, () => this.transition('menu', 'achievements'), this);
    }

    /** 返回按钮只会在三个元进度页面内触发；取当前激活页作为 transition 来源。 */
    private _currentMetaPage(): MetaPageName {
        for (const name of ['tasks', 'codex', 'achievements'] as MetaPageName[]) {
            if (this._panels.get(name)?.active) return name;
        }
        return 'tasks';
    }

    private _buildCharSelectPanel() {
        const p = this._mkPanel('charSelect', 1280, 720);

        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(10, 10, 20, 240);
        bg.fillRect(-640, -360, 1280, 720);

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 280, 0));
        tn.addComponent(UITransform).setContentSize(500, 44);
        const tl = tn.addComponent(Label);
        tl.string = '— 选择角色 —';
        tl.fontSize = 26; tl.color = new Color(255, 215, 90, 255);
        styleLabel(tl);

        // 6 character cards in a 3×2 grid: portrait on top, nameplate button below
        const names  = CHARS.map(c => c.name);
        // 卡框、名牌、战斗棋子和技能特效共用 CharacterDB 的身份色。
        // 旧手写数组把 Vivian/Olia/Graf/Liana 分别错配成粉/绿/黄/紫，
        // 选人页与进入战斗后的视觉语言完全脱节。
        const colors = CHARS.map(c => Color.fromHEX(new Color(), c.color));
        for (let i = 0; i < 6; i++) {
            const col = i % 3, row = Math.floor(i / 3);
            const cx = -400 + col * 400;
            // 第二排整体上收，正文与解锁提示都保留至少约50px的画布安全区。
            const cy = 90 - row * 285;

            const card = new Node(`Card_${i}`); card.setParent(p);
            card.setPosition(new Vec3(cx, cy, 0));
            card.addComponent(UITransform).setContentSize(360, 270);

            const idx = i;
            const def = CHARS[idx];
            const charId = def?.id;
            const locked = !!def && !def.unlocked;

            // 整张卡提供低对比实体底板，把居中的头像、名牌和说明收束为一组；
            // 旧版只有头像框与名牌，四行左对齐文字像漂在页面背景上。
            const cardG = card.addComponent(Graphics);
            const cardCol = colors[i] ?? new Color(80, 140, 180, 255);
            cardG.fillColor = new Color(8, 14, 24, 226);
            cardG.fillRect(-180, -135, 360, 270);
            // 整张角色卡才是实际点击单位，因此身份色选框必须包住完整的
            // “立绘—名牌—定位”信息组。只框头像会误导为头像裁切框或选中态。
            cardG.strokeColor = new Color(cardCol.r, cardCol.g, cardCol.b, locked ? 72 : 188);
            cardG.lineWidth = locked ? 1 : 2;
            cardG.rect(-180, -135, 360, 270); cardG.stroke();
            if (!locked) {
                cardG.strokeColor = new Color(cardCol.r, cardCol.g, cardCol.b, 255);
                cardG.lineWidth = 3;
                const corner = 18;
                for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                    const x = sx * 178, y = sy * 133;
                    cardG.moveTo(x, y - sy * corner); cardG.lineTo(x, y); cardG.lineTo(x - sx * corner, y);
                    cardG.stroke();
                }
            }

            // 头像顶部、头像与名牌之间都保留明确内边距。旧版132px头像在270px
            // 卡片中几乎贴住顶框，并与44px名牌发生约14px视觉重叠。
            const frameN = new Node('PortraitFrame'); frameN.setParent(card);
            frameN.setPosition(new Vec3(0, 68, 0));
            frameN.addComponent(UITransform).setContentSize(112, 112);
            const frameG = frameN.addComponent(Graphics);
            frameG.fillColor = new Color(9, 15, 24, 245);
            frameG.fillRect(-56, -56, 112, 112);
            frameG.strokeColor = new Color(cardCol.r, cardCol.g, cardCol.b, 150);
            frameG.lineWidth = 1.5;
            frameG.rect(-56, -56, 112, 112); frameG.stroke();

            if (charId) this._loadPortrait(card, `char_${charId}`, 104, 68);

            const nameBtn = this._mkBtn(card, names[i] ?? `Char${i}`,
                0, -14, 320, 40,
                locked ? new Color(70, 82, 92, 255) : (colors[i] ?? new Color(80, 80, 120, 255)), locked);

            if (locked) {
                // Dim the whole card and show a lock badge + unlock hint instead
                // of wiring the select callback — clicking a locked card does nothing.
                const dim = new Node('LockDim'); dim.setParent(card);
                // LockDim 创建时已是卡片最上层。不要再塞回 sibling 1：Portrait
                // 本身也在 sibling 1，插入后会把立绘推到遮罩上方，造成“黑框只遮
                // 下半张卡、角色仍全亮”的层级穿帮。后续锁标与提示继续创建，
                // 自然位于遮罩之上。
                dim.setPosition(Vec3.ZERO);
                dim.addComponent(UITransform).setContentSize(360, 270);
                const dimG = dim.addComponent(Graphics);
                dimG.fillColor = new Color(0, 0, 0, 205);
                dimG.fillRect(-180, -135, 360, 270);

                const lockN = new Node('LockIcon'); lockN.setParent(card);
                lockN.setPosition(new Vec3(0, 50, 0));
                lockN.addComponent(UITransform).setContentSize(160, 160);
                const lockLbl = lockN.addComponent(Label);
                lockLbl.string = '未解锁'; lockLbl.fontSize = 20;
                lockLbl.color = new Color(220, 220, 220, 255);
                styleLabel(lockLbl);

                const hintN = new Node('LockHint'); hintN.setParent(card);
                hintN.setPosition(new Vec3(0, -105, 0));
                hintN.addComponent(UITransform).setContentSize(340, 28);
                const hintLbl = hintN.addComponent(Label);
                hintLbl.string = def?.unlockHint ?? '未解锁';
                hintLbl.fontSize = 12;
                hintLbl.color = new Color(200, 160, 90, 230);
                hintLbl.overflow = Label.Overflow.SHRINK;
                hintLbl.enableWrapText = true;
                styleLabel(hintLbl);

                const nlbl = nameBtn.getChildByName('L')?.getComponent(Label);
                if (nlbl) nlbl.color = new Color(140, 140, 140, 220);
            } else {
                card.on(Node.EventType.TOUCH_END,
                    () => this.onCharSelected?.(CHARS[idx]!), this);

                // 被动 + Q/E/R 技能介绍：选人阶段就能看清角色定位，不必进战斗试错。
                // 锁定卡不放（保持 LockDim+解锁提示的简洁观感，解锁后再展示）。
                // 名牌与正文之间以弱分隔线建立层级；正文垂直居中到下半区，
                // 不再紧贴名牌同时把整片空白都堆在卡片底部。
                const dividerN = new Node('InfoDivider'); dividerN.setParent(card);
                dividerN.setPosition(new Vec3(0, -45, 0));
                const dividerG = dividerN.addComponent(Graphics);
                dividerG.strokeColor = new Color(cardCol.r, cardCol.g, cardCol.b, 65);
                dividerG.lineWidth = 1;
                dividerG.moveTo(-150, 0); dividerG.lineTo(150, 0); dividerG.stroke();

                const skN = new Node('Skills'); skN.setParent(card);
                skN.setPosition(new Vec3(0, -88, 0));
                skN.addComponent(UITransform).setContentSize(320, 72);
                const skLbl = skN.addComponent(Label);
                if (def) {
                    const skillName = (text: string) => text.split('—')[0].trim();
                    skLbl.string = `被动 · ${def.desc}\n` +
                        `Q ${skillName(def.skills.q)}  ·  E ${skillName(def.skills.e)}  ·  R ${skillName(def.skills.r)}`;
                } else {
                    skLbl.string = '';
                }
                skLbl.fontSize = 12;
                skLbl.lineHeight = 19;
                skLbl.color = new Color(205, 218, 235, 245);
                skLbl.horizontalAlign = HorizontalTextAlignment.CENTER;
                skLbl.verticalAlign = VerticalTextAlignment.CENTER;
                skLbl.overflow = Label.Overflow.SHRINK;
                skLbl.enableWrapText = true;
                styleLabel(skLbl);
            }
        }
    }

    private _buildGameoverPanel() {
        const p = this._mkPanel('gameover', 800, 480);

        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(20, 8, 8, 240);
        bg.fillRect(-400, -240, 800, 480);
        bg.strokeColor = new Color(180, 30, 30, 200);
        bg.lineWidth = 3; bg.rect(-400, -240, 800, 480); bg.stroke();

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 160, 0));
        tn.addComponent(UITransform).setContentSize(400, 56);
        const tl = tn.addComponent(Label);
        tl.string = '游戏结束';
        tl.fontSize = 46; tl.color = new Color(220, 50, 50, 255);
        styleLabel(tl);

        const r = this._mkBtn(p, '重新开始', 0,  30, 200, 46, new Color(50, 130, 50, 230));
        const m = this._mkBtn(p, '返回主菜单', 0, -40, 200, 46, new Color(60, 60, 90, 230));
        r.on(Node.EventType.TOUCH_END, () => this.onRestartPressed?.(),  this);
        m.on(Node.EventType.TOUCH_END, () => this.onMainMenuPressed?.(), this);
    }

    private _buildChapterClearPanel() {
        const p = this._mkPanel('chapterClear', 800, 460);

        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(8, 20, 12, 240);
        bg.fillRect(-400, -230, 800, 460);
        bg.strokeColor = new Color(40, 200, 80, 180);
        bg.lineWidth = 3; bg.rect(-400, -230, 800, 460); bg.stroke();

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 150, 0));
        tn.addComponent(UITransform).setContentSize(500, 52);
        const tl = tn.addComponent(Label);
        tl.string = '章节通关！';
        tl.fontSize = 40; tl.color = new Color(80, 230, 120, 255);
        styleLabel(tl);

        const sub = new Node('Sub'); sub.setParent(p);
        sub.setPosition(new Vec3(0, 100, 0));
        sub.addComponent(UITransform).setContentSize(400, 30);
        const sl = sub.addComponent(Label);
        sl.string = '准备进入下一章节…';
        sl.fontSize = 15; sl.color = new Color(160, 200, 160, 200);
        styleLabel(sl);

        const c = this._mkBtn(p, '进入下一章', 0, 20, 200, 46, new Color(40, 150, 220, 230));
        const m = this._mkBtn(p, '返回主菜单', 0, -50, 200, 46, new Color(60, 60, 90, 230));
        c.on(Node.EventType.TOUCH_END, () => this.onContinuePressed?.(),  this);
        m.on(Node.EventType.TOUCH_END, () => this.onMainMenuPressed?.(),  this);
    }

    private _buildPausePanel() {
        const p = this._mkPanel('pause', 500, 360);

        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(15, 15, 30, 230);
        bg.fillRect(-250, -180, 500, 360);
        bg.strokeColor = new Color(100, 100, 160, 180);
        bg.lineWidth = 2; bg.rect(-250, -180, 500, 360); bg.stroke();

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 130, 0));
        tn.addComponent(UITransform).setContentSize(300, 44);
        const tl = tn.addComponent(Label);
        tl.string = '游戏暂停';
        tl.fontSize = 36; tl.color = new Color(200, 200, 240, 255);
        styleLabel(tl);

        const r = this._mkBtn(p, '继续游戏', 0,  30, 200, 44, new Color(40, 140, 80, 230));
        const m = this._mkBtn(p, '返回主菜单', 0, -40, 200, 44, new Color(60, 60, 90, 230));
        r.on(Node.EventType.TOUCH_END, () => this.onResumePressed?.(), this);
        m.on(Node.EventType.TOUCH_END, () => this.onMainMenuPressed?.(), this);
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
