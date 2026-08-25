import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform
} from 'cc';
import { AugDef } from '../data/AugmentDB';
import { applyArtSprite } from '../core/SpriteUtils';
import { styleLabel } from '../core/LabelUtils';

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

    private readonly BAR_W   = 240;
    private readonly BAR_H   = 16;
    private readonly SHIELD_H = 12;
    private readonly BOSS_W  = 460;
    private readonly BOSS_H  = 24;
    private readonly SKILL_R = 28;

    onLoad() {
        this._buildHpBar();
        this._buildGoldDisplay();
        this._buildWaveDisplay();
        this._buildBossBar();
        this._buildSkillRings();
    }

    // ── builders ──────────────────────────────────────────────

    private _buildHpBar() {
        const panel = this._mkNode('VitalsPanel', -510, 310);
        const panelG = panel.addComponent(Graphics);
        panelG.fillColor = new Color(5, 10, 16, 218);
        panelG.fillRect(-8, -8, this.BAR_W + 28, 48);
        panelG.strokeColor = new Color(80, 125, 155, 180);
        panelG.lineWidth = 1;
        panelG.rect(-8, -8, this.BAR_W + 28, 48); panelG.stroke();

        const bg = this._mkNode('HpBg', -500, 330);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = new Color(25, 25, 25, 210);
        bgG.fillRect(0, 0, this.BAR_W, this.BAR_H);
        bgG.strokeColor = new Color(70, 70, 70, 255);
        bgG.lineWidth = 1; bgG.rect(0, 0, this.BAR_W, this.BAR_H); bgG.stroke();

        this._hpBarFg = this._mkNode('HpFg', -500, 330).addComponent(Graphics);

        const shieldBg = this._mkNode('ShieldBg', -500, 320);
        const shieldBgG = shieldBg.addComponent(Graphics);
        shieldBgG.fillColor = new Color(18, 30, 44, 225);
        shieldBgG.fillRect(0, 0, this.BAR_W, this.SHIELD_H);
        shieldBgG.strokeColor = new Color(55, 90, 120, 230);
        shieldBgG.lineWidth = 1;
        shieldBgG.rect(0, 0, this.BAR_W, this.SHIELD_H); shieldBgG.stroke();
        this._shieldBarFg = this._mkNode('ShieldFg', -500, 320).addComponent(Graphics);

        // 数值直接归属各自的条，不再另起一行挤出面板或覆盖外框。
        const ln = this._mkNode('HpLbl', -380, 338);
        ln.addComponent(UITransform).setContentSize(this.BAR_W - 12, this.BAR_H);
        this._hpLabel = ln.addComponent(Label);
        this._hpLabel.fontSize = 12;
        this._hpLabel.color = new Color(245, 250, 245, 255);
        styleLabel(this._hpLabel);

        const sn = this._mkNode('ShieldLbl', -380, 326);
        sn.addComponent(UITransform).setContentSize(this.BAR_W - 12, this.SHIELD_H);
        this._shieldLabel = sn.addComponent(Label);
        this._shieldLabel.fontSize = 10;
        this._shieldLabel.color = new Color(225, 242, 255, 255);
        styleLabel(this._shieldLabel);
    }

    private _buildGoldDisplay() {
        const n = this._mkNode('GoldLbl', 440, 330);
        n.addComponent(UITransform).setContentSize(160, 28);
        this._goldLabel = n.addComponent(Label);
        this._goldLabel.fontSize = 20;
        this._goldLabel.color = new Color(255, 210, 50, 255);
        styleLabel(this._goldLabel);
    }

    private _buildWaveDisplay() {
        const n = this._mkNode('WaveLbl', 0, 330);
        n.addComponent(UITransform).setContentSize(220, 28);
        this._waveLabel = n.addComponent(Label);
        this._waveLabel.fontSize = 17;
        this._waveLabel.color = new Color(180, 200, 255, 255);
        styleLabel(this._waveLabel);
    }

    private _buildBossBar() {
        // 顶部第一行只放玩家状态 / 波次 / 金币；Boss 条单独居中下沉一行，
        // 避免名称贴着玩家血条、数值又跑到红条左侧。
        this._bossBarRoot = this._mkNode('BossRoot', -this.BOSS_W / 2, 282);

        const bg = new Node('BossBg'); bg.setParent(this._bossBarRoot);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = new Color(18, 8, 8, 220);
        bgG.fillRect(0, 0, this.BOSS_W, this.BOSS_H);
        bgG.strokeColor = new Color(190, 30, 30, 255);
        bgG.lineWidth = 2; bgG.rect(0, 0, this.BOSS_W, this.BOSS_H); bgG.stroke();

        const fgN = new Node('BossFg'); fgN.setParent(this._bossBarRoot);
        this._bossBarFg = fgN.addComponent(Graphics);

        const ln = new Node('BossLbl'); ln.setParent(this._bossBarRoot);
        ln.setPosition(new Vec3(this.BOSS_W / 2, this.BOSS_H / 2, 0));
        ln.addComponent(UITransform).setContentSize(this.BOSS_W - 18, this.BOSS_H);
        this._bossLabel = ln.addComponent(Label);
        this._bossLabel.fontSize = 15;
        this._bossLabel.color = new Color(255, 225, 215, 255);
        styleLabel(this._bossLabel);

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
            ln.setPosition(new Vec3(0, -this.SKILL_R - 12, 0));
            ln.addComponent(UITransform).setContentSize(40, 40);
            const lbl = ln.addComponent(Label);
            lbl.string = keys[i];
            lbl.fontSize = 13;
            lbl.color = new Color(200, 200, 200, 255);
            styleLabel(lbl);

            const descN = new Node('Desc'); descN.setParent(n);
            descN.setPosition(new Vec3(0, this.SKILL_R + 18, 0));
            descN.addComponent(UITransform).setContentSize(66, 18);
            const desc = descN.addComponent(Label);
            desc.fontSize = 10;
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

    // ── refresh (called every frame by GameManager) ────────────

    refresh(d: HudData) {
        this._refreshHp(d);
        this._refreshGold(d.gold);
        this._refreshWave(d.wave, d.chapter);
        this._refreshBoss(d);
        this._refreshSkills(d.skills);
    }

    private _refreshHp(d: HudData) {
        const hR = Math.max(0, Math.min(1, d.hp / Math.max(1, d.maxHp)));
        const sR = d.maxShield > 0 ? Math.max(0, Math.min(1, d.shield / d.maxShield)) : 0;

        const fg = this._hpBarFg;
        fg.clear();
        fg.fillColor = hR > 0.4 ? new Color(55, 200, 75, 255) : new Color(220, 55, 55, 255);
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
        this._goldLabel.string = `⬡ ${gold}`;
    }

    private _refreshWave(wave: number, ch: number) {
        this._waveLabel.string = `第${ch + 1}章 · 第${wave}波`;
    }

    private _refreshBoss(d: HudData) {
        const has = d.bossHp !== undefined && (d.bossMaxHp ?? 0) > 0;
        this._bossBarRoot.active = has;
        if (!has) return;
        const r = Math.max(0, Math.min(1, d.bossHp! / d.bossMaxHp!));
        this._bossBarFg.clear();
        this._bossBarFg.fillColor = new Color(220, 40, 40, 255);
        this._bossBarFg.fillRect(0, 0, this.BOSS_W * r, this.BOSS_H);
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
