import { describe, expect, it } from "vitest";
import { packUpload, unpackUpload } from "@/auth/upload-payload";

describe("upload payload", () => {
  it("round-trips a multipart form with its fields intact", async () => {
    const form = new FormData();
    form.append("file", new Blob(["a,b"], { type: "text/csv" }), "import.csv");
    form.append("overwrite", "true");
    const unpacked = await unpackUpload(
      packUpload("/api/app/books/import", "POST", { "x-requested-with": "XMLHttpRequest" }, form),
    );
    expect(unpacked.path).toBe("/api/app/books/import");
    expect(unpacked.method).toBe("POST");
    expect(unpacked.headers?.["x-requested-with"]).toBe("XMLHttpRequest");
    expect(unpacked.body).toBeInstanceOf(FormData);
    const body = unpacked.body as FormData;
    expect(body.get("overwrite")).toBe("true");
    expect(body.get("file")).toBeInstanceOf(File);
  });

  // 忘了剔除，__abp 就成了一个发给 ABP 的多余表单字段——上游多半不报错，只是多收一个参数，
  // 这类污染在集成前看不见。
  it("strips the meta field so it never reaches the upstream body", async () => {
    const form = new FormData();
    form.append("file", new Blob(["x"]), "x.bin");
    const unpacked = await unpackUpload(packUpload("/api/x", "POST", undefined, form));
    expect((unpacked.body as FormData).get("__abp")).toBeNull();
  });

  it("round-trips raw bytes byte-for-byte", async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const unpacked = await unpackUpload(
      packUpload("/api/files/1", "PUT", { "content-type": "application/octet-stream" }, bytes),
    );
    expect(unpacked.headers?.["content-type"]).toBe("application/octet-stream");
    expect(unpacked.body).toBeInstanceOf(Uint8Array);
    expect([...(unpacked.body as Uint8Array)]).toEqual([0, 1, 2, 253, 254, 255]);
  });

  it("rejects a payload whose meta field is missing or malformed", async () => {
    await expect(unpackUpload(new FormData())).rejects.toThrow();
  });
});
