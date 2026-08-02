import { z } from "zod";

/** AUTH_* 环境变量解析后的配置；核心包不读 env，这里是唯一入口。 */
export const abpAuthEnvSchema = z.object({
  issuer: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  scope: z.string().default("openid profile"),
  redirectUri: z.string().url(),
  postLogoutRedirectUri: z.string().url().optional(),
  sessionSecret: z.string().min(32),
  abpBaseUrl: z.string().url(),
  debug: z.boolean().default(false),
});
export type AbpAuthEnv = z.infer<typeof abpAuthEnvSchema>;

/**
 * 把 AUTH_* 记录解析成 AbpAuthEnv。
 * @param env 通常是 process.env。
 * @param opts.schema 覆盖默认 zod schema（`abpAuthEnvSchema`），用于给 AUTH_* 契约加更严的
 *   校验/精化；解析产物必须仍是 AbpAuthEnv（类型系统兜底，故只能 `.extend()`/`.merge()` 等
 *   保持输出形状不变的方式收紧，例如
 *   `abpAuthEnvSchema.extend({ clientSecret: z.string().min(1) })`）。
 */
export function resolveAbpAuthEnv(
  env: Record<string, string | undefined>,
  opts: { schema?: z.ZodType<AbpAuthEnv> } = {},
): AbpAuthEnv {
  const schema = opts.schema ?? abpAuthEnvSchema;
  return schema.parse({
    issuer: env.AUTH_ISSUER,
    clientId: env.AUTH_CLIENT_ID,
    clientSecret: env.AUTH_CLIENT_SECRET,
    scope: env.AUTH_SCOPE,
    redirectUri: env.AUTH_REDIRECT_URI,
    postLogoutRedirectUri: env.AUTH_POST_LOGOUT_REDIRECT_URI,
    sessionSecret: env.AUTH_SESSION_SECRET,
    abpBaseUrl: env.AUTH_ABP_BASE_URL,
    debug: env.AUTH_DEBUG === "true",
  });
}
