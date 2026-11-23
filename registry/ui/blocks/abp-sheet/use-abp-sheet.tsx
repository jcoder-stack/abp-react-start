import { useLocalization, usePermissionChecker } from "@jcoder-stack/abp-react/react";
import { type FormValidateOrFn, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { abpFormOptions } from "@/components/abp/crud/abp-form-options";
import { useBoundComponents } from "@/components/abp/crud/create-bound-components";
import type { WritableCrudService } from "@/components/abp/crud/crud-service";
import { useAppForm } from "@/components/form/form-hook";
import {
  SheetForm,
  type SheetFormMode,
  type SheetFormProps,
  type SheetFormSize,
} from "@/components/form/sheet-form";

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
  /** 抽屉标题。缺省是「新增 / 编辑 / 查看」这样的裸动词——没有宾语，读者不知道在新增什么，
   *  所以有实体名的页都该给一个（「新建图书」）。查看态通常直接用记录本身当标题。 */
  title?: (mode: SheetFormMode, record: TDto | undefined) => string;
  /** 标题下的记录标识，例如「刘慈欣 · 2008-01-01」。返回 undefined 则不占那一行。 */
  subtitle?: (mode: SheetFormMode, record: TDto | undefined) => string | undefined;
} & (TValues extends TCreate
  ? { toCreate?: (value: TValues) => TCreate }
  : { toCreate: (value: TValues) => TCreate }) &
  (TValues extends TUpdate
    ? { toUpdate?: (value: TValues) => TUpdate }
    : { toUpdate: (value: TValues) => TUpdate });

/** 打开抽屉的那个元素，关闭后焦点要回到它。从行操作菜单打开时活动元素是菜单项，菜单一关
 *  它就卸载了，所以换成菜单的触发钮（Radix 用 `aria-controls` 指向菜单内容）。 */
function resolveOpener(active: Element | null): HTMLElement | null {
  const menu = active?.closest('[role="menu"]');
  if (menu?.id) {
    // 逐个比属性而不拼选择器：Radix 的 id 来自 useId，带冒号，拼进选择器得转义。
    const trigger = Array.from(document.querySelectorAll("[aria-controls]")).find(
      (el) => el.getAttribute("aria-controls") === menu.id,
    );
    return trigger instanceof HTMLElement ? trigger : null;
  }
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

function isRecordOf<TDto extends { id?: string }>(value: unknown, id: string): value is TDto {
  return typeof value === "object" && value !== null && (value as { id?: unknown }).id === id;
}

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

  // fromView：编辑是从查看态点进来的。这时取消回到查看、保存后也回到查看并换上新记录——
  // 用户是来看这一条的，改完一处不该被整个踢回列表。
  const [sheet, setSheet] = useState<{
    mode: SheetFormMode;
    record?: TDto;
    fromView?: boolean;
  } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const isOpen = useRef(false);
  isOpen.current = sheet !== null;
  // 保存成功后要回到查看态的那条新记录；由 submit 写、onSuccess 读，两者之间隔着表单库。
  const reopenWith = useRef<TDto | null>(null);
  // defaultValues 必须由 state 驱动:useForm 每渲染 formApi.update(opts) 会把稳定常量
  // defaultValues 拍回刚 reset 的记录值。
  const [formDefaults, setFormDefaults] = useState<TValues>(opts.emptyValues);

  const mode = sheet?.mode;
  const record = sheet?.record;
  // 关闭后 sheet 立刻是 null，抽屉却还要淡出 200ms；标题和布局沿用最后一次打开时的状态，
  // 否则退场那一下会闪成「新建」的标题和可编辑的表单。
  const lastShown = useRef(sheet);
  if (sheet) lastShown.current = sheet;
  const shown = sheet ?? lastShown.current;
  const shownMode = shown?.mode ?? "create";

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
          const updated = await rawUpdate.mutateAsync({ id: sheet.record.id, data });
          // 只有服务端回了这条记录才回查看态：拿旧记录充数，下一次编辑会带着过期的
          // concurrencyStamp 撞并发冲突。
          reopenWith.current =
            sheet.fromView === true && isRecordOf<TDto>(updated, sheet.record.id) ? updated : null;
        } else {
          const toCreate = opts.toCreate ?? ((v: TValues) => v as unknown as TCreate);
          await rawCreate.mutateAsync({ data: toCreate(value) });
        }
      },
      onSuccess: () => {
        const next = reopenWith.current;
        reopenWith.current = null;
        if (next) void open("view", next);
        else setSheet(null);
      },
    }),
  );
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  // 关闭前是否需要拦一道：只有真改过东西才值得打断，查看态永远不拦。
  const isDirty = useStore(form.store, (state) => state.isDirty);

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
      // 必须在 await 之前取：toValues 预取期间菜单已经关掉、活动元素早换了。抽屉已开着时
      // （保存后回查看态）不覆盖，焦点仍该回到最初的打开者。
      if (!isOpen.current) opener.current = resolveOpener(document.activeElement);
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
    mode: shownMode,
    open: sheet !== null,
    onOpenChange: (nextOpen: boolean) => {
      if (!nextOpen) setSheet(null);
    },
    title:
      opts.title?.(shownMode, shown?.record) ??
      L(
        shownMode === "edit"
          ? "Crud:EditTitle"
          : shownMode === "view"
            ? "Crud:ViewTitle"
            : "Crud:Create",
      ),
    subtitle: opts.subtitle?.(shownMode, shown?.record),
    onSubmit: () => {
      void form.handleSubmit();
    },
    pending: isSubmitting,
    dirty: isDirty && mode !== "view",
    canEdit: allow(service.resolvedPolicies.update),
    onEdit: () => {
      if (sheet) setSheet({ ...sheet, mode: "edit", fromView: true });
    },
    onBack:
      sheet?.mode === "edit" && sheet.fromView === true
        ? () => {
            form.reset(formDefaults);
            setSheet({ ...sheet, mode: "view", fromView: false });
          }
        : undefined,
    onCloseAutoFocus: (event: Event) => {
      const target = opener.current;
      opener.current = null;
      // 打开者已不在页面上（比如那一行刚被删掉）时交还 Radix 的默认处理。
      if (target?.isConnected) {
        event.preventDefault();
        target.focus();
      }
    },
  } satisfies Omit<SheetFormProps, "children">;

  const bound = useBoundComponents({ sheetProps }, (read) => ({
    // size 由调用方在渲染处给，不进 opts：它只影响外观，没有必要跟着 opts 走 ref 那一层。
    Sheet: (p: { title?: string; size?: SheetFormSize; children: ReactNode }) => (
      <SheetForm
        {...read().sheetProps}
        {...(p.title !== undefined ? { title: p.title } : {})}
        {...(p.size !== undefined ? { size: p.size } : {})}
      >
        {p.children}
      </SheetForm>
    ),
  }));

  return {
    form,
    open,
    close: () => setSheet(null),
    record,
    readOnly: shownMode === "view",
    mode,
    Sheet: bound.Sheet,
  };
}
