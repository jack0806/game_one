// ============================================================
//  AugmentManager.ts — 海克斯管理器（等级/定价/卖出）
// ============================================================
// 2026-09-14 按用户《海克斯.docx》重做：
//  · 格子：初始 5 个（文档：任务可解锁到 8，暂未实现任务钩子）；
//    功能性海克斯不占这 5 格（独立 functional 列表，数量不设上限）；
//  · 等级：同一海克斯再次获得即升 1 档（Lv.1→2→3），升档不占新格子；
//  · 一次性海克斯（15/17）每局只能选择一次：生效即消耗、不占格子，
//    本局商店不再刷出（16/18 为持久型，正常升档占格）；
//  · 定价：基准价 × 同稀有度购买次数溢价（银/金 +10%/次，彩 +100%/次）；
//  · 卖出：卸下词条回收购买价 75%（退款经 GameManager 走 Economy）。
import { AUGMENT_DB, AugmentDef, HexRarity, rarityForLevel } from '../data/AugmentDB';
import { Rng } from '../core/MathUtils';

/** 稀有度出售溢价：银/金每买 1 张该稀有度涨价 10%，彩涨 100%。 */
const SURGE_RATE: Record<HexRarity, number> = { silver: 0.10, gold: 0.10, prismatic: 1.0 };

export class AugmentManager {
    /** 技能/持久型海克斯（占 maxSlots 格）。 */
    active: AugmentDef[]   = [];
    /** 功能性海克斯：不占 5 格的独立持有列表（可升档/卖出，数量无上限）。 */
    functional: AugmentDef[] = [];
    /** 文档：角色初始 5 个海克斯待开发格子。 */
    maxSlots: number       = 5;
    /** 海克斯15 进阶蓝图：下一个新获得的海克斯 +1 档（消费后清零）。 */
    nextLevelBonus         = 0;
    /** 本局各稀有度已购张数（定价溢价用）。 */
    boughtPerRarity: Record<string, number> = { silver: 0, gold: 0, prismatic: 0 };
    /** 本局已选用过的一次性海克斯 id（只能选择一次，商店不再刷出）。 */
    private _oneShotUsed: Set<string> = new Set();
    /** 格雷夫被动递归防护：免费追加装备期间不再触发二次追加。 */
    private _inChaosBonus = false;

    /** 全部持有（技能 + 功能），展示/统计/事件分发用。 */
    all(): AugmentDef[] {
        return this.active.concat(this.functional);
    }

    /** 按 id 查两份持有列表中的实例。 */
    ownedOf(id: string): AugmentDef | undefined {
        return this.active.find(a => a.id === id) ?? this.functional.find(a => a.id === id);
    }

    // ── 定价 ──────────────────────────────────────────────

    /** 当前买下这张卡的价格（按档位稀有度基准价 × 同稀有度累计溢价；卖出回收 75%）。 */
    priceOf(def: AugmentDef, level = 1): number {
        const rarity = rarityForLevel(def, level);
        const base = def.prices[Math.min(def.prices.length, Math.max(1, level)) - 1];
        const surge = 1 + SURGE_RATE[rarity] * (this.boughtPerRarity[rarity] || 0);
        return Math.round(base * surge);
    }

    /** 记一次成功购买（涨价与回收价都以实付为准）。 */
    recordPurchase(rarity: HexRarity, paid: number): void {
        this.boughtPerRarity[rarity] = (this.boughtPerRarity[rarity] || 0) + 1;
    }

    /** 卖出回收价 = 实付 × 75%。 */
    sellValue(inst: AugmentDef): number {
        return Math.round((inst.paid ?? 0) * 0.75);
    }

    // ── 生成选项 ──────────────────────────────────────────

    /** 当前波次的三档稀有度权重（商店页"出现率"标注与 rollOptions 共用）。 */
    rarityWeights(wave: number): Record<HexRarity, number> {
        return {
            silver:    Math.max(12, 55 - wave * 2),
            gold:      Math.min(55, 25 + wave * 2.5),
            prismatic: Math.min(28, Math.max(0, (wave - 3) * 2)),
        };
    }

    /**
     * 三选一卡池（等级即稀有度）：银档 → 各家族的 Lv.1 卡，金档 → Lv.2，
     * 彩档 → Lv.3。已持有家族（技能或功能）只会刷出比当前更高的档位（升级卡）；
     * 一次性海克斯本局未选用时任意档位可出现，选用后整局不再刷出。
     */
    rollOptions(n = 3, wave = 1): AugmentDef[] {
        const weights = this.rarityWeights(wave);
        const results: AugmentDef[] = [];

        for (let i = 0; i < n; i++) {
            const rarity = this._rollRarity(weights);
            if (!rarity) continue;
            const level = rarity === 'silver' ? 1 : rarity === 'gold' ? 2 : 3;
            const pool = AUGMENT_DB.filter(a => {
                if (a.prices.length < level) return false;      // 该海克斯没有这一档
                if (results.find(r => r.id === a.id)) return false;
                if (a.oneShot && this._oneShotUsed.has(a.id)) return false;
                const owned = this.ownedOf(a.id);
                if (owned && !a.oneShot) return (owned.level ?? 1) < level;
                return true;
            });
            if (!pool.length) continue;
            const def = Rng.pick(pool);
            const owned = this.ownedOf(def.id);
            results.push(this._makeCard(def, level, !!owned));
        }
        return results;
    }

