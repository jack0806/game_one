'use strict';
// 滑稽猴（joker）彩蛋Boss：技能机 / 玩家恶作剧debuff / 玩偶猴掉落与隐藏成就
const test = require('node:test');
const assert = require('node:assert/strict');
const cc = require('cc');
const { TEST_BOSSES, UNIT_CATALOG } = require('../dist/data/BossDB');
const { BossController } = require('../dist/entities/BossController');
const { PlayerController } = require('../dist/entities/PlayerController');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { Economy } = require('../dist/systems/Economy');
const { SaveSystem, ACHIEVEMENTS } = require('../dist/systems/SaveSystem');
const { makeMockGame } = require('./mockGame');
const { Rng } = require('../dist/core/MathUtils');
const { actorClip } = require('../dist/data/ActorAnimationDB');
const { EFFECT_ANIMATIONS } = require('../dist/data/EffectAnimationDB');
const { UNIT_ATTACK_ART } = require('../dist/data/CombatArtDB');

function makeJoker(game) {
    const boss = new BossController();
    boss.initBossKind('joker', game);
    boss.x = 300; boss.y = 300;
    return boss;
}

/** 恶作剧/耳光的靶子玩家：记录 buff 与伤害的最小桩。 */
function makeVictim(x, y) {
    return {
        x, y, radius: 16, alive: true, hp: 200, maxHp: 200,
        buffs: [],
        applyBuff(id, dur, mods) { this.buffs.push({ id, dur, mods }); },
        hasBuff(id) { return this.buffs.some(b => b.id === id); },
        takeDamage(dmg) { this.hp -= dmg; },
    };
}

/** 供 PlayerController tick 用的无操作输入桩。 */
function stillInput(over = {}) {
    return Object.assign({
        moveX: 0, moveY: 0, mouse: { x: 200, y: 100 },
        isKeyQPressed: () => false, isKeyEPressed: () => false, isKeyRPressed: () => false,
    }, over);
}

/** 采集 bulletPool.spawn 的控制器环境。 */
function controllerEnv(charId) {
    const game = makeMockGame();
    const bullets = [];
    game.bulletPool = { spawn: (cfg) => { cfg.onHitCb = null; bullets.push(cfg); return cfg; } };
    const p = new PlayerController();
    p.charId = charId;
    p._charDef = CHARACTERS[charId];
    p.stats = {
        ...CHARACTERS[charId].stats,
        critRate: 0, critDmg: 0, eliteBonus: 0, freezeBonus: 0,
        extraBullets: 0, bulletBounce: 0, barrageMode: false, novaMode: false,
        allInBullets: 0, goldPickupRange: 60, cdReduction: 0, ultChargeRate: 1,
        lifestealRate: 0,
    };
    p.x = 100; p.y = 100; p.radius = 16; p.alive = true;
    p.hp = p.stats.maxHp;
    return { game, bullets, p };
}

// ── 基础数值与目录 ───────────────────────────────────────────

test('滑稽猴:设计稿数值逐字落地且进入测试房目录', () => {
    const def = TEST_BOSSES.find(t => t.kind === 'joker');
    assert.ok(def, '滑稽猴必须进入TEST_BOSSES');
    assert.deepEqual([def.maxHp, def.speed, def.damage, def.armor], [800, 300, 10, 50]);
    assert.equal(def.radius, 34, '小体型Boss(radius<常规45)');
    assert.equal(def.spriteKey, 'enemy_boss_joker', '使用专属本体');
    assert.equal(def.tintColor, '#ffffff', '原图不再被金黄色染色');
    const entry = UNIT_CATALOG.find(u => u.id === 'boss_joker');
    assert.ok(entry && entry.category === 'boss', '工具条目录含 boss_joker');
    const game = makeMockGame();
    const boss = makeJoker(game);
    assert.equal(boss.bossKind, 'joker');
    assert.equal(boss.maxHp, 800);
    assert.equal(boss.speed, 300);
    assert.equal(boss.damage, 10);
    assert.equal(boss.armor, 50);
    assert.equal(boss.hitSource, 'boss_joker');
});

