'use strict';
// 测试房间文档小 Boss（boss.docx）行为单测：全部 headless，不依赖引擎。
const test = require('node:test');
const assert = require('node:assert/strict');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { MINI_BOSSES, TEST_GRUNTS } = require('../dist/data/BossDB');
const { makeMockGame, makePlayer } = require('./mockGame');

function makeBuffPlayer(overrides = {}) {
    const buffs = [];
    const p = makePlayer({
        applyBuff(id, dur, mods) { buffs.push({ id, dur, mods }); },
        ...overrides,
    });
    p.buffs = buffs;
    return p;
}

// ── 初始化 ──

test('11种测试房小boss按MINI_BOSSES表初始化字段且入场满血', () => {
    const game = makeMockGame();
    for (const def of MINI_BOSSES) {
        const e = new EnemyBase();
        e.init(def.id, 1, game);
        assert.equal(e.maxHp, def.maxHp, `${def.id} 生命`);
        assert.equal(e.damage, def.damage, `${def.id} 攻击`);
        assert.equal(e.speed, def.speed, `${def.id} 速度`);
        assert.equal(e.armor, def.armor, `${def.id} 护甲`);
        assert.equal(e.label, def.label, `${def.id} 名称`);
        assert.equal(e.spriteKey, def.spriteKey, `${def.id} 贴图`);
        assert.equal(e.tintColor, def.tintColor, `${def.id} 染色`);
        assert.equal(e.isMiniBoss, true, `${def.id} 应标记小boss`);
        assert.equal(e.hp, e.maxHp, `${def.id} 入场满血`);
    }
});

test('文档新增炮灰按TEST_GRUNTS初始化且不请求旧方向占位帧', () => {
    const game = makeMockGame();
    for (const def of TEST_GRUNTS) {
        const e = new EnemyBase();
        e.init(def.id, 1, game);
        assert.equal(e.maxHp, def.maxHp, `${def.id} 生命`);
        assert.equal(e.damage, def.damage, `${def.id} 攻击`);
        assert.equal(e.speed, def.speed, `${def.id} 移速`);
        assert.equal(e.armor, def.armor, `${def.id} 护甲`);
        assert.equal(e.spriteKey, def.spriteKey, `${def.id} 独立贴图`);
        assert.equal(e.directionalFrames, false, `${def.id} 不应请求不存在的旧六方向占位帧`);
        assert.equal(e.hp, e.maxHp, `${def.id} 入场满血`);
    }
});

test('维斯帕活卵孵化酸幼蛛严格使用45血/4伤/90速/1金币且复用同族轮廓', () => {
    const game = makeMockGame();
    const hatchling = new EnemyBase();
    hatchling.init('vespa_hatchling', 40, game);
    assert.deepEqual(
        [hatchling.maxHp, hatchling.hp, hatchling.damage, hatchling.speed, hatchling.goldValue],
        [45, 45, 4, 90, 1],
    );
    assert.equal(hatchling.spriteKey, 'enemy_boss_vespa');
    assert.equal(hatchling.directionalFrames, false);
    assert.equal(hatchling.locomotionKind, 'skitter');
});

test('铆链猎犬0.70秒锁向后冲360px且撞墙眩晕1.1秒', () => {
    const game = makeMockGame();
    const e = new EnemyBase(); e.init('chain_hound', 1, game);
    e.x = 1180; e.y = 300; e._miniCd1 = 0; e._miniCd2 = 5;
    const player = makePlayer({ x: 1240, y: 300, hp: 100 });
    e.update(0.01, player, game);
    assert.equal(e.miniSkillState, 'chain_charge');
    assert.equal(e.attackWindup, 0.70, '冲锋前应完整显示0.70秒走廊');
    e.update(0.70, player, game);
    assert.ok(Math.abs(e._chargeT - 360 / 560) < 1e-10, '冲锋按360px距离配置');
    e.update(0.20, player, game);
    assert.equal(e.stunned, 1.1, '撞墙提供明确背击输出窗口');
});

