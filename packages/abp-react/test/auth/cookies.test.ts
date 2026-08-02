import { describe, expect, it } from "vitest";
import {
  COOKIE_CHUNK_SIZE,
  chunkCookieValue,
  clearChunkedCookie,
  clearCookie,
  parseCookieHeader,
  readChunkedCookie,
  serializeCookie,
} from "../../src/auth/cookies";

describe("serializeCookie", () => {
  it("applies secure defaults (HttpOnly, Secure, SameSite=Lax, Path=/)", () => {
    expect(serializeCookie("a", "v")).toBe("a=v; Path=/; HttpOnly; Secure; SameSite=Lax");
  });

  it("can opt out of httpOnly and set maxAge", () => {
    expect(serializeCookie("a", "v", { httpOnly: false, maxAge: 60 })).toBe(
      "a=v; Path=/; Secure; SameSite=Lax; Max-Age=60",
    );
  });

  it("url-encodes the value", () => {
    expect(serializeCookie("a", "v w")).toContain("a=v%20w");
  });

  // 名字不经任何转义直接拼进 Set-Cookie，含 ';'/'='/换行即可注入属性。
  it("rejects a name outside the RFC 6265 token character set", () => {
    expect(() => serializeCookie("a=b; Domain", "v")).toThrow(/cookie name/);
    expect(() => serializeCookie("a\nb", "v")).toThrow(/cookie name/);
    expect(() => serializeCookie("", "v")).toThrow(/cookie name/);
    expect(() => serializeCookie(".AspNetCore.Culture", "v")).not.toThrow();
  });

  it("rejects SameSite=None without Secure (browsers drop that combination)", () => {
    expect(() => serializeCookie("a", "v", { sameSite: "None", secure: false })).toThrow(
      /SameSite=None/,
    );
    expect(serializeCookie("a", "v", { sameSite: "None" })).toContain("Secure; SameSite=None");
  });
});

describe("parseCookieHeader", () => {
  it("parses names and decodes values", () => {
    expect(parseCookieHeader("a=1; b=v%20w")).toEqual({ a: "1", b: "v w" });
  });

  it("tolerates bad encoding and empty header", () => {
    expect(parseCookieHeader("a=%E0%A4%A")).toEqual({ a: "%E0%A4%A" });
    expect(parseCookieHeader(null)).toEqual({});
  });
});

describe("chunking", () => {
  it("keeps a value at the chunk limit whole and clears the first chunk slot", () => {
    const value = "x".repeat(COOKIE_CHUNK_SIZE);
    const cookies = chunkCookieValue("s", value);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain(`s=${value}`);
    expect(cookies[1]).toContain("s.0=; ");
  });

  it("splits one byte over the limit into chunks and clears base + trailing slot", () => {
    const value = "x".repeat(COOKIE_CHUNK_SIZE + 1);
    const cookies = chunkCookieValue("s", value);
    expect(cookies[0]).toContain("s=; ");
    expect(cookies[1]).toContain(`s.0=${"x".repeat(COOKIE_CHUNK_SIZE)}`);
    expect(cookies[2]).toContain("s.1=x;");
    expect(cookies[3]).toContain("s.2=; ");
  });

  // serializeCookie 会 encodeURIComponent，非 ASCII 一个字符最多膨胀到 12 字节；
  // 按 UTF-16 长度切分会让单块序列化后远超浏览器的 4096 限制。
  it("keeps every emitted cookie within the limit for a non-ASCII value", () => {
    const value = "中🙂a".repeat(700);
    const cookies = chunkCookieValue("s", value);
    const jar: Record<string, string> = {};
    for (const cookie of cookies) {
      const pair = cookie.split("; ")[0] ?? "";
      const eq = pair.indexOf("=");
      const encoded = pair.slice(eq + 1);
      expect(encoded.length).toBeLessThanOrEqual(COOKIE_CHUNK_SIZE);
      if (encoded !== "") jar[pair.slice(0, eq)] = decodeURIComponent(encoded);
    }
    expect(readChunkedCookie(jar, "s")).toBe(value);
  });

  it("clears every stale chunk when a chunked value shrinks to a single cookie", () => {
    const existing = { "s.0": "a", "s.1": "b", "s.2": "c", "s.3": "d" };
    const cookies = chunkCookieValue("s", "short", {}, existing);
    expect(cookies.some((c) => c.startsWith("s=short"))).toBe(true);
    for (const stale of ["s.0", "s.1", "s.2", "s.3"]) {
      expect(
        cookies.filter((c) => c.startsWith(`${stale}=;`) && c.includes("Max-Age=0")),
      ).toHaveLength(1);
    }
  });

  it("clears only the trailing stale chunks when the chunk count shrinks", () => {
    const existing = { "s.0": "a", "s.1": "b", "s.2": "c", "s.3": "d", "s.4": "e" };
    const value = "x".repeat(COOKIE_CHUNK_SIZE + 1);
    const cookies = chunkCookieValue("s", value, {}, existing);
    expect(cookies.some((c) => c.startsWith(`s.0=${"x".repeat(COOKIE_CHUNK_SIZE)}`))).toBe(true);
    expect(cookies.some((c) => c.startsWith("s.1=x;"))).toBe(true);
    for (const stale of ["s.2", "s.3", "s.4"]) {
      expect(
        cookies.filter((c) => c.startsWith(`${stale}=;`) && c.includes("Max-Age=0")),
      ).toHaveLength(1);
    }
    expect(cookies.some((c) => c.startsWith("s.0=;"))).toBe(false);
    expect(cookies.some((c) => c.startsWith("s.1=;"))).toBe(false);
  });

  it("readChunkedCookie prefers the base cookie, else joins chunks until a gap", () => {
    expect(readChunkedCookie({ s: "whole" }, "s")).toBe("whole");
    expect(readChunkedCookie({ "s.0": "ab", "s.1": "cd" }, "s")).toBe("abcd");
    expect(readChunkedCookie({ "s.0": "ab", "s.2": "zz" }, "s")).toBe("ab");
    expect(readChunkedCookie({}, "s")).toBeUndefined();
  });

  it("clearChunkedCookie clears the base and every chunk present in the request", () => {
    const cleared = clearChunkedCookie("s", { "s.0": "a", "s.1": "b" });
    expect(cleared).toHaveLength(3);
    expect(cleared[0]).toContain("s=; ");
    expect(cleared[1]).toContain("s.0=; ");
    expect(cleared[2]).toContain("s.1=; ");
  });

  it("clearCookie emits Max-Age=0", () => {
    expect(clearCookie("s")).toContain("Max-Age=0");
  });
});