test('滑稽猴:三方向身体动画和三技能使用专属图集与特效', () => {
    for (const view of ['front', 'side', 'back']) {
        for (const action of ['idle', 'walk', 'run', 'attack', 'hit', 'defeated', 'skill', 'skill2', 'skill3']) {
            const clip = actorClip('enemy_boss_joker', view, action);
            assert.ok(clip, `${view}/${action}有独立身体动作`);
            assert.equal(clip.frames.length, 8);
            assert.equal(clip.cellSize, 256);
            assert.equal(clip.sheet, `anim_stylea_boss_joker_${view}`);
        }
    }
    assert.equal(UNIT_ATTACK_ART.boss_joker, 'fx_joker_slap');
    assert.equal(EFFECT_ANIMATIONS.fx_joker_slap.sheet, 'anim_fx_joker_slap');
    assert.equal(EFFECT_ANIMATIONS.fx_joker_trick.sheet, 'anim_fx_joker_trick');
});

test('滑稽猴:三招结算时切到各自动作并触发对应特效', () => {
    const effects = [];
    const game = makeMockGame({ particles: {
        spawnSpriteFx: (_x, _y, key) => effects.push(key),
        meleeSlash: (_x, _y, _angle, _color, _reach, _strength, source) => effects.push(UNIT_ATTACK_ART[source]),
    } });
    const origChance = Rng.chance, origInt = Rng.int;
    try {
        const sprint = makeJoker(game);
        sprint._jokerSprintCd = 0.01;
        const far = makeVictim(900, 300);
        sprint.update(0.1, far, game);
        sprint.updateVisualAnimation(0.016, far);
        assert.equal(sprint.actorAnimation.action, 'skill');

        const trick = makeJoker(game);
        trick._jokerTrickCd = 0.01;
        const mid = makeVictim(400, 300);
        Rng.chance = () => true; Rng.int = () => 0;
        trick.update(0.1, mid, game);
        trick.updateVisualAnimation(0.016, mid);
        assert.equal(trick.actorAnimation.action, 'skill2');

        const slap = makeJoker(game);
        slap._jokerSlapCd = 0.01;
        const near = makeVictim(340, 300);
        slap.update(0.1, near, game);
        slap.updateVisualAnimation(0.016, near);
        assert.equal(slap.actorAnimation.action, 'skill3');
        assert.deepEqual(effects, ['fx_joker_trick', 'fx_joker_trick', 'fx_joker_slap']);

        slap.visualJokerSkillT = 0;
        slap.updateVisualAnimation(0.016, near);
        assert.notEqual(slap.actorAnimation.action, 'skill3', '表现时间结束后退出耳光姿势');
    } finally { Rng.chance = origChance; Rng.int = origInt; }
});

// ── 技能1：上蹿下跳 ─────────────────────────────────────────

test('技能1·上蹿下跳:3秒移速+50%,到期恢复', () => {
    const game = makeMockGame();
    const far = makeVictim(900, 300);
    const boss = makeJoker(game);
    boss._jokerSprintCd = 0.01;
    boss.update(0.1, far, game);
    assert.equal(boss.buffSpeedMult, 1.5, '加速50%');
    assert.ok(boss.jokerSprintT > 0 && boss.jokerSprintT <= 3, '持续3秒');
    boss.update(3, far, game);
    assert.equal(boss.jokerSprintT, 0);
    assert.equal(boss.buffSpeedMult, 1, '到期恢复原速');
});

test('上蹿下跳:追逐实际加速，贴身后侧跳且动作跟随移动', () => {
    const game = makeMockGame();
    const far = makeVictim(900, 300);
    const walking = makeJoker(game);
    walking.update(0.1, far, game);
    const sprint = makeJoker(game);
    sprint._jokerSprintCd = 0.01;
    sprint.update(0.1, far, game);
    assert.ok(sprint.x - 300 > (walking.x - 300) * 1.45, '冲刺真实位移比普通追逐快50%');
    sprint.visualJokerSkillT = 0;
    sprint.updateVisualAnimation(0.016, far);
    assert.equal(sprint.actorAnimation.action, 'run', '冲刺剩余时间继续使用快速步态');

    const near = makeVictim(355, 300);
    const hopping = makeJoker(game);
    hopping._jokerSprintCd = 0.01;
    hopping.update(0.1, near, game);
    assert.ok(Math.hypot(hopping.x - 300, hopping.y - 300) > 10, '贴身时不原地播放提示');
    assert.ok(Math.hypot(hopping.x - near.x, hopping.y - near.y) >= 55, '侧跳不穿过玩家身体');
    let travel = 0;
    for (let frame = 0; frame < 12; frame++) {
        const beforeX = hopping.x, beforeY = hopping.y;
        hopping.update(1 / 60, near, game);
        travel += Math.hypot(hopping.x - beforeX, hopping.y - beforeY);
    }
    assert.ok(travel > 20, '进入普通攻击前摇后仍连续侧跳');
});

