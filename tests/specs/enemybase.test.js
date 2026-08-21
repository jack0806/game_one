'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { makeMockGame, makePlayer } = require('./mockGame');

function makeEnemy(type, wave, game) {
    const e = new EnemyBase();
    e.init(type, wave, game);
    return e;
}

test('grunt初始化数值符合类型表(基础血量*成长系数)', () => {
    const game = makeMockGame();
    const e = makeEnemy('grunt', 1, game);
    assert.equal(e.maxHp, 80); // scale = 1 + (1-1)*0.08 = 1
    assert.equal(e.hp, 80);
    assert.equal(e.speed, 65);
    assert.equal(e.damage, 8);
});

test('精英类型(elite_grunt)在_applyTypeDef后再叠加3倍血量/1.5倍伤害/3倍金币', () => {
    const game = makeMockGame();
    const e = makeEnemy('elite_grunt', 1, game);
    // 基础 200 * scale(1) = 200，再 ×3 精英加成
    assert.equal(e.maxHp, 600);
    assert.equal(e.hp, 600);
    assert.equal(e.damage, 27); // 18 * 1.5
    assert.equal(e.goldValue, 90); // 30 * 3
    assert.equal(e.isElite, true);
});

test('波次成长系数随wave增加(scale = 1+(wave-1)*0.08)', () => {
    const game = makeMockGame();
    const e10 = makeEnemy('grunt', 10, game);
    // scale = 1 + 9*0.08 = 1.72 → floor(80*1.72) = 137
    assert.equal(e10.maxHp, 137);
});

test('近战攻击:进入范围先显示前摇,前摇结束且玩家仍在范围内才造成伤害', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 0, y: 0, radius: 16 });
    const e = makeEnemy('grunt', 1, game);
    e.x = 1000; e.y = 1000; // 远离玩家
    e.update(0.016, player, game);
    assert.equal(player.hp, 100, '距离过远不应受伤');

    // 拉近到攻击范围内 (meleeRange=48, radius=18, player.radius=16 → atkDist=82)
    e.x = 50; e.y = 0;
    e.update(0.016, player, game);
    assert.equal(player.hp, 100, '进入范围的第一帧只应开始前摇,不能瞬间扣血');
    assert.ok(e.attackWindup > 0, '前摇计时应公开给渲染层绘制危险提示');
    e.update(e.attackWindupMax, player, game);
    assert.ok(player.hp < 100, '前摇结束且仍在范围内才应受到近战伤害');
});

test('近战攻击前摇期间离开危险范围可以躲避', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 0, y: 0, radius: 16 });
    const e = makeEnemy('grunt', 1, game);
    e.x = 50; e.y = 0;
    e.update(0.016, player, game);
    player.x = 500;
    e.update(e.attackWindupMax, player, game);
    assert.equal(player.hp, 100, '前摇结束前离开攻击距离应成功躲避');
});

test('近战攻击有冷却:命中一次后,冷却未结束前不会再次造成伤害', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 0, y: 0, radius: 16 });
    const e = makeEnemy('grunt', 1, game); // attackSpeed=1 → 冷却1秒
    e.x = 30; e.y = 0;
    e.update(0.016, player, game);
    e.update(e.attackWindupMax, player, game);
    const hpAfterFirstHit = player.hp;
    assert.ok(hpAfterFirstHit < 100, '首次进入范围应命中');

    e.update(0.016, player, game); // 冷却中，紧接着下一帧
    assert.equal(player.hp, hpAfterFirstHit, '冷却未结束不应二次造成伤害');

    // 快进到冷却结束(1秒攻速→cd=1s)
    for (let i = 0; i < 65; i++) e.update(0.016, player, game); // ~1.04s
    assert.ok(player.hp < hpAfterFirstHit, '冷却结束后应再次命中');
});

