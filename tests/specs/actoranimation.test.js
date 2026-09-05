'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ActorAnimation, animationSocket } = require('../dist/core/ActorAnimation');
const { actorClip } = require('../dist/data/ActorAnimationDB');
const { PlayerController } = require('../dist/entities/PlayerController');
const { CHARACTERS } = require('../dist/data/CharacterDB');
const { makeMockGame } = require('./mockGame');

const clip = action => actorClip('char_token_kai', 'side', action);
function advance(animation, seconds) {
    for (let t = 0; t < seconds - 1e-9; t += 0.01) animation.update(0.01);
}

test('开火只在开火帧发生一次，暂停不推进，掉帧受DT_MAX限制', () => {
    const animation = new ActorAnimation();
    animation.play('attack', clip('attack'));
    animation.update(0);
    assert.deepEqual(animation.takeEvents(), []);
    animation.update(10);
    assert.equal(animation.frame, 0, '大dt应钳制到0.05秒');
    animation.update(0.02);
    assert.deepEqual(animation.takeEvents(), ['fire']);
    advance(animation, 1);
    assert.deepEqual(animation.takeEvents(), []);
    assert.equal(animation.finished, true);
    assert.equal(animation.frame, 3);
});

test('行走循环衔接，受击可打断攻击，倒下只播放一次并停在最后一帧', () => {
    const animation = new ActorAnimation();
    animation.play('walk', clip('walk'));
    advance(animation, 0.54);
    assert.equal(animation.frame, 0);
    animation.play('attack', clip('attack'));
    assert.equal(animation.play('walk', clip('walk')), false);
    assert.equal(animation.play('hit', clip('hit')), true);
    assert.equal(animation.play('defeated', clip('defeated')), true);
    advance(animation, 1);
    assert.equal(animation.frame, 3);
    assert.equal(animation.play('idle', clip('idle')), false);
    animation.reset();
    assert.equal(animation.play('idle', clip('idle')), true);
});

test('多技能动作同级切换且受击仍可打断', () => {
    const animation = new ActorAnimation();
    const skill = actorClip('enemy_squid', 'front', 'skill');
    const skill2 = actorClip('enemy_squid', 'front', 'skill2');
    const skill3 = actorClip('enemy_squid', 'front', 'skill3');
    assert.equal(animation.play('skill', skill), true);
    assert.equal(animation.play('skill2', skill2), true);
    assert.equal(animation.play('skill3', skill3), true);
    assert.equal(animation.action, 'skill3');
    assert.equal(animation.play('hit', actorClip('enemy_squid', 'front', 'hit')), true);
});

test('逐帧枪口跟随精灵枢轴，朝左镜像只改变x分量', () => {
    for (const frame of clip('attack').frames) {
        const right = animationSocket(frame, 400, 300, 82, 1);
        const left = animationSocket(frame, 400, 300, 82, -1);
        assert.ok(right[0] > 400 && right[1] < 300);
        assert.equal(right[0] - 400, 400 - left[0]);
        assert.equal(right[1], left[1]);
    }
});

test('凯尔普攻等到开火帧并从当帧武器挂点发弹', () => {
    const p = new PlayerController();
    p._charDef = CHARACTERS.kai;
    p.stats = { ...CHARACTERS.kai.stats, extraBullets: 0, bulletBounce: 0 };
    const bullets = [];
    const game = makeMockGame({ bulletPool: { spawn: b => bullets.push(b) } });
    p._shoot({ mouse: { x: 1000, y: 360 } }, game);
    assert.equal(bullets.length, 0);
    p.updateVisualAnimation(0.05);
    p.updateVisualAnimation(0.02);
    assert.equal(bullets.length, 1);
    assert.deepEqual([bullets[0].x, bullets[0].y], p.getMuzzlePosition());
    assert.ok(bullets[0].x > p.x);
    assert.ok(bullets[0].y < p.y);
    p.updateVisualAnimation(0.05);
    assert.equal(bullets.length, 1);
});

