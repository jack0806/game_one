// 章节成就的无引擎事件跟踪器。所有时间由组合根传入的战斗dt驱动。
import { AchievementStats, freshAchievementStats, PLAYABLE_HEROES } from '../data/AchievementDB';
import { DT_MAX } from '../core/Constants';

export interface AchievementRunOptions {
    hero: string; chapter: number; difficulty: string; equipment: any[];
    supply?: boolean; stats?: AchievementStats;
}
export interface SkillUse {
    slot: string; born: number; hits: Set<any>; kills: number; explosionKills: number;
    bones: number; target?: any; stored: number; pulled: number; captures: number;
    originX: number; originY: number; released?: boolean;
}
export interface AchievementSource {
    kind: string; key: string; hits: Set<any>; kills: number; souls: number;
    skill?: SkillUse; hex?: string; attack?: boolean; assassin?: boolean;
}
const RANGED = new Set(['archer', 'needle_gunner', 'ember_acolyte', 'frost_acolyte', 'acid_sac']);
const BUILDS = [
    ['hex26'], ['hex13', 'hex14'], ['hex20', 'hex21', 'hex22', 'hex23', 'hex19'],
    ['hex04', 'hex25'], ['hex27', 'hex08'],
];
const addUnique = (list: any[], value: any) => { if (list.indexOf(value) < 0) list.push(value); };

