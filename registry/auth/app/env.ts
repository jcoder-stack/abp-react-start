import { createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";

// AUTH_* 必需 env 由 @jcoder/abp-react/proxy 的 resolveAbpAuthEnv 校验，勿在此重复。
const serverEnvSchema = z.object({
  // 按需加应用自己的 server 变量，例：STRIPE_SECRET_KEY: z.string().min(1),
});

const clientEnvSchema = z.object({
  VITE_APP_TITLE: z.string().default("ABP React Start"),
});

/** 应用自有 server env；每次调用重新读取，边缘运行时的 env 按请求注入，不可缓存。 */
export const getServerEnv = createServerOnlyFn(() => serverEnvSchema.parse(process.env));

/** 应用自有公开 env；VITE_ 前缀构建期内联，SSR 与浏览器两端可读，勿放机密。 */
export const clientEnv = clientEnvSchema.parse(import.meta.env);
