import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, HorizontalTextAlignment, VerticalTextAlignment
} from 'cc';
import { CharDef } from '../data/CharacterDB';
import { CHARS } from '../data/CharacterDB';
import { applyArtSprite, loadArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';
import { applyHexButtonSkin } from '../core/UIStyle';

const { ccclass } = _decorator;

export type ScreenName =
    | 'menu' | 'charSelect' | 'playing'
    | 'gameover' | 'chapterClear' | 'pause';

type BtnCallback = () => void;

/**
 * ScreenManager — owns all full-screen panels.
 * Call show(name) / hide(name) or transition(from, to).
 * Wire callbacks via setCallbacks() before showing any screen.
 */
@ccclass('ScreenManager')
export class ScreenManager extends Component {
    private _panels: Map<ScreenName, Node> = new Map();

    // callbacks set by GameManager
    onPlayPressed?:        BtnCallback;
    onCharSelected?:       (char: CharDef) => void;
    onRestartPressed?:     BtnCallback;
    onMainMenuPressed?:    BtnCallback;
    onContinuePressed?:    BtnCallback;   // after chapter clear
    onResumePressed?:      BtnCallback;   // resume from pause
    onButtonSfx?:          BtnCallback;

    onLoad() {
        this._buildMenuPanel();
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

        // 原 title_screen 把四个按钮烧在背景里，无法拥有悬停/按下/禁用状态，
        // 也导致可见按钮与点击热区长期漂移。用一块完全不透明、向上覆盖到
        // 原 START GAME 发光外框顶部的操作台盖住旧按钮区，再叠真正的代码按钮；
        // 标题与环境插画继续复用，交互层则完全可控。
        const menuDeck = new Node('MenuDeck'); menuDeck.setParent(p);
        menuDeck.setPosition(new Vec3(0, -70, 0));
        menuDeck.addComponent(UITransform).setContentSize(568, 410);
        const deckG = menuDeck.addComponent(Graphics);
        deckG.fillColor = new Color(4, 10, 18, 255);
        deckG.fillRect(-284, -205, 568, 410);
        deckG.strokeColor = new Color(35, 205, 220, 150);
        deckG.lineWidth = 2; deckG.rect(-284, -205, 568, 410); deckG.stroke();
        deckG.strokeColor = new Color(220, 250, 255, 55);
        deckG.moveTo(-260, 188); deckG.lineTo(260, 188); deckG.stroke();

        const btn = this._mkBtn(menuDeck, '开始游戏', 0, 105, 450, 64, new Color(20, 220, 210, 255));
        btn.on(Node.EventType.TOUCH_END, () => this.onPlayPressed?.(), this);

        this._mkBtn(menuDeck, '升级  ·  即将开放', 0, 28, 330, 46, new Color(80, 118, 135, 255), true);
        this._mkBtn(menuDeck, '设置  ·  即将开放', 0, -40, 330, 46, new Color(80, 118, 135, 255), true);
        this._mkBtn(menuDeck, '退出  ·  即将开放', 0, -108, 330, 46, new Color(80, 118, 135, 255), true);
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
            const cy = 80 - row * 260;

            const card = new Node(`Card_${i}`); card.setParent(p);
            card.setPosition(new Vec3(cx, cy, 0));
            card.addComponent(UITransform).setContentSize(360, 260);

            const idx = i;
            const def = CHARS[idx];
            const charId = def?.id;

            // 用同一套深色卡框收束来源不同的角色立绘，并用角色主题色做细边。
            // 立绘本身仍保持透明，不会出现六张图各自带一块方形背景的拼贴感。
            // 卡片扩宽后技能说明可稳定保持四行，不再依赖 SHRINK 把正文压成小字。
            const frameN = new Node('PortraitFrame'); frameN.setParent(card);
            frameN.setPosition(new Vec3(0, 75, 0));
            frameN.addComponent(UITransform).setContentSize(132, 132);
            const frameG = frameN.addComponent(Graphics);
            frameG.fillColor = new Color(9, 15, 24, 245);
            frameG.fillRect(-66, -66, 132, 132);
            frameG.strokeColor = colors[i] ?? new Color(80, 140, 180, 255);
            frameG.lineWidth = 3;
            frameG.rect(-66, -66, 132, 132); frameG.stroke();

            if (charId) this._loadPortrait(card, `char_${charId}`, 124, 75);

            const locked = !!def && !def.unlocked;
            const nameBtn = this._mkBtn(card, names[i] ?? `Char${i}`,
                0, -5, 338, 44,
                locked ? new Color(70, 82, 92, 255) : (colors[i] ?? new Color(80, 80, 120, 255)), locked);

            if (locked) {
                // Dim the whole card and show a lock badge + unlock hint instead
                // of wiring the select callback — clicking a locked card does nothing.
                const dim = new Node('LockDim'); dim.setParent(card);
                // LockDim 创建时已是卡片最上层。不要再塞回 sibling 1：Portrait
                // 本身也在 sibling 1，插入后会把立绘推到遮罩上方，造成“黑框只遮
                // 下半张卡、角色仍全亮”的层级穿帮。后续锁标与提示继续创建，
                // 自然位于遮罩之上。
                // PortraitFrame 顶边实际到 card y=141，超出原卡片半高130；
                // 遮罩上移并扩高，完整包住描边，避免顶部再漏出一条亮色边。
                dim.setPosition(new Vec3(0, 5, 0));
                dim.addComponent(UITransform).setContentSize(360, 282);
                const dimG = dim.addComponent(Graphics);
                dimG.fillColor = new Color(0, 0, 0, 205);
                dimG.fillRect(-180, -141, 360, 282);

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
                const skN = new Node('Skills'); skN.setParent(card);
                skN.setPosition(new Vec3(0, -82, 0));
                skN.addComponent(UITransform).setContentSize(344, 100);
                const skLbl = skN.addComponent(Label);
                skLbl.string = def
                    ? `被动 ${def.desc}\nQ ${def.skills.q}\nE ${def.skills.e}\nR ${def.skills.r}`
                    : '';
                skLbl.fontSize = 11;
                skLbl.lineHeight = 17;
                skLbl.color = new Color(190, 205, 225, 235);
                skLbl.horizontalAlign = HorizontalTextAlignment.LEFT;
                skLbl.verticalAlign = VerticalTextAlignment.TOP;
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