test('meleeRange=0可禁用近战伤害(远程单位可用此关闭)', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 0, y: 0, radius: 16 });
    const e = makeEnemy('grunt', 1, game);
    e.meleeRange = 0;
    e.x = 10; e.y = 0;
    for (let i = 0; i < 5; i++) e.update(0.016, player, game);
    assert.equal(player.hp, 100, 'meleeRange=0时不应造成任何近战伤害');
});

test('护盾优先吸收伤害,护盾耗尽后才伤及HP', () => {
    const game = makeMockGame();
    const shieldFx = [];
    game.particles.shieldBlock = (...args) => shieldFx.push(args);
    const player = makePlayer();
    const e = makeEnemy('shield', 1, game);
    const shieldHp = e.shieldHp;
    e.takeDamage(shieldHp - 5, player, game);
    assert.equal(e.hp, e.maxHp, '护盾未破,HP不应减少');
    assert.equal(e.shieldHp, 5);
    assert.equal(shieldFx[0][2], false, '普通格挡应播放护盾涟漪但不标记破盾');
    e.takeDamage(20, player, game);
    assert.ok(e.hp < e.maxHp, '护盾破后应扣HP');
    assert.equal(e.shieldActive, false);
    assert.equal(shieldFx[1][2], true, '护盾耗尽必须播放独立破盾反馈');
});

test('护甲减免伤害,但至少造成1点伤害(不会出现负伤害/免伤)', () => {
    const game = makeMockGame();
    const player = makePlayer();
    const e = makeEnemy('golem', 1, game); // armor=25
    const before = e.hp;
    e.takeDamage(1, player, game); // 远低于护甲值
    assert.equal(e.hp, before - 1, '伤害应被钳制为至少1点,而不是被护甲完全抵消');
});

test('护甲减伤公式为 armor/(armor+100) 的边际递减衰减,而非线性减法(对齐hexblast-py)', () => {
    const game = makeMockGame();
    const player = makePlayer();
    const e = makeEnemy('grunt', 1, game);
    e.armor = 100; // mitigation = 100/200 = 0.5
    const before = e.hp;
    e.takeDamage(50, player, game);
    assert.ok(Math.abs((before - e.hp) - 25) < 1e-9, '护甲100时50点原始伤害应衰减为25点,而非线性减法的max(1,50-100)=1');
});

test('高护甲叠加变异后伤害不会被线性减法完全吃掉(回归:iron_skin变异+护甲叠加不应让敌人变相无敌)', () => {
    const game = makeMockGame({ _mutationMods: { armor: 100 } });
    const e = makeEnemy('grunt', 1, game); // armor: 0+100=100
    const player = makePlayer();
    const before = e.hp;
    e.takeDamage(30, player, game); // 若是线性减法 max(1,30-100)=1,衰减公式则是 30*(100/200)=15
    assert.ok((before - e.hp) > 1, '护甲衰减公式下,低于护甲值的伤害仍应造成远大于1点的实际伤害');
});

test('死亡时结算金币掉落/计分/连击,并调用augmentManager.dispatchKill', () => {
    const game = makeMockGame();
    let dropAmount = null, dispatched = false;
    game.economy.spawnDrop = (x, y, amt) => { dropAmount = amt; };
    game.augmentManager.dispatchKill = () => { dispatched = true; };
    const player = makePlayer();
    const e = makeEnemy('grunt', 1, game);
    e.takeDamage(9999, player, game);
    assert.equal(e.alive, false);
    assert.equal(dropAmount, e.goldValue);
    assert.equal(game.score, 10); // grunt普通敌人 +10分
    assert.equal(game.kills, 1);
    assert.equal(game.comboCount, 1);
    assert.ok(dispatched, '死亡应触发augmentManager.dispatchKill');
});

