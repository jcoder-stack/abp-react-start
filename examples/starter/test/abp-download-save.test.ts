// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadAbpFile } from "@/api/abp-download";

// fetch 只在本文件替身：jsdom 的 File 认不出 undici 的 Blob，真实字节的用例放在 node 环境的 abp-download.test.ts。
function respondWith(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("downloadAbpFile", () => {
  it("saves the file under its response name, or the caller's override", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
    );
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });

    const named = () =>
      new Response("a,b", {
        status: 200,
        headers: { "Content-Disposition": 'attachment; filename="staff.csv"' },
      });
    respondWith(named());
    await downloadAbpFile("/x");
    respondWith(named());
    await downloadAbpFile("/x", { filename: "员工.csv" });

    expect(clicked).toEqual(["staff.csv", "员工.csv"]);
  });
});
