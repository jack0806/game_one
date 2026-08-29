'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    advanceLocomotion,
    createLocomotionState,
    resetLocomotion,
} = require('../dist/core/Locomotion');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { BossController } = require('../dist/entities/BossController');
const { playerLocomotionKind } = require('../dist/entities/PlayerController');
const { MINI_BOSSES, TEST_BOSSES, TEST_GRUNTS, UNIT_CATALOG } = require('../dist/data/BossDB');
const {
    createDirectionalFacingState,
    updateDirectionalFacing,
} = require('../dist/core/DirectionalFacing');
const { makeMockGame } = require('./mockGame');

test('动作帧由实际位移推进且停住保持静止帧', () => {
    const state = createLocomotionState(0);
    resetLocomotion(state, 100, 100);
    const idle = advanceLocomotion(state, 100, 100, 1 / 60, 82, 'biped');
    assert.equal(idle.moving, false);
    assert.equal(idle.frameIndex, 0);
    assert.equal(idle.footSwing, 0);
    assert.equal(idle.bodyScaleX, 1);
    assert.equal(idle.bodyScaleY, 1);
    assert.equal(idle.shadowScale, 1);

    const walking = advanceLocomotion(state, 106, 100, 1 / 60, 82, 'biped');
    assert.equal(walking.moving, true);
    assert.ok(walking.motion > 0);
    assert.ok(walking.phase > idle.phase);
    assert.ok(walking.footLiftLeft === 0 || walking.footLiftRight === 0);
    assert.ok(walking.footLiftLeft > 0 || walking.footLiftRight > 0);
    assert.ok(walking.bodyScaleX >= 1);
    assert.ok(walking.bodyScaleY <= 1);
    assert.ok(walking.shadowScale <= 1);
});

test('减速后的短位移产生更少步态相位推进', () => {
    const slow = createLocomotionState();
    const fast = createLocomotionState();
    resetLocomotion(slow, 0, 0);
    resetLocomotion(fast, 0, 0);
    const slowPose = advanceLocomotion(slow, 1, 0, 1 / 60, 60, 'biped');
    const fastPose = advanceLocomotion(fast, 4, 0, 1 / 60, 60, 'biped');
    assert.ok(fastPose.phase > slowPose.phase);
});

test('高速英雄的步频有上限，不会因高移速变成腿部残影', () => {
    const state = createLocomotionState();
    resetLocomotion(state, 0, 0);
    const dt = 1 / 60;
    const pose = advanceLocomotion(state, 330 * dt, 0, dt, 82, 'biped');
    assert.ok(pose.phase <= dt * 3.6 * Math.PI * 2 + 1e-9);
});

test('传送不会让步态相位在一帧内乱转', () => {
    const state = createLocomotionState(0.4);
    resetLocomotion(state, 10, 10);
    const before = state.phase;
    const pose = advanceLocomotion(state, 600, 500, 1 / 60, 82, 'biped');
    assert.equal(pose.phase, before);
    assert.equal(pose.moving, false);
});

test('停步后动作平滑收束并最终回到待机', () => {
    const state = createLocomotionState();
    resetLocomotion(state, 0, 0);
    advanceLocomotion(state, 5, 0, 1 / 60, 70, 'heavy');
    let pose;
    for (let i = 0; i < 90; i++) {
        pose = advanceLocomotion(state, 5, 0, 1 / 60, 70, 'heavy');
    }
    assert.equal(pose.moving, false);
    assert.equal(pose.frameIndex, 0);
    assert.equal(pose.motion, 0);
    assert.equal(pose.bodyLift, 0);
    assert.equal(pose.bodyRollDeg, 0);
    assert.equal(pose.bodyScaleX, 1);
    assert.equal(pose.bodyScaleY, 1);
    assert.equal(pose.shadowScale, 1);
});

test('不同身体结构使用不同步幅，悬浮体和Boss仍有位移脉冲', () => {
    const poses = {};
    for (const kind of ['biped', 'heavy', 'skitter', 'quadruped', 'hover', 'bossHeavy', 'bossHover']) {
        const state = createLocomotionState();
        resetLocomotion(state, 0, 0);
        poses[kind] = advanceLocomotion(state, 6, 0, 1 / 60, 80, kind);
        assert.equal(poses[kind].kind, kind);
        assert.ok(poses[kind].motion > 0);
    }
    assert.ok(poses.skitter.stride > poses.heavy.stride);
    assert.ok(poses.hover.bodyLift > poses.heavy.bodyLift);
});

