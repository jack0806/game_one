// ============================================================
//  Economy.ts — 金币/掉落经济系统
// ============================================================
import { Vec, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';
import { DIFFICULTIES } from '../data/DifficultyDB';
import { mapOf } from '../data/LevelIndex';

interface GoldDrop {
    x: number; y: number;
    vx: number; vy: number;
    amount: number;
    life: number;
    age: number;
    collected: boolean;
}

const DROP_FLOOR = PLAYFIELD_BOTTOM;
const DROP_SIDE_MARGIN = 12;

/**
 * 各章节金币乘数（2026-10-03 v4《关卡设计-15波.md》9.3）：
 * 一局一章 × 数量随章翻倍后，金币乘数只温和上调（原 0.9~5.5 是六章连打
 * 时代"越打越多"的设计，实测一局 6~7 万金严重通胀）。
 */
export const GOLD_STAGE_MULT = [1.0, 1.15, 1.3, 1.45, 1.6, 1.75];

/**
 * 难度金币系数（v4 9.3）：金币脱离难度 statMult（原 easy 0.25/hell 1.5 连
 * 金币一起乘，金币量不可控），改走本函数。数值单一来源 = DifficultyDB 的
 * goldMult（2026-10-07 定稿 0.9 / 1 / 1.2 / 1.35）：高难度金币加成对冲
 * 怪物强度与数量，让玩家更快成型构筑（金卡/彩卡）。
 */
export function difficultyGoldMult(difficultyId?: string): number {
    const def = DIFFICULTIES.find(d => d.id === difficultyId);
    return def?.goldMult ?? 1;
}

/**
 * 海克斯商店刷新定价（海克斯.docx）：第一次刷新 5 金币，3 次之后
 * 每次较基准溢价 75%（第4次 9、第5次 16、第6次 27 …）。
 */
export function nextAugRefreshCost(refreshCount: number): number {
    return refreshCount < 3 ? 5 : Math.round(5 * Math.pow(1.75, refreshCount - 2));
}

export class Economy {
    /** 由 GameManager 注入当前布局的掉落点修正。 */
    dropPlacement?: (x: number, y: number) => { x: number; y: number };
    gold  = 0;
    parts = 0;
    /** 本局累计获得金币（含已花费），供局末存档统计成就，reset 时清零。 */
    earnedThisRun = 0;
    /** 海克斯16 点金手：所有获得的金币 ×gainMult（默认 1）。 */
    gainMult = 1;
    /**
     * 击杀掉落产出硬上限（v4 9.6 防崩塌层1）：单局击杀掉落累计 ≤ cap。
     * 超出部分线性衰减到 1 金（掉落照掉、拾取仍有爽感，但总量封死）。
     * 默认 Infinity（测试房/mock 不设限）；GameManager 开局按预算×1.25 注入。
     */
    killGoldCap = Infinity;
    /** 本局击杀掉落已计入上限的累计值（不含卖出/退款）。 */
    private _killGoldEarned = 0;
    private _drops: GoldDrop[] = [];

    /** 击杀掉落通道的上限门：帽内给剩余额度，超帽只给 1 金（保底拾取手感）。 */
    private _capGate(amount: number): number {
        if (amount <= 0) return 0;
        if (this._killGoldEarned >= this.killGoldCap) return 1;
        const give = Math.min(amount, this.killGoldCap - this._killGoldEarned);
        this._killGoldEarned += give;
        return give;
    }

    addGold(amount: number): void  {
        const gain = Math.round(amount * this.gainMult);
        if (gain <= 0) return;
        this.gold += gain;
        if (gain > 0) this.earnedThisRun += gain;
    }

    /**
     * 原路退款/回收（购买失败退回、卖出回收）：不走点金手乘区，也不计入
     * 本局获得统计。此前退款走 addGold，gainMult>1 时"花45退68"能凭空
     * 刷钱（购买失败可反复点击），且退款虚增 earnedThisRun 成就统计。
     */
    refund(amount: number): void {
        const back = Math.round(amount);
        if (back <= 0) return;
        this.gold += back;
    }
    spendGold(amount: number): boolean {
        if (this.gold < amount) return false;
        this.gold -= amount;
        return true;
    }

    spawnDrop(x: number, y: number, amount: number): void {
        // 二维平面：金币直接固定在敌人死亡坐标（仅做一次合法范围校正），
        // 不再生成随机速度，也不在 update 中做重力/横向漂移。
        const safe = this.dropPlacement?.(x, y) ?? { x, y };
        this._drops.push({
            x: clamp(safe.x, DROP_SIDE_MARGIN, CANVAS_W - DROP_SIDE_MARGIN),
            y: clamp(safe.y, DROP_SIDE_MARGIN, DROP_FLOOR),
            vx: 0,
            vy: 0,
            amount,
            life: 30,
            age: 0,
            collected: false,
        });
    }

    update(dt: number, player: any, game?: any): void {
        const pickupR = player.stats.goldPickupRange || 60;
        for (let i = this._drops.length - 1; i >= 0; i--) {
            const d = this._drops[i];
            d.age += dt;
            d.life -= dt;
            if (d.life <= 0 || d.collected) { this._drops.splice(i, 1); continue; }
            if (Vec.dist(d.x, d.y, player.x, player.y) < pickupR) {
                this.addGold(this._capGate(d.amount));
                d.collected = true;
                game?.audio?.playSfx?.('gold');
                game?.particles?.hit?.(d.x, d.y, '#ffd85a');
                game?.floatingText?.spawn?.(d.x, d.y - 18, `+${d.amount}`, '#ffd85a', 13, false);
            }
        }
    }

    get drops(): GoldDrop[] { return this._drops; }

    /** 测试房清场只移除场上掉落，不改测试角色当前金币。 */
    clearDrops(): void { this._drops = []; }

    reset(): void {
        this.gold = 0; this.parts = 0; this.earnedThisRun = 0; this.gainMult = 1;
        this.killGoldCap = Infinity; this._killGoldEarned = 0; this._drops = [];
    }

    /** Alias used by GameManager / ShopUI. */
    spend(amount: number): boolean { return this.spendGold(amount); }

    /** Generate shop items appropriate for the current chapter. */
    generateShopItems(globalChapterId: number): ShopItem[] {
        // v4 9.4 重定价：单局金币预算 ≈1600，原 30~90 相当于白送；
        // v5：入参为全局章号 1~30，价格系数按图走（×0.3/图）。
        const items: ShopItem[] = [
            { id: 'heal',     name: '急救包',     desc: '恢复 40 HP',          cost: 80,  effect: 'heal',    value: 40  },
            { id: 'maxhp',    name: '生命强化',   desc: '永久增加 20 最大 HP', cost: 150, effect: 'maxhp',   value: 20  },
            { id: 'shield',   name: '护盾强化',   desc: '增加 20 护盾上限',    cost: 120, effect: 'shield',  value: 20  },
            { id: 'speed',    name: '移速芯片',   desc: '移速 +10%',           cost: 100, effect: 'speed',   value: 0.1 },
            { id: 'damage',   name: '伤害晶核',   desc: '伤害 +15%',           cost: 160, effect: 'damage',  value: 0.15},
            { id: 'augment',  name: '神秘强化',   desc: '随机选一张强化卡',    cost: 250, effect: 'augment', value: 0   },
        ];
        // Scale costs with map (v5: 图内五章持平)
        const mapId = mapOf(globalChapterId);
        const mult = 1 + (mapId - 1) * 0.3;
        return items.map(it => ({ ...it, cost: Math.round(it.cost * mult) }));
    }
}

/** A purchasable item in the between-wave shop. */
export interface ShopItem {
    id:     string;
    name:   string;
    desc?:  string;
    cost:   number;
    effect: 'heal' | 'maxhp' | 'shield' | 'speed' | 'damage' | 'augment';
    value:  number;
}
