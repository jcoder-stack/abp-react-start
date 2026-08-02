# 表单体系:架构与用法

本框架的表单是一个**四层体系**,层与层之间只靠数据契约耦合,下层脱离 ABP 也能独立使用。写业务页面只需接触层 2 的 `useAppForm` 与预绑定字段组件。

任务导向的「怎么做一个列表 + CRUD 维护页」见 [`abp-table.md`](./abp-table.md);本文讲**表单体系本身**。

## 四层架构

```
┌─ 层 4  components/abp/crud/abp-form-errors.ts   唯一懂 ABP 的层
│        abpSubmitValidator / abpErrorToFieldErrors
│        (解包 AbpApiError 信封、PascalCase→camelCase、members 展开)
│        components/abp/crud/abp-form-options.ts  层 4 上的标准姿势预设(纯函数)
│        components/abp/sheet/use-abp-sheet.tsx    层 4 上的 CRUD 表单侧接线(sheet 状态机)
├─ 层 3  components/form/server-errors.ts    通用错误契约(不依赖 ABP)
│        FieldErrors 类型 + serverSubmitValidator(mapError 注入点)
│        SheetForm / FormSection / FormErrorSummary 等容器
├─ 层 2  components/form/form-hook.tsx        绑定层(不依赖 ABP)
│        useAppForm + 6 个预绑定字段组件 + FormErrors
└─ 层 1  @tanstack/react-form                 headless
```

**分层规则**:

- 层 2 / 层 3 不依赖 ABP。ABP 协议知识(错误信封结构、PascalCase 成员名)只在层 4。
- 层与层的接缝是 `FieldErrors` 类型(`{ field?: string; message: string }[]`)。
- 换后端只需换层 4:自己写一个 `mapError: (error: unknown) => FieldErrors` 喂给层 3 的 `serverSubmitValidator`,层 2/3 一行不改。ABP 版 `abpSubmitValidator` 就是这么来的。

## ABP 表单标准姿势:abpFormOptions

打 ABP 后端的表单不需要手抄 validationLogic / onSubmitAsync 接线,把 options 交给
`abpFormOptions`(components/abp/crud/abp-form-options)预设:

```tsx
const form = useAppForm(
  abpFormOptions({
    defaultValues: { name: "" },
    schema: mySchema,                    // zod,落 onDynamic
    submit: (value) => postApiXxx(value), // 抛出的 ABP 错误自动落字段/表单级
    onSuccess: () => toast.success(L("Crud:Saved")),
  }),
);
```

它铺好三件套(`revalidateLogic({ mode: "submit", modeAfterSubmission: "change" })`)、
把 submit 包进 `abpSubmitValidator`(components/abp/crud/abp-form-errors,仍可单独用作逃生舱)。额外校验器走 `validators` 逃生舱
(onChange/onBlur 等;onDynamic/onSubmitAsync 由预设独占)。它是纯函数不是 hook——
全产品表单 hook 只有 `useAppForm` 一个。

## CRUD 页的表单侧:useAbpSheet

列表页的侧滑三态表单不用自己接 `useAppForm`——`useAbpSheet`(components/abp/sheet/use-abp-sheet)
在 `abpFormOptions` 之上再收编 sheet 状态机、create/update 分派、concurrencyStamp 自动回传与
defaultValues reset 时序,返回的 `sheet.form` 就是一个已经配好的 `useAppForm` 实例,本文后续讲的
字段组件、校验通道、错误落位对它全部适用。

它怎么和表格侧的 `useAbpTable` 拼成一个完整维护页,见 [`abp-table.md`](./abp-table.md)。

## 快速上手:一个表单的标准结构

以下是裸机制写法,产品页一律优先用上节的 `abpFormOptions` 预设;裸写法用于理解机制与非 ABP 后端场景。

客户端校验写成一个 zod schema,消息走 `L()` 词条:

```tsx
const schema = z.object({
  name: z.string().trim().min(1, L("Form:Required")),
  email: z.string().trim().min(1, L("Form:Required")).pipe(z.email(L("Form:InvalidEmail"))),
  isActive: z.boolean(),
});
```

> 注:`z.string().trim()` 等 transform 只影响**校验**,不会改动表单显示值。`abpFormOptions` 会在**提交前**用 schema 的 transform 输出归一化后再交给 `submit`,因此发到后端的是去空格后的值(绕开 TanStack Form「校验不回写转换值」)。

用 `useAppForm` 建表单,四个固定部件:`onDynamic` 挂客户端 schema、`onSubmitAsync` 包 mutation(服务端错误自动落位)、`onSubmit` 做成功收尾(关面板 / toast / navigate)、`revalidateLogic` 定校验时机:

```tsx
import { useAppForm } from "@/components/form/form-hook";
import { abpSubmitValidator } from "@/components/abp/crud/abp-form-errors";
import { revalidateLogic } from "@tanstack/react-form";
import { z } from "zod";

const form = useAppForm({
  defaultValues: formDefaults,
  validationLogic: revalidateLogic({ mode: "submit", modeAfterSubmission: "change" }),
  validators: {
    onDynamic: schema,
    onSubmitAsync: abpSubmitValidator(async (value) => {
      await saveMutation.mutateAsync(value);
    }),
  },
  onSubmit: () => setSheet(null),
});
```

字段每个 1–3 行,`name` 拼错在编译期报错:

```tsx
<form.AppForm><form.FormErrors /></form.AppForm>

<form.AppField name="name">
  {(field) => <field.TextField label={L("...")} required disabled={readOnly} />}
</form.AppField>

<form.AppField name="isActive">
  {(field) => <field.SwitchField label={L("...")} disabled={readOnly} />}
</form.AppField>
```

提交入口(原生 `<form onSubmit>` 或 `SheetForm` 的 `onSubmit` prop)就是 `() => form.handleSubmit()`——**不需要**任何手动清理错误的调用。

条件字段(如仅 create 态渲染的 password):schema 随 mode 变(`isCreate ? z.string().min(1, ...) : z.string()`),JSX 里 `{sheet?.mode === "create" && <form.AppField ...>}` 条件渲染。范本见 `identity/users.tsx`。

## 字段组件参考

全部经 `<form.AppField name="x">{(field) => <field.Xxx .../>}</form.AppField>` 使用。label、必填星号(`required`)、`aria-required`、`data-invalid`、内联错误渲染都已内聚在组件里。

| 组件 | 字段值类型 | 关键 props |
|---|---|---|
| `TextField` | `string` | `label`、`required?`、`type?`(text/email/password/date)、`disabled?`、`placeholder?`、`autoComplete?` |
| `NumberField` | `number` | `label`、`required?`、`disabled?`、`step?`。空串↔`NaN` 已内聚(清空不会被静默写成 `0`) |
| `SwitchField` | `boolean` | `label`、`disabled?`(横排布局) |
| `SelectField` | `string` | `label`、`options: {value,label}[]`、`required?`、`disabled?`。数字枚举在 DTO 边界 `Number()`/`String()` 转换 |
| `ComboboxField` | `string` | `label`、`options?`、`loadOptions?`(远程搜索)、`placeholder?`、`required?`、`disabled?`。空值传 `undefined`、回写 `?? ""` |
| `MultiComboboxField` | `string[]` | `label`、`options`、`editable`。`editable=false` 渲染只读 Badge chips;`editable=true` 走 lazy `MultiCombobox` |

必填字段三件套:组件传 `required`(自带星号 + `aria-required`,**不用原生 `required`**——它会抢先弹浏览器气泡盖掉内联错误)+ schema 里 `.min(1, L("Form:Required"))` + `revalidateLogic`。星号纯视觉,真正的拦截靠 schema。

## 校验的四条通道

| 通道 | 怎么写 | 时机 |
|---|---|---|
| **客户端规则** | 一个 zod schema 挂 `validators.onDynamic`,消息走 `L("Form:*")`/业务词条 | 配 `revalidateLogic({ mode: "submit", modeAfterSubmission: "change" })`:提交前不打扰,提交失败后改动即校验 |
| **提交前拦截** | TanStack Form 内建:校验不过不进 `onSubmitAsync`、不发请求 | 自动 |
| **后端错误** | `onSubmitAsync: abpSubmitValidator(submit)`——mutation 抛的 `AbpApiError` 自动解包成 `{ form, fields }`,字段级落对应字段、表单级落 `FormErrors` | 提交后 |
| **自定义业务校验** | 同步:zod `.refine()` / 跨字段 form 级 validator。异步(如用户名唯一性):field 级 `onBlurAsync` + `asyncDebounceMs`,预检接口 | 按需 |

客户端错误和服务端错误走**同一条渲染链**(`field.state.meta.errors → FieldError`),字段组件里已接好,页面无感。

## 字段联动与异步预检(listeners)

字段联动(改 A 清空 B)、失焦异步唯一性预检等用 TanStack Form 的 `listeners`——它**已天然可用**,`<form.AppField>` 直接透传,`abpFormOptions` 只独占 `onDynamic`/`onSubmitAsync`,不挡 listeners:

```tsx
<form.AppField
  name="country"
  listeners={{
    onChange: () => form.setFieldValue("province", ""),
  }}
>
  {(field) => <field.SelectField label={L("…")} options={countries} />}
</form.AppField>
```