test('所有普通怪、小Boss与正式/测试Boss都有明确的移动结构', () => {
    const game = makeMockGame();
    const expected = {
        grunt: 'biped', shield: 'heavy', exploder: 'skitter', golem: 'heavy',
        elite_grunt: 'biped', archer: 'biped', miniboss: 'quadruped',
        squid: 'skitter', turtle: 'heavy', shrimp: 'skitter',
        jelly: 'hover', drone_a: 'hover', drone_s: 'hover',
        chain_hound: 'quadruped', prism_snail: 'heavy',
        triune_priest: 'hover', rail_butcher: 'heavy', bell_devourer: 'hover',
        rust_biter: 'quadruped', needle_gunner: 'skitter', acid_sac: 'quadruped',
        ember_acolyte: 'biped', frost_acolyte: 'hover',
        rivet_beast: 'heavy', arc_leech: 'hover',
        gold_scavenger: 'skitter', blast_tick: 'skitter',
    };
    for (const [type, kind] of Object.entries(expected)) {
        const enemy = new EnemyBase();
        enemy.init(type, 1, game);
        assert.equal(enemy.locomotionKind, kind, `${type} 的步态结构`);
        if (MINI_BOSSES.some(m => m.id === type) || TEST_GRUNTS.some(m => m.id === type) ||
            type === 'elite_grunt' || type === 'archer' || type === 'miniboss') {
            assert.equal(enemy.directionalFrames, false, `${type} 当前使用完整俯视战斗姿态`);
            assert.equal(enemy.moveSpriteKey, enemy.spriteKey, `${type} 不请求不存在的动作资源`);
        } else {
            assert.equal(enemy.directionalFrames, true, `${type} 使用完整方向帧`);
            assert.equal(enemy.moveSpriteKey, `${enemy.spriteKey}_move`, `${type} 的动作帧`);
        }
    }

    for (let chapter = 0; chapter < 4; chapter++) {
        const boss = new BossController();
        boss.initBoss(chapter, game);
        assert.equal(boss.locomotionKind, chapter < 2 ? 'bossHeavy' : 'bossHover', `第${chapter + 1}章Boss`);
        assert.equal(boss.moveSpriteKey, `enemy_boss_ch${chapter + 1}_move`);
    }

    for (const def of TEST_BOSSES) {
        const boss = new BossController();
        boss.initBossKind(def.kind, game);
        assert.equal(boss.locomotionKind, def.chapter <= 2 ? 'bossHeavy' : 'bossHover', def.label);
        assert.equal(boss.directionalFrames, false, `${def.label} 使用完整俯视战斗姿态`);
        assert.equal(boss.moveSpriteKey, boss.spriteKey, `${def.label} 不请求不存在的方向动作帧`);
    }

    assert.deepEqual(
        Object.keys(expected).sort(),
        UNIT_CATALOG.filter(unit => unit.category !== 'boss').map(unit => unit.id).sort(),
        '测试房新增小怪后必须同步纳入移动审计',
    );
    assert.equal(TEST_BOSSES.length + 4, UNIT_CATALOG.filter(unit => unit.category === 'boss').length);
    assert.equal(MINI_BOSSES.length, 11);
});

test('六名英雄逐一使用符合身体结构的步态', () => {
    assert.deepEqual({
        kai: playerLocomotionKind('kai'),
        vivian: playerLocomotionKind('vivian'),
        reik: playerLocomotionKind('reik'),
        olia: playerLocomotionKind('olia'),
        graf: playerLocomotionKind('graf'),
        liana: playerLocomotionKind('liana'),
    }, {
        kai: 'biped', vivian: 'biped', reik: 'heavy',
        olia: 'hover', graf: 'heavy', liana: 'biped',
    });
});

test('英雄左右反向时侧身立即翻转，不再出现向左走身体朝右', () => {
    const facing = createDirectionalFacingState('side');
    updateDirectionalFacing(facing, 1, 0, 1 / 60);
    const left = updateDirectionalFacing(facing, -1, 0, 1 / 60);
    assert.equal(left.view, 'side');
    assert.equal(left.mirror, -1);
    assert.ok(left.turnScaleX < 1, '立即翻面后仍保留短促转身收窄');
});

test('全部普通怪和测试房小Boss的移动方式与面向语义逐一合理', () => {
    const game = makeMockGame();
    const player = { x: 400, y: 300, radius: 16, alive: true, takeDamage() {} };
    const types = UNIT_CATALOG.filter(unit => unit.category !== 'boss').map(unit => unit.id);
    for (const type of types) {
        const enemy = new EnemyBase();
        enemy.init(type, 1, game);
        enemy.x = 100; enemy.y = 300;
        const before = enemy.x;
        enemy.update(1 / 60, player, game);
        const [fx, fy] = enemy.getVisualFacing(player);
        if (type !== 'gold_scavenger') assert.ok(fx > 0.99 && Math.abs(fy) < 0.01, `${type} 应面向右侧英雄`);
        if (type === 'archer' || type === 'needle_gunner' || type === 'acid_sac' ||
            type === 'ember_acolyte' || type === 'frost_acolyte' || type === 'arc_leech' ||
            type === 'triune_priest' || type === 'rail_butcher') {
            assert.equal(enemy.x, before, `${type} 在300px舒适距离应站定开火`);
        }
        else if (type === 'gold_scavenger') assert.ok(enemy.x < before, '掠金虫应先贴近边缘逃跑而非追击英雄');
        else assert.ok(enemy.x > before, `${type} 应向英雄推进`);
    }

    const archer = new EnemyBase();
    archer.init('archer', 1, game);
    archer.x = 350; archer.y = 300;
    archer.update(1 / 60, player, game);
    assert.ok(archer.x < 350, '射手被贴近时应后撤');
    assert.ok(archer.getVisualFacing(player)[0] > 0, '射手后撤时仍应正对英雄');
});

