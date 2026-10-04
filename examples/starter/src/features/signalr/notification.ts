import { z } from "zod";

/**
 * Plain text, or a localization key resolved in the browser so each recipient sees their own language.
 * `resource` and `args` may be null: ASP.NET Core's SignalR JSON protocol serializes unset C# members as null.
 */
export type LocalizableText =
  | string
  | { key: string; resource?: string | null; args?: Record<string, string> | null };

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  severity: NotificationSeverity;
  title: LocalizableText;
  message?: LocalizableText;
  url?: string;
}

/**
 * Same-origin paths only: `//host` and `/\host` are protocol-relative in browsers, i.e. an open
 * redirect. Browsers also strip tab/CR/LF before parsing, so `/<tab>/host` is protocol-relative
 * too; any control character, space or DEL is therefore rejected.
 */
export function isSafeRelativeUrl(url: string): boolean {
  return (
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.startsWith("/\\") &&
    !hasControlOrSpace(url)
  );
}

function hasControlOrSpace(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

const localizableText = z.union([
  z.string(),
  z.object({
    key: z.string().min(1),
    resource: z.string().nullish(),
    args: z.record(z.string(), z.string()).nullish(),
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
  const key = text.resource == null ? text.key : `${text.resource}::${text.key}`;
  return text.args == null ? L(key) : L(key, text.args);
}