异步唯一性预检用字段级 `onBlurAsync` + `asyncDebounceMs`(防抖打预检接口),与提交前的服务端校验互补:

```tsx
<form.AppField
  name="userName"
  asyncDebounceMs={500}
  validators={{
    onBlurAsync: async ({ value }) => (await isTaken(value)) ? L("…:Taken") : undefined,
  }}
>
  {(field) => <field.TextField label={L("…")} required />}
</form.AppField>
```

## 提交失败自动聚焦首错字段

`useAppForm` 在提交结束后会把焦点移到**第一个仍有错误的字段**(客户端校验失败与服务端注入的字段错误都覆盖),靠字段输入的 `id` 定位。

**自定义字段组件契约**:把 `id={field.name}` 转发到其可聚焦元素(内置 `TextField` 等已遵守)。遵守则自动参与聚焦;不遵守则该字段被跳过、焦点顺延到下一个可聚焦的错误字段,**内联错误与 `FormErrors` 汇总照常渲染,信息不丢**。

无障碍上,内置文本/数字/选择/开关字段在无效时会标记 `aria-invalid`(供读屏播报),这与聚焦是两件独立的事;`ComboboxField`/`MultiComboboxField` 暂未标记(其 `Combobox` 原语未透传该属性),属后续项。

## 服务端错误如何落位

`abpSubmitValidator(submit)` 把「跑 mutation + 把失败映射成字段/表单级错误」封装成一个 `onSubmitAsync` 校验器:

1. `submit(value)` 成功 → 返回 `null`,`onSubmit` 收尾回调触发。
2. `submit` 抛 `AbpApiError` → `abpErrorToFieldErrors` 解包信封,`validationErrors[].members`(PascalCase,如 `"Name"`/`"Details.Email"`)逐段转 camelCase 落对应字段,无 member 的落表单级。
3. 映射不出任何字段错误(网络类失败)→ 回退 `Error.message` 作表单级错误,**绝不静默吞掉**。

`concurrencyStamp` 等并发控制字段的回传逻辑写在 `submit` 闭包里(`toUpdateInput(value, record.concurrencyStamp)`),不受本层影响。CRUD 页用 `useAbpSheet` 时 stamp 由 hook 自动注入,无需手动回传——见「CRUD 页:useAbpTable + useAbpSheet」一章。

## 一个必须知道的约束

`useAppForm` 是对 TanStack 原生 hook 的**包装**:它在提交路径会自动清掉上一轮 `onSubmitAsync` 注入的错误(`onSubmit` 槽位)。这是为绕开 `@tanstack/react-form@1.33.2` 的一个死锁——原生行为下,`onSubmitAsync` 注入的**字段级**错误在「不编辑字段直接重提交」时不会自动清除(框架的清理分支只认 `cause !== 'submit'`),会让提交被残留错误永久短路。包装层用模块级 `WeakSet` 守卫保证每个 form 实例只 patch 一次(StrictMode 安全)。

**代价与约定**:这个 `onSubmit` 槽位被约定为「只承载服务端错误」。因此:

- 客户端校验**一律走 `validators.onDynamic`**(配 `revalidateLogic`),不要给某个 field 单独挂 `onSubmit` 校验器——它的错误会被提交路径一并清掉。
- 升级 TanStack Form 大版本后,要重新验证 `form-hook.test.tsx` 里那条「失败后不编辑直接重提交 → 错误清除 + onSubmit 触发一次」的用例。

> 版本事实(截至 2026-07):`@tanstack/react-form` 最新发布版即 `1.33.2`,该字段级 submit 错误不自清的行为无上游修复可替代,故本包装层的 `clearServerSubmitErrors` patch 必须保留。升级大版本后按上文重验 `form-hook.test.tsx` 的死锁回归用例。

## 脱离 ABP 用于其它后端

层 2/3 不含 ABP。在一个纯 shadcn + TanStack 项目里 `shadcn add` 装 form 块(它依赖 combobox 块,先装 combobox),然后写自己的 `mapError`——把后端错误格式映射成通用 `FieldErrors`,例如 `{ errors: { email: "已被占用" } }` 映射成 `[{ field: "email", message: "已被占用" }]`:

```ts
import { serverSubmitValidator, type FieldErrors } from "@/components/form/server-errors";

function myMapError(error: unknown): FieldErrors {
  ...
}

const mySubmitValidator = <T,>(submit: (v: T) => Promise<void>) =>
  serverSubmitValidator(submit, myMapError);
```

之后 `validators.onSubmitAsync: mySubmitValidator(submit)`,层 2 的字段组件、错误渲染、校验时机全部照用。ABP React Start 的卖点就是把这个 `mapError` 连同 CRUD、权限、并发戳预置成了层 4。
