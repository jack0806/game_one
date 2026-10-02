'use strict';
// 混沌傀儡·格雷夫重做（洞察标记/荆棘刺鞭/混沌脉冲/混沌冲击/混沌爆发）行为单测
const test = require('node:test');
const assert = require('node:assert/strict');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { makeMockGame, makePlayer } = require('./mockGame');

const HEADLESS_INPUT = {
    moveX: 0, moveY: 0,
    getAxis: () => [0, 0], isDashPressed: () => false,
    isKeyQPressed: () => false, isKeyEPressed: () => false,
    isKeyRPressed: () => false, mouse: { x: 0, y: 0 },
};

function makeGrafEnemy(game, x, y, hp = 1000) {
    const e = new EnemyBase(); e.init('grunt', 1, game);
    e.x = x; e.y = y; e.maxHp = hp; e.hp = hp;
    return e;
}

// ── 基础数值与双被动 ─────────────────────────────────────────

test('格雷夫基础数值与双被动(洞察+荆棘刺鞭)按重做文档', () => {
    const graf = CHARACTERS.graf;
    const s = graf.stats;
    assert.deepEqual([s.maxHp, s.speed, s.damage, s.attackSpeed, s.armor], [150, 310, 30, 0.8, 15],
        'HP150/移速310/伤害30/攻速0.8/护甲15');
    assert.equal(s.critRate, 0.10, '暴击10%');
    assert.equal(s.critDmg, 0.5, '暴伤+50%');
    assert.equal(graf.attackType, 'melee', '格雷夫是持鞭近战');
    assert.equal(graf.attackRange, 170, '攻击距离=鞭长170');
    const p = makePlayer({ stats: { ...s } });
    graf.passive(p, makeMockGame());
    assert.equal(p.stats.insightMark, true, '被动1:洞察(周期标记+穿甲消耗)');
    assert.equal(p.stats.thornWhip, true, '被动2:荆棘刺鞭(普攻二段)');
});

// ── 被动·洞察 ────────────────────────────────────────────────

test('洞察:每2.5秒标记周围500码怪物,隐身/超距/飞空不标记', () => {
    const { PlayerController } = require('../dist/entities/PlayerController');
    const game = makeMockGame();
    game.testCeasefire = true;   // 只验证被动标记，跳过普攻链路(headless无_charDef)
    const markFx = [];
    game.particles.insightMark = (...args) => markFx.push(args);
    const p = new PlayerController();
    p.stats = { maxHp: 150, armor: 0, speed: 310, cdReduction: 0, attackSpeed: 0.8, insightMark: true };
    p.hp = 150;
    p.x = 100; p.y = 100;
    const near = makeGrafEnemy(game, 200, 100);
    const far = makeGrafEnemy(game, 700, 100);      // 距离600 > 500
    const ghost = makeGrafEnemy(game, 120, 100);    // 隐身
    ghost.invisible = true;
    const sky = makeGrafEnemy(game, 130, 100);      // 飞空机制单位
    sky.mechSkyT = 2;
    game.enemies.push(near, far, ghost, sky);
    p.tick(0.1, HEADLESS_INPUT, game);              // 计时器从0起,首帧立即标记
    assert.equal(near._insightMark, true, '500码内怪物应被标记');
    assert.equal(markFx.length, 1, '只对新增标记播放闪光');
    assert.equal(far._insightMark, false, '超出500码不标记');
    assert.equal(ghost._insightMark, false, '隐身单位不标记');
    assert.equal(sky._insightMark, false, '飞空机制单位不标记');
    // 消耗后周期未到不刷新
    near._insightMark = false;
    p.tick(2.0, HEADLESS_INPUT, game);
    assert.equal(near._insightMark, false, '标记周期未到不刷新');
    p.tick(0.5, HEADLESS_INPUT, game);
    assert.equal(near._insightMark, true, '2.5秒后重新标记');
});

