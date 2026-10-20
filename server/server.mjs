// ============================================================
//  server.mjs — 本机存档服务器（方案 B，零依赖纯 Node）
// ============================================================
// 启动：node server/server.mjs   （可用环境变量覆盖 PORT / DATA_DIR）
// 职责：账号注册/登录（scrypt 加盐）+ 每账号 3 个存档槽的 JSON 落盘。
// 档案内容原样存储（客户端 PlayerProfile JSON），服务器不理解字段——
// 客户端新增字段天然兼容。后期迁云 BaaS 时保留 /api 契约，替换存储实现。
// 局域网明文 HTTP（家庭网络场景）；密码绝不明文存储。
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 7460);
const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const ACCOUNTS_DIR = path.join(DATA_DIR, 'accounts');
const SAVES_DIR = path.join(DATA_DIR, 'saves');
const TOKEN_TTL = 7 * 24 * 3600 * 1000;   // 7 天免登录
const MAX_BODY = 1024 * 1024;             // 1MB（档案 JSON 远小于此）

fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
fs.mkdirSync(SAVES_DIR, { recursive: true });

// ── 小工具 ────────────────────────────────────────────────────

const accountIdOf = (account) =>
    crypto.createHash('sha256').update(String(account).trim().toLowerCase()).digest('hex').slice(0, 32);
const accountFile = (id) => path.join(ACCOUNTS_DIR, `${id}.json`);
const savesFile = (id) => path.join(SAVES_DIR, `${id}.json`);
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data));

const hashPassword = (password, salt) => crypto.scryptSync(String(password), salt, 64).toString('hex');
const emptySaves = () => ({ slots: [null, null, null], savedAt: 0 });

/** 签发 token（持久化到账号文件，服务重启不掉线），顺带清理过期 token。 */
function issueToken(acc) {
    const token = crypto.randomBytes(24).toString('hex');
    acc.tokens[token] = Date.now() + TOKEN_TTL;
    for (const t of Object.keys(acc.tokens)) {
        if (acc.tokens[t] < Date.now()) delete acc.tokens[t];
    }
    writeJson(accountFile(acc.id), acc);
    return token;
}

/** Bearer token → 账号对象（遍历账号目录；账号量级为家庭/小团队，可接受）。 */
function authByToken(req) {
    const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || '');
    if (!m) return null;
    const token = m[1];
    for (const f of fs.readdirSync(ACCOUNTS_DIR)) {
        const acc = readJson(path.join(ACCOUNTS_DIR, f));
        if (acc?.tokens?.[token] && acc.tokens[token] > Date.now()) return acc;
    }
    return null;
}

// ── HTTP 基础设施 ─────────────────────────────────────────────

function send(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch { resolve(null); }
        });
        req.on('error', reject);
    });
}

// ── 业务路由 ──────────────────────────────────────────────────

function handleRegister(body, res) {
    const account = String(body?.account ?? '').trim();
    const password = String(body?.password ?? '');
    if (account.length < 2 || account.length > 32) return send(res, 400, { error: '账号需 2~32 个字符' });
    if (password.length < 4) return send(res, 400, { error: '密码至少 4 位' });
    const id = accountIdOf(account);
    if (readJson(accountFile(id))) return send(res, 409, { error: '该账号已注册，请直接登录' });
    const salt = crypto.randomBytes(16).toString('hex');
    const acc = {
        id, account,
        salt,
        passwordHash: hashPassword(password, salt),
        wechatOpenId: null,                 // 迁云后接微信登录
        createdAt: Date.now(),
        tokens: {},
    };
    writeJson(accountFile(id), acc);
    writeJson(savesFile(id), emptySaves());
    const token = issueToken(acc);
    send(res, 200, { token, account, profiles: readJson(savesFile(id)) });
}

function handleLogin(body, res) {
    const account = String(body?.account ?? '').trim();
    const password = String(body?.password ?? '');
    const id = accountIdOf(account);
    const acc = readJson(accountFile(id));
    if (!acc) return send(res, 404, { error: '账号不存在，请先注册' });
    if (hashPassword(password, acc.salt) !== acc.passwordHash) return send(res, 403, { error: '密码错误' });
    const token = issueToken(acc);
    send(res, 200, { token, account: acc.account, profiles: readJson(savesFile(id)) });
}

async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const route = url.pathname;

    if (req.method === 'OPTIONS') { send(res, 204, {}); return; }
    if (req.method === 'GET' && route === '/api/health') { send(res, 200, { ok: true, now: Date.now() }); return; }

    const body = req.method === 'POST' ? await readBody(req) : undefined;
    if (req.method === 'POST' && body === null) { send(res, 400, { error: '请求体不是合法 JSON' }); return; }

    if (req.method === 'POST' && route === '/api/register') { handleRegister(body, res); return; }
    if (req.method === 'POST' && route === '/api/login') { handleLogin(body, res); return; }

    const acc = authByToken(req);
    if (!acc) { send(res, 401, { error: '未登录或登录已过期' }); return; }

    if (req.method === 'POST' && route === '/api/logout') {
        delete acc.tokens[(req.headers.authorization || '').replace(/^Bearer\s+/, '')];
        writeJson(accountFile(acc.id), acc);
        send(res, 200, { ok: true });
        return;
    }
    if (req.method === 'GET' && route === '/api/profiles') {
        send(res, 200, { account: acc.account, profiles: readJson(savesFile(acc.id)) ?? emptySaves() });
        return;
    }
    const slotMatch = /^\/api\/profiles\/([0-2])$/.exec(route);
    if (req.method === 'POST' && slotMatch) {
        if (!body || typeof body !== 'object') { send(res, 400, { error: '档案格式非法' }); return; }
        const slot = Number(slotMatch[1]);
        const saves = readJson(savesFile(acc.id)) ?? emptySaves();
        saves.slots[slot] = body;                    // 档案 JSON 原样落盘（last-write-wins）
        saves.savedAt = Date.now();
        writeJson(savesFile(acc.id), saves);
        send(res, 200, { ok: true });
        return;
    }

    send(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
        console.warn('[save-server]', e?.message ?? e);
        try { send(res, 500, { error: '服务器内部错误' }); } catch { /* 已响应 */ }
    });
});

server.listen(PORT, () => {
    console.log(`[save-server] listening on http://0.0.0.0:${PORT}  (data: ${DATA_DIR})`);
});
