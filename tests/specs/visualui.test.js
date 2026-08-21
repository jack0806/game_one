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

test('战斗英雄呼吸动画保持等比缩放', () => {
    assert.match(gameSource, /const uniformScale = 1 \+ breathe/);
    assert.match(gameSource, /new Vec3\(facing \* uniformScale, uniformScale, 1\)/);
    assert.doesNotMatch(gameSource, /new Vec3\(facing \* \(1 \+ breathe\), 1 - breathe, 1\)/);
});
