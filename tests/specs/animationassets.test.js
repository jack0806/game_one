'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ACTOR_ANIMATIONS } = require('../dist/data/ActorAnimationDB');
const { EFFECT_ANIMATIONS } = require('../dist/data/EffectAnimationDB');
const { resolveArtKey } = require('../dist/core/ArtRemap');

test('登记图集真实存在且PNG尺寸、RGBA、元数据与逐帧索引一致', () => {
    const clips = Object.values(ACTOR_ANIMATIONS).flatMap(set => Object.values(set).flatMap(view => Object.values(view)));
    clips.push(...Object.values(EFFECT_ANIMATIONS));
    const uuids = new Map();
    for (const clip of clips) {
        const file = path.resolve(__dirname, '../../assets/resources/art', resolveArtKey(clip.sheet) + '.png');
        const png = fs.readFileSync(file);
        assert.equal(png.subarray(1, 4).toString(), 'PNG', clip.sheet);
        assert.equal(png.readUInt32BE(16), clip.columns * clip.cellSize, clip.sheet);
        assert.equal(png.readUInt32BE(20), clip.rows * clip.cellSize, clip.sheet);
        assert.equal(png[25], 6, '必须为真实RGBA：' + clip.sheet);
        const meta = JSON.parse(fs.readFileSync(file + '.meta', 'utf8'));
        assert.ok(!uuids.has(meta.uuid) || uuids.get(meta.uuid) === file, '不同图集不能共享uuid');
        uuids.set(meta.uuid, file);
        const sf = Object.values(meta.subMetas).find(value => value.importer === 'sprite-frame');
        assert.ok(sf, '必须存在spriteFrame子资源：' + clip.sheet);
        assert.equal(sf.userData.rawWidth, clip.columns * clip.cellSize, clip.sheet);
        assert.equal(sf.userData.rawHeight, clip.rows * clip.cellSize, clip.sheet);
        assert.equal(sf.userData.packable, false, '逐帧纹理禁止动态合图');
        for (const frame of clip.frames) {
            assert.ok(Number.isInteger(frame.index) && frame.index >= 0 && frame.index < clip.rows * clip.columns);
            assert.ok(frame.seconds > 0);
            for (const point of [frame.pivot, frame.muzzle].filter(Boolean)) {
                assert.ok(point.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
            }
        }
    }
});

test('机械高达X剑士三向图集覆盖实际战斗动作', () => {
    const mech = ACTOR_ANIMATIONS.enemy_boss_mech;
    const required = ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated',
        'skill', 'skill2', 'skill3', 'skill4'];
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !mech[view]?.[action]), [], `机械高达${view}缺少动作`);
        assert.equal(mech[view].attack.frames[2].event, 'strike');
        for (const action of ['skill', 'skill2', 'skill3', 'skill4']) {
            assert.equal(mech[view][action].frames[2].event, 'cast', `${view}.${action}`);
        }
        assert.match(mech[view].idle.sheet, /_motion$/);
        assert.match(mech[view].skill.sheet, /_combat$/);
        assert.match(mech[view].skill2.sheet, /_skills$/);
        assert.equal(mech[view].skill2.frames[0].index, 0);
        assert.equal(mech[view].skill3.frames[0].index, 4);
        assert.equal(mech[view].skill4.frames[0].index, 8);
    }
});

test('深海恐惧三向图集覆盖五项实际主动技能', () => {
    const abyss = ACTOR_ANIMATIONS.enemy_boss_abyss;
    const required = ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated',
        'skill', 'skill2', 'skill3', 'skill4', 'skill5'];
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !abyss[view]?.[action]), [], `深海恐惧${view}缺少动作`);
        assert.equal(abyss[view].attack.frames[2].event, 'strike');
        for (const action of ['skill', 'skill2', 'skill3', 'skill4', 'skill5']) {
            assert.equal(abyss[view][action].frames[2].event, 'cast', `${view}.${action}`);
        }
        assert.match(abyss[view].idle.sheet, /_motion$/);
        assert.match(abyss[view].skill.sheet, /_combat$/);
        assert.equal(abyss[view].skill2.frames[0].index, 0);
        assert.equal(abyss[view].skill3.frames[0].index, 4);
        assert.equal(abyss[view].skill4.frames[0].index, 8);
        assert.equal(abyss[view].skill5.frames[0].index, 12);
    }
});

test('疫晶跳蛛维斯帕三向图集覆盖五项文档技能', () => {
    const set = ACTOR_ANIMATIONS.enemy_boss_vespa;
    const required = ['idle','walk','run','jump','attack','hit','defeated','skill','skill2','skill3','skill4','skill5'];
    for (const view of ['front','side','back']) {
        assert.deepEqual(required.filter(action => !set[view]?.[action]), []);
        assert.equal(set[view].attack.frames[2].event, 'strike');
        for (const action of ['skill','skill2','skill3','skill4','skill5']) assert.equal(set[view][action].frames[2].event, 'cast');
    }
});

