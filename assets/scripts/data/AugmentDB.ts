// ============================================================
//  AugmentDB.ts — 海克斯强化定义（纯数据层）
// ============================================================
// 2026-09-14 按用户《海克斯.docx》全量重做：旧 50 词条整体废弃，
// 换成 18 个海克斯（功能性 5 / 技能性 9 / 一次性 4），每个海克斯的
// 三档数值直接对应 Lv.1/2/3（"同步不同数值生成不同等级的强化"）。
// 2026-09-19 追加元素体系：hex19 元素暴击（单档彩，集齐四元素解锁）+
// hex20~23 风/火/土/水四元素海克斯（暴击触发元素飞弹齐射 + 元素爆炸）。
// 稀有度与定价按文档：银 15-50 / 金 100-250 / 彩 500-1000，
// 购买后同稀有度溢价 10%（彩 100%），卖出回收购买价 75%（见
// AugmentManager / AugSelectUI / GameManager 的商店接线）。
// 2026-09-21 玩家调整：功能性海克斯数值改为小步叠加档
// （攻速/攻击/暴击 1%/2%/5%，血量 1%/5%/10%，射程 +10/15/30 码），
// 定价随之下调（银 10-18 / 金 40-60 / 彩 150-220），不再受文档区间约束。
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
    /** 攻击发生暴击时触发（普攻/子弹暴击结算后分发；海克斯19 元素暴击）。 */
    onCrit?:   (p: any, enemy: any, dmg: number, game: any) => void;
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
        if (e.alive && Vec.dist(e.x, e.y, x, y) < radius
            && game.arenaLineClear?.(x, y, e.x, e.y) !== false) {
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

// ── 元素暴击（海克斯19）四元素体系 ────────────────────────

/** 水/火/土/风四元素定义（名字与配色供飞弹/爆炸表现用）。 */
export const ELEMENT_TYPES = {
    water: { name: '水', color: '#4db8ff' },
    fire:  { name: '火', color: '#ff6a3d' },
    earth: { name: '土', color: '#d2a24c' },
    wind:  { name: '风', color: '#9fe8c8' },
};
export type ElementType = keyof typeof ELEMENT_TYPES;
const ELEMENT_KEYS: ElementType[] = ['water', 'fire', 'earth', 'wind'];

/**
 * 元素飞弹命中：给目标打元素印记；目标集齐 ≥2 种不同元素时立即产生元素爆炸，
 * 爆炸伤害 = 单枚飞弹伤害 × 2^(元素种数-1)（两种×2 / 三种×4 / 四种×8），
 * 对半径 90 码内全部敌人生效，爆炸后印记清空、可重新累积。
 *
 * 表现层为卡顿做的收敛（10-20 枚齐射落地会连续引爆）：
 *  · 印记反馈用 3 粒微型火花，不再逐次弹"水/火/土/风"浮字（一轮齐射就是
 *    10-20 条 Label，浮字池和渲染都吃不消）；
 *  · 爆炸用轻量 emit 粒子（无 fx 贴图、无冲击波环对象），并按 0.12 秒窗口
 *    节流震屏/音效/浮字——连爆时只有首次出全套反馈，伤害照常全额结算。
 */
export function applyElementMark(enemy: any, element: ElementType, missileDmg: number, player: any, game: any): void {
    if (!enemy || !enemy.alive) return;
    const color = ELEMENT_TYPES[element].color;
    if (!enemy._elemMarks) enemy._elemMarks = new Set<string>();
    enemy._elemMarks.add(element);
    if (enemy._elemMarks.size < 2) {
        game?.particles?.emit?.({ x: enemy.x, y: enemy.y, count: 3, color,
            speedMin: 40, speedMax: 140, lifeMin: 0.15, lifeMax: 0.3, glow: true });
        return;
    }
    const kinds = enemy._elemMarks.size;
    enemy._elemMarks.clear();
    const boom = Math.round(missileDmg * Math.pow(2, kinds - 1));
    // 轻量元素爆花：粒子迸发（伤害半径不变，视觉主体控制在半径 90 内）
    game?.particles?.emit?.({ x: enemy.x, y: enemy.y, count: 14, color,
        speedMin: 80, speedMax: 300, lifeMin: 0.25, lifeMax: 0.5, glow: true });
    if (((game as any)?._elemFxT ?? 0) <= 0) {
        (game as any)._elemFxT = 0.12;   // 连爆节流窗口：震屏/音效/浮字只出一次
        game?.screenShake?.shake?.(3, 0.15);
        game?.audio?.playSfx?.('explode', 0.5);
        game?.floatingText?.spawn?.(enemy.x, enemy.y - 40, `元素爆炸 ×${kinds - 1}！`, color, 17, true);
    }
    for (const e of (game?.enemies || []) as any[]) {
        if (e.alive && Vec.dist(e.x, e.y, enemy.x, enemy.y) < 90) {
            e.takeDamage(boom, player, game);
        }
    }
}

/** 元素暴击齐射区间（单档彩色海克斯：10-20 枚 / 单枚 15-20 伤害）。 */
const ELEMENT_VOLLEY: { count: [number, number]; dmg: [number, number] } = {
    count: [10, 20], dmg: [15, 20],
};

/** 四元素海克斯 id（集齐后才解锁元素暴击的购买条件）。 */
export const ELEMENT_HEX_IDS = ['hex20', 'hex21', 'hex22', 'hex23'];

/**
 * 元素暴击齐射：先锁定目标、再发射。
 * 锁定规则（用户设计）：
 *  · 飞弹数 ≥ 目标数：鸽笼分配——每个目标必被锁定一枚（20 枚 19 目标时必
 *    有目标吃 2 枚），剩余飞弹随机散锁；
 *  · 飞弹数 < 目标数：整轮以 p 概率"多枚飞弹锁定同一目标"（随机 2~N 枚
 *    集中给一个随机目标，其余分散到不同目标）；p = 目标>20 ? 15% : 20%。
 * 每枚飞弹随机携带 水/火/土/风 之一，单枚伤害区间随机。
 */
export function fireElementalVolley(hex: any, p: any, game: any): void {
    void hex;
    const band = ELEMENT_VOLLEY;
    // 隐身/飞空的隐藏单位无敌，不参与锁定（避免整轮飞弹浪费在免疫目标上）
    const targets = ((game?.enemies || []) as any[]).filter(e =>
        e.alive && !e.dead && !e.invisible && !((e.mechSkyT ?? 0) > 0));
    if (!targets.length || !game?.bullets?.spawn) return;
    const N = Rng.int(band.count[0], band.count[1]);

    // —— 先锁定：无放回抽取，保证分散时目标不重复 ——
    const pickFrom = (pool: any[]) => pool.splice(Rng.int(0, pool.length - 1), 1)[0];
    const locks: any[] = [];
    if (N >= targets.length) {
        const pool = [...targets];
        for (let i = 0; i < Math.min(N, targets.length); i++) locks.push(pickFrom(pool));
        while (locks.length < N) locks.push(Rng.pick(targets));
    } else if (Rng.chance(targets.length > 20 ? 0.15 : 0.20)) {
        const focus = Rng.pick(targets);
        const k = Rng.int(2, N);
        for (let i = 0; i < k; i++) locks.push(focus);
        const rest = targets.filter(t => t !== focus);
        while (locks.length < N && rest.length) locks.push(pickFrom(rest));
    } else {
        const pool = [...targets];
        while (locks.length < N) locks.push(pickFrom(pool));
    }

    // —— 再发射：飞弹不带角色弹素材（charKey 留空），渲染走"元素色能量梭"
    // 兜底路径（带拖尾/辉光的粒子风弹体），比逐弹挂 Sprite 更省 ——
    for (const target of locks) {
        const element = ELEMENT_KEYS[Rng.int(0, ELEMENT_KEYS.length - 1)];
        const a = Rng.float(0, Math.PI * 2);
        game.bullets.spawn({
            x: p.x, y: p.y,
            vx: Math.cos(a) * 400, vy: Math.sin(a) * 400,
            damage: Rng.int(band.dmg[0], band.dmg[1]),
            radius: 7, color: ELEMENT_TYPES[element].color,
            owner: 'player',
            lifeTime: 2.5, homing: true,
            _homingTarget: target, element,
        });
    }
    // 齐射起手粒子迸发（轻量 emit，不用重型 hexActivate）
    game.particles?.emit?.({ x: p.x, y: p.y, count: 10, color: '#9fe8c8',
        speedMin: 120, speedMax: 320, lifeMin: 0.2, lifeMax: 0.4, glow: true });
    game.audio?.playSfx?.('skill_q', 0.5);
    game.floatingText?.spawn?.(p.x, p.y - 46, `元素暴击 ×${N}`, '#9fe8c8', 14, true);
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
    // 2026-09-21 玩家调整：数值全部改为小步叠加档（可无限叠购），
    // 攻速/攻击/暴击 1%/2%/5%，血量 1%/5%/10%，射程 +10/15/30 码。
    { id: 'hex01', index: 1, rarity: 'silver', icon: 'hex01', name: '加速齿轮', category: '功能',
      prices: [10, 40, 150], values: [0.01, 0.02, 0.05],
      descAt: (l) => `攻速 +${[1, 2, 5][l - 1]}%`,
      onLevel(p, _g, from, to) { swapFactor(p.stats, 'attackSpeed', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0); } },

    { id: 'hex02', index: 2, rarity: 'silver', icon: 'hex02', name: '力量核心', category: '功能',
      prices: [12, 45, 160], values: [0.01, 0.02, 0.05],
      descAt: (l) => `攻击 +${[1, 2, 5][l - 1]}%`,
      onLevel(p, _g, from, to) { swapFactor(p.stats, 'damage', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0); } },

    { id: 'hex03', index: 3, rarity: 'silver', icon: 'hex03', name: '生命涌泉', category: '功能',
      prices: [15, 50, 180], values: [0.01, 0.05, 0.10],
      descAt: (l) => `血量 +${[1, 5, 10][l - 1]}%`,
      onLevel(p, _g, from, to) {
          swapFactor(p.stats, 'maxHp', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          p.hp = Math.min(p.hp, p.stats.maxHp);
      } },

    { id: 'hex07', index: 7, rarity: 'silver', icon: 'hex07', name: '精准仪轨', category: '功能',
      prices: [15, 55, 200], values: [0.01, 0.02, 0.05],
      descAt: (l) => `暴击几率 +${[1, 2, 5][l - 1]}%`,
      onLevel(p, _g, from, to) { swapFlat(p.stats, 'critRate', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0); } },

    { id: 'hex11', index: 11, rarity: 'silver', icon: 'hex11', name: '延展力场', category: '功能',
      prices: [18, 60, 220], values: [10, 15, 30],
      descAt: (l) => `攻击距离 +${[10, 15, 30][l - 1]} 码`,
      onLevel(p, _g, from, to) { swapFlat(p.stats, 'rangeBonus', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0); } },

    // ─── 技能海克斯（金） ─────────────────────────────────
    { id: 'hex04', index: 4, rarity: 'gold', icon: 'hex04', name: '裂变脉冲', category: '技能',
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

    { id: 'hex05', index: 5, rarity: 'gold', icon: 'hex05', name: '幻影特效', category: '技能',
      prices: [35, 150, 550], values: [1, 3, 5],
      descAt: (l) => `额外攻击特效 +${[1, 3, 5][l - 1]} 个（远程分裂子弹 / 近战多段伤害）`,
      onLevel(p, _g, from, to) {
          const d = (to ? this.values[to - 1] : 0) - (from ? this.values[from - 1] : 0);
          if (p._charDef?.attackType === 'melee') swapFlat(p.stats, 'meleeExtraHits', 0, d);
          else swapFlat(p.stats, 'extraBullets', 0, d);
      } },

    { id: 'hex06', index: 6, rarity: 'prismatic', icon: 'hex06', name: '死神之瞳', category: '技能',
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

    { id: 'hex08', index: 8, rarity: 'gold', icon: 'hex08', name: '弱点透视', category: '技能',
      prices: [40, 160, 600], values: [0.30, 0.40, 0.50],
      descAt: (l) => `${[30, 40, 50][l - 1]}% 概率发现怪物弱点，下一发攻击自动追踪并造成 3 倍暴击伤害`,
      onHit(p, enemy, _dmg, game) {
          if (p.stats.weakspotArmed || !Rng.chance(this.values[(this.level ?? 1) - 1])) return;
          p.stats.weakspotArmed = true;
          game?.floatingText?.spawn?.(enemy.x, enemy.y - 26, '弱点已标记！', '#ffe066', 15, true);
      } },

    { id: 'hex09', index: 9, rarity: 'gold', icon: 'hex09', name: '破甲重铸', category: '技能',
      prices: [45, 140, 500], values: [0.5, 0.65, 0.8],
      descAt: (l) => `将当前全部护甲转化为攻击力（转化率 1:${[0.5, 0.65, 0.8][l - 1]}，已转化部分不随卖出退还）`,
      onLevel(p, _g, _from, to) {
          if (to === 0 || p.stats.armor <= 0) return;
          const bonus = Math.floor(p.stats.armor * this.values[to - 1]);
          p.stats.armor = 0;
          p.stats.damage += bonus;
      } },

    { id: 'hex10', index: 10, rarity: 'gold', icon: 'hex10', name: '制导蜂群', category: '技能',
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

    { id: 'hex12', index: 12, rarity: 'prismatic', icon: 'hex12', name: '不灭协议', category: '技能',
      prices: [50, 250, 850], values: [1.5, 2, 2.5],
      descAt: (l) => `受到致命伤或只剩 1 滴血时，生成 ${[1.5, 2, 2.5][l - 1]} 倍最大生命的护盾 5 秒 + 25% 吸血 10 秒（冷却 75 秒）`,
      // 触发与 75 秒冷却都在 PlayerController.takeDamage/tick 内消费 stats.hasHexGuard。
      onLevel(p, _g, _from, to) {
          p.stats.hasHexGuard = to > 0;
          if (to > 0) p.stats._hexGuardShieldMult = this.values[to - 1];
      } },

    { id: 'hex13', index: 13, rarity: 'gold', icon: 'hex13', name: '猎杀无人机', category: '技能',
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

    { id: 'hex14', index: 14, rarity: 'gold', icon: 'hex14', name: '支援无人机', category: '技能',
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
    { id: 'hex15', index: 15, rarity: 'prismatic', icon: 'hex15', name: '进阶蓝图', category: '一次性',
      prices: [500], values: [1], oneShot: true,
      descAt: () => '下一个获得的海克斯强化提升一个等级（最高 Lv.3）',
      onLevel(_p, game) { const am = game?.augmentManager; if (am) am.nextLevelBonus = (am.nextLevelBonus || 0) + 1; } },

    { id: 'hex16', index: 16, rarity: 'silver', icon: 'hex16', name: '点金手', category: '一次性',
      prices: [40, 200, 800], values: [0.25, 0.5, 1.0],
      descAt: (l) => `获得的金币增加 ${[0.25, 0.5, 1.0][l - 1] * 100}%`,
      onLevel(_p, game, from, to) {
          const eco = game?.economy;
          if (!eco) return;
          swapFactor(eco, 'gainMult', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
      } },

    { id: 'hex17', index: 17, rarity: 'silver', icon: 'hex17', name: '战争红利', category: '一次性',
      // v4 9.6 重标定：原 500/1000/2000（花 750 回 2000 净赚再造一局，最大
      // 印钞单点）→ 80/250/900，变"应急取款"，净赚 45~150。
      prices: [35, 180, 750], values: [80, 250, 900], oneShot: true,
      descAt: (l) => `立刻获得 ${[80, 250, 900][l - 1]} 金币`,
      onLevel(_p, game, _from, to) { game?.economy?.addGold(this.values[to - 1]); } },

    { id: 'hex18', index: 18, rarity: 'silver', icon: 'hex18', name: '应急壁垒', category: '一次性',
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

    // ─── 元素暴击 + 四元素海克斯（2026-09-19 用户设计稿） ───
    // 元素暴击为单档彩色海克斯：只有集齐 风/火/土/水 四种元素海克斯后
    // 才会解锁购买条件（AugmentManager.rollOptions / equip 校验）。
    { id: 'hex19', index: 19, rarity: 'prismatic', icon: 'hex19', name: '元素暴击', category: '技能',
      prices: [900], values: [1],
      descAt: () => `攻击暴击时发射 ${ELEMENT_VOLLEY.count[0]}-${ELEMENT_VOLLEY.count[1]} 枚元素飞弹` +
          `（水/火/土/风随机，单枚 ${ELEMENT_VOLLEY.dmg[0]}-${ELEMENT_VOLLEY.dmg[1]} 伤害，先锁定目标再发射，内置 0.5 秒冷却）；` +
          `同一目标集齐 2 种元素即产生元素爆炸，每多一种元素伤害翻倍。需先集齐四种元素海克斯`,
      // 齐射内置冷却：高攻速/多段技能（如 30 发炮弹的大招）逐发暴击时，
      // 不至于一帧内叠出几十轮齐射把弹池和粒子打爆
      _volleyCd: 0,
      onCrit(p, _enemy, _dmg, game) {
          if (this._volleyCd > 0) return;
          this._volleyCd = 0.5;
          fireElementalVolley(this, p, game);
      },
      onUpdate(_p, dt) { if (this._volleyCd > 0) this._volleyCd = Math.max(0, this._volleyCd - dt); } },

    // ─── 四元素海克斯（集齐解锁元素暴击） ──────────────────
    { id: 'hex20', index: 20, rarity: 'silver', icon: 'hex20', name: '风元素', category: '技能',
      prices: [50, 230, 880], values: [0.10, 0.15, 0.20],
      descAt: (l) => `远程：子弹飞行速度 +${[10, 15, 20][l - 1]}%；近战：攻击伤害 +${[5, 8, 10][l - 1]}%`,
      onLevel(p, _g, from, to) {
          if (p._charDef?.attackType === 'melee') {
              swapFactor(p.stats, 'damage', from ? this.values[from - 1] * 0.5 : 0, to ? this.values[to - 1] * 0.5 : 0);
          } else {
              swapFlat(p.stats, 'bulletSpeedMult', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          }
      } },

    { id: 'hex21', index: 21, rarity: 'silver', icon: 'hex21', name: '火元素', category: '技能',
      prices: [50, 230, 880], values: [0.05, 0.06, 0.07],
      descAt: (l) => `攻击附加灼烧：每秒造成怪物当前生命值 ${[5, 6, 7][l - 1]}% 的伤害（持续 1.5 秒，命中刷新）`,
      onHit(_p, enemy, _dmg, _game) {
          if (!enemy?.alive) return;
          const pct = this.values[(this.level ?? 1) - 1];
          const dps = enemy.hp * pct;
          const dots = enemy.dots || (enemy.dots = []);
          // 命中刷新而非叠层：高频攻击下按当前血量重算灼烧，不无限叠 DoT
          const existing = dots.find(d => d.type === 'hex_fire');
          if (existing) { existing.dps = dps; existing.timeLeft = 1.5; }
          else dots.push({ type: 'hex_fire', dps, timeLeft: 1.5, color: '#ff6a3d' });
      } },

    { id: 'hex22', index: 22, rarity: 'silver', icon: 'hex22', name: '土元素', category: '技能',
      prices: [50, 230, 880], values: [1, 2, 3],
      descAt: (l) => `远程：攻击可以穿刺（+${[1, 2, 3][l - 1]} 个目标）；近战：攻击范围 +${[20, 25, 30][l - 1]}%`,
      onLevel(p, _g, from, to) {
          if (p._charDef?.attackType === 'melee') {
              const meleeRange = p._charDef.attackRange ?? 90;
              const pct = [0.20, 0.25, 0.30];
              swapFlat(p.stats, 'rangeBonus',
                  from ? meleeRange * pct[from - 1] : 0, to ? meleeRange * pct[to - 1] : 0);
          } else {
              swapFlat(p.stats, 'pierce', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          }
      } },

    { id: 'hex23', index: 23, rarity: 'silver', icon: 'hex23', name: '水元素', category: '技能',
      prices: [50, 230, 880], values: [0.20, 0.25, 0.30],
      descAt: (l) => `攻击附加减速：命中使敌人移速 -${[20, 25, 30][l - 1]}%，持续 2 秒（重复命中刷新）`,
      onHit(_p, enemy, _dmg, _game) {
          if (!enemy?.alive) return;
          const pct = this.values[(this.level ?? 1) - 1];
          // 与冰冻/其他减速共存：只在没有更强减速时覆盖，_slowTimer 到期自动恢复
          enemy.slowMult = Math.min(enemy.slowMult ?? 1, 1 - pct);
          enemy._slowTimer = Math.max(enemy._slowTimer ?? 0, 2);
      } },

    // ─── 自定义强化包（2026-09-21 用户设计稿，单档） ─────────
    { id: 'hex24', index: 24, rarity: 'gold', icon: 'hex24', name: '闪电网链', category: '技能',
      prices: [120], values: [1],
      descAt: () => '攻击命中时连接附近 4-5 个敌人，各受本次伤害 50% 的额外闪电伤害',
      onHit(p, enemy, dmg, game) {
          if (!enemy?.alive || dmg <= 0) return;
          // 闪电链以被命中者为锚点：附近(220码)随机连 4-5 个，直接 takeDamage
          // 结算（不走 dispatchHit，避免链式再触发 onHit 无限循环）
          const near = ((game?.enemies || []) as any[]).filter(e =>
              e.alive && !e.dead && !e.invisible && e !== enemy
              && !((e.mechSkyT ?? 0) > 0)
              && Vec.dist(e.x, e.y, enemy.x, enemy.y) <= 220);
          if (!near.length) return;
          const n = Math.min(near.length, Rng.int(4, 5));
          const chainDmg = dmg * 0.5;
          for (let i = 0; i < n; i++) {
              const t = near.splice(Rng.int(0, near.length - 1), 1)[0];
              t.takeDamage(chainDmg, p, game);
              game?.particles?.lightning?.(enemy.x, enemy.y, t.x, t.y, '#9fe8ff');
          }
          game?.audio?.playSfx?.('skill_e', 0.35);
      } },

    { id: 'hex25', index: 25, rarity: 'gold', icon: 'hex25', name: '天雷', category: '技能',
      prices: [110], values: [1],
      descAt: () => '每 5 秒降下天雷，对雷击点 150 码圆形区域造成 80 点伤害',
      _t: 5,
      onLevel(_p, _g, _from, to) { this._t = to ? 5 : 0; },
      onUpdate(p, dt, game) {
          if (!this._t) return;
          this._t -= dt;
          if (this._t > 0) return;
          this._t = 5;
          const alive = (game?.enemies || []).filter((e: any) => e.alive && !e.dead);
          if (!alive.length) { this._t = 0.5; return; }
          const target: any = Rng.pick(alive);
          game?.particles?.lightning?.(target.x, target.y - 320, target.x, target.y, '#9fe8ff');
          spawnExplosion(p, target.x, target.y, 80, 150, game);
          game?.floatingText?.spawn?.(target.x, target.y - 46, '天雷！', '#9fe8ff', 16, true);
      } },

    { id: 'hex26', index: 26, rarity: 'prismatic', icon: 'hex26', name: '化气为剑', category: '技能',
      prices: [600], values: [1],
      descAt: () => '无法进行普攻；攻速按 1:0.75 转化为攻击力，并召唤 攻击力/10（四舍五入）把飞剑环绕自身，每把飞剑命中造成 1.5 倍攻击力伤害',
      onLevel(p, game, _from, to) {
          p.stats.swordMode = to > 0;
          if (to > 0) game?.spawnQiSwords?.(p);
          else game?.despawnQiSwords?.();
      } },

    { id: 'hex27', index: 27, rarity: 'gold', icon: 'hex27', name: '实习刺客', category: '技能',
      prices: [150], values: [1],
      descAt: () => '每 15 秒进入 2 秒不可选中的隐身状态，隐身期间的下一次攻击造成 200% 伤害',
      _t: 15,
      onLevel(_p, _g, _from, to) { this._t = to ? 15 : 0; },
      onUpdate(p, dt, game) {
          if (!this._t) return;
          this._t -= dt;
          if (this._t > 0) return;
          this._t = 15;
          p.applyBuff?.('intern_stealth', 2, { invincible: true });
          p.stats.assassinStrike = true;
          game?.floatingText?.spawn?.(p.x, p.y - 50, '隐身！下次攻击×2', '#7dff9e', 15, true);
          game?.particles?.hexActivate?.(p.x, p.y, '#7dff9e');
      } },

    { id: 'hex28', index: 28, rarity: 'prismatic', icon: 'hex28', name: 'boss精英', category: '技能',
      prices: [550], values: [1],
      descAt: () => '对精英（首领）与 Boss 增伤 150%；装备时立即削减当前 Boss 10% 生命上限，之后 Boss 入场时生命上限 -10%',
      onLevel(p, game, from, to) {
          swapFlat(p.stats, 'eliteBonus', from ? 1.5 : 0, to ? 1.5 : 0);
          if (to > 0) game?.cutBossHp?.(0.10, p);
      } },

    { id: 'hex29', index: 29, rarity: 'prismatic', icon: 'hex29', name: '再来一次（强化版）', category: '一次性',
      prices: [500], values: [1],
      descAt: () => '接下来每次遇到强化选择，都可免费刷新 5 次',
      onLevel(_p, game, _from, to) {
          const am = game?.augmentManager;
          if (!am) return;
          if (to > 0) am.freeRefreshes = Math.max(am.freeRefreshes || 0, 5);
          else am.freeRefreshes = 0;
      } },

    { id: 'hex30', index: 30, rarity: 'silver', icon: 'hex30', name: '合理避税', category: '一次性',
      prices: [40], values: [1],
      descAt: () => '强化选择页的刷新费用减少 50%',
      onLevel(_p, game, _from, to) {
          const am = game?.augmentManager;
          if (am) am.refreshCostMult = to > 0 ? 0.5 : 1;
      } },

    { id: 'hex31', index: 31, rarity: 'gold', icon: 'hex31', name: '加速', category: '一次性',
      prices: [160], values: [1],
      descAt: () => '所有技能与强化的冷却时间缩减 20%',
      onLevel(p, _g, from, to) { swapFlat(p.stats, 'cdReduction', from ? 0.2 : 0, to ? 0.2 : 0); } },

    { id: 'hex32', index: 32, rarity: 'gold', icon: 'hex32', name: '保命分身', category: '技能',
      prices: [140], values: [1],
      descAt: () => '血量低于 10% 时，在离玩家最远处生成分身吸引怪物仇恨（持续 6 秒，内置 30 秒冷却）',
      _cloneCd: 0,
      onLevel(_p, game, _from, to) { this._cloneCd = 0; if (!to) game?.despawnLifeClone?.(); },
      onUpdate(p, dt, game) {
          this._cloneCd = Math.max(0, (this._cloneCd || 0) - dt);
          if (this._cloneCd > 0) return;
          const maxHp = p.stats?.maxHp ?? 0;
          if (maxHp <= 0 || p.hp / maxHp >= 0.10) return;
          this._cloneCd = 30;
          game?.spawnLifeClone?.(p);
      } },
];

/** 按文档编号取海克斯定义。 */
export function getHexByIndex(index: number): AugmentDef | undefined {
    return AUGMENT_DB.find(a => a.index === index);
}
