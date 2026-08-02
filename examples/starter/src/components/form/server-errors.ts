export type FieldErrors = { field?: string; message: string }[];

/** `onSubmitAsync` 校验器的返回形状:`form` 落表单级(state.errorMap.onSubmit)、`fields` 落各字段(field.state.meta.errors)。 */
export interface ServerErrorMap {
  form?: string;
  fields: Record<string, string>;
}

/** 通用 FieldErrors → onSubmitAsync 返回形状;空输入返回 null(表示校验通过)。 */
export function toErrorMap(errors: FieldErrors): ServerErrorMap | null {
  if (errors.length === 0) return null;
  const fields: Record<string, string> = {};
  const formLevel: string[] = [];
  for (const error of errors) {
    if (error.field) {
      fields[error.field] = fields[error.field]
        ? `${fields[error.field]}\n${error.message}`
        : error.message;
    } else {
      formLevel.push(error.message);
    }
  }
  const map: ServerErrorMap = { fields };
  if (formLevel.length > 0) map.form = formLevel.join("\n");
  return map;
}

/**
 * 把「提交 + 服务端错误落字段」封装成一个 onSubmitAsync 校验器。`mapError` 是
 * 后端协议注入点(不认识任何具体后端;ABP 版实现见 components/abp/crud/abp-form-errors)。
 * mapError 映射不出错误(非校验类失败)时回退 Error.message 作表单级错误,绝不静默吞掉。
 */
export function serverSubmitValidator<TValue>(
  submit: (value: TValue) => Promise<void>,
  mapError: (error: unknown) => FieldErrors,
) {
  return async ({ value }: { value: TValue }): Promise<ServerErrorMap | null> => {
    try {
      await submit(value);
      return null;
    } catch (error) {
      const mapped = toErrorMap(mapError(error));
      if (mapped) return mapped;
      return {
        form: error instanceof Error ? error.message : String(error),
        fields: {},
      };
    }
  };
}