export class AchievementTracker {
    readonly stats: AchievementStats;
    active = true;
    dirty = false;
    time = 0;
    current?: AchievementSource;
    wave = 0;
    goldEarned = 0;
    dropGold = 0;
    grossSpent = 0;
    hexNet = 0;
    paidRefreshes = 0;
    droneKills = 0;
    damage = 0;
    turretDamage = 0;
    crits = 0;
    hurt = 0;
    meleeHurt = false;
    allSilver = true;
    private w: any = {};
    private bosses = new Map<any, any>();
    private minis = new Map<any, { born: number; ordinary: number }>();
    private ordinaryKills = 0;
    private killsAt: number[] = [];
    private used = new Set<string>();
    private lastMini?: number;
    private beastFast = new Set<number>();
    private maintained = BUILDS.map(() => false);
    private sword = false;
    private fullGear = true;
    private initialGear: string;
    private afterReik = -1;
    private guardAt = -1;
    private cloneAt = -1;
    private guardWave = -1;
    private cloneWave = -1;
    private doubleSave = false;
    private oliaMeleeArcherAt = -10;
    private useR?: SkillUse;
    private lastPosition?: [number, number];
    private shieldAbsorbed = 0;
    private taxRefreshes = 0;
    private shopNumber = 0;
    private shop: any = { initial: new Set(), paid: 0, free: 0, sold: [] };
    private soldHexes = new Set<string>();
    private pinnedAt = new Map<string, number>();
    private scavengers: { drops: Set<any>; picked: Set<any>; shop: number }[] = [];
    constructor(readonly options: AchievementRunOptions) {
        this.stats = JSON.parse(JSON.stringify(options.stats ?? freshAchievementStats()));
        this.initialGear = this.gearKey(options.equipment);
        if (options.supply) this.mark(128);
    }
    get normal(): boolean { return ['normal', 'hard', 'hell'].indexOf(this.options.difficulty) >= 0; }
    get hard(): boolean { return ['hard', 'hell'].indexOf(this.options.difficulty) >= 0; }
    get hell(): boolean { return this.options.difficulty === 'hell'; }
    mark(number: number, value = 1): void {
        if (this.active && Number.isFinite(value) && value > (this.stats.values[number] ?? 0)) {
            this.stats.values[number] = value; this.dirty = true;
        }
    }
    source(kind: string, key = '', parent = this.current): AchievementSource {
        return { kind, key, hits: new Set(), kills: 0, souls: 0,
            skill: ['hex', 'dot', 'passive', 'environment'].indexOf(kind) >= 0 ? undefined : parent?.skill,
            hex: kind === 'hex' ? key : ['environment', 'passive'].indexOf(kind) >= 0 ? undefined : parent?.hex,
            attack: kind === 'melee' || kind === 'auto' ||
                (['projectile', 'explosion'].indexOf(kind) >= 0 && !!parent?.attack),
        };
    }
    enter(source?: AchievementSource): () => void {
        const before = this.current; this.current = source;
        return () => { this.current = before; };
    }
    scope<T>(kind: string, key: string, action: () => T): T {
        const source = this.source(kind, key);
        const leave = this.enter(source);
        try { return action(); } finally { leave(); }
    }
    has(game: any, ...ids: string[]): boolean {
        return ids.every(id => !!game.augmentManager?.ownedOf(id));
    }
    private gearKey(items: any[]): string {
        return items.map(e => e.uid + ':' + e.affix + ':' + e.quality).sort().join('|');
    }
    startWave(wave: number, player: any, game: any): void {
        if (!this.active || wave < 1 || wave > 15) return;
        this.wave = wave;
        this.w = { start: this.time, hurt: 0, healing: 0, shieldGrants: 0, shieldSpent: 0,
            shieldPending: false, skills: new Set(), kills: 0, firstKill: false, broken: false,
            movement: 0, pickups: 0, forms: { ranged: 0, melee: 0 }, hexKills: {}, low: false,
            cloneRecovered: false, guardRecovered: false };
        this.lastMini = undefined;
        this.lastPosition = [player.x, player.y];
        if (wave === 5) this.sword = this.has(game, 'hex26');
        if (wave === 10) this.maintained = BUILDS.map(ids => this.has(game, ...ids));
        this.observe(player, game);
    }
    advance(dt: number, player: any, game: any): void {
        if (!this.active) return;
        this.time += Math.max(0, Math.min(DT_MAX, dt));
        this.recordMovement(player);
        this.observe(player, game);
        if (this.w.firstKill && (game.comboCount ?? 0) === 0) this.w.broken = true;
    }
    recordMovement(player: any): void {
        if (!this.active) return;
        if (this.wave > 0 && this.lastPosition) this.w.movement += Math.hypot(player.x - this.lastPosition[0], player.y - this.lastPosition[1]);
        this.lastPosition = [player.x, player.y];
    }
    observe(player: any, game: any): void {
        if (!this.active) return;
        const am = game.augmentManager;
        const all = am?.all() ?? [];
        const skillIds = Array.from(new Set((am?.active ?? []).map(a => a.id)));
        this.mark(35, skillIds.length); this.mark(36, skillIds.length); this.mark(57, all.length);
        if (this.has(game, 'hex13', 'hex14')) this.mark(37);
        for (const [id, n] of [['hex01', 39], ['hex02', 40], ['hex03', 41], ['hex07', 42], ['hex11', 43]] as [string, number][]) {
            if (all.some(a => a.id === id && a.level >= 3)) this.mark(n);
        }
        if (new Set((am?.functional ?? []).filter(a => a.level >= 3).map(a => a.id)).size >= 3) this.mark(53);
        if (this.has(game, 'hex20', 'hex21', 'hex22', 'hex23')) this.mark(56);
        if (this.has(game, ...BUILDS[2])) this.mark(58);
        const turrets = (game.turrets ?? []).filter(t => t.alive);
        if (turrets.filter(t => t.hexTag === 'hexDroneAttack').length >= 3 &&
            turrets.filter(t => t.hexTag === 'hexDroneSupport').length >= 2) this.mark(49);
        if (this.options.hero === 'mortis' && turrets.filter(t => t.kind === 'skeleton').length >= 4) this.mark(82);
        if (this.wave >= 5) this.sword = this.sword && this.has(game, 'hex26');
        if (this.wave >= 10) this.maintained = this.maintained.map((ok, i) => ok && this.has(game, ...BUILDS[i]));
        for (const b of Array.from(this.bosses.values())) {
            b.zeroArmor = b.zeroArmor && player.stats.armor === 0 && this.has(game, 'hex09');
            b.elements = b.elements && this.has(game, ...BUILDS[2]);
        }
        // 实际带入属性以开局快照为准；Boss奖励自动入仓/填格不改变本局配装。
        const fraction = player.hp / player.stats.maxHp;
        if (this.wave > 0) {
            if (fraction <= 0.25) this.w.low = true;
            if (this.afterReik >= this.time && player.alive !== false && fraction >= 0.5) { this.mark(75); this.afterReik = -1; }
            if (this.cloneAt >= 0 && this.time - this.cloneAt <= 10 && fraction >= 0.25) this.w.cloneRecovered = true;
            if (this.guardAt >= 0 && this.time - this.guardAt <= 10 && fraction >= 0.5) this.w.guardRecovered = true;
        }
        if (this.options.hero === 'olia' && player.attackForm !== 'melee' && this.time - this.oliaMeleeArcherAt <= 3) this.mark(150);
    }
    enemyBorn(enemy: any, player: any, game: any): void {
        if (enemy.isBoss) this.bosses.set(enemy, { born: this.time, hurt: this.hurt, heal: 0, skills: 0,
            low: player.hp / player.stats.maxHp <= 0.1, volley: 0, elementsCount: 0,
            elements: this.has(game, ...BUILDS[2]), zeroArmor: player.stats.armor === 0 && this.has(game, 'hex09') });
        if (enemy.isMiniBoss) this.minis.set(enemy, { born: this.time, ordinary: this.ordinaryKills });
    }
    beginSkill(slot: string, player: any, game: any): AchievementSource {
        const use: SkillUse = { slot, born: this.time, hits: new Set(), kills: 0, explosionKills: 0,
            bones: (game.turrets ?? []).filter(t => t.alive && t.kind === 'skeleton').length,
            target: player.stats._stolenSkill?.target, stored: player.stats._intercept?.stored?.length ?? 0,
            pulled: 0, captures: 0, originX: player.x, originY: player.y };
        const source = this.source('skill', slot); source.skill = use; source.attack = false;
        if (this.wave > 0) this.w.skills.add(slot);
        for (const boss of Array.from(this.bosses.values())) boss.skills++;
        if (slot === 'r') { this.useR = use; if (this.options.hero === 'reik') this.afterReik = this.time + 15; }
        return source;
    }
    endSkill(source: AchievementSource, player: any, game: any): void {
        const use = source.skill;
        if (!use) return;
        if (use.slot === 'e' && this.options.hero === 'vivian' &&
            (game.turrets ?? []).filter(t => t.alive && ['turret', 'orbitTurret'].indexOf(t.kind) >= 0 && t._buffTimer > 0).length >= 3) this.mark(71);
        if (use.slot === 'q' && this.options.hero === 'via' && use.target && !player.stats._stolenSkill) { use.released = true; this.mark(79); }
        this.evaluateSource(source, player);
        this.observe(player, game);
    }
    emitter(source: AchievementSource, emitter: any, player: any): void {
        const use = source?.skill;
        if (!use) return;
        use.pulled = Math.max(use.pulled, emitter._pulled?.size ?? 0);
        use.captures = Math.max(use.captures, emitter._captures ?? 0);
        if (this.options.hero === 'olia' && use.slot === 'q' && emitter.alive === false &&
            use.hits.size >= 3 && Math.hypot(player.x - use.originX, player.y - use.originY) < 2) this.mark(76);
        this.evaluateSource(source, player);
    }
    hit(enemy: any, actual: number, source: AchievementSource, player: any, game: any): void {
        if (!this.active || actual <= 0) return;
        this.damage += actual;
        source.hits.add(enemy);
        if (source.skill) source.skill.hits.add(enemy);
        if (source.skill && ['q', 'e'].indexOf(source.skill.slot) >= 0) this.mark(3);
        if (this.options.hero === 'vivian' && source.skill && ['q', 'r'].indexOf(source.skill.slot) >= 0 &&
            source.kind !== 'skill') this.turretDamage += actual;
        if (source.kind === 'projectile') {
            if (source.hits.size >= 2) this.mark(14);
            if (source.hits.size >= 5) this.mark(23);
            if (source.attack && !source.hex && this.has(game, 'hex05', 'hex22') && source.hits.size >= 3) this.mark(38);
        }
        if (source.kind === 'melee' && source.hits.size >= 3) this.mark(15);
        if (source.hex === 'hex10') this.mark(44);
        if (this.has(game, 'hex21', 'hex23') && enemy.slowMult < 1 && (enemy.dots ?? []).some(d => d.type === 'hex_fire')) this.mark(47);
        this.evaluateSource(source, player);
    }
    soul(amount: number, player: any): void {
        if (this.current && amount > 0) { this.current.souls += amount; this.evaluateSource(this.current, player); }
    }
    critical(): void { this.crits++; if (this.hasGear('crit') && this.crits >= 10) this.mark(95); }
    kill(enemy: any, source: AchievementSource, player: any, game: any): void {
        if (!this.active) return;
        this.mark(2); source.kills++;
        if (source.skill) { source.skill.kills++; if (source.kind === 'explosion') source.skill.explosionKills++; }
        if (source.assassin) this.mark(46);
        if (this.wave > 0) {
            this.w.kills++; this.w.firstKill = true;
            if (this.time - this.w.start <= 5 && this.w.kills >= 5) this.mark(17);
            this.w.forms[player.attackForm === 'melee' ? 'melee' : 'ranged']++;
            if (this.options.hero === 'olia' && this.w.forms.melee >= 5 && this.w.forms.ranged >= 5) this.mark(77);
            if (source.hex) this.w.hexKills[source.hex] = (this.w.hexKills[source.hex] ?? 0) + 1;
            if ((this.w.hexKills.hex04 ?? 0) >= 5 && (this.w.hexKills.hex25 ?? 0) >= 5) this.mark(50);
        }
        this.killsAt.push(this.time);
        while (this.killsAt.length && this.time - this.killsAt[0] > 10) this.killsAt.shift();
        if (this.killsAt.length >= 15) this.mark(25);
        if (source.kind === 'explosion') { if (source.kills >= 3) this.mark(16); if (source.kills >= 6) this.mark(26); }
        if (source.kind === 'melee' && source.kills >= 5) this.mark(24);
        if (source.hex === 'hex25') this.mark(45);
        if (source.hex === 'hex13' || source.hex === 'hex14') this.droneKills++;
        if (RANGED.has(enemy.type)) {
            const melee = (game.enemies ?? []).filter(e => e !== enemy && e.alive && !e.isBoss && !e.isMiniBoss && !RANGED.has(e.type));
            if (melee.length >= 3) this.mark(19);
            if (this.options.hero === 'olia' && player.attackForm === 'melee') this.oliaMeleeArcherAt = this.time;
        }
        if (enemy.isMiniBoss) {
            const mini = this.minis.get(enemy);
            if (mini && mini.ordinary === this.ordinaryKills) this.mark(28);
            if (this.wave === 10 && this.lastMini !== undefined && this.time - this.lastMini <= 8) this.mark(27);
            if (this.wave === 10) this.lastMini = this.time;
            if (player._charDef?.attackType === 'melee' && this.has(game, 'hex20', 'hex22')) this.mark(48);
            if ((game.augmentManager?.active ?? []).some(a => a.level >= 3)) this.mark(51);
        } else if (!enemy.isBoss && !enemy.isElite) this.ordinaryKills++;
        const boss = this.bosses.get(enemy);
        if (boss) {
            if (this.normal && this.time - boss.born <= 45) this.mark(32);
            if (this.hell && boss.skills === 0) this.mark(34);
            if (this.normal && boss.zeroArmor) this.mark(62);
            if (this.hard && boss.elements && boss.elementsCount >= 10) this.mark(64);
            if (this.normal && this.hurt === boss.hurt) this.mark(144);
            if (this.hell && boss.low && boss.heal === 0 && this.hurt === boss.hurt) this.mark(147);
            this.bosses.delete(enemy);
        }
        const duration = { kai: 8, vivian: 8, reik: 8, olia: 5, via: 5, mortis: 15 }[this.options.hero] ?? 0;
        if (this.useR && this.time - this.useR.born <= duration) {
            (this.useR as any).windowKills = ((this.useR as any).windowKills ?? 0) + 1;
            this.mark(4);
            if (this.options.hero === 'kai' && (this.useR as any).windowKills >= 10 && this.useR.explosionKills >= 5) this.mark(69);
        }
        if (this.options.hero === 'via' && source.skill?.target === enemy && source.skill.slot === 'q') this.mark(152);
        this.evaluateSource(source, player);
    }
    evaluateSource(source: AchievementSource, player: any): void {
        const u = source?.skill; if (!u) return;
        switch (this.options.hero) {
            case 'kai':
                if (u.slot === 'q' && u.hits.size >= 3) this.mark(67);
                if (u.slot === 'e' && u.hits.size >= 5) this.mark(68);
                break;
            case 'vivian': if (u.slot === 'q' && u.kills >= 3) this.mark(70); break;
            case 'reik': if (u.slot === 'q' && u.hits.size >= 5) this.mark(73); break;
            case 'olia': if (u.slot === 'r' && u.pulled >= 4 && u.explosionKills >= 5) this.mark(78); break;
            case 'via': if (u.slot === 'r' && u.captures >= 8 && u.explosionKills >= 5) this.mark(81); break;
            case 'mortis':
                if (u.slot === 'q' && source.kind === 'projectile' && source.hits.size >= 5 && source.souls >= 5) this.mark(83);
                if (u.slot === 'r' && u.bones >= 8 && u.explosionKills >= 10) this.mark(84);
                break;
        }
    }
    elementVolley(): void {
        for (const b of Array.from(this.bosses.values())) { b.volley++; this.mark(59, b.volley); }
    }
    elementExplosion(): void { for (const b of Array.from(this.bosses.values())) b.elementsCount++; }
    received(health: number, shield: number, melee = false): void {
        if (!this.active || health + shield <= 0) return;
        this.hurt++;
        if (this.wave > 0) {
            this.w.hurt++;
            if (shield > 0 && this.w.shieldPending) { this.w.shieldSpent++; this.w.shieldPending = false; }
        }
        if (melee) this.meleeHurt = true;
        this.shieldAbsorbed += shield;
        this.mark(136, this.shieldAbsorbed);
    }
    healed(amount: number, maxHp: number): void {
        if (!this.active || amount <= 0) return;
        if (this.wave > 0) this.w.healing += amount / maxHp;
        for (const b of Array.from(this.bosses.values())) b.heal += amount;
    }
    shieldGranted(amount: number): void {
        if (this.wave > 0 && amount > 0) { this.w.shieldGrants++; this.w.shieldPending = true; }
    }
    guardTriggered(): void {
        this.guardAt = this.time; this.guardWave = this.wave; this.checkDoubleSave();
    }
    cloneTriggered(): void {
        this.cloneAt = this.time; this.cloneWave = this.wave; this.checkDoubleSave();
    }
    private checkDoubleSave(): void { if (this.wave > 0 && this.guardWave === this.wave && this.cloneWave === this.wave) this.doubleSave = true; }
    hasGear(affix: string): boolean { return this.options.equipment.some(e => e.affix === affix); }
    acquired(card: any, beforeLevel: number, beforeArmor: number, blueprint: boolean, player: any, game: any): void {
        const id = card.id;
        addUnique(this.stats.hexIds, id);
        if ((game.augmentManager?.active ?? []).some(a => a.id === id)) this.used.add(id);
        this.mark(7); this.mark(52, this.used.size);
        const now = game.augmentManager?.ownedOf(id);
        if (beforeLevel === 1 && now?.level >= 2) this.mark(8);
        if (blueprint && !beforeLevel && now?.level >= 2) this.mark(55);
        if (id === 'hex09' && beforeArmor >= 20 && player.stats.armor === 0) this.mark(54);
        if (card.rarity !== 'silver') this.allSilver = false;
        this.observe(player, game);
    }
    purchased(cost: number, balance: number): void {
        this.hexNet += cost; this.grossSpent += cost; this.mark(130, this.hexNet);
        if (cost > 0 && balance === 0) this.mark(125);
    }
    sold(refund: number): void { this.hexNet -= refund; }
    refresh(cost: number, tax: boolean): void {
        this.grossSpent += cost;
        if (cost > 0) {
            this.paidRefreshes++;
            if (tax) this.mark(131, ++this.taxRefreshes);
        }
    }
    picked(amount: number): void {
        this.dropGold += amount;
        if (this.wave > 0 && this.hasGear('greed') && ++this.w.pickups >= 10) this.mark(96);
    }
    shopOpened(cards: any[]): void {
        this.shopNumber++;
        this.shop = { initial: new Set(cards.map(a => a.id)), paid: 0, free: 0, sold: [] };
    }
    shopBought(card: any, cost: number, balance: number): void {
        this.purchased(cost, balance);
        if (this.shop.sold.some(id => id !== card.id)) this.mark(126);
        if (this.shop.paid >= 3 && this.shop.initial.has(card.id)) this.mark(148);
        if (this.shop.free >= 5) this.mark(132);
        if (this.soldHexes.has(card.id)) this.mark(149);
        if (this.pinnedAt.has(card.id) && this.wave > this.pinnedAt.get(card.id)) this.mark(127);
        if (card.id === 'hex16' && this.scavengers.some(s => s.shop === this.shopNumber && s.drops.size > 0 && s.picked.size === s.drops.size)) this.mark(153);
    }
    shopSold(id: string, refund: number): void {
        this.sold(refund); this.shop.sold.push(id); this.soldHexes.add(id);
    }
    shopRefreshed(cost: number, tax: boolean): void {
        this.refresh(cost, tax);
        if (cost > 0) this.shop.paid++; else this.shop.free++;
    }
    pinned(id: string): void { if (!this.pinnedAt.has(id)) this.pinnedAt.set(id, this.wave); }
    scavengerSlain(drops: any[]): void {
        this.scavengers.push({ drops: new Set(drops.filter(d => d.kind !== 'joker_doll')), picked: new Set(), shop: this.shopNumber + 1 });
    }
    goldDropPicked(drop: any): void {
        for (const s of this.scavengers) if (s.drops.has(drop)) s.picked.add(drop);
    }
    cleared(player: any, game: any): void {
        if (!this.active || this.wave < 1) return;
        this.recordMovement(player);
        this.observe(player, game);
        this.mark(5, this.wave); this.mark(6, this.wave);
        if (this.w.skills.size === 3) this.mark(20);
        if (this.wave === 13 && this.normal && this.w.firstKill && !this.w.broken) this.mark(31);
        if (this.wave === 9 && this.normal && !this.w.hurt) this.mark(138);
        if (this.wave === 13 && this.normal && !this.w.hurt) this.mark(139);
        if ((this.wave === 9 || this.wave === 13) && this.hell && !this.w.hurt && this.time - this.w.start <= 20) this.beastFast.add(this.wave);
        if (this.beastFast.size === 2) this.mark(33);
        if (this.w.low) this.mark(137);
        if (this.w.healing >= 0.5) this.mark(140);
        if (this.w.shieldSpent >= 3) this.mark(141);
        if (this.w.cloneRecovered) this.mark(142);
        if (this.w.guardRecovered) this.mark(143);
        if (this.wave === 13 && this.hard && !this.w.hurt && this.w.movement <= 10) this.mark(155);
        if (this.hasGear('spd') && this.wave === 9) this.mark(94);
        if (this.options.equipment.length === 3 && this.wave === 5) this.mark(97);
        for (const e of this.options.equipment) addUnique(this.stats.equippedAffixes, e.affix);
    }
    finish(won: boolean, player: any, game: any): AchievementStats {
        if (!this.active) return this.stats;
        this.observe(player, game);
        if (this.hasGear('hp')) this.mark(92);
        if (this.hasGear('dmg')) this.mark(93);
        if (won) {
            this.mark(10);
            addUnique(this.stats.winsByHero, this.options.hero);
            if (this.hard) this.mark(117);
            if (this.hard && this.options.chapter % 5 === 0) {
                addUnique(this.stats.hardBossHeroes, this.options.hero);
                addUnique(this.stats.hardBossMaps, this.options.chapter / 5);
            }
            if (this.normal) {
                if (this.options.chapter === 8) this.mark(118);
                if (this.options.chapter === 22) this.mark(119);
                if (this.options.chapter === 29) this.mark(120);
                if (this.sword && this.wave >= 15) this.mark(60);
                if (this.options.hero === 'vivian' && this.damage > 0 && this.turretDamage / this.damage >= 0.6) this.mark(72);
                for (let i = 0; i < BUILDS.length; i++) if (this.maintained[i] && this.wave >= 15) {
                    // 一场胜局只填一个尚未完成的流派，五条需要五场胜局。
                    if (this.stats.buildWins.indexOf(String(i)) < 0) { addUnique(this.stats.buildWins, String(i)); break; }
                }
                const eq = this.options.equipment;
                if (this.fullGear && eq.length === 3) {
                    if (new Set(eq.map(e => e.quality)).size === 3) this.mark(100);
                    if (new Set(eq.map(e => e.affix)).size === 1 && new Set(eq.map(e => e.quality)).size === 3) this.mark(101);
                    if (eq.every(e => e.quality === 2)) this.mark(102);
                    if (this.hard && this.options.chapter % 5 === 0 && eq.every(e => e.quality === 0)) this.mark(103);
                }
                if (this.fullGear && eq.length === 0 && this.options.chapter % 5 === 0) this.mark(104);
                if (!this.paidRefreshes && this.hexNet >= 1500) this.mark(134);
                if (!this.meleeHurt) this.mark(145);
            }
            if (this.droneKills >= 150) this.mark(61, this.droneKills);
            if (this.dropGold >= 2000) this.mark(133);
            if (this.hard && this.options.chapter === 5 && this.grossSpent <= 500 && !this.options.supply) this.mark(135);
            if (this.hard && !this.hurt && this.wave === 15) this.mark(146);
            if (this.hell && this.options.chapter % 5 === 0 && this.allSilver) this.mark(65);
            if (this.hell && this.options.chapter === 30) this.mark(123);
            if (this.doubleSave) this.mark(154);
        }
        this.active = false;
        return this.stats;
    }
}
