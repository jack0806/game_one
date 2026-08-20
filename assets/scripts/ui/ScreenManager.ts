import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, HorizontalTextAlignment, VerticalTextAlignment
} from 'cc';
import { CharDef } from '../data/CharacterDB';
import { CHARS } from '../data/CharacterDB';
import { applyArtSprite, loadArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';

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

        // title_screen.png 本身已经烧录了完整的 "HEXBLAST" 标题、副标题和
        // START GAME/UPGRADES/SETTINGS/EXIT 四个按钮外观，不再需要代码重复
        // 绘制一套标题/副标题文字（此前重复绘制会与图片里的文字重影错位，
        // 就是用户反馈"图片与开始按钮不对应"的根因）。
        // 这里只在图片对应位置放一个透明热区，把点击对接到图里画好的
        // "START GAME" 按钮上，不再单独画一个位置/风格都不一致的按钮。
        // title_screen 的 START GAME 可见框约为 480×86，中心在面板本地 y=+30。
        // 旧热区 (0,-50,210,42) 实机会落到图片里的 UPGRADES 一带，且只有
        // 可见按钮约四分之一面积，导致“点在开始按钮上没有反应”。热区必须
        // 覆盖完整可见轮廓，窗口等比缩放时仍由 Cocos UITransform 同步缩放。
        const btn = this._mkHotspot(p, 0, 30, 480, 86);
        btn.on(Node.EventType.TOUCH_END, () => this.onPlayPressed?.(), this);

        // 背景图还烧录了三个尚未实现的按钮。明确置灰并标注“即将开放”，
        // 避免玩家把装饰误认为可点击功能；后续功能上线时再替换成真实按钮。
        this._mkDisabledArtButton(p, 0, -62, 218, 50);
        this._mkDisabledArtButton(p, 0, -132, 218, 50);
        this._mkDisabledArtButton(p, 0, -204, 218, 50);
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
            const cy = 60 - row * 280;

            const card = new Node(`Card_${i}`); card.setParent(p);
            card.setPosition(new Vec3(cx, cy, 0));
            card.addComponent(UITransform).setContentSize(260, 260);

            const idx = i;
            const def = CHARS[idx];
            const charId = def?.id;

            // 用同一套深色卡框收束来源不同的角色立绘，并用角色主题色做细边。
            // 立绘本身仍保持透明，不会出现六张图各自带一块方形背景的拼贴感。
            // 框从180缩到140并上移，给卡身下方腾出被动+Q/E/R技能介绍区。
            const frameN = new Node('PortraitFrame'); frameN.setParent(card);
            frameN.setPosition(new Vec3(0, 70, 0));
            frameN.addComponent(UITransform).setContentSize(140, 140);
            const frameG = frameN.addComponent(Graphics);
            frameG.fillColor = new Color(9, 15, 24, 245);
            frameG.fillRect(-70, -70, 140, 140);
            frameG.strokeColor = colors[i] ?? new Color(80, 140, 180, 255);
            frameG.lineWidth = 3;
            frameG.rect(-70, -70, 140, 140); frameG.stroke();

            if (charId) this._loadPortrait(card, `char_${charId}`, 130, 70);

            const locked = !!def && !def.unlocked;
            const nameBtn = this._mkBtn(card, names[i] ?? `Char${i}`,
                0, -16, 250, 44,
                locked ? new Color(50, 50, 60, 255) : (colors[i] ?? new Color(80, 80, 120, 255)));

            if (locked) {
                // Dim the whole card and show a lock badge + unlock hint instead
                // of wiring the select callback — clicking a locked card does nothing.
                const dim = new Node('LockDim'); dim.setParent(card);
                dim.setSiblingIndex(1); // above portrait, below nameplate/label nodes added after it
                dim.addComponent(UITransform).setContentSize(260, 260);
                const dimG = dim.addComponent(Graphics);
                dimG.fillColor = new Color(0, 0, 0, 165);
                dimG.fillRect(-130, -130, 260, 260);

                const lockN = new Node('LockIcon'); lockN.setParent(card);
                lockN.setPosition(new Vec3(0, 50, 0));
                lockN.addComponent(UITransform).setContentSize(160, 160);
                const lockLbl = lockN.addComponent(Label);
                lockLbl.string = '🔒'; lockLbl.fontSize = 48;
                lockLbl.color = new Color(220, 220, 220, 255);
                styleLabel(lockLbl);

                const hintN = new Node('LockHint'); hintN.setParent(card);
                hintN.setPosition(new Vec3(0, -140, 0));
                hintN.addComponent(UITransform).setContentSize(260, 40);
                const hintLbl = hintN.addComponent(Label);
                hintLbl.string = def?.unlockHint ?? '未解锁';
                hintLbl.fontSize = 12;
                hintLbl.color = new Color(200, 160, 90, 230);
                hintLbl.overflow = Label.Overflow.RESIZE_HEIGHT;
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
                skN.setPosition(new Vec3(0, -86, 0));
                skN.addComponent(UITransform).setContentSize(252, 92);
                const skLbl = skN.addComponent(Label);
                skLbl.string = def
                    ? `被动 ${def.desc}\nQ ${def.skills.q}\nE ${def.skills.e}\nR ${def.skills.r}`
                    : '';
                skLbl.fontSize = 10;
                skLbl.lineHeight = 14;
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

    /**
     * 透明可点击热区：不画任何图形，只挂 UITransform 撑出点击范围，用于
     * 对接美术图里已经画好的按钮（比如 title_screen.png 里烧录的 "START GAME"），
     * 避免代码再叠一层视觉不一致的 Graphics 按钮。
     */
    private _mkHotspot(parent: Node, x: number, y: number, w: number, h: number): Node {
        const n = new Node('Hotspot'); n.setParent(parent);
        n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(w, h);
        return n;
    }

    private _mkDisabledArtButton(parent: Node, x: number, y: number, w: number, h: number): Node {
        const n = new Node('DisabledArtButton'); n.setParent(parent);
        n.setPosition(new Vec3(x, y, 0));
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(5, 10, 18, 155);
        g.fillRect(-w / 2, -h / 2, w, h);
        g.strokeColor = new Color(80, 130, 145, 150);
        g.lineWidth = 1; g.rect(-w / 2, -h / 2, w, h); g.stroke();
        const ln = new Node('Status'); ln.setParent(n);
        ln.addComponent(UITransform).setContentSize(w, h);
        const label = ln.addComponent(Label);
        label.string = '即将开放';
        label.fontSize = 13;
        label.color = new Color(145, 175, 185, 235);
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        styleLabel(label);
        return n;
    }

    private _mkBtn(parent: Node, text: string,
                   x: number, y: number, w: number, h: number,
                   fillCol: Color): Node {
        const btn = new Node(`Btn_${text}`); btn.setParent(parent);
        btn.setPosition(new Vec3(x, y, 0));
        btn.addComponent(UITransform).setContentSize(w, h);
        const g = btn.addComponent(Graphics);
        g.fillColor = fillCol;
        g.fillRect(-w/2, -h/2, w, h);
        g.strokeColor = new Color(
            Math.min(255, fillCol.r + 60), Math.min(255, fillCol.g + 60),
            Math.min(255, fillCol.b + 60), 200);
        g.lineWidth = 1.5; g.rect(-w/2, -h/2, w, h); g.stroke();

        const ln = new Node('L'); ln.setParent(btn);
        ln.addComponent(UITransform).setContentSize(w - 16, h);
        const lbl = ln.addComponent(Label);
        lbl.string = text; lbl.fontSize = Math.round(h * 0.36);
        lbl.color = new Color(230, 230, 230, 255);
        lbl.horizontalAlign = HorizontalTextAlignment.CENTER;
        lbl.verticalAlign = VerticalTextAlignment.CENTER;
        lbl.overflow = Label.Overflow.SHRINK;
        lbl.enableWrapText = true;
        styleLabel(lbl);
        return btn;
    }
}