test('洞察消耗:命中被标记怪物追加20%穿甲伤害,标记只消耗一次', () => {
    const { PlayerController } = require('../dist/entities/PlayerController');
    const game = makeMockGame();
    const e = makeGrafEnemy(game, 100, 100);
    e.armor = 100;   // 减免 100/200 = 50%
    game.enemies.push(e);
    const p = new PlayerController();
    p.stats = { maxHp: 150, armor: 0, critRate: 0, _coreOverflow: false, insightMark: true, damage: 30 };
    p.hp = 150;
    e._insightMark = true;
    const hp0 = e.hp;
    p.applyAttackDamage(e, game, 20);
    // 主伤 20×50%=10；穿甲段按护甲反向补足 raw=20×0.2/0.5=8 → 实扣4，合计14
    assert.equal(hp0 - e.hp, 14, '主伤10 + 穿甲4 = 14(穿甲段无视护甲)');
    assert.equal(e._insightMark, false, '标记应被消耗');
    const hp1 = e.hp;
    p.applyAttackDamage(e, game, 20);
    assert.equal(hp1 - e.hp, 10, '标记已消耗,第二击不再追加穿甲');
});

test('洞察穿甲段不吃暴击/不重复触发词条命中分发', () => {
    const { PlayerController } = require('../dist/entities/PlayerController');
    const game = makeMockGame();
    const hits = [];
    game.augmentManager.dispatchHit = (...args) => hits.push(args);
    const e = makeGrafEnemy(game, 100, 100);
    e.armor = 0;
    game.enemies.push(e);
    const p = new PlayerController();
    p.stats = { maxHp: 150, armor: 0, critRate: 0, _coreOverflow: false, insightMark: true };
    p.hp = 150;
    e._insightMark = true;
    p.applyAttackDamage(e, game, 20);
    assert.equal(hits.length, 1, '主伤+穿甲段合并为一次命中分发');
    assert.equal(e._insightMark, false);
});

// ── 被动·荆棘刺鞭 ────────────────────────────────────────────

test('荆棘刺鞭:子弹命中链路同样结算二段75%伤害(共享入口)', () => {
    const { PlayerController } = require('../dist/entities/PlayerController');
    const { BulletPool } = require('../dist/entities/BulletController');
    const game = makeMockGame();
    const e = makeGrafEnemy(game, 20, 0);
    game.enemies.push(e);
    const p = new PlayerController();
    p.stats = { maxHp: 150, armor: 0, critRate: 0, _coreOverflow: false, thornWhip: true };
    p.hp = 150;
    const pool = new BulletPool(4);
    pool.spawn({ x: 10, y: 0, vx: 0, vy: 0, damage: 20, radius: 5, pierceLeft: 0, hitEnemies: new Set() });
    pool.update(0.016, game.enemies, p, game);
    assert.equal(1000 - e.hp, 20, '二段未到:先结算主伤20');
    p.tickThornPending(0.5);
    assert.equal(1000 - e.hp, 35, '0.5秒后二段落下: 主伤20 + 刺鞭15(20×75%) = 35');
});

test('荆棘刺鞭:二段伤害延迟0.5秒落下,按首段75%结算,目标死亡则落空', () => {
    const { PlayerController } = require('../dist/entities/PlayerController');
    const game = makeMockGame();
    const e = makeGrafEnemy(game, 60, 60);
    e.armor = 0;
    game.enemies.push(e);
    const p = new PlayerController();
    p.stats = { maxHp: 150, armor: 0, critRate: 0, critDmg: 0.5, _coreOverflow: false, thornWhip: true };
    p.hp = 150;
    // 首段经由 applyAttackDamage 正常暴击链路（此处暴击率0），二段延迟排队
    const firstDmg = p.applyAttackDamage(e, game, 40);
    p.thornSecondStage(e, game, firstDmg);
    assert.equal(1000 - e.hp, 40, '二段未到:仅首段40');
    p.tickThornPending(0.2);
    assert.equal(1000 - e.hp, 40, '0.2秒时二段尚未落下');
    p.tickThornPending(0.3);
    assert.equal(1000 - e.hp, 70, '累计0.5秒后二段落下: 首段40 + 二段30(40×75%) = 70');
    // 目标提前死亡:二段落空,不转移目标
    const e2 = makeGrafEnemy(game, 200, 60);
    p.thornSecondStage(e2, game, 40);
    e2.alive = false;
    p.tickThornPending(0.5);
    assert.equal(e2.hp, 1000, '目标已死亡,二段落空不扣血');
});

