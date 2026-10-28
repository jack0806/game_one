'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cc = require('cc');
const { ACHIEVEMENTS, achievementId, freshAchievementStats, PLAYABLE_HEROES } = require('../dist/data/AchievementDB');
const { AchievementTracker } = require('../dist/systems/AchievementTracker');
const { bindAchievementGame, bindAchievementEnemy } = require('../dist/systems/AchievementGameBridge');
const { SaveSystem } = require('../dist/systems/SaveSystem');
const { AchievementAdmin } = require('../dist/systems/AchievementAdmin');
const { AugmentManager } = require('../dist/systems/AugmentManager');
const { AUGMENT_DB, spawnExplosion } = require('../dist/data/AugmentDB');
const { PlayerController } = require('../dist/entities/PlayerController');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { BulletPool } = require('../dist/entities/BulletController');
const { Economy } = require('../dist/systems/Economy');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { makeMockGame, makePlayer } = require('./mockGame');

function game(options = {}) {
    const am = new AugmentManager(), bullets = new BulletPool(50), economy = new Economy();
    const g = makeMockGame({ state: 'playing', wave: 1, runId: 1, turrets: [],
        augmentManager: am, bullets, bulletPool: bullets, economy,
        input: { mouse: { active: true, x: 600, y: 300 } },
        grantSoul(p) { p.stats._souls = Math.min(60, (p.stats._souls ?? 0) + 1); },
        spawnLifeClone() {},
        after(_seconds, fn) { this.pending = fn; },
        spawnExplosion(p, x, y, d, r) { spawnExplosion(p, x, y, d, r, this); },
    });
    g.player = new PlayerController();
    const def = CHARACTERS[options.hero ?? 'kai'];
    Object.assign(g.player, { charId: def.id, _charDef: def, _game: g,
        stats: { ...def.stats, cdReduction: 0, critRate: 0, rangeBonus: 0 }, hp: def.stats.maxHp });
    def.passive?.(g.player, g);
    g.player.x = 300; g.player.y = 300;
    g.achievementTracker = new AchievementTracker({ hero: g.player.charId, chapter: 5,
        difficulty: 'normal', equipment: [], ...options });
    bindAchievementGame(g);
    g.achievementTracker.startWave(1, g.player, g);
    return g;
}
function enemy(g, overrides = {}) {
    const e = new EnemyBase();
    Object.assign(e, { hp: 20, maxHp: 20, x: 340, y: 300 }, overrides);
    g.enemies.push(e); bindAchievementEnemy(g, e);
    return e;
}
function has(g, n) { return (g.achievementTracker.stats.values[n] ?? 0) >= ACHIEVEMENTS[n - 1].goal; }
function fresh() {
    cc.sys.localStorage._clear(); SaveSystem.resetCache(); SaveSystem.selectSlot(0);
    AchievementAdmin.resetAll();
}
function wave(g, n) { g.wave = n; g.achievementTracker.startWave(n, g.player, g); }
function own(g, ids) {
    for (const id of ids) {
        const a = { ...AUGMENT_DB.find(a => a.id === id), level: 1 };
        (a.category === '功能' ? g.augmentManager.functional : g.augmentManager.active).push(a);
    }
    g.achievementTracker.observe(g.player, g);
}
function finish(g, won = true) { return g.achievementTracker.finish(won, g.player, g); }

test('160项规格与批准的十类和稀有度配额完全一致，隐藏8项且不含无尽条件', () => {
    assert.equal(ACHIEVEMENTS.length, 160);
    assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, 160);
    assert.equal(new Set(ACHIEVEMENTS.map(a => a.name)).size, 160);
    assert.deepEqual(ACHIEVEMENTS.map(a => a.number), Array.from({ length: 160 }, (_, i) => i + 1));
    const count = key => ACHIEVEMENTS.reduce((out, a) => (out[a[key]] = (out[a[key]] ?? 0) + 1, out), {});
    assert.deepEqual(count('rarity'), { 普通: 64, 稀有: 48, 史诗: 32, 传奇: 16 });
    assert.deepEqual(count('category'), { 入门: 10, 战斗: 24, 构筑: 32, 英雄: 24, 装备: 15, 地图: 18, 经营: 12, 生存: 12, 隐藏: 8, 里程碑: 5 });
    assert.equal(ACHIEVEMENTS.filter(a => a.hidden).length, 8);
    for (const a of ACHIEVEMENTS) {
        assert.doesNotMatch(a.desc, /无尽|噩梦|格雷夫|利亚娜/);
        assert.ok(a.goal > 0 && a.desc && a.artKey && a.rewardCoins > 0);
    }
});