test('铆链猎犬回收夹在玩家两侧投放两枚0.8秒预警陷阱', () => {
    const traps = [];
    const game = makeMockGame({ spawnHoundTraps: (...args) => traps.push(args) });
    const e = new EnemyBase(); e.init('chain_hound', 1, game);
    e.x = 100; e.y = 100; e._miniCd1 = 5; e._miniCd2 = 0;
    const player = makePlayer({ x: 400, y: 100 });
    e.update(0.01, player, game);
    assert.equal(traps.length, 1);
    assert.deepEqual(traps[0], [400, 158, 400, 42], '两夹沿瞄准线法向分置，不能完全叠在玩家脚下');
    assert.equal(e._miniCd2, 8);
});

test('棱壳巡灯兽预热0.75秒后旋转150度光带且同轮最多命中一次', () => {
    const game = makeMockGame();
    const e = new EnemyBase(); e.init('prism_snail', 1, game);
    e.x = 100; e.y = 100; e._miniCd1 = 0; e._miniCd2 = 5;
    const player = makePlayer({ x: 400, y: 100, hp: 100 });
    e.update(0.01, player, game);
    assert.equal(e.miniSkillState, 'prism_windup');
    assert.equal(e.miniSkillTimer, 0.75);
    e.update(0.75, player, game);
    assert.equal(e.miniSkillState, 'prism_sweep');
    e.update(0.90, player, game);
    assert.equal(player.hp, 84, '光带扫过玩家时造成16伤害');
    e.update(0.05, player, game);
    assert.equal(player.hp, 84, '同一轮只命中一次');
});

test('棱壳巡灯兽闭壳获得220盾，破盾眩晕掉8金；未破盾则六向放光弹', () => {
    const drops = [];
    const game = makeMockGame({ economy: { spawnDrop: (...args) => drops.push(args) } });
    const player = makePlayer({ x: 500, y: 100 });
    const broken = new EnemyBase(); broken.init('prism_snail', 1, game);
    broken.x = 100; broken.y = 100; broken._miniCd1 = 5; broken._miniCd2 = 0;
    broken.update(0.01, player, game);
    assert.equal(broken.miniSkillState, 'prism_shell');
    assert.equal(broken.shieldHp, 220);
    broken.takeDamage(220, player, game);
    broken.update(0.01, player, game);
    assert.equal(broken.stunned, 1.3);
    assert.deepEqual(drops[0], [100, 100, 8]);

    const charged = new EnemyBase(); charged.init('prism_snail', 1, game);
    charged.x = 100; charged.y = 100; charged._miniCd1 = 5; charged._miniCd2 = 0;
    charged.update(0.01, player, game);
    charged.update(2.5, player, game);
    assert.equal(game.enemyBullets.length, 6, '蓄光完成向六方向发射慢速光弹');
    assert.ok(game.enemyBullets.every(b => b.damage === 8));
});

test('三相祭司严格按火冰雷轮转并调用真实地面机制入口', () => {
    const calls = [];
    const game = makeMockGame({
        spawnTriuneFireMarks: points => calls.push(['fire', points]),
        spawnTriuneIceWall: side => calls.push(['ice', side]),
        spawnTriuneConductors: (x, y) => calls.push(['arc', x, y]),
    });
    const player = makePlayer({ x: 500, y: 300, lastMoveX: 1, lastMoveY: 0 });
    const e = new EnemyBase(); e.init('triune_priest', 1, game); e.x = 120; e.y = 300;

    e._miniTimer = 0; e.update(0.01, player, game);
    assert.equal(e.miniSkillState, 'triune_fire');
    assert.deepEqual(calls[0][1].map(p => p.x), [500, 542, 584], '三枚烙印沿玩家移动方向连续预测');
    e.miniSkillState = ''; e._miniTimer = 0; e.update(0.01, player, game);
    assert.equal(e.miniSkillState, 'triune_ice');
    e.miniSkillState = ''; e._miniTimer = 0; e.update(0.01, player, game);
    assert.equal(e.miniSkillState, 'triune_arc');
    assert.deepEqual(calls.map(c => c[0]), ['fire', 'ice', 'arc']);
});

