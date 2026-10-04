import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyStartError } from "../../src/realtime/policy";
import { signalRConnectionFactory } from "../../src/realtime/signalr-factory";

let server: Server | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  // fetch 的 keep-alive 连接会让 close() 一直等下去，先断开。
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

/** A local endpoint that answers every request with `status`, recording what it was sent. */
async function endpoint(status: number): Promise<{ url: string; requests: IncomingMessage[] }> {
  const requests: IncomingMessage[] = [];
  server = createServer((req, res) => {
    requests.push(req);
    res.writeHead(status, { "content-type": "text/plain" });
    res.end();
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/signalr-hubs/notifications`, requests };
}

async function startAgainst(status: number) {
  const { url, requests } = await endpoint(status);
  const connection = await signalRConnectionFactory({
    url,
    accessTokenFactory: async () => "t0ken",
    nextRetryDelayMs: () => 0,
  });
  const error = await connection.start().then(
    () => undefined,
    (reason: unknown) => reason,
  );
  return { error, requests };
}

describe("signalRConnectionFactory", () => {
  it("surfaces a missing hub as not-found without SignalR logging to the console", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { error, requests } = await startAgainst(404);

    expect(classifyStartError(error)).toBe("not-found");
    expect(requests[0]?.url).toMatch(/\/signalr-hubs\/notifications\/negotiate/);
    expect(requests[0]?.headers.authorization).toBe("Bearer t0ken");
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("surfaces a rejected token as unauthorized", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { error } = await startAgainst(401);
    expect(classifyStartError(error)).toBe("unauthorized");
  });
});
