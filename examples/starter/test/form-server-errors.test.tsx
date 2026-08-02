// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  type FieldErrors,
  serverSubmitValidator,
  toErrorMap,
} from "@/components/form/server-errors";

describe("toErrorMap", () => {
  it("字段级错误进 fields、无 field 的进 form(多条 \\n 连接),空数组返回 null", () => {
    expect(toErrorMap([])).toBeNull();
    expect(
      toErrorMap([
        { field: "name", message: "name taken" },
        { message: "boom one" },
        { message: "boom two" },
      ]),
    ).toEqual({ form: "boom one\nboom two", fields: { name: "name taken" } });
  });

  it("同一字段多条错误 \\n 连接", () => {
    expect(
      toErrorMap([
        { field: "name", message: "a" },
        { field: "name", message: "b" },
      ]),
    ).toEqual({ fields: { name: "a\nb" } });
  });
});

describe("serverSubmitValidator", () => {
  it("submit 成功返回 null", async () => {
    const validate = serverSubmitValidator(
      async () => {},
      () => [],
    );
    await expect(validate({ value: { n: 1 } })).resolves.toBeNull();
  });

  it("submit 失败经 mapError 映射为 ServerErrorMap", async () => {
    const mapError = vi.fn((): FieldErrors => [{ field: "name", message: "taken" }]);
    const validate = serverSubmitValidator(async () => {
      throw new Error("409");
    }, mapError);
    await expect(validate({ value: {} })).resolves.toEqual({ fields: { name: "taken" } });
    expect(mapError).toHaveBeenCalledOnce();
  });

  it("mapError 映射不出任何错误时,回退 Error.message 作表单级错误", async () => {
    const validate = serverSubmitValidator(
      async () => {
        throw new Error("network down");
      },
      () => [],
    );
    await expect(validate({ value: {} })).resolves.toEqual({
      form: "network down",
      fields: {},
    });
  });
});
