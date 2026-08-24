'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const testroomSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/TestRoomUI.ts'), 'utf8');
const gameSource     = fs.readFileSync(path.join(root, 'assets/scripts/core/GameManager.ts'), 'utf8');
const screenSource   = fs.readFileSync(path.join(root, 'assets/scripts/ui/ScreenManager.ts'), 'utf8');
const playerSource   = fs.readFileSync(path.join(root, 'assets/scripts/entities/PlayerController.ts'), 'utf8');
const { PlayerController } = require('../dist/entities/PlayerController');

// ── TestRoomUI 底部工具条源码门禁（UI 不编译进测试,沿用 visualui 的正则模式） ──

test('工具条为底部常驻条(非弹窗),固定在画布底部', () => {
    assert.match(testroomSource, /this\.node\.setPosition\(new Vec3\(0, -312, 0\)\)/);
    assert.match(testroomSource, /fillRect\(-640, -48, 1280, 96\)/);
    assert.doesNotMatch(testroomSource, /showResult\(won: boolean\)/, '不再有结算弹窗');
    assert.doesNotMatch(testroomSource, /Boss 已击败/, '不再有胜负结算');
});

test('行1:数量−/+、玩家无敌开关、清场、返回主页', () => {
    assert.match(testroomSource, /'数量'/);
    assert.match(testroomSource, /clamp\(this\._count - 1, 1, 50\)/);
    assert.match(testroomSource, /clamp\(this\._count \+ 1, 1, 50\)/);
    assert.match(testroomSource, /'无敌:开'/);
    assert.match(testroomSource, /'无敌:关'/);
    assert.match(testroomSource, /onToggleInvincible\?\.\(this\._invincible\)/);
    assert.match(testroomSource, /'清场'/);
    assert.match(testroomSource, /'返回主页'/);
    assert.match(testroomSource, /this\.onClear\?\.\(\)/);
});

test('行2:首领/小boss/小兵三页签,单位卡由UNIT_CATALOG驱动', () => {
    assert.match(testroomSource, /key: 'boss', label: '首领'/);
    assert.match(testroomSource, /key: 'miniboss', label: '小boss'/);
    assert.match(testroomSource, /key: 'grunt', label: '小兵'/);
    assert.match(testroomSource, /UNIT_CATALOG\.filter\(u => u\.category === this\._category\)/);
    assert.match(testroomSource, /this\.onSpawnUnit\?\.\(entry\.id, this\._count\)/);
});

