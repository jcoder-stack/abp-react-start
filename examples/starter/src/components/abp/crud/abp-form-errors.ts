import { AbpApiError } from "@/api/mutator";
import {
  type FieldErrors,
  type ServerErrorMap,
  serverSubmitValidator,
} from "@/components/form/server-errors";

interface AbpValidationErrorLike {
  message?: string | null;
  members?: string[] | null;
}

/** ABP 后端 member 名是 PascalCase(如 "Name"、"Details.Email"),前端表单字段是 camelCase;逐段转。 */
function memberToFieldName(member: string): string {
  return member
    .split(".")
    .map((segment) => segment.charAt(0).toLowerCase() + segment.slice(1))
    .join(".");
}

/** 解包 AbpApiError.body.error → validationErrors 展开为通用 FieldErrors。 */
export function abpErrorToFieldErrors(error: unknown): FieldErrors {
  const source = (error instanceof AbpApiError ? error.body?.error : error) as {
    validationErrors?: AbpValidationErrorLike[] | null;
    message?: string;
  } | null;
  const validation = source?.validationErrors;
  if (!Array.isArray(validation) || validation.length === 0) {
    return source?.message ? [{ message: source.message }] : [];
  }
  const out: FieldErrors = [];
  for (const item of validation) {
    if (!item.message) continue;
    if (Array.isArray(item.members) && item.members.length > 0) {
      for (const member of item.members) {
        out.push({ field: memberToFieldName(member), message: item.message });
      }
    } else {
      out.push({ message: item.message });
    }
  }
  return out;
}

/** ABP 版 onSubmitAsync 校验器:serverSubmitValidator 预注入 ABP 错误映射。页面提交一律用它包 mutation。 */
export function abpSubmitValidator<TValue>(
  submit: (value: TValue) => Promise<void>,
): (arg: { value: TValue }) => Promise<ServerErrorMap | null> {
  return serverSubmitValidator(submit, abpErrorToFieldErrors);
}