test('磁轨屠夫0.9秒炮线后发射30伤贯穿弹并反冲100px', () => {
    const game = makeMockGame();
    game.isInsideRailSawOrbit = () => false;
    const player = makePlayer({ x: 900, y: 300 });
    const e = new EnemyBase(); e.init('rail_butcher', 1, game); e.x = 500; e.y = 300; e._miniTimer = 0;
    e.update(0.01, player, game);
    assert.equal(e.miniSkillState, 'rail_windup');
    assert.equal(e.miniSkillTimer, 0.9);
    e.update(0.9, player, game);
    assert.equal(game.enemyBullets.length, 1);
    assert.equal(game.enemyBullets[0].damage, 30);
    assert.equal(e.x, 400, '开火后沿瞄准反方向滑退100px');
});

test('磁轨拖拽先预警1秒再拉动1.8秒，预警期不偷位移', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 700, y: 300 });
    const e = new EnemyBase(); e.init('rail_butcher', 1, game); e.x = 300; e.y = 300;
    e._miniSkillCount = 2; e._miniTimer = 0; e.update(0.01, player, game);
    assert.equal(e.miniSkillState, 'rail_drag');
    const x0 = player.x;
    e.update(0.5, player, game);
    assert.equal(player.x, x0, '前1秒蓝色箭头只预警不拉人');
    e.update(0.6, player, game);
    assert.ok(player.x < x0, '进入1.8秒拉拽段后朝Boss移动');
});

test('葬钟静默罩只暂停罩内Q/E冷却且Boss移速降低35%', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 350, y: 300, _qCd: 3, _eCd: 6 });
    const e = new EnemyBase(); e.init('bell_devourer', 1, game); e.x = 300; e.y = 300;
    e._miniSkillCount = 2; e._miniTimer = 0; e.update(0.01, player, game);
    assert.equal(e.miniSkillState, 'bell_silence');
    e.update(0.5, player, game);
    assert.equal(e.buffSpeedMult, 0.65);
    assert.equal(player._qCd, 3.5);
    assert.equal(player._eCd, 6.5);
    player.x = 900; e.update(0.5, player, game);
    assert.equal(player._qCd, 3.5, '走出165px钟罩后立即恢复正常冷却逻辑');
});

test('锈齿扑兵锁定0.28秒扇形后只沿旧方向扑38px,命中伤害并推18px', () => {
    const impacts = [];
    const game = makeMockGame();
    game.particles.impact = (...args) => impacts.push(args);
    const e = new EnemyBase(); e.init('rust_biter', 1, game);
    e.x = 100; e.y = 100;
    const player = makePlayer({ x: 145, y: 100, hp: 100 });

    e.update(0.01, player, game);
    assert.equal(e.attackWindup, 0.28, '50px内应进入0.28秒前摇');
    e.update(0.28, player, game);
    assert.ok(e._chargeT > 0, '前摇结束应进入扑击');
    const x0 = e.x;
    e.update(0.20, player, game);
    assert.ok(Math.abs((e.x - x0) - 38) < 0.001, '扑击距离应为38px');
    assert.equal(player.hp, 93, '命中造成7点伤害');
    assert.equal(player.x, 163, '命中沿扑击方向推开18px');
    assert.ok(impacts.length > 0, '命中应有冲击反馈');
});

test('锈齿扑兵前摇锁定后不重新追踪,玩家横移可躲且扑空僵直0.35秒', () => {
    const game = makeMockGame();
    const e = new EnemyBase(); e.init('rust_biter', 1, game);
    e.x = 100; e.y = 100;
    const player = makePlayer({ x: 145, y: 100, hp: 100 });
    e.update(0.01, player, game);
    player.y = 190;
    e.update(0.28, player, game);
    e.update(0.20, player, game);
    assert.equal(player.hp, 100, '横移出扇形后应完全躲过');
    assert.ok(e._chargeRecovery > 0, '扑空后应处于0.35秒僵直');
    const x0 = e.x;
    e.update(0.20, player, game);
    assert.equal(e.x, x0, '僵直期间不得继续追击');
});