test('磁潮坩埚城兽三向图集覆盖五项文档技能', () => {
    const set = ACTOR_ANIMATIONS.enemy_boss_crucible_city;
    const required = ['idle','walk','run','jump','attack','hit','defeated','skill','skill2','skill3','skill4','skill5'];
    for (const view of ['front','side','back']) {
        assert.deepEqual(required.filter(action => !set[view]?.[action]), []);
        assert.equal(set[view].attack.frames[2].event, 'strike');
        for (const action of ['skill','skill2','skill3','skill4','skill5']) assert.equal(set[view][action].frames[2].event, 'cast');
    }
});

test('折界裁缝万相三向图集覆盖五项文档技能', () => {
    const set = ACTOR_ANIMATIONS.enemy_boss_manyfold;
    const required = ['idle','walk','run','jump','attack','hit','defeated','skill','skill2','skill3','skill4','skill5'];
    for (const view of ['front','side','back']) {
        assert.deepEqual(required.filter(action => !set[view]?.[action]), []);
        assert.equal(set[view].attack.frames[2].event, 'strike');
        for (const action of ['skill','skill2','skill3','skill4','skill5']) assert.equal(set[view][action].frames[2].event, 'cast');
    }
});

test('凯尔Q/E/R分别使用强化射击、弹幕架炮和核心过载动作', () => {
    const kai = ACTOR_ANIMATIONS.char_token_kai;
    for (const view of ['front', 'side', 'back']) {
        assert.match(kai[view].skill.sheet, /anim_kai_/);
        assert.equal(kai[view].skill2.sheet, 'anim_kai_skill2');
        assert.equal(kai[view].skill3.sheet, 'anim_kai_skill3');
        assert.equal(kai[view].skill2.frames[2].event, 'cast');
        assert.equal(kai[view].skill3.frames[2].event, 'cast');
        assert.ok(kai[view].skill3.frames[2].muzzle, `${view}核心过载缺少炮口挂点`);
    }
});

test('薇薇安Q/E/R分别使用部署、超频和炮台风暴指令动作', () => {
    const vivian = ACTOR_ANIMATIONS.char_token_vivian;
    for (const view of ['front', 'side', 'back']) {
        assert.equal(vivian[view].skill2.sheet, 'anim_vivian_skill2');
        assert.equal(vivian[view].skill3.sheet, 'anim_vivian_skill3');
        assert.equal(vivian[view].skill2.frames[2].event, 'cast');
        assert.equal(vivian[view].skill3.frames[2].event, 'cast');
    }
});

test('雷克Q/E/R分别使用怒冲、原战吼和死亡意志动作', () => {
    const reik = ACTOR_ANIMATIONS.char_token_reik;
    for (const view of ['front', 'side', 'back']) {
        assert.equal(reik[view].skill.sheet, 'anim_reik_skill');
        assert.match(reik[view].skill2.sheet, /^anim_reik_(front|side|back)$/);
        assert.equal(reik[view].skill3.sheet, 'anim_reik_skill3');
        assert.equal(reik[view].skill.frames[2].event, 'cast');
        assert.equal(reik[view].skill2.frames.find(frame => frame.event === 'cast')?.index % 4, 2);
        assert.equal(reik[view].skill3.frames[2].event, 'cast');
    }
});

test('奥莉亚Q/E/R分别使用瞬移斩、形态切换和原奇点蓄能动作', () => {
    const olia = ACTOR_ANIMATIONS.char_token_olia;
    for (const view of ['front', 'side', 'back']) {
        assert.equal(olia[view].skill.sheet, 'anim_olia_skill');
        assert.equal(olia[view].skill2.sheet, 'anim_olia_skill2');
        assert.match(olia[view].skill3.sheet, /^anim_olia_/);
        for (const action of ['skill', 'skill2', 'skill3']) {
            assert.ok(olia[view][action].frames.some(frame => frame.event === 'cast'), `${view}.${action}`);
        }
    }
});

test('格雷夫与莉安娜Q/E/R均使用各自实际技能动作', () => {
    for (const [key, prefix] of [['char_token_graf', 'anim_graf'], ['char_token_liana', 'anim_liana']]) {
        const set = ACTOR_ANIMATIONS[key];
        for (const view of ['front', 'side', 'back']) {
            assert.match(set[view].skill.sheet, new RegExp(`^${prefix}_`));
            assert.equal(set[view].skill2.sheet, `${prefix}_skill2`);
            assert.equal(set[view].skill3.sheet, `${prefix}_skill3`);
            assert.equal(set[view].skill2.frames[2].event, 'cast');
            assert.equal(set[view].skill3.frames[2].event, 'cast');
        }
    }
});

