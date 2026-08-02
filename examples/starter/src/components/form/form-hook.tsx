import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { Combobox } from "@/components/combobox/combobox";
import type { ComboboxOption } from "@/components/combobox/use-combobox-options";
import { formatIso, ISO_DATE, ISO_DATE_TIME, parseIso } from "@/components/date-picker/date-io";
import { FormErrorSummary } from "@/components/form/form-error-summary";
import { RequiredMark } from "@/components/form/required-mark";
import { Badge } from "@/components/ui/badge";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

const MultiCombobox = lazy(() =>
  import("@/components/combobox/multi-combobox").then((m) => ({ default: m.MultiCombobox })),
);
const DatePicker = lazy(() =>
  import("@/components/date-picker/date-picker").then((m) => ({ default: m.DatePicker })),
);
const DateTimePicker = lazy(() =>
  import("@/components/date-picker/date-time-picker").then((m) => ({
    default: m.DateTimePicker,
  })),
);
const DateRangePicker = lazy(() =>
  import("@/components/date-picker/date-range-picker").then((m) => ({
    default: m.DateRangePicker,
  })),
);

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

/** 错误元素可能是服务端原始字符串或 Standard Schema issue;FieldError 只认 {message}。 */
function toFieldErrors(errors: unknown[]): { message?: string }[] {
  return errors.map((e) => (typeof e === "string" ? { message: e } : (e as { message?: string })));
}

interface ServerErrorFieldMeta {
  errorMap?: Record<string, unknown>;
}

/** `clearServerSubmitErrors` 需要的最小结构面,避免依赖 TanStack Form 的完整泛型形态。 */
interface ServerErrorForm {
  state: { fieldMeta: Record<string, ServerErrorFieldMeta | undefined> };
  setFieldMeta: (
    name: string,
    updater: (meta: ServerErrorFieldMeta) => ServerErrorFieldMeta,
  ) => void;
  setErrorMap: (map: { onSubmit?: undefined }) => void;
}

/**
 * 绕过 @tanstack/react-form 1.33.2 死锁:onSubmitAsync 注入的字段级错误不会在重提交时自清,
 * 不清则提交被永久短路。约束:onSubmit 槽位只放服务端错误,勿给 field 另挂 onSubmit 校验器。
 */
function clearServerSubmitErrors(form: ServerErrorForm): void {
  for (const name of Object.keys(form.state.fieldMeta)) {
    form.setFieldMeta(name, (meta) => ({
      ...meta,
      errorMap: { ...meta.errorMap, onSubmit: undefined },
    }));
  }
  form.setErrorMap({ onSubmit: undefined });
}

function FieldShell(props: {
  label: string;
  required?: boolean;
  orientation?: "vertical" | "horizontal";
  children: ReactNode;
}) {
  const field = useFieldContext();
  const invalid = field.state.meta.errors.length > 0;
  return (
    <Field orientation={props.orientation} data-invalid={invalid ? true : undefined}>
      <FieldLabel htmlFor={field.name}>
        {props.label}
        {props.required === true && <RequiredMark />}
      </FieldLabel>
      {props.children}
      <FieldError errors={toFieldErrors(field.state.meta.errors)} />
    </Field>
  );
}

