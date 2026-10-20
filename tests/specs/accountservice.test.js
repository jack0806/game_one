// ============================================================
//  accountservice.test.js — 存档服务器客户端（systems/AccountService）
// ============================================================
// transport 与 storage 全部注入 fake：不联网即可验证注册/登录/自动续登/
// 上传/会话存留；逐槽合并决策 mergeAction 覆盖四分支（玩家红线：设备旧档
// 不丢失——谁新谁赢）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    AccountService, mergeAction, AUTH_KEY,
} = require('../dist/systems/AccountService');

function makeStorage(initial = {}) {
    const m = new Map(Object.entries(initial));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
    };
}

/** 构造可编程 transport：按注册的 (method+path) 返回脚本化响应，并记录调用。 */
function makeTransport(routes, calls = []) {
    return async (method, path, body, token) => {
        calls.push({ method, path, body, token });
        const key = `${method} ${path}`;
        const handler = routes[key];
        if (!handler) return { status: 404, json: { error: 'not found' } };
        return handler({ body, token });
    };
}

function fresh(storageInitial = {}) {
    AccountService.storage = makeStorage(storageInitial);
    AccountService.calls = [];
    return AccountService.calls;
}

test('注册成功：token 会话落存储，返回服务器档案槽', async () => {
    const calls = fresh();
    const slots = [{ totalRuns: 3 }, null, null];
    AccountService.transport = makeTransport({
        'POST /api/register': ({ body }) => ({
            status: 200,
            json: { token: 'tok-1', account: body.account, profiles: { slots } },
        }),
    }, calls);
    const res = await AccountService.register('  玩家甲 ', '1234');
    assert.equal(res.ok, true);
    assert.deepEqual(res.slots, slots);
    const s = AccountService.session;
    assert.equal(s?.token, 'tok-1');
    assert.equal(s?.account, '玩家甲', '注册时账号已去除首尾空白');
    assert.equal(calls[0].path, '/api/register');
});

test('登录失败（密码错误）：不落会话，返回服务器错误文案', async () => {
    fresh();
    AccountService.transport = makeTransport({
        'POST /api/login': () => ({ status: 403, json: { error: '密码错误' } }),
    });
    const res = await AccountService.login('玩家甲', 'wrong');
    assert.equal(res.ok, false);
    assert.equal(res.error, '密码错误');
    assert.equal(AccountService.session, null, '失败不得写入会话');
});

test('resume 自动登录：token 有效拉取档案；401 视为过期', async () => {
    fresh({ [AUTH_KEY]: JSON.stringify({ token: 'tok-old', account: '乙' }) });
    AccountService.transport = makeTransport({
        'GET /api/profiles': ({ token }) => token === 'tok-old'
            ? { status: 200, json: { profiles: { slots: [null, { totalRuns: 1 }, null] } } }
            : { status: 401, json: { error: 'expired' } },
    });
    const ok = await AccountService.resume('tok-old');
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.slots[1], { totalRuns: 1 });
    // 过期 token：ok=false（调用方据此清除会话并回到登录页）
    const expired = await AccountService.resume('tok-bad');
    assert.equal(expired.ok, false);
    assert.match(expired.error, /过期/);
});

test('uploadSlot 携带会话 token 定向 POST 到对应槽位；未登录直接跳过', async () => {
    const calls = fresh({ [AUTH_KEY]: JSON.stringify({ token: 'tok-x', account: '丙' }) });
    let n = 0;
    AccountService.transport = makeTransport({
        'POST /api/profiles/1': () => { n++; return { status: 200, json: { ok: true } }; },
    }, calls);
    await AccountService.uploadSlot(1, { totalRuns: 9 });
    assert.equal(n, 1);
    assert.equal(calls[0].token, 'tok-x');
    // 未登录（无会话）：不上传也不报错（游客离线）
    AccountService.clearSession();
    await AccountService.uploadSlot(1, { totalRuns: 9 });
    assert.equal(n, 1, '游客离线不得上传');
});

test('逐槽合并决策 mergeAction：谁新谁赢，双边为空不动', () => {
    assert.equal(mergeAction(false, false, 0, 0), 'none');
    assert.equal(mergeAction(true, false, 100, 0), 'upload', '只有本地→上传备份');
    assert.equal(mergeAction(false, true, 0, 100), 'download', '只有服务器→下载恢复');
    assert.equal(mergeAction(true, true, 200, 100), 'upload', '本地较新→上传');
    assert.equal(mergeAction(true, true, 100, 200), 'download', '服务器较新→下载');
    assert.equal(mergeAction(true, true, 100, 100), 'upload', '平局时保守取本地');
});