test('近战鞭击:普攻走 meleeAttack 链路,鞭长内命中并自动追加荆棘二段', () => {
    const { PlayerController } = require('../dist/entities/PlayerController');
    const game = makeMockGame();
    const e = makeGrafEnemy(game, 230, 100);        // 距离130,在鞭长170内
    e.armor = 0;
    game.enemies.push(e);
    game.getNearestEnemy = () => e;
    const slashFx = [];
    game.particles.grafWhipStrike = (...args) => slashFx.push(args);
    const p = new PlayerController();
    p.charId = 'graf';
    p._charDef = CHARACTERS.graf;                   // headless 不走 init(),手动挂角色定义
    p.stats = { maxHp: 150, armor: 0, speed: 310, critRate: 0, critDmg: 0.5,
        _coreOverflow: false, thornWhip: true, insightMark: true, damage: 40, meleeExtraHits: 0 };
    p.hp = 150;
    p.x = 100; p.y = 100;
    e._insightMark = true;                          // 被标记:近战命中应消耗
    p._meleeAttack(game);
    assert.equal(slashFx.length, 1, '近战普攻应触发鞭击特效');
    assert.equal(slashFx[0][3], 170, '鞭击特效长度=鞭长170');
    assert.equal(1000 - e.hp, 40 + 8, '首段40 + 洞察穿甲8 = 48(二段0.5秒后落下)');
    assert.equal(e._insightMark, false, '近战命中消耗洞察标记');
    p.tickThornPending(0.5);
    assert.equal(1000 - e.hp, 40 + 8 + 30, '0.5秒后荆棘二段落下: 40+8+30 = 78');
    // 鞭长外不隔空抽人
    const far = makeGrafEnemy(game, 100, 100 + 260);
    game.enemies = [far];
    game.getNearestEnemy = () => far;
    const hp0 = far.hp;
    p._meleeAttack(game);
    assert.equal(far.hp, hp0, '鞭长(170)+体积外的目标不被抽中');
});

// ── Q 混沌脉冲 ───────────────────────────────────────────────

test('混沌脉冲:朝鼠标甩鞭形成混沌间隙,落点瞬间与每秒各跳20点', () => {
    const game = makeMockGame();
    game.input = { mouse: { x: 300, y: 100, active: true } };
    const p = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.graf.stats },
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    const inGap = makeGrafEnemy(game, 250, 100);
    const behind = makeGrafEnemy(game, 40, 100);    // 鞭根之后
    const offPath = makeGrafEnemy(game, 250, 400);  // 宽度(±50)之外
    game.enemies.push(inGap, behind, offPath);
    CHARACTERS.graf.qSkill(p, game);
    const gap = game.turrets[0];
    assert.ok(gap && gap.kind === 'chaosGap', '混沌间隙应挂载到场景');
    assert.deepEqual([gap.dirX, gap.dirY], [1, 0], '鞭向朝鼠标(+x)');
    assert.deepEqual([gap.len, gap.halfW], [200, 50], '长200/宽100(半宽50)');
    gap.update(0.016, game);                        // 鞭子落地瞬间结算第一跳
    assert.equal(1000 - inGap.hp, 20, '落点瞬间第一跳20伤');
    assert.equal(behind.hp, 1000, '鞭根之后的怪物不受影响');
    assert.equal(offPath.hp, 1000, '间隙宽度外的怪物不受影响');
    for (let k = 0; k < 3; k++) gap.update(1.0, game);
    assert.equal(1000 - inGap.hp, 60, '3秒寿命内共3跳(0/1/2秒)合计60');
    assert.equal(gap.alive, false, '3秒后混沌间隙消散');
});

test('混沌脉冲:无鼠标时沿角色朝向释放', () => {
    const game = makeMockGame();
    const p = makePlayer({
        x: 100, y: 100, facingX: 0, facingY: 1,
        stats: { ...CHARACTERS.graf.stats },
        applyAttackDamage() {},
    });
    CHARACTERS.graf.qSkill(p, game);
    const gap = game.turrets[0];
    assert.deepEqual([gap.dirX, gap.dirY], [0, 1], '回退到角色朝向(+y)');
});

// ── E 混沌冲击 ───────────────────────────────────────────────

test('混沌冲击:眩晕周围450码的所有怪物2秒,超距不眩晕', () => {
    const game = makeMockGame();
    const p = makePlayer({ x: 100, y: 100, stats: { ...CHARACTERS.graf.stats } });
    const close = makeGrafEnemy(game, 200, 100, 200);
    const edge = makeGrafEnemy(game, 540, 100, 200);    // 440码
    const farout = makeGrafEnemy(game, 560, 100, 200);  // 460码
    game.enemies.push(close, edge, farout);
    CHARACTERS.graf.eSkill(p, game);
    assert.equal(close.stunned, 2, '眩晕2秒');
    assert.equal(edge.stunned, 2, '450码内(440)应被眩晕');
    assert.equal(farout.stunned, 0, '超出450码不眩晕');
});

