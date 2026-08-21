// ============================================================
//  Economy.ts — 金币/掉落经济系统
// ============================================================
import { Vec, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';

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

export class Economy {
    gold  = 0;
    parts = 0;
    private _drops: GoldDrop[] = [];

    addGold(amount: number): void  { this.gold  += amount; }
    spendGold(amount: number): boolean {
        if (this.gold < amount) return false;
        this.gold -= amount;
        return true;
    }

    spawnDrop(x: number, y: number, amount: number): void {
        // 二维平面：金币直接固定在敌人死亡坐标（仅做一次合法范围校正），
        // 不再生成随机速度，也不在 update 中做重力/横向漂移。
        this._drops.push({
            x: clamp(x, DROP_SIDE_MARGIN, CANVAS_W - DROP_SIDE_MARGIN),
            y: clamp(y, DROP_SIDE_MARGIN, DROP_FLOOR),
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
                this.addGold(d.amount);
                d.collected = true;
                game?.audio?.playSfx?.('gold');
                game?.particles?.hit?.(d.x, d.y, '#ffd85a');
                game?.floatingText?.spawn?.(d.x, d.y - 18, `+${d.amount}`, '#ffd85a', 13, false);
            }
        }
    }

    get drops(): GoldDrop[] { return this._drops; }

    reset(): void { this.gold = 0; this.parts = 0; this._drops = []; }

    /** Alias used by GameManager / ShopUI. */
    spend(amount: number): boolean { return this.spendGold(amount); }

    /** Generate shop items appropriate for the current chapter. */
    generateShopItems(chapter: number): ShopItem[] {
        const items: ShopItem[] = [
            { id: 'heal',     name: '急救包',     desc: '恢复 40 HP',          cost: 30,  effect: 'heal',    value: 40  },
            { id: 'maxhp',    name: '生命强化',   desc: '永久增加 20 最大 HP', cost: 60,  effect: 'maxhp',   value: 20  },
            { id: 'shield',   name: '护盾强化',   desc: '增加 20 护盾上限',    cost: 50,  effect: 'shield',  value: 20  },
            { id: 'speed',    name: '移速芯片',   desc: '移速 +10%',           cost: 45,  effect: 'speed',   value: 0.1 },
            { id: 'damage',   name: '伤害晶核',   desc: '伤害 +15%',           cost: 70,  effect: 'damage',  value: 0.15},
            { id: 'augment',  name: '神秘强化',   desc: '随机选一张强化卡',    cost: 90,  effect: 'augment', value: 0   },
        ];
        // Scale costs with chapter
        const mult = 1 + (chapter - 1) * 0.3;
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