test('受击取消尚未到开火帧的攻击，不在受击动作里凭空出弹', () => {
    const p = new PlayerController();
    p._charDef = CHARACTERS.kai;
    p.stats = { ...CHARACTERS.kai.stats };
    const bullets = [];
    const game = makeMockGame({ bulletPool: { spawn: b => bullets.push(b) } });
    p._shoot({ mouse: { x: 1000, y: 360 } }, game);
    p.playVisualAction('hit');
    for (let i = 0; i < 20; i++) p.updateVisualAnimation(0.02);
    assert.equal(bullets.length, 0);
});

function makeAnimatedPlayer(attackSpeed = 3) {
    const p = new PlayerController();
    p._charDef = CHARACTERS.kai;
    p.stats = { ...CHARACTERS.kai.stats, attackSpeed, cdReduction: 0, critRate: 0 };
    p.hp = p.stats.maxHp;
    return p;
}
const noKeys = { moveX: 0, moveY: 0, mouse: { x: 1000, y: 360 },
    isKeyQ: () => false, isKeyE: () => false, isKeyR: () => false };

test('跳跃按下后完整经过腾空和落地，期间不被自动射击抢走动作', () => {
    const p = makeAnimatedPlayer(20);
    let shots = 0;
    const game = makeMockGame({ bulletPool: { spawn: () => shots++ } });
    p.tick(0.01, { ...noKeys, isJumpPressed: () => true }, game);
    assert.equal(p.actorAnimation.action, 'jump');
    for (let i = 0; i < 7; i++) p.tick(0.05, noKeys, game);
    assert.equal(p.actorAnimation.frame, 2, '空中收膝帧');
    assert.equal(shots, 0);
    p.tick(0.05, noKeys, game);
    assert.equal(p.actorAnimation.frame, 3, '落地帧');
    for (let i = 0; i < 6; i++) p.tick(0.05, noKeys, game);
    assert.ok(shots > 0, '落地后恢复射击');
});

test('前摇中重复请求不能重置时钟或覆盖尚未发出的攻击', () => {
    const p = makeAnimatedPlayer();
    let shots = 0;
    const game = makeMockGame({ bulletPool: { spawn: () => shots++ } });
    assert.equal(p._shoot(noKeys, game), true);
    for (let i = 0; i < 6; i++) {
        p.updateVisualAnimation(0.01);
        assert.equal(p._shoot(noKeys, game), false);
    }
    p.updateVisualAnimation(0.01);
    assert.equal(shots, 1);
});

test('受击锁定时拒绝立即发弹，恢复后才允许新的攻击', () => {
    const p = makeAnimatedPlayer();
    let shots = 0;
    const game = makeMockGame({ bulletPool: { spawn: () => shots++ } });
    p.playVisualAction('hit');
    assert.equal(p._shoot(noKeys, game), false);
    for (let i = 0; i < 20; i++) p.updateVisualAnimation(0.02);
    assert.equal(shots, 0);
    assert.equal(p._shoot(noKeys, game), true);
    for (let i = 0; i < 5; i++) p.updateVisualAnimation(0.02);
    assert.equal(shots, 1);
});

for (const fps of [30, 60, 120]) test(`${fps}帧下20次每秒连射不因动作前摇饿死或明显少发`, () => {
    const p = makeAnimatedPlayer(20);
    let shots = 0;
    const game = makeMockGame({ bulletPool: { spawn: () => shots++ } });
    for (let i = 0; i < 2 * fps; i++) p.tick(1 / fps, noKeys, game);
    assert.ok(shots >= 38 && shots <= 40, `两秒内实际发射 ${shots} 次`);
});

