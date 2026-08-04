import type { z } from "zod";
import {
  type Auth,
  type Codec,
  type CookieOptions,
  createAuth,
  createCodec,
  createCookieSessionStore,
  createTokenClient,
  type FetchFn,
  type Handshake,
  handshakeSchema,
  type IdentityResolver,
  type OidcStrategy,
  oidcStrategy,
  passwordStrategy,
} from "../auth";
import { createLogger, type Logger, resolveConfig } from "../logger";
import type { AbpCallRuntime } from "./abp-call";
import { TENANT_COOKIE } from "./abp-call";
import { createAbpIdentityResolver } from "./abp-identity";
import { type AbpAuthEnv, resolveAbpAuthEnv } from "./auth-env";
import { type AbpProxy, createAbpProxy } from "./proxy";
import { installExtraCa } from "./tls-trust";

/** 加密会话 cookie（httpOnly）默认名，装密封的 AuthSession（超长分块）。 */
export const DEFAULT_SESSION_COOKIE = "auth_session";
/** 短命握手 cookie（httpOnly）默认名，装 authorize↔callback 之间的密封 Handshake。 */
export const DEFAULT_LOGIN_COOKIE = "auth_login";
/** 会话 cookie 默认寿命（7 天）；调整时与 IdP refresh token 寿命对齐。 */
export const DEFAULT_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
/** 握手 cookie 默认寿命（10 分钟），只需活过 IdP 往返。 */
export const DEFAULT_LOGIN_COOKIE_MAX_AGE = 600;
/** 租户/文化切换 cookie 寿命（1 年）；ASP.NET/ABP 协议约定，非应用策略，故非选项。 */
export const SWITCH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** 一张 auth cookie 的名字、寿命与浏览器投递属性；`secure`/`sameSite` 省略即 `true`/`Lax`。 */
export interface AuthCookieSettings {
  name: string;
  maxAge: number;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
}

/** 运行时携带的 cookie 配置，供 handler 读取（会话 + 握手两张）。 */
export interface AuthCookieConfig {
  session: AuthCookieSettings;
  login: AuthCookieSettings;
}

/** 取一张 auth cookie 的浏览器投递属性；名字与寿命由调用点自己给。 */
export function cookieAttributesOf(settings: AuthCookieSettings): CookieOptions {
  return { secure: settings.secure, sameSite: settings.sameSite };
}

/** auth 模块的进程级运行时：装配根。env→logger 在此兑现（AUTH_DEBUG → debug 级）。 */
export interface AuthRuntime {
  env: AbpAuthEnv;
  auth: Auth;
  proxy: AbpProxy;
  oidc: OidcStrategy;
  handshakeCodec: Codec<Handshake>;
  logger: Logger;
  cookies: AuthCookieConfig;
  /** IdP 登出后回跳地址（默认取 AUTH_POST_LOGOUT_REDIRECT_URI）。 */
  postLogoutRedirectUri?: string;
}

export interface AbpAuthRuntimeOptions {
  fetchFn?: FetchFn;
  now?: () => number;
  logger?: Logger;
  /** 覆盖 AUTH_* env 解析用的 zod schema（默认 `abpAuthEnvSchema`）；解析产物必须仍是 AbpAuthEnv。 */
  envSchema?: z.ZodType<AbpAuthEnv>;
  /**
   * 覆盖 cookie 名/寿命/投递属性（会话默认 "auth_session"/7 天；握手默认 "auth_login"/10 分钟）。
   * `secure: false` 只用于非 localhost 的 http 预览环境。浏览器会静默丢弃 http 下的 Secure cookie。
   */
  cookies?: {
    session?: Partial<AuthCookieSettings>;
    login?: Partial<AuthCookieSettings>;
  };
  /** 覆盖代理网关的超时与重试（默认 30s 单次超时、幂等请求重试 2 次、无总预算）。 */
  proxy?: { timeoutMs?: number; retries?: number; totalTimeoutMs?: number };
  /** 覆盖会话引擎调优项（默认 60s 过期宽限、10s 刷新合并窗口、2s 撤销超时）。 */
  session?: { skewSeconds?: number; coalesceTtlMs?: number; revokeTimeoutMs?: number };
  /** 覆盖 IdP 登出后回跳地址（默认取 AUTH_POST_LOGOUT_REDIRECT_URI）。 */
  postLogoutRedirectUri?: string;
  /** 策略启停（默认 oidc 与 password 都开）。 */
  strategies?: { oidc?: boolean; password?: boolean };
  /** 替换身份解析器（默认从 ABP application-configuration 派生）。 */
  resolveIdentity?: IdentityResolver;
}

/**
 * 装配 auth 运行时：strategies（OIDC/password）+ 会话层（加密分块 cookie）+ ABP 代理 +
 * 身份解析。默认即现行为，`opts` 只传覆盖项。
 */