// ── 技能2：滑稽恶作剧 ───────────────────────────────────────

test('技能2·滑稽恶作剧:150码内随机一种3秒恶作剧,150码外不放', () => {
    const game = makeMockGame();
    const ids = ['joker_blind', 'joker_silence', 'joker_vulnerable', 'joker_dizzy'];
    const origChance = Rng.chance, origInt = Rng.int;
    try {
        for (let i = 0; i < ids.length; i++) {
            const victim = makeVictim(400, 300);   // 距离100 ≤ 150
            const boss = makeJoker(game);
            boss._jokerTrickCd = 0.01;
            Rng.chance = () => true; Rng.int = () => i;
            boss.update(0.1, victim, game);
            assert.equal(victim.buffs[0]?.id, ids[i], `第${i + 1}种恶作剧可中`);
            assert.equal(victim.buffs[0].dur, 3, '恶作剧持续3秒');
        }
        // 玩家在150码外：不施放
        const farVictim = makeVictim(700, 300);   // 距离400
        const boss2 = makeJoker(game);
        boss2._jokerTrickCd = 0.01;
        Rng.chance = () => true;
        boss2.update(0.1, farVictim, game);
        assert.equal(farVictim.buffs.length, 0, '150码外不施放恶作剧');
    } finally { Rng.chance = origChance; Rng.int = origInt; }
});

// ── 技能3：滑稽耳光 ─────────────────────────────────────────

test('技能3·滑稽耳光:贴脸2.5倍伤害+1.5秒眩晕', () => {
    const game = makeMockGame();
    const boss = makeJoker(game);
    boss._jokerSlapCd = 0.01;
    const victim = makeVictim(340, 300);   // 距离40 ≤ 50+16
    boss.update(0.1, victim, game);
    assert.equal(200 - victim.hp, 25, '一巴掌10×2.5=25点');
    assert.equal(victim.buffs[0]?.id, 'joker_stun');
    assert.equal(victim.buffs[0].dur, 1.5, '眩晕1.5秒');
    assert.deepEqual(victim.buffs[0].mods, { stun: true, noMove: true, silence: true });
});

// ── 恶作剧在玩家侧的消费 ────────────────────────────────────

test('沉默:普攻被禁用,解除后恢复', () => {
    const { game, bullets, p } = controllerEnv('kai');
    p.applyBuff('joker_silence', 3, { silence: true });
    for (let i = 0; i < 10; i++) p.tick(0.2, stillInput(), game);
    assert.equal(bullets.length, 0, '沉默期间无法攻击');
    p._buffs = [];
    for (let i = 0; i < 10; i++) p.tick(0.2, stillInput(), game);
    assert.ok(bullets.length >= 1, '解除后恢复普攻');
});

test('眩晕:技能键不再响应,眩晕结束后可施放', () => {
    const { game, bullets, p } = controllerEnv('kai');
    p.applyBuff('joker_stun', 1.5, { stun: true, noMove: true, silence: true });
    const wantQ = stillInput({ isKeyQPressed: () => true });
    for (let i = 0; i < 4; i++) p.tick(0.25, wantQ, game);   // 1秒 < 眩晕1.5秒
    assert.equal(bullets.length, 0, '眩晕期间普攻与技能全部禁用');
    assert.equal(p._qCd, 0, '技能冷却未被消耗');
    p._buffs = [];
    p._qCd = 0;
    for (let i = 0; i < 8; i++) p.tick(0.25, wantQ, game);
    assert.ok(bullets.length >= 1, '眩晕结束后高爆射击恢复');
});

test('易伤:受到的伤害×150%', () => {
    const game = makeMockGame();
    const p = controllerEnv('kai').p;
    p.stats.armor = 0;
    p.applyBuff('joker_vulnerable', 3, { dmgTakenMult: 1.5 });
    p.takeDamage(60, game);
    assert.equal(p.hp, p.stats.maxHp - 90, '60×150%=90实扣');
});