    private _rollRarity(weights: Record<HexRarity, number>): HexRarity | null {
        const entries = (Object.keys(weights) as HexRarity[]).filter(k => weights[k] > 0);
        const total = entries.reduce((s, k) => s + weights[k], 0);
        if (total <= 0) return null;
        let r = Math.random() * total;
        for (const k of entries) {
            r -= weights[k];
            if (r <= 0) return k;
        }
        return entries[entries.length - 1];
    }

    /** 生成一张可购买卡（档位稀有度着色、文案、当前含溢价价格）。 */
    private _makeCard(def: AugmentDef, level: number, isUpgrade: boolean): AugmentDef {
        return {
            ...def,
            level,
            tier: level,
            rarity: rarityForLevel(def, level),
            desc: def.descAt(level),
            _isUpgrade: isUpgrade,
            _price: this.priceOf(def, level),
        };
    }

    // ── 装备 / 升档 / 卸下 ────────────────────────────────

    /**
     * 购买/授予一张卡。card.level 缺省 1；传入已持有的 id 时按 +1 档处理。
     * 功能性海克斯走 functional 列表不占 5 格；一次性海克斯（15/17）每局
     * 只能选择一次，生效即消耗不入列。opts.force 供测试房沙盒无限授予
     * （绕过每局一次限制）。返回是否成功（满格/已满级/已用过返回 false）。
     */
    equip(card: AugmentDef, player: any, game: any, opts?: { force?: boolean }): boolean {
        const def = AUGMENT_DB.find(a => a.id === card.id) ?? card;

        // 一次性（15/17）：每局只能选择一次，立即生效并消耗（不占格子）
        if (def.oneShot) {
            if (this._oneShotUsed.has(def.id) && !opts?.force) return false;
            this._oneShotUsed.add(def.id);
            const oneShot = { ...def, level: card.level ?? 1 };
            oneShot.onLevel?.(player, game, 0, card.level ?? 1);
            return true;
        }

        const isFunctional = def.category === '功能';
        const list = isFunctional ? this.functional : this.active;
        const existing = list.find(a => a.id === def.id);

        if (existing) {
            const from = existing.level ?? 1;
            if (from >= 3) return false;
            const to = Math.min(3, Math.max(from + 1, card.level ?? from + 1));
            existing.level = to;
            existing.tier = to;
            existing.rarity = rarityForLevel(def, to);
            existing.desc = def.descAt(to);
            existing.onLevel?.(player, game, from, to);
            return true;
        }

        // 功能性不占格；技能/持久型一次性占格，满 5 格拒绝
        if (!isFunctional && this.active.length >= this.maxSlots) return false;

        // 海克斯15：新获得的第一个海克斯提升一档
        let level = card.level ?? 1;
        if (this.nextLevelBonus > 0) {
            level = Math.min(3, level + this.nextLevelBonus);
            this.nextLevelBonus = 0;
        }
        const inst: AugmentDef = {
            ...def,
            level, tier: level,
            rarity: rarityForLevel(def, level),
            desc: def.descAt(level),
            paid: card.paid ?? card._price ?? 0,
        };
        list.push(inst);
        inst.onLevel?.(player, game, 0, level);
        // 格雷夫被动(chaosBonus)：获得海克斯时额外随机获得一个（1 档，不占格子溢出）
        if (player?.stats?.chaosBonus && !this._inChaosBonus && this.active.length < this.maxSlots) {
            this._inChaosBonus = true;
            try {
                const pool = AUGMENT_DB.filter(a =>
                    !this.ownedOf(a.id) && !a.oneShot);
                if (pool.length) {
                    const bonus = Rng.pick(pool);
                    this.equip(this._makeCard(bonus, 1, false), player, game);
                }
            } finally {
                this._inChaosBonus = false;
            }
        }
        return true;
    }

    /**
     * 卖出/卸下已持有的海克斯（技能或功能列表均支持）：
     * 数值型钩子按 onLevel(level, 0) 回退加成。
     * 返回该实例（含 paid 供退款），未找到返回 null。
     */
    unequip(id: string, player: any, game: any): AugmentDef | null {
        let list = this.active;
        let idx = this.active.findIndex(a => a.id === id);
        if (idx < 0) {
            list = this.functional;
            idx = this.functional.findIndex(a => a.id === id);
        }
        if (idx < 0) return null;
        const inst = list[idx];
        inst.onLevel?.(player, game, inst.level ?? 1, 0);
        list.splice(idx, 1);
        return inst;
    }

    // ── 事件分发 ──────────────────────────────────────────
    dispatchHit(player: any, enemy: any, dmg: number, game: any): void {
        for (const a of this.all()) if (a.onHit) a.onHit(player, enemy, dmg, game);
    }
    dispatchKill(player: any, enemy: any, dmg: number, game: any): void {
        for (const a of this.all()) if (a.onKill) a.onKill(player, enemy, dmg, game);
    }
    dispatchUpdate(player: any, dt: number, game: any): void {
        for (const a of this.all()) if (a.onUpdate) a.onUpdate(player, dt, game);
    }
    dispatchWaveStart(player: any, game: any): void {
        for (const a of this.all()) if (a.onWaveStart) a.onWaveStart(player, game);
    }
    dispatchSkill(player: any, game: any): void {
        for (const a of this.all()) if (a.onSkill) a.onSkill(player, game);
    }

    reset(): void {
        this.active = [];
        this.functional = [];
        this.maxSlots = 5;
        this.nextLevelBonus = 0;
        this.boughtPerRarity = { silver: 0, gold: 0, prismatic: 0 };
        this._oneShotUsed = new Set();
    }
}