test('断针射手0.55秒校射后以0.12秒间隔沿同一预判方向发射3针', () => {
    const game = makeMockGame();
    const e = new EnemyBase(); e.init('needle_gunner', 1, game);
    e.x = 100; e.y = 100;
    const player = makePlayer({ x: 450, y: 100, facingX: 0, facingY: 1 });

    e.update(0.01, player, game);
    assert.equal(e.rangedAimWindup, 0.55, '进入射程应显示0.55秒逐级点亮瞄准线');
    const locked = [e.rangedAimTargetX, e.rangedAimTargetY];
    player.x = 450; player.y = 220; // 锁定后横移，三发不得重新追踪
    e.update(0.55, player, game);
    assert.equal(game.enemyBullets.length, 0, '前摇结束当帧还未发射，保留完整反应窗口');
    e.update(0.001, player, game);
    e.update(0.12, player, game);
    e.update(0.12, player, game);
    assert.equal(game.enemyBullets.length, 3, '应连射3发');
    assert.ok(game.enemyBullets.every(b => b.damage === 6 && b.enemyFx === 'needle'));
    assert.ok(game.enemyBullets.every(b => Math.abs(Math.hypot(b.vx, b.vy) - 300) < 1e-8), '针弹速度300px/s');
    const angles = game.enemyBullets.map(b => Math.atan2(b.vy, b.vx));
    assert.ok(angles.every(a => Math.abs(a - angles[0]) < 1e-10), '三发必须沿同一锁定方向');
    assert.deepEqual([e.rangedAimTargetX, e.rangedAimTargetY], locked, '锁定点不随玩家横移改变');
});

test('酸囊投手向玩家移动前方45px抛投,同类初始冷却错开且攻击间隔2.2秒', () => {
    const throws = [];
    const game = makeMockGame({
        spawnEnemyAcidHazard: (...args) => throws.push(args),
    });
    const e = new EnemyBase(); e.init('acid_sac', 1, game);
    assert.ok(e._rangedCd >= 0 && e._rangedCd <= 0.5, '同类入场应错开最多0.5秒');
    e._rangedCd = 0;
    e.x = 100; e.y = 100;
    const player = makePlayer({ x: 400, y: 250, facingX: 1, facingY: 0 });
    e.update(0.01, player, game);
    assert.equal(throws.length, 1);
    assert.deepEqual(throws[0], [100, 100, 445, 250], '目标应领先玩家移动方向45px');
    assert.equal(e._rangedCd, 2.2, '投掷后进入2.2秒间隔');
});

test('铆甲兽正面120度减伤45%,侧后方正常承伤', () => {
    const game = makeMockGame();
    const front = new EnemyBase(); front.init('rivet_beast', 1, game);
    front.x = 300; front.y = 300; front.combatFacingX = 1; front.combatFacingY = 0;
    const rear = new EnemyBase(); rear.init('rivet_beast', 1, game);
    rear.x = 300; rear.y = 300; rear.combatFacingX = 1; rear.combatFacingY = 0;
    const frontDmg = front.takeDamage(100, { x: 400, y: 300 }, game);
    const rearDmg = rear.takeDamage(100, { x: 200, y: 300 }, game);
    assert.ok(Math.abs(frontDmg / rearDmg - 0.55) < 1e-10, '正面承伤应为侧后方的55%');
});

test('铆甲兽0.55秒走廊预警后冲100px,撞墙眩晕1.2秒并失去正面减伤', () => {
    const game = makeMockGame();
    const e = new EnemyBase(); e.init('rivet_beast', 1, game);
    e.x = 1160; e.y = 300;
    const player = makePlayer({ x: 1240, y: 300, hp: 100 });
    e.update(0.01, player, game);
    assert.equal(e.attackWindup, 0.55);
    e.update(0.55, player, game);
    assert.equal(e._chargeT, 0.4);
    e.update(0.4, player, game);
    assert.equal(e.stunned, 1.2, '撞边后应进入完整眩晕窗口');
    assert.equal(e.frontGuardBroken, 1.2, '眩晕期间正面护甲应破裂');
    const before = e.hp;
    e.takeDamage(100, { x: e.x + 100, y: e.y }, game);
    assert.ok(before - e.hp > 80, '破甲时即使正面也不应再获得45%减伤');
});