test('低帧率跨过开火姿势时仍使用开火事件帧的枪口，不误用收招挂点', () => {
    const p = makeAnimatedPlayer(20);
    const bullets = [], flashes = [];
    const game = makeMockGame({ bulletPool: { spawn: b => bullets.push(b) } });
    game.particles.weaponFlash = (x, y) => flashes.push([x, y]);
    p._shoot(noKeys, game);
    p.updateVisualAnimation(1 / 30);
    assert.equal(p.actorAnimation.frame, 2, '这一次更新已跨过第2张开火姿势');
    const expected = animationSocket(clip('attack').frames[1], p.x, p.y, 82, 1);
    assert.deepEqual([bullets[0].x, bullets[0].y], expected);
    assert.deepEqual(flashes[0], expected);
    assert.notDeepEqual(expected, p.getMuzzlePosition(), '回调结束后挂点恢复为当前显示帧');
});

test('三个方向和左右镜像均从当帧枪口瞄向目标而非偏移的平行线', () => {
    for (const [dx, dy, view] of [[300, 0, 'side'], [-300, 0, 'side'], [0, 250, 'front'], [0, -250, 'back']]) {
        const p = makeAnimatedPlayer();
        const target = { x: p.x + dx, y: p.y + dy, alive: true };
        const bullets = [];
        const game = makeMockGame({ getNearestEnemy: () => target, bulletPool: { spawn: b => bullets.push(b) } });
        p._shoot(noKeys, game);
        p.updateVisualAnimation(0.05); p.updateVisualAnimation(0.02);
        assert.equal(p.animationView, view);
        assert.equal(bullets.length, 1);
        const b = bullets[0];
        assert.deepEqual([b.x, b.y], p.getMuzzlePosition());
        const cross = (target.x - b.x) * b.vy - (target.y - b.y) * b.vx;
        assert.ok(Math.abs(cross) < 1e-7);
        assert.ok((target.x - b.x) * b.vx + (target.y - b.y) * b.vy > 0);
    }
});

test('致命受击只通知一次，死亡tick推进倒下并取消子弹，重生解除动作锁', () => {
    const p = makeAnimatedPlayer();
    let shots = 0, deaths = 0;
    const game = makeMockGame({ onPlayerDeath: () => deaths++, bulletPool: { spawn: () => shots++ } });
    p._shoot(noKeys, game);
    p.takeDamage(100000, game);
    p.takeDamage(100000, game);
    const position = [p.x, p.y];
    for (let i = 0; i < 30; i++) p.tick(0.04, { ...noKeys, moveX: 1 }, game);
    assert.equal(deaths, 1);
    assert.equal(shots, 0);
    assert.deepEqual([p.x, p.y], position);
    assert.equal(p.actorAnimation.action, 'defeated');
    assert.equal(p.actorAnimation.finished, true);
    assert.equal(p.actorAnimation.frame, 3);
    p.alive = true; p.hp = p.stats.maxHp; p.resetVisualAnimation();
    assert.equal(p._shoot(noKeys, game), true);
    p.updateVisualAnimation(0.05); p.updateVisualAnimation(0.02);
    assert.equal(shots, 1);
});

