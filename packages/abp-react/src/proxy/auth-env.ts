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
  /** 额外信任的 CA 证书路径（PEM）；本地 ABP 自签证书场景用，见 installExtraCa。 */
  extraCaFile: z.string().optional(),
});
export type AbpAuthEnv = z.infer<typeof abpAuthEnvSchema>;

/** schema 字段名 → 环境变量名；报错要指认用户在 .env 里实际写的名字，不是内部字段。 */
const ENV_NAMES: Record<string, string> = {
  issuer: "AUTH_ISSUER",
  clientId: "AUTH_CLIENT_ID",
  clientSecret: "AUTH_CLIENT_SECRET",
  scope: "AUTH_SCOPE",
  redirectUri: "AUTH_REDIRECT_URI",
  postLogoutRedirectUri: "AUTH_POST_LOGOUT_REDIRECT_URI",
  sessionSecret: "AUTH_SESSION_SECRET",
  abpBaseUrl: "AUTH_ABP_BASE_URL",
  debug: "AUTH_DEBUG",
  extraCaFile: "AUTH_EXTRA_CA_FILE",
};

function describeIssues(error: z.ZodError, raw: Record<string, unknown>): string {
  return error.issues
    .map((issue) => {
      const field = String(issue.path[0] ?? "");
      const name = ENV_NAMES[field] ?? field;
      const value = raw[field];
      const detail = value === undefined || value === "" ? "not set" : issue.message;
      return `${name} (${detail})`;
    })
    .join(", ");
}

/**
 * 把 AUTH_* 记录解析成 AbpAuthEnv。
 * 缺失/不合法时抛聚合后的人话错误（点名 .env 里的变量名），原始 ZodError 挂在 `cause` 上。
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
  const raw = {
    issuer: env.AUTH_ISSUER,
    clientId: env.AUTH_CLIENT_ID,
    clientSecret: env.AUTH_CLIENT_SECRET,
    scope: env.AUTH_SCOPE,
    redirectUri: env.AUTH_REDIRECT_URI,
    postLogoutRedirectUri: env.AUTH_POST_LOGOUT_REDIRECT_URI,
    sessionSecret: env.AUTH_SESSION_SECRET,
    abpBaseUrl: env.AUTH_ABP_BASE_URL,
    debug: env.AUTH_DEBUG === "true",
    // `AUTH_EXTRA_CA_FILE=` 的空值行等同未设置，不能拿空串去 readFileSync。
    extraCaFile: env.AUTH_EXTRA_CA_FILE === "" ? undefined : env.AUTH_EXTRA_CA_FILE,
  };
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new Error(
    `auth env is missing or invalid: ${describeIssues(parsed.error, raw)}. ` +
      "Fill these in the project's .env (start from .env.example — each variable is documented there).",
    { cause: parsed.error },
  );
}