test('掠金虫不攻击,受击加速0.8秒,12秒逃脱且5秒内击杀额外掉6金', () => {
    const drops = [];
    const game = makeMockGame({ economy: { spawnDrop(_x, _y, amount) { drops.push(amount); } } });
    const e = new EnemyBase(); e.init('gold_scavenger', 1, game);
    e.x = 28; e.y = 300;
    const player = makePlayer({ x: 1000, y: 300 });
    e.takeDamage(1, player, game);
    assert.equal(e.scavengerHitBoost, 0.8);
    const y0 = e.y;
    e.update(0.5, player, game);
    assert.ok(Math.abs(e.y - y0 - 63) < 0.001, '受击后0.8秒内应按105×120%速度沿边逃跑');
    e.takeDamage(999, player, game);
    assert.deepEqual(drops, [24, 6], '5秒内截获应掉固定24金并追加6金');

    const escaped = new EnemyBase(); escaped.init('gold_scavenger', 1, game);
    escaped.x = 28; escaped.y = 300;
    escaped.update(12, player, game);
    assert.equal(escaped.alive, false, '存活12秒后应逃脱');
    assert.deepEqual(drops, [24, 6], '逃脱不得结算击杀掉落');
});

test('烬火侍从锁定玩家脚下火圈并按2.4秒间隔施法', () => {
    const hazards = [];
    const game = makeMockGame({
        spawnEnemyEmberHazard: (...args) => hazards.push(args),
    });
    const e = new EnemyBase(); e.init('ember_acolyte', 1, game);
    e._rangedCd = 0;
    e.x = 100; e.y = 100;
    const player = makePlayer({ x: 400, y: 260 });
    e.update(0.01, player, game);
    assert.deepEqual(hazards, [[400, 260]], '火圈必须落在施法瞬间的玩家脚下');
    assert.equal(e._rangedCd, 2.4);
});

test('冰棱侍从0.75秒三线预警后发射三枚减速冰棱', () => {
    const game = makeMockGame();
    const e = new EnemyBase(); e.init('frost_acolyte', 1, game);
    e._rangedCd = 0;
    e.x = 100; e.y = 100;
    const player = makePlayer({ x: 440, y: 100 });
    e.update(0.01, player, game);
    assert.equal(e.rangedAimWindup, 0.75);
    assert.equal(e.rangedAimWindupMax, 0.75, '预警渲染进度必须从0正确开始');
    e.update(0.75, player, game);
    assert.equal(game.enemyBullets.length, 3);
    assert.ok(game.enemyBullets.every(b => b.enemyFx === 'frost'));
    assert.ok(game.enemyBullets.every(b => b.slow?.mult === 0.75 && b.slow?.dur === 1.6));
    assert.ok(game.enemyBullets.every(b => Math.abs(Math.hypot(b.vx, b.vy) - 320) < 1e-8));
    const angles = game.enemyBullets.map(b => Math.atan2(b.vy, b.vx));
    assert.ok(Math.abs(angles[1] - angles[0] - 0.16) < 1e-10);
    assert.ok(Math.abs(angles[2] - angles[1] - 0.16) < 1e-10);
});

test('闪弧寄生体只连接最近两名非同类友军并提供15%移速', () => {
    const game = makeMockGame();
    const arc = new EnemyBase(); arc.init('arc_leech', 1, game); arc.x = 100; arc.y = 100;
    const near = new EnemyBase(); near.init('grunt', 1, game); near.x = 140; near.y = 100;
    const mid = new EnemyBase(); mid.init('shield', 1, game); mid.x = 180; mid.y = 100;
    const far = new EnemyBase(); far.init('golem', 1, game); far.x = 220; far.y = 100;
    const otherArc = new EnemyBase(); otherArc.init('arc_leech', 1, game); otherArc.x = 120; otherArc.y = 100;
    game.enemies = [arc, near, mid, far, otherArc];
    arc._rangedCd = 99;
    arc.update(0.01, makePlayer({ x: 500, y: 100 }), game);
    assert.deepEqual(arc.arcLinks, [near, mid], '按距离取最近两名且排除同类');
    assert.ok(near.arcBoostTimer > 0 && mid.arcBoostTimer > 0);
    const before = near.x;
    near.update(0.1, makePlayer({ x: 500, y: 100 }), game);
    assert.ok(Math.abs(near.x - before - near.speed * 1.15 * 0.1) < 1e-8, '连接友军移速提升15%');
});