test('薇薇安三方向与左右镜像从无人机开火帧发射，双炮外观不增加伤害次数', () => {
    for (const [dx, dy, view, mirror] of [[300, 0, 'side', 1], [-300, 0, 'side', -1],
        [0, 250, 'front', 1], [0, -250, 'back', 1]]) {
        const p = makeAnimatedPlayer();
        p.charId = 'vivian'; p.spriteKey = 'char_token_vivian'; p._charDef = CHARACTERS.vivian;
        p.stats = { ...CHARACTERS.vivian.stats, attackSpeed: 3, critRate: 0 };
        const target = { x: p.x + dx, y: p.y + dy, alive: true };
        const bullets = [], flashes = [];
        const game = makeMockGame({ getNearestEnemy: () => target, bulletPool: { spawn: b => bullets.push(b) } });
        game.particles.weaponFlash = (x, y) => flashes.push([x, y]);
        p._shoot(noKeys, game);
        p.updateVisualAnimation(0.05);
        assert.equal(bullets.length, 0, '按下遥控器前不应发射');
        p.updateVisualAnimation(0.02);
        const fireFrame = actorClip(p.spriteKey, view, 'attack').frames.find(frame => frame.event === 'fire');
        const expected = animationSocket(fireFrame, p.x, p.y, 82, mirror);
        assert.equal(bullets.length, 1);
        assert.deepEqual([bullets[0].x, bullets[0].y], expected);
        assert.deepEqual(flashes, [expected]);
        assert.ok(expected[1] < p.y - 15, '出弹点应位于肩部无人机高度，不能回退到腰部');
        const cross = (target.x - expected[0]) * bullets[0].vy - (target.y - expected[1]) * bullets[0].vx;
        assert.ok(Math.abs(cross) < 1e-7, '应从实际炮口重新瞄准目标');
        for (let i = 0; i < 8; i++) p.updateVisualAnimation(0.05);
        assert.equal(bullets.length, 1, '收招和第二门炮不应产生额外伤害');
    }
});

test('格雷夫与奥莉亚不同画布和尺度的动作从实际施法掌或枪口瞄准发弹', () => {
    for (const id of ['graf', 'olia']) for (const [dx, dy, view, mirror] of [
        [300, 0, 'side', 1], [-300, 0, 'side', -1], [0, 250, 'front', 1], [0, -250, 'back', 1]]) {
        const p = makeAnimatedPlayer();
        p.charId = id; p.spriteKey = 'char_token_' + id; p._charDef = CHARACTERS[id];
        p.stats = { ...CHARACTERS[id].stats, attackSpeed: 3, critRate: 0 };
        const target = { x: p.x + dx, y: p.y + dy, alive: true }, bullets = [];
        const game = makeMockGame({ getNearestEnemy: () => target, bulletPool: { spawn: b => bullets.push(b) } });
        p._shoot(noKeys, game);
        p.updateVisualAnimation(0.05);
        assert.equal(bullets.length, 0);
        p.updateVisualAnimation(0.02);
        const current = actorClip(p.spriteKey, view, 'attack');
        const expected = animationSocket(current.frames[1], p.x, p.y, 82 * (current.displayScale ?? 1), mirror);
        assert.equal(bullets.length, 1);
        assert.deepEqual([bullets[0].x, bullets[0].y], expected);
        assert.notDeepEqual(expected, [p.x, p.y]);
        const cross = (target.x - expected[0]) * bullets[0].vy - (target.y - expected[1]) * bullets[0].vx;
        assert.ok(Math.abs(cross) < 1e-7);
    }
});

test('奥莉亚E切换后使用独立挥刃动作并在命中帧结算，切回远程恢复射击', () => {
    for (const [dx, dy] of [[60, 0], [-60, 0], [0, 60], [0, -60]]) {
        const p = makeAnimatedPlayer();
        p.charId = 'olia'; p.spriteKey = 'char_token_olia'; p._charDef = CHARACTERS.olia;
        p.stats = { ...CHARACTERS.olia.stats, critRate: 0 };
        let hits = 0, shots = 0;
        const enemy = { x: p.x + dx, y: p.y + dy, radius: 18, alive: true,
            takeDamage(damage) { hits++; return damage; } };
        const game = makeMockGame({ getNearestEnemy: () => enemy, bulletPool: { spawn: () => shots++ } });
        CHARACTERS.olia.eSkill(p, game);
        assert.equal(p.attackForm, 'melee');
        assert.equal(p._shoot(noKeys, game), true);
        assert.equal(p.actorAnimation.action, 'attackMelee');
        p.updateVisualAnimation(0.05);
        assert.equal(hits, 0);
        p.updateVisualAnimation(0.02);
        assert.equal(hits, 1);
        assert.equal(shots, 0);
        for (let i = 0; i < 12; i++) p.updateVisualAnimation(0.05);
        assert.equal(hits, 1);
        CHARACTERS.olia.eSkill(p, game);
        p._shoot(noKeys, game);
        assert.equal(p.actorAnimation.action, 'attack');
        p.updateVisualAnimation(0.05); p.updateVisualAnimation(0.02);
        assert.equal(shots, 1);
        assert.equal(hits, 1);
    }
});

