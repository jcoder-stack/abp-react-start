import { z } from "zod";

/** Plain text, or a localization key resolved in the browser so each recipient sees their own language. */
export type LocalizableText =
  | string
  | { key: string; resource?: string; args?: Record<string, string> };

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  severity: NotificationSeverity;
  title: LocalizableText;
  message?: LocalizableText;
  url?: string;
}

/** Same-origin paths only: `//host` and `/\host` are protocol-relative in browsers, i.e. an open redirect. */
export function isSafeRelativeUrl(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
}

const localizableText = z.union([
  z.string(),
  z.object({
    key: z.string().min(1),
    resource: z.string().optional(),
    args: z.record(z.string(), z.string()).optional(),
  }),
]);

const notificationSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "success", "warning", "error"]).catch("info"),
  title: localizableText,
  message: localizableText.optional().catch(undefined),
  url: z.string().refine(isSafeRelativeUrl).optional().catch(undefined),
});

/**
 * Tolerant parse of a `ReceiveNotification` payload: an unknown severity becomes info and a bad
 * message or url is dropped, but without an id and a title there is nothing to show (null).
 */
export function parseNotification(raw: unknown): AppNotification | null {
  const parsed = notificationSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { id, severity, title, message, url } = parsed.data;
  return {
    id,
    severity,
    title,
    ...(message === undefined ? {} : { message }),
    ...(url === undefined ? {} : { url }),
  };
}

export function localizeText(
  text: LocalizableText,
  L: (key: string, ...args: unknown[]) => string,
): string {
  if (typeof text === "string") return text;
  const key = text.resource === undefined ? text.key : `${text.resource}::${text.key}`;
  return text.args === undefined ? L(key) : L(key, text.args);
}
