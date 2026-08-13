'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vec, Rng, Color, clamp } = require('../dist/core/MathUtils');

test('Vec.dist / dist2 计算欧几里得距离', () => {
    assert.equal(Vec.dist(0, 0, 3, 4), 5);
    assert.equal(Vec.dist2(0, 0, 3, 4), 25);
});

test('Vec.normalize 返回单位向量，零向量返回[0,0]', () => {
    const [nx, ny] = Vec.normalize(3, 4);
    assert.ok(Math.abs(nx - 0.6) < 1e-9);
    assert.ok(Math.abs(ny - 0.8) < 1e-9);
    assert.deepEqual(Vec.normalize(0, 0), [0, 0]);
});

test('Vec.lerp 线性插值', () => {
    assert.equal(Vec.lerp(0, 10, 0.5), 5);
    assert.equal(Vec.lerp(0, 10, 0), 0);
    assert.equal(Vec.lerp(0, 10, 1), 10);
});

test('clamp 边界钳制', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(15, 0, 10), 10);
});

test('Rng.float/int 落在指定区间内', () => {
    for (let i = 0; i < 200; i++) {
        const f = Rng.float(2, 5);
        assert.ok(f >= 2 && f < 5, `float ${f} 超出[2,5)`);
        const n = Rng.int(2, 5);
        assert.ok(n >= 2 && n <= 5, `int ${n} 超出[2,5]`);
        assert.ok(Number.isInteger(n));
    }
});

test('Rng.pick 只返回数组内元素', () => {
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) assert.ok(arr.includes(Rng.pick(arr)));
});

test('Rng.chance(0)恒为false，chance(1)恒为true', () => {
    for (let i = 0; i < 50; i++) {
        assert.equal(Rng.chance(0), false);
        assert.equal(Rng.chance(1), true);
    }
});

test('Rng.weighted 按权重分布下标，权重为0的桶几乎不命中', () => {
    const counts = [0, 0, 0];
    const N = 5000;
    for (let i = 0; i < N; i++) counts[Rng.weighted([0, 100, 0])]++;
    // 权重全部压在下标1
    assert.equal(counts[0], 0);
    assert.equal(counts[2], 0);
    assert.equal(counts[1], N);
});

test('Rng.weighted 大样本下分布比例接近权重比例', () => {
    const counts = [0, 0, 0];
    const N = 20000;
    for (let i = 0; i < N; i++) counts[Rng.weighted([10, 30, 60])]++;
    const p0 = counts[0] / N, p1 = counts[1] / N, p2 = counts[2] / N;
    // 允许 ±3% 的统计误差
    assert.ok(Math.abs(p0 - 0.1) < 0.03, `p0=${p0}`);
    assert.ok(Math.abs(p1 - 0.3) < 0.03, `p1=${p1}`);
    assert.ok(Math.abs(p2 - 0.6) < 0.03, `p2=${p2}`);
});

test('Color.rarityColor/rarityLabel 覆盖4种稀有度且未知稀有度有默认值', () => {
    assert.equal(Color.rarityColor('gold'), '#ffd700');
    assert.equal(Color.rarityLabel('gold'), '金色');
    assert.equal(Color.rarityColor('unknown'), '#aaa');
    assert.equal(Color.rarityLabel('unknown'), '');
});

test('Color.hexToRgb 正确解析十六进制颜色', () => {
    assert.deepEqual(Color.hexToRgb('#ff8800'), { r: 255, g: 136, b: 0 });
});

test('Color.alpha 生成合法的rgba字符串', () => {
    assert.equal(Color.alpha('#ff8800', 0.5), 'rgba(255,136,0,0.5)');
});
