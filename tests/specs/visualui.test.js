'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const screenSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/ScreenManager.ts'), 'utf8');
const gameSource = fs.readFileSync(path.join(root, 'assets/scripts/core/GameManager.ts'), 'utf8');
const playerSource = fs.readFileSync(path.join(root, 'assets/scripts/entities/PlayerController.ts'), 'utf8');
const hudSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/HUD.ts'), 'utf8');
const shopSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/ShopUI.ts'), 'utf8');
const statsSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/StatsPanel.ts'), 'utf8');
const webBuild = JSON.parse(fs.readFileSync(path.join(root, 'tools/build-web-desktop.json'), 'utf8'));

test('首页操作台使用不透明遮罩并覆盖原START GAME顶部', () => {
    assert.match(screenSource, /setContentSize\(568, 410\)/);
    assert.match(screenSource, /new Color\(4, 10, 18, 255\)/);
    assert.match(screenSource, /fillRect\(-284, -205, 568, 410\)/);
});

test('角色介绍卡有统一底板、说明居中且底排解锁提示保留安全边距', () => {
    assert.match(screenSource, /setContentSize\(360, 270\)/);
    assert.match(screenSource, /cardG\.fillRect\(-180, -135, 360, 270\)/);
    assert.match(screenSource, /cardG\.rect\(-180, -135, 360, 270\)/);
    assert.match(screenSource, /cardG\.lineWidth = locked \? 1 : 2/);
    assert.match(screenSource, /const corner = 18/);
    assert.match(screenSource, /frameN\.setPosition\(new Vec3\(0, 68, 0\)\)/);
    assert.match(screenSource, /setContentSize\(112, 112\)/);
    assert.match(screenSource, /this\._loadPortrait\(card, `char_\$\{charId\}`, 104, 68\)/);
    assert.match(screenSource, /0, -14, 320, 40/);
    assert.match(screenSource, /new Node\('InfoDivider'\)/);
    assert.match(screenSource, /dividerN\.setPosition\(new Vec3\(0, -45, 0\)\)/);
    assert.match(screenSource, /skN\.setPosition\(new Vec3\(0, -88, 0\)\)/);
    assert.match(screenSource, /setContentSize\(320, 72\)/);
    assert.match(screenSource, /skLbl\.verticalAlign = VerticalTextAlignment\.CENTER/);
    assert.match(screenSource, /const cy = 90 - row \* 285/);
    assert.match(screenSource, /hintN\.setPosition\(new Vec3\(0, -105, 0\)\)/);
    assert.match(screenSource, /skLbl\.fontSize = 12/);
    assert.match(screenSource, /skLbl\.lineHeight = 19/);
    assert.match(screenSource, /skLbl\.horizontalAlign = HorizontalTextAlignment\.CENTER/);
    assert.match(screenSource, /const skillName = \(text: string\) => text\.split\('—'\)\[0\]\.trim\(\)/);
});

test('未解锁角色遮罩位于立绘上方,不会再把Portrait推回前景', () => {
    assert.match(screenSource, /const dim = new Node\('LockDim'\); dim\.setParent\(card\)/);
    assert.doesNotMatch(screenSource, /dim\.setSiblingIndex\(1\)/);
    assert.match(screenSource, /dim\.setPosition\(Vec3\.ZERO\)/);
    assert.match(screenSource, /setContentSize\(360, 270\)/);
    assert.match(screenSource, /fillRect\(-180, -135, 360, 270\)/);
});