export function TextField(props: {
  label: string;
  required?: boolean;
  type?: "text" | "email" | "password" | "date";
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  const field = useFieldContext<string>();
  return (
    <FieldShell label={props.label} required={props.required}>
      <Input
        id={field.name}
        name={field.name}
        type={props.type ?? "text"}
        aria-required={props.required === true || undefined}
        aria-invalid={field.state.meta.errors.length > 0 || undefined}
        value={field.state.value}
        disabled={props.disabled}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
    </FieldShell>
  );
}

export function NumberField(props: {
  label: string;
  required?: boolean;
  disabled?: boolean;
  step?: string;
}) {
  const field = useFieldContext<number>();
  return (
    <FieldShell label={props.label} required={props.required}>
      <Input
        id={field.name}
        name={field.name}
        type="number"
        step={props.step}
        aria-required={props.required === true || undefined}
        aria-invalid={field.state.meta.errors.length > 0 || undefined}
        value={Number.isNaN(field.state.value) ? "" : String(field.state.value)}
        disabled={props.disabled}
        onBlur={field.handleBlur}
        onChange={(event) => {
          // 空串裸转 Number 是 0,会把「清空了」写成「改成 0」;映射 NaN 让 z.number() 判失败
          const raw = event.target.value;
          field.handleChange(raw.trim() === "" ? Number.NaN : Number(raw));
        }}
      />
    </FieldShell>
  );
}

export function SwitchField(props: { label: string; disabled?: boolean }) {
  const field = useFieldContext<boolean>();
  return (
    <FieldShell label={props.label} orientation="horizontal">
      <Switch
        id={field.name}
        aria-invalid={field.state.meta.errors.length > 0 || undefined}
        checked={field.state.value}
        disabled={props.disabled}
        onCheckedChange={(checked: boolean) => field.handleChange(checked)}
      />
    </FieldShell>
  );
}

export function SelectField(props: {
  label: string;
  options: { value: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
}) {
  const field = useFieldContext<string>();
  return (
    <FieldShell label={props.label} required={props.required}>
      <Select
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value)}
        disabled={props.disabled}
      >
        <SelectTrigger
          id={field.name}
          className="w-full"
          aria-invalid={field.state.meta.errors.length > 0 || undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

export function DateField(props: {
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const field = useFieldContext<string>();
  return (
    <FieldShell label={props.label} required={props.required}>
      <Suspense fallback={<Skeleton className="h-9 w-full" />}>
        <DatePicker
          id={field.name}
          value={parseIso(field.state.value, ISO_DATE)}
          disabled={props.disabled}
          placeholder={props.placeholder}
          aria-required={props.required === true || undefined}
          aria-invalid={field.state.meta.errors.length > 0 || undefined}
          onChange={(date) => field.handleChange(formatIso(date, ISO_DATE))}
        />
      </Suspense>
    </FieldShell>
  );
}

export function DateTimeField(props: {
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const field = useFieldContext<string>();
  return (
    <FieldShell label={props.label} required={props.required}>
      <Suspense fallback={<Skeleton className="h-9 w-full" />}>
        <DateTimePicker
          id={field.name}
          value={parseIso(field.state.value, ISO_DATE_TIME)}
          disabled={props.disabled}
          placeholder={props.placeholder}
          aria-required={props.required === true || undefined}
          aria-invalid={field.state.meta.errors.length > 0 || undefined}
          onChange={(date) => field.handleChange(formatIso(date, ISO_DATE_TIME))}
        />
      </Suspense>
    </FieldShell>
  );
}

export function DateRangeField(props: { label: string; required?: boolean; disabled?: boolean }) {
  const field = useFieldContext<{ from: string; to: string }>();
  return (
    <FieldShell label={props.label} required={props.required}>
      <Suspense fallback={<Skeleton className="h-9 w-full" />}>
        <DateRangePicker
          id={field.name}
          value={{
            from: parseIso(field.state.value.from, ISO_DATE),
            to: parseIso(field.state.value.to, ISO_DATE),
          }}
          disabled={props.disabled}
          aria-required={props.required === true || undefined}
          aria-invalid={field.state.meta.errors.length > 0 || undefined}
          onChange={(range) =>
            field.handleChange({
              from: formatIso(range?.from, ISO_DATE),
              to: formatIso(range?.to, ISO_DATE),
            })
          }
        />
      </Suspense>
    </FieldShell>
  );
}

export function ComboboxField(props: {
  label: string;
  options?: ComboboxOption[];
  loadOptions?: (search: string) => Promise<ComboboxOption[]>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const field = useFieldContext<string>();
  return (
    <FieldShell label={props.label} required={props.required}>
      <Combobox
        value={field.state.value || undefined}
        onChange={(value) => field.handleChange(value ?? "")}
        options={props.options ?? []}
        loadOptions={props.loadOptions}
        placeholder={props.placeholder}
        disabled={props.disabled}
      />
    </FieldShell>
  );
}

export function MultiComboboxField(props: {
  label: string;
  options: ComboboxOption[];
  editable: boolean;
}) {
  const field = useFieldContext<string[]>();
  return (
    <FieldShell label={props.label}>
      {props.editable ? (
        <Suspense fallback={<Skeleton className="h-9 w-full" />}>
          <MultiCombobox
            values={field.state.value}
            onChange={(values) => field.handleChange(values)}
            options={props.options}
          />
        </Suspense>
      ) : (
        <div className="flex flex-wrap gap-1">
          {field.state.value.length === 0 ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            field.state.value.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))
          )}
        </div>
      )}
    </FieldShell>
  );
}

/** onSubmitAsync 返回的 form 键落 state.errorMap.onSubmit;\n 拆多条渲染。 */
function FormErrors() {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
      {(onSubmit) => {
        const message = typeof onSubmit === "string" ? onSubmit : undefined;
        return <FormErrorSummary errors={message ? message.split("\n") : []} />;
      }}
    </form.Subscribe>
  );
}

const { useAppForm: useAppFormBase, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    NumberField,
    SwitchField,
    SelectField,
    DateField,
    DateTimeField,
    DateRangeField,
    ComboboxField,
    MultiComboboxField,
  },
  formComponents: { FormErrors },
});

/** 提交结束后把焦点移到第一个仍有错误的字段;取不到 DOM 元素(如自定义组件未转发 id)则顺延到
 * 下一个可聚焦的错误字段。字段输入的 id 约定为 field.name(内置字段组件已遵守)。「第一个」按
 * fieldMeta 的字段注册序(≈挂载序/tab 序);条件渲染或重排字段的极端场景下未必是视觉最上者。 */
function focusFirstInvalidField(form: {
  state: { fieldMeta: Record<string, { errors?: unknown[] } | undefined> };
}): void {
  for (const [name, meta] of Object.entries(form.state.fieldMeta)) {
    if (!meta?.errors?.length) continue;
    const el = document.getElementById(name);
    if (el) {
      el.focus();
      return;
    }
  }
}

const patchedForms = new WeakSet<object>();

/**
 * 包装 useAppFormBase:提交前注入服务端错误清理(见 clearServerSubmitErrors),提交结束后聚焦
 * 首错字段(见 focusFirstInvalidField)。WeakSet 守卫而不是 useState/useRef，后者初始化器在
 * StrictMode 下双调用,保证不了只 patch 一次。
 */
export const useAppForm: typeof useAppFormBase = (opts) => {
  const form = useAppFormBase(opts);
  if (!patchedForms.has(form)) {
    patchedForms.add(form);
    const original = form.handleSubmit;
    form.handleSubmit = ((submitMeta?: unknown) => {
      clearServerSubmitErrors(form as unknown as ServerErrorForm);
      const result = submitMeta === undefined ? original() : original(submitMeta as never);
      return result.then(() => {
        focusFirstInvalidField(form as unknown as Parameters<typeof focusFirstInvalidField>[0]);
      });
    }) as typeof form.handleSubmit;
  }
  return form;
};

export { withForm };
