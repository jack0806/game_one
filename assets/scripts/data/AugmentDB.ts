// ============================================================
//  AugmentDB.ts — 50 个词条定义（纯数据层）
// ============================================================
import { Rng, Vec } from '../core/MathUtils';

export interface AugmentDef {
    id: string;
    rarity: 'blue' | 'purple' | 'orange' | 'gold';
    icon: string;
    name: string;
    tags: string[];
    desc: string;
    affinity?: string[];
    /**
     * 词条适配的攻击方式；不写=通用。
     * 'ranged' 的纯弹道词条（穿透/多重/反弹/弹幕等）只消费 stats 里的子弹字段，
     * 近战角色(_shoot直接走_meleeAttack,从不spawn子弹)拿到即死词条，
     * 会在 rollOptions/混沌加成池里被按角色 attackType 过滤掉。
     */
    attackType?: 'melee' | 'ranged';
    tier?: number;
    // 词条钩子
    onEquip?:     (p: any, game: any, mult?: number) => void;
    onHit?:       (p: any, enemy: any, dmg: number, game: any) => void;
    onKill?:      (p: any, enemy: any, dmg: number, game: any) => void;
    onUpdate?:    (p: any, dt: number, game?: any) => void;
    onWaveStart?: (p: any, game?: any) => void;
    onSkill?:     (p: any, game: any) => void;
    // 内部状态（每个实例应深拷贝）
    [key: string]: any;
}

// Type alias for compatibility
export type AugDef = AugmentDef;

// ── 辅助函数 ──────────────────────────────────────────────
export function chainLightning(player: any, sourceEnemy: any, dmg: number, bounces: number, game: any, visited = new Set<any>()): void {
    if (!game || bounces <= 0) return;
    visited.add(sourceEnemy);
    const others = game.enemies.filter((e: any) => !visited.has(e) && e.alive && Vec.dist(e.x, e.y, sourceEnemy.x, sourceEnemy.y) < 220);
    if (!others.length) return;
    const target = Rng.pick(others) as any;
    visited.add(target);
    game.particles.lightning(sourceEnemy.x, sourceEnemy.y, target.x, target.y, '#ffe500');
    game.audio?.playSfx?.('lightning');
    target.takeDamage(dmg, player, game);
    game.floatingText?.spawn(target.x, target.y - 22, '连锁!', '#ffe500', 13, false);
    chainLightning(player, target, dmg * 0.8, bounces - 1, game, visited);
}

