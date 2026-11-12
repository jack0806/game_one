// ============================================================
//  AugmentDB.ts — 海克斯强化定义（纯数据层）
// ============================================================
// 2026-09-14 按用户《海克斯.docx》全量重做：旧 50 词条整体废弃，
// 换成 18 个海克斯（功能性 5 / 技能性 9 / 一次性 4），每个海克斯的
// 三档数值直接对应 Lv.1/2/3（"同步不同数值生成不同等级的强化"）。
// 2026-09-19 追加元素体系：hex19 元素暴击（单档彩，集齐四元素解锁）+
// hex20~23 风/火/土/水四元素海克斯（暴击触发元素飞弹齐射 + 元素爆炸）。
// 2026-11-12 元素暴击改版：暴击齐射移除，元素海克斯命中直接打印记，
// 目标身上带有 2 种不同元素印记即引发元素爆炸（见 applyElementMark）。
// 稀有度与定价按文档：银 15-50 / 金 100-250 / 彩 500-1000，
// 购买后同稀有度溢价 10%（彩 100%），卖出回收购买价 75%（见
// AugmentManager / AugSelectUI / GameManager 的商店接线）。
// 2026-09-21 玩家调整：功能性海克斯数值改为小步叠加档
// （攻速/攻击/暴击 1%/2%/5%，血量 1%/5%/10%，射程 +10/15/30 码），
// 定价随之下调（银 10-18 / 金 40-60 / 彩 150-220），不再受文档区间约束。
import { Rng, Vec, clamp } from '../core/MathUtils';
import { CANVAS_W, PLAYFIELD_BOTTOM } from '../core/Constants';
import { GameConfig } from './GameConfig';

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
    /**
     * 波间强化选择页打开时触发（方案 D 特权：生命涌泉 Lv2「涌泉活水」；
     * GameManager._openAugSelect → AugmentManager.dispatchShopOpen）。
     */
    onShopOpen?: (p: any, game: any) => void;
    /**
     * 玩家被实际命中时触发（PlayerController.takeDamage/takeTrueDamage 在
     * 无敌/无敌帧早退之后分发；护盾抵挡亦算；DoT 持续伤害不算——无法躲避
     * 的伤害不应喂给受击流海克斯。海克斯33 荆棘甲壳 / 34 风行节奏）。
     */
    onPlayerHit?: (p: any, game: any) => void;
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
    const explode = () => {
        game.particles.explode(x, y, '#ff6600', radius);
        game.audio?.playSfx?.('explode');
        game.screenShake.shake(6, 0.2);
        for (const e of game.enemies) {
            if (e.alive && Vec.dist(e.x, e.y, x, y) < radius
                && game.arenaLineClear?.(x, y, e.x, e.y) !== false) {
                e.takeDamage(dmg, player, game);
            }
        }
    };
    // 每次调用都建立独立爆点，死亡连锁不能冒充同一次爆炸。
    if (game.achievementTracker?.active) game.achievementTracker.scope('explosion', '', explode);
    else explode();
}

export function applyBurn(enemy: any, dps: number, duration: number): void {
    if (!enemy.alive) return;
    enemy.dots.push({ type: 'burn', dps, timeLeft: duration, color: '#ff6600' });
}

export function applyPoison(enemy: any, dps: number, duration: number): void {
    if (!enemy.alive) return;
    enemy.dots.push({ type: 'poison', dps, timeLeft: duration, color: '#44ff00' });
}

// ── 元素暴击（海克斯19）八元素体系（2026-11-09 扩展：雷/冰/光/暗加入） ────

/** 八元素定义（名字与配色供飞弹/爆炸/粒子表现用——每种元素粒子颜色不同）。 */
export const ELEMENT_TYPES = {
    water:  { name: '水', color: '#4db8ff' },
    fire:   { name: '火', color: '#ff6a3d' },
    earth:  { name: '土', color: '#d2a24c' },
    wind:   { name: '风', color: '#9fe8c8' },
    thunder:{ name: '雷', color: '#f5e36b' },
    frost:  { name: '冰', color: '#a8ecff' },
    light:  { name: '光', color: '#fff3b0' },
    shadow: { name: '暗', color: '#9c7bff' },
};
export type ElementType = keyof typeof ELEMENT_TYPES;
const ELEMENT_KEYS: ElementType[] = ['water', 'fire', 'earth', 'wind', 'thunder', 'frost', 'light', 'shadow'];

/** 元素海克斯 id → 元素类型（元素暴击飞弹池按玩家持有的元素卡取元素）。 */
export const ELEMENT_OF_HEX: Record<string, ElementType> = {
    hex20: 'wind', hex21: 'fire', hex22: 'earth', hex23: 'water',
    hex35: 'thunder', hex36: 'frost', hex37: 'light', hex38: 'shadow',
};

/**
 * 元素飞弹/元素海克斯命中：给目标打元素印记；目标集齐 ≥2 种不同元素时立即产生
 * 元素爆炸（2026-11-12 改版：印记不再只来自暴击齐射飞弹，元素海克斯的命中
 * 效果同样打印记——持有 hex19 元素暴击时，目标身上带有不同元素伤害即引爆）。
 * 爆炸伤害 = 触发命中的伤害 × 2^(元素种数-1)（种数封顶 4，至多×8），
 * 对半径 90 码内全部敌人生效，爆炸后印记清空、可重新累积。
 *
 * sideEffect=false 供元素海克斯自身调用：元素附带效果（减速/灼烧等）由
 * 各卡 onHit 自己结算，这里只打印记，避免效果重复。
 *
 * 表现层为卡顿做的收敛（高频命中连续引爆）：
 *  · 印记反馈用 3 粒微型火花，不再逐次弹"水/火/土/风"浮字（一轮齐射就是
 *    10-20 条 Label，浮字池和渲染都吃不消）；
 *  · 爆炸用轻量 emit 粒子（无 fx 贴图、无冲击波环对象），并按 0.12 秒窗口
 *    节流震屏/音效/浮字——连爆时只有首次出全套反馈，伤害照常全额结算；
 *  · 爆炸本体 0.5 秒节流（写入 player.stats._elemBlastCd，hex19 onUpdate
 *    递减）：高攻速下元素海克斯每次命中都打印记，不逐击引爆；节流窗口内
 *    印记继续累积，窗口过后下一枚印记按累积种数引爆。
 */
