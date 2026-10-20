// ============================================================
//  AccountService.ts — 存档服务器账号体系（登录/注册/档案同步）
// ============================================================
// 方案 B（docs/存档服务器提案-2026-10-20.md）客户端侧：
//   · register/login/resume（token 自动登录）→ 服务器账号体系；
//   · fetchProfiles/uploadSlot → 档案镜像同步（游戏内 SaveSystem 照常
//     本地读写，落盘后由 GameManager 接线异步上传，last-write-wins）；
//   · mergeAction：逐槽合并决策（本地/服务器谁新谁赢）——登录成功后
//     逐槽执行，保证设备上已有的档案数据不丢失。
// 纯逻辑无 cc 依赖：transport（HTTP）与 storage（token 存留）均可注入，
// headless 测试注入 fake transport 即可。默认走 fetch + localStorage。

export interface AuthSession { token: string; account: string; }

export interface AuthResult {
    ok: boolean;
    error?: string;
    /** 登录/注册成功时：服务器返回的 3 档案槽（profile JSON 原样，空槽 null）。 */
    slots?: (Record<string, unknown> | null)[];
}

export interface AuthStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export type AuthTransport = (
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    token?: string | null,
) => Promise<{ status: number; json: any }>;

export const AUTH_KEY = 'hexblast_auth_v2';

const _memStore: Record<string, string> = {};

function defaultStorage(): AuthStorage {
    try {
        const ls = (globalThis as any).localStorage;
        if (ls) return ls as AuthStorage;
    } catch (_e) { /* 非浏览器环境 */ }
    return {
        getItem: (k: string) => (k in _memStore ? _memStore[k] : null),
        setItem: (k: string, v: string) => { _memStore[k] = v; },
        removeItem: (k: string) => { delete _memStore[k]; },
    };
}

function defaultBaseUrl(): string {
    try {
        if (typeof location !== 'undefined' && location.hostname) {
            // 与游戏页面同 host：局域网 IP 访问时自动指向局域网服务器
            return `http://${location.hostname}:7460`;
        }
    } catch (_e) { /* 非浏览器环境 */ }
    return 'http://localhost:7460';
}

async function defaultTransport(
    method: 'GET' | 'POST', path: string, body: unknown, token: string | null,
): Promise<{ status: number; json: any }> {
    const res = await fetch(this.baseUrl + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* 空响应体 */ }
    return { status: res.status, json };
}

/** 逐槽合并决策：只有本地→上传；只有服务器→下载；都有→谁新谁赢；都没有→不动。 */
export function mergeAction(
    hasLocal: boolean, hasServer: boolean,
    localUpdatedAt: number, serverUpdatedAt: number,
): 'upload' | 'download' | 'none' {
    if (hasLocal && !hasServer) return 'upload';
    if (!hasLocal && hasServer) return 'download';
    if (!hasLocal && !hasServer) return 'none';
    return localUpdatedAt >= serverUpdatedAt ? 'upload' : 'download';
}

export class AccountService {
    static baseUrl = defaultBaseUrl();
    /** 可注入传输层（默认 fetch）；this 绑定类以读取 baseUrl。 */
    static transport: AuthTransport = defaultTransport;
    static storage: AuthStorage = defaultStorage();

    static get session(): AuthSession | null {
        try {
            const raw = this.storage.getItem(AUTH_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            return s?.token && s?.account ? { token: s.token, account: s.account } : null;
        } catch { return null; }
    }

    static setSession(s: AuthSession): void {
        try { this.storage.setItem(AUTH_KEY, JSON.stringify(s)); } catch { /* 存储失败忽略 */ }
    }

    static clearSession(): void {
        try { this.storage.removeItem(AUTH_KEY); } catch { /* 忽略 */ }
    }

    private static async _authPost(
        path: string, body: Record<string, unknown>,
    ): Promise<AuthResult> {
        try {
            const { status, json } = await this.transport('POST', path, body, null);
            if (status === 200 && json?.token) {
                const session: AuthSession = { token: json.token, account: json.account ?? body.account };
                this.setSession(session);
                return { ok: true, slots: json.profiles?.slots ?? [] };
            }
            return { ok: false, error: json?.error ?? `请求失败（${status}）` };
        } catch {
            return { ok: false, error: '无法连接存档服务器，可先用「游客离线」' };
        }
    }

    /** 注册新账号（服务器从空档案开始；本地旧档由调用方逐槽合并上传）。 */
    static async register(account: string, password: string): Promise<AuthResult> {
        return this._authPost('/api/register', { account: account.trim(), password });
    }

    static async login(account: string, password: string): Promise<AuthResult> {
        return this._authPost('/api/login', { account: account.trim(), password });
    }

    /** token 自动登录：成功返回服务器档案槽；401 视为过期。 */
    static async resume(token: string): Promise<AuthResult> {
        try {
            const { status, json } = await this.transport('GET', '/api/profiles', undefined, token);
            if (status === 200) return { ok: true, slots: json?.profiles?.slots ?? [] };
            return { ok: false, error: status === 401 ? '登录已过期' : `请求失败（${status}）` };
        } catch {
            return { ok: false, error: '无法连接存档服务器' };
        }
    }

    /** 上传单槽档案（镜像同步；需要已登录）。 */
    static async uploadSlot(slot: number, profile: Record<string, unknown>): Promise<void> {
        const session = this.session;
        if (!session) return;
        await this.transport('POST', `/api/profiles/${Math.max(0, Math.min(2, slot))}`, profile, session.token);
    }

    /** 登出（吊销服务器 token + 清本地会话）。 */
    static async logout(): Promise<void> {
        const session = this.session;
        if (session) {
            try { await this.transport('POST', '/api/logout', {}, session.token); } catch { /* 忽略 */ }
        }
        this.clearSession();
    }
}