test('闪弧寄生体发射慢速电球且死亡使已连接友军眩晕0.6秒', () => {
    const game = makeMockGame();
    const arc = new EnemyBase(); arc.init('arc_leech', 1, game); arc.x = 100; arc.y = 100;
    const ally = new EnemyBase(); ally.init('grunt', 1, game); ally.x = 150; ally.y = 100;
    game.enemies = [arc, ally];
    arc._rangedCd = 0;
    const player = makePlayer({ x: 400, y: 100 });
    arc.update(0.01, player, game);
    assert.equal(game.enemyBullets.length, 1);
    assert.equal(game.enemyBullets[0].enemyFx, 'arc');
    assert.ok(Math.abs(Math.hypot(game.enemyBullets[0].vx, game.enemyBullets[0].vy) - 185) < 1e-8);
    arc.takeDamage(999, player, game);
    assert.equal(ally.stunned, 0.6);
});

test('熔爆蜱靠近时0.8秒爆炸,被击杀则改为0.45秒提前引爆', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 180, y: 100, hp: 100 });
    const near = new EnemyBase(); near.init('blast_tick', 1, game); near.x = 100; near.y = 100;
    near.update(0.01, player, game);
    assert.equal(near.blastCountdown, 0.8);
    near.update(0.8, player, game);
    assert.equal(near.alive, false);
    assert.equal(player.hp, 72, '爆炸范围内应造成28伤害');

    const killed = new EnemyBase(); killed.init('blast_tick', 1, game); killed.x = 500; killed.y = 400;
    killed.takeDamage(999, player, game);
    assert.equal(killed.alive, true, '击杀后保留实体完成预警');
    assert.equal(killed.invulnerable, true);
    assert.equal(killed.blastCountdown, 0.45);
    killed.update(0.45, player, game);
    assert.equal(killed.alive, false);
    assert.equal(player.hp, 72, '远处提前引爆不得伤到玩家');
});

test('锯齿剑虾常驻+50%移速,无人机禁近战', () => {
    const game = makeMockGame();
    const shrimp = new EnemyBase(); shrimp.init('shrimp', 1, game);
    assert.equal(shrimp.buffSpeedMult, 1.5, '技能3:常驻+50%移速躲避');
    const droneA = new EnemyBase(); droneA.init('drone_a', 1, game);
    assert.equal(droneA.meleeRange, 0, '无人机不近战');
});

// ── 深海鱿鱼 ──

test('深海鱿鱼贴脸触发缠绕(玩家2秒禁移动)', () => {
    const game = makeMockGame();
    const squid = new EnemyBase(); squid.init('squid', 1, game);
    squid._miniCd1 = 0;
    const player = makeBuffPlayer({ x: squid.x + 30, y: squid.y });
    squid.update(0.1, player, game);
    const grab = player.buffs.find(b => b.id === 'squid_grab');
    assert.ok(grab, '贴脸应施加缠绕');
    assert.equal(grab.dur, 2, '控制时长2秒');
    assert.equal(grab.mods.noMove, true, '缠绕=禁移动');
});

test('深海鱿鱼周期性发射深水炸弹与3发分裂水刺', () => {
    const game = makeMockGame();
    const squid = new EnemyBase(); squid.init('squid', 1, game);
    squid._miniCd2 = 0; squid._miniTimer = 0;
    const player = makePlayer({ x: squid.x + 200, y: squid.y });
    squid.update(0.1, player, game);
    const bullets = game.enemyBullets;
    assert.ok(bullets.length >= 4, `应发射炸弹+3水刺,实际${bullets.length}`);
    assert.ok(bullets.some(b => b.radius === 12 && Math.abs(b.damage - squid.damage * 0.5) < 1e-9), '深水炸弹20伤');
    const spikes = bullets.filter(b => b.radius === 7);
    assert.ok(spikes.length >= 3, '分裂水刺应3发');
});

