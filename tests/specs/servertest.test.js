// ============================================================
//  server.test.js — 本机存档服务器集成测试（真实进程 + HTTP）
// ============================================================
// 子进程拉起 server/server.mjs（临时 DATA_DIR + 独立端口），走完整
// 注册/登录/档案读写/登出流程后回收。覆盖 CORS 预检与鉴权失败分支。
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 7481;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(os.tmpdir(), `hexblast-server-test-${Date.now()}`);

let child = null;

async function call(method, api, body, token) {
    const res = await fetch(`${BASE}${api}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
}

test.before(async () => {
    child = spawn(process.execPath, [path.join(__dirname, '../../server/server.mjs')], {
        env: { ...process.env, PORT: String(PORT), DATA_DIR },
        stdio: 'ignore',
    });
    // 轮询等端口就绪（最多 10s）
    for (let i = 0; i < 50; i++) {
        try {
            const r = await fetch(`${BASE}/api/health`);
            if (r.ok) return;
        } catch { /* 未就绪 */ }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('服务器 10s 内未就绪');
});

test.after(() => {
    if (child) child.kill();
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

test('健康检查', async () => {
    const { status, json } = await call('GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(json.ok, true);
});

test('CORS 预检放行', async () => {
    const res = await fetch(`${BASE}/api/login`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('注册→自动带空档案槽；重复注册拒绝', async () => {
    const reg = await call('POST', '/api/register', { account: '测试官', password: '1234' });
    assert.equal(reg.status, 200);
    assert.ok(reg.json.token);
    assert.deepEqual(reg.json.profiles.slots, [null, null, null], '新账号从空档案开始');
    const again = await call('POST', '/api/register', { account: '测试官', password: '1234' });
    assert.equal(again.status, 409);
});

test('登录校验密码；错误密码 403；不存在账号 404', async () => {
    const okLogin = await call('POST', '/api/login', { account: '测试官', password: '1234' });
    assert.equal(okLogin.status, 200);
    const badPw = await call('POST', '/api/login', { account: '测试官', password: 'wrong' });
    assert.equal(badPw.status, 403);
    const noAcc = await call('POST', '/api/login', { account: '路人', password: '1234' });
    assert.equal(noAcc.status, 404);
});

test('档案读写：登录后上传槽位并读回一致；未带 token 401', async () => {
    const login = await call('POST', '/api/login', { account: '测试官', password: '1234' });
    const token = login.json.token;
    const profile = { totalRuns: 7, bestChapter: 20, chaptersCleared: 19, updatedAt: 12345 };
    const save = await call('POST', '/api/profiles/0', profile, token);
    assert.equal(save.status, 200);
    const read = await call('GET', '/api/profiles', undefined, token);
    assert.equal(read.status, 200);
    assert.deepEqual(read.json.profiles.slots[0], profile, '原样落盘原样读回');
    assert.equal(read.json.profiles.slots[1], null);
    // 鉴权：无 token / 坏 token 都 401
    const noAuth = await call('GET', '/api/profiles');
    assert.equal(noAuth.status, 401);
    const badAuth = await call('GET', '/api/profiles', undefined, 'faketoken');
    assert.equal(badAuth.status, 401);
});

test('登出后 token 吊销', async () => {
    const login = await call('POST', '/api/login', { account: '测试官', password: '1234' });
    const token = login.json.token;
    const out = await call('POST', '/api/logout', {}, token);
    assert.equal(out.status, 200);
    const after = await call('GET', '/api/profiles', undefined, token);
    assert.equal(after.status, 401, '登出后旧 token 不可用');
});