test('旧档ID完整保留、历史荣誉独立展示、读档不重复发奖且不臆造困难胜场', () => {
    fresh();
    const ids = ['first_run', 'boss_300', 'joker_doll', 'kills_1000', '未知旧荣誉'];
    cc.sys.localStorage.setItem(SaveSystem.slotKey(0), JSON.stringify({
        version: 2, achievements: ids, coreCoins: 900, chaptersCleared: 30, charsPlayed: PLAYABLE_HEROES,
        equipments: [{ uid: 'old', affix: 'hp', quality: 0 }],
    }));
    SaveSystem.resetCache();
    assert.deepEqual(SaveSystem.load().achievements, ids);
    assert.deepEqual(SaveSystem.load().achievementStats.equipmentKeys, ['hp:0']);
    assert.deepEqual(SaveSystem.load().achievementStats.hardBossMaps, []);
    assert.deepEqual(SaveSystem.legacyAchievements().map(a => a.id), ['kills_1000', 'joker_doll']);
    assert.equal(SaveSystem.coreCoins(), 900);
    SaveSystem.save(); SaveSystem.resetCache();
    assert.deepEqual(SaveSystem.load().achievements, ids);
});

test('元成就同次结算达到稳定，18个专属成就不会迟一局，奖励幂等', () => {
    fresh();
    const s = freshAchievementStats();
    for (let n = 67; n <= 84; n++) s.values[n] = 1;
    const unlocked = SaveSystem.recordAchievementStats(s);
    assert.ok(unlocked.some(a => a.number === 88));
    assert.ok(unlocked.some(a => a.number === 90));
    const balance = SaveSystem.coreCoins();
    assert.deepEqual(SaveSystem.recordAchievementStats(s), []);
    assert.equal(SaveSystem.coreCoins(), balance);
});

test('跨槽、导出导入与统计合并隔离；卖出不抹去历史装备收藏', () => {
    fresh();
    SaveSystem.addEquipment({ uid: 'a', affix: 'hp', quality: 0 });
    SaveSystem.removeEquipment('a');
    assert.deepEqual(SaveSystem.load().achievementStats.equipmentKeys, ['hp:0']);
    const s = freshAchievementStats(); s.values[67] = 1; s.hexIds.push('hex01');
    SaveSystem.recordAchievementStats(s);
    SaveSystem.selectSlot(1);
    assert.deepEqual(SaveSystem.load().achievementStats.hexIds, []);
    SaveSystem.selectSlot(0);
    const code = SaveSystem.exportSaveCode();
    SaveSystem.deleteSlot(0); assert.ok(SaveSystem.importSaveCode(code));
    assert.equal(SaveSystem.load().achievementStats.values[67], 1);
    s.values[67] = 0; s.hexIds.length = 0;
    assert.deepEqual(SaveSystem.load().achievementStats.hexIds, ['hex01']);
    SaveSystem.setEquipSlot(0, null);
    assert.deepEqual(SaveSystem.equippedItems(), []);
});

test('无伤包含护盾承伤；完全免疫不算受伤，自身主动扣血也不误算', () => {
    const g = game({ difficulty: 'hard' }); wave(g, 9);
    g.player.shield = 50; g.player.takeDamage(10, g);
    assert.equal(g.achievementTracker.hurt, 1);
    g.achievementTracker.cleared(g.player, g);
    assert.equal(has(g, 138), false);
    const immune = game({ hero: 'reik', difficulty: 'hard' }); wave(immune, 9);
    immune.player._charDef.ultimate(immune.player, immune);
    immune.player._invincible = 3;
    immune.player.takeDamage(20, immune);
    immune.achievementTracker.cleared(immune.player, immune);
    assert.equal(has(immune, 138), true);
});

