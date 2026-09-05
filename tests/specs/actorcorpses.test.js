'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ActorCorpses } = require('../dist/core/ActorCorpses');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { makeMockGame, makePlayer } = require('./mockGame');

function enemy() {
    const e = new EnemyBase();
    e.init('grunt', 1, makeMockGame());
    e.x = 400; e.y = 200;
    e.updateVisualAnimation(0, { x: 400, y: 400 });
    return e;
}

test('敌人逻辑死亡只结算一次，节点保留到倒下和淡出结束', () => {
    const e = enemy();
    const disposed = [];
    const corpses = new ActorCorpses(actor => disposed.push(actor));
    let drops = 0;
    const game = makeMockGame({ economy: { spawnDrop: () => drops++ } });
    e.takeDamage(100000, makePlayer(), game);
    e.takeDamage(100000, makePlayer(), game);
    corpses.add(e); corpses.add(e);
    assert.equal(e.alive, false);
    assert.equal(drops, 1);
    assert.equal(game.kills, 1);
    assert.equal(corpses.entries.length, 1);
    assert.equal(disposed.length, 0);
    for (let i = 0; i < 16; i++) corpses.update(0.05);
    assert.equal(e.actorAnimation.finished, true);
    assert.equal(e.actorAnimation.frame, 3);
    assert.equal(disposed.length, 0, '播完后应短暂停留而非立即消失');
    for (let i = 0; i < 14; i++) corpses.update(0.05);
    assert.deepEqual(disposed, [e]);
    assert.equal(corpses.entries.length, 0);
});

test('尸体上限、清场与暂停都不会泄漏节点或重复回收', () => {
    const disposed = [];
    const corpses = new ActorCorpses(actor => disposed.push(actor), 2);
    const actors = [enemy(), enemy(), enemy()];
    for (const e of actors) { e.alive = false; corpses.add(e); }
    assert.deepEqual(disposed, [actors[0]]);
    corpses.update(0);
    assert.equal(actors[1].actorAnimation.frame, 0);
    corpses.update(1000);
    assert.equal(actors[1].actorAnimation.frame, 0, '大dt受DT_MAX限制');
    corpses.clear(); corpses.clear();
    assert.deepEqual(disposed, actors);
    assert.equal(corpses.entries.length, 0);
});

test('敌人蓄力保持准备姿势，结算当帧转入挥击，下一次蓄力正确重置', () => {
    const e = enemy(), player = { x: 400, y: 400 };
    e.attackTargetX = player.x; e.attackTargetY = player.y;
    e.attackWindup = 0.5;
    for (let i = 0; i < 10; i++) e.updateVisualAnimation(0.05, player);
    assert.equal(e.actorAnimation.action, 'attack');
    assert.equal(e.actorAnimation.frame, 0);
    e.attackWindup = 0; e.actionRecoil = 0.24;
    e.updateVisualAnimation(0.01, player);
    assert.equal(e.actorAnimation.frame, 1);
    e.actionRecoil = 0;
    for (let i = 0; i < 10; i++) e.updateVisualAnimation(0.04, player);
    e.attackWindup = 0.3;
    e.updateVisualAnimation(0.01, player);
    assert.equal(e.actorAnimation.action, 'attack');
    assert.equal(e.actorAnimation.frame, 0);
});

test('石像鬼重拳结算读取strike事件并跳到真正砸地的第三帧', () => {
    const e = new EnemyBase(), player = { x: 400, y: 400 };
    e.init('golem', 1, makeMockGame());
    e.x = 400; e.y = 200;
    e.updateVisualAnimation(0, player);
    e.actionRecoil = 0.24;
    e.updateVisualAnimation(0.01, player);
    assert.equal(e.actorAnimation.action, 'attack');
    assert.equal(e.actorAnimation.frame, 2);
    assert.equal(e.actorAnimation.currentFrame.event, 'strike');
});