export function createAbpAuthRuntime(
  envRecord: Record<string, string | undefined>,
  opts: AbpAuthRuntimeOptions = {},
): AuthRuntime {
  let env: AbpAuthEnv;
  try {
    env = resolveAbpAuthEnv(envRecord, { schema: opts.envSchema });
  } catch (error) {
    // 常规 logger 要等 env 解析出 debug 开关才建；这条失败必须落日志（错误页可能被用户忽略），
    // 用默认配置的后备 logger 补位。
    const fallback = opts.logger ?? createLogger({ scope: "auth", config: resolveConfig({}) });
    fallback.error("auth env resolution failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  const cookies: AuthCookieConfig = {
    session: {
      ...opts.cookies?.session,
      name: opts.cookies?.session?.name ?? DEFAULT_SESSION_COOKIE,
      maxAge: opts.cookies?.session?.maxAge ?? DEFAULT_SESSION_COOKIE_MAX_AGE,
    },
    login: {
      ...opts.cookies?.login,
      name: opts.cookies?.login?.name ?? DEFAULT_LOGIN_COOKIE,
      maxAge: opts.cookies?.login?.maxAge ?? DEFAULT_LOGIN_COOKIE_MAX_AGE,
    },
  };
  // logger 注入口同时是「日志红线」测试的观测点（memory sink 断言 token 永不落日志）。
  const logger =
    opts.logger ??
    createLogger({
      scope: "auth",
      config: resolveConfig({ LOG_LEVEL: env.debug ? "debug" : "info" }),
    });
  if (env.extraCaFile !== undefined) {
    // 在第一笔上游请求之前装：运行时单例化保证这里最多跑一次，helper 自身也幂等。
    const outcome = installExtraCa(env.extraCaFile);
    if (outcome === "unsupported") {
      logger.warn(
        "AUTH_EXTRA_CA_FILE is set but this runtime lacks tls.setDefaultCACertificates " +
          "(Node >= 22.15 required); falling back — start the process with NODE_EXTRA_CA_CERTS instead",
        { caFile: env.extraCaFile },
      );
    } else {
      logger.info("extra CA certificate trusted for upstream TLS", {
        caFile: env.extraCaFile,
        outcome,
      });
    }
  }
  const tokenClient = createTokenClient({
    issuer: env.issuer,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    scope: env.scope,
    fetchFn: opts.fetchFn,
    logger,
    // `__tenant` 是 ABP 的多租户约定，不属于 OIDC 协议，由这层注入，协议客户端保持后端无关。
    tenantPropagation: (tenant) => ({
      headers: { [TENANT_COOKIE]: tenant },
      query: { [TENANT_COOKIE]: tenant },
    }),
  });
  const oidc = oidcStrategy({
    tokenClient,
    redirectUri: env.redirectUri,
    now: opts.now,
    logger,
    // 服务端寿命跟着握手 cookie 的 maxAge 走，两者错开会让延长 cookie 寿命变成静默的 handshake_expired。
    handshakeMaxAgeSeconds: cookies.login.maxAge,
  });
  const strategies = [];
  if (opts.strategies?.oidc !== false) strategies.push(oidc);
  if (opts.strategies?.password !== false)
    strategies.push(passwordStrategy({ tokenClient, now: opts.now, logger }));
  const proxy = createAbpProxy({
    baseUrl: env.abpBaseUrl,
    fetchFn: opts.fetchFn,
    timeoutMs: opts.proxy?.timeoutMs,
    retry: opts.proxy?.retries === undefined ? undefined : { retries: opts.proxy.retries },
    totalTimeoutMs: opts.proxy?.totalTimeoutMs,
    logger,
  });
  // 身份解析要经会话层，而会话层此刻正在构造中，getter 把这一环推迟到首次解析时读取，
  // 无需先造一个类型说谎的空 runtime。
  const callRuntime: AbpCallRuntime = {
    proxy,
    logger,
    get auth() {
      return auth;
    },
  };
  const auth = createAuth({
    strategies,
    store: createCookieSessionStore({
      secret: env.sessionSecret,
      cookieName: cookies.session.name,
      maxAge: cookies.session.maxAge,
      cookieOptions: cookieAttributesOf(cookies.session),
      logger,
    }),
    resolveIdentity: opts.resolveIdentity ?? createAbpIdentityResolver(() => callRuntime),
    refreshGrant: tokenClient.refreshGrant,
    revoke: tokenClient.revoke,
    logger,
    now: opts.now,
    skewSeconds: opts.session?.skewSeconds,
    coalesceTtlMs: opts.session?.coalesceTtlMs,
    revokeTimeoutMs: opts.session?.revokeTimeoutMs,
  });
  return {
    env,
    auth,
    oidc,
    proxy,
    handshakeCodec: createCodec<Handshake>(env.sessionSecret, handshakeSchema, {
      usage: "handshake",
      onError: (error) => logger.debug("handshake cookie open failed", { error: String(error) }),
    }),
    logger,
    cookies,
    postLogoutRedirectUri: opts.postLogoutRedirectUri ?? env.postLogoutRedirectUri,
  };
}
