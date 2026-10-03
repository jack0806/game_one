import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform
} from 'cc';
import { AugDef } from '../data/AugmentDB';
import { applyArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';
import { attachEnableRedraw, UI_PALETTE } from '../core/UIStyle';

const { ccclass } = _decorator;

/** State snapshot passed into HUD.refresh() each frame. */
export interface HudData {
    hp: number;
    maxHp: number;
    shield: number;
    maxShield: number;
    gold: number;
    wave: number;
    chapter: number;
    augments: AugDef[];
    skills: { name: string; desc: string; icon: string; cd: number; maxCd: number }[];
    initialPassive?: { name: string; desc: string };
    bossHp?: number;
    bossMaxHp?: number;
    bossName?: string;
    /** 本局难度名（测试房间缺省 = 不显示）。 */
    difficultyName?: string;
    /** v4：无尽模式标志（波次显示改为"第N轮 X/15"）。 */
    endless?: boolean;
}

@ccclass('HUD')
export class HUD extends Component {
    // ── private refs ──────────────────────────────────────────
    private _hpBarFg!:     Graphics;
    private _shieldBarFg!: Graphics;
    private _hpLabel!:     Label;
    private _shieldLabel!: Label;
    private _goldLabel!:   Label;
    private _waveLabel!:   Label;
    private _bossBarRoot!: Node;
    private _bossBarFg!: Graphics;
    private _bossLabel!:  Label;
    private _skillRings:  { g: Graphics; label: Label; icon: Sprite; desc: Label }[] = [];
    private _skillRingNodes: Node[] = [];
    private _testRoomMode = false;

    private readonly BAR_W   = 240;
    private readonly BAR_H   = 8;
    private readonly SHIELD_H = 4;
    private readonly BOSS_W  = 460;
    private readonly BOSS_H  = 10;
    private readonly SKILL_R = 28;

    onLoad() {
        this._buildHpBar();
        this._buildGoldDisplay();
        this._buildWaveDisplay();
        this._buildBossBar();
        this._buildSkillRings();
        this._layoutSkillRings();
    }

    // ── builders ──────────────────────────────────────────────

    /** 哑光装甲底座只承托读数；颜色集中在细能量槽，避免满屏彩框。 */
    private _plate(node: Node, x: number, y: number, w: number, h: number): Graphics {
        const g = node.addComponent(Graphics);
        const draw = () => {
            g.clear();
            g.fillColor = new Color(8, 17, 25, 244);
            g.roundRect(x, y - 3, w, h, 8); g.fill();
            g.fillColor = new Color(27, 42, 54, 250);
            g.roundRect(x, y, w, h, 8); g.fill();
            g.strokeColor = new Color(109, 134, 148, 180); g.lineWidth = 1;
            g.roundRect(x, y, w, h, 8); g.stroke();
        };
        draw(); attachEnableRedraw(node, draw);
        return g;
    }

    private _buildHpBar() {
        const panel = this._mkNode('VitalsPanel', -516, 278);
        this._plate(panel, -8, 0, this.BAR_W + 32, 74);
        const tracks = this._mkNode('VitalTracks', -508, 290);
        const g = tracks.addComponent(Graphics);
        const draw = () => {
            g.clear(); g.fillColor = new Color(10, 23, 32, 255);
            g.fillRect(0, 26, this.BAR_W, this.BAR_H);
            g.fillRect(0, 0, this.BAR_W, this.SHIELD_H);
        };
        draw(); attachEnableRedraw(tracks, draw);
        this._hpBarFg = this._mkNode('HpFg', -508, 316).addComponent(Graphics);
        this._shieldBarFg = this._mkNode('ShieldFg', -508, 290).addComponent(Graphics);
        const ln = this._mkNode('HpLbl', -388, 337);
        ln.addComponent(UITransform).setContentSize(this.BAR_W, 22);
        this._hpLabel = ln.addComponent(Label);
        this._hpLabel.fontSize = 16; this._hpLabel.lineHeight = 22;
        this._hpLabel.color = UI_PALETTE.text;
        styleLabel(this._hpLabel, { outline: false });
        const sn = this._mkNode('ShieldLbl', -388, 305);
        sn.addComponent(UITransform).setContentSize(this.BAR_W, 18);
        this._shieldLabel = sn.addComponent(Label);
        this._shieldLabel.fontSize = 13; this._shieldLabel.lineHeight = 18;
        this._shieldLabel.color = new Color(157, 191, 211, 255);
        styleLabel(this._shieldLabel, { outline: false, bold: false });
    }

    private _buildGoldDisplay() {
        const plate = this._mkNode('GoldPlate', 438, 331);
        this._plate(plate, -83, -21, 166, 42);
        const n = this._mkNode('GoldLbl', 438, 331);
        n.addComponent(UITransform).setContentSize(154, 30);
        this._goldLabel = n.addComponent(Label);
        this._goldLabel.fontSize = 19; this._goldLabel.lineHeight = 26;
        this._goldLabel.overflow = Label.Overflow.SHRINK;
        this._goldLabel.color = new Color(255, 216, 141, 255);
        styleLabel(this._goldLabel, { outline: false });
    }

    private _buildWaveDisplay() {
        const plate = this._mkNode('WavePlate', 0, 331);
        this._plate(plate, -157, -21, 314, 42);
        const n = this._mkNode('WaveLbl', 0, 331);
        n.addComponent(UITransform).setContentSize(294, 28);
        this._waveLabel = n.addComponent(Label);
        this._waveLabel.fontSize = 17; this._waveLabel.lineHeight = 24;
        this._waveLabel.color = UI_PALETTE.text;
        styleLabel(this._waveLabel, { outline: false });
    }

    private _buildBossBar() {
        this._bossBarRoot = this._mkNode('BossRoot', -this.BOSS_W / 2, 238);
        const bg = new Node('BossBg'); bg.setParent(this._bossBarRoot);
        this._plate(bg, -14, 0, this.BOSS_W + 28, 60);
        const track = new Node('BossTrack'); track.setParent(this._bossBarRoot);
        const g = track.addComponent(Graphics);
        const draw = () => {
            g.clear(); g.fillColor = new Color(10, 23, 32, 255);
            g.fillRect(0, 12, this.BOSS_W, this.BOSS_H);
        };
        draw(); attachEnableRedraw(track, draw);
        const fgN = new Node('BossFg'); fgN.setParent(this._bossBarRoot); fgN.setPosition(0, 12);
        this._bossBarFg = fgN.addComponent(Graphics);
        const ln = new Node('BossLbl'); ln.setParent(this._bossBarRoot);
        ln.setPosition(this.BOSS_W / 2, 41);
        ln.addComponent(UITransform).setContentSize(this.BOSS_W, 26);
        this._bossLabel = ln.addComponent(Label);
        this._bossLabel.fontSize = 16; this._bossLabel.lineHeight = 22;
        this._bossLabel.overflow = Label.Overflow.SHRINK;
        this._bossLabel.color = new Color(242, 211, 167, 255);
        styleLabel(this._bossLabel, { outline: false });
        this._bossBarRoot.active = false;
    }

    private _buildSkillRings() {
        const keys = ['Q', 'E', 'R'];
        for (let i = 0; i < 3; i++) {
            const n = this._mkNode(`Skill${i}`, 440 + i * 70, -310);
            n.addComponent(UITransform).setContentSize(this.SKILL_R * 2, this.SKILL_R * 2);
            const g = n.addComponent(Graphics);

            // 技能图标Sprite：环内中心显示技能主题图标，key 取自 CharDef.skillIcons。
            const iconN = new Node('Icon'); iconN.setParent(n);
            iconN.addComponent(UITransform).setContentSize(this.SKILL_R * 1.3, this.SKILL_R * 1.3);
            const iconSp = iconN.addComponent(Sprite);
            iconSp.sizeMode = Sprite.SizeMode.CUSTOM;

            const ln = new Node('Key'); ln.setParent(n);
            ln.setPosition(new Vec3(0, -this.SKILL_R - 14, 0));
            ln.addComponent(UITransform).setContentSize(40, 40);
            const lbl = ln.addComponent(Label);
            lbl.string = keys[i];
            lbl.fontSize = 16;
            lbl.lineHeight = 20;
            lbl.color = new Color(200, 200, 200, 255);
            styleLabel(lbl);

            const descN = new Node('Desc'); descN.setParent(n);
            descN.setPosition(new Vec3(0, this.SKILL_R + 20, 0));
            descN.addComponent(UITransform).setContentSize(66, 20);
            const desc = descN.addComponent(Label);
            desc.fontSize = 14;
            desc.lineHeight = 18;
            desc.color = new Color(200, 220, 240, 220);
            desc.overflow = Label.Overflow.RESIZE_HEIGHT;
            styleLabel(desc);

            this._skillRings.push({ g, label: lbl, icon: iconSp, desc });
            this._skillRingNodes.push(n);
        }
    }

    /**
     * 触屏端右下技能环与 TouchControls 的技能按钮位置重叠，
     * 由 GameManager 在启动时按设备隐藏（PC 端保持显示）。
     */
    setSkillRingsVisible(v: boolean): void {
        for (const n of this._skillRingNodes) n.active = v;
    }

    /** 测试房底部有两行单位工具条，PC端HUD技能环改成右侧上扬弧线，避免遮挡分页。 */
    setTestRoomMode(on: boolean): void {
        this._testRoomMode = on;
        this._layoutSkillRings();
    }

    private _layoutSkillRings(): void {
        for (let i = 0; i < this._skillRingNodes.length; i++) {
            const y = this._testRoomMode ? (-170 + i * 38) : -280;
            this._skillRingNodes[i].setPosition(new Vec3(440 + i * 70, y, 0));
        }
    }

    // ── refresh (called every frame by GameManager) ────────────

    refresh(d: HudData) {
        this._refreshHp(d);
        this._refreshGold(d.gold);
        this._refreshWave(d);
        this._refreshBoss(d);
        this._refreshSkills(d.skills);
    }

    private _refreshHp(d: HudData) {
        const hR = Math.max(0, Math.min(1, d.hp / Math.max(1, d.maxHp)));
        const sR = d.maxShield > 0 ? Math.max(0, Math.min(1, d.shield / d.maxShield)) : 0;

        const fg = this._hpBarFg;
        fg.clear();
        fg.fillColor = hR > 0.4 ? new Color(104, 190, 158, 255) : hR > 0.2 ? new Color(222, 177, 92, 255) : new Color(220, 108, 88, 255);
        fg.fillRect(0, 0, this.BAR_W * hR, this.BAR_H);

        const sf = this._shieldBarFg;
        sf.clear();
        if (sR > 0) {
            sf.fillColor = new Color(80, 170, 255, 235);
            sf.fillRect(0, 0, this.BAR_W * sR, this.SHIELD_H);
        }
        this._hpLabel.string = `生命  ${Math.ceil(d.hp)} / ${Math.round(d.maxHp)}`;
        this._shieldLabel.string = d.maxShield > 0
            ? `护盾  ${Math.ceil(d.shield)} / ${Math.round(d.maxShield)}`
            : '护盾  —';
    }

    private _refreshGold(gold: number) {
        this._goldLabel.string = `金币  ${Math.floor(gold).toLocaleString()}`;
    }

    private _refreshWave(d: HudData) {
        // v4：关内波次显示 X/15；无尽模式按轮次显示；测试房无难度注入不加后缀
        if (d.endless) {
            const round = Math.floor((Math.max(1, d.wave) - 1) / 15) + 1;
            const tw = ((Math.max(1, d.wave) - 1) % 15) + 1;
            this._waveLabel.string = d.difficultyName
                ? `无尽·第${round}轮 ${tw}/15 · ${d.difficultyName}`
                : `无尽·第${round}轮 ${tw}/15`;
            return;
        }
        this._waveLabel.string = d.difficultyName
            ? `第${d.chapter + 1}章 ${d.wave}/15 · ${d.difficultyName}`
            : `第${d.chapter + 1}章 ${d.wave}/15`;
    }

    private _refreshBoss(d: HudData) {
        const has = d.bossHp !== undefined && (d.bossMaxHp ?? 0) > 0;
        this._bossBarRoot.active = has;
        if (!has) return;
        const r = Math.max(0, Math.min(1, d.bossHp! / d.bossMaxHp!));
        this._bossBarFg.clear();
        this._bossBarFg.fillColor = new Color(205, 145, 89, 255);
        this._bossBarFg.fillRect(0, 0, this.BOSS_W * r, this.BOSS_H);
        this._bossBarFg.fillColor = new Color(245, 214, 166, 150);
        this._bossBarFg.fillRect(0, this.BOSS_H - 2, this.BOSS_W * r, 2);
        this._bossBarFg.fillColor = new Color(18, 31, 42, 210);
        for (let i = 1; i < 10; i++) this._bossBarFg.fillRect(this.BOSS_W * i / 10, 0, 2, this.BOSS_H);
        this._bossLabel.string = `首领 · ${d.bossName ?? '未知'}   ${Math.ceil(d.bossHp!)} / ${d.bossMaxHp}`;
    }

    private _refreshSkills(skills: { name: string; desc: string; icon: string; cd: number; maxCd: number }[]) {
        const R = this.SKILL_R;
        for (let i = 0; i < this._skillRings.length; i++) {
            const { g, label, icon, desc } = this._skillRings[i];
            const sk = skills[i];
            g.clear();
            if (!sk) continue;

            applyArtSprite(icon, `ui_icon_${sk.icon}`);
            desc.string = (sk.desc || '').split('—')[0].trim();

            const ratio = sk.maxCd > 0 ? Math.max(0, 1 - sk.cd / sk.maxCd) : 1;
            const ready = ratio >= 1;

            // background ring
            g.strokeColor = new Color(45, 45, 65, 200);
            g.lineWidth = 5; g.circle(0, 0, R); g.stroke();

            // progress arc
            g.strokeColor = ready ? new Color(100, 220, 255, 255)
                                  : new Color(180, 140, 60, 200);
            g.lineWidth = 5;
            g.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2, false);
            g.stroke();

            // 未就绪时图标略微变暗，配合CD进度弧的颜色语义
            icon.color = ready ? new Color(255, 255, 255, 255) : new Color(150, 150, 150, 200);
            label.color = ready ? new Color(100, 220, 255, 255)
                                : new Color(150, 150, 150, 180);
        }
    }

    // ── helper ────────────────────────────────────────────────

    private _mkNode(name: string, x: number, y: number): Node {
        const n = new Node(name);
        n.setParent(this.node);
        n.setPosition(new Vec3(x, y, 0));
        return n;
    }
}