export function applyElementMark(enemy: any, element: ElementType, missileDmg: number, player: any, game: any,
        sideEffect = true): void {
    if (!enemy || !enemy.alive) return;
    const color = ELEMENT_TYPES[element].color;
    if (sideEffect) applyElementSideEffect(enemy, element, missileDmg, player, game);
    if (!enemy._elemMarks) enemy._elemMarks = new Set<string>();
    enemy._elemMarks.add(element);
    if (enemy._elemMarks.size < 2) {
        game?.particles?.emit?.({ x: enemy.x, y: enemy.y, count: 3, color,
            speedMin: 40, speedMax: 140, lifeMin: 0.15, lifeMax: 0.3, glow: true });
        return;
    }
    const pst = player?.stats;
    if ((pst?._elemBlastCd ?? 0) > 0) return;
    if (pst) pst._elemBlastCd = 0.5;
    const kinds = Math.min(enemy._elemMarks.size, 4);
    game?.achievementTracker?.elementExplosion();
    game?.achievementTracker?.elementVolley();
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
    const deal = () => {
        for (const e of (game?.enemies || []) as any[]) {
            if (e.alive && Vec.dist(e.x, e.y, enemy.x, enemy.y) < 90) {
                e.takeDamage(boom, player, game);
            }
        }
    };
    if (game.achievementTracker?.active) game.achievementTracker.scope('explosion', 'element', deal);
    else deal();
}

/**
 * 元素飞弹的差异化附带效果（2026-11-09 元素暴击改版：不同元素命中效果不同）。
 * 全部以单枚飞弹伤害 missileDmg 为基数做轻量即时结算，不喧宾夺主：
 *  水=减速20% / 火=小灼烧 / 土=60码溅射 / 风=击退小兵 /
 *  雷=追加直伤 / 冰=强减速 / 光=无视护甲真伤 / 暗=吸血。
 */
function applyElementSideEffect(enemy: any, element: ElementType, missileDmg: number, player: any, game: any): void {
    switch (element) {
        case 'water':
            enemy.slowMult = Math.min(enemy.slowMult ?? 1, 0.8);
            enemy._slowTimer = Math.max(enemy._slowTimer ?? 0, 1.5);
            break;
        case 'fire': {
            const dots = enemy.dots || (enemy.dots = []);
            const burn = dots.find(d => d.type === 'elem_burn');
            if (burn) { burn.dps = missileDmg * 0.4; burn.timeLeft = 1.5; }
            else dots.push({ type: 'elem_burn', dps: missileDmg * 0.4, timeLeft: 1.5, color: '#ff6a3d' });
            break;
        }
        case 'earth':
            for (const e of (game?.enemies || []) as any[]) {
                if (e.alive && e !== enemy && Vec.dist(e.x, e.y, enemy.x, enemy.y) < 60) {
                    e.takeDamage(missileDmg * 0.3, player, game);
                }
            }
            break;
        case 'wind':
            if (!enemy.isBoss && !enemy.isElite && !enemy.isMiniBoss) {
                const [kx, ky] = Vec.normalize(enemy.x - player.x, enemy.y - player.y);
                enemy.x = clamp(enemy.x + kx * 24, enemy.radius, CANVAS_W - enemy.radius);
                enemy.y = clamp(enemy.y + ky * 24, enemy.radius, PLAYFIELD_BOTTOM - enemy.radius);
            }
            break;
        case 'thunder':
            enemy.takeDamage(missileDmg * 0.3, player, game);
            break;
        case 'frost':
            enemy.slowMult = Math.min(enemy.slowMult ?? 1, 0.65);
            enemy._slowTimer = Math.max(enemy._slowTimer ?? 0, 2);
            break;
        case 'light':
            enemy.takeTrueDamage?.(missileDmg * 0.25, player, game);
            break;
        case 'shadow':
            player.heal?.(missileDmg * 0.3);
            break;
    }
}

/** 元素暴击齐射已随 2026-11-12 改版移除：印记改由元素海克斯命中直接附加。 */

/** 八张元素海克斯 id（2026-11-09 改版：集齐任意 4 种即激活元素暴击，见 AugmentManager）。 */
export const ELEMENT_HEX_IDS = ['hex20', 'hex21', 'hex22', 'hex23', 'hex35', 'hex36', 'hex37', 'hex38'];

/**
 * 元素暴击(hex19)持有者的元素海克斯命中时调用：为目标附加本卡对应的元素
 * 印记（sideEffect=false——减速/灼烧等附带效果由各卡 onHit 自身结算）。
 * 未持有 hex19（p.stats.elemMarks 未置位）时不打印记，行为不变。
 */