test('深水炸弹反弹1次后撞边爆炸,大水刺反弹2次', () => {
    // 深水炸弹：bounceLeft=1 + bounceExplode（第二次撞边直接爆炸）
    const game = makeMockGame();
    const squid = new EnemyBase(); squid.init('squid', 1, game);
    squid._miniCd2 = 0; squid._miniTimer = 99; squid._miniCd1 = 99;
    const player = makePlayer({ x: squid.x + 200, y: squid.y });
    squid.update(0.1, player, game);
    const bomb = game.enemyBullets.find(b => b.radius === 12);
    assert.ok(bomb, '应发射深水炸弹');
    assert.equal(bomb.bounceLeft, 1, '深水炸弹反弹1次');
    assert.equal(bomb.bounceExplode, true, '深水炸弹反弹耗尽后撞边爆炸');

    // 深海恐惧大水刺：bounceLeft=2（反弹2次），6 个均匀方向×3 发=18 发
    const { BossController } = require('../dist/entities/BossController');
    const game2 = makeMockGame();
    const boss = new BossController();
    boss.initBossKind('abyss', game2);
    const player2 = makePlayer({ x: boss.x + 300, y: boss.y });
    boss.skillWindup = 0.05;
    boss.update(0.1, player2, game2);
    const spikes = game2.enemyBullets.filter(b => b.radius === 11);
    assert.equal(spikes.length, 18, '6个均匀方向×3发=18发大水刺');
    // 六个方向均匀分布（相邻基准角差 ≈ 60°）
    const angles = [...new Set(spikes.map(b => Math.atan2(b.vy, b.vx).toFixed(3)))];
    assert.ok(angles.length >= 6, '至少覆盖6个不同方向');
    assert.ok(spikes.every(b => b.bounceLeft === 2), '大水刺应反弹2次');
    assert.ok(spikes.every(b => !b.bounceExplode), '水刺撞边不爆炸,反弹耗尽后自然消散');
});

test('深海鱿鱼放完一轮技能(累计3个)后自毁消失', () => {
    const game = makeMockGame();
    const squid = new EnemyBase(); squid.init('squid', 1, game);
    // 初始不触发技能：存活
    const player = makePlayer({ x: squid.x + 200, y: squid.y });
    squid._miniCd1 = 99; squid._miniCd2 = 99; squid._miniTimer = 99;
    squid.update(0.1, player, game);
    assert.equal(squid.alive, true, '技能未释放完不应消失');

    // 炸弹+水刺+贴脸缠绕 一帧内全触发 → 累计3个 → 自毁
    const squid2 = new EnemyBase(); squid2.init('squid', 1, game);
    squid2._miniCd1 = 0; squid2._miniCd2 = 0; squid2._miniTimer = 0;
    const closePlayer = makePlayer({ x: squid2.x + 30, y: squid2.y });
    squid2.update(0.1, closePlayer, game);
    assert.equal(squid2.alive, false, '放完一轮技能应自毁消失');
    assert.equal(squid2.hp, 0, '自毁走正常死亡结算');
});

// ── 盾龟 ──

test('盾龟附近有其他小兵时生成100护盾,独行不生成', () => {
    const game = makeMockGame();
    const ally = new EnemyBase(); ally.init('grunt', 1, game);
    ally.x = 0; ally.y = 0;
    game.enemies.push(ally);

    const turtle = new EnemyBase(); turtle.init('turtle', 1, game);
    turtle.x = 0; turtle.y = 50;
    turtle._miniTimer = 0;
    const player = makePlayer({ x: 500, y: 500 });
    turtle.update(0.1, player, game);
    assert.equal(turtle.shieldHp, 100, '附近有友军应生成龟壳护盾');
    assert.equal(turtle.shieldActive, true);

    const soloGame = makeMockGame(); // 干净场景：场上没有其他敌人
    const solo = new EnemyBase(); solo.init('turtle', 1, soloGame);
    solo._miniTimer = 0;
    solo.update(0.1, player, soloGame);
    assert.equal(solo.shieldHp, 0, '独行的盾龟不应有护盾');
});

