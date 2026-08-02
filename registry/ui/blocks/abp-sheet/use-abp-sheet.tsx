import { useLocalization, usePermissionChecker } from "@jcoder-stack/abp-react/react";
import { type FormValidateOrFn, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { abpFormOptions } from "@/components/abp/crud/abp-form-options";
import { useBoundComponents } from "@/components/abp/crud/create-bound-components";
import type { WritableCrudService } from "@/components/abp/crud/crud-service";
import { useAppForm } from "@/components/form/form-hook";
import { SheetForm, type SheetFormMode, type SheetFormProps } from "@/components/form/sheet-form";

/** form 块的入参。`emptyValues` 之外三个映射都可以省：`toValues` 缺省按 `emptyValues` 的键
 *  从记录里 pick，null/undefined 回退成空值，roles 这类「表单形状 ≡ DTO 子集」的页够用了。
 *  `toCreate`/`toUpdate` 只在 `TValues` 结构上可赋给对应 DTO 时才允许省略；形状不匹配
 *  （比如 tenants 的 update DTO 没有 admin 字段）编译期就报错，不会到运行时才传错字段。 */
export type AbpSheetOptions<
  TDto extends { id?: string; concurrencyStamp?: string | null },
  TValues,
  TCreate,
  TUpdate,
> = {
  emptyValues: TValues;
  /** record → 表单值；可异步（预取关联数据）；返回 null 表示取消打开（调用方自行提示）。 */
  toValues?: (record: TDto, mode: SheetFormMode) => TValues | Promise<TValues | null>;
  schema?: (mode: SheetFormMode) => FormValidateOrFn<TValues>;
} & (TValues extends TCreate
  ? { toCreate?: (value: TValues) => TCreate }
  : { toCreate: (value: TValues) => TCreate }) &
  (TValues extends TUpdate
    ? { toUpdate?: (value: TValues) => TUpdate }
    : { toUpdate: (value: TValues) => TUpdate });

/** service → sheet 三态状态机 + create/update mutation。直接吃 `WritableCrudService`，
 *  调用方不用另建一份 mutation 自己接线。sheet 状态机、concurrencyStamp 注入、保存 toast
 *  与列表失效都收在这里。绑定成员 `Sheet` 经 `useBoundComponents` 挂出稳定身份。 */
export function useAbpSheet<
  TDto extends { id?: string; concurrencyStamp?: string | null },
  TValues,
  TCreate,
  TUpdate,
>(
  service: WritableCrudService<TDto, TCreate, TUpdate>,
  opts: AbpSheetOptions<TDto, TValues, TCreate, TUpdate>,
) {
  const L = useLocalization();
  const can = usePermissionChecker();
  const queryClient = useQueryClient();

  const [sheet, setSheet] = useState<{ mode: SheetFormMode; record?: TDto } | null>(null);
  // defaultValues 必须由 state 驱动:useForm 每渲染 formApi.update(opts) 会把稳定常量
  // defaultValues 拍回刚 reset 的记录值。
  const [formDefaults, setFormDefaults] = useState<TValues>(opts.emptyValues);

  const mode = sheet?.mode;
  const record = sheet?.record;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: service.listKey() });
  const saved = () => {
    toast.success(L("Crud:Saved"));
    void invalidate();
  };

  const rawCreate = service.useCreate({ mutation: { onSuccess: saved } });
  const rawUpdate = service.useUpdate({ mutation: { onSuccess: saved } });

  const form = useAppForm(
    abpFormOptions({
      defaultValues: formDefaults,
      schema: opts.schema?.(mode ?? "create"),
      // rawCreate/rawUpdate 直接调用，不包 facade。两者只在这一处读取，不像
      // use-abp-table.ts 的 deleteMutation 那样要喂一条外部 memo 链，包一层没有可观察差异。
      submit: async (value: TValues) => {
        if (sheet?.mode === "edit" && sheet.record?.id) {
          const stamp = sheet.record.concurrencyStamp;
          const toUpdate = opts.toUpdate ?? ((v: TValues) => v as unknown as TUpdate);
          const base = toUpdate(value);
          // 泛型上无法表达「附加可选键仍是 TUpdate」;运行时 ASP.NET 模型绑定忽略未知属性,
          // 对无该字段的 DTO(如 books)安全。
          const data = stamp != null ? ({ ...base, concurrencyStamp: stamp } as TUpdate) : base;
          await rawUpdate.mutateAsync({ id: sheet.record.id, data });
        } else {
          const toCreate = opts.toCreate ?? ((v: TValues) => v as unknown as TCreate);
          await rawCreate.mutateAsync({ data: toCreate(value) });
        }
      },
      onSuccess: () => setSheet(null),
    }),
  );
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  // 调用方的 opts 多是内联字面量、每渲染新建，钉在 ref 上 open 才能引用稳定。
  // 这是硬要求：AbpTable 的 columns memo 依赖 onOpen，它一变整张表的列模型就重建，
  // 还会触发 data-table 的 columns churn 告警去误指调用方。
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // 默认 toValues：按 emptyValues 的键从记录 pick，null/undefined 回退成空值，够 roles 这类
  // 「表单形状 ≡ DTO 子集」的页用；密码不回显这种 mode 语义仍要显式传 toValues。
  // useCallback([]) 钉稳身份，只读 optsRef.current，ref 免疫过期闭包。
  const defaultToValues = useCallback((record: TDto): TValues => {
    const empty = optsRef.current.emptyValues as Record<string, unknown>;
    const next: Record<string, unknown> = { ...empty };
    for (const key of Object.keys(next)) {
      const value = (record as Record<string, unknown>)[key];
      if (value !== undefined && value !== null) next[key] = value;
    }
    return next as TValues;
  }, []);

  const open = useCallback(
    async (nextMode: SheetFormMode, nextRecord?: TDto) => {
      const o = optsRef.current;
      let values = o.emptyValues;
      if (nextRecord) {
        const resolved = o.toValues
          ? await o.toValues(nextRecord, nextMode)
          : defaultToValues(nextRecord);
        if (resolved === null) return;
        values = resolved;
      }
      setFormDefaults(values);
      form.reset(values);
      setSheet({ mode: nextMode, record: nextRecord });
    },
    [form, defaultToValues],
  );

  const allow = (policy: string | undefined) => (policy === undefined ? true : can(policy));

  const sheetProps = {
    mode: mode ?? "create",
    open: sheet !== null,
    onOpenChange: (nextOpen: boolean) => {
      if (!nextOpen) setSheet(null);
    },
    title: L(
      mode === "edit" ? "Crud:EditTitle" : mode === "view" ? "Crud:ViewTitle" : "Crud:Create",
    ),
    onSubmit: () => {
      void form.handleSubmit();
    },
    pending: isSubmitting,
    canEdit: allow(service.resolvedPolicies.update),
    onEdit: () => {
      if (sheet) setSheet({ ...sheet, mode: "edit" });
    },
  } satisfies Omit<SheetFormProps, "children">;

  const bound = useBoundComponents({ sheetProps }, (read) => ({
    Sheet: (p: { title?: string; children: ReactNode }) => (
      <SheetForm {...read().sheetProps} {...(p.title !== undefined ? { title: p.title } : {})}>
        {p.children}
      </SheetForm>
    ),
  }));

  return {
    form,
    open,
    close: () => setSheet(null),
    record,
    readOnly: mode === "view",
    mode,
    Sheet: bound.Sheet,
  };
}
