import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform, HorizontalTextAlignment, VerticalTextAlignment
} from 'cc';
import { CharDef } from '../data/CharacterDB';
import { CHARS, splitSkillText, SKILL_Q_CD, SKILL_E_CD } from '../data/CharacterDB';
import { applyArtSprite, loadArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';
import { applyHexButtonSkin } from '../core/UIStyle';
import { visibleDesignWidth } from '../core/ScreenFit';
import { MetaPageName, MetaPageUI } from './MetaPageUI';

const { ccclass } = _decorator;

export type ScreenName =
    | 'menu' | 'charSelect' | 'charDetail' | 'playing'
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
        // 英雄介绍弹窗在选人页之后构建，保证层级在选人卡之上（点击遮罩不穿透）
        this._buildCharDetailPanel();
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
        // 底板与立绘都按可见宽度铺满（全面屏横屏>1280时无左右黑边）。
        const bg = p.addComponent(Graphics);
        bg.fillColor = new Color(12, 8, 22, 255);
        bg.fillRect(-1600, -360, 3200, 720);

        const bgArtNode = new Node('BgArt'); bgArtNode.setParent(p);
        const menuW = Math.max(1280, visibleDesignWidth());
        bgArtNode.addComponent(UITransform).setContentSize(menuW, 720);
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
        bg.fillRect(-1600, -360, 3200, 720);

        const tn = new Node('T'); tn.setParent(p);
        tn.setPosition(new Vec3(0, 280, 0));
        tn.addComponent(UITransform).setContentSize(500, 44);
        const tl = tn.addComponent(Label);
        tl.string = '— 选择角色 —';
        tl.fontSize = 28; tl.color = new Color(255, 215, 90, 255);
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
            cardG.fillColor = new Color(8, 14, 24, 226);
            cardG.fillRect(-180, -140, 360, 280);
            // 整张角色卡才是实际点击单位，因此身份色选框必须包住完整的
            // “立绘—名牌—定位”信息组。只框头像会误导为头像裁切框或选中态。
            cardG.strokeColor = new Color(cardCol.r, cardCol.g, cardCol.b, locked ? 72 : 188);
            cardG.lineWidth = locked ? 1 : 2;
            cardG.rect(-180, -140, 360, 280); cardG.stroke();
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
            nameN.addComponent(UITransform).setContentSize(320, 26);
            const nameLbl = nameN.addComponent(Label);
            nameLbl.string = names[i] ?? `Char${i}`;
            nameLbl.fontSize = 20;
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
                dimG.fillColor = new Color(0, 0, 0, 205);
                dimG.fillRect(-180, -140, 360, 280);

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
                hintLbl.fontSize = 14;
                hintLbl.color = new Color(200, 160, 90, 230);
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
        const p = this._mkPanel('charDetail', 1280, 720);

        const dim = p.addComponent(Graphics);
        dim.fillColor = new Color(4, 6, 12, 170);
        dim.fillRect(-640, -360, 1280, 720);
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
            hd.addComponent(UITransform).setContentSize(RW, 26);
            const hl = hd.addComponent(Label);
            hl.fontSize = 19;
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
