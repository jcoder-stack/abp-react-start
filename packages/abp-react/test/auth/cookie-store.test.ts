import { describe, expect, it } from "vitest";
import { createCookieSessionStore } from "../../src/auth/cookie-store";
import type { AuthSession } from "../../src/auth/types";

const SECRET = "0123456789abcdef0123456789abcdef";
const store = createCookieSessionStore({
  secret: SECRET,
  cookieName: "auth_session",
  maxAge: 604800,
});

function toCookieHeader(setCookies: string[]): string {
  return setCookies
    .map((c) => c.split("; ")[0])
    .filter((pair): pair is string => pair !== undefined && !pair.endsWith("="))
    .join("; ");
}

describe("createCookieSessionStore", () => {
  it("save → load round-trips a session (chunked: sealed tokens exceed one cookie)", async () => {
    const session: AuthSession = {
      tokens: { accessToken: "a".repeat(4000), refreshToken: "r".repeat(2000) },
      expiresAt: 1000,
      tenant: "t1",
      culture: "zh-Hans",
    };
    const setCookies = await store.save(session);
    expect(setCookies.length).toBeGreaterThan(2);
    expect(await store.load(toCookieHeader(setCookies))).toEqual(session);
  });

  it("small session stays a single cookie and still round-trips", async () => {
    const session: AuthSession = { tokens: { accessToken: "at" } };
    const setCookies = await store.save(session);
    expect(setCookies).toHaveLength(2);
    expect(await store.load(toCookieHeader(setCookies))).toEqual(session);
  });

  it("load returns null for absent or tampered cookie", async () => {
    expect(await store.load(null)).toBeNull();
    expect(await store.load("auth_session=tampered")).toBeNull();
  });

  it("clear expires the base cookie and all chunks present", async () => {
    const cleared = await store.clear("auth_session.0=a; auth_session.1=b");
    expect(cleared).toHaveLength(3);
    for (const c of cleared) expect(c).toContain("Max-Age=0");
  });
});
