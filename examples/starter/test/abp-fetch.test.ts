import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server-fns", () => ({ abpRequestFn: vi.fn() }));
vi.mock("@/api/mutator", () => ({ configureAbpMutator: vi.fn() }));

import { abpFetch } from "@/api/abp-fetch";
import { abpRequestFn } from "@/auth/server-fns";

describe("abpFetch", () => {
  it("handles 204 No Content response without throwing", async () => {
    vi.mocked(abpRequestFn).mockResolvedValue({
      status: 204,
      contentType: null,
      body: "",
    });
    const res = await abpFetch("/books/1", { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("parses 200 OK response with JSON body", async () => {
    vi.mocked(abpRequestFn).mockResolvedValue({
      status: 200,
      contentType: "application/json",
      body: '{"a":1}',
    });
    const res = await abpFetch("/books", { method: "GET" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ a: 1 });
  });
});
