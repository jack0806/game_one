'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resources, SpriteFrame } = require('cc');

function setup(t) {
    const requests = [];
    t.mock.method(resources, 'load', (path, type, done) => requests.push({ path, done }));
    delete require.cache[require.resolve('../dist/core/SpriteUtils')];
    return { art: require('../dist/core/SpriteUtils'), requests };
}

test('首页背景完成前只发出背景请求，其他美术延后并共享同一次加载', t => {
    const { art, requests } = setup(t);
    art.prioritizeStartupArt('title_screen');
    const delivered = [];
    art.loadArtSprite('bg_chapter1', frame => delivered.push(frame));
    art.loadArtSprite('bg_chapter1', frame => delivered.push(frame));
    assert.deepEqual(requests.map(r => r.path), ['art/title_screen/spriteFrame']);
    const title = new SpriteFrame();
    requests[0].done(null, title);
    assert.equal(art.getCachedSprite('title_screen'), title);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].path, 'art/bg_chapter1/spriteFrame');
    const chapter = new SpriteFrame();
    requests[1].done(null, chapter);
    assert.deepEqual(delivered, [chapter, chapter]);
    art.loadArtSprite('bg_chapter1', frame => assert.equal(frame, chapter));
    assert.equal(requests.length, 2, '已缓存资源不重新请求');
});

test('首页背景失败也释放其他资源，并允许稍后重试背景', t => {
    const { art, requests } = setup(t);
    t.mock.method(console, 'warn', () => {});
    art.prioritizeStartupArt('title_screen');
    art.loadArtSprite('bg_chapter1', () => {});
    requests[0].done(new Error('模拟加载失败'), null);
    assert.equal(requests.length, 2);
    requests[1].done(null, new SpriteFrame());
    art.loadArtSprite('title_screen', () => {});
    assert.equal(requests.length, 3);
    requests[2].done(null, new SpriteFrame());
});

test('返回首页命中缓存，不阻塞后续美术加载', t => {
    const { art, requests } = setup(t);
    art.prioritizeStartupArt('title_screen');
    requests[0].done(null, new SpriteFrame());
    art.prioritizeStartupArt('title_screen');
    art.loadArtSprite('ui_lobby_portal_frame', () => {});
    assert.equal(requests.length, 2);
    assert.equal(requests[1].path, 'art/ui_lobby_portal_frame/spriteFrame');
    requests[1].done(null, new SpriteFrame());
});