export function spawnExplosion(player: any, x: number, y: number, dmg: number, radius: number, game: any): void {
    if (!game) return;
    const mult = (player.stats.explosionMult) || 1;
    game.particles.explode(x, y, '#ff6600', radius);
    game.audio?.playSfx?.('explode');
    game.screenShake.shake(6, 0.2);
    const hitTargets: any[] = [];
    for (const e of game.enemies) {
        if (e.alive && Vec.dist(e.x, e.y, x, y) < radius) {
            e.takeDamage(dmg * mult, player, game);
            hitTargets.push(e);
        }
    }
    if (player.stats?.chainExplosion && hitTargets.length > 3) {
        const cr = radius * 0.6;
        for (const t of hitTargets) {
            game.particles.explode(t.x, t.y, '#ff9900', cr);
            for (const e2 of game.enemies) {
                if (e2.alive && Vec.dist(e2.x, e2.y, t.x, t.y) < cr) e2.takeDamage(dmg * mult * 0.5, player, game);
            }
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

// ── 词条数据库 ─────────────────────────────────────────────
export const AUGMENT_DB: AugmentDef[] = [
    // ─── 蓝色词条 ─────────────────────────────────────────
    { id: 'pierce', rarity: 'blue', icon: 'pierce', name: '穿透炮弹', tags: ['pierce'], attackType: 'ranged',
      desc: '子弹额外穿透 2 个敌人',
      onEquip(p, _g, mult = 1) { p.stats.pierce += 2 * mult; } },

    { id: 'chain', rarity: 'blue', icon: 'lightning', name: '连锁闪电', tags: ['lightning'], affinity: ['kai', 'olia'],
      desc: '击中目标后弹射至2个附近敌人（伤害×70%）',
      onHit(p, enemy, dmg, game) { chainLightning(p, enemy, dmg * 0.7, 2, game); } },

    { id: 'explode', rarity: 'blue', icon: 'explosion', name: '爆炸弹头', tags: ['explosion'],
      desc: '子弹爆炸，溅射半径 60，溅射伤害×50%',
      onHit(p, enemy, dmg, game) { spawnExplosion(p, enemy.x, enemy.y, dmg * 0.5, 60, game); } },

    { id: 'burn', rarity: 'blue', icon: 'fire', name: '燃烧弹', tags: ['fire'],
      desc: '子弹命中附带3秒燃烧（每秒 15% 普攻伤害）',
      onHit(p, enemy, _dmg, game) { applyBurn(enemy, p.stats.damage * 0.15, 3); if (game?.particles) game.particles.ignite(enemy.x, enemy.y); } },

    { id: 'poison', rarity: 'blue', icon: 'poison', name: '毒液涂层', tags: ['poison'],
      desc: '命中附带毒，5秒总伤害×80%',
      onHit(_p, enemy, dmg, game) { applyPoison(enemy, dmg * 0.8 / 5, 5); if (game?.particles) game.particles.toxin(enemy.x, enemy.y); } },

    { id: 'crit_rate', rarity: 'blue', icon: 'crit', name: '精准射击', tags: ['crit'],
      desc: '暴击率 +20%，移动速度 -5%',
      onEquip(p, _g, mult = 1) { p.stats.critRate += 0.20 * mult; p.stats.speed *= (1 - 0.05 * mult); } },

    { id: 'crit_dmg', rarity: 'blue', icon: 'crit', name: '暴击强化', tags: ['crit'],
      desc: '暴击伤害 +60%，最大 HP -8%',
      onEquip(p, _g, mult = 1) {
          p.stats.critDmg += 0.60 * mult;
          p.stats.maxHp = Math.max(1, p.stats.maxHp * (1 - 0.08 * mult));
          p.hp = Math.min(p.hp, p.stats.maxHp);
      } },

    { id: 'double_shot', rarity: 'blue', icon: 'pierce', name: '双重射击', tags: ['bullet'], attackType: 'ranged',
      desc: '每次攻击同时发射 2 颗子弹（第二颗×70%）',
      onEquip(p, _g, _mult = 1) { p.stats.extraBullets += 1; } },

    { id: 'attack_spd', rarity: 'blue', icon: 'speed', name: '急速装填', tags: ['speed'],
      desc: '攻速 +25%，移动速度 -4%',
      onEquip(p, _g, mult = 1) { p.stats.attackSpeed *= (1 + 0.25 * mult); p.stats.speed *= (1 - 0.04 * mult); } },

    { id: 'lifesteal', rarity: 'blue', icon: 'lifesteal', name: '吸血子弹', tags: ['lifesteal'],
      desc: '每次命中回复伤害量×4% HP，护甲 -10',
      onEquip(p, _g, mult = 1) { p.stats.armor = Math.max(0, p.stats.armor - 10 * mult); },
      onHit(p, _enemy, dmg, game) {
          // 高频吸血只显示小绿字，不能每颗子弹都铺一张完整治疗法阵。
          p.heal(Math.min(dmg * 0.04, p.stats.maxHp * 0.03), false);
      } },

    { id: 'bounce', rarity: 'blue', icon: 'bounce', name: '反弹弹道', tags: ['bounce'], attackType: 'ranged',
      desc: '子弹可在边界弹射2次不消失',
      onEquip(p, _g, mult = 1) { p.stats.bulletBounce += 2 * mult; } },

    { id: 'hp_up', rarity: 'blue', icon: 'heart', name: '钢铁意志', tags: ['defense'],
      desc: '最大 HP +50',
      onEquip(p, _g, mult = 1) { p.stats.maxHp += 50 * mult; p.hp = Math.min(p.hp + 50 * mult, p.stats.maxHp); } },

    { id: 'armor_up', rarity: 'blue', icon: 'shield', name: '厚甲', tags: ['defense', 'armor'],
      desc: '护甲 +20',
      onEquip(p, _g, mult = 1) { p.stats.armor += 20 * mult; } },

    { id: 'regen', rarity: 'blue', icon: 'heart', name: '急救套件', tags: ['defense'],
      desc: '每12秒自动回复 6% HP',
      _timer: 0,
      onUpdate(p, dt) { this._timer += dt; if (this._timer >= 12) { this._timer = 0; p.heal(p.stats.maxHp * 0.06); } } },

    { id: 'wave_heal', rarity: 'blue', icon: 'heart', name: '波次预备', tags: ['defense'],
      desc: '每波开始时回复 8% HP',
      onWaveStart(p) { p.heal(p.stats.maxHp * 0.08); } },

    { id: 'combo_dmg', rarity: 'blue', icon: 'combo', name: '连击倍率', tags: ['combo'],
      desc: '连击>20/50/100 分别+5%/15%/30%伤害',
      onEquip(p, _g, _mult = 1) { p.stats._comboDmgAug = true; } },

    { id: 'gold_magnet', rarity: 'blue', icon: 'gold', name: '金币磁铁', tags: ['economy'],
      desc: '金币拾取范围×3，最大 HP -20',
      onEquip(p, _g, mult = 1) {
          p.stats.goldPickupRange *= (1 + 2 * mult);
          p.stats.maxHp = Math.max(1, p.stats.maxHp - 20 * mult);
          p.hp = Math.min(p.hp, p.stats.maxHp);
      } },

    { id: 'elite_hunt', rarity: 'blue', icon: 'crit', name: '精英猎手', tags: ['offense'],
      desc: '对精英/Boss伤害 +25%',
      onEquip(p, _g, mult = 1) { p.stats.eliteBonus += 0.25 * mult; } },

    { id: 'skill_cd', rarity: 'blue', icon: 'speed', name: '高速装弹', tags: ['skill'],
      desc: '技能 CD -15%',
      onEquip(p, _g, mult = 1) { p.stats.cdReduction += 0.15 * mult; } },

    { id: 'ultimate_cd', rarity: 'blue', icon: 'lightning', name: '储能核心', tags: ['ultimate'],
      desc: '终极充能速度 +25%',
      onEquip(p, _g, mult = 1) { p.stats.ultChargeRate += 0.25 * mult; } },

    // ─── 紫色词条 ─────────────────────────────────────────
    { id: 'turret', rarity: 'purple', icon: 'summon', name: '海克斯炮台', tags: ['turret', 'summon'], affinity: ['vivian'],
      desc: '召唤 1 个自动炮台，持续存在，伤害=玩家×55%；移动速度 -5%（装备负重）',
      onEquip(p, game, mult = 1) { game.spawnTurret(p, 0.55 + 0.25 * mult); p.stats.speed *= (1 - 0.05 * mult); } },

    { id: 'shadow_clone', rarity: 'purple', icon: 'summon', name: '暗影分身', tags: ['clone', 'summon'], affinity: ['vivian', 'graf'],
      desc: '生成分身跟随8秒，每次攻击造成玩家×60%伤害',
      onEquip(p, game, _mult = 1) { game.spawnClone(p); } },

    { id: 'barrage', rarity: 'purple', icon: 'pierce', name: '弹幕之心', tags: ['bullet', 'barrage'], attackType: 'ranged',
      desc: '普攻变为5发散射，单发伤害×50%',
      onEquip(p, _g, _mult = 1) { p.stats.barrageMode = true; } },

    { id: 'freeze_field', rarity: 'purple', icon: 'ice', name: '冻结磁场', tags: ['ice', 'field'],
      desc: '每次使用技能后，周围 120px敌人减速70%/3s',
      onSkill(p, game) { game.slowEnemiesAround(p.x, p.y, 120, 0.3, 3); } },

    { id: 'black_hole', rarity: 'purple', icon: 'chaos', name: '黑洞引擎', tags: ['black_hole'],
      desc: '技能 E 变为黑洞：吸附半径 160，5s 后爆炸',
      onEquip(p, _g, _mult = 1) { p.stats.eSkillUpgrade = 'blackhole'; } },

    { id: 'death_explode', rarity: 'purple', icon: 'explosion', name: '死亡爆破', tags: ['explosion', 'death'],
      desc: '击杀时，以死亡点为中心爆炸（80px，伤害×80%）',
      onKill(p, enemy, dmg, game) { spawnExplosion(p, enemy.x, enemy.y, dmg * 0.8, 80, game); } },

    { id: 'shield_regen', rarity: 'purple', icon: 'shield', name: '能量护盾', tags: ['shield', 'defense'],
      desc: '获得 150 点护盾，每 12秒重充',
      _timer: 0, _cap: 0,
      // 之前重充逻辑硬编码上限150，升级到Lv.2/3(mult<1时叠加)后初始护盾会变多但重充上限
      // 一直卡在150——这里改成用_cap累计升级后的总上限，重充时也用同一个上限。
      onEquip(p, _g, mult = 1) {
          const gain = 150 * mult;
          this._cap += gain;
          p.maxShield = Math.max(p.maxShield || 0, this._cap);
          p.shield = Math.min((p.shield || 0) + gain, p.maxShield);
      },
      onUpdate(p, dt) {
          this._timer += dt;
          if (this._timer >= 12) {
              this._timer = 0;
              p.maxShield = Math.max(p.maxShield || 0, this._cap);
              p.shield = Math.min((p.shield || 0) + this._cap, p.maxShield);
          }
      } },

    { id: 'chain_explosion', rarity: 'purple', icon: 'explosion', name: '引爆连锁', tags: ['explosion', 'lightning'],
      desc: '爆炸命中>3个目标时，触发追加连环爆炸（×50%）',
      onEquip(p, _g, _mult = 1) { p.stats.chainExplosion = true; } },

    { id: 'berserk', rarity: 'purple', icon: 'fire', name: '狂暴化', tags: ['berserk', 'combo'], affinity: ['reik'],
      desc: '击杀 20 个后进入狂暴 10s（攻速+60%，伤害+40%）',
      _killCount: 0,
      onKill(p, _enemy, _dmg, _game) { this._killCount++; if (this._killCount >= 20) { this._killCount = 0; p.applyBuff('berserk', 10, { atkSpd: 1.6, dmgMult: 1.4 }); } } },

    { id: 'phase_dash', rarity: 'purple', icon: 'speed', name: '相位跳跃', tags: ['dash'], affinity: ['olia'],
      desc: '冲刺变为传送，瞬移到鼠标位置，无视障碍',
      onEquip(p, game, _mult = 1) {
          p.stats.phaseDash = true;
          game.floatingText?.spawn(p.x, p.y - 45, '相位跳跃已激活：Shift/Space传送', '#cc88ff', 16, true);
      } },

    // ─── 橙色词条 ─────────────────────────────────────────
    { id: 'overload', rarity: 'orange', icon: 'lightning', name: '超载海克斯', tags: ['overload'],
      desc: '持有 5 个词条时，所有词条效果×1.5；移动速度 -8%',
      onEquip(p, _g, mult = 1) { p.stats._overloadCheck = true; p.stats.speed *= (1 - 0.08 * mult); } },

    { id: 'turret_army', rarity: 'orange', icon: 'summon', name: '炮台军团', tags: ['turret', 'summon'],
      desc: '持有炮台类词条时，新召唤的炮台数量×3，攻速×1.5',
      onEquip(p, game, _mult = 1) { if (game.checkTurretArmy) game.checkTurretArmy(p); } },

    { id: 'barrage_nova', rarity: 'orange', icon: 'pierce', name: '弹幕宇宙', tags: ['bullet', 'barrage'], attackType: 'ranged',
      desc: '普攻同时发射 9颗子弹（全方向，单颗×35%）',
      onEquip(p, _g, _mult = 1) { p.stats.novaMode = true; } },

    { id: 'chaos_protocol', rarity: 'orange', icon: 'chaos', name: '混沌协议', tags: ['chaos'],
      desc: '每次击杀 15% 概率随机触发一个词条最强效果',
      onKill(p, enemy, dmg, game) { if (Rng.chance(0.15) && game.triggerRandomAugment) game.triggerRandomAugment(p); } },

    { id: 'infinite_chain', rarity: 'orange', icon: 'lightning', name: '无限弹链', tags: ['lightning', 'chain'],
      desc: '攻击积累弹链层，每 10 层发射全屏激光扫射',
      _stack: 0,
      onHit(p, _enemy, _dmg, game) { this._stack++; if (this._stack >= 10) { this._stack = 0; if (game.laserSweep) game.laserSweep(p); } } },

    { id: 'blood_awakening', rarity: 'orange', icon: 'fire', name: '血战觉醒', tags: ['berserk', 'defense'],
      desc: 'HP<25% 时，全属性×2，持续至HP 回到 40%',
      onEquip(p, _g, _mult = 1) { p.stats._bloodAwakening = true; } },

    { id: 'death_domain', rarity: 'orange', icon: 'explosion', name: '死亡域', tags: ['explosion', 'death'],
      desc: '击杀时创建死亡域（半径 80，持续 3s 持续伤害）',
      onKill(p, enemy, dmg, game) { if (game.spawnDeathZone) game.spawnDeathZone(enemy.x, enemy.y, 80, 3, p.stats.damage * 0.3); } },

    { id: 'time_shard', rarity: 'orange', icon: 'speed', name: '时间碎裂', tags: ['time'],
      desc: '每波前 3 秒：自身攻速×3，敌人减速 50%',
      onWaveStart(p, game) { p.applyBuff('timeStart', 3, { atkSpd: 3 }); if (game?.slowAllEnemies) game.slowAllEnemies(0.5, 3); } },

    { id: 'hex_vortex', rarity: 'orange', icon: 'chaos', name: '海克斯漩涡', tags: ['field'],
      desc: '地图上每20s 生成旋涡，吸附并持续伤害经过敌人',
      _timer: 0,
      onUpdate(p, dt, game) { this._timer += dt; if (this._timer >= 20) { this._timer = 0; if (game?.spawnVortex) game.spawnVortex(p); } } },

    { id: 'all_in', rarity: 'orange', icon: 'chaos', name: '全力豪赌', tags: ['chaos', 'offense'], attackType: 'ranged',
      desc: '攻速-30%，但每次攻击触发三发弹幕',
      onEquip(p, _g, mult = 1) {
          if (mult >= 1) { p.stats.attackSpeed *= 0.7; p.stats.allInBullets = 3; }
          else { p.stats.allInBullets = (p.stats.allInBullets || 3) + Math.round(2 * mult); }
      } },

    // ─── 金色词条 ─────────────────────────────────────────
    { id: 'hex_privilege', rarity: 'gold', icon: 'gold', name: '六角特权', tags: ['slot'],
      desc: '词条携带上限从 6 提升至 10',
      onEquip(p, game, mult = 1) {
          const bonus = Math.round(4 * mult);
          p.stats.maxAugments = (p.stats.maxAugments || 6) + bonus;
          const am = game.augmentManager;
          if (am) am.maxSlots = (am.maxSlots || 6) + bonus;
      } },

    // 之前 hasTimeParadox 只写入不读取，是死代码。这里实现为"每波一次撤销死亡"：
    // 在 PlayerController.takeDamage() 濒死判定时消费该flag，回复50%HP并给予短暂无敌，
    // 而不是完整的"回到波次起点"状态快照回滚——后者需要整局状态序列化，超出核心玩法QA范围。
    { id: 'time_paradox', rarity: 'gold', icon: 'heart', name: '时间悖论', tags: ['time'],
      desc: '每波可倒流时间一次（撤销上一次死亡或回到波次起点）',
      onEquip(p, _g, _mult = 1) { p.stats.hasTimeParadox = true; p.stats._timeParadoxUsed = false; },
      onWaveStart(p) { p.stats._timeParadoxUsed = false; } },

    { id: 'core_overflow', rarity: 'gold', icon: 'shield', name: '核心溢出', tags: ['defense', 'berserk'],
      desc: 'HP<20% 触发：10s 无敌+全属性×3，到期回满至 50%',
      onEquip(p, _g, _mult = 1) { p.stats._coreOverflow = true; } },

    // 之前 hasCosmos 只写入不读取，是死代码。对齐 hexblast-py entities/player.py 的实现：
    // R 键触发（与大招 R 共用按键，走独立30s CD），消费点在 PlayerController.tick()。
    // “互相攻击”部分沿用 hexblast-py 自身也未实现的半成品行为（仅变色+5s后统一爆炸），
    // 记为已知限制，而非本次移植引入的新缺口。
    { id: 'cosmos_law', rarity: 'gold', icon: 'chaos', name: '宇宙法则', tags: ['chaos'],
      desc: '激活后5s 内所有敌人成为友方互相攻击，5s 后全体爆炸',
      onEquip(p, _g, _mult = 1) { p.stats.hasCosmos = true; } },

    // 之前 hasEternal 只写入不读取，是死代码。这里实现为：任意技能(Q/E/闪避)触发时，
    // 若持有该词条且自身30s CD已就绪，则将所有技能CD清零并进入10s攻速/伤害×2的
    // "永恒状态"增益（对齐 desc 的"CD归零+10s永恒状态"）。消费点见 PlayerController。
    { id: 'eternal_machine', rarity: 'gold', icon: 'lightning', name: '永恒机器', tags: ['skill', 'ultimate'],
      desc: '所有技能 CD 归零，进入 10s 永恒状态',
      _cd: 0,
      onEquip(p, _g, _mult = 1) { p.stats.hasEternal = true; },
      onUpdate(_p, dt) { this._cd = Math.max(0, this._cd - dt); },
      onSkill(p, game) {
          if (!p.stats.hasEternal || this._cd > 0) return;
          this._cd = 30;
          p.resetCooldowns?.();
          p.applyBuff('eternal_machine', 10, { atkSpd: 2, dmgMult: 2 });
          game?.floatingText?.spawn(p.x, p.y - 50, '永恒机器！', '#ffff66', 24, true);
      } },

    { id: 'big_bang', rarity: 'gold', icon: 'explosion', name: '大爆炸理论', tags: ['explosion'],
      desc: '所有爆炸范围×5，伤害×5',
      onEquip(p, _g, mult = 1) { p.stats.explosionMult = (p.stats.explosionMult || 0) + 5 * mult; } },

    { id: 'chaos_god', rarity: 'gold', icon: 'chaos', name: '混沌神明', tags: ['chaos', 'overload'],
      desc: '神明状态：所有词条效果×5，但每 10s 随机丢失 1 个词条',
      _timer: 0,
      onEquip(p, _g, _mult = 1) { p.stats.chaosGodActive = true; },
      onUpdate(p, dt, game) { if (p.stats.chaosGodActive) { this._timer += dt; if (this._timer >= 10) { this._timer = 0; if (game?.augmentManager?.removeRandom) game.augmentManager.removeRandom(); } } } },

    { id: 'six_prism', rarity: 'gold', icon: 'gold', name: '六芒永恒', tags: ['slot', 'overload'],
      desc: '每当获得新词条时，随机免费复制一个已有词条效果',
      onEquip(p, game, _mult = 1) { const am = game.augmentManager; if (am) am.onNextAugment = () => am.duplicateRandom(p, game); } },

    { id: 'death_note', rarity: 'gold', icon: 'crit', name: '死亡笔记', tags: ['offense'],
      desc: '攻击记录伤害，每 8s 对所有目标补造记录总量×50%',
      _accum: 0, _timer: 0,
      onHit(_p, _enemy, dmg) { this._accum += dmg; },
      onUpdate(_p, dt, game) { this._timer += dt; if (this._timer >= 8) { this._timer = 0; if (game?.damageAllEnemies) game.damageAllEnemies(this._accum * 0.5); this._accum = 0; } } },

    { id: 'absolute_zero', rarity: 'gold', icon: 'ice', name: '绝对零度', tags: ['ice'],
      desc: '每波开始：冻结全场敌人 5秒',
      onWaveStart(_p, game) { if (game?.freezeAllEnemies) game.freezeAllEnemies(5); } },
];