test('变异:armor/speedMult/hpMult/goldMult 在init时正确叠加到敌人属性', () => {
    const game = makeMockGame({ _mutationMods: { armor: 100, speedMult: 1.5, hpMult: 3, goldMult: 5 } });
    const e = makeEnemy('grunt', 1, game);
    assert.equal(e.armor, 100); // 0 + 100
    assert.equal(e.speed, Math.floor(65 * 1.5) === 97.5 ? e.speed : 65 * 1.5); // 65*1.5=97.5
    assert.equal(e.maxHp, 240); // 80*3
    assert.equal(e.goldValue, 40); // 8*5
});

test('变异:timeCrack 使攻速+50%/移速+30%', () => {
    const game = makeMockGame({ _mutationMods: { timeCrack: true } });
    const e = makeEnemy('grunt', 1, game);
    assert.ok(Math.abs(e.attackSpeed - 1.5) < 1e-9);
    assert.ok(Math.abs(e.speed - 65 * 1.3) < 1e-9);
});

test('混沌节拍buff:applyChaosBuff在持续时间内提升移速/伤害倍率,到期后自动回落到1', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 1000, y: 1000 }); // 远离,避免近战命中干扰
    const e = makeEnemy('grunt', 1, game);
    e.applyChaosBuff(1.6, 0.05);
    assert.equal(e.buffSpeedMult, 1.6);
    assert.equal(e.buffDmgMult, 1.6);
    e.update(0.1, player, game); // dt超过buff持续时间
    assert.equal(e.buffSpeedMult, 1, 'buff到期后应回落到1');
    assert.equal(e.buffDmgMult, 1);
});

test('变异:deathExplode 或 exploder自带deathExplode死亡时调用spawnExplosion', () => {
    const game = makeMockGame({ _mutationMods: { deathExplode: true } });
    let exploded = false;
    game.spawnExplosion = () => { exploded = true; };
    const player = makePlayer();
    const e = makeEnemy('grunt', 1, game);
    e.takeDamage(9999, player, game);
    assert.ok(exploded, '死亡爆炸变异生效时应调用spawnExplosion');
});


test('随机边缘出生:大量采样始终位于战斗区边界外,不会落入战斗区或玩家附近', () => {
    const { CANVAS_W, PLAYFIELD_BOTTOM } = require('../dist/core/Constants');
    const radius = 20;
    for (let i = 0; i < 1000; i++) {
        const [x, y] = EnemyBase.randomEdgePos(radius);
        const outside = x === -radius || x === CANVAS_W + radius || y === -radius || y === PLAYFIELD_BOTTOM + radius;
        assert.ok(outside, `出生点(${x},${y})必须位于某条战斗区边界外(底部出生应在HUD区外侧)`);
        if (x === -radius || x === CANVAS_W + radius) {
            assert.ok(y >= radius && y <= PLAYFIELD_BOTTOM - radius, '侧边出生的y应在战斗区高度范围内');
        } else {
            assert.ok(x >= radius && x <= CANVAS_W - radius);
        }
    }
});

test('显式出生安全校正:贴脸坐标被推离玩家且保持在战斗区内', () => {
    const { CANVAS_W, PLAYFIELD_BOTTOM } = require('../dist/core/Constants');
    const [x, y] = EnemyBase.safeSpawnPos(640, 360, 18, 640, 360, 180);
    assert.ok(Math.hypot(x - 640, y - 360) >= 180 - 1e-9);
    assert.ok(x >= 18 && x <= CANVAS_W - 18);
    assert.ok(y >= 18 && y <= PLAYFIELD_BOTTOM - 18);
});

test('持续伤害保持小数DPS且血量归零时正常结算死亡', () => {
    const game = makeMockGame();
    const player = makePlayer();
    const e = makeEnemy('grunt', 1, game);
    e.takeContinuousDamage(0.25, player, game);
    assert.equal(e.hp, 79.75, '持续伤害不应被普通命中的至少1点规则放大');
    e.takeContinuousDamage(100, player, game);
    assert.equal(e.alive, false);
    assert.equal(e.hp, 0);
    assert.equal(game.kills, 1);
});
