'use strict';
// ============================================================
//  visualmanifest.test.js — 核心战斗美术的像素级门禁
//  只使用 Node 内置 zlib 读取 PNG，避免给项目增加图片解析依赖。
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ART_DIR = path.join(__dirname, '..', '..', 'assets', 'resources', 'art');
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function parsePng(file, decodePixels = false) {
    const buf = fs.readFileSync(path.join(ART_DIR, file));
    assert.ok(buf.subarray(0, 8).equals(PNG_SIG), `${file} 不是有效 PNG`);

    let offset = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
    const idat = [];
    while (offset + 12 <= buf.length) {
        const length = buf.readUInt32BE(offset);
        const type = buf.toString('ascii', offset + 4, offset + 8);
        const data = buf.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
        offset += 12 + length;
    }

    const result = { width, height, bitDepth, colorType, interlace };
    if (!decodePixels) return result;
    assert.equal(bitDepth, 8, `${file} 必须使用 8-bit PNG`);
    assert.equal(colorType, 6, `${file} 必须使用 RGBA PNG，才能可靠检查透明边缘`);
    assert.equal(interlace, 0, `${file} 不应使用交错 PNG`);

    const bpp = 4;
    const stride = width * bpp;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    assert.equal(raw.length, (stride + 1) * height, `${file} 解压后的像素长度异常`);
    const pixels = Buffer.alloc(stride * height);

    const paeth = (a, b, c) => {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const rowStart = y * stride;
        const srcStart = y * (stride + 1) + 1;
        for (let x = 0; x < stride; x++) {
            const src = raw[srcStart + x];
            const left = x >= bpp ? pixels[rowStart + x - bpp] : 0;
            const up = y > 0 ? pixels[rowStart + x - stride] : 0;
            const upLeft = y > 0 && x >= bpp ? pixels[rowStart + x - stride - bpp] : 0;
            let value;
            if (filter === 0) value = src;
            else if (filter === 1) value = src + left;
            else if (filter === 2) value = src + up;
            else if (filter === 3) value = src + Math.floor((left + up) / 2);
            else if (filter === 4) value = src + paeth(left, up, upLeft);
            else assert.fail(`${file} 使用未知 PNG filter ${filter}`);
            pixels[rowStart + x] = value & 0xff;
        }
    }
    return { ...result, pixels };
}

function cornerAlpha(png) {
    const alphaAt = (x, y) => png.pixels[(y * png.width + x) * 4 + 3];
    return [
        alphaAt(0, 0), alphaAt(png.width - 1, 0),
        alphaAt(0, png.height - 1), alphaAt(png.width - 1, png.height - 1),
    ];
}

function assertTransparentMargin(png, margin, message) {
    const alphaAt = (x, y) => png.pixels[(y * png.width + x) * 4 + 3];
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            if (x >= margin && x < png.width - margin && y >= margin && y < png.height - margin) continue;
            assert.equal(alphaAt(x, y), 0, `${message}：边缘(${x},${y})存在非透明像素`);
        }
    }
}

function alphaBounds(png, threshold = 16) {
    let minX = png.width, minY = png.height, maxX = -1, maxY = -1;
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            if (png.pixels[(y * png.width + x) * 4 + 3] < threshold) continue;
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
    }
    assert.ok(maxX >= minX && maxY >= minY, '图片必须包含可见像素');
    return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

test('五张核心VFX均为512×512透明RGBA且四角完全透明', () => {
    const files = ['fx_heal.png', 'fx_explosion.png', 'fx_cold_arrow.png', 'fx_hex_ring.png', 'fx_poison.png'];
    for (const file of files) {
        const png = parsePng(file, true);
        assert.equal(png.width, 512, `${file} 宽度应为512`);
        assert.equal(png.height, 512, `${file} 高度应为512`);
        assert.deepEqual(cornerAlpha(png), [0, 0, 0, 0], `${file} 四角必须透明，禁止黑色方底`);
    }
});

test('六名英雄战斗Sprite尺寸统一且保留透明安全边距', () => {
    const ids = ['kai', 'vivian', 'reik', 'olia', 'graf', 'liana'];
    for (const id of ids) {
        const file = `char_token_${id}.png`;
        const png = parsePng(file, true);
        assert.deepEqual([png.width, png.height], [512, 512], `${file} 应统一为512×512`);
        assertTransparentMargin(png, 8, `${file} 必须保留透明安全边距，避免纹理采样出白框`);
    }
});

test('六名英雄弹丸均为横向透明弹体，而不是纯色圆点', () => {
    const ids = ['kai', 'vivian', 'reik', 'olia', 'graf', 'liana'];
    for (const id of ids) {
        const file = `bullet_${id}.png`;
        const png = parsePng(file, true);
        assert.deepEqual([png.width, png.height], [256, 128], `${file} 应统一为2:1横向弹体`);
        assertTransparentMargin(png, 4, `${file} 必须保留透明安全边距`);
    }
});

test('金币使用透明方形正式美术，而非程序圆点', () => {
    const png = parsePng('ui_gold_coin.png', true);
    assert.equal(png.width, png.height, '金币贴图应为正方形');
    assert.ok(png.width >= 256, '金币源图至少256px，保证翻面缩放时轮廓清晰');
    assert.deepEqual(cornerAlpha(png), [0, 0, 0, 0], '金币四角必须透明');
});

