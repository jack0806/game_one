import {
    _decorator, Component, Node, Label, Graphics, Sprite,
    Color, Vec3, UITransform
} from 'cc';
import { AugDef } from '../data/AugmentDB';
import { RARITY_COLOR } from '../core/Constants';
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
    skills: { name: string; icon: string; cd: number; maxCd: number }[];
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
    private _goldLabel!:   Label;
    private _waveLabel!:   Label;
    private _bossBarRoot!: Node;
    private _bossBarFg!:   Graphics;
    private _bossLabel!:   Label;
    private _augSlots:     Node[] = [];
    private _skillRings:   { g: Graphics; label: Label; icon: Sprite }[] = [];

    private readonly BAR_W   = 240;
    private readonly BAR_H   = 18;
    private readonly SKILL_R = 28;

    onLoad() {
        this._buildHpBar();
        this._buildGoldDisplay();
        this._buildWaveDisplay();
        this._buildBossBar();
        this._buildAugSlots();
        this._buildSkillRings();
    }

    // ── builders ──────────────────────────────────────────────

    private _buildHpBar() {
        const bg = this._mkNode('HpBg', -500, 330);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = new Color(25, 25, 25, 210);
        bgG.fillRect(0, 0, this.BAR_W, this.BAR_H);
        bgG.strokeColor = new Color(70, 70, 70, 255);
        bgG.lineWidth = 1; bgG.rect(0, 0, this.BAR_W, this.BAR_H); bgG.stroke();

        this._hpBarFg     = this._mkNode('HpFg',     -500, 330).addComponent(Graphics);
        this._shieldBarFg = this._mkNode('ShieldFg', -500, 330).addComponent(Graphics);

        const ln = this._mkNode('HpLbl', -500, 310);
        ln.addComponent(UITransform).setContentSize(this.BAR_W, 20);
        this._hpLabel = ln.addComponent(Label);
        this._hpLabel.fontSize = 13;
        this._hpLabel.color = new Color(210, 210, 210, 255);
        styleLabel(this._hpLabel);
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
        const n = this._mkNode('WaveLbl', -30, 330);
        n.addComponent(UITransform).setContentSize(220, 28);
        this._waveLabel = n.addComponent(Label);
        this._waveLabel.fontSize = 17;
        this._waveLabel.color = new Color(180, 200, 255, 255);
        styleLabel(this._waveLabel);
    }

    private _buildBossBar() {
        this._bossBarRoot = this._mkNode('BossRoot', -200, 300);

        const bg = new Node('BossBg'); bg.setParent(this._bossBarRoot);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = new Color(18, 8, 8, 220);
        bgG.fillRect(0, 0, 400, 22);
        bgG.strokeColor = new Color(190, 30, 30, 255);
        bgG.lineWidth = 2; bgG.rect(0, 0, 400, 22); bgG.stroke();

        const fgN = new Node('BossFg'); fgN.setParent(this._bossBarRoot);
        this._bossBarFg = fgN.addComponent(Graphics);

        const ln = new Node('BossLbl'); ln.setParent(this._bossBarRoot);
        ln.setPosition(new Vec3(0, 28, 0));
        ln.addComponent(UITransform).setContentSize(400, 22);
        this._bossLabel = ln.addComponent(Label);
        this._bossLabel.fontSize = 14;
        this._bossLabel.color = new Color(255, 100, 100, 255);
        styleLabel(this._bossLabel);

        this._bossBarRoot.active = false;
    }

    private _buildAugSlots() {
        const startX = -560, y = -320;
        for (let i = 0; i < 8; i++) {
            const slot = this._mkNode(`Aug${i}`, startX + i * 46, y);
            slot.addComponent(UITransform).setContentSize(40, 40);
            slot.addComponent(Graphics);   // redrawn each refresh (border/rarity tint)

            // 图标Sprite：叠在稀有度边框之上，居中显示，初始inactive（无词条时隐藏）。
            const iconN = new Node('Icon'); iconN.setParent(slot);
            iconN.addComponent(UITransform).setContentSize(30, 30);
            const iconSp = iconN.addComponent(Sprite);
            iconSp.sizeMode = Sprite.SizeMode.CUSTOM;
            iconN.active = false;

            this._augSlots.push(slot);
        }
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

            this._skillRings.push({ g, label: lbl, icon: iconSp });
        }
    }

    // ── refresh (called every frame by GameManager) ────────────

    refresh(d: HudData) {
        this._refreshHp(d);
        this._refreshGold(d.gold);
        this._refreshWave(d.wave, d.chapter);
        this._refreshBoss(d);
        this._refreshAugs(d.augments);
        this._refreshSkills(d.skills);
    }

    private _refreshHp(d: HudData) {
        const hR = Math.max(0, d.hp / d.maxHp);
        const sR = d.maxShield > 0 ? Math.max(0, d.shield / d.maxShield) : 0;

        const fg = this._hpBarFg;
        fg.clear();
        fg.fillColor = hR > 0.4 ? new Color(55, 200, 75, 255) : new Color(220, 55, 55, 255);
        fg.fillRect(0, 0, this.BAR_W * hR, this.BAR_H);

        const sf = this._shieldBarFg;
        sf.clear();
        if (sR > 0) {
            sf.fillColor = new Color(80, 160, 255, 140);
            sf.fillRect(0, 0, this.BAR_W * sR, this.BAR_H);
        }
        this._hpLabel.string = `${Math.ceil(d.hp)}/${d.maxHp}` +
            (d.maxShield > 0 ? `  ◆${Math.ceil(d.shield)}` : '');
    }

    private _refreshGold(gold: number) {
        this._goldLabel.string = `⬡ ${gold}`;
    }

    private _refreshWave(wave: number, ch: number) {
        this._waveLabel.string = `Ch.${ch + 1} — Wave ${wave}`;
    }

    private _refreshBoss(d: HudData) {
        const has = d.bossHp !== undefined && (d.bossMaxHp ?? 0) > 0;
        this._bossBarRoot.active = has;
        if (!has) return;
        const r = Math.max(0, d.bossHp! / d.bossMaxHp!);
        this._bossBarFg.clear();
        this._bossBarFg.fillColor = new Color(220, 40, 40, 255);
        this._bossBarFg.fillRect(0, 0, 400 * r, 22);
        this._bossLabel.string = `${d.bossName ?? 'BOSS'}  ${Math.ceil(d.bossHp!)} / ${d.bossMaxHp}`;
    }

    private _refreshAugs(augs: AugDef[]) {
        for (let i = 0; i < this._augSlots.length; i++) {
            const slot   = this._augSlots[i];
            const aug    = augs[i];
            const g      = slot.getComponent(Graphics)!;
            const iconN  = slot.getChildByName('Icon')!;
            const iconSp = iconN.getComponent(Sprite)!;
            g.clear();

            if (aug) {
                const hex = RARITY_COLOR[aug.rarity] ?? '#888888';
                const col = Color.fromHEX(new Color(), hex);
                g.fillColor = new Color(col.r, col.g, col.b, 50);
                g.fillRect(0, 0, 40, 40);
                g.strokeColor = col; g.lineWidth = 2;
                g.rect(0, 0, 40, 40); g.stroke();

                iconN.active = true;
                applyArtSprite(iconSp, `ui_icon_${aug.icon}`);
            } else {
                g.fillColor = new Color(20, 20, 30, 100);
                g.fillRect(0, 0, 40, 40);
                g.strokeColor = new Color(55, 55, 75, 160);
                g.lineWidth = 1; g.rect(0, 0, 40, 40); g.stroke();
                iconN.active = false;
            }
        }
    }

    private _refreshSkills(skills: { name: string; icon: string; cd: number; maxCd: number }[]) {
        const R = this.SKILL_R;
        for (let i = 0; i < this._skillRings.length; i++) {
            const { g, label, icon } = this._skillRings[i];
            const sk = skills[i];
            g.clear();
            if (!sk) continue;

            applyArtSprite(icon, `ui_icon_${sk.icon}`);

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