// ── R 混沌爆发 ───────────────────────────────────────────────

test('混沌爆发:震荡波扩散逐个命中30点伤害,并触发全部词条击杀效果', () => {
    const game = makeMockGame();
    const killCalls = [];
    game.augmentManager.dispatchKill = (p, enemy, dmg, g) => killCalls.push({ enemy, dmg });
    const p = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.graf.stats },
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    const near = makeGrafEnemy(game, 200, 100);
    const out = makeGrafEnemy(game, 100, 700);      // 距离600,超过波及上限500
    game.enemies.push(near, out);
    CHARACTERS.graf.ultimate(p, game);
    const wave = game.turrets[0];
    assert.ok(wave && wave.kind === 'chaosBurst', '震荡波应挂载到场景');
    assert.equal(killCalls.length, 1, '应统一分发一次全部词条的击杀效果');
    assert.equal(killCalls[0].enemy.x, 100, '击杀效果锚点在玩家位置');
    assert.equal(killCalls[0].dmg, 150, '击杀效果伤害上下文=伤害×5');
    wave.update(0.2, game);                          // r = 10 + 180 = 190 → near(100)被波前扫过
    assert.equal(1000 - near.hp, 30, '震荡波造成30点伤害');
    assert.equal(out.hp, 1000, '波前未到达不受伤');
    wave.update(0.2, game);
    assert.equal(1000 - near.hp, 30, '同一目标只结算一次');
    wave.update(1.0, game);                          // r 超过500上限
    assert.equal(wave.alive, false, '波扩散到上限后消散');
    assert.equal(out.hp, 1000, '上限外的怪物始终不受伤');
});

test('混沌爆发:震荡波经真实伤害链路可消耗洞察标记', () => {
    const game = makeMockGame();
    const e = makeGrafEnemy(game, 150, 100);
    e.armor = 0;
    e._insightMark = true;
    game.enemies.push(e);
    const { PlayerController } = require('../dist/entities/PlayerController');
    const p = new PlayerController();
    p.stats = { maxHp: 150, armor: 0, critRate: 0, _coreOverflow: false, insightMark: true };
    p.hp = 150;
    p.x = 100; p.y = 100;
    CHARACTERS.graf.ultimate(p, game);
    game.turrets[0].update(0.2, game);               // r=190 覆盖50码外的目标
    assert.equal(e._insightMark, false, '震荡波命中应消耗洞察标记');
    assert.equal(1000 - e.hp, 30 + 6, '波伤30 + 洞察穿甲6(30×20%)');
});

test('死神之瞳联动:震荡波瞬间秒杀小怪,Boss受600点固定伤害', () => {
    const game = makeMockGame();
    game.augmentManager.ownedOf = (id) => (id === 'hex06' ? { id } : undefined);
    const p = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.graf.stats },
        applyAttackDamage() { throw new Error('死神之瞳生效时不应再走普通30点伤害'); },
    });
    const mob = makeGrafEnemy(game, 200, 100);
    const boss = makeGrafEnemy(game, 200, 140);
    boss.isBoss = true;
    game.enemies.push(mob, boss);
    CHARACTERS.graf.ultimate(p, game);
    game.turrets[0].update(0.2, game);               // r=190 扫过两个目标
    assert.equal(mob.alive, false, '小怪被震荡波瞬间秒杀');
    assert.equal(1000 - boss.hp, 600, 'Boss受600点固定伤害');
    // 未携带死神之瞳时保持原30点伤害
    const game2 = makeMockGame();
    const mob2 = makeGrafEnemy(game2, 200, 100);
    game2.enemies.push(mob2);
    const p2 = makePlayer({
        x: 100, y: 100,
        stats: { ...CHARACTERS.graf.stats },
        applyAttackDamage(enemy, g, base) { enemy.hp -= base; return base; },
    });
    CHARACTERS.graf.ultimate(p2, game2);
    game2.turrets[0].update(0.2, game2);
    assert.equal(1000 - mob2.hp, 30, '无死神之瞳时震荡波仍是30点伤害');
    assert.equal(mob2.alive, true);
});
