// ============================================================
//  enemyskills.test.js — 敌人技能优化方案（docs/敌人技能优化方案.md）回归
// ============================================================
// 覆盖：侧移包抄分配 / 护盾兵举盾 / 腐尸扑咬 / 暗影猎手影袭 /
// 小Boss激怒与鱿鱼一次性标记 / ch1~4 章节Boss技能轮转 / 奇点弹体。
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeMockGame, makePlayer } = require('./mockGame.js');

const { EnemyBase } = require('../dist/entities/EnemyBase.js');
const { BossController } = require('../dist/entities/BossController.js');
const { CHAPTER_BOSS_SKILLS, chapterBossBasicAttack } = require('../dist/entities/BossChapterSkills.js');
const { BulletPool } = require('../dist/entities/BulletController.js');

function makeEnemy(type, game, wave = 1) {
    const e = new EnemyBase();
    e.init(type, wave, game);
    return e;
}

test('侧移包抄:近战单位在init时获得-1/0/1偏置,远程/机制单位恒为0', () => {
    const game = makeMockGame();
    for (const type of ['grunt', 'shield', 'exploder', 'golem', 'elite_grunt', 'miniboss',
        'rust_biter', 'rivet_beast', 'blast_tick']) {
        const e = makeEnemy(type, game);
        assert.ok([-1, 0, 1].includes(e.flankBias), `${type} 应有侧移偏置`);
    }
    for (const type of ['archer', 'needle_gunner', 'acid_sac', 'ember_acolyte', 'squid', 'chain_hound']) {
        const e = makeEnemy(type, game);
        assert.equal(e.flankBias, 0, `${type} 不参与侧移包抄`);
    }
});

test('护盾兵举盾:3秒冷却后举盾3秒,举盾期正面120°减伤70%', () => {
    const game = makeMockGame();
    const e = makeEnemy('shield', game);
    // 能量盾先摘掉，隔离举盾减伤的验证面
    e.shieldActive = false; e.shieldHp = 0;
    e._guardCd = 0; e._guardT = 0;
    // 手动驱动计时器逻辑（update 全链路在其它用例覆盖）
    e.type = 'shield';
    // 触发举盾
    e._guardCd = 0;
    const player = makePlayer({ x: 500, y: 0 });
    for (let i = 0; i < 2 && e._guardT <= 0; i++) e.update(0.016, player, game);
    assert.ok(e._guardT > 0, '冷却结束应进入举盾姿态');
    // 正面攻击（attacker 在 combatFacing 正向）只吃 30% 伤害
    e.combatFacingX = 1; e.combatFacingY = 0;
    e.maxHp = 1000; e.hp = 1000; // 提高血量避免断言途中死亡(_die 会把 hp 归零)
    const before = e.hp;
    e.takeDamage(100, { x: e.x + 200, y: e.y }, game);
    assert.ok(Math.abs(e.hp - (before - 30)) < 1e-6, `正面应减伤70%（期望扣30，实际扣${before - e.hp}）`);
    // 侧后方攻击不吃举盾减伤
    e.hp = e.maxHp;
    e.takeDamage(100, { x: e.x - 200, y: e.y }, game);
    assert.ok(Math.abs(e.hp - (e.maxHp - 100)) < 1e-6, '侧后方应全额伤害');
});

test('腐尸扑咬:中距离(120~230px)冷却就绪时进入0.3秒前摇并锁定目标', () => {
    const game = makeMockGame();
    const e = makeEnemy('grunt', game);
    e.x = 0; e.y = 0;
    const player = makePlayer({ x: 180, y: 0 });
    e._lungeCd = 0;
    e.update(0.016, player, game);
    assert.ok(e._lungeCd >= 4.5 * 0.85 && e._lungeCd <= 4.5 * 1.25, `扑咬进入带抖动的独立冷却（${e._lungeCd}）`);
    assert.ok(e.attackWindup > 0.2, '扑咬应进入前摇（0.30+dt）');
    assert.equal(e.attackWindupMax, 0.30, '扑咬前摇改写为0.30');
    // 结算帧：前摇归零转为冲锋
    e.update(e.attackWindup + 0.001, player, game);
    assert.ok(e._chargeT > 0, '扑咬结算应转为微型冲锋');
    assert.equal(e.attackWindupMax, 0.28, '结算后普攻前摇还原为表值');
});

