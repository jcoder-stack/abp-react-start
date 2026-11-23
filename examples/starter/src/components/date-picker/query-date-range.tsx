import { lazy, type ReactNode, Suspense, useId } from "react";
import { formatIso, ISO_DATE, parseIso } from "@/components/date-picker/date-io";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

const DateRangePicker = lazy(() =>
  import("@/components/date-picker/date-range-picker").then((m) => ({
    default: m.DateRangePicker,
  })),
);

interface RangeFieldApi {
  state: { value: string };
  handleChange: (value: string) => void;
}

/** 查询表单的最小结构面：能按名订阅/写回字符串字段即可，不绑定 TanStack Form 完整泛型
 * （参照 form-hook 的 ServerErrorForm）。返回类型必须是 `ReactNode | Promise<ReactNode>`：
 * React 19 类型下 TanStack Form 真实的 `Field` 返回这个联合类型（Suspense 场景），窄化成单纯
 * `ReactNode` 会让真实 `useAppForm` 实例在 `form` prop 处报 TS2322。 */
export interface QueryDateRangeForm<TName extends string> {
  Field: (props: {
    name: TName;
    children: (field: RangeFieldApi) => ReactNode;
  }) => ReactNode | Promise<ReactNode>;
}

export interface QueryDateRangeProps<TName extends string> {
  form: QueryDateRangeForm<TName>;
  from: TName;
  to: TName;
  label: string;
  disabled?: boolean;
}

/** 查询区日期区间：一个 DateRangePicker 同时读写两个扁平查询参数（Min/Max 仍与后端 DTO
 * 一一对应），取代旧的双字段拼接写法。 */
export function QueryDateRange<TName extends string>(props: QueryDateRangeProps<TName>) {
  const id = useId();
  const F = props.form.Field;
  return (
    <F name={props.from}>
      {(fromField) => (
        <F name={props.to}>
          {(toField) => (
            <Field>
              <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
              <Suspense fallback={<Skeleton className="h-9 w-full" />}>
                <DateRangePicker
                  id={id}
                  disabled={props.disabled}
                  value={{
                    from: parseIso(fromField.state.value, ISO_DATE),
                    to: parseIso(toField.state.value, ISO_DATE),
                  }}
                  onChange={(range) => {
                    fromField.handleChange(formatIso(range?.from, ISO_DATE));
                    toField.handleChange(formatIso(range?.to, ISO_DATE));
                  }}
                />
              </Suspense>
            </Field>
          )}
        </F>
      )}
    </F>
  );
}