test('五个基础怪待机帧使用512方形透明画布，切动作帧时不再被拉伸', () => {
    const files = [
        'enemy_grunt.png', 'enemy_shield.png', 'enemy_exploder.png',
        'enemy_golem.png', 'enemy_boss.png',
    ];
    for (const file of files) {
        const png = parsePng(file, true);
        assert.deepEqual([png.width, png.height], [512, 512], `${file} 应统一为512×512`);
        assertTransparentMargin(png, 4, `${file} 必须保留透明安全边距`);
    }

    for (const base of files.map(file => file.slice(0, -4))) {
        const idle = alphaBounds(parsePng(`${base}.png`, true));
        const move = alphaBounds(parsePng(`${base}_move.png`, true));
        assert.ok(
            Math.abs(Math.max(idle.width, idle.height) - Math.max(move.width, move.height)) <= 4,
            `${base} 待机/动作占屏主尺寸必须一致，避免切帧缩放闪烁`,
        );
    }
});

test('六名英雄正面待机与动作帧保持同一身高基准', () => {
    for (const id of ['kai', 'vivian', 'reik', 'olia', 'graf', 'liana']) {
        const idle = alphaBounds(parsePng(`char_token_${id}.png`, true));
        const move = alphaBounds(parsePng(`char_token_${id}_move.png`, true));
        assert.ok(
            Math.abs(idle.height - move.height) <= 4,
            `${id} 正面切帧时身体高度不得突变`,
        );
    }
});

const directionalBases = [
    ...['kai', 'vivian', 'reik', 'olia', 'graf', 'liana'].map(id => `char_token_${id}`),
    'enemy_grunt', 'enemy_shield', 'enemy_exploder', 'enemy_golem', 'enemy_boss',
    ...[1, 2, 3, 4].map(chapter => `enemy_boss_ch${chapter}`),
];

const directionalFiles = directionalBases.flatMap(base => [
    `${base}_move.png`, `${base}_side.png`, `${base}_side_move.png`,
    `${base}_back.png`, `${base}_back_move.png`,
]);

test('全部英雄、普通怪和Boss的前侧背动作矩阵均为统一透明RGBA', () => {
    const files = directionalFiles;
    for (const file of files) {
        const png = parsePng(file, true);
        assert.deepEqual([png.width, png.height], [512, 512], `${file} 应统一为512×512`);
        assertTransparentMargin(png, 4, `${file} 必须保留透明边缘，禁止棋盘格或白底`);
        let opaque = 0;
        for (let i = 3; i < png.pixels.length; i += 4) if (png.pixels[i] >= 16) opaque++;
        assert.ok(opaque / (png.width * png.height) < 0.72, `${file} 透明面积不足，疑似烘入背景`);
    }
});

test('全部方向与动作帧携带独立Cocos资源元数据', () => {
    const files = directionalFiles;
    const uuids = new Set();
    for (const file of files) {
        const meta = JSON.parse(fs.readFileSync(path.join(ART_DIR, `${file}.meta`), 'utf8'));
        assert.ok(meta.uuid, `${file} 缺少资源UUID`);
        assert.ok(!uuids.has(meta.uuid), `${file} 与其他动作帧复用了UUID`);
        uuids.add(meta.uuid);
        assert.equal(meta.subMetas.f9941.displayName, path.basename(file, '.png'));
    }
});

test('海克斯炮台图标为透明纯符号,不再烧录黑底卡框', () => {
    const png = parsePng('ui_icon_summon.png', true);
    assert.equal(png.width, png.height, '炮台图标应保持正方形');
    assert.ok(png.width >= 256, '炮台图标源图分辨率不足');
    assert.deepEqual(cornerAlpha(png), [0, 0, 0, 0], '炮台图标四角必须透明，禁止自带卡框');
});

test('薇薇安战场炮台拆为透明俯视底座与横向旋转炮筒', () => {
    const base = parsePng('turret_base_vivian.png', true);
    const barrel = parsePng('turret_barrel_vivian.png', true);
    assert.equal(base.width, base.height, '固定底座应为正方形俯视构图');
    assert.ok(base.width >= 512, '炮台底座源图分辨率不足');
    assert.ok(barrel.width > barrel.height, '旋转炮筒应保持横向构图');
    assert.ok(barrel.height >= 512, '炮台炮筒源图分辨率不足');
    assert.deepEqual(cornerAlpha(base), [0, 0, 0, 0], '炮台底座四角必须透明');
    assert.deepEqual(cornerAlpha(barrel), [0, 0, 0, 0], '炮台炮筒四角必须透明');
});

test('爆炸贴图尺寸与伤害范围解耦并设上限,避免后期遮住半屏', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'assets', 'scripts', 'systems', 'ParticleManager.ts'), 'utf8');
    assert.match(src, /Math\.min\(2\.4, Math\.max\(0\.65, radius \/ 70\)\)/);
    assert.doesNotMatch(src, /spawnSpriteFx\(x, y, 'fx_explosion', 0\.4, radius \/ 40\)/);
    assert.match(src, /scale = Math\.min\(scale, 1\.4\)/);
    assert.match(src, /activeExplosions >= 8/);
    assert.match(src, /dx \* dx \+ dy \* dy < 52 \* 52/);
});

test('四章背景全部保持16:9并满足1280×720最低分辨率', () => {
    for (let chapter = 1; chapter <= 4; chapter++) {
        const file = `bg_chapter${chapter}.png`;
        const png = parsePng(file);
        assert.ok(png.width >= 1280 && png.height >= 720, `${file} 分辨率不足`);
        assert.ok(Math.abs(png.width / png.height - 16 / 9) < 0.01, `${file} 必须保持16:9`);
    }
});
