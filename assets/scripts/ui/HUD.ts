import {
    _decorator, Component, Node, Label, Graphics, Sprite, SpriteFrame,
    Color, Vec3, UITransform, Mask, Rect, Size, Vec2
} from 'cc';
import { AugDef } from '../data/AugmentDB';
import { applyArtSprite, loadArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';
import { visibleDesignWidth } from '../core/ScreenFit';
import { attachEnableRedraw, combatOutline, drawCombatFrame, drawCombatSkill, UI_PALETTE } from '../core/UIStyle';

const { ccclass } = _decorator;

/** 每帧快照：HUD 只接收真实字段，不持有玩法对象。 */
export interface HudData {
    hp: number;
    maxHp: number;
    shield: number;
    maxShield: number;
    gold: number;
    wave: number;
    chapter: number;
    heroId?: string;
    heroName?: string;
    testRoom?: boolean;
    augments: AugDef[];
    skills: { name: string; desc: string; icon: string; cd: number; maxCd: number }[];
    initialPassive?: { name: string; desc: string };
    bossHp?: number;
    bossMaxHp?: number;
    bossName?: string;
    difficultyName?: string;
}

@ccclass('HUD')
export class HUD extends Component {
    private _vitals!: Node;
    private _portrait!: Sprite;
    private _portraitId = '';
    private _portraitFrame?: SpriteFrame;
    private _heroLabel!: Label;
    private _hpBarFg!: Graphics;
    private _shieldBarFg!: Graphics;
    private _hpLabel!: Label;
    private _shieldLabel!: Label;
    private _goldRoot!: Node;
    private _goldLabel!: Label;
    private _waveLabel!: Label;
    private _difficultyLabel!: Label;
    private _bossBarRoot!: Node;
    private _bossBarFg!: Graphics;
    private _bossLabel!: Label;
    private _bossHpLabel!: Label;
    private _skillRings: { g: Graphics; icon: Sprite; cd: Label }[] = [];
    private _skillRingNodes: Node[] = [];
    private _moveHintRoot!: Node;
    private _testRoomMode = false;
    private readonly BAR_W = 220;
    private readonly BAR_H = 18;
    private readonly SHIELD_W = 100;
    private readonly SHIELD_H = 8;
    private readonly BOSS_W = 414;
    private readonly BOSS_H = 12;
    private readonly SKILL_R = 32;

    onLoad() {
        this._buildHpBar(); this._buildGoldDisplay(); this._buildWaveDisplay();
        this._buildBossBar(); this._buildSkillRings(); this._buildMoveHint(); this.fitToVisible();
    }

    onDestroy() { this._portraitFrame?.destroy(); }

    /** A 图头像只在左上、右下切角，不能变成八边形徽章。 */
    private _portraitOutline(g: Graphics, x: number, y: number, w: number, h: number) {
        g.moveTo(x, y); g.lineTo(x + w - 19, y); g.lineTo(x + w, y + 19);
        g.lineTo(x + w, y + h); g.lineTo(x + 19, y + h);
        g.lineTo(x, y + h - 19); g.close();
    }

    /** 能量槽左侧圆整，右侧为向上收口的单个斜尾。 */
    private _vitalOutline(g: Graphics, x: number, y: number, w: number, h: number) {
        const tail = Math.min(h * 0.65, w / 2), round = Math.min(3, w / 2);
        g.moveTo(x + round, y); g.lineTo(x + w - tail, y); g.lineTo(x + w, y + tail);
        g.lineTo(x + w, y + h); g.lineTo(x + round, y + h);
        g.quadraticCurveTo(x, y + h, x, y + h - round);
        g.lineTo(x, y + round); g.quadraticCurveTo(x, y, x + round, y); g.close();
    }

    private _vitalTrack(g: Graphics, x: number, y: number, w: number, h: number) {
        g.fillColor = new Color(4, 12, 21, 255); this._vitalOutline(g, x - 2, y - 2, w + 4, h + 4); g.fill();
        g.fillColor = new Color(79, 123, 146, 255); this._vitalOutline(g, x, y, w, h); g.fill();
        g.fillColor = new Color(9, 20, 29, 255); this._vitalOutline(g, x + 1, y + 1, w - 2, h - 2); g.fill();
    }

    private _buildHpBar() {
        this._vitals = this._mkNode('VitalsPanel', -626, 274);
        const g = this._vitals.addComponent(Graphics);
        const draw = () => {
            g.clear();
            // A 图姓名背衬与能量槽连接到头像，保留开放的右侧轮廓。
            g.fillColor = new Color(12, 25, 37, 205);
            g.moveTo(74, 74); g.lineTo(146, 74); g.lineTo(160, 61);
            g.lineTo(298, 61); g.lineTo(318, 43); g.lineTo(302, 20);
            g.lineTo(212, 20); g.lineTo(203, 4); g.lineTo(74, 4); g.close(); g.fill();
            this._vitalTrack(g, 92, 22, this.BAR_W + 6, this.BAR_H + 6);
            this._vitalTrack(g, 111, 4, this.SHIELD_W + 6, this.SHIELD_H + 6);
            // 护盾徽记使用几何图形，避免 emoji 随平台改变轮廓。
            g.fillColor = new Color(64, 189, 246, 255);
            g.moveTo(95, 16); g.lineTo(102, 13); g.lineTo(101, 7);
            g.lineTo(95, 2); g.lineTo(89, 7); g.lineTo(88, 13); g.close(); g.fill();
            g.strokeColor = new Color(163, 226, 255, 255); g.lineWidth = 1; g.stroke();
            g.fillColor = new Color(179, 237, 255, 255); g.fillRect(92, 8, 2, 5);
            g.fillColor = new Color(9, 25, 38, 255); this._portraitOutline(g, 0, 0, 82, 74); g.fill();
        };
        draw(); attachEnableRedraw(this._vitals, draw);

        // 现有立绘只裁切展示头肩，不改 PNG；异步切换只接受最新英雄。
        const mount = this._mkChild(this._vitals, 'PortraitMask', 41, 37);
        mount.addComponent(UITransform).setContentSize(78, 70);
        const mask = mount.addComponent(Mask); mask.type = Mask.Type.GRAPHICS_STENCIL;
        const mg = mount.getComponent(Graphics)!;
        const drawMask = () => { mg.clear(); this._portraitOutline(mg, -39, -35, 78, 70); mg.fill(); };
        drawMask(); attachEnableRedraw(mount, drawMask);
        const art = this._mkChild(mount, 'Portrait', 0, 0);
        art.addComponent(UITransform).setContentSize(78, 78);
        this._portrait = art.addComponent(Sprite); this._portrait.sizeMode = Sprite.SizeMode.CUSTOM;
        this._portrait.trim = false;
        const edge = this._mkChild(this._vitals, 'PortraitArmor', 0, 0);
        const eg = edge.addComponent(Graphics);
        const drawEdge = () => {
            eg.clear(); eg.strokeColor = new Color(75, 188, 221, 255); eg.lineWidth = 2;
            this._portraitOutline(eg, 0, 0, 82, 74); eg.stroke();
            eg.strokeColor = new Color(143, 216, 237, 255); eg.lineWidth = 1;
            eg.moveTo(4, 10); eg.lineTo(4, 52); eg.lineTo(23, 70); eg.lineTo(76, 70); eg.stroke();
        };
        drawEdge(); attachEnableRedraw(edge, drawEdge);
        this._heroLabel = this._label(this._vitals, 'HeroName', 198, 58, 206, 25, 18);
        this._heroLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._hpBarFg = this._mkChild(this._vitals, 'HpFg', 95, 25).addComponent(Graphics);
        this._shieldBarFg = this._mkChild(this._vitals, 'ShieldFg', 114, 7).addComponent(Graphics);
        this._hpLabel = this._label(this._vitals, 'HpLbl', 201, 34, 208, 22, 16);
        this._shieldLabel = this._label(this._vitals, 'ShieldLbl', 251, 11, 66, 16, 11);
        this._shieldLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._shieldLabel.color = new Color(172, 217, 239, 255);
    }

    private _buildGoldDisplay() {
        this._goldRoot = this._mkNode('GoldPlate', 416, 332);
        const g = this._goldRoot.addComponent(Graphics);
        const draw = () => {
            g.clear(); g.fillColor = new Color(10, 23, 34, 210);
            g.roundRect(-2, -15, 138, 30, 7); g.fill();
            const hex = (r: number) => {
                g.moveTo(14, r); g.lineTo(14 + r * 0.86, r * 0.5);
                g.lineTo(14 + r * 0.86, -r * 0.5); g.lineTo(14, -r);
                g.lineTo(14 - r * 0.86, -r * 0.5); g.lineTo(14 - r * 0.86, r * 0.5); g.close();
            };
            g.fillColor = new Color(240, 162, 26, 255); hex(11); g.fill();
            g.strokeColor = new Color(255, 235, 153, 255); g.lineWidth = 1.5; hex(11); g.stroke();
            g.fillColor = new Color(255, 198, 50, 255); hex(7.5); g.fill();
            g.strokeColor = new Color(255, 239, 153, 255); g.lineWidth = 1; hex(7.5); g.stroke();
        };
        draw(); attachEnableRedraw(this._goldRoot, draw);
        this._label(this._goldRoot, 'GoldTitle', 51, 0, 32, 24, 14).string = '金币';
        this._goldLabel = this._label(this._goldRoot, 'GoldLbl', 105, 0, 58, 24, 17);
        this._goldLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._goldLabel.overflow = Label.Overflow.SHRINK;
    }

    private _buildWaveDisplay() {
        const plate = this._mkNode('WavePlate', 0, 360), g = plate.addComponent(Graphics);
        const draw = () => {
            g.clear(); g.fillColor = new Color(105, 158, 181, 255);
            g.moveTo(-170, 0); g.lineTo(170, 0); g.lineTo(146, -27);
            g.lineTo(87, -27); g.lineTo(77, -38); g.lineTo(-77, -38);
            g.lineTo(-87, -27); g.lineTo(-146, -27); g.close(); g.fill();
            g.fillColor = new Color(12, 27, 40, 244);
            g.moveTo(-168, 0); g.lineTo(168, 0); g.lineTo(145, -25.5);
            g.lineTo(86, -25.5); g.lineTo(76, -36.5); g.lineTo(-76, -36.5);
            g.lineTo(-86, -25.5); g.lineTo(-145, -25.5); g.close(); g.fill();
        };
        draw(); attachEnableRedraw(plate, draw);
        this._waveLabel = this._label(plate, 'WaveLbl', 0, -21, 240, 26, 19);
        this._difficultyLabel = this._label(plate, 'DifficultyLbl', 0, -48, 260, 16, 11);
        this._difficultyLabel.color = UI_PALETTE.muted;
    }

    private _buildBossBar() {
        this._bossBarRoot = this._mkNode('BossRoot', -this.BOSS_W / 2, 267);
        const bg = this._mkChild(this._bossBarRoot, 'BossArmor', 0, 0), g = bg.addComponent(Graphics);
        const draw = () => { g.clear(); drawCombatFrame(g, -7, -4, this.BOSS_W + 14, this.BOSS_H + 8, 9); };
        draw(); attachEnableRedraw(bg, draw);
        this._bossBarFg = this._mkChild(this._bossBarRoot, 'BossFg', 0, 0).addComponent(Graphics);
        this._bossLabel = this._label(this._bossBarRoot, 'BossLbl', this.BOSS_W / 2, 26, this.BOSS_W, 24, 16);
        this._bossHpLabel = this._label(this._bossBarRoot, 'BossHpLbl', this.BOSS_W / 2, 6, this.BOSS_W - 24, 14, 10);
        this._bossBarRoot.active = false;
    }

    private _buildSkillRings() {
        for (let i = 0; i < 3; i++) {
            const n = this._mkNode(`Skill${i}`, 0, 0);
            n.addComponent(UITransform).setContentSize(90, 112);
            const g = n.addComponent(Graphics), iconN = this._mkChild(n, 'Icon', 0, 0);
            iconN.addComponent(UITransform).setContentSize(46, 46);
            const icon = iconN.addComponent(Sprite); icon.sizeMode = Sprite.SizeMode.CUSTOM;
            const cd = this._label(n, 'Cooldown', 0, 0, 62, 32, 23);
            this._label(n, 'Key', 0, -this.SKILL_R * 1.34 - 7, 32, 23, 18).string = ['Q', 'E', 'R'][i];
            this._skillRings.push({ g, icon, cd }); this._skillRingNodes.push(n);
        }
    }

    /** 触控端用同造型的真实技能按钮替代 PC 展示节点。 */
    setSkillRingsVisible(v: boolean): void {
        for (const n of this._skillRingNodes) n.active = v;
        this._moveHintRoot.active = v;
    }
    setTestRoomMode(on: boolean): void { this._testRoomMode = on; this.fitToVisible(); }

    /** 贴物理屏缘；测试房为底部工具条留出空间。 */
    fitToVisible(): void {
        const right = visibleDesignWidth() / 2;
        this._vitals?.setPosition(new Vec3(-right + 14, 274, 0));
        this._goldRoot?.setPosition(new Vec3(right - 206, 332, 0));
        this._moveHintRoot?.setPosition(new Vec3(-right + 88, this._testRoomMode ? -176 : -288, 0));
        for (let i = 0; i < this._skillRingNodes.length; i++) {
            this._skillRingNodes[i].setPosition(new Vec3(right - 278 + i * 105, this._testRoomMode ? -155 : -267, 0));
        }
    }

    /** A 图左下 WASD 只是键位提示，不替换现有键盘输入。触控端仍用摇杆。 */
    private _buildMoveHint(): void {
        this._moveHintRoot = this._mkNode('MoveHint', -552, -288);
        for (const [key, x, y] of [['W', 0, 40], ['A', -40, 0], ['S', 0, 0], ['D', 40, 0]] as [string, number, number][]) {
            const n = this._mkChild(this._moveHintRoot, `Move_${key}`, x, y), g = n.addComponent(Graphics);
            const draw = () => {
                g.clear(); g.fillColor = new Color(5, 14, 23, 220);
                g.roundRect(-18, -18, 36, 36, 5); g.fill();
                g.fillColor = new Color(149, 189, 205, 255);
                g.roundRect(-16, -16, 32, 32, 4); g.fill();
                g.fillColor = new Color(19, 41, 55, 220);
                g.roundRect(-14.5, -14.5, 29, 29, 3); g.fill();
            };
            draw(); attachEnableRedraw(n, draw);
            this._label(n, 'Key', 0, 0, 28, 24, 18).string = key;
        }
    }

    refresh(d: HudData) {
        this._refreshPortrait(d.heroId);
        this._heroLabel.string = (d.heroName || d.initialPassive?.name || '').split('·').pop()!;
        this._refreshHp(d);
        this._goldLabel.string = Math.floor(d.gold).toLocaleString();
        this._waveLabel.string = d.testRoom ? '战斗测试房' : `第${d.chapter + 1}章 · 第${d.wave}波`;
        this._difficultyLabel.string = d.testRoom ? '' : `${d.wave}/15${d.difficultyName ? ' · ' + d.difficultyName : ''}`;
        this._refreshBoss(d); this._refreshSkills(d.skills);
    }

    private _refreshPortrait(id?: string): void {
        if (!id || id === this._portraitId) return;
        this._portraitId = id; this._portrait.spriteFrame = null;
        this._portraitFrame?.destroy(); this._portraitFrame = undefined;
        const dedicatedPortrait = id === 'via' || id === 'mortis';
        loadArtSprite(dedicatedPortrait ? `ui_portrait_${id}` : `char_${id}`, source => {
            if (!source || !this._portrait.isValid || this._portraitId !== id) return;
            // 新英雄使用独立近景头像，保留完整头发与骨冠，不再二次裁切。
            if (dedicatedPortrait) { this._portrait.spriteFrame = source; return; }
            source.packable = false;
            const rect = source.rect, side = Math.min(rect.width * 0.6, rect.height * 0.68);
            const frame = new SpriteFrame(); frame.texture = source.texture;
            frame.rect = new Rect(rect.x + (rect.width - side) / 2, rect.y, side, side);
            frame.originalSize = new Size(side, side); frame.offset = new Vec2(0, 0); frame.packable = false;
            this._portraitFrame = frame; this._portrait.spriteFrame = frame;
        });
    }

    private _refreshHp(d: HudData) {
        const hR = Math.max(0, Math.min(1, d.hp / Math.max(1, d.maxHp)));
        const sR = d.maxShield > 0 ? Math.max(0, Math.min(1, d.shield / d.maxShield)) : 0;
        const fg = this._hpBarFg; fg.clear();
        if (hR > 0) {
            fg.fillColor = hR > 0.4 ? new Color(24, 226, 190, 255)
                : hR > 0.2 ? new Color(248, 190, 67, 255) : new Color(249, 82, 66, 255);
            this._vitalOutline(fg, 0, 0, this.BAR_W * hR, this.BAR_H); fg.fill();
            fg.fillColor = new Color(153, 255, 230, 100);
            fg.fillRect(5, this.BAR_H - 2, Math.max(0, this.BAR_W * hR - 11), 1);
        }
        const sf = this._shieldBarFg; sf.clear();
        if (sR > 0) {
            sf.fillColor = new Color(61, 188, 247, 255);
            this._vitalOutline(sf, 0, 0, this.SHIELD_W * sR, this.SHIELD_H); sf.fill();
        }
        this._hpLabel.string = `${Math.max(0, Math.ceil(d.hp))} / ${Math.round(d.maxHp)}`;
        this._shieldLabel.string = d.maxShield > 0 ? `${Math.max(0, Math.ceil(d.shield))}/${Math.round(d.maxShield)}` : '—';
    }

    private _refreshBoss(d: HudData) {
        const has = d.bossHp !== undefined && d.bossHp > 0 && (d.bossMaxHp ?? 0) > 0;
        this._bossBarRoot.active = has;
        if (!has) return;
        const r = Math.max(0, Math.min(1, d.bossHp! / d.bossMaxHp!)), g = this._bossBarFg;
        g.clear(); g.fillColor = new Color(249, 65, 59, 255);
        combatOutline(g, 0, 0, this.BOSS_W * r, this.BOSS_H, Math.min(4, this.BOSS_W * r / 2)); g.fill();
        g.fillColor = new Color(255, 141, 122, 190); g.fillRect(5, this.BOSS_H - 2, Math.max(0, this.BOSS_W * r - 10), 1);
        this._bossLabel.string = d.bossName ?? '未知首领';
        this._bossHpLabel.string = `${Math.ceil(d.bossHp!)} / ${Math.round(d.bossMaxHp!)}`;
    }

    private _refreshSkills(skills: HudData['skills']) {
        for (let i = 0; i < this._skillRings.length; i++) {
            const { g, icon, cd } = this._skillRings[i], sk = skills[i];
            if (!sk) { g.clear(); cd.string = ''; icon.spriteFrame = null; continue; }
            const ratio = sk.maxCd > 0 ? Math.max(0, Math.min(1, 1 - sk.cd / sk.maxCd)) : 1;
            drawCombatSkill(g, this.SKILL_R, ratio); applyArtSprite(icon, `ui_icon_${sk.icon}`);
            icon.color = ratio >= 1 ? Color.WHITE : new Color(120, 153, 170, 170);
            cd.string = ratio >= 1 ? '' : i === 2 ? `${Math.round(ratio * 100)}%` : `${Math.max(1, Math.ceil(sk.cd))}`;
        }
    }

    private _label(parent: Node, name: string, x: number, y: number, w: number, h: number, size: number): Label {
        const n = this._mkChild(parent, name, x, y); n.addComponent(UITransform).setContentSize(w, h);
        const label = n.addComponent(Label); label.fontSize = size; label.lineHeight = size + 3;
        label.color = UI_PALETTE.text; label.overflow = Label.Overflow.CLAMP;
        styleLabel(label, { outline: true }); return label;
    }
    private _mkChild(parent: Node, name: string, x: number, y: number): Node {
        const n = new Node(name); n.setParent(parent); n.setPosition(new Vec3(x, y, 0)); return n;
    }
    private _mkNode(name: string, x: number, y: number): Node { return this._mkChild(this.node, name, x, y); }
}