test('护盾吸收量按单局累计，溢出治疗不计有效治疗', () => {
    const g = game();
    g.player.shield = 60; g.player.takeDamage(50, g);
    assert.ok(has(g, 136));
    g.player.heal(1000, false);
    g.achievementTracker.cleared(g.player, g);
    assert.equal(has(g, 140), false);
});

test('实际伤害排除过杀，单次爆炸多杀不冒充穿透弹或普攻', () => {
    const g = game();
    for (let i = 0; i < 6; i++) enemy(g, { x: 340 + i });
    g.spawnExplosion(g.player, 340, 300, 1e9, 100);
    assert.equal(g.achievementTracker.damage, 120);
    assert.ok(has(g, 16)); assert.ok(has(g, 26));
    assert.equal(has(g, 14), false); assert.equal(has(g, 24), false);
});

test('穿透以同一池弹实例的一次发射计数，回收再用不沿用前次来源', () => {
    const g = game();
    const b = g.bulletPool.spawn({ x: 340, y: 300, vx: 0, vy: 0, damage: 1, pierceLeft: 10 });
    enemy(g); enemy(g, { x: 341 });
    g.bulletPool.update(0.01, g.enemies, g.player, g);
    assert.ok(has(g, 14));
    assert.equal(b.achievementSource.hits.size, 2);
    g.bulletPool.reset();
    const again = g.bulletPool.spawn({ x: 10, y: 10 });
    assert.equal(again.achievementSource.hits.size, 0);
});

test('近战挥击命中扇区内多个目标，掩体、背后和超距目标不被计入', () => {
    const g = game({ hero: 'reik' });
    const inside = [enemy(g, { x: 350, y: 300 }), enemy(g, { x: 350, y: 310 }), enemy(g, { x: 350, y: 290 })];
    const behind = enemy(g, { x: 200, y: 300 });
    const far = enemy(g, { x: 900, y: 300 });
    const blocked = enemy(g, { x: 360, y: 300 });
    g.arenaLineClear = (_x, _y, x) => x !== 360;
    g.player._meleeAttack(g, inside[0], 0);
    assert.ok(has(g, 15));
    assert.ok(inside.every(e => !e.alive));
    assert.equal(behind.hp, 20); assert.equal(far.hp, 20); assert.equal(blocked.hp, 20);
});

test('五格构筑、四元素门槛和功能重复实例按实际持有统计', () => {
    const g = game();
    own(g, ['hex20', 'hex21', 'hex22', 'hex23', 'hex19']);
    assert.ok(has(g, 35)); assert.ok(has(g, 36)); assert.ok(has(g, 56)); assert.ok(has(g, 58));
    for (let i = 0; i < 7; i++) g.augmentManager.functional.push({ id: 'hex01', level: 3 });
    g.achievementTracker.observe(g.player, g);
    assert.ok(has(g, 57)); assert.equal(has(g, 53), false);
});

test('飞剑和五种流派要求从指定波次持续持有，中途卖出即失效', () => {
    const g = game(); own(g, ['hex26']); wave(g, 5);
    g.augmentManager.active = []; g.achievementTracker.observe(g.player, g);
    own(g, ['hex26']); wave(g, 10); wave(g, 15); finish(g);
    assert.equal(has(g, 60), false);
    assert.deepEqual(g.achievementTracker.stats.buildWins, ['0']);
    const two = game({ stats: g.achievementTracker.stats }); own(two, ['hex26']); wave(two, 10); wave(two, 15); finish(two);
    assert.deepEqual(two.achievementTracker.stats.buildWins, ['0']);
});

test('三种功能强化不是三个重复实例，升级和蓝图不会互相冒充', () => {
    const g = game();
    const am = g.augmentManager;
    am.equip({ ...AUGMENT_DB[0], level: 1, rarity: 'silver' }, g.player, g);
    am.equip({ ...AUGMENT_DB[0], level: 2, rarity: 'gold' }, g.player, g);
    assert.ok(has(g, 7)); assert.ok(has(g, 8)); assert.equal(has(g, 55), false);
    assert.equal(g.achievementTracker.allSilver, false);
    am.nextLevelBonus = 1;
    am.equip({ ...AUGMENT_DB.find(a => a.id === 'hex02'), level: 1, rarity: 'silver' }, g.player, g);
    assert.ok(has(g, 55));
});