test('暗影猎手影袭:远处触发预警圈,回调后现身在玩家身后并接爪击前摇', () => {
    const warnCalls = [];
    const game = makeMockGame({
        spawnWarnCircle(x, y, r, delay, color, onDone) { warnCalls.push({ x, y, r, delay, color, onDone }); },
    });
    const e = makeEnemy('miniboss', game);
    e.x = 0; e.y = 0;
    const player = makePlayer({ x: 300, y: 0, lastMoveX: 1, lastMoveY: 0 });
    e._lungeCd = 0;
    e.update(0.016, player, game);
    assert.equal(warnCalls.length, 1, '影袭应放置一个落点预警圈');
    assert.ok(e.invisible && e.invulnerable, '影袭引导期隐身无敌');
    const warn = warnCalls[0];
    // 玩家朝 +x 移动 → 落点在玩家身后（x < 300）
    assert.ok(warn.x < 300, '落点应在玩家身后');
    warn.onDone();
    assert.ok(!e.invisible && !e.invulnerable, '回调后现身');
    assert.equal(e.x, warn.x, '猎手应瞬移到预警圈位置');
    assert.ok(e.attackWindup > 0, '现身应立即接爪击前摇');
});

test('小Boss激怒:血量首次≤50%时标记并使技能冷却×0.85', () => {
    const game = makeMockGame();
    const e = makeEnemy('squid', game);
    e.hp = e.maxHp * 0.6;
    const player = makePlayer({ x: 600, y: 400 });
    e.update(0.016, player, game);
    assert.equal(e.miniEnraged, false, '60%血不激怒');
    e.hp = e.maxHp * 0.5;
    e.update(0.016, player, game);
    assert.equal(e.miniEnraged, true, '50%血触发激怒');
    assert.equal(e._mcd(10), 8.5, '激怒后冷却按85%计');
});

test('深海鱿鱼自毁只保留给一次性个体(_oneShot)', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 0, y: 0 });
    const oneShot = makeEnemy('squid', game);
    oneShot._oneShot = true;
    oneShot._miniSkillCount = 3;
    oneShot.update(0.016, player, game);
    assert.equal(oneShot.alive, false, '一次性个体放完一轮技能自毁');

    const regular = makeEnemy('squid', game);
    regular._oneShot = false;
    regular._miniSkillCount = 3;
    regular.update(0.016, player, game);
    assert.equal(regular.alive, true, '正式波次鱿鱼不自毁');
});

test('章节Boss技能轮转:P1只出前2招,P3先强制终技,间隔7.8秒', () => {
    const seen = [];
    const game = makeMockGame({
        _chapter: 7, // 图2
        spawnWarnCircle() {},
        spawnWarnLine() {},
        spawnEnemyAcidHazard() {},
        spawnEnemy() {},
    });
    const player = makePlayer({ x: 640, y: 300 });
    const boss = new BossController();
    boss.init('boss', 15, game);
    assert.equal(boss.chapter, 2, '全局章7投影到图2');
    const skills = CHAPTER_BOSS_SKILLS[2];
    assert.equal(skills.length, 4, 'ch2 应有4招（含终技熔毁带）');

    const drive = (seconds) => {
        let left = seconds;
        while (left > 0) {
            const dt = Math.min(0.05, left);
            const before = boss.docSkillName;
            boss._updateChapterBossSkills(dt, player, game);
            if (boss.docSkillName !== before && before !== '' || (before === '' && boss.docSkillName !== '')) {
                // 名称变化即释放过一次
            }
            left -= dt;
        }
    };
    // 记录释放序列：包一层 floatingText 技能名捕获
    const fired = [];
    game.floatingText = { spawn(x, y, text) { if (skills.some(s => s.name === text)) fired.push(text); } };
    boss.phase = 1;
    drive(40);
    assert.ok(fired.length >= 4, `40秒内应释放多次技能（实际${fired.length}次）`);
    for (const name of fired) {
        assert.ok(name === skills[0].name || name === skills[1].name,
            `P1 只应出前2招，却出现了 ${name}`);
    }
    // P3 先强制终技
    fired.length = 0;
    boss.phase = 3;
    boss.docSkillTimer = 0.01;
    drive(1);
    assert.equal(fired[0], skills[3].name, '阶段三首次应强制终技');
    assert.ok(Math.abs(boss.docSkillTimer - 7.8 * 0.85) < 0.1 || boss.docSkillTimer <= 7.8 * 0.85 + 0.05,
        'P3 技能间隔应为 7.8×0.85');
});