test('工具条含英雄选择入口,浮层3×2角色卡并可查询当前英雄高亮', () => {
    assert.match(testroomSource, /_mkSmallBtn\(this\.node, '英雄', -160, 20, 90, 30/);
    assert.match(testroomSource, /'— 选择出战英雄 —'/);
    assert.match(testroomSource, /for \(let i = 0; i < CHARS\.length; i\+\+\) \{/);
    assert.match(testroomSource, /applyArtSprite\(sp, `char_token_\$\{def\.id\}`\)/);
    assert.match(testroomSource, /this\.onSelectHero\?\.\(def\.id\)/);
    assert.match(testroomSource, /this\._heroId = this\.onGetHero\?\.\(\) \?\? this\._heroId;/);
    assert.match(testroomSource, /resetState\(\) \{/);
});

// ── GameManager 源码门禁 ──

test('GameState只含testRoom(无结算状态),战斗判定共用_inCombat', () => {
    assert.match(gameSource, /\| 'testRoom';/);
    assert.doesNotMatch(gameSource, /testRoomResult/, '不再有结算状态');
    assert.match(gameSource, /private _inCombat\(\): boolean \{[\s\S]*?this\.state === 'playing' \|\| this\.state === 'testRoom'/);
});

test('主页按钮直接进图,spawnTestUnit按目录生成/清场/无敌开关', () => {
    assert.match(gameSource, /this\._screenMgr\.onTestRoomPressed\s*=\s*\(\) => this\._startTestRoom\(\)/);
    assert.match(gameSource, /spawnTestUnit\(id: string, count: number\): void/);
    assert.match(gameSource, /UNIT_CATALOG\.find\(u => u\.id === id\)/);
    assert.match(gameSource, /clearTestField\(\): void/);
    assert.match(gameSource, /setPlayerInvincible\(on: boolean\): void/);
    assert.match(gameSource, /if \(this\._player\) this\._player\.godMode = on/);
});

test('spawnEnemy支持bossKey(number章节|string文档Boss),敌弹shim透传破盾与DoT', () => {
    assert.match(gameSource, /spawnEnemy\(type: string, x\?: number, y\?: number, bossKey\?: string \| number\)/);
    assert.match(gameSource, /if \(typeof bossKey === 'string'\) boss\.initBossKind\(bossKey, this\)/);
    assert.match(gameSource, /pierceShield: b\.pierceShield \?\? false,/);
    assert.match(gameSource, /dot: b\.dot,/);
    assert.match(gameSource, /bounceLeft: b\.bounceLeft \?\? 0,/);
    assert.match(gameSource, /bounceExplode: b\.bounceExplode \?\? false,/);
});

test('测试房敌弹命中玩家穿透受击无敌帧', () => {
    const bulletSource = fs.readFileSync(path.join(root, 'assets/scripts/entities/BulletController.ts'), 'utf8');
    assert.match(bulletSource, /player\.takeDamage\(b\.damage, game, \{ ignoreIframe: game\?\.state === 'testRoom' \}\)/);
});

test('测试房间跳过波次调度,玩家阵亡3秒后重生且不写档案', () => {
    assert.match(gameSource, /if \(this\.state !== 'testRoom'\) \{[\s\S]*?this\._waveMgr\.update\(dt, this\)/);
    assert.match(gameSource, /if \(this\.state === 'testRoom'\) \{[\s\S]*?this\._scheduleTestRespawn\(\)/);
    assert.match(gameSource, /'3 秒后重生…'/);
    assert.match(gameSource, /this\._recordRun\(false\);\s*this\._setState\('gameover'\)/);
    assert.match(gameSource, /setTimeout\(\(\) => \{[\s\S]*?if \(this\.state !== 'testRoom' \|\| this\._runId !== runId\) return;/);
});

test('深海恐惧场景系统:水柱/冰冻预告区/水分身/召唤鱿鱼/受击加盾钩子', () => {
    assert.match(gameSource, /startPillarStorm\(boss: BossController\): void/);
    assert.match(gameSource, /startTelegraphZones\(boss: BossController\): void/);
    assert.match(gameSource, /const MIN_GAP = 200; \/\/ 区域半径90×2\+余量，保证互不重叠/, '冰冻区域间距约束');
    assert.match(gameSource, /zones\.every\(z => Vec\.dist\(z\.x, z\.y, x, y\) >= MIN_GAP\)/, '拒绝采样保证互不重叠');
    assert.match(gameSource, /spawnWaterClone\(boss: BossController, player: any\): void/);
    assert.match(gameSource, /abyssSummonSquid\(boss: BossController\): void/);
    assert.match(gameSource, /onPlayerHit\(p: PlayerController, _game: GameManager\): void/);
    assert.match(gameSource, /abyssShieldMode/);
    assert.match(gameSource, /spawnWaterPillar\(\): void/);
});

test('海之霸主水柱常驻不消失(上限12)、对立配对交叉射击、水分身限1同尺寸淡色', () => {
    assert.match(gameSource, /const MAX_TEST_WATER_UNITS = 12;/);
    assert.match(gameSource, /const MAX_TEST_PILLARS = 8;/, '水柱上限8根');
    assert.match(gameSource, /const PILLAR_SPOTS: \[number, number\]\[\] = \[[\s\S]*?\[150, PLAYFIELD_BOTTOM - 100\], \[CANVAS_W - 150, PLAYFIELD_BOTTOM - 100\],\s*\];/, '固定8个方位点');
    assert.match(gameSource, /OPPOSITE_PAIRS: \[number, number\]\[\] = \[\[0, 1\], \[2, 3\], \[4, 7\], \[5, 6\]\]/, '对立配对:上↔下/左↔右/两对角线');
    assert.match(gameSource, /Rng\.pick\(available\)/, '配对随机');
    assert.match(gameSource, /z\.state = 'idle';/, '对射完水柱回到idle不消失');
    assert.match(gameSource, /z\.state = 'shoot';[\s\S]*?z\.shootLeft = 6;/, '闪烁后进入逐发射击状态(6发)');
    assert.match(gameSource, /z\.shootCd = 0\.35;[\s\S]*?z\.shootLeft--;/, '水刺依次发射(0.35s间隔)');
    assert.match(gameSource, /const a = p \? Math\.atan2\(p\.y - z\.y, p\.x - z\.x\) : 0;/, '每发水刺朝主角当前位置瞄准');
    assert.match(gameSource, /p\.applyBuff\('pillar_slow', 2, \{ speed: 0\.5 \}\);/, '碰柱减速50%持续2秒');
    assert.match(gameSource, /explodeOnExpire: true, \/\/ 水刺最后会爆炸/, '水刺终点爆炸');
    assert.match(gameSource, /z\.state = 'idle';[\s\S]*?this\._abyssStormShots\+\+;/, '6发射完回idle并推进护盾模式计数');
    assert.match(gameSource, /kind: 'waterClone', _phase: 'windup', _t: 2,/, '水分身引导改为2秒');
    assert.match(gameSource, /this\._turrets\.some\(t => t\.kind === 'waterClone' && t\.alive\)\) return;/, '水分身最多1个');
    assert.match(gameSource, /r: boss\.radius,/, '水分身与本体同尺寸');
    assert.match(gameSource, /spots\.push\(\{ x: this\._pillars\[i\]\.x, y: this\._pillars\[i\]\.y \}\)/, '鱿鱼在被消耗水柱的位置生成');
    assert.match(gameSource, /for \(const s of spots\) \{[\s\S]*?this\.spawnEnemy\('squid', s\.x, s\.y\)/, '每道水柱位置生成一只鱿鱼');
    assert.match(gameSource, /if \(spots\.length === 0\) \{[\s\S]*?if \(this\._testWaterCount\(\) >= MAX_TEST_WATER_UNITS\) return;/, '无水柱时已达上限则放弃召唤');
});

test('所有水柱只在固定方位生成:分身失败/召唤补柱均找空位,不随机', () => {
    assert.match(gameSource, /if \(this\._pillars\.length >= MAX_TEST_PILLARS\) return;/, '水柱数量上限8');
    assert.match(gameSource, /for \(let s = 0; s < PILLAR_SPOTS\.length; s\+\+\) \{[\s\S]*?if \(this\._pillars\.some\(z => z\.spot === s\)\) continue;[\s\S]*?return;/, '分身失败补柱找固定空位');
    assert.match(gameSource, /const emptySpot = PILLAR_SPOTS\.findIndex\(\(_, s\) => !this\._pillars\.some\(z => z\.spot === s\)\);/, '召唤鱿鱼无水柱时也找固定空位');
    assert.doesNotMatch(gameSource, /_randomEdgePoint/, '不再生成随机边缘水柱');
});

test('水柱/水分身/深海鱿鱼共享12上限,所有生成入口统一计数', () => {
    assert.match(gameSource, /private _testWaterCount\(\): number \{[\s\S]*?this\._pillars\.length[\s\S]*?t\.kind === 'waterClone' && t\.alive[\s\S]*?e\.type === 'squid' && !e\.dead/, '计数=水柱+分身+鱿鱼');
    assert.match(gameSource, /let waterCount = this\._testWaterCount\(\);[\s\S]*?waterCount < MAX_TEST_WATER_UNITS/, '海之霸主补柱受共享上限');
    assert.match(gameSource, /if \(this\._pillars\.some\(z => z\.spot === s\)\) continue;/, '固定位置不重复生成,第二次只补齐空缺');
    assert.match(gameSource, /this\._testWaterCount\(\) >= MAX_TEST_WATER_UNITS\) return;/, '补水柱/水分身受共享上限');
    assert.match(gameSource, /if \(this\._turrets\.some\(t => t\.kind === 'waterClone' && t\.alive\)\) return;[\s\S]*?if \(this\._testWaterCount\(\) >= MAX_TEST_WATER_UNITS\) return;/, '水分身同时受单上限与共享上限');
    assert.match(gameSource, /else if \(id === 'squid'\) \{[\s\S]*?if \(this\._testWaterCount\(\) >= MAX_TEST_WATER_UNITS\) break;/, '工具条直出鱿鱼也受共享上限');
});

test('切换英雄重建玩家并保留无敌状态,清空召唤物', () => {
    assert.match(gameSource, /selectTestHero\(charId: string\): void/);
    assert.match(gameSource, /p\.godMode = this\._testInvincible;/, '重建玩家保留无敌开关');
    assert.match(gameSource, /this\._turrets = \[\];/, '切换英雄清空绑定旧英雄的召唤物');
    assert.match(gameSource, /this\._testUI\.onSelectHero\s*=\s*\(id\) => this\.selectTestHero\(id\);/);
    assert.match(gameSource, /this\._testUI\.onGetHero\s*=\s*\(\) => this\._char\?\.id \?\? CHARS\[0\]!\.id;/);
    assert.match(gameSource, /this\._testUI\.resetState\(\);/);
    assert.match(gameSource, /this\._testInvincible = false;/, '进房复位无敌状态');
});

test('机械高达横劈扇形与判定区域一致,飞空期间完全消失', () => {
    assert.match(gameSource, /const half = 1\.05; \/\/ 与 BossController 横劈判定角度一致/, '扇形角度范围与伤害判定一致');
    assert.match(gameSource, /for \(let k = 0; k <= SEG; k\+\+\) \{[\s\S]*?g\.lineTo\(ex \+ Math\.cos\(ang\) \* reach/, '扇形采样描点绘制(不依赖arc方向语义)');
    assert.match(gameSource, /e\.invisible \? 60 : 0\)/, '机械高达飞空时贴图完全消失,水母隐身仍半透明');
});

test('隐形/飞空实体感修复:阴影与血条隐藏,受击显示免疫', () => {
    assert.match(gameSource, /const hidden = e\.invisible \|\| \(e instanceof BossController && e\.mechSkyT > 0\);/, '隐藏态判定');
    assert.match(gameSource, /if \(!hidden\) \{[\s\S]*?g\.ellipse\(/, '隐藏时不画接触阴影');
    assert.match(gameSource, /if \(!e\.isBoss && e\.hp < e\.maxHp && !hidden\)/, '隐藏时不画头顶血条');
    const bulletSource2 = fs.readFileSync(path.join(root, 'assets/scripts/entities/BulletController.ts'), 'utf8');
    assert.match(bulletSource2, /'免疫'/, '子弹命中无敌目标显示免疫');
    assert.match(playerSource, /'免疫'/, '近战命中无敌目标显示免疫');
});

test('暂停/详情面板返回状态跟随测试房间', () => {
    assert.match(gameSource, /private _pauseCombat\(\) \{[\s\S]*?this\._pauseReturn = this\.state === 'testRoom' \? 'testRoom' : 'playing'/);
    assert.match(gameSource, /this\._screenMgr\.onResumePressed\s*=\s*\(\) => this\._setState\(this\._pauseReturn\)/);
});

test('工具条随testRoom状态常驻:暂停/详情返回后重新点亮', () => {
    assert.match(gameSource, /case 'testRoom':[\s\S]*?this\._testUI\.node\.active = true;/);
    assert.doesNotMatch(gameSource, /this\._testUI\.node\.active = true;\s*this\._floatText\.spawn/, '进房不再单独点亮(统一由_setState负责)');
});

// ── ScreenManager / PlayerController 源码门禁 ──

test('主页有测试房间入口且占位钮保持禁用', () => {
    assert.match(screenSource, /onTestRoomPressed\?:/);
    assert.match(screenSource, /_mkBtn\(menuDeck, '测试房间', 0, 24, 330, 46, new Color\(190, 120, 255, 255\)\)/);
    assert.match(screenSource, /_mkBtn\(menuDeck, '升级  ·  即将开放', 0, -36, 330, 46, new Color\(80, 118, 135, 255\), true\)/);
});

test('玩家具备godMode无敌与DoT持续伤害字段', () => {
    assert.match(playerSource, /if \(!this\.alive \|\| this\.godMode\) return;/);
    assert.match(playerSource, /if \(this\._invincible > 0\) return;/);
    assert.match(playerSource, /if \(!opts\?\.ignoreIframe && this\._iframeTimer > 0\) return;/, '受击无敌帧可被ignoreIframe穿透');
    assert.match(playerSource, /dots: DotEffect\[\] = \[\];/);
    assert.match(playerSource, /applyDot\(dps: number, dur: number, color = '#cc66ff'\): void/);
    assert.match(playerSource, /game\.onPlayerHit\?\.\(this, game\);/);
});

test('测试房敌弹穿透受击无敌帧,高频弹幕不被吞;buff无敌始终生效', () => {
    const p = new PlayerController();
    p.stats = { maxHp: 100, armor: 0, _coreOverflow: false };
    p.hp = 100;
    p.takeDamage(10, {}); // 触发 0.5s 受击无敌帧
    assert.ok(p.hp < 100);
    const hpAfterFirst = p.hp;
    p.takeDamage(10, {}, { ignoreIframe: true });
    assert.ok(p.hp < hpAfterFirst, 'ignoreIframe 应穿透受击无敌帧(水刺/剑气等后续命中)');
    const hpBlocked = p.hp;
    p.takeDamage(10, {}); // 常规受击仍被受击无敌帧挡住
    assert.equal(p.hp, hpBlocked, '常规受击仍被受击无敌帧挡住');
    // buff 无敌（重生/切换英雄/技能）始终生效，ignoreIframe 不能穿透
    p.applyBuff('inv_test', 5, { invincible: true });
    const input = {
        getAxis: () => [0, 0], isDashPressed: () => false,
        isKeyQPressed: () => false, isKeyEPressed: () => false,
        isKeyRPressed: () => false, mouse: { x: 0, y: 0 },
    };
    p.tick(0.1, input, {});
    p.takeDamage(10, {}, { ignoreIframe: true });
    assert.equal(p.hp, hpBlocked, 'buff 无敌(重生/切换英雄)始终生效');
});

// ── 行为单测 ──

test('godMode默认关闭且开启后takeDamage完全免疫', () => {
    const p = new PlayerController();
    assert.equal(p.godMode, false, 'godMode默认关闭,不影响正式对局');

    p.stats = { maxHp: 100, armor: 0, _coreOverflow: false };
    p.hp = 100;
    p.godMode = true;
    p.takeDamage(50, {});
    assert.equal(p.hp, 100, 'godMode下应完全免疫伤害');

    p.godMode = false;
    p.takeDamage(50, {});
    assert.ok(p.hp < 100, '关闭godMode后恢复正常扣血');
});

test('玩家applyDot吃护甲减免掉血、可叠加、到期移除、致死触发onPlayerDeath', () => {
    const p = new PlayerController();
    p.stats = { maxHp: 100, armor: 0, _coreOverflow: false };
    p.hp = 100;
    p.applyDot(10, 2, '#cc66ff');
    p.applyDot(10, 2, '#cc66ff');
    const input = {
        getAxis: () => [0, 0], isDashPressed: () => false,
        isKeyQPressed: () => false, isKeyEPressed: () => false,
        isKeyRPressed: () => false, mouse: { x: 0, y: 0 },
    };
    p.tick(1, input, {});
    assert.ok(p.hp <= 90, '双毒刺每秒共20伤害,1秒后应扣至90以下');
    assert.equal(p.dots.length, 2, '同源DoT可叠加');
    p.tick(1.5, input, {});
    assert.equal(p.dots.length, 0, '时长耗尽后DoT应移除');

    // 致死路径：血少 + DoT → onPlayerDeath
    const deaths = [];
    const p2 = new PlayerController();
    p2.stats = { maxHp: 100, armor: 0, _coreOverflow: false };
    p2.hp = 5;
    p2.applyDot(10, 5, '#cc66ff');
    p2.tick(1, input, { onPlayerDeath: () => deaths.push(1) });
    assert.equal(p2.alive, false, 'DoT把血打空后玩家应死亡');
    assert.equal(deaths.length, 1, '死亡应触发onPlayerDeath一次');
});