test('头晕目眩:移动方向反转,朝向仍按原始输入', () => {
    const p = controllerEnv('kai').p;
    p.stats.speed = 300;
    p.x = 640; p.y = 400;
    p.applyBuff('joker_dizzy', 3, { reverseMove: true });
    p.tickMovement(0.5, { moveX: 1, moveY: 0 }, undefined);
    assert.ok(p.x < 640, '向右输入实际向左走');
    assert.equal(p.facingX, 1, '朝向仍朝右');
});

// ── 玩偶猴掉落与隐藏成就 ────────────────────────────────────

test('击杀滑稽猴:20%几率掉落玩偶猴(特殊掉落kind)', () => {
    const game = makeMockGame();
    const origChance = Rng.chance;
    try {
        Rng.chance = () => true;
        const luckyDrops = [];
        game.economy = { spawnDrop: (x, y, amt, kind) => luckyDrops.push({ x, y, amt, kind }) };
        makeJoker(game)._die({ x: 0, y: 0 }, game);
        assert.ok(luckyDrops.some(d => d.kind === 'joker_doll'), '命中20%掉落玩偶猴');
        const unluckyDrops = [];
        game.economy = { spawnDrop: (x, y, amt, kind) => unluckyDrops.push({ x, y, amt, kind }) };
        Rng.chance = () => false;
        makeJoker(game)._die({ x: 0, y: 0 }, game);
        assert.ok(!unluckyDrops.some(d => d.kind === 'joker_doll'), '未命中不掉玩偶猴');
    } finally { Rng.chance = origChance; }
});

test('玩偶猴拾取:不算金币,转交onJokerDollPicked回调', () => {
    const eco = new Economy();
    const picked = [];
    const game = {
        audio: { playSfx: () => {} },
        particles: { hexActivate: () => {} },
        onJokerDollPicked: (x, y) => picked.push([x, y]),
    };
    eco.spawnDrop(100, 100, 0, 'joker_doll');
    const player = { x: 100, y: 100, stats: { goldPickupRange: 60 } };
    eco.update(0.05, player, game);
    assert.equal(picked.length, 1, '拾取触发成就回调');
    assert.equal(eco.gold, 0, '玩偶猴不产金币');
    eco.update(0.05, player, game);   // collected 标记在下一次 update 移除
    assert.equal(eco.drops.length, 0, '拾取后掉落移除');
});

test('玩偶猴不新增现役成就，旧版已解锁记录作为历史荣誉保留', () => {
    cc.sys.localStorage._clear(); SaveSystem.resetCache(); SaveSystem.selectSlot(0);
    assert.equal(ACHIEVEMENTS.some(a => a.id === 'joker_doll'), false);
    assert.deepEqual(SaveSystem.recordJokerDoll(), []);
    assert.equal(SaveSystem.load().jokerDolls, 1);
    SaveSystem.load().achievements.push('joker_doll'); SaveSystem.save(); SaveSystem.resetCache();
    assert.ok(SaveSystem.legacyAchievements().some(a => a.id === 'joker_doll'));
    assert.deepEqual(SaveSystem.recordJokerDoll(), []);
    assert.equal(SaveSystem.load().achievements.filter(id => id === 'joker_doll').length, 1);
});

// ── 致盲暗角实现（源码门禁） ────────────────────────────────
test('致盲暗角:以玩家为中心径向渐暗,300码内不画任何东西(英雄可见)', () => {
    const fs = require('fs');
    const path = require('path');
    const gameSource = fs.readFileSync(
        path.join(__dirname, '..', '..', 'assets/scripts/core/GameManager.ts'), 'utf8');
    // 同心环从 313 起（覆盖300码外沿）：300码内零绘制，英雄本体不遮挡
    assert.match(gameSource, /_updateBlindOverlay[\s\S]*?for \(let r = 313; r <= 1500; r \+= 20\)/);
    assert.match(gameSource, /_updateBlindOverlay[\s\S]*?g\.circle\(lx, ly, r\)/);
    assert.match(gameSource, /_updateBlindOverlay[\s\S]*?clamp\(\(r - 300\) \/ 200, 0, 1\)/);
    // 引擎反向模板遮罩在 3.8.8 实机会渲染成盖住英雄的白色圆盘——禁止回退
    assert.doesNotMatch(gameSource, /GRAPHICS_STENCIL/);
    assert.doesNotMatch(gameSource, /inverted/);
    assert.doesNotMatch(gameSource, /addComponent\(Mask\)/);
});
