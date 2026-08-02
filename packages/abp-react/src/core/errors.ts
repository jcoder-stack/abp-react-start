import { z } from "zod";

export interface AbpValidationError {
  message: string;
  members?: string[];
}

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly validationErrors?: AbpValidationError[];
  readonly body?: unknown;

  constructor(
    status: number,
    message: string,
    options?: { code?: string; validationErrors?: AbpValidationError[]; body?: unknown },
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = options?.code;
    this.validationErrors = options?.validationErrors;
    this.body = options?.body;
  }
}

function isAbpEnvelope(body: unknown): body is { error: Record<string, unknown> } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const error = (body as { error?: unknown }).error;
  return typeof error === "object" && error !== null;
}

// 上游未必守约（网关兜底页、旧版本 ABP、被中间件改写的信封）：`validationErrors: "boom"`
// 原样交出后，消费者一句 `.map()` 就炸在渲染层。形状不合格宁可当没有。
const validationErrorsSchema = z.array(
  z.object({
    message: z.string(),
    members: z
      .array(z.string())
      .nullish()
      .transform((members) => members ?? undefined),
  }),
);

function toValidationErrors(value: unknown): AbpValidationError[] | undefined {
  const parsed = validationErrorsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** 把上游响应体归一为 HttpError；ABP 错误信封的 message/code 会被提取，畸形 validationErrors 一律丢弃。 */
export function toHttpError(status: number, body: unknown): HttpError {
  if (isAbpEnvelope(body)) {
    const error = body.error as { code?: string; message?: string; validationErrors?: unknown };
    return new HttpError(status, error.message ?? `HTTP ${status}`, {
      code: error.code,
      validationErrors: toValidationErrors(error.validationErrors),
      body,
    });
  }
  return new HttpError(status, `HTTP ${status}`, { body });
}