test('商店刷新、跨波固定、卖出重购、付费失败与净支出按同次货架区分', () => {
    const g = game(), t = g.achievementTracker;
    t.shopOpened([{ id: 'hex01' }]);
    t.pinned('hex01'); t.shopSold('hex02', 75);
    for (let i = 0; i < 3; i++) t.shopRefreshed(5, true);
    t.shopBought({ id: 'hex01' }, 100, 0);
    assert.ok(has(g, 125)); assert.ok(has(g, 126)); assert.ok(has(g, 148));
    assert.equal(has(g, 127), false);
    wave(g, 2); t.shopOpened([{ id: 'hex02' }]);
    t.shopBought({ id: 'hex01' }, 100, 10); assert.ok(has(g, 127));
    t.shopBought({ id: 'hex02' }, 100, 10); assert.ok(has(g, 149));
    for (let i = 0; i < 5; i++) t.shopRefreshed(0, false);
    t.shopBought({ id: 'hex03' }, 0, 10); assert.ok(has(g, 132));
    assert.equal(t.paidRefreshes, 3);
});

test('掠金虫彩蛋需要拾取该只虫的全部掉落并在下一次货架购买点金手', () => {
    const g = game(), t = g.achievementTracker;
    const a = {}, b = {}; t.scavengerSlain([a, b]);
    t.goldDropPicked(a); t.shopOpened([]);
    t.shopBought({ id: 'hex16' }, 40, 20); assert.equal(has(g, 153), false);
    t.goldDropPicked(b); t.shopBought({ id: 'hex16' }, 40, 20); assert.ok(has(g, 153));
    const late = game(), lt = late.achievementTracker;
    lt.scavengerSlain([a]); lt.goldDropPicked(a); lt.shopOpened([]); lt.shopOpened([]);
    lt.shopBought({ id: 'hex16' }, 40, 0); assert.equal(has(late, 153), false);
});

test('难度和通关门槛不从阵亡、到达波次或普通胜利推断', () => {
    const easy = game({ difficulty: 'easy', chapter: 30 }); wave(easy, 15); finish(easy);
    assert.equal(has(easy, 117), false); assert.equal(has(easy, 123), false);
    assert.deepEqual(easy.achievementTracker.stats.hardBossMaps, []);
    const failed = game({ difficulty: 'hell', chapter: 30 }); wave(failed, 15); finish(failed, false);
    assert.equal(has(failed, 123), false); assert.deepEqual(failed.achievementTracker.stats.winsByHero, []);
    const hell = game({ difficulty: 'hell', chapter: 30 }); wave(hell, 15); finish(hell);
    assert.ok(has(hell, 123)); assert.ok(has(hell, 65)); assert.ok(has(hell, 146));
    assert.deepEqual(hell.achievementTracker.stats.hardBossMaps, [6]);
});

test('首领战单独起算无伤、技能禁用、残血与治疗，前面受伤不污染首领无伤', () => {
    const g = game({ difficulty: 'hell' }), t = g.achievementTracker;
    t.received(10, 0); g.player.hp = 10; wave(g, 15);
    const boss = enemy(g, { isBoss: true, hp: 20, maxHp: 20 });
    g.spawnExplosion(g.player, 340, 300, 100, 100);
    assert.ok(has(g, 32)); assert.ok(has(g, 34)); assert.ok(has(g, 144)); assert.ok(has(g, 147));
    const healed = game({ difficulty: 'hell' }); healed.player.hp = 10; wave(healed, 15);
    enemy(healed, { isBoss: true }); healed.player.heal(1, false);
    healed.spawnExplosion(healed.player, 340, 300, 100, 100);
    assert.equal(has(healed, 147), false);
});

test('只有真正清完波才解锁波次成就，位移包括最后一帧，计时受DT_MAX限制', () => {
    const g = game({ difficulty: 'hard' }), t = g.achievementTracker;
    wave(g, 13); assert.equal(has(g, 6), false);
    const before = t.time; t.advance(100, g.player, g);
    assert.ok(t.time - before <= 0.051);
    g.player.x += 11;
    t.cleared(g.player, g); assert.ok(has(g, 6)); assert.equal(has(g, 155), false);
});

