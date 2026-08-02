import { describe, expect, it } from "vitest";
import { base64UrlToBytes, bytesToBase64Url } from "../../src/auth/base64url";
import { createCodec } from "../../src/auth/codec";
import { authSessionSchema } from "../../src/auth/types";

const SECRET = "0123456789abcdef0123456789abcdef";
const session = { tokens: { accessToken: "at" }, expiresAt: 123, tenant: "t1", culture: "zh-Hans" };

describe("createCodec", () => {
  it("seal → open round-trips the payload", async () => {
    const codec = createCodec(SECRET, authSessionSchema, { usage: "session" });
    expect(await codec.open(await codec.seal(session))).toEqual(session);
  });

  it("returns null on tampered ciphertext", async () => {
    const codec = createCodec(SECRET, authSessionSchema, { usage: "session" });
    const sealed = await codec.seal(session);
    expect(await codec.open(`${sealed.slice(0, -2)}xx`)).toBeNull();
  });

  it("returns null when opened with a different secret", async () => {
    const sealed = await createCodec(SECRET, authSessionSchema, { usage: "session" }).seal(session);
    const other = createCodec("another-secret-another-secret-32", authSessionSchema, {
      usage: "session",
    });
    expect(await other.open(sealed)).toBeNull();
  });

  it("returns null and reports when payload fails schema validation", async () => {
    const looseCodec = createCodec(
      SECRET,
      { safeParse: (v: unknown) => ({ success: true as const, data: v }) },
      { usage: "session" },
    );
    const sealed = await looseCodec.seal({ not: "a session" });
    const errors: unknown[] = [];
    const codec = createCodec(SECRET, authSessionSchema, {
      usage: "session",
      onError: (e) => errors.push(e),
    });
    expect(await codec.open(sealed)).toBeNull();
    expect(errors).toHaveLength(1);
  });

  it("returns null on garbage input", async () => {
    const codec = createCodec(SECRET, authSessionSchema, { usage: "session" });
    expect(await codec.open("not-base64url-!!")).toBeNull();
  });

  it("rejects a secret shorter than 32 characters synchronously", () => {
    expect(() => createCodec("short", authSessionSchema, { usage: "session" })).toThrow(
      /at least 32/,
    );
  });

  it("returns null when a token sealed for one usage is opened by another", async () => {
    const sessionCodec = createCodec(SECRET, authSessionSchema, { usage: "session" });
    const handshakeCodec = createCodec(SECRET, authSessionSchema, { usage: "handshake" });
    const sealed = await sessionCodec.seal(session);
    expect(await handshakeCodec.open(sealed)).toBeNull();
    expect(await sessionCodec.open(sealed)).toEqual(session);
  });

  // AES-GCM 下同一密钥复用 IV 会同时泄露明文与认证密钥，属灾难级后果，值得锁死。
  it("uses a fresh IV for every seal", async () => {
    const codec = createCodec(SECRET, authSessionSchema, { usage: "session" });
    const ivOf = async () =>
      base64UrlToBytes(await codec.seal(session))
        .slice(1, 13)
        .join(",");
    const ivs = new Set(await Promise.all(Array.from({ length: 20 }, ivOf)));
    expect(ivs.size).toBe(20);
  });

  it("returns null when the version byte is unknown", async () => {
    const codec = createCodec(SECRET, authSessionSchema, { usage: "session" });
    const bytes = base64UrlToBytes(await codec.seal(session));
    bytes[0] = 99;
    expect(await codec.open(bytesToBase64Url(bytes))).toBeNull();
  });
});