test('锈齿扑兵进入锁向突扑时直接显示技能爆发帧', () => {
    const e = new EnemyBase(), player = { x: 560, y: 200 };
    e.init('rust_biter', 1, makeMockGame());
    e.x = 400; e.y = 200;
    e.updateVisualAnimation(0, player);
    e._chargeT = 0.20;
    e.updateVisualAnimation(0.01, player);
    assert.equal(e.actorAnimation.action, 'skill');
    assert.equal(e.actorAnimation.frame, 2);
    assert.equal(e.actorAnimation.currentFrame.event, 'cast');
});

test('铆甲兽护板顶撞开始时切到冲锋爆发帧', () => {
    const e = new EnemyBase(), player = { x: 560, y: 200 };
    e.init('rivet_beast', 1, makeMockGame());
    e.x = 400; e.y = 200;
    e.updateVisualAnimation(0, player);
    e._chargeT = 0.40;
    e.updateVisualAnimation(0.01, player);
    assert.equal(e.actorAnimation.action, 'skill');
    assert.equal(e.actorAnimation.frame, 2);
    assert.equal(e.actorAnimation.currentFrame.event, 'cast');
    e.combatFacingX = 1; e.combatFacingY = 0;
    player.x = 400; player.y = 40;
    assert.deepEqual(e.getVisualFacing(player), [1, 0], '冲锋途中身体必须沿锁定走廊，不能转向移动后的玩家');
});

test('掠金虫受击完成后播放无伤害逃逸爆发并落到第三帧', () => {
    const e = new EnemyBase(), player = { x: 560, y: 200 };
    e.init('gold_scavenger', 1, makeMockGame());
    e.x = 400; e.y = 200;
    e.updateVisualAnimation(0, player);
    e.scavengerHitBoost = 0.8;
    e.flashTimer = 0.15;
    e.updateVisualAnimation(0.01, player);
    assert.equal(e.actorAnimation.action, 'hit');
    for (let i = 0; i < 9; i++) e.updateVisualAnimation(0.05, player);
    e.updateVisualAnimation(0.01, player);
    assert.equal(e.actorAnimation.action, 'skill');
    for (let i = 0; i < 4; i++) e.updateVisualAnimation(0.05, player);
    assert.equal(e.actorAnimation.frame, 2);
    assert.equal(e.actorAnimation.currentFrame.event, 'cast');
});

test('熔爆蜱倒计时立即覆盖受击并逐步推进到临界过热帧', () => {
    const e = new EnemyBase(), player = { x: 560, y: 200 };
    e.init('blast_tick', 1, makeMockGame());
    e.x = 400; e.y = 200;
    e.flashTimer = 0.15;
    e.updateVisualAnimation(0.01, player);
    assert.equal(e.actorAnimation.action, 'hit');
    e.blastCountdown = 0.8;
    e.blastCountdownMax = 0.8;
    e.updateVisualAnimation(0.01, player);
    assert.equal(e.actorAnimation.action, 'skill');
    for (let i = 0; i < 5; i++) e.updateVisualAnimation(0.05, player);
    assert.equal(e.actorAnimation.frame, 2);
    assert.equal(e.actorAnimation.currentFrame.event, 'cast');
});

test('烬火侍从结算地面火圈时显示喷口施法帧', () => {
    const hazards = [];
    const game = makeMockGame({ spawnEnemyEmberHazard: (...args) => hazards.push(args) });
    const player = makePlayer({ x: 560, y: 200 });
    const e = new EnemyBase(); e.init('ember_acolyte', 1, game);
    e.x = 400; e.y = 200; e._rangedCd = 0;
    e.updateVisualAnimation(0, player);
    e.update(0.01, player, game);
    e.updateVisualAnimation(0.01, player);
    assert.deepEqual(hazards, [[560, 200]]);
    assert.equal(e.actorAnimation.action, 'attack');
    assert.equal(e.actorAnimation.frame, 2);
    assert.equal(e.actorAnimation.currentFrame.event, 'cast');
    assert.ok(e.actorAnimation.currentFrame.muzzle);
});
