import { describe, expect, it } from "vitest";
import { AbpApiError } from "@/api/mutator";
import { abpErrorToFieldErrors, abpSubmitValidator } from "@/components/abp/crud/abp-form-errors";

function makeAbpError(body: unknown): AbpApiError {
  return new AbpApiError(400, body, "POST", "/api/test");
}

describe("abpErrorToFieldErrors", () => {
  it("展开 validationErrors 的 members，PascalCase 逐段转 camelCase（含嵌套）", () => {
    const error = makeAbpError({
      error: {
        message: "envelope msg",
        validationErrors: [
          { message: "name required", members: ["Name"] },
          { message: "bad email", members: ["Details.Email"] },
          { message: "no member here", members: [] },
        ],
      },
    });
    expect(abpErrorToFieldErrors(error)).toEqual([
      { field: "name", message: "name required" },
      { field: "details.email", message: "bad email" },
      { message: "no member here" },
    ]);
  });

  it("无 validationErrors 退回信封 message；非 AbpApiError 直接按源对象取 message", () => {
    expect(abpErrorToFieldErrors(makeAbpError({ error: { message: "top" } }))).toEqual([
      { message: "top" },
    ]);
    expect(abpErrorToFieldErrors({ message: "raw" })).toEqual([{ message: "raw" }]);
    expect(abpErrorToFieldErrors(undefined)).toEqual([]);
  });

  it("单条 validationError 的多个 members 各自展开为独立字段错误；非 AbpApiError 包装的裸对象同样按顶层 validationErrors 取值", () => {
    expect(
      abpErrorToFieldErrors({
        validationErrors: [
          { message: "taken", members: ["userName", "email"] },
          { message: "global boom", members: [] },
        ],
      }),
    ).toEqual([
      { field: "userName", message: "taken" },
      { field: "email", message: "taken" },
      { message: "global boom" },
    ]);
  });
});

describe("abpSubmitValidator", () => {
  it("把 ABP 校验失败映射成 ServerErrorMap", async () => {
    const validate = abpSubmitValidator(async () => {
      throw makeAbpError({
        error: { validationErrors: [{ message: "taken", members: ["UserName"] }] },
      });
    });
    await expect(validate({ value: {} })).resolves.toEqual({
      fields: { userName: "taken" },
    });
  });
});