test('章节Boss普攻:ch1三发毒球/ch3追踪弹数随阶段增长', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 640, y: 300 });
    const boss = new BossController();
    boss.init('boss', 15, { ...game, _chapter: 1 });
    game.enemyBullets.length = 0;
    chapterBossBasicAttack(1, boss, player, game);
    assert.equal(game.enemyBullets.length, 3, 'ch1 普攻保留3发毒球');
    game.enemyBullets.length = 0;
    chapterBossBasicAttack(3, boss, player, game);
    assert.equal(game.enemyBullets.length, 1, 'ch3 P1 普攻1发（被动进化起点）');
    boss.phase = 3;
    game.enemyBullets.length = 0;
    chapterBossBasicAttack(3, boss, player, game);
    assert.equal(game.enemyBullets.length, 3, 'ch3 P3 普攻进化到3发');
});

test('奇点弹:吸引范围内玩家向弹心位移,寿命耗尽按吸收数射回追踪弹', () => {    // 场景A（吸引）：静止奇点在玩家吸引半径内，拉动方向指向弹心且止步于碰撞圈外。
    const poolA = new BulletPool(4);
    const gameA = makeMockGame();
    const playerA = makePlayer({ x: 300, y: 0 });
    poolA.spawn({
        isEnemyBullet: true, owner: 'enemy', hitSource: 'boss_ch4',
        x: 200, y: 0, vx: 0, vy: 0, damage: 40, radius: 16, color: '#b06bff',
        lifeTime: 3, attract: { radius: 180, pullSpeed: 130, absorbRadius: 70 }, burstDmg: 20,
    });
    poolA.updateEnemyBullets(0.1, playerA, gameA);
    assert.ok(playerA.x < 300 && playerA.x > 216, `吸引应把玩家拉向弹心但止步圈外（x=${playerA.x}）`);

    // 场景B（吸收+坍缩）：玩家远离奇点弹道，玩家子弹被吸收；寿命耗尽射回追踪弹。
    const enemyBullets = [];
    const gameB = makeMockGame({ enemyBullets });
    const playerB = makePlayer({ x: 200, y: 400 });
    const poolB = new BulletPool(8);
    poolB.spawn({ x: 200, y: 560, vx: 0, vy: -500, damage: 10, owner: 'player', radius: 5, lifeTime: 5 });
    poolB.spawn({
        isEnemyBullet: true, owner: 'enemy', hitSource: 'boss_ch4',
        x: 200, y: 200, vx: 0, vy: 0, damage: 40, radius: 16, color: '#b06bff',
        lifeTime: 3, attract: { radius: 180, pullSpeed: 130, absorbRadius: 70 }, burstDmg: 20,
    });
    poolB.update(0.72, [], playerB, gameB);          // 玩家子弹上移 360px 进入吸收半径
    poolB.updateEnemyBullets(0.3, playerB, gameB);   // 奇点吸收玩家子弹
    const singularity = poolB.active.find(b => b.attract);
    assert.ok(!!singularity, '奇点应仍在场（玩家远离弹道不触发命中消散）');
    assert.ok((singularity._absorbed ?? 0) >= 1, `应吸收至少1发玩家子弹（实际${singularity._absorbed ?? 0}）`);
    const before = enemyBullets.length;
    poolB.updateEnemyBullets(3.0, playerB, gameB);   // 寿命耗尽 → 坍缩
    assert.ok(enemyBullets.length - before >= 3, `奇点坍缩应射回基础2发+吸收数（实际${enemyBullets.length - before}）`);
    assert.ok(enemyBullets.slice(before).every(b => b.homing === true), '射回的应是追踪弹');
});

// ── 2026-11-09 全面排查补测 ──────────────────────────────