function tryElementMark(hex: AugmentDef, p: any, enemy: any, dmg: number, game: any): void {
    if (enemy?.alive && p?.stats?.elemMarks) {
        applyElementMark(enemy, ELEMENT_OF_HEX[hex.id], dmg, p, game, false);
    }
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
      descAt: (l) => `攻速 +${[1, 2, 5][l - 1]}%`
          + (l >= 2 ? `｜特权·热机：每波前 ${GameConfig.get('perkWarmupSec')} 秒攻速再 +${Math.round(GameConfig.get('perkWarmupAtk') * 100)}%` : '')
          + (l >= 3 ? `｜特权·极限转速：击杀进入 ${GameConfig.get('perkFrenzySec')} 秒狂热（攻速再 +${Math.round(GameConfig.get('perkFrenzyAtk') * 100)}%），连杀可常驻` : ''),
      onLevel(p, _g, from, to) { swapFactor(p.stats, 'attackSpeed', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0); },
      // Lv2 热机：波次切换时刷新计时窗（onUpdate 逐帧续短 buff，与 getAtkSpd 的 buff 读取实时联动）
      _pwWave: -1, _pwT: 0,
      onUpdate(p, dt, game) {
          if ((this.level ?? 1) < 2) return;
          const wave = (game as any)?._waveMgr?.wave ?? 0;
          if (wave !== this._pwWave) { this._pwWave = wave; this._pwT = GameConfig.get('perkWarmupSec'); }
          if (this._pwT <= 0) return;
          this._pwT -= dt;
          p.applyBuff?.('perk_warmup', 0.3, { atkSpd: 1 + GameConfig.get('perkWarmupAtk') });
      },
      // Lv3 极限转速：击杀刷新狂热
      onKill(p, _e, _d, _g) {
          if ((this.level ?? 1) < 3) return;
          p.applyBuff?.('perk_frenzy', GameConfig.get('perkFrenzySec'), { atkSpd: 1 + GameConfig.get('perkFrenzyAtk') });
      } },

    { id: 'hex02', index: 2, rarity: 'silver', icon: 'hex02', name: '力量核心', category: '功能',
      prices: [12, 45, 160], values: [0.01, 0.02, 0.05],
      descAt: (l) => `攻击 +${[1, 2, 5][l - 1]}%`
          + (l >= 2 ? `｜特权·过载电容：暴击附加 ${Math.round(GameConfig.get('perkCritCapDamage') * 100)}% 攻击力的额外伤害` : '')
          + (l >= 3 ? '｜特权·核心共鸣：攻击时额外打出一道攻击' : ''),
      onLevel(p, _g, from, to) {
          swapFactor(p.stats, 'damage', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          // Lv3 核心共鸣（用户定稿）：攻击时额外打出一道攻击——按职业走
          // 幻影特效同款管线（远程 extraBullets / 近战 meleeExtraHits），档位进出精确换档
          const had = from >= 3, has = to >= 3;
          if (had !== has) {
              const key = p._charDef?.attackType === 'melee' ? 'meleeExtraHits' : 'extraBullets';
              swapFlat(p.stats, key, had ? 1 : 0, has ? 1 : 0);
          }
      },
      // Lv2 过载电容：暴击附加一段固伤（不参与暴击再乘区，防递归）
      onCrit(p, enemy, _dmg, game) {
          if ((this.level ?? 1) < 2 || !enemy?.alive) return;
          const base = p.getDamage?.(game);
          if (!base) return;
          const extra = base * GameConfig.get('perkCritCapDamage');
          if (extra <= 0) return;
          enemy.takeDamage(extra, p, game);
          game?.floatingText?.spawn?.(enemy.x, enemy.y - 44, '过载电容', '#ffb0e0', 13, false);
      } },

    { id: 'hex03', index: 3, rarity: 'silver', icon: 'hex03', name: '生命涌泉', category: '功能',
      prices: [15, 50, 180], values: [0.01, 0.05, 0.10],
      descAt: (l) => `血量 +${[1, 5, 10][l - 1]}%`
          + (l >= 2 ? `｜特权·涌泉活水：波间自动回复 ${Math.round(GameConfig.get('perkHealRatio') * 100)}% 已损失生命` : '')
          + (l >= 3 ? `｜特权·泉眼：生命低于 ${Math.round(GameConfig.get('perkLowHpRatio') * 100)}% 时受伤 -${Math.round(GameConfig.get('perkLowHpReduce') * 100)}%` : ''),
      onLevel(p, _g, from, to) {
          swapFactor(p.stats, 'maxHp', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          p.hp = Math.min(p.hp, p.stats.maxHp);
          // Lv3 泉眼：低血线减伤标志（PlayerController.takeDamage 读取）
          p.stats.perkLowHpReduce = to >= 3 ? GameConfig.get('perkLowHpReduce') : 0;
      },
      // Lv2 涌泉活水：波间开页回复（dispatchShopOpen 分发）
      onShopOpen(p, _g) {
          if ((this.level ?? 1) < 2) return;
          const lost = p.stats.maxHp - p.hp;
          if (lost <= 0) return;
          const heal = Math.min(lost, lost * GameConfig.get('perkHealRatio'));
          p.heal?.(heal);
      } },

    { id: 'hex07', index: 7, rarity: 'silver', icon: 'hex07', name: '精准仪轨', category: '功能',
      prices: [15, 55, 200], values: [0.01, 0.02, 0.05],
      descAt: (l) => `暴击几率 +${[1, 2, 5][l - 1]}%`
          + (l >= 2 ? `｜特权·弱点习惯：连续攻击同一目标每次命中暴击 +${(GameConfig.get('perkFocusCritStep') * 100).toFixed(0)}%（上限 +${(GameConfig.get('perkFocusCritMax') * 100).toFixed(0)}%，换目标清零）` : '')
          + (l >= 3 ? `｜特权·致命节奏：暴击缩短 Q 冷却 ${GameConfig.get('perkCritQcd')} 秒` : ''),
      onLevel(p, _g, from, to) {
          swapFlat(p.stats, 'critRate', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          if (to === 0) p.stats.perkFocusCrit = 0;
      },
      // Lv2 弱点习惯：连续攻击同一目标逐跳叠暴击（作用于下一次暴击判定；对象引用判同一目标）
      _pfTarget: null as any, _pfStacks: 0,
      onHit(p, enemy, _dmg, _g) {
          if ((this.level ?? 1) < 2 || !enemy) return;
          if (this._pfTarget !== enemy) { this._pfTarget = enemy; this._pfStacks = 0; }
          const max = Math.floor(GameConfig.get('perkFocusCritMax') / GameConfig.get('perkFocusCritStep'));
          this._pfStacks = Math.min(max, this._pfStacks + 1);
          p.stats.perkFocusCrit = this._pfStacks * GameConfig.get('perkFocusCritStep');
      },
      // Lv3 致命节奏：暴击喂 Q 冷却
      onCrit(p, _e, _d, _g) {
          if ((this.level ?? 1) < 3) return;
          p.reduceQCd?.(GameConfig.get('perkCritQcd'));
      } },

    { id: 'hex11', index: 11, rarity: 'silver', icon: 'hex11', name: '延展力场', category: '功能',
      prices: [18, 60, 220], values: [10, 15, 30],
      descAt: (l) => `攻击距离 +${[10, 15, 30][l - 1]} 码`
          + (l >= 2 ? `｜特权·力场透镜：子弹飞行最远段（${Math.round(GameConfig.get('perkFarShotFrom') * 100)}% 后）命中伤害 +${Math.round(GameConfig.get('perkFarShotBonus') * 100)}%` : '')
          + (l >= 3 ? `｜特权·贯穿力场：子弹飞行 ${Math.round(GameConfig.get('perkRangePierceFrom') * 100)}% 射程后获得 +1 穿透` : ''),
      onLevel(p, _g, from, to) {
          swapFlat(p.stats, 'rangeBonus', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          // 特权标志（BulletController 读取；卖出即清）
          p.stats.perkFarShot = to >= 2 ? GameConfig.get('perkFarShotBonus') : 0;
          p.stats.perkRangePierce = to >= 3;
      } },

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
          // 方案D 风元素Lv3「风驰」：技能弹幕同样吃弹速加成
          const missileSpd = 300 * (1 + ((p.stats as any)?.perkSkillBulletSpeed ? (p.stats.bulletSpeedMult || 0) : 0));
          for (let i = 0; i < n; i++) {
              const a = Rng.float(0, Math.PI * 2);
              game?.bullets?.spawn?.({
                  x: p.x, y: p.y,
                  vx: Math.cos(a) * missileSpd, vy: Math.sin(a) * missileSpd,
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
      descAt: (l) => `获得的金币增加 ${[0.25, 0.5, 1.0][l - 1] * 100}%`
          + (l >= 2 ? `｜特权·复利：每持有 100 金币拾取再 +1%（上限 +${Math.round(GameConfig.get('perkCompoundMax') * 100)}%）` : '')
          + (l >= 3 ? `｜特权·黄金之手：精英击杀 +${GameConfig.get('perkEliteGold')} 金；局末兑换比改善为 ${GameConfig.get('perkSettleRate')}:1` : ''),
      onLevel(p, game, from, to) {
          const eco = game?.economy;
          if (!eco) return;
          swapFactor(eco, 'gainMult', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          // Lv2 复利 / Lv3 黄金之手：标志位（Economy.addGold 与 EnemyBase 精英击杀 / 结算比读取）
          eco.compoundPerk = to >= 2;
          eco.eliteGoldBonus = to >= 3;
          p.stats.perkSettleRate = to >= 3 ? GameConfig.get('perkSettleRate') : 0;
      } },

    { id: 'hex17', index: 17, rarity: 'silver', icon: 'hex17', name: '战争红利', category: '一次性',
      // v4 9.6 重标定：原 500/1000/2000（花 750 回 2000 净赚再造一局，最大
      // 印钞单点）→ 80/250/900，变"应急取款"。
      // 2026-11-09 用户调整：纯给钱卡免费发放（prices 全 0）——应急取款不该
      // 还要玩家先掏钱；发放数值维持 80/250/900 不变（占用一次性限购）。
      prices: [0, 0, 0], values: [80, 250, 900], oneShot: true,
      descAt: (l) => `免费：立刻获得 ${[80, 250, 900][l - 1]} 金币`,
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

    // ─── 元素暴击 + 八元素海克斯 ──────────────────────────
    // 元素暴击为单档彩色海克斯：只有集齐任意四种元素海克斯后才会解锁购买
    // 条件（AugmentManager.rollOptions / equip 校验）。
    // 2026-11-12 改版：不再暴击发射元素飞弹齐射——改为持有后，元素海克斯
    // 的每次命中都为目标附加对应元素印记；目标身上带有 2 种不同元素印记时
    // 引发元素爆炸（当次命中伤害为基数，每多一种元素翻倍，至多×8，0.5 秒
    // 内置冷却）。印记接线见各元素卡 onHit 的 tryElementMark。
    { id: 'hex19', index: 19, rarity: 'prismatic', icon: 'hex19', name: '元素暴击', category: '技能',
      prices: [900], values: [1],
      descAt: () => '持有后你的元素海克斯命中时附加对应元素印记；当目标身上带有 2 种不同元素印记时引发元素爆炸' +
          '（以当次命中伤害为基数，每多一种元素伤害翻倍，至多×8，半径 90 码，0.5 秒内置冷却）。需先持有任意四种元素海克斯',
      onLevel(p, _g, _from, to) { p.stats.elemMarks = !!to; },
      onUpdate(p, dt) {
          // 元素爆炸 0.5 秒节流窗口（applyElementMark 写入，这里递减）
          if (p?.stats && p.stats._elemBlastCd > 0) {
              p.stats._elemBlastCd = Math.max(0, p.stats._elemBlastCd - dt);
          }
      } },

    // ─── 四元素海克斯（集齐解锁元素暴击） ──────────────────
    { id: 'hex20', index: 20, rarity: 'silver', icon: 'hex20', name: '风元素', category: '技能',
      prices: [50, 230, 880], values: [0.10, 0.15, 0.20],
      descAt: (l) => `远程：子弹飞行速度 +${[10, 15, 20][l - 1]}%；近战：攻击伤害 +${[5, 8, 10][l - 1]}%`
          + (l >= 2 ? `｜特权·风压：命中 ${Math.round(GameConfig.get('perkWindPushChance') * 100)}% 概率推开小兵` : '')
          + (l >= 3 ? '｜特权·风驰：弹速加成同时作用于技能弹幕（制导蜂群/元素飞弹）' : ''),
      onLevel(p, _g, from, to) {
          if (p._charDef?.attackType === 'melee') {
              swapFactor(p.stats, 'damage', from ? this.values[from - 1] * 0.5 : 0, to ? this.values[to - 1] * 0.5 : 0);
          } else {
              swapFlat(p.stats, 'bulletSpeedMult', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          }
          p.stats.perkWindPush = to >= 2;          // Lv2 风压（BulletController 命中读取）
          p.stats.perkSkillBulletSpeed = to >= 3;  // Lv3 风驰（hex10 导弹 / 元素齐射读取）
      },
      // 本体无命中效果；持有元素暴击(hex19)时命中附加风印记
      onHit(p, enemy, dmg, game) { tryElementMark(this, p, enemy, dmg, game); } },

    { id: 'hex21', index: 21, rarity: 'silver', icon: 'hex21', name: '火元素', category: '技能',
      prices: [50, 230, 880], values: [0.05, 0.06, 0.07],
      descAt: (l) => `攻击附加灼烧：每秒造成怪物当前生命值 ${[5, 6, 7][l - 1]}% 的伤害（持续 1.5 秒，命中刷新）`
          + (l >= 2 ? `｜特权·蔓延：灼烧目标死亡时把 ${Math.round(GameConfig.get('perkFireSpreadRatio') * 100)}% 剩余灼烧转移给 ${GameConfig.get('perkFireSpreadRange')} 码内另一敌人` : '')
          + (l >= 3 ? `｜特权·燃尽：灼烧到期终结一跳（DPS ×${GameConfig.get('perkBurnoutBonus')}）；灼烧中的精英死亡点燃 ${GameConfig.get('perkBurnoutRange')} 码范围` : ''),
      onLevel(p, _g, _from, to) {
          p.stats.perkFireSpread = to >= 2;  // Lv2 蔓延（EnemyBase._die 读取）
          p.stats.perkBurnout = to >= 3;     // Lv3 燃尽（EnemyBase DoT 循环读取）
      },
      onHit(_p, enemy, _dmg, _game) {
          if (!enemy?.alive) return;
          tryElementMark(this, _p, enemy, _dmg, _game);
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
      descAt: (l) => `远程：攻击可以穿刺（+${[1, 2, 3][l - 1]} 个目标）；近战：攻击范围 +${[20, 25, 30][l - 1]}%`
          + (l >= 2 ? `｜特权·厚重：子弹每穿透一个目标伤害 +${Math.round(GameConfig.get('perkPierceBonus') * 100)}%` : '')
          + (l >= 3 ? `｜特权·地震：近战一次命中 ≥3 敌时震地（${Math.round(GameConfig.get('perkQuakeRatio') * 100)}% 攻击力范围伤害，CD ${GameConfig.get('perkQuakeCd')} 秒）` : ''),
      onLevel(p, _g, from, to) {
          if (p._charDef?.attackType === 'melee') {
              const meleeRange = p._charDef.attackRange ?? 90;
              const pct = [0.20, 0.25, 0.30];
              swapFlat(p.stats, 'rangeBonus',
                  from ? meleeRange * pct[from - 1] : 0, to ? meleeRange * pct[to - 1] : 0);
          } else {
              swapFlat(p.stats, 'pierce', from ? this.values[from - 1] : 0, to ? this.values[to - 1] : 0);
          }
          p.stats.perkPierceBonus = to >= 2 ? GameConfig.get('perkPierceBonus') : 0; // Lv2 厚重
      },
      // Lv3 地震：近战贴身 ≥3 敌时震地（内置冷却）
      _qkCd: 0,
      onUpdate(p, dt) { this._qkCd = Math.max(0, this._qkCd - dt); },
      onHit(p, enemy, _dmg, game) {
          tryElementMark(this, p, enemy, _dmg, game);
          if ((this.level ?? 1) < 3 || this._qkCd > 0 || !game?.enemies) return;
          if (p._charDef?.attackType !== 'melee') return;
          const crowd = game.enemies.filter((e: any) =>
              e.alive && !e.isBoss && Vec.dist(e.x, e.y, p.x, p.y) <= 130).length;
          if (crowd < 3) return;
          this._qkCd = GameConfig.get('perkQuakeCd');
          spawnExplosion(p, p.x, p.y, p.getDamage?.(game) * GameConfig.get('perkQuakeRatio'), 110, game);
          game.floatingText?.spawn?.(p.x, p.y - 46, '地震！', '#c9a06a', 16, true);
      } },

    { id: 'hex23', index: 23, rarity: 'silver', icon: 'hex23', name: '水元素', category: '技能',
      prices: [50, 230, 880], values: [0.20, 0.25, 0.30],
      descAt: (l) => `攻击附加减速：命中使敌人移速 -${[20, 25, 30][l - 1]}%，持续 2 秒（重复命中刷新）`
          + (l >= 2 ? `｜特权·潮汐：被减速超过 ${GameConfig.get('perkTideFrom')} 秒的敌人受伤 +${Math.round(GameConfig.get('perkTideBonus') * 100)}%` : '')
          + (l >= 3 ? `｜特权·冰点：对减速目标暴击率 +${Math.round(GameConfig.get('perkFrostCrit') * 100)}%` : ''),
      onLevel(p, _g, _from, to) {
          p.stats.perkTideDmg = to >= 2 ? GameConfig.get('perkTideBonus') : 0;  // Lv2 潮汐（EnemyBase.takeDamage）
          p.stats.perkFrostCrit = to >= 3;                                       // Lv3 冰点（暴击判定）
      },
      onHit(_p, enemy, _dmg, _game) {
          if (!enemy?.alive) return;
          tryElementMark(this, _p, enemy, _dmg, _game);
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
          // 免费刷新次数后台可调（freeRefreshCount，默认 5）
          if (to > 0) am.freeRefreshes = Math.max(am.freeRefreshes || 0, GameConfig.get('freeRefreshCount'));
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
      descAt: () => '血量低于 10% 时，向鼠标方向丢出一个嘲讽假人分身吸引怪物仇恨（落定后持续 6 秒，内置 30 秒冷却）',
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

    // ─── 受击/走位流（2026-10-28 设计，走新挂点 onPlayerHit） ──
    // 荆棘甲壳：受击风险变现——挨打攒甲，与「破甲重铸」(hex09) 组成
    // "受击攒甲 → 卖出保留 → 破甲重铸转攻" 的完整转化链。
    { id: 'hex33', index: 33, rarity: 'gold', icon: 'hex33', name: '荆棘甲壳', category: '技能',
      prices: [45, 180, 650], values: [3, 4, 5],
      descAt: (l) => `每次被攻击命中 +1 层甲壳（每层护甲 +${[3, 4, 5][l - 1]}），上限 20 层；` +
          '卖出时已获护甲保留不退（可重新购买再次叠层）',
      _stacks: 0,
      /** HUD 底部叠层行展示用：层数上限。 */
      stackMax: 20,
      onLevel(p, _g, from, to) {
          // 升档对已有层数追溯差值；卖出(to=0)护甲保留、层数清零（重购从 0 叠）
          if (from > 0 && to > 0 && this._stacks > 0) {
              p.stats.armor = (p.stats.armor || 0) + this._stacks * (this.values[to - 1] - this.values[from - 1]);
          }
          if (to === 0) this._stacks = 0;
      },
      onPlayerHit(p, game) {
          if (this._stacks >= 20) return;
          this._stacks++;
          p.stats.armor = (p.stats.armor || 0) + this.values[(this.level ?? 1) - 1];
          if (this._stacks === 20) {
              game?.floatingText?.spawn?.(p.x, p.y - 40, '甲壳满层', '#d2a24c', 16, true);
              game?.particles?.hexActivate?.(p.x, p.y, '#d2a24c');
          }
      } },

    // 风行节奏：走位变现——持续移动叠层换双速，被命中即折半，
    // 与「完美防线」成就共享同一套"不挨打"技术。
    { id: 'hex34', index: 34, rarity: 'gold', icon: 'hex34', name: '风行节奏', category: '技能',
      prices: [150], values: [1],
      descAt: () => '持续移动每累计 100 码 +1 层风行（每层移速 +2%、攻速 +1%），上限 15 层；被攻击命中失去一半层数',
      _lx: undefined as any, _ly: undefined as any, _dist: 0, _stacks: 0,
      /** HUD 底部叠层行展示用：层数上限。 */
      stackMax: 15,
      /** 层数 from→to 的双速乘区精确换档（swapFactor 先除旧再加新）。 */
      _set(p: any, from: number, to: number) {
          swapFactor(p.stats, 'speed', from * 0.02, to * 0.02);
          swapFactor(p.stats, 'attackSpeed', from * 0.01, to * 0.01);
      },
      onUpdate(p, dt, game) {
          if (this._lx === undefined) { this._lx = p.x; this._ly = p.y; return; }
          let d = Math.hypot(p.x - this._lx, p.y - this._ly);
          this._lx = p.x; this._ly = p.y;
          if (d > 60) return; // 单帧正常位移 ≤60 码；传送/重生的大跳不计
          this._dist += d;
          while (this._dist >= 100 && this._stacks < 15) {
              this._dist -= 100;
              this._set(p, this._stacks, this._stacks + 1);
              this._stacks++;
              if (this._stacks % 5 === 0) {
                  game?.floatingText?.spawn?.(p.x, p.y - 40, `风行 ${this._stacks}/15`, '#9fe8c8', 14, false);
              }
          }
          if (this._stacks >= 15) this._dist = 0; // 满层后多余路程作废，折半后从 0 重蓄
      },
      onPlayerHit(p, game) {
          if (this._stacks <= 0) return;
          const kept = Math.floor(this._stacks / 2);
          game?.floatingText?.spawn?.(p.x, p.y - 40, `风行 -${this._stacks - kept}`, '#ff8a8a', 14, false);
          this._set(p, this._stacks, kept);
          this._stacks = kept;
          this._dist = 0;
      },
      onLevel(p, _g, _from, to) {
          if (to === 0) { // 卖出：全额退还双速加成并复位计层
              this._set(p, this._stacks, 0);
              this._stacks = 0;
              this._dist = 0;
              this._lx = undefined;
          }
      } },

    // ─── 元素体系扩展（2026-11-09 用户设计稿）：雷/冰/光/暗四元素海克斯 ───
    // 与风火土水同构（银卡三档 + Lv2/Lv3 特权）；集齐任意四种元素激活元素暴击。
    // 感电走 DoT 通道、灼烧同例——大Boss负面免疫对两者同样生效（与火元素一致）；
    // 寒潮/腐蚀用独立计时字段（_frostMarkT/_shadowMarkT）绕开 Boss 的 DoT 清空。
    // icon 为程序生成的元素色占位图（ui_icon_hex35~38），专属图标产出后覆盖同名文件替换。
    { id: 'hex35', index: 35, rarity: 'silver', icon: 'hex35', name: '雷元素', category: '技能',
      prices: [50, 230, 880], values: [0.08, 0.10, 0.12],
      descAt: (l) => `攻击命中挂「感电」2 秒：每秒造成攻击力 ${[8, 10, 12][l - 1]}% 的雷伤（重复命中刷新；Boss 免疫持续伤害）`
          + (l >= 2 ? `｜特权·静电积累：感电目标被再次命中 ${Math.round(GameConfig.get('perkThunderArc') * 100)}% 概率落雷（${GameConfig.get('perkThunderArcRange')} 码，${Math.round(GameConfig.get('perkThunderArcDmg') * 100)}% 攻击力）` : '')
          + (l >= 3 ? `｜特权·引雷针：感电目标死亡时雷击转移给 ${GameConfig.get('perkThunderChainRange')} 码内最近敌人并重挂感电` : ''),
      _arcCd: 0,
      onLevel(p, _g, _from, to) {
          p.stats.perkThunderChain = to >= 3;  // Lv3 引雷针（EnemyBase._die 读取）
      },
      onUpdate(_p, dt) { if (this._arcCd > 0) this._arcCd = Math.max(0, this._arcCd - dt); },
      onHit(p, enemy, _dmg, game) {
          if (!enemy?.alive) return;
          tryElementMark(this, p, enemy, _dmg, game);
          const pct = this.values[(this.level ?? 1) - 1];
          const dps = (p.stats?.damage ?? 20) * pct;
          const dots = enemy.dots || (enemy.dots = []);
          const ex = dots.find(d => d.type === 'hex_thunder');
          if (ex) { ex.dps = dps; ex.timeLeft = 2; }
          else dots.push({ type: 'hex_thunder', dps, timeLeft: 2, color: '#f5e36b' });
          // Lv2 静电积累：0.5s 内置冷却防高频攻击连爆
          if ((this.level ?? 1) >= 2 && this._arcCd <= 0 && Rng.chance(GameConfig.get('perkThunderArc'))) {
              this._arcCd = 0.5;
              spawnExplosion(p, enemy.x, enemy.y,
                  (p.stats?.damage ?? 20) * GameConfig.get('perkThunderArcDmg'),
                  GameConfig.get('perkThunderArcRange'), game);
              game?.floatingText?.spawn?.(enemy.x, enemy.y - 36, '静电落雷！', '#f5e36b', 14, true);
          }
      } },

    { id: 'hex36', index: 36, rarity: 'silver', icon: 'hex36', name: '冰元素', category: '技能',
      prices: [50, 230, 880], values: [6, 5, 4],
      descAt: (l) => `攻击命中叠 1 层「寒意」，同一目标叠满 ${[6, 5, 4][l - 1]} 层冻结 1.2 秒（冻结后层数清空；Boss 免疫冻结，叠满改为 ${GameConfig.get('perkFrostBossSec')} 秒「寒潮」易伤）`
          + (l >= 2 ? `｜特权·霜甲：冻结/寒潮目标受到的伤害 +${Math.round(GameConfig.get('perkFrostBonus') * 100)}%` : '')
          + (l >= 3 ? `｜特权·碎冰：对冻结目标暴击立即碎冰（${Math.round(GameConfig.get('perkShatterDmg') * 100)}% 攻击力伤害）并提前解冻` : ''),
      onLevel(p, _g, _from, to) {
          p.stats.perkFrostBonus = to >= 2 ? GameConfig.get('perkFrostBonus') : 0;  // Lv2 霜甲（EnemyBase.takeDamage）
          p.stats.perkShatter = to >= 3;                                           // Lv3 碎冰（onCrit）
      },
      onHit(_p, enemy, _dmg, game) {
          if (!enemy?.alive) return;
          tryElementMark(this, _p, enemy, _dmg, game);
          const need = this.values[(this.level ?? 1) - 1];
          enemy._frostStacks = (enemy._frostStacks ?? 0) + 1;
          if (enemy._frostStacks < need) return;
          enemy._frostStacks = 0;
          if (enemy.isBoss) {
              enemy._frostMarkT = GameConfig.get('perkFrostBossSec'); // 独立字段，不吃 Boss DoT 清空
              game?.floatingText?.spawn?.(enemy.x, enemy.y - 46, '寒潮涌动！', '#a8ecff', 15, true);
          } else {
              enemy.frozen = Math.max(enemy.frozen, 1.2);
              game?.particles?.coldImpact?.(enemy.x, enemy.y);
          }
      },
      onCrit(p, enemy, _dmg, game) {
          if ((this.level ?? 1) < 3 || !enemy?.alive || (enemy.frozen ?? 0) <= 0) return;
          enemy.frozen = 0;
          spawnExplosion(p, enemy.x, enemy.y,
              (p.stats?.damage ?? 20) * GameConfig.get('perkShatterDmg'), 70, game);
          game?.floatingText?.spawn?.(enemy.x, enemy.y - 40, '碎冰！', '#a8ecff', 16, true);
      } },

    { id: 'hex37', index: 37, rarity: 'silver', icon: 'hex37', name: '光元素', category: '技能',
      prices: [50, 230, 880], values: [0.04, 0.06, 0.08],
      descAt: (l) => `攻击命中附加 ${[4, 6, 8][l - 1]}% 攻击力的真实伤害（无视护盾/护甲/减伤）`
          + (l >= 2 ? `｜特权·曝光：命中隐身单位立即破隐并追加 ${Math.round(GameConfig.get('perkLightExpose') * 100)}% 攻击力真伤` : '')
          + (l >= 3 ? `｜特权·聚焦：连续命中同一目标每跳光伤 +${(GameConfig.get('perkLightFocusStep') * 100).toFixed(0)}%（上限 +${Math.round(GameConfig.get('perkLightFocusMax') * 100)}%，换目标清零）` : ''),
      _focusId: undefined as any, _focusStacks: 0,
      onLevel(_p, _g, _from, to) { if (to === 0) { this._focusId = undefined; this._focusStacks = 0; } },
      onHit(p, enemy, _dmg, game) {
          if (!enemy?.alive) return;
          tryElementMark(this, p, enemy, _dmg, game);
          const atk = p.stats?.damage ?? 20;
          const base = atk * this.values[(this.level ?? 1) - 1];
          // Lv3 聚焦：连续命中同一目标递增（换目标清零）
          let bonus = 1;
          if ((this.level ?? 1) >= 3) {
              if (this._focusId !== enemy) { this._focusId = enemy; this._focusStacks = 0; }
              const maxS = Math.floor(GameConfig.get('perkLightFocusMax') / GameConfig.get('perkLightFocusStep'));
              if (this._focusStacks < maxS) this._focusStacks++;
              bonus = 1 + this._focusStacks * GameConfig.get('perkLightFocusStep');
          }
          // Lv2 曝光：隐身单位破隐（水母/影袭中的暗影猎手克星）+ 追加真伤
          let expose = 0;
          if ((this.level ?? 1) >= 2 && enemy.invisible) {
              enemy.invisible = false; enemy.invulnerable = false;
              expose = atk * GameConfig.get('perkLightExpose');
              game?.floatingText?.spawn?.(enemy.x, enemy.y - 40, '曝光！', '#fff3b0', 15, true);
          }
          enemy.takeTrueDamage?.(base * bonus + expose, p, game);
      } },

    { id: 'hex38', index: 38, rarity: 'silver', icon: 'hex38', name: '暗元素', category: '技能',
      prices: [50, 230, 880], values: [2, 3, 4],
      descAt: (l) => `攻击命中挂「腐蚀」2 秒：腐蚀单位死亡时回复 ${[2, 3, 4][l - 1]} 点生命（Boss 也可被腐蚀）`
          + (l >= 2 ? `｜特权·汲取：对腐蚀目标造成伤害的 ${Math.round(GameConfig.get('perkShadowLeech') * 100)}% 转为生命（每秒上限 ${GameConfig.get('perkShadowLeechCap')}）` : '')
          + (l >= 3 ? `｜特权·暗蚀领域：每击杀 ${GameConfig.get('perkShadowKillReq')} 个腐蚀单位获得 ${GameConfig.get('perkShadowPowerSec')} 秒「暗影之力」（伤害 +${Math.round(GameConfig.get('perkShadowPower') * 100)}%）` : ''),
      _killCount: 0, _leechT: 0,
      onLevel(p, _g, _from, to) {
          p.stats.perkShadowHeal = to >= 1 ? this.values[to - 1] : 0;                 // Lv1 击杀回血（onKill）
          p.stats.perkShadowLeech = to >= 2 ? GameConfig.get('perkShadowLeech') : 0;  // Lv2 汲取（takeDamage）
          p.stats.perkShadowKillReq = to >= 3 ? GameConfig.get('perkShadowKillReq') : 0; // Lv3 领域计数
          if (to >= 2) p.stats._shadowLeechBudget = GameConfig.get('perkShadowLeechCap'); // 装备即有预算，不等首帧 onUpdate
      },
      onUpdate(p, dt) {
          // 汲取预算：每秒重置（对 Boss/小怪统一的每秒回血上限）
          this._leechT -= dt;
          if (this._leechT <= 0) {
              this._leechT = 1;
              p.stats._shadowLeechBudget = GameConfig.get('perkShadowLeechCap');
          }
      },
      onHit(_p, enemy, _dmg, _game) {
          if (!enemy?.alive) return;
          tryElementMark(this, _p, enemy, _dmg, _game);
          enemy._shadowMarkT = 2; // 独立字段：Boss 的 DoT 免疫不清腐蚀标记
      },
      onKill(p, enemy, _dmg, game) {
          if ((enemy?._shadowMarkT ?? 0) <= 0) return;
          if (p.stats?.perkShadowHeal) p.heal?.(p.stats.perkShadowHeal);
          if ((this.level ?? 1) < 3 || !p.stats?.perkShadowKillReq) return;
          this._killCount++;
          game?.floatingText?.spawn?.(p.x, p.y - 40,
              `暗蚀 ${this._killCount}/${GameConfig.get('perkShadowKillReq')}`, '#9c7bff', 13, false);
          if (this._killCount >= GameConfig.get('perkShadowKillReq')) {
              this._killCount = 0;
              p.applyBuff?.('shadow_power', GameConfig.get('perkShadowPowerSec'),
                  { dmgMult: 1 + GameConfig.get('perkShadowPower') });
              game?.floatingText?.spawn?.(p.x, p.y - 52, '暗影之力！', '#9c7bff', 16, true);
          }
      } },
];

/** 按文档编号取海克斯定义。 */
export function getHexByIndex(index: number): AugmentDef | undefined {
    return AUGMENT_DB.find(a => a.index === index);
}
