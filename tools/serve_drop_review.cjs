// 当前 TS 源码的 Cocos 运行核验：复用已有引擎，仅读取 build，不重写编辑器生成目录。
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets/scripts');
const build = path.join(root, 'build/web-desktop');
const original = fs.readFileSync(path.join(build, 'assets/main', fs.readdirSync(path.join(build, 'assets/main')).find(n => /^index\..*\.js$/.test(n))), 'utf8');
const ids = new Map([...original.matchAll(/_RF\.push\(\{\},"([^"]+)","([^"]+)"/g)].map(m => [m[2], m[1]]));
const files = [];
function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file); else if (file.endsWith('.ts')) files.push(file);
} }
walk(source);
const moduleId = file => 'chunks:///_drop/' + path.relative(source, file).replaceAll('\\', '/');
const modules = files.map(file => {
    const text = fs.readFileSync(file, 'utf8');
    let code = ts.transpileModule("import * as __reviewEngine from 'cc';\n" + text, {
        compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.System,
            experimentalDecorators: true, useDefineForClassFields: false }, fileName: file,
    }).outputText;
    // 无运行时引用时 TS 会消除上面的 import；只对引擎组件插入 RF 身份。
    const className = /@ccclass\('([^']+)'\)/.exec(text)?.[1];
    if (className) {
        const marker = ids.get(className);
        if (!marker) throw new Error(`缺少原场景组件身份：${className}`);
        code = ts.transpileModule("import * as __reviewEngine from 'cc';\n__reviewEngine.cclegacy._RF.push({}, " + JSON.stringify(marker) + ', ' + JSON.stringify(className) + ", undefined);\n" + text + '\n__reviewEngine.cclegacy._RF.pop();', {
            compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.System,
                experimentalDecorators: true, useDefineForClassFields: false }, fileName: file,
        }).outputText;
    }
    return code.replace(/System\.register\((\[[^\]]*\]),/, (_, deps) => {
        const resolved = JSON.parse(deps).map(dep => dep.startsWith('.') ? moduleId(path.resolve(path.dirname(file), dep + '.ts')) : dep);
        return `System.register(${JSON.stringify(moduleId(file))}, ${JSON.stringify(resolved)},`;
    });
});
const loader = `System.register('drop-review-loader', ['cc'], function () {
    let cc; return { setters: [m => cc = m], execute: function () {
        window.__dropReview = { cc };
        const originalLoad = cc.resources.load.bind(cc.resources);
        cc.resources.load = function (key, type, callback) {
            const match = /^art\\/([a-zA-Z0-9_]+)\\/spriteFrame$/.exec(key);
            if (!match || type !== cc.SpriteFrame) return originalLoad(key, type, callback);
            cc.assetManager.loadRemote('/art/' + match[1] + '.png', (err, image) => {
                if (err) return callback(err, null);
                const texture = new cc.Texture2D(); texture.image = image;
                const frame = new cc.SpriteFrame(); frame.texture = texture;
                callback(null, frame);
            });
        };
    }};
});`;
const deps = ['drop-review-loader', moduleId(path.join(source, 'core/GameManager.ts'))];
const bundle = modules.join('\n') + '\n' + loader + `
System.register('chunks:///_virtual/main', ${JSON.stringify(deps)}, function () { return { setters: [function(){}, function(){}], execute: function(){} }; });
System.register('virtual:///prerequisite-imports/main', ['chunks:///_virtual/main'], function () { return { setters: [function(){}], execute: function(){} }; });`;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
http.createServer((req, res) => {
    const route = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (route === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (/^\/game\/assets\/main\/index\.[a-z0-9]+\.js$/.test(route)) {
        res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle);
    }
    let file;
    if (/^\/art\/[a-zA-Z0-9_]+\.png$/.test(route)) file = path.join(root, 'assets/resources', route.slice(1));
    else if (route.startsWith('/game/')) {
        file = path.resolve(build, decodeURIComponent(route.slice(6) || 'index.html'));
        if (!file.startsWith(build + path.sep)) { res.writeHead(403); return res.end(); }
    } else if (route === '/catalog.json') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(require('../tests/dist/data/DropVisualDB').DROP_VISUALS));
    } else if (route === '/drop-review') file = path.join(root, 'tools/drop-review.html');
    if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
}).listen(8326, '127.0.0.1', () => process.stdout.write('掉落核验：http://127.0.0.1:8326/game/\n'));