for (const id of ['kai', 'liana']) test(`${id}的Q在释放帧从当前武器发射并保持按键时朝向`, () => {
    const p = makeAnimatedPlayer();
    p.charId = id; p.spriteKey = 'char_token_' + id; p._charDef = CHARACTERS[id];
    p.stats = { ...CHARACTERS[id].stats, cdReduction: 0, critRate: 0 };
    const bullets = [], effects = [];
    const game = makeMockGame({ testCeasefire: true, bulletPool: { spawn: b => { bullets.push(b); return b; } } });
    game.particles.explode = (x, y) => effects.push([x, y]);
    p.tick(0.01, { ...noKeys, isKeyQ: () => true }, game);
    assert.ok(p.getQCdRatio() < 0.01, '收到请求即开始冷却');
    assert.equal(bullets.length, 0);
    p.x += 25; p.facingX = -1;
    for (let i = 0; i < 5; i++) p.tick(0.05, noKeys, game);
    assert.equal(bullets.length, 0, '蓄能帧不能提前出弹');
    p.tick(0.02, noKeys, game);
    assert.equal(bullets.length, 1);
    assert.deepEqual([bullets[0].x, bullets[0].y], p.getMuzzlePosition());
    assert.ok(bullets[0].vx > 0, '排队期间改变移动方向不应改变已准备的技能方向');
    if (id === 'kai') assert.deepEqual(effects[0], [bullets[0].x, bullets[0].y]);
    else assert.equal(typeof bullets[0].onHitCb, 'function', '冰冻命中回调保留');
});

test('同帧Q/E/R依次施放且各执行一次，后一个请求不能覆盖前一个', () => {
    const p = makeAnimatedPlayer();
    const order = [];
    p._charDef = { ...CHARACTERS.kai,
        qSkill: () => order.push(['q', p.actorAnimation.action]),
        eSkill: () => order.push(['e', p.actorAnimation.action]),
        ultimate: () => order.push(['r', p.actorAnimation.action]) };
    p._rCharge = 1;
    const game = makeMockGame({ testCeasefire: true });
    p.tick(0.01, { ...noKeys, isKeyQ: () => true, isKeyE: () => true, isKeyR: () => true }, game);
    assert.deepEqual(order, []);
    for (let i = 0; i < 45; i++) p.tick(0.05, noKeys, game);
    assert.deepEqual(order, [['q', 'skill'], ['e', 'skill2'], ['r', 'skill3']]);
});

test('受击中断会在恢复后重播施放而不重复扣CD，死亡则取消全部待施放技能', () => {
    const p = makeAnimatedPlayer();
    let casts = 0;
    p._charDef = { ...CHARACTERS.kai, qSkill: () => casts++, eSkill: () => casts++ };
    const game = makeMockGame({ testCeasefire: true, onPlayerDeath() {} });
    p.tick(0.01, { ...noKeys, isKeyQ: () => true }, game);
    const cd = p._qCd;
    p.tick(0.05, noKeys, game);
    p.takeDamage(1, game);
    for (let i = 0; i < 20; i++) p.tick(0.05, noKeys, game);
    assert.equal(casts, 1);
    assert.ok(p._qCd < cd - 0.9, '恢复施放不重置已经消耗的冷却');
    p.resetCooldowns();
    p.tick(0.01, { ...noKeys, isKeyQ: () => true, isKeyE: () => true }, game);
    p.takeDamage(100000, game);
    for (let i = 0; i < 30; i++) p.tick(0.05, noKeys, game);
    assert.equal(casts, 1, '死亡后队列不得继续释放');
});
