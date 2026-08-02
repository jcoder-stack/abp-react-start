import type { Logger } from "../logger";
import { createCodec } from "./codec";
import {
  type CookieOptions,
  chunkCookieValue,
  clearChunkedCookie,
  parseCookieHeader,
  readChunkedCookie,
} from "./cookies";
import { type AuthSession, authSessionSchema, type SessionStore } from "./types";

/** 默认 SessionStore：把整个 AuthSession 密封进（超长时分块的）加密 cookie，自包含无后端。 */
export function createCookieSessionStore(opts: {
  secret: string;
  cookieName: string;
  maxAge: number;
  cookieOptions?: CookieOptions;
  logger?: Logger;
}): SessionStore {
  const codec = createCodec<AuthSession>(opts.secret, authSessionSchema, {
    usage: "session",
    onError: (error) => opts.logger?.debug("session cookie open failed", { error: String(error) }),
  });
  return {
    load: async (cookieHeader) => {
      const sealed = readChunkedCookie(parseCookieHeader(cookieHeader), opts.cookieName);
      if (sealed === undefined) return null;
      const session = await codec.open(sealed);
      opts.logger?.debug("session opened", { found: session !== null, sealedBytes: sealed.length });
      return session;
    },
    save: async (session, cookieHeader) => {
      const sealed = await codec.seal(session);
      const cookies = chunkCookieValue(
        opts.cookieName,
        sealed,
        { ...opts.cookieOptions, maxAge: opts.maxAge },
        parseCookieHeader(cookieHeader),
      );
      opts.logger?.debug("session sealed", { sealedBytes: sealed.length, cookies: cookies.length });
      return cookies;
    },
    clear: async (cookieHeader) =>
      clearChunkedCookie(opts.cookieName, parseCookieHeader(cookieHeader), opts.cookieOptions),
  };
}
