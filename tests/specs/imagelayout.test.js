'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { imageLayout } = require('../dist/core/ImageLayout');

test('横竖原画在单位图鉴中保持比例且完整落在卡框内', () => {
    for (const [w, h] of [[1600, 900], [600, 1200], [1254, 1254]]) {
        const fit = imageLayout(w, h, 340, 196);
        assert.ok(Math.abs(fit.width / fit.height - w / h) < 1e-10);
        assert.ok(fit.width <= 340 && fit.height <= 196);
    }
});

test('英雄缩略图等比填充并保留原图顶缘，脸部不会因居中裁切丢失', () => {
    for (const [width, height] of [[138, 82], [208, 99], [340, 196]]) {
        const fit = imageLayout(1254, 1254, width, height, 'cover', true);
        assert.equal(fit.width, fit.height);
        assert.ok(fit.width >= width && fit.height >= height);
        assert.equal(fit.y + fit.height / 2, height / 2);
        assert.ok(fit.y - fit.height / 2 <= -height / 2);
    }
});

test('低分辨率单位图不被强行放大到整张详情框', () => {
    const fit = imageLayout(120, 80, 340, 196);
    assert.equal(fit.width, 120);
    assert.equal(fit.height, 80);
});