test('盾龟冷却结束发起高速碰撞冲刺并位移', () => {
    const game = makeMockGame();
    const turtle = new EnemyBase(); turtle.init('turtle', 1, game);
    turtle._miniCd1 = 0;
    const player = makePlayer({ x: turtle.x + 300, y: turtle.y });
    turtle.update(0.1, player, game);
    assert.ok(turtle._chargeT > 0, '应进入冲锋');
    assert.ok(turtle._chargeDmg > 0, '冲锋应带伤害');
    const x0 = turtle.x;
    turtle.update(0.1, player, game);
    assert.notEqual(turtle.x, x0, '冲锋期间应发生位移');
});

// ── 锯齿剑虾 ──

test('锯齿剑虾尖刺弹带破盾标记', () => {
    const game = makeMockGame();
    const shrimp = new EnemyBase(); shrimp.init('shrimp', 1, game);
    shrimp._miniCd1 = 0;
    const player = makePlayer({ x: shrimp.x + 200, y: shrimp.y });
    shrimp.update(0.1, player, game);
    assert.ok(game.enemyBullets.some(b => b.pierceShield === true), '尖刺弹应可破盾');
});

// ── 毒刺鬼水母 ──

test('毒刺鬼水母隐身循环:隐身3s无敌,到期现形可被击中', () => {
    const game = makeMockGame();
    const jelly = new EnemyBase(); jelly.init('jelly', 1, game);
    jelly._miniTimer = 0.05;
    const player = makePlayer({ x: jelly.x + 200, y: jelly.y });
    jelly.update(0.1, player, game);
    assert.equal(jelly.invisible, true, '应进入隐身');
    assert.equal(jelly.invulnerable, true, '隐身期间免疫伤害');
    assert.equal(jelly.takeDamage(50, player, game), 0, '隐身时伤害应被免疫');
    jelly.update(3.2, player, game);
    assert.equal(jelly.invisible, false, '隐身3s后应现形');
    assert.equal(jelly.invulnerable, false);
    const dealt = jelly.takeDamage(50, player, game);
    assert.ok(dealt > 0, '现形后应正常受击');
});

// ── 支援型无人机 ──

test('支援型无人机治疗附近友军并部署150能量盾', () => {
    const game = makeMockGame();
    const wounded = new EnemyBase(); wounded.init('golem', 1, game);
    wounded.hp = wounded.maxHp * 0.5;
    wounded.x = 0; wounded.y = 0;
    game.enemies.push(wounded);

    const drone = new EnemyBase(); drone.init('drone_s', 1, game);
    drone.x = 0; drone.y = 80;
    drone._miniCd1 = 0; drone._miniCd2 = 0;
    const player = makePlayer({ x: 500, y: 500 });
    drone.update(0.1, player, game);
    assert.ok(wounded.hp > wounded.maxHp * 0.5, '友军应被治疗');
    assert.equal(wounded.shieldHp, 150, '友军应获得150能量盾');
    assert.equal(wounded.shieldActive, true);
});

// ── 攻击性无人机 ──

test('攻击性无人机发射破盾声波弹与锁定光束DoT弹', () => {
    const game = makeMockGame();
    const drone = new EnemyBase(); drone.init('drone_a', 1, game);
    drone._miniCd1 = 0; drone._miniCd2 = 0;
    const player = makePlayer({ x: drone.x + 200, y: drone.y });
    drone.update(0.1, player, game);
    assert.ok(game.enemyBullets.some(b => b.pierceShield === true), '声波弹应破盾');
    assert.ok(game.enemyBullets.some(b => b.dot && b.dot.dps === 4 && b.dot.dur === 3), '光束弹应挂3秒DoT');
    assert.ok(game.enemyBullets.some(b => b.homing === true), '光束应为锁定弹');
});