test('测试房、结束后的旧回调不会写成就，重开共享对象不捕获旧局跟踪器', () => {
    const g = game(); g.state = 'testRoom';
    const e = enemy(g); e.takeDamage(999, g.player, g);
    assert.equal(has(g, 2), false);
    g.state = 'playing'; g.achievementTracker = new AchievementTracker({ hero: 'kai', chapter: 1, difficulty: 'normal', equipment: [] });
    bindAchievementGame(g); wave(g, 1);
    enemy(g).takeDamage(999, g.player, g); assert.ok(has(g, 2));
    finish(g);
    const before = JSON.stringify(g.achievementTracker.stats);
    enemy(g).takeDamage(999, g.player, g);
    assert.equal(JSON.stringify(g.achievementTracker.stats), before);
});

test('凯尔真实Q爆炸与延迟E发射保留技能来源，命中五个不同目标才解锁', () => {
    const q = game();
    for (let i = 0; i < 4; i++) enemy(q, { x: 340 + i });
    q.player._charDef.qSkill(q.player, q);
    q.bulletPool.update(0.01, q.enemies, q.player, q);
    assert.ok(has(q, 67));
    const e = game();
    for (let i = 0; i < 5; i++) enemy(e, { x: 340 + i });
    e.player._charDef.eSkill(e.player, e);
    assert.equal(has(e, 68), false);
    e.pending();
    for (let i = 0; i < 10; i++) e.bulletPool.update(0.01, e.enemies, e.player, e);
    assert.ok(has(e, 68));
});

test('真实雷克怒冲能判定五个目标，奥莉亚突刺结束回到起点才达成折返', () => {
    const reik = game({ hero: 'reik' });
    for (let i = 0; i < 5; i++) enemy(reik, { x: 360, y: 300 + i });
    reik.player._charDef.qSkill(reik.player, reik);
    assert.ok(has(reik, 73));
    const olia = game({ hero: 'olia' });
    for (let i = 0; i < 3; i++) enemy(olia, { x: 360 + i * 5, hp: 100, maxHp: 100 });
    olia.player._charDef.qSkill(olia.player, olia);
    assert.equal(has(olia, 76), false);
    const strike = olia.turrets.find(t => t.kind === 'alphaStrike');
    for (let i = 0; i < 5; i++) strike.update(0.15, olia);
    assert.ok(has(olia, 76));
    assert.equal(olia.player.x, 300);
});

test('真实盗取技能击杀原主人，亡灵骨刺只统计命中获得的灵魂', () => {
    const via = game({ hero: 'via' });
    enemy(via);
    via.player.stats._stealGuaranteed = true;
    via.player._charDef.qSkill(via.player, via);
    assert.equal(has(via, 79), false);
    via.player._charDef.qSkill(via.player, via);
    assert.ok(has(via, 79));
    for (let i = 0; i < 10; i++) via.bulletPool.update(0.01, via.enemies, via.player, via);
    assert.ok(has(via, 152));
    const mortis = game({ hero: 'mortis' });
    for (let i = 0; i < 5; i++) enemy(mortis, { x: 340 + i, hp: 200, maxHp: 200 });
    mortis.player._charDef.qSkill(mortis.player, mortis);
    mortis.bulletPool.update(0.02, mortis.enemies, mortis.player, mortis);
    assert.ok(has(mortis, 83));
});

test('不灭协议与保命分身真实触发并回血后，存活清波与通关分别结算', () => {
    const g = game();
    for (const id of ['hex12', 'hex32']) g.augmentManager.equip({ ...AUGMENT_DB.find(a => a.id === id), level: 1 }, g.player, g);
    g.player.takeDamage(100000, g);
    assert.equal(g.player.hp, 1);
    g.augmentManager.dispatchUpdate(g.player, 0.05, g);
    g.player.heal(g.player.stats.maxHp, false);
    assert.equal(has(g, 142), false); assert.equal(has(g, 143), false);
    g.achievementTracker.cleared(g.player, g);
    assert.ok(has(g, 142)); assert.ok(has(g, 143)); assert.equal(has(g, 154), false);
    finish(g);
    assert.ok(has(g, 154));
});

