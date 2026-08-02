import { z } from "zod";

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  idToken: z.string().optional(),
});

/** 认证会话：token 集 + 绝对过期（ms）+ 租户/文化上下文。绝密，server-only。 */
export const authSessionSchema = z.object({
  tokens: authTokensSchema,
  expiresAt: z.number().optional(),
  tenant: z.string().nullable().optional(),
  culture: z.string().nullable().optional(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

/** 身份视图：可注水到客户端；结构上不含 token。授权判定仍在后端，这里只是能力转述。 */
export interface Identity {
  isAuthenticated: boolean;
  user: { id: string; userName: string; email?: string; roles: string[] } | null;
  grantedPolicies: Record<string, boolean>;
  tenant: { id: string; name: string | null } | null;
}

/** 策略统一产出：SessionManager.establish 的输入。expiresAt 缺省表示 IdP 未返回 expires_in。 */
export interface TokenResult {
  tokens: { accessToken: string; refreshToken?: string; idToken?: string };
  expiresAt?: number;
}

export interface BeginInput {
  returnUrl: string;
  tenant?: string | null;
}

/**
 * 重定向式握手暂存态：适配层密封进短命 cookie，callback 时开出交还策略。
 * `issuedAt`（ms）让策略在服务端判寿命。只靠 cookie 的 maxAge 是浏览器侧约束，密文本身不会因此失效。
 */
export const handshakeSchema = z.object({
  state: z.string(),
  nonce: z.string(),
  codeVerifier: z.string(),
  returnUrl: z.string(),
  issuedAt: z.number(),
});
export type Handshake = z.infer<typeof handshakeSchema>;

export type CompleteInput =
  | { kind: "callback"; params: URLSearchParams; handshake: Handshake }
  | { kind: "credentials"; userName: string; password: string; tenant?: string | null };

/** 一个登录策略：证明你是谁 → 产出 TokenResult。协议细节内化在实现里。 */
export interface AuthStrategy {
  readonly name: string;
  begin?(input: BeginInput): Promise<{ redirectUrl: string; handshake: Handshake }>;
  complete(input: CompleteInput): Promise<TokenResult>;
}

/** 存储 seam：默认实现是加密分块 cookie（自包含）；有状态 store 只需换实现。save/clear 需要请求 Cookie 头才能清掉当前存在的所有旧分块（save 不传则只多清一个尾块）。 */
export interface SessionStore {
  load(cookieHeader: string | null): Promise<AuthSession | null>;
  save(session: AuthSession, cookieHeader?: string | null): Promise<string[]>;
  clear(cookieHeader: string | null): Promise<string[]>;
}

/** 身份解析的请求上下文；`cookieHeader` 携带匿名访客的租户/文化选择，无请求上下文时传 null。 */
export interface IdentityContext {
  cookieHeader: string | null;
}

/**
 * 后端无关的身份解析 seam；ABP 实现在 proxy 域经代理拉 application-configuration。
 * 权限与本地化随租户变化，故解析必须能看到请求上下文，只认 session 的实现会把匿名访客
 * 一律按 host 租户解析。
 */
export type IdentityResolver = (
  session: AuthSession | null,
  ctx: IdentityContext,
) => Promise<Identity>;

export type FetchFn = typeof fetch;
