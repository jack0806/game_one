// ============================================================
//  AugmentDB.ts — 海克斯强化定义（纯数据层）
// ============================================================
// 2026-09-14 按用户《海克斯.docx》全量重做：旧 50 词条整体废弃，
// 换成 18 个海克斯（功能性 5 / 技能性 9 / 一次性 4），每个海克斯的
// 三档数值直接对应 Lv.1/2/3（"同步不同数值生成不同等级的强化"）。
// 稀有度与定价按文档：银 15-50 / 金 100-250 / 彩 500-1000，
// 购买后同稀有度溢价 10%（彩 100%），卖出回收购买价 75%（见
// AugmentManager / AugSelectUI / GameManager 的商店接线）。
import { Rng, Vec } from '../core/MathUtils';

export type HexRarity = 'silver' | 'gold' | 'prismatic';

/** 档位 → 稀有度：Lv.1=银 / Lv.2=金 / Lv.3=彩（2026-09-14 用户要求：同一效果的三档数值直接做成银金彩三个海克斯）。 */
export const LEVEL_RARITY: HexRarity[] = ['silver', 'gold', 'prismatic'];

/** 取某档位的稀有度；单档海克斯（蓝图/壁垒）固定用其自身稀有度。 */
export function rarityForLevel(def: AugmentDef, level: number): HexRarity {
    if (def.prices.length <= 1) return def.rarity;
    return LEVEL_RARITY[Math.min(3, Math.max(1, level)) - 1];
}

export interface AugmentDef {
    id: string;
    /** 文档编号（海克斯1~18），测试房授予面板按此排序展示。 */
    index: number;
    /** 基准稀有度（单档海克斯的实际稀有度；多档海克斯档位稀有度见 rarityForLevel）。 */
    rarity: HexRarity;
    icon: string;
    name: string;
    category: '功能' | '技能' | '一次性';
    /**
     * 分档售价：索引 0/1/2 对应 Lv.1(银)/Lv.2(金)/Lv.3(彩)，
     * 落在文档区间 银15-50 / 金100-250 / 彩500-1000。
     * 单档海克斯（hex15 进阶蓝图·彩 / hex18 应急壁垒·银）只有一个价格。
     */
    prices: number[];
    /** Lv.1/2/3 三档数值，钩子按 values[level-1] 取值。 */
    values: number[];
    /** 生成某一档的展示文案（卡片/M面板共用，装备时填充 desc 字段）。 */
    descAt: (level: number) => string;
    /** 一次性海克斯：生效后不占格子、不留在列表（15/17）。 */
    oneShot?: boolean;
    /**
     * 装备/升档/卸下钩子：from=0 首次装备，to=0 卖出卸下，
     * 其余为 from→to 的档位切换。数值型海克斯按"先除旧再加新"精确换档。
     */
    onLevel?:  (p: any, game: any, from: number, to: number) => void;
    onHit?:    (p: any, enemy: any, dmg: number, game: any) => void;
    onKill?:   (p: any, enemy: any, dmg: number, game: any) => void;
    onUpdate?: (p: any, dt: number, game?: any) => void;
    // ── 以下为运行期实例字段（装备拷贝时生成） ──
    /** 当前档位 1~3（tier 为兼容字段）。 */
    level?: number;
    tier?: number;
    desc?: string;
    /** 购入实付金币（卖出回收 75% 用）。 */
    paid?: number;
    [key: string]: any;
}

// Type alias for compatibility
export type AugDef = AugmentDef;

// ── 通用辅助（GameManager / 技能海克斯共用） ─────────────

export function spawnExplosion(player: any, x: number, y: number, dmg: number, radius: number, game: any): void {
    if (!game) return;
    game.particles.explode(x, y, '#ff6600', radius);
    game.audio?.playSfx?.('explode');
    game.screenShake.shake(6, 0.2);
    for (const e of game.enemies) {
        if (e.alive && Vec.dist(e.x, e.y, x, y) < radius) {
            e.takeDamage(dmg, player, game);
        }
    }
}

export function applyBurn(enemy: any, dps: number, duration: number): void {
    if (!enemy.alive) return;
    enemy.dots.push({ type: 'burn', dps, timeLeft: duration, color: '#ff6600' });
}

export function applyPoison(enemy: any, dps: number, duration: number): void {
    if (!enemy.alive) return;
    enemy.dots.push({ type: 'poison', dps, timeLeft: duration, color: '#44ff00' });
}