test('开局战备金与退款不计战斗金币，掉落拾取按实际入账统计', () => {
    const g = game();
    g.wave = 0; g.economy.addGold(900);
    g.wave = 1; g.economy.refund(50);
    assert.equal(g.achievementTracker.goldEarned, 0);
    g.economy.spawnDrop(300, 300, 20);
    g.economy.update(0.05, g.player, g);
    assert.equal(g.achievementTracker.goldEarned, 20);
    assert.equal(g.achievementTracker.dropGold, 20);
});

test('过期的延迟施法不会在下一局生成攻击或计入新局成就', () => {
    const g = game();
    enemy(g); g.player._charDef.eSkill(g.player, g);
    g.runId++;
    g.pending();
    assert.equal(g.bulletPool.active.length, 0);
});

test('死亡连锁逐个独立归属，不把六次连锁死亡冒充同次爆炸六杀', () => {
    const g = game();
    for (let i = 0; i < 6; i++) enemy(g, { x: 340 + i * 50, hp: 5, maxHp: 5, deathExplode: i < 5 });
    const source = g.achievementTracker.beginSkill('q', g.player, g);
    const leave = g.achievementTracker.enter(source);
    g.spawnExplosion(g.player, 340, 300, 100, 10); leave();
    assert.equal(g.kills, 6);
    assert.equal(has(g, 16), false); assert.equal(has(g, 26), false); assert.equal(has(g, 67), false);
    assert.equal(g.achievementTracker.damage, 30);
});

test('亡者天灾按本次八具尸爆统计十杀，复苏后的仆从不延续尸爆击杀数', () => {
    const g = game({ hero: 'mortis' });
    for (let i = 0; i < 8; i++) g.turrets.push({ alive: true, kind: 'skeleton', x: 300, y: 300 });
    for (let i = 0; i < 10; i++) enemy(g, { x: 360 + i });
    g.player._charDef.ultimate(g.player, g);
    assert.ok(has(g, 84));
});

test('奥莉亚时空奇点真实拉扯后爆炸，按同一次奇点判定四拉五杀', () => {
    const g = game({ hero: 'olia' });
    g.input.mouse.x = 340; g.input.mouse.y = 300;
    for (let i = 0; i < 5; i++) enemy(g, { x: 340 + i, hp: 10, maxHp: 10 });
    g.player._charDef.ultimate(g.player, g);
    const orb = g.turrets.find(t => t.kind === 'timeOrb');
    for (let i = 0; i < 130 && orb.alive; i++) orb.update(0.05, g);
    assert.ok(has(g, 78));
});

test('薇娅掠夺领域的收账波保留夺取次数与本次大招归属', () => {
    const g = game({ hero: 'via' });
    for (let i = 0; i < 5; i++) enemy(g, { x: 340 + i });
    g.player._charDef.ultimate(g.player, g);
    const domain = g.turrets.find(t => t.kind === 'plunderDomain');
    domain._captures = 8;
    for (let i = 0; i < 110 && domain.alive; i++) domain.update(0.05, g);
    const debt = g.turrets.find(t => t.kind === 'debtWave');
    debt.update(0.5, g);
    assert.ok(has(g, 81));
});

test('薇薇安炮台的延迟发射继承Q来源并进入炮台有效伤害占比', () => {
    const g = game({ hero: 'vivian' });
    g.spawnTurret = () => g.turrets.push({ alive: true, kind: 'turret',
        update() { g.bulletPool.spawn({ x: 340, y: 300, vx: 0, vy: 0, damage: 200, owner: 'turret' }); } });
    bindAchievementGame(g);
    for (let i = 0; i < 3; i++) enemy(g, { x: 340 + i });
    g.player._charDef.qSkill(g.player, g);
    const turret = g.turrets[0];
    for (let i = 0; i < 3; i++) { turret.update(0.05, g); g.bulletPool.update(0.01, g.enemies, g.player, g); }
    assert.ok(has(g, 70));
    finish(g);
    assert.ok(has(g, 72));
});
