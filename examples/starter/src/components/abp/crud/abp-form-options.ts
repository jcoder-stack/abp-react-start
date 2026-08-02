import {
  type FormAsyncValidateOrFn,
  type FormValidateOrFn,
  revalidateLogic,
} from "@tanstack/react-form";
import { abpSubmitValidator } from "@/components/abp/crud/abp-form-errors";

export interface AbpFormConfig<TValues> {
  defaultValues: TValues;
  /** 表单级 zod schema,落 validators.onDynamic;缺省则无客户端 schema 校验。 */
  schema?: FormValidateOrFn<TValues>;
  /** 业务提交;抛出的 ABP 错误自动落字段/表单级。 */
  submit: (value: TValues) => Promise<void>;
  /** 提交成功后回调。 */
  onSuccess?: () => void;
  /** 额外校验器逃生舱;onDynamic/onSubmitAsync 由预设独占,类型上不可传入。 */
  validators?: {
    onMount?: FormValidateOrFn<TValues>;
    onChange?: FormValidateOrFn<TValues>;
    onChangeAsync?: FormAsyncValidateOrFn<TValues>;
    onBlur?: FormValidateOrFn<TValues>;
    onBlurAsync?: FormAsyncValidateOrFn<TValues>;
  };
}

/** 用 schema 的 transform 输出替换原始表单值(如 zod `.trim()`)。绕开「校验不回写转换值」
 * (TanStack Form 官方 submission-handling:onSubmit 拿到的永远是 input data)。函数校验器、
 * 异步 schema、或产生 issue 时原样返回(onDynamic 已在提交前拦过校验)。`FormValidateOrFn` 的
 * Standard Schema 分支 Output 记为 unknown,故 value 需一次显式下转。 */
function normalizeWithSchema<TValues>(
  schema: AbpFormConfig<TValues>["schema"],
  value: TValues,
): TValues {
  if (schema === undefined || typeof schema === "function") return value;
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise || "issues" in result) return value;
  return result.value as TValues;
}

/** ABP 表单标准姿势:必填三件套 validationLogic + 服务端错误通道,返回值直接交给 useAppForm。 */
export function abpFormOptions<TValues>(config: AbpFormConfig<TValues>) {
  const submit = (value: TValues) => config.submit(normalizeWithSchema(config.schema, value));
  return {
    defaultValues: config.defaultValues,
    validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
    validators: {
      ...config.validators,
      onDynamic: config.schema,
      onSubmitAsync: abpSubmitValidator<TValues>(submit),
    },
    onSubmit: config.onSuccess,
  };
}