test('已制作炮灰与精英的三方向制作稿均覆盖八类动作', () => {
    const required = ['idle', 'walk', 'run', 'jump', 'attack', 'hit', 'defeated', 'skill'];
    const archer = ACTOR_ANIMATIONS.enemy_archer;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !archer[view]?.[action]), [], `毒射手${view}缺少动作`);
    }
    const shield = ACTOR_ANIMATIONS.enemy_shield;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !shield[view]?.[action]), [], `护盾兵${view}缺少动作`);
    }
    assert.equal(shield.front.attack.frames[1].event, 'strike');
    assert.equal(shield.side.attack.frames[1].event, 'strike');
    const exploder = ACTOR_ANIMATIONS.enemy_exploder;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !exploder[view]?.[action]), [], `爆炸怪${view}缺少动作`);
        assert.equal(exploder[view].attack.frames[1].event, 'strike');
        assert.match(exploder[view].hit.sheet, /_hit$/);
    }
    const golem = ACTOR_ANIMATIONS.enemy_golem;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !golem[view]?.[action]), [], `石像鬼${view}缺少动作`);
        assert.equal(golem[view].attack.frames[2].event, 'strike');
        assert.equal(golem[view].attack.frames[1].event, undefined);
    }
    assert.match(golem.front.defeated.sheet, /_front_defeated$/);
    const elite = ACTOR_ANIMATIONS.enemy_elite;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !elite[view]?.[action]), [], `精英怪${view}缺少动作`);
        assert.equal(elite[view].attack.frames[2].event, 'strike');
    }
    assert.match(elite.back.skill.sheet, /_back_skill$/);
    const rustBiter = ACTOR_ANIMATIONS.enemy_rust_biter;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !rustBiter[view]?.[action]), [], `锈齿扑兵${view}缺少动作`);
        assert.equal(rustBiter[view].attack.frames[2].event, 'strike');
        assert.equal(rustBiter[view].attack.frames[1].event, undefined);
        assert.equal(rustBiter[view].skill.frames[2].event, 'cast');
    }
    assert.match(rustBiter.back.skill.sheet, /_back_skill$/);
    const needleGunner = ACTOR_ANIMATIONS.enemy_needle_gunner;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !needleGunner[view]?.[action]), [], `断针射手${view}缺少动作`);
        assert.equal(needleGunner[view].attack.frames[1].event, 'fire');
        assert.ok(needleGunner[view].attack.frames[1].muzzle, `断针射手${view}缺少开火挂点`);
        assert.equal(needleGunner[view].skill.frames[2].event, 'cast');
    }
    assert.match(needleGunner.front.skill.sheet, /_front_skill$/);
    const acidSac = ACTOR_ANIMATIONS.enemy_acid_sac;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !acidSac[view]?.[action]), [], `酸囊投手${view}缺少动作`);
        assert.equal(acidSac[view].attack.frames[2].event, 'fire');
        assert.ok(acidSac[view].attack.frames[2].muzzle, `酸囊投手${view}缺少投掷挂点`);
        assert.equal(acidSac[view].skill.frames[2].event, 'cast');
    }
    assert.match(acidSac.back.hit.sheet, /_back_hit$/);
    assert.match(acidSac.back.defeated.sheet, /_back_defeated$/);
    const rivetBeast = ACTOR_ANIMATIONS.enemy_rivet_beast;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !rivetBeast[view]?.[action]), [], `铆甲兽${view}缺少动作`);
        assert.equal(rivetBeast[view].attack.frames[2].event, 'strike');
        assert.equal(rivetBeast[view].skill.frames[2].event, 'cast');
        assert.match(rivetBeast[view].idle.sheet, /_motion$/);
        assert.match(rivetBeast[view].attack.sheet, /_combat$/);
    }
    const goldScavenger = ACTOR_ANIMATIONS.enemy_gold_scavenger;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !goldScavenger[view]?.[action]), [], `掠金虫${view}缺少动作`);
        assert.equal(goldScavenger[view].attack.frames.some(frame => frame.event === 'strike' || frame.event === 'fire'), false,
            `掠金虫${view}的拾取动作不能触发伤害事件`);
        assert.equal(goldScavenger[view].skill.frames[2].event, 'cast');
        assert.match(goldScavenger[view].attack.sheet, /_combat$/);
    }
    assert.match(goldScavenger.front.run.sheet, /_front_run$/);
    assert.match(goldScavenger.front.jump.sheet, /_front_jump$/);
    const blastTick = ACTOR_ANIMATIONS.enemy_blast_tick;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !blastTick[view]?.[action]), [], `熔爆蜱${view}缺少动作`);
        assert.equal(blastTick[view].attack.frames.some(frame => frame.event === 'strike' || frame.event === 'fire'), false,
            `熔爆蜱${view}的接近动作不能提前结算爆炸伤害`);
        assert.equal(blastTick[view].skill.frames[2].event, 'cast');
    }
    assert.match(blastTick.back.skill.sheet, /_back_skill$/);
    const emberAcolyte = ACTOR_ANIMATIONS.enemy_ember_acolyte;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !emberAcolyte[view]?.[action]), [], `烬火侍从${view}缺少动作`);
        assert.equal(emberAcolyte[view].attack.frames[2].event, 'cast');
        assert.ok(emberAcolyte[view].attack.frames.every(frame => frame.muzzle),
            `烬火侍从${view}施法缺少喷口挂点`);
        assert.equal(emberAcolyte[view].skill.frames[2].event, 'cast');
        assert.match(emberAcolyte[view].idle.sheet, /_motion$/);
        assert.match(emberAcolyte[view].attack.sheet, /_combat$/);
    }
    const frostAcolyte = ACTOR_ANIMATIONS.enemy_frost_acolyte;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !frostAcolyte[view]?.[action]), [], `冰棱侍从${view}缺少动作`);
        assert.equal(frostAcolyte[view].attack.frames[2].event, 'cast');
        assert.ok(frostAcolyte[view].attack.frames.every(frame => frame.muzzle),
            `冰棱侍从${view}施法缺少中央环挂点`);
        assert.equal(frostAcolyte[view].skill.frames[2].event, 'cast');
    }
    assert.match(frostAcolyte.front.skill.sheet, /_front_skill$/);
    assert.match(frostAcolyte.side.attack.sheet, /_side_attack_skill$/);
    assert.match(frostAcolyte.side.skill.sheet, /_side_attack_skill$/);
    const arcLeech = ACTOR_ANIMATIONS.enemy_arc_leech;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !arcLeech[view]?.[action]), [], `闪弧寄生体${view}缺少动作`);
        assert.equal(arcLeech[view].attack.frames[2].event, 'cast');
        assert.ok(arcLeech[view].attack.frames.every(frame => frame.muzzle),
            `闪弧寄生体${view}放电缺少电眼挂点`);
        assert.equal(arcLeech[view].skill.frames[2].event, 'cast');
        assert.match(arcLeech[view].idle.sheet, /_motion$/);
        assert.match(arcLeech[view].attack.sheet, /_combat$/);
    }
    const squid = ACTOR_ANIMATIONS.enemy_squid;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !squid[view]?.[action]), [], `深海鱿鱼${view}缺少基础动作`);
        assert.ok(squid[view].skill2, `深海鱿鱼${view}缺少分裂水刺动作`);
        assert.ok(squid[view].skill3, `深海鱿鱼${view}缺少缠绕动作`);
        assert.equal(squid[view].attack.frames[2].event, 'strike');
        assert.equal(squid[view].skill.frames.filter(frame => frame.event === 'cast').length, 1);
        assert.equal(squid[view].skill2.frames[2].event, 'cast');
        assert.equal(squid[view].skill3.frames[2].event, 'cast');
        assert.ok(squid[view].skill.frames.every(frame => frame.muzzle), `深海鱿鱼${view}水弹缺少释放挂点`);
        assert.ok(squid[view].skill2.frames.every(frame => frame.muzzle), `深海鱿鱼${view}水刺缺少释放挂点`);
        assert.match(squid[view].idle.sheet, /_motion$/);
        assert.match(squid[view].attack.sheet, /_combat$/);
        assert.match(squid[view].skill2.sheet, /_skills$/);
        assert.match(squid[view].skill3.sheet, /_skills$/);
    }
    assert.equal(squid.back.skill.frames[3].event, 'cast', '背面水弹只在顶缘亮起的末帧释放');
    const turtle = ACTOR_ANIMATIONS.enemy_turtle;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !turtle[view]?.[action]), [], `盾龟${view}缺少基础动作`);
        assert.ok(turtle[view].skill2, `盾龟${view}缺少高速碰撞动作`);
        assert.equal(turtle[view].attack.frames[2].event, 'strike');
        assert.equal(turtle[view].skill.frames[2].event, 'cast');
        assert.equal(turtle[view].skill2.frames[2].event, 'cast');
        assert.match(turtle[view].idle.sheet, /_motion$/);
        assert.match(turtle[view].attack.sheet, /_combat$/);
        assert.equal(turtle[view].skill2.sheet, 'anim_turtle_charge');
    }
    assert.deepEqual(turtle.front.skill2.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.deepEqual(turtle.side.skill2.frames.map(frame => frame.index), [4, 5, 6, 7]);
    assert.deepEqual(turtle.back.skill2.frames.map(frame => frame.index), [8, 9, 10, 11]);
    const shrimp = ACTOR_ANIMATIONS.enemy_shrimp;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !shrimp[view]?.[action]), [], `锯齿剑虾${view}缺少基础动作`);
        assert.ok(shrimp[view].skill2, `锯齿剑虾${view}缺少甩尾动作`);
        assert.equal(shrimp[view].attack.frames[2].event, 'strike');
        assert.equal(shrimp[view].skill.frames[2].event, 'cast');
        assert.ok(shrimp[view].skill.frames.every(frame => frame.muzzle), `锯齿剑虾${view}背刺缺少释放挂点`);
        assert.equal(shrimp[view].skill2.frames[2].event, 'cast');
        assert.match(shrimp[view].idle.sheet, /_motion$/);
        assert.match(shrimp[view].attack.sheet, /_combat$/);
        assert.equal(shrimp[view].skill2.sheet, 'anim_shrimp_tail_whip');
    }
    assert.equal(shrimp.front.jump.sheet, 'anim_shrimp_front_jump', '正面跳跃使用保持长躯体的独立修正版');
    assert.deepEqual(shrimp.front.skill2.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.deepEqual(shrimp.side.skill2.frames.map(frame => frame.index), [4, 5, 6, 7]);
    assert.deepEqual(shrimp.back.skill2.frames.map(frame => frame.index), [8, 9, 10, 11]);
    const jelly = ACTOR_ANIMATIONS.enemy_jelly;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !jelly[view]?.[action]), [], `毒刺鬼水母${view}缺少基础动作`);
        assert.ok(jelly[view].skill2, `毒刺鬼水母${view}缺少毒针动作`);
        assert.equal(jelly[view].attack.frames[2].event, 'strike');
        assert.equal(jelly[view].skill.frames[2].event, 'cast');
        assert.equal(jelly[view].skill2.frames[2].event, 'cast');
        assert.ok(jelly[view].skill2.frames.every(frame => frame.muzzle), `毒刺鬼水母${view}毒针缺少释放挂点`);
        assert.match(jelly[view].idle.sheet, /_motion$/);
        assert.match(jelly[view].attack.sheet, /_combat$/);
        assert.equal(jelly[view].skill2.sheet, 'anim_jelly_venom_sting');
    }
    assert.deepEqual(jelly.front.skill2.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.deepEqual(jelly.side.skill2.frames.map(frame => frame.index), [4, 5, 6, 7]);
    assert.deepEqual(jelly.back.skill2.frames.map(frame => frame.index), [8, 9, 10, 11]);
    const attackDrone = ACTOR_ANIMATIONS.enemy_drone_attack;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !attackDrone[view]?.[action]), [], `攻击无人机${view}缺少基础动作`);
        assert.ok(attackDrone[view].skill2, `攻击无人机${view}缺少锁定光束动作`);
        assert.equal(attackDrone[view].skill.frames[2].event, 'cast');
        assert.equal(attackDrone[view].skill2.frames[2].event, 'cast');
        assert.ok(attackDrone[view].skill.frames.every(frame => frame.muzzle), `攻击无人机${view}声波缺少炮口挂点`);
        assert.ok(attackDrone[view].skill2.frames.every(frame => frame.muzzle), `攻击无人机${view}光束缺少炮口挂点`);
        assert.match(attackDrone[view].idle.sheet, /_motion$/);
        assert.match(attackDrone[view].skill.sheet, /_combat$/);
        assert.equal(attackDrone[view].skill.frames[2].index, 2);
        assert.equal(attackDrone[view].skill2.frames[2].index, 14);
    }
    const supportDrone = ACTOR_ANIMATIONS.enemy_drone_support;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !supportDrone[view]?.[action]), [], `支援无人机${view}缺少基础动作`);
        assert.ok(supportDrone[view].skill2, `支援无人机${view}缺少护盾动作`);
        assert.ok(supportDrone[view].skill3, `支援无人机${view}缺少召唤动作`);
        assert.equal(supportDrone[view].skill.frames[2].event, 'cast');
        assert.equal(supportDrone[view].skill2.frames[2].event, 'cast');
        assert.equal(supportDrone[view].skill3.frames[2].event, 'cast');
        assert.match(supportDrone[view].idle.sheet, /_motion$/);
        assert.match(supportDrone[view].skill.sheet, /_combat$/);
        assert.equal(supportDrone[view].skill.frames[2].index, 2);
        assert.equal(supportDrone[view].skill2.frames[2].index, 14);
        assert.equal(supportDrone[view].skill3.sheet, 'anim_drone_support_summon');
    }
    assert.deepEqual(supportDrone.front.skill3.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.deepEqual(supportDrone.side.skill3.frames.map(frame => frame.index), [4, 5, 6, 7]);
    assert.deepEqual(supportDrone.back.skill3.frames.map(frame => frame.index), [8, 9, 10, 11]);
    const chainHound = ACTOR_ANIMATIONS.enemy_chain_hound;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !chainHound[view]?.[action]), [], `铆链猎犬${view}缺少基础动作`);
        assert.ok(chainHound[view].skill2, `铆链猎犬${view}缺少回收夹动作`);
        assert.equal(chainHound[view].attack.frames[2].event, 'strike');
        assert.equal(chainHound[view].skill.frames[2].event, 'cast');
        assert.equal(chainHound[view].skill2.frames[2].event, 'cast');
        assert.equal(chainHound[view].skill.sheet, 'anim_chain_hound_charge');
        assert.match(chainHound[view].attack.sheet, /_combat$/);
        assert.equal(chainHound[view].skill2.frames[2].index, 14);
    }
    assert.equal(chainHound.front.jump.sheet, 'anim_chain_hound_front_jump', '正面跳跃使用长尾完整的独立修正版');
    assert.deepEqual(chainHound.front.skill.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.deepEqual(chainHound.side.skill.frames.map(frame => frame.index), [4, 5, 6, 7]);
    assert.deepEqual(chainHound.back.skill.frames.map(frame => frame.index), [8, 9, 10, 11]);
    const prismSnail = ACTOR_ANIMATIONS.enemy_prism_snail;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !prismSnail[view]?.[action]), [], `棱壳巡灯兽${view}缺少基础动作`);
        assert.ok(prismSnail[view].skill2, `棱壳巡灯兽${view}缺少闭壳动作`);
        assert.equal(prismSnail[view].attack.frames[2].event, 'strike');
        assert.equal(prismSnail[view].skill.frames[2].event, 'cast');
        assert.equal(prismSnail[view].skill2.frames[2].event, 'cast');
        assert.match(prismSnail[view].idle.sheet, /_motion$/);
        assert.match(prismSnail[view].skill.sheet, /_combat$/);
        assert.equal(prismSnail[view].skill.frames[2].index, 14);
        assert.equal(prismSnail[view].skill2.sheet, 'anim_prism_snail_shell');
    }
    assert.deepEqual(prismSnail.front.skill2.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.deepEqual(prismSnail.side.skill2.frames.map(frame => frame.index), [4, 5, 6, 7]);
    assert.deepEqual(prismSnail.back.skill2.frames.map(frame => frame.index), [8, 9, 10, 11]);
    const triunePriest = ACTOR_ANIMATIONS.enemy_triune_priest;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !triunePriest[view]?.[action]), [], `三相祭司${view}缺少基础动作`);
        assert.ok(triunePriest[view].skill2, `三相祭司${view}缺少冻相动作`);
        assert.ok(triunePriest[view].skill3, `三相祭司${view}缺少雷相动作`);
        assert.equal(triunePriest[view].attack.frames[2].event, 'strike');
        assert.equal(triunePriest[view].skill.frames[2].event, 'cast');
        assert.equal(triunePriest[view].skill2.frames[2].event, 'cast');
        assert.equal(triunePriest[view].skill3.frames[2].event, 'cast');
        assert.match(triunePriest[view].idle.sheet, /_motion$/);
        assert.match(triunePriest[view].skill.sheet, /_combat$/);
        assert.equal(triunePriest[view].skill2.sheet, 'anim_triune_priest_ice');
        assert.equal(triunePriest[view].skill3.sheet, 'anim_triune_priest_arc');
    }
    assert.deepEqual(triunePriest.front.skill2.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.deepEqual(triunePriest.side.skill2.frames.map(frame => frame.index), [4, 5, 6, 7]);
    assert.deepEqual(triunePriest.back.skill2.frames.map(frame => frame.index), [8, 9, 10, 11]);
    assert.deepEqual(triunePriest.front.skill3.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.deepEqual(triunePriest.side.skill3.frames.map(frame => frame.index), [4, 5, 6, 7]);
    assert.deepEqual(triunePriest.back.skill3.frames.map(frame => frame.index), [8, 9, 10, 11]);
    const railButcher = ACTOR_ANIMATIONS.enemy_rail_butcher;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !railButcher[view]?.[action]), [], `磁轨屠夫${view}缺少基础动作`);
        assert.ok(railButcher[view].skill2, `磁轨屠夫${view}缺少回转锯动作`);
        assert.ok(railButcher[view].skill3, `磁轨屠夫${view}缺少磁力拖拽动作`);
        assert.equal(railButcher[view].attack.frames[2].event, 'strike');
        assert.equal(railButcher[view].skill.frames[2].event, 'cast');
        assert.equal(railButcher[view].skill2.frames[2].event, 'cast');
        assert.equal(railButcher[view].skill3.frames[2].event, 'cast');
        assert.match(railButcher[view].idle.sheet, /_motion$/);
        assert.match(railButcher[view].skill.sheet, /_combat$/);
        assert.equal(railButcher[view].skill2.sheet, 'anim_rail_butcher_saw');
        assert.equal(railButcher[view].skill3.sheet, 'anim_rail_butcher_drag');
    }
    assert.deepEqual(railButcher.front.skill2.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.deepEqual(railButcher.side.skill2.frames.map(frame => frame.index), [4, 5, 6, 7]);
    assert.deepEqual(railButcher.back.skill2.frames.map(frame => frame.index), [8, 9, 10, 11]);
    assert.deepEqual(railButcher.front.skill3.frames.map(frame => frame.index), [0, 1, 2, 3]);
    assert.deepEqual(railButcher.side.skill3.frames.map(frame => frame.index), [4, 5, 6, 7]);
    assert.deepEqual(railButcher.back.skill3.frames.map(frame => frame.index), [8, 9, 10, 11]);
    const bellDevourer = ACTOR_ANIMATIONS.enemy_bell_devourer;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !bellDevourer[view]?.[action]), [], `葬钟吞噬者${view}缺少基础动作`);
        assert.ok(bellDevourer[view].skill2, `葬钟吞噬者${view}缺少回声动作`);
        assert.ok(bellDevourer[view].skill3, `葬钟吞噬者${view}缺少静默钟罩动作`);
        assert.ok(bellDevourer[view].skill4, `葬钟吞噬者${view}缺少吞音反震动作`);
        assert.equal(bellDevourer[view].attack.frames[2].event, 'strike');
        assert.equal(bellDevourer[view].skill.frames[2].event, 'cast');
        assert.equal(bellDevourer[view].skill2.frames[2].event, 'cast');
        assert.equal(bellDevourer[view].skill3.frames[2].event, 'cast');
        assert.equal(bellDevourer[view].skill4.frames[2].event, 'cast');
        assert.equal(bellDevourer[view].skill.loop, true, '六连钟响动作必须循环覆盖完整阶段');
        assert.match(bellDevourer[view].idle.sheet, /_motion$/);
        assert.match(bellDevourer[view].skill.sheet, /_combat$/);
        assert.equal(bellDevourer[view].skill2.sheet, 'anim_bell_devourer_echo');
        assert.equal(bellDevourer[view].skill3.sheet, 'anim_bell_devourer_silence');
        assert.equal(bellDevourer[view].skill4.sheet, 'anim_bell_devourer_counter');
    }
    for (const [view, indices] of Object.entries({
        front: [0, 1, 2, 3], side: [4, 5, 6, 7], back: [8, 9, 10, 11],
    })) {
        assert.deepEqual(bellDevourer[view].skill2.frames.map(frame => frame.index), indices);
        assert.deepEqual(bellDevourer[view].skill3.frames.map(frame => frame.index), indices);
        assert.deepEqual(bellDevourer[view].skill4.frames.map(frame => frame.index), indices);
    }
    const wasteLord = ACTOR_ANIMATIONS.enemy_boss_ch1;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !wasteLord[view]?.[action]), [], `废土领主${view}缺少基础动作`);
        assert.ok(wasteLord[view].skill2, `废土领主${view}缺少冲锋动作`);
        assert.ok(wasteLord[view].skill3, `废土领主${view}缺少召唤动作`);
        assert.ok(wasteLord[view].skill4, `废土领主${view}缺少阶段暴怒动作`);
        assert.equal(wasteLord[view].attack.frames[2].event, 'strike');
        assert.equal(wasteLord[view].skill.frames[2].event, 'cast');
        assert.equal(wasteLord[view].skill2.frames[2].event, 'cast');
        assert.equal(wasteLord[view].skill3.frames[2].event, 'cast');
        assert.equal(wasteLord[view].skill4.frames[2].event, 'cast');
        assert.match(wasteLord[view].idle.sheet, /_motion$/);
        assert.match(wasteLord[view].skill.sheet, /_combat$/);
        assert.equal(wasteLord[view].skill2.sheet, 'anim_boss_ch1_charge');
        assert.equal(wasteLord[view].skill3.sheet, 'anim_boss_ch1_summon');
        assert.equal(wasteLord[view].skill4.sheet, 'anim_boss_ch1_phase');
    }
    for (const [view, indices] of Object.entries({
        front: [0, 1, 2, 3], side: [4, 5, 6, 7], back: [8, 9, 10, 11],
    })) {
        assert.deepEqual(wasteLord[view].skill2.frames.map(frame => frame.index), indices);
        assert.deepEqual(wasteLord[view].skill3.frames.map(frame => frame.index), indices);
        assert.deepEqual(wasteLord[view].skill4.frames.map(frame => frame.index), indices);
    }
    const forgeKing = ACTOR_ANIMATIONS.enemy_boss_ch2;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !forgeKing[view]?.[action]), [], `钢铁之王${view}缺少基础动作`);
        assert.ok(forgeKing[view].skill2, `钢铁之王${view}缺少冲锋动作`);
        assert.ok(forgeKing[view].skill3, `钢铁之王${view}缺少召唤动作`);
        assert.ok(forgeKing[view].skill4, `钢铁之王${view}缺少阶段过载动作`);
        assert.equal(forgeKing[view].attack.frames[2].event, 'strike');
        assert.equal(forgeKing[view].skill.frames[2].event, 'cast');
        assert.equal(forgeKing[view].skill2.frames[2].event, 'cast');
        assert.equal(forgeKing[view].skill3.frames[2].event, 'cast');
        assert.equal(forgeKing[view].skill4.frames[2].event, 'cast');
        assert.match(forgeKing[view].idle.sheet, /_motion$/);
        assert.match(forgeKing[view].skill.sheet, /_combat$/);
        assert.equal(forgeKing[view].skill2.sheet, 'anim_boss_ch2_charge');
        assert.equal(forgeKing[view].skill3.sheet, 'anim_boss_ch2_summon');
        assert.equal(forgeKing[view].skill4.sheet, 'anim_boss_ch2_phase');
    }
    for (const [view, indices] of Object.entries({
        front: [0, 1, 2, 3], side: [4, 5, 6, 7], back: [8, 9, 10, 11],
    })) {
        assert.deepEqual(forgeKing[view].skill2.frames.map(frame => frame.index), indices);
        assert.deepEqual(forgeKing[view].skill3.frames.map(frame => frame.index), indices);
        assert.deepEqual(forgeKing[view].skill4.frames.map(frame => frame.index), indices);
    }
    const infiniteCore = ACTOR_ANIMATIONS.enemy_boss_ch3;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !infiniteCore[view]?.[action]), [], `无限核${view}缺少基础动作`);
        assert.ok(infiniteCore[view].skill2, `无限核${view}缺少冲锋动作`);
        assert.ok(infiniteCore[view].skill3, `无限核${view}缺少召唤动作`);
        assert.ok(infiniteCore[view].skill4, `无限核${view}缺少阶段过载动作`);
        assert.equal(infiniteCore[view].attack.frames[2].event, 'strike');
        assert.equal(infiniteCore[view].skill.frames[2].event, 'cast');
        assert.equal(infiniteCore[view].skill2.frames[2].event, 'cast');
        assert.equal(infiniteCore[view].skill3.frames[2].event, 'cast');
        assert.equal(infiniteCore[view].skill4.frames[2].event, 'cast');
        assert.match(infiniteCore[view].idle.sheet, /_motion$/);
        assert.match(infiniteCore[view].skill.sheet, /_combat$/);
        assert.equal(infiniteCore[view].skill2.sheet, 'anim_boss_ch3_charge');
        assert.equal(infiniteCore[view].skill3.sheet, 'anim_boss_ch3_summon');
        assert.equal(infiniteCore[view].skill4.sheet, 'anim_boss_ch3_phase');
    }
    for (const [view, indices] of Object.entries({
        front: [0, 1, 2, 3], side: [4, 5, 6, 7], back: [8, 9, 10, 11],
    })) {
        assert.deepEqual(infiniteCore[view].skill2.frames.map(frame => frame.index), indices);
        assert.deepEqual(infiniteCore[view].skill3.frames.map(frame => frame.index), indices);
        assert.deepEqual(infiniteCore[view].skill4.frames.map(frame => frame.index), indices);
    }
    const finalGate = ACTOR_ANIMATIONS.enemy_boss_ch4;
    for (const view of ['front', 'side', 'back']) {
        assert.deepEqual(required.filter(action => !finalGate[view]?.[action]), [], `终焉之门${view}缺少基础动作`);
        assert.ok(finalGate[view].skill2, `终焉之门${view}缺少冲锋动作`);
        assert.ok(finalGate[view].skill3, `终焉之门${view}缺少召唤动作`);
        assert.ok(finalGate[view].skill4, `终焉之门${view}缺少阶段过载动作`);
        assert.equal(finalGate[view].attack.frames[2].event, 'strike');
        assert.equal(finalGate[view].skill.frames[2].event, 'cast');
        assert.equal(finalGate[view].skill2.frames[2].event, 'cast');
        assert.equal(finalGate[view].skill3.frames[2].event, 'cast');
        assert.equal(finalGate[view].skill4.frames[2].event, 'cast');
        assert.match(finalGate[view].idle.sheet, /_motion$/);
        assert.match(finalGate[view].skill.sheet, /_combat$/);
        assert.equal(finalGate[view].skill2.sheet, 'anim_boss_ch4_charge');
        assert.equal(finalGate[view].skill3.sheet, 'anim_boss_ch4_summon');
        assert.equal(finalGate[view].skill4.sheet, 'anim_boss_ch4_phase');
    }
    for (const [view, indices] of Object.entries({
        front: [0, 1, 2, 3], side: [4, 5, 6, 7], back: [8, 9, 10, 11],
    })) {
        assert.deepEqual(finalGate[view].skill2.frames.map(frame => frame.index), indices);
        assert.deepEqual(finalGate[view].skill3.frames.map(frame => frame.index), indices);
        assert.deepEqual(finalGate[view].skill4.frames.map(frame => frame.index), indices);
    }
});