test('玩家护盾在粒子上层包住角色，敌人持续护盾仍使用能量壳', () => {
    assert.match(gameSource, /e\.shieldActive && e\.shieldHp > 0 && e\.maxShieldHp > 0/);
    assert.match(gameSource, /g\.arc\(ex, ey, shieldR \+ 2, start, start \+ 0\.52, false\)/);
    assert.match(gameSource, /p\.maxShield > 0/);
    assert.match(gameSource, /const shieldR = Math\.max\(44,/);
    assert.match(gameSource, /g\.arc\(px, py, shieldR \+ 2\.5, start, start \+ 0\.48, false\)/);
    assert.match(gameSource, /ParticleLayer 位于所有实体之上/);
});

test('战斗角色关闭auto-trim，避免裁剪框被强塞为正方形后横向拉宽', () => {
    assert.match(playerSource, /this\.sprite\.trim = false/);
});

test('玩家生命、护盾与Boss条使用独立区域并钳制宽度', () => {
    assert.match(hudSource, /Math\.min\(1, d\.shield \/ d\.maxShield\)/);
    assert.match(hudSource, /ShieldFg', -500, 320/);
    assert.match(hudSource, /HpLbl', -380, 338/);
    assert.match(hudSource, /ShieldLbl', -380, 326/);
    assert.match(hudSource, /生命  \$\{Math\.ceil\(d\.hp\)\} \/ \$\{Math\.round\(d\.maxHp\)\}/);
    assert.match(hudSource, /护盾  \$\{Math\.ceil\(d\.shield\)\} \/ \$\{Math\.round\(d\.maxShield\)\}/);
    assert.match(hudSource, /BossRoot', -this\.BOSS_W \/ 2, 282/);
    assert.match(hudSource, /ln\.setPosition\(new Vec3\(this\.BOSS_W \/ 2, this\.BOSS_H \/ 2, 0\)\)/);
});

test('商店使用不透明独立面板，神秘强化作为二级模态弹窗', () => {
    assert.match(shopSource, /new Color\(8, 13, 23, 252\)/);
    assert.match(shopSource, /resume\(\) \{ this\.node\.active = true; \}/);
    assert.match(gameSource, /case 'augment':[\s\S]*this\._shopUI\.hide\(\)[\s\S]*this\._shopUI\.resume\(\)/);
});

test('炮台使用固定俯视底座与独立旋转炮筒并保留接触阴影', () => {
    assert.match(gameSource, /new SpriteNodePool\(this\._gameLayer, 24, 'TurretBase'/);
    assert.match(gameSource, /new SpriteNodePool\(this\._gameLayer, 24, 'TurretBarrel'/);
    assert.match(gameSource, /applyArtSprite\(baseSp, 'turret_base_vivian'\)/);
    assert.match(gameSource, /applyArtSprite\(barrelSp, 'turret_barrel_vivian'\)/);
    assert.match(gameSource, /barrelTransform\.setAnchorPoint\(0\.36, 0\.5\)/);
    assert.match(gameSource, /barrel\.setRotationFromEuler/);
    assert.doesNotMatch(gameSource, /base\.setRotationFromEuler/);
    assert.doesNotMatch(gameSource, /Math\.sin\(this\._visualTime \* 4 \+ t\.x\)/);
    assert.match(gameSource, /const deployAim = Math\.atan2\(this\._input\.mouse\.y - player\.y/);
    assert.match(gameSource, /const deployDistance = 68/);
    assert.match(gameSource, /fanIndex \* 0\.62/);
    assert.doesNotMatch(gameSource, /followOwner \? followSide \* 52 : \(Math\.random\(\) - 0\.5\) \* 100/);
    assert.match(gameSource, /g\.ellipse\(tx, ty - r \* 0\.72, r \* 1\.15, r \* 0\.34\)/);
});

test('Web Desktop发布外壳与设计画布都锁定1280×720', () => {
    assert.deepEqual(webBuild.designResolution, { width: 1280, height: 720, policy: 4 });
    assert.deepEqual(webBuild.packages['web-desktop'].resolution, { designWidth: 1280, designHeight: 720 });
});

test('角色详情将十个词条排成2列×5行，技能名与说明保持同行', () => {
    assert.match(statsSource, /const augColX = \[132, 398\]/);
    assert.match(statsSource, /Math\.floor\(i \/ 2\) \* rowH/);
    assert.match(statsSource, /nn\.setPosition\(new Vec3\(-410, y, 0\)\)/);
    assert.match(statsSource, /dn\.setPosition\(new Vec3\(-186, y, 0\)\)/);
    assert.match(statsSource, /dn\.addComponent\(UITransform\)\.setContentSize\(318, 24\)/);
    assert.match(statsSource, /dl\.fontSize = 14/);
    assert.match(statsSource, /dl\.enableWrapText = false/);
    assert.match(statsSource, /row\.desc\.string = detail \? `— \$\{detail\}` : ''/);
    assert.match(statsSource, /sk\?\.desc\?\.split\('—'\)/);
});

test('战斗英雄呼吸动画保持等比缩放', () => {
    assert.match(gameSource, /const uniformScale = 1 \+ breathe/);
    assert.match(gameSource, /new Vec3\(facing \* uniformScale, uniformScale, 1\)/);
    assert.doesNotMatch(gameSource, /new Vec3\(facing \* \(1 \+ breathe\), 1 - breathe, 1\)/);
});

test('高密金币降低远距亮度并在玩家附近恢复全亮', () => {
    assert.match(gameSource, /this\._economy\.drops\.length > 48/);
    assert.match(gameSource, /Vec\.dist\(drop\.x, drop\.y, this\._player\.x, this\._player\.y\) < 150/);
    assert.match(gameSource, /crowdedCoins && !nearPlayer \? 150 : 255/);
});

test('章节结算清空 Boss 阶段浮字与战斗残影', () => {
    assert.match(gameSource, /s === 'chapterClear'[\s\S]*this\._floatText\?\.clear\(\)/);
    assert.match(gameSource, /for \(const label of this\._floatLabels\) label\.active = false/);
    assert.match(gameSource, /this\._particles\?\.clear\(\)/);
    assert.match(gameSource, /this\._coinPool\?\.releaseAll\(\)/);
    assert.match(gameSource, /for \(const enemy of this\._enemies\)[\s\S]*enemy\.node\.active = false/);
});
