import { base64UrlToBytes, bytesToBase64Url } from "./base64url";

/** 把值密封成（并从中解封）AES-GCM 加密、URL 安全的字符串。 */
export interface Codec<T> {
  seal(data: T): Promise<string>;
  open(token: string): Promise<T | null>;
}

/** codec 载荷校验契约（zod safeParse 兼容）。 */
export interface CodecSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const IV_LENGTH = 12;
const VERSION = 1;

// HKDF 以 usage 为 info 做用途分离：同一 secret 派生出的 session/handshake 密钥互不可解。
async function deriveKey(secret: string, usage: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("jc-abp-auth-codec-v1"),
      info: new TextEncoder().encode(usage),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * 创建绑定 secret 与 schema 的加密 codec；secret 短于 32 字符同步抛错，
 * `usage` 必填并参与密钥派生（不同用途的密文互不可解），open 在任何篡改/版本/格式/解密/形状失败时返回 null。
 */
export function createCodec<T>(
  secret: string,
  schema: CodecSchema<T>,
  opts: { usage: string; onError?: (error: unknown) => void },
): Codec<T> {
  if (secret.length < 32) throw new Error("codec secret must be at least 32 characters");
  const keyPromise = deriveKey(secret, opts.usage);
  return {
    async seal(data) {
      const key = await keyPromise;
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      const plaintext = new TextEncoder().encode(JSON.stringify(data));
      const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
      );
      const combined = new Uint8Array(1 + iv.length + ciphertext.length);
      combined[0] = VERSION;
      combined.set(iv, 1);
      combined.set(ciphertext, 1 + iv.length);
      return bytesToBase64Url(combined);
    },
    async open(token) {
      try {
        const key = await keyPromise;
        const combined = base64UrlToBytes(token);
        if (combined.length <= 1 + IV_LENGTH || combined[0] !== VERSION) return null;
        const iv = Uint8Array.from(combined.slice(1, 1 + IV_LENGTH));
        const ciphertext = Uint8Array.from(combined.slice(1 + IV_LENGTH));
        const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
        const parsed = schema.safeParse(JSON.parse(new TextDecoder().decode(plaintext)));
        if (parsed.success) return parsed.data;
        opts.onError?.(new Error("codec payload failed schema validation"));
        return null;
      } catch (error) {
        opts.onError?.(error);
        return null;
      }
    },
  };
}
