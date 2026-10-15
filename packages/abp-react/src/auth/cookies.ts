/** Set-Cookie 属性；httpOnly/secure 默认 true，SameSite 默认 Lax，Path 默认 /。 */
export interface CookieOptions {
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
}

// 名字不经任何转义直接拼进头，含 ';'/'='/换行即可注入 cookie 属性；RFC 6265 的 token 字符集把这条路封死。
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * 以安全默认序列化一条 Set-Cookie；值做 URL 编码。
 * name 不合 RFC 6265 token 字符集、或 `SameSite=None` 未配 Secure（浏览器会静默丢弃）时抛错。
 */
export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  if (!COOKIE_NAME_PATTERN.test(name)) {
    throw new Error(`invalid cookie name: ${JSON.stringify(name)}`);
  }
  const sameSite = opts.sameSite ?? "Lax";
  if (sameSite === "None" && opts.secure === false) {
    throw new Error("SameSite=None requires Secure");
  }
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? "/"}`];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.secure !== false) parts.push("Secure");
  parts.push(`SameSite=${sameSite}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

/** 立即过期指定 cookie 的 Set-Cookie。 */
export function clearCookie(name: string, opts: CookieOptions = {}): string {
  return serializeCookie(name, "", { ...opts, maxAge: 0 });
}

/** 解析 Cookie 请求头为 name→value；按第一个 '=' 切分，容忍坏编码。 */
export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const raw = part.slice(eq + 1);
    try {
      out[part.slice(0, eq).trim()] = decodeURIComponent(raw);
    } catch {
      out[part.slice(0, eq).trim()] = raw;
    }
  }
  return out;
}

/**
 * 把一批 Set-Cookie 按序叠加到 Cookie 请求头上，得出浏览器收下这些响应头后会带回来的 Cookie 头。
 * `Max-Age<=0` 视为删除；值保持编码原样。同一请求内二次写会话（如过期刷新后又遇 401 再刷新）时，
 * 把结果交给第二次的 `existing`，它才清得掉第一次刚写下的更高序号分块。全部删光时返回 null。
 */
export function applySetCookies(
  cookieHeader: string | null | undefined,
  setCookies: readonly string[],
): string | null {
  if (setCookies.length === 0) return cookieHeader ?? null;
  const jar = new Map<string, string>();
  for (const part of (cookieHeader ?? "").split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1));
  }
  for (const cookie of setCookies) {
    const [pair = "", ...attrs] = cookie.split(/;\s*/);
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const maxAge = attrs.find((attr) => /^max-age=/i.test(attr));
    if (maxAge !== undefined && Number(maxAge.slice("max-age=".length)) <= 0) jar.delete(name);
    else jar.set(name, pair.slice(eq + 1));
  }
  if (jar.size === 0) return null;
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

/** 单块 cookie 值序列化（`encodeURIComponent`）后的最大字节数；连同名字与属性保持在浏览器 4096 限制之下。 */
export const COOKIE_CHUNK_SIZE = 3600;

// serializeCookie 会 encodeURIComponent，一个非 ASCII 码点最多膨胀到 12 字节；按编码后长度累加切分，
// 既保证每块序列化后不超限，也不会把代理对拆成两半（for...of 按码点遍历）。
function splitByEncodedLength(value: string, limit: number): string[] {
  const chunks: string[] = [];
  let chunk = "";
  let encodedLength = 0;
  for (const char of value) {
    const charLength = encodeURIComponent(char).length;
    if (chunk !== "" && encodedLength + charLength > limit) {
      chunks.push(chunk);
      chunk = "";
      encodedLength = 0;
    }
    chunk += char;
    encodedLength += charLength;
  }
  if (chunk !== "") chunks.push(chunk);
  return chunks;
}

/**
 * 可能超长的值的 Set-Cookie 序列：编码后装得下用单 cookie，否则切成 name.0..n。
 * 总是多清一个尾块；传入 `existing`（请求携带的 cookie）时还清掉本次未覆写的全部旧块，
 * 块数骤减时防止残块以 maxAge 存活、膨胀后续请求头。
 */
export function chunkCookieValue(
  name: string,
  value: string,
  opts: CookieOptions = {},
  existing?: Record<string, string>,
): string[] {
  const cookies: string[] = [];
  const fresh = new Set<string>();
  let chunkCount = 0;
  const chunks = splitByEncodedLength(value, COOKIE_CHUNK_SIZE);
  if (chunks.length <= 1) {
    cookies.push(serializeCookie(name, value, opts));
    fresh.add(name);
  } else {
    cookies.push(clearCookie(name, opts));
    for (const chunk of chunks) {
      const chunkName = `${name}.${chunkCount}`;
      cookies.push(serializeCookie(chunkName, chunk, opts));
      fresh.add(chunkName);
      chunkCount++;
    }
  }
  const cleared = new Set(fresh.has(name) ? [] : [name]);
  const clearOnce = (chunkName: string) => {
    if (fresh.has(chunkName) || cleared.has(chunkName)) return;
    cleared.add(chunkName);
    cookies.push(clearCookie(chunkName, opts));
  };
  clearOnce(`${name}.${chunkCount}`);
  if (existing !== undefined) {
    const chunkPattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+$`);
    for (const key of Object.keys(existing)) {
      if (chunkPattern.test(key)) clearOnce(key);
    }
  }
  return cookies;
}

/** 读可能分块的 cookie：整名优先，否则拼 name.0..n 直到出现空档。 */
export function readChunkedCookie(
  cookies: Record<string, string>,
  name: string,
): string | undefined {
  const whole = cookies[name];
  if (whole !== undefined) return whole;
  let value = "";
  for (let index = 0; ; index++) {
    const part = cookies[`${name}.${index}`];
    if (part === undefined) break;
    value += part;
  }
  return value === "" ? undefined : value;
}

/** 清除基名与请求中出现的每个分块。 */
export function clearChunkedCookie(
  name: string,
  cookies: Record<string, string>,
  opts: CookieOptions = {},
): string[] {
  const out = [clearCookie(name, opts)];
  for (let index = 0; ; index++) {
    if (cookies[`${name}.${index}`] === undefined) break;
    out.push(clearCookie(`${name}.${index}`, opts));
  }
  return out;
}
