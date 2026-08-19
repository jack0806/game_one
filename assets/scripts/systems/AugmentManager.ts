// ============================================================
//  AugmentManager.ts — 词条管理器
// ============================================================
import { AUGMENT_DB, AugmentDef } from '../data/AugmentDB';
import { CHARACTERS } from '../data/CharacterDB';
import { Rng } from '../core/MathUtils';

export class AugmentManager {
    active: AugmentDef[]   = [];
    maxSlots: number       = 6;
    synergyActive: string[] = [];
    onNextAugment: (() => void) | null = null;

    // ── 生成选项 ──────────────────────────────────────────
    rollOptions(n = 3, wave = 1, charId?: string): AugmentDef[] {
        const blueW   = Math.max(10, 65 - wave * 1.5);
        const purpleW = Math.min(60, 30 + wave * 1.2);
        const orangeW = Math.min(25, Math.max(0, (wave - 5) * 1.2));
        const goldW   = Math.min(5,  Math.max(0, (wave - 15) * 0.3));
        const weights = { blue: blueW, purple: purpleW, orange: orangeW, gold: goldW };

        const isFull = this.active.length >= this.maxSlots;
        const results: AugmentDef[] = [];
        const usedIds = new Set<string>();

        for (let i = 0; i < n; i++) {
            // 满格时 80% 概率出升级卡
            if (isFull && Rng.chance(0.8) && this.active.length > 0) {
                const upgradable = this.active.filter(a => (a.tier || 1) < 3);
                if (upgradable.length > 0) {
                    const inst = Rng.pick(upgradable);
                    const card = this._makeUpgradeCard(inst);
                    if (!usedIds.has(card.id)) { usedIds.add(card.id); results.push(card); continue; }
                }
            }
            // 普通词条（按角色攻击方式过滤掉不适配的纯弹道词条）
            const avail = this._filterForChar(AUGMENT_DB.filter(a => !usedIds.has(a.id) && !this.active.find(x => x.id === a.id && (x.tier || 1) >= 3)), charId);
            const card = this._rollOneFromPool(avail, weights, charId);
            if (card) { usedIds.add(card.id); results.push({ ...card, tier: 1 }); }
        }
        return results;
    }

    /**
     * 按角色攻击方式过滤词条：attackType:'ranged' 的纯弹道词条（穿透/多重/反弹/
     * 弹幕等）只作用于 spawn 出去的子弹，近战角色拿到即死词条——近战(reik)的
     * 候选池与混沌加成池都不得出现。反向同理（未来若有 melee 专属词条）。
     */
    private _filterForChar(pool: AugmentDef[], charId?: string): AugmentDef[] {
        const atk = charId ? CHARACTERS[charId]?.attackType : undefined;
        if (!atk) return pool;
        return pool.filter(a => !a.attackType || a.attackType === atk);
    }

    private _rollOneFromPool(pool: AugmentDef[], weights: Record<string, number>, charId?: string): AugmentDef | null {
        const avail = pool.filter(a => (weights[a.rarity] || 0) > 0);
        if (!avail.length) return null;
        const totalW = avail.reduce((s, a) => s + (weights[a.rarity] || 0) * (charId && (a.affinity?.indexOf(charId) ?? -1) >= 0 ? 2.5 : 1), 0);
        if (totalW <= 0) return null;
        let r = Math.random() * totalW;
        for (const a of avail) {
            r -= (weights[a.rarity] || 0) * (charId && (a.affinity?.indexOf(charId) ?? -1) >= 0 ? 2.5 : 1);
            if (r <= 0) return a;
        }
        return avail[avail.length - 1];
    }

    private _makeUpgradeCard(inst: AugmentDef): AugmentDef {
        const curTier = inst.tier || 1;
        const nxtTier = curTier + 1;
        return Object.assign({}, inst, {
            _upgrade:     true,
            _targetId:    inst.id,
            _tierFrom:    curTier,
            _tierTo:      nxtTier,
            _tierMult:    nxtTier === 2 ? 0.8 : 0.6,
            desc:         `[升级 Lv.${nxtTier}] ${inst.desc || ''} — ${nxtTier === 2 ? '+80%效果' : '+60%效果'}`,
            _upgradeLabel: `Lv.${nxtTier}升级`,
        });
    }

    // ── 装备词条 ──────────────────────────────────────────
    // _fromChaosBonus: 内部递归标记，防止格雷夫被动(chaosBonus)无限触发自身。
    equip(aug: AugmentDef, player: any, game: any, _fromChaosBonus = false): boolean {
        // 升级分支
        if ((aug as any)._upgrade) {
            const existing = this.active.find(a => a.id === (aug as any)._targetId);
            if (existing) {
                existing.tier = (aug as any)._tierTo;
                if (existing.onEquip) existing.onEquip(player, game, (aug as any)._tierMult);
                return true;
            }
        }
        if (this.active.length >= this.maxSlots) return false;
        const inst: AugmentDef = { ...aug, tier: 1 };
        this.active.push(inst);
        if (inst.onEquip) inst.onEquip(player, game, 1);
        // 六芒永恒钩子
        if (this.onNextAugment) { this.onNextAugment(); this.onNextAugment = null; }
        // 格雷夫被动(chaosBonus)：获得词条时额外随机获得一个（对齐 CharacterDB.ts 的
        // desc: '获得词条时额外随机一个，混沌本质'）。_fromChaosBonus 防止连锁触发。
        if (!_fromChaosBonus && player?.stats?.chaosBonus && this.active.length < this.maxSlots) {
            const bonus = this._rollOneFromPool(
                this._filterForChar(
                    AUGMENT_DB.filter(a => !this.active.find(x => x.id === a.id && (x.tier || 1) >= 3)),
                    player?.charId,
                ),
                { blue: 65, purple: 30, orange: 5, gold: 1 },
            );
            if (bonus) this.equip(bonus, player, game, true);
        }
        return true;
    }

    // ── 事件分发 ──────────────────────────────────────────
    dispatchHit(player: any, enemy: any, dmg: number, game: any): void {
        for (const a of this.active) if (a.onHit) a.onHit(player, enemy, dmg, game);
    }

    dispatchKill(player: any, enemy: any, dmg: number, game: any): void {
        for (const a of this.active) if (a.onKill) a.onKill(player, enemy, dmg, game);
    }

    dispatchUpdate(player: any, dt: number, game: any): void {
        for (const a of this.active) if (a.onUpdate) a.onUpdate(player, dt, game);
    }

    dispatchWaveStart(player: any, game: any): void {
        for (const a of this.active) if (a.onWaveStart) a.onWaveStart(player, game);
    }

    dispatchSkill(player: any, game: any): void {
        for (const a of this.active) if (a.onSkill) a.onSkill(player, game);
    }

    // ── 随机移除（混沌神明） ───────────────────────────────
    removeRandom(): void {
        if (!this.active.length) return;
        const idx = Rng.int(0, this.active.length - 1);
        this.active.splice(idx, 1);
    }

    // ── 复制随机词条效果（六芒永恒） ──────────────────────
    duplicateRandom(player: any, game: any): void {
        if (!this.active.length) return;
        const src = Rng.pick(this.active);
        if (src.onEquip) src.onEquip(player, game, 0.5);
    }

    reset(): void {
        this.active     = [];
        this.maxSlots   = 6;
        this.onNextAugment = null;
        this.synergyActive = [];
    }
}