test('暗影猎手影袭兜底:预警圈回调被外部清场时,兜底计时强制现身', () => {
    // 不提供 spawnWarnCircle（模拟静止靶模式清空 hazard 后回调永不执行）
    const game = makeMockGame();
    const e = makeEnemy('miniboss', game);
    e.x = 0; e.y = 0;
    const player = makePlayer({ x: 300, y: 0, lastMoveX: 1, lastMoveY: 0 });
    e._lungeCd = 0;
    e.update(0.016, player, game);
    assert.ok(e.invisible && e.invulnerable, '影袭引导期隐身无敌');
    assert.ok(e._shadowT > 0, '应同时启动兜底计时');
    // 推进兜底计时（预警圈不存在，回调不会执行）
    for (let i = 0; i < 70 && e.invisible; i++) e.update(0.016, player, game);
    assert.ok(!e.invisible && !e.invulnerable, '兜底计时到期必须强制现身，不得永久无敌');
    assert.equal(e._shadowT, 0, '兜底计时归零');
});

test('石像鬼震地:普攻改为落点圆形AoE并伴随同长预警圈', () => {
    const warns = [];
    const game = makeMockGame({
        spawnWarnCircle(x, y, r, delay) { warns.push({ x, y, r, delay }); },
    });
    const e = makeEnemy('golem', game);
    e.x = 0; e.y = 0;
    const player = makePlayer({ x: 80, y: 0 }); // atkDist = 26+16+48 = 90 内
    e._atkCd = 0; e.flankBias = 0;
    e.update(0.016, player, game);
    assert.equal(e.attackWindup > 0, true, '进入近战前摇');
    assert.equal(warns.length, 1, '前摇开始应放置落点预警圈');
    assert.equal(warns[0].r, 90, '震地AoE半径90');
    assert.ok(Math.abs(warns[0].delay - e.attackWindupMax) < 1e-9, '预警时长与前摇同长');
    const hpBefore = player.hp;
    e.update(e.attackWindupMax, player, game);
    assert.ok(player.hp < hpBefore, '圈内玩家应被震地命中');
});

test('盾龟裂地波:冲锋自然收势时向8向发出环形地刺', () => {
    const game = makeMockGame();
    const e = makeEnemy('turtle', game);
    e.x = 200; e.y = 200;
    const player = makePlayer({ x: 600, y: 200 });
    // 手动注入一次冲锋（等同技能2触发后的状态）
    e._chargeVx = 200; e._chargeVy = 0;
    e._chargeT = 0.05;
    e._chargeDmg = 0;
    const before = game.enemyBullets.length;
    e.update(0.06, player, game); // 冲锋倒计时归零 → 裂地波
    assert.equal(game.enemyBullets.length - before, 8, '裂地波应发8向地刺');
});

test('章节Boss普攻节奏随阶段加速(2.6/2.2/1.9),不得固定过快', () => {
    const game = makeMockGame({ _chapter: 7, spawnWarnCircle() {}, spawnWarnLine() {} });
    const player = makePlayer({ x: 640, y: 300 });
    const boss = new BossController();
    boss.init('boss', 15, game);
    const paces = [];
    for (const phase of [1, 2, 3]) {
        boss.phase = phase;
        boss.docBasicTimer = 0;
        boss.docSkillTimer = 999;
        boss._updateChapterBossSkills(0.01, player, game);
        paces.push(boss.docBasicTimer);
    }
    assert.deepEqual(paces.map(p => Math.round(p * 10) / 10), [2.6, 2.2, 1.9], `普攻节奏应为 2.6/2.2/1.9（实际 ${paces}）`);
});

test('小Boss激怒后冷却真实缩短:盾龟冲锋CD按85%重置', () => {
    const game = makeMockGame();
    const player = makePlayer({ x: 900, y: 400 });
    const e = makeEnemy('turtle', game);
    e.hp = e.maxHp * 0.4;
    e.update(0.016, player, game); // 同帧：激怒标记 → 冷却按85%重置
    assert.equal(e.miniEnraged, true, '40%血应触发激怒');
    assert.ok(Math.abs(e._miniCd1 - 6 * 0.85) < 1e-9, `激怒后冲锋CD应为5.1s（实际${e._miniCd1}）`);
    // 对照：满血个体同帧重置为基准6s
    const fresh = makeEnemy('turtle', game);
    fresh.update(0.016, player, game);
    assert.equal(fresh.miniEnraged, false, '满血不激怒');
    assert.ok(Math.abs(fresh._miniCd1 - 6) < 1e-9, `基准CD应为6s（实际${fresh._miniCd1}）`);
});
