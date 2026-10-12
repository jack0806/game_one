'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { actorClip } = require('../dist/data/ActorAnimationDB');
const { ActorAnimation } = require('../dist/core/ActorAnimation');
const { BossController } = require('../dist/entities/BossController');
const { EnemyBase } = require('../dist/entities/EnemyBase');
const { makeMockGame } = require('./mockGame');
const root = path.resolve(__dirname, '../..');
const baseline = require('../../docs/art/style-a/enemy-redesign/baseline.json');
const coverage = require('../../docs/art/style-a/enemy-redesign/coverage.json');
function timeline(clip) {
    let seconds = 0;
    const events = [];
    for (const frame of clip.frames) {
        if (frame.event) events.push([frame.event, Number(seconds.toFixed(6))]);
        seconds += frame.seconds;
    }
    return { seconds: Number(seconds.toFixed(6)), events };
}
test('已优化的攻击特效、弹体与技能图标逐文件哈希保持不变', () => {
    for (const [name, hash] of Object.entries(baseline.protectedArt)) {
        const current = createHash('sha256').update(fs.readFileSync(path.join(root,'assets/resources/art',name))).digest('hex');
        assert.equal(current,hash,name);
    }
});
test('37种敌人三方向动作全部换成新身体，保留原有释放时刻', () => {
    assert.equal(baseline.units.length, 37);
    for (const unit of baseline.units) for (const view of ['front','side','back']) {
        for (const action of new Set(['idle','walk','run','attack','hit','defeated', ...Object.keys(unit.clips[view] || {})])) {
            const clip = actorClip(unit.key, view, action);
            assert.ok(clip?.sheet.startsWith('anim_stylea_'), `${unit.id}/${view}/${action}`);
            assert.equal(clip.frames.length, 8);
            const old = unit.clips[view]?.[action];
            if (old) assert.deepEqual(timeline(clip), timeline(old), `${unit.id}/${view}/${action}时序漂移`);
        }
    }
});
test('按可见轮廓区分小兵、小Boss和首领体形，透明留白不影响层级', () => {
    const extent = tier => coverage.filter(u => u.category === tier).map(u => u.visibleExtent);
    assert.ok(Math.min(...extent('miniboss')) > Math.max(...extent('grunt')) * 1.4);
    assert.ok(Math.min(...extent('boss')) > Math.max(...extent('miniboss')) * 1.3);
});
test('转向与走跑切换保留承重相位，攻击仍从起点播放', () => {
    const clock = new ActorAnimation();
    const front = actorClip('enemy_grunt','front','walk');
    clock.play('walk', front);
    for (let n=0;n<7;n++) clock.update(.03);
    const phase = timeline(front).seconds;
    const elapsed = front.frames.slice(0,clock.frame).reduce((s,f)=>s+f.seconds,clock.elapsed)/phase;
    const side = actorClip('enemy_grunt','side','run');
    clock.play('run', side, false, true);
    const next = side.frames.slice(0,clock.frame).reduce((s,f)=>s+f.seconds,clock.elapsed)/timeline(side).seconds;
    assert.ok(Math.abs(next-elapsed)<1e-6);
    clock.play('attack',actorClip('enemy_grunt','side','attack'),false,true);
    assert.equal(clock.frame,0);
    assert.equal(clock.elapsed,0);
});
test('蓄力按实际前摇推进预备动作，不能抢先播放释放帧', () => {
    const e = new EnemyBase();e.init('golem',1,makeMockGame());
    const p={x:e.x+100,y:e.y};
    e.attackWindup=e.attackWindupMax;
    e.updateVisualAnimation(.01,p);
    assert.equal(e.actorAnimation.frame,0);
    e.attackWindup=e.attackWindupMax*.2;
    e.updateVisualAnimation(.01,p);
    const release=e.actorAnimation.clip.frames.findIndex(f=>f.event==='strike');
    assert.ok(e.actorAnimation.frame>0 && e.actorAnimation.frame<release);
    e.attackWindup=0;e.actionRecoil=.24;e.updateVisualAnimation(.01,p);
    assert.equal(e.actorAnimation.frame,release);
});
test('正式第五章和第六章采用各自的技能身体动作，终形有独立三方向', () => {
    const game = makeMockGame();
    const mech = new BossController();
    mech.initBoss(21,game);
    mech.visualMechBuffT = .5;
    mech.updateVisualAnimation(.01,{x:800,y:300});
    assert.equal(mech.actorAnimation.action,'skill3');
    const invader = new BossController();
    invader.initBoss(26,game);
    invader.visualInvaderSkillT=.5;invader.visualInvaderSkillIndex=2;
    invader.updateVisualAnimation(.01,{x:800,y:300});
    assert.equal(invader.actorAnimation.action,'skill2');
    invader.finalForm=true;invader._invFormT=0;
    assert.equal(invader.animationSpriteKey,'enemy_boss_final');
    for(const view of ['front','side','back']) assert.ok(actorClip('enemy_boss_final',view,'attack').sheet.includes('invader_final'));
});