/** 乘区换档辅助：把 stats[key] 从 (1+旧档) 精确换到 (1+新档)。 */
function swapFactor(obj: any, key: string, fromVal: number, toVal: number): void {
    if (fromVal > 0) obj[key] /= (1 + fromVal);
    if (toVal > 0)   obj[key] *= (1 + toVal);
}

/** 平铺数值换档辅助：加减差值（from=0/to=0 均成立）。 */
function swapFlat(obj: any, key: string, fromVal: number, toVal: number): void {
    obj[key] = (obj[key] || 0) + (toVal - fromVal);
}

// ── 海克斯数据库（编号与数值逐条对应《海克斯.docx》） ──────
export const AUGMENT_DB: AugmentDef[] = [
    // ─── 功能性海克斯（银） ───────────────────────────────
    { id: 'hex01', index: 1, rarity: 'silver', icon: 'speed', name: '加速齿轮', category: '功能',
      prices: [15, 100, 500], values: [0.10, 0.20, 0.30],
      descAt: (l) => `攻速 +${[10, 20, 30][l - 1]}%`,
      onLevel(p, _g, from, to) { swapFactor(p.stats, 'attackSpeed', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0); } },

    { id: 'hex02', index: 2, rarity: 'silver', icon: 'pierce', name: '力量核心', category: '功能',
      prices: [16, 110, 520], values: [0.05, 0.10, 0.15],
      descAt: (l) => `攻击 +${[5, 10, 15][l - 1]}%`,
      onLevel(p, _g, from, to) { swapFactor(p.stats, 'damage', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0); } },

    { id: 'hex03', index: 3, rarity: 'silver', icon: 'heart', name: '生命涌泉', category: '功能',
      prices: [18, 120, 550], values: [0.10, 0.15, 0.30],
      descAt: (l) => `血量 +${[10, 15, 30][l - 1]}%`,
      onLevel(p, _g, from, to) {
          swapFactor(p.stats, 'maxHp', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          p.hp = Math.min(p.hp, p.stats.maxHp);
      } },

    { id: 'hex07', index: 7, rarity: 'silver', icon: 'crit', name: '精准仪轨', category: '功能',
      prices: [20, 130, 580], values: [0.05, 0.10, 0.20],
      descAt: (l) => `暴击几率 +${[5, 10, 20][l - 1]}%`,
      onLevel(p, _g, from, to) { swapFlat(p.stats, 'critRate', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0); } },

    { id: 'hex11', index: 11, rarity: 'silver', icon: 'pierce', name: '延展力场', category: '功能',
      prices: [25, 150, 620], values: [20, 30, 50],
      descAt: (l) => `攻击距离 +${[20, 30, 50][l - 1]} 码`,
      onLevel(p, _g, from, to) { swapFlat(p.stats, 'rangeBonus', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0); } },

    // ─── 技能海克斯（金） ─────────────────────────────────
    { id: 'hex04', index: 4, rarity: 'gold', icon: 'explosion', name: '裂变脉冲', category: '技能',
      prices: [30, 120, 500], values: [1, 2, 5],
      descAt: (l) => `每 3 秒在敌群中引爆 ${[1, 2, 5][l - 1]} 个半径 100 码的范围伤害（伤害=攻击力）`,
      _t: 3,
      onLevel(_p, _g, _from, to) { this._t = to ? 3 : 0; },
      onUpdate(p, dt, game) {
          if (!this._t) return;
          this._t -= dt;
          if (this._t > 0) return;
          this._t = 3;
          const alive = (game?.enemies || []).filter((e: any) => e.alive);
          if (!alive.length) { this._t = 0.5; return; }
          const n = this.values[(this.level ?? 1) - 1];
          const dmg = p.getDamage?.(game) ?? p.stats.damage;
          for (let i = 0; i < n; i++) {
              const target: any = Rng.pick(alive);
              spawnExplosion(p, target.x, target.y, dmg, 100, game);
          }
      } },

    { id: 'hex05', index: 5, rarity: 'gold', icon: 'bounce', name: '幻影特效', category: '技能',
      prices: [35, 150, 550], values: [1, 3, 5],
      descAt: (l) => `额外攻击特效 +${[1, 3, 5][l - 1]} 个（远程分裂子弹 / 近战多段伤害）`,
      onLevel(p, _g, from, to) {
          const d = (to ? this.values[to - 1] : 0) - (from ? this.values[from - 1] : 0);
          if (p._charDef?.attackType === 'melee') swapFlat(p.stats, 'meleeExtraHits', 0, d);
          else swapFlat(p.stats, 'extraBullets', 0, d);
      } },

    { id: 'hex06', index: 6, rarity: 'prismatic', icon: 'crit', name: '死神之瞳', category: '技能',
      prices: [50, 250, 650], values: [0.005, 0.01, 0.02],
      descAt: (l) => `${[0.5, 1, 2][l - 1]}% 概率发现弱点秒杀怪物，每击杀 +0.05%（上限 5%），对 Boss 转化为 300 点伤害`,
      _rate: 0.005,
      onLevel(_p, _g, _from, to) { this._rate = to ? this.values[to - 1] : 0; },
      onHit(p, enemy, _dmg, game) {
          if (!this._rate || !Rng.chance(this._rate)) return;
          if (enemy.isBoss) {
              enemy.takeDamage(300, p, game);
              game?.floatingText?.spawn?.(enemy.x, enemy.y - 30, '弱点·300', '#ff5ad8', 16, true);
          } else {
              enemy.takeDamage(1e9, p, game);
              game?.floatingText?.spawn?.(enemy.x, enemy.y - 30, '弱点·秒杀！', '#ff5ad8', 18, true);
          }
          game?.particles?.hexActivate?.(enemy.x, enemy.y, '#ff5ad8');
      },
      onKill() { this._rate = Math.min(0.05, this._rate + 0.0005); } },

    { id: 'hex08', index: 8, rarity: 'gold', icon: 'lightning', name: '弱点透视', category: '技能',
      prices: [40, 160, 600], values: [0.30, 0.40, 0.50],
      descAt: (l) => `${[30, 40, 50][l - 1]}% 概率发现怪物弱点，下一发攻击自动追踪并造成 3 倍暴击伤害`,
      onHit(p, enemy, _dmg, game) {
          if (p.stats.weakspotArmed || !Rng.chance(this.values[(this.level ?? 1) - 1])) return;
          p.stats.weakspotArmed = true;
          game?.floatingText?.spawn?.(enemy.x, enemy.y - 26, '弱点已标记！', '#ffe066', 15, true);
      } },

    { id: 'hex09', index: 9, rarity: 'gold', icon: 'shield', name: '破甲重铸', category: '技能',
      prices: [45, 140, 500], values: [0.5, 0.65, 0.8],
      descAt: (l) => `将当前全部护甲转化为攻击力（转化率 1:${[0.5, 0.65, 0.8][l - 1]}，已转化部分不随卖出退还）`,
      onLevel(p, _g, _from, to) {
          if (to === 0 || p.stats.armor <= 0) return;
          const bonus = Math.floor(p.stats.armor * this.values[to - 1]);
          p.stats.armor = 0;
          p.stats.damage += bonus;
      } },

    { id: 'hex10', index: 10, rarity: 'gold', icon: 'lightning', name: '制导蜂群', category: '技能',
      prices: [45, 180, 650], values: [1, 2, 5],
      descAt: (l) => `每 3 秒发射 ${[1, 2, 5][l - 1]} 枚 ${[10, 20, 50][l - 1]} 伤害的自动追踪导弹`,
      _t: 3,
      onLevel(_p, _g, _from, to) { this._t = to ? 3 : 0; },
      onUpdate(p, dt, game) {
          if (!this._t) return;
          this._t -= dt;
          if (this._t > 0) return;
          this._t = 3;
          const lvl = this.level ?? 1;
          const n = this.values[lvl - 1];
          const dmg = [10, 20, 50][lvl - 1];
          for (let i = 0; i < n; i++) {
              const a = Rng.float(0, Math.PI * 2);
              game?.bullets?.spawn?.({
                  x: p.x, y: p.y,
                  vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                  damage: dmg, radius: 6, color: '#ffd34d', owner: 'player',
                  charKey: p.charId ?? '', lifeTime: 4, homing: true,
              });
          }
          game?.audio?.playSfx?.('skill_e', 0.5);
      } },

    { id: 'hex12', index: 12, rarity: 'prismatic', icon: 'shield', name: '不灭协议', category: '技能',
      prices: [50, 250, 850], values: [1.5, 2, 2.5],
      descAt: (l) => `受到致命伤或只剩 1 滴血时，生成 ${[1.5, 2, 2.5][l - 1]} 倍最大生命的护盾 5 秒 + 25% 吸血 10 秒（冷却 75 秒）`,
      // 触发与 75 秒冷却都在 PlayerController.takeDamage/tick 内消费 stats.hasHexGuard。
      onLevel(p, _g, _from, to) {
          p.stats.hasHexGuard = to > 0;
          if (to > 0) p.stats._hexGuardShieldMult = this.values[to - 1];
      } },

    { id: 'hex13', index: 13, rarity: 'gold', icon: 'summon', name: '猎杀无人机', category: '技能',
      prices: [50, 210, 700], values: [30, 40, 50],
      descAt: (l) => `每 15 秒召唤攻击无人机（攻 ${[30, 40, 50][l - 1]} / 攻速 1.0 / 血 ${[25, 50, 75][l - 1]}），上限 3 架`,
      _t: 3,
      onLevel(_p, game, _from, to) { this._t = to ? 3 : 0; if (!to) game?.despawnHexDrones?.('attack'); },
      onUpdate(p, dt, game) {
          if (!this._t) return;
          this._t -= dt;
          if (this._t > 0) return;
          this._t = 15;
          game?.spawnHexDrone?.(p, 'attack', this.level ?? 1);
      } },

    { id: 'hex14', index: 14, rarity: 'gold', icon: 'summon', name: '支援无人机', category: '技能',
      prices: [48, 200, 680], values: [5, 10, 15],
      descAt: (l) => `每 15 秒召唤支援无人机（攻 ${[5, 10, 15][l - 1]} / 攻速 0.5 / 血 ${[50, 75, 125][l - 1]}），每 3 秒恢复主角 20% 已损失生命，上限 2 架`,
      _t: 3,
      onLevel(_p, game, _from, to) { this._t = to ? 3 : 0; if (!to) game?.despawnHexDrones?.('support'); },
      onUpdate(p, dt, game) {
          if (!this._t) return;
          this._t -= dt;
          if (this._t > 0) return;
          this._t = 15;
          game?.spawnHexDrone?.(p, 'support', this.level ?? 1);
      } },

    // ─── 一次性海克斯 ─────────────────────────────────────
    { id: 'hex15', index: 15, rarity: 'prismatic', icon: 'gold', name: '进阶蓝图', category: '一次性',
      prices: [500], values: [1], oneShot: true,
      descAt: () => '下一个获得的海克斯强化提升一个等级（最高 Lv.3）',
      onLevel(_p, game) { const am = game?.augmentManager; if (am) am.nextLevelBonus = (am.nextLevelBonus || 0) + 1; } },

    { id: 'hex16', index: 16, rarity: 'silver', icon: 'gold', name: '点金手', category: '一次性',
      prices: [40, 200, 800], values: [0.5, 1, 1.5],
      descAt: (l) => `获得的金币增加 ${[0.5, 1, 1.5][l - 1]} 倍`,
      onLevel(_p, game, from, to) {
          const eco = game?.economy;
          if (!eco) return;
          swapFactor(eco, 'gainMult', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
      } },

    { id: 'hex17', index: 17, rarity: 'silver', icon: 'gold', name: '战争红利', category: '一次性',
      prices: [35, 180, 750], values: [500, 1000, 2000], oneShot: true,
      descAt: (l) => `立刻获得 ${[500, 1000, 2000][l - 1]} 金币`,
      onLevel(_p, game, _from, to) { game?.economy?.addGold(this.values[to - 1]); } },

    { id: 'hex18', index: 18, rarity: 'silver', icon: 'heart', name: '应急壁垒', category: '一次性',
      prices: [35], values: [50],
      descAt: () => '得到 50 点护盾，护盾被打破后 5 秒内每秒回复 10 点生命',
      _hadShield: false, _regenT: 0,
      onLevel(p, game, _from, to) {
          if (to > 0) { p.grantTempShield?.(50, 9999, game); this._hadShield = p.shield > 0; this._regenT = 0; }
      },
      onUpdate(p, dt) {
          const has = p.shield > 0;
          if (this._hadShield && !has) {
              // 护盾刚被打破：启动 5 秒 × 10/秒 回血（只触发一次）
              this._hadShield = false;
              this._regenT = 5;
          }
          if (this._regenT > 0) {
              this._regenT -= dt;
              p.heal(10 * dt, false);
          }
      } },
];

/** 按文档编号取海克斯定义。 */
export function getHexByIndex(index: number): AugmentDef | undefined {
    return AUGMENT_DB.find(a => a.index === index);
}
