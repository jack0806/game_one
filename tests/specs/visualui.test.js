'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const screenSource = fs.readFileSync(path.join(root, 'assets/scripts/ui/ScreenManager.ts'), 'utf8');
const gameSource = fs.readFileSync(path.join(root, 'assets/scripts/core/GameManager.ts'), 'utf8');

test('首页操作台使用不透明遮罩并覆盖原START GAME顶部', () => {
    assert.match(screenSource, /setContentSize\(568, 410\)/);
    assert.match(screenSource, /new Color\(4, 10, 18, 255\)/);
    assert.match(screenSource, /fillRect\(-284, -205, 568, 410\)/);
});

test('角色介绍卡扩大正文区且底排解锁提示保留安全边距', () => {
    assert.match(screenSource, /setContentSize\(360, 260\)/);
    assert.match(screenSource, /setContentSize\(344, 100\)/);
    assert.match(screenSource, /const cy = 80 - row \* 260/);
    assert.match(screenSource, /hintN\.setPosition\(new Vec3\(0, -105, 0\)\)/);
    assert.match(screenSource, /skLbl\.fontSize = 11/);
    assert.match(screenSource, /skLbl\.lineHeight = 17/);
});

test('未解锁角色遮罩位于立绘上方,不会再把Portrait推回前景', () => {
    assert.match(screenSource, /const dim = new Node\('LockDim'\); dim\.setParent\(card\)/);
    assert.doesNotMatch(screenSource, /dim\.setSiblingIndex\(1\)/);
    assert.match(screenSource, /dim\.setPosition\(new Vec3\(0, 5, 0\)\)/);
    assert.match(screenSource, /setContentSize\(360, 282\)/);
    assert.match(screenSource, /fillRect\(-180, -141, 360, 282\)/);
});

test('玩家与敌人持续护盾使用能量壳和断续高光弧', () => {
    assert.match(gameSource, /e\.shieldActive && e\.shieldHp > 0 && e\.maxShieldHp > 0/);
    assert.match(gameSource, /g\.arc\(ex, ey, shieldR \+ 2, start, start \+ 0\.52, false\)/);
    assert.match(gameSource, /p\.maxShield > 0/);
    assert.match(gameSource, /g\.arc\(px, py, shieldR \+ 2, start, start \+ 0\.58, false\)/);
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
