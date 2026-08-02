import { createAbpAuthRuntime } from "@jcoder-stack/abp-react/proxy";

/**
 * auth 策略声明。本目录你唯一需要改的文件。
 * 默认即现行为；每个覆盖项都有默认值，取消注释即生效。
 */
export const createRuntime = () =>
  createAbpAuthRuntime(process.env, {
    // 覆盖会话 cookie（默认名 "auth_session"，寿命 7 天）：
    // cookies: { session: { name: "myapp_session", maxAge: 60 * 60 * 24 * 14 } },
    // 只留 OIDC、关掉 password 策略（默认两者都开）：
    // strategies: { password: false },
    // 覆盖 IdP 登出后回跳（默认取 AUTH_POST_LOGOUT_REDIRECT_URI）：
    // postLogoutRedirectUri: "https://app.example/goodbye",
  });
