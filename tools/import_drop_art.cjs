// 图像由内置 imagegen 完成设计；此步骤只做运行时导入规格归一与资源元数据登记。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require(process.env.DROP_SHARP_MODULE || 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'docs/art/style-a/drop-redesign-2026-11-06');
const sources = JSON.parse(fs.readFileSync(path.join(folder, 'sources.json'), 'utf8'));
const art = path.join(root, 'assets/resources/art');
const template = JSON.parse(fs.readFileSync(path.join(art, 'ui_gold_coin.png.meta'), 'utf8'));
async function main() {
    const report = [];
    for (const [key, item] of Object.entries(sources)) {
        const target = path.join(art, key + '.png');
        const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(item.source)).digest('hex');
        if (!fs.existsSync(target) || item.sourceHash !== sourceHash) {
            const { data, info } = await sharp(item.source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            let left = info.width, top = info.height, right = -1, bottom = -1, transparent = 0;
            for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
                const alpha = data[(y * info.width + x) * 4 + 3];
                if (alpha < 8) transparent++;
                if (alpha > 8) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
            }
            if (transparent < info.width * info.height * 0.05 || right < left) throw new Error(`${key} 缺少真实透明背景`);
            await sharp(item.source).ensureAlpha().extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
                .resize(464, 464, { fit: 'contain', background: '#00000000' })
                .extend({ top: 24, bottom: 24, left: 24, right: 24, background: '#00000000' })
                .png({ palette: false, compressionLevel: 9 }).toFile(target);
        }
        const metaPath = target + '.meta';
        const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : structuredClone(template);
        const uuid = fs.existsSync(metaPath) ? meta.uuid : crypto.randomUUID();
        meta.uuid = uuid;
        meta.userData.redirect = uuid + '@6c48a';
        for (const [id, sub] of Object.entries(meta.subMetas)) {
            sub.uuid = uuid + '@' + id; sub.displayName = key;
            if (id === '6c48a') sub.userData.imageUuidOrDatabaseUri = uuid;
        }
        const frame = meta.subMetas.f9941.userData;
        Object.assign(frame, { trimType: 'none', trimX: 0, trimY: 0, offsetX: 0, offsetY: 0,
            width: 512, height: 512, rawWidth: 512, rawHeight: 512, packable: true,
            imageUuidOrDatabaseUri: uuid + '@6c48a' });
        frame.vertices = { rawPosition: [-256,-256,0,256,-256,0,-256,256,0,256,256,0], indexes: [0,1,2,2,1,3],
            uv: [0,512,512,512,0,0,512,0], nuv: [0,0,1,0,0,1,1,1], minPos: [-256,-256,0], maxPos: [256,256,0] };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
        item.sourceHash = sourceHash;
        report.push({ key, name: item.name, uuid, sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),
            bytes: fs.statSync(target).size, width: 512, height: 512 });
    }
    fs.writeFileSync(path.join(folder, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
    fs.writeFileSync(path.join(folder, 'production.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(`已导入 ${report.length} 张独立透明掉落图\n`);
}
main().catch(e => { process.stderr.write(String(e)); process.exitCode = 1; });