test('全部正式与测试Boss接近后稳定停在接触距离，不穿过英雄反复翻面', () => {
    const game = makeMockGame();
    const player = { x: 500, y: 300, radius: 16, alive: true, takeDamage() {} };
    const cases = [
        ...[0, 1, 2, 3].map(chapter => ({
            label: `第${chapter + 1}章Boss`,
            init: boss => boss.initBoss(chapter, game),
        })),
        ...TEST_BOSSES.map(def => ({
            label: def.label,
            init: boss => boss.initBossKind(def.kind, game),
        })),
    ];
    for (const item of cases) {
        const boss = new BossController();
        item.init(boss);
        boss.x = 300; boss.y = 300;
        boss._skillTimer = 999; boss._summonTimer = 999; boss._chargeCd = 999;
        boss._mechSlashCd = 999;
        boss._abyssPillarCd = 999; boss._abyssZoneCd = 999;
        boss._abyssCloneCd = 999; boss._abyssSquidCd = 999;
        const facing = createDirectionalFacingState('side');
        let mirrorChanges = 0;
        let lastMirror = 1;
        for (let frame = 0; frame < 360; frame++) {
            boss.update(1 / 60, player, game);
            const [dx, dy] = boss.getVisualFacing(player, 1, 0);
            const pose = updateDirectionalFacing(facing, dx, dy, 1 / 60);
            if (pose.mirror !== lastMirror) mirrorChanges++;
            lastMirror = pose.mirror;
            assert.ok(boss.x < player.x, `${item.label}不得穿过英雄中心`);
        }
        const distance = Math.hypot(player.x - boss.x, player.y - boss.y);
        assert.ok(distance >= boss.radius + player.radius - 2.6, `${item.label}停步距离过近`);
        assert.ok(distance <= boss.radius + player.radius + 0.6, `${item.label}未进入接触距离`);
        assert.equal(mirrorChanges, 0, `${item.label}接近过程不应反复翻面`);
    }
});

test('Boss专用步态限制大图高速冲锋换帧频率', () => {
    const dt = 1 / 60;
    const countChanges = (kind) => {
        const state = createLocomotionState();
        resetLocomotion(state, 0, 0);
        let x = 0, previous = 0, changes = 0;
        for (let frame = 0; frame < 120; frame++) {
            x += 270 * dt;
            const pose = advanceLocomotion(state, x, 0, dt, 180, kind);
            if (pose.frameIndex !== previous) changes++;
            previous = pose.frameIndex;
        }
        return changes;
    };
    assert.ok(countChanges('bossHeavy') <= 6, '重型Boss两秒内不应高频闪帧');
    assert.ok(countChanges('bossHover') <= 5, '悬浮Boss两秒内不应高频闪帧');
    assert.ok(countChanges('bossHeavy') < countChanges('heavy'), 'Boss专用档应低于普通重步换帧率');
});

test('Boss冲锋与撞墙反弹时身体沿真实速度方向转向', () => {
    const game = makeMockGame();
    const player = { x: 900, y: 300, radius: 16, alive: true, takeDamage() {} };
    const boss = new BossController();
    boss.initBoss(0, game);
    boss.x = 300; boss.y = 300;
    boss._skillTimer = 999; boss._summonTimer = 999; boss._chargeCd = 0;
    boss.update(1 / 60, player, game);
    assert.ok(boss.chargeWindup > 0);
    assert.ok(boss.getVisualFacing(player)[0] > 0.99, '蓄力应朝锁定路线');

    for (let i = 0; i < 60; i++) boss.update(1 / 60, player, game);
    assert.equal(boss.isCharging, true);
    assert.ok(boss.getVisualFacing(player)[0] > 0.99, '冲锋应沿正向速度');

    boss.x = 1280 - boss.radius;
    boss._chargeVx = Math.abs(boss._chargeVx);
    boss.update(1 / 60, player, game);
    assert.ok(boss.getVisualFacing(player)[0] < -0.99, '撞右墙反弹后身体应立即朝左');
});
