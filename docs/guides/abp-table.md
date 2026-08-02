# abp-table:列表页与 CRUD 维护页

以 ABP demo 后端的 `Book` 实体为例，演示「装完框架后，怎么给自己的实体加一个列表 + 新建/编辑/详情页」。表格侧与表单侧是两个互不 import 的 hook——`useAbpTable` 管列表/查询/删除，`useAbpSheet` 管新建/编辑的抽屉表单；两者返回的都是**实例**，组件长在实例上（`t.Table`、`sheet.Sheet` 这类绑定成员），不手写分页/权限判定这些机制代码，也不需要把 `table`/`crud`/`queryForm` 分别接线到某个装配组件的多个 props 上。

完整可运行的参照就是本仓库的 [`examples/starter/src/routes/_layout/_authed/books/index.tsx`](../../examples/starter/src/routes/_layout/_authed/books/index.tsx)——它用页签把 L0（标准 `useAbpTable`/`useAbpSheet`）、L1（`source` 回调）、L2（纯 `DataTable`）三层摆在同一页对照展示，下面每一步的代码都是从它精简摘出来的，遇到含糊的地方直接去翻那个文件。

## 前提

- 已经跑完 `jc-abp init`（完整步骤见 [`initialize-a-project.md`](initialize-a-project.md)；只挑块装见 [`install-blocks.md`](install-blocks.md)——`data-table`、`combobox`、`date-picker`、`form`、`abp-crud` 都要先于 `abp-table`/`abp-sheet` 装好，块之间没有自动递归），`src/components/abp/crud/crud-service.ts`、`use-abp-table.ts`、`use-abp-sheet.tsx`、`abp-table.tsx` 已落位（内部实现文件随之落位，页面代码只需要 import `use-abp-table.ts`/`use-abp-sheet.tsx` 导出的 `useAbpTable`/`useAbpSheet`）。装法与依赖顺序见 [`install-blocks.md`](install-blocks.md)。
- ABP 后端 swagger 里已经有目标实体的应用服务端点（demo 后端本身就带 `BookAppService`：`GET/POST /api/app/book`、`GET/PUT/DELETE /api/app/book/{id}`）。如果是你自己的实体，先在后端把 CRUD 应用服务写出来、能在 swagger 里看到端点，再回来做前端这一步。

下面照抄 `Book` 实体走一遍。

## ① 确认/重跑 `jc-abp gen`

`jc-abp gen` 读 `abp.api.config.ts`（或 `--input`/`--output` flag）指向的 swagger，用 orval 生成 react-query 客户端到 `src/api/`。**这一步的产物不要手改**——重跑命令会整体覆盖。

```bash
npx jc-abp gen
```

跑完后应该能在这三处看到目标实体的产物（下面以 `Book` 为例）：

- `src/api/endpoints/book/book.ts`：orval 生成的 CRUD 函数与 react-query hooks，如 `getApiAppBook`（list，函数形态）、`useGetApiAppBook`（list hook）、`usePostApiAppBook`（create）、`usePutApiAppBookId`（update）、`useDeleteApiAppBookId`（delete）。
- `src/api/models/`：`AbpSwaggerBooksBookDto`（行/详情 DTO）、`AbpSwaggerBooksCreateUpdateBookDto`（create/update 共用的写入 DTO）。
- `src/api/schemas/book/book.ts`：`postApiAppBookBody`（zod schema，第③步表单校验的基底）。
- 如果目标实体的关联字段要做远程下拉（`Book.authorId` → `Author`），对应的 `getApiAppAuthor` 也会一并生成，第③步会用到。

如果 swagger 里还没有目标端点，先补后端应用服务；`jc-abp gen` 只做「swagger → 前端客户端」这一层转换，不会替你造端点。

> **`examples/starter` 里的 Book 是个例外**：它不来自 `jc-abp gen`。Book/Author 是 ABP BookStore 教程独有的端点，`abp new` 出来的后端没有，示例应用若真按 swagger 生成，换个后端就编不过。所以那几个演示页读的是 `routes/_layout/_authed/books/-book-api.ts`——一份手写的进程内 mock（server function 提供服务端分页/排序/筛选与 ABP 形状的校验错误），导出名与 orval 产物逐字一致，页面代码因此与你的真实项目同构。**你自己的实体走 `jc-abp gen`，不要照抄那个文件。**

## 本页用到的 import

下面各节的代码片段为了聚焦都省了 import。一次列全，按需取用：

```ts
import { createCrudService } from "@/components/abp/crud/crud-service"
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet"
import { useAbpTable } from "@/components/abp/table/use-abp-table"
import { QueryDateRange } from "@/components/abp/table/query-date-range"
import type { TableColumnDef } from "@/components/data-table/table-core"
```

`TableColumnDef` 最容易找不着——它在 `data-table/table-core`，不是从 `@tanstack/react-table` 直接引（原生 `ColumnDef` 的首个泛型位是 `TFeatures` 不是 `TData`，直接用会报 `TS2559`）。

## ② `createCrudService`：service 描述符

`createCrudService({...})` 是一个纯数据描述符——把第①步生成的 react-query hooks 绑进 `useList`/`useCreate`/`useUpdate`/`useDelete` 四个槽位。`useList` 恒为必填；`useCreate`/`useUpdate`/`useDelete` 全部可选——省略哪个，`service` 的类型上那个能力就**彻底不存在**（不是存在但值为 `undefined`），`useAbpTable` 据此判断要不要渲染新建/编辑/删除入口，`useAbpSheet` 则要求 service 必须同时带 create 与 update（下面「只读列表页」一节展开）。`TDto`/`TCreate`/`TUpdate` 从传入的 hook 类型自动推断，**不要**再显式传类型参数（`createCrudService<TDto, TCreate, TUpdate>({...})` 这种写法仍能编译，但会让 `supportsFilter` 的编译期约束回落到宽松默认，见下面「`supportsFilter` 怎么判断」）。

```ts
import {
  getGetApiAppBookQueryKey,
  useDeleteApiAppBookId,
  useGetApiAppBook,
  usePostApiAppBook,
  usePutApiAppBookId,
} from "@/api/endpoints/book/book";

const bookService = createCrudService({
  useList: useGetApiAppBook,
  useCreate: usePostApiAppBook,
  useUpdate: usePutApiAppBookId,
  useDelete: useDeleteApiAppBookId,
  listKey: getGetApiAppBookQueryKey,   // 失效前缀，保存/删除后一次清所有分页态
  supportsFilter: false,               // book 端点无 Filter 参数，此处必填且只能是 false（编译期强制，见下文）
});
```

**为什么是 hook 引用，不是裸函数**：descriptor 直接透传 orval 生成的 react-query hooks，`useAbpTable`/`useAbpSheet` 内部消费——不再手写 `queryFn`/`mutationFn`；`listKey` 落进 orval 的查询键命名空间（`getGetApiAppBookQueryKey()` 是该端点全部分页态共享的前缀），保存/删除成功后两个 hook 都用它一次性使所有分页/排序/过滤组合的缓存失效，不需要页面自己拼 key。

### 只读列表页：不传任何 mutation

只要 `useList` 之外的三个键全部省略，`service` 就是纯只读 service——`useAbpTable` 据此隐藏新建/编辑/删除入口，且**这个 service 传给 `useAbpSheet` 是编译错误**（`useAbpSheet` 的入参类型要求 create 与 update 两个 hook 都存在）。下面用本仓真实存在的 book 端点做示范——同一个端点，这里只取 `useList`，不传 `useCreate`/`useUpdate`/`useDelete`（真实的 `books` 页在第③步会把三者都补上，这里刻意只保留只读的一半做对照，不是另造了一个新端点）：

```ts
const bookListOnlyService = createCrudService({
  useList: useGetApiAppBook,
  listKey: getGetApiAppBookQueryKey,
  supportsFilter: false,
});

const t = useAbpTable(bookListOnlyService, { columns });
return <t.Table />;
```

三个要点：

- **`policy` 怎么定**：`policy` 是一个前缀字符串，`createCrudService` 会按 ABP 约定派生出 `resolvedPolicies.create/update/delete`（`X` → `X.Create`/`X.Update`/`X.Delete`），`useAbpTable`/`useAbpSheet` 用它们判断新建/编辑/删除按钮要不要渲染。如果目标应用服务确实挂了权限特性（如 Identity 的用户服务要 `AbpIdentity.Users`），就传 `policy: IdentityPermissions.Users.Default`；如果后端没给这个应用服务定义策略（demo 后端的 `BookAppService` 就是这样），**不传 `policy`**——`source.can.*` 全部解析为 `true`，跟 `books/index.tsx` 一致。三个粒度不对齐（比如只有 delete 单独一个策略名）就用 `policies: { create, update, delete }` 逐个覆盖，不走前缀派生。策略名不写裸字符串：先在 `src/permissions.ts` 照 ABP 定义类格式给业务模块追加常量（如 `BookPermissions`），再在此引用。
- **`supportsFilter` 怎么判断**：不再是纯眼力活——只要用推断形式调用 `createCrudService`（不传显式类型参数），这个字段的取值就由 `useList` 绑定的端点参数类型编译期约束：端点参数没有 `Filter` 字段时 `supportsFilter` **必填且只能是 `false`**，漏填或填 `true` 都编译报错；端点参数带 `Filter` 字段时保持可选，缺省 `true`。`GetApiAppBookParams` 没有 `Filter` 字段（它有 `Name`/`MinPublishDate`，第⑥步会用到），所以 `bookService` 必须传 `supportsFilter: false`——`t.Table` 因此直接隐藏搜索框，而不是渲染一个点了也不生效的死输入框。对比 `GetApiIdentityUsersParams` 带 `Filter?: string`，`identity/users.tsx` 的 `supportsFilter` 可以不传。**这道约束依赖推断**：一旦给 `createCrudService` 补回显式类型参数，约束会静默回落到宽松默认（相当于端点总有 `Filter`），这不是修复，是把检查关掉。
- **service 是纯数据描述符**，`useAbpTable`/`useAbpSheet` 各自只读它需要的那部分——同一个 `bookService` 可以同时喂给两个 hook（`books/index.tsx` 就是这样），也可以只喂给 `useAbpTable`（只读页不需要 `useAbpSheet`）。

## ③ `useAbpSheet`：表单侧接线

列表 + 侧滑三态表单不需要自己手接 sheet 状态机、`useAppForm` options、create/update 分派——都收在 `useAbpSheet(service, opts)` 里，连同乐观并发 `concurrencyStamp` 回传与 `defaultValues` reset 时序（见下面「内建行为」）一起自动完成。页面只提供值形状、DTO 映射、schema：

```tsx
interface BookFormValues {
  name: string;
  authorId: string;
  type: string;
  publishDate: string;
  price: number;
}

const EMPTY_VALUES: BookFormValues = {
  name: "",
  authorId: "",
  type: "0",
  publishDate: "",
  price: 0,
};

/** 不能走默认：SelectField 是 string 值域（枚举 String/Number 往返）、publishDate 需 date-only 切片。 */
function toRecordValues(record: AbpSwaggerBooksBookDto): BookFormValues {
  return {
    name: record.name ?? "",
    authorId: record.authorId ?? "",
    type: String(record.type ?? 0),
    publishDate: record.publishDate ? record.publishDate.slice(0, 10) : "",
    price: record.price ?? 0,
  };
}

/** 不能走默认：SelectField 是 string 值域（枚举 String/Number 往返）、publishDate 需 date-only 切片；
 *  create/update 共用同一映射，故命名为 toInput 而非 toCreateInput/toUpdateInput。 */
function toInput(value: BookFormValues): AbpSwaggerBooksCreateUpdateBookDto {
  return {
    ...value,
    type: Number(value.type) as AbpSwaggerBooksCreateUpdateBookDto["type"],
  };
}

function BooksPage() {
  const L = useLocalization();

  // 以生成的 body schema 为基底：max(128) 这类后端约束免费继承；`type` 是表单 SelectField 的
  // string 值域，与生成侧的 number literal union 冲突，omit 后重声明。
  const bookSchema = postApiAppBookBody.omit({ type: true }).extend({
    type: z.string(),
    name: z.string().trim().min(1, L("App::BookNameRequired")).max(/* … */),
    authorId: z.string().min(1, L("App::BookAuthorRequired")),
    publishDate: z.string().min(1, L("App::BookPublishDateRequired")),
    price: z.number(L("App::BookPriceRequired")).min(0, L("App::BookPriceInvalid")),
  });

  const sheet = useAbpSheet(bookService, {
    emptyValues: EMPTY_VALUES,
    toValues: (record: AbpSwaggerBooksBookDto) => toRecordValues(record),
    toCreate: toInput,
    toUpdate: toInput,
    schema: () => bookSchema,
  });

  // …columns 见第④步，t 见第⑤步

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-normal">
        {L("App::Books")}
      </h1>
      {/* …t.Table 见第⑤步 */}
      <sheet.Sheet>
        <sheet.form.AppForm>
          <sheet.form.FormErrors />
        </sheet.form.AppForm>

        <sheet.form.AppField name="name">
          {(field) => (
            <field.TextField label={L("App::BookName")} required disabled={sheet.readOnly} />
          )}
        </sheet.form.AppField>
        {/* …authorId/type/publishDate/price 字段同型，完整代码见 examples/starter/src/routes/_layout/_authed/books/index.tsx */}
      </sheet.Sheet>
    </section>
  );
}
```

几个要点：

- **`toValues`/`toCreate`/`toUpdate` 是页面唯一要写的 DTO 映射，且三者都可省**：不传时 `toValues` 缺省按 `emptyValues` 的键从记录 pick、null/undefined 回退到空值；`toCreate`/`toUpdate` 缺省做 identity 变换（仅当表单值类型结构上可赋给对应 DTO 时才允许缺省，这是编译期条件必填——形状不匹配时省略直接报错，不是运行时才发现传错字段）。`roles.tsx` 三个都不传，因为它的表单形状 ≡ DTO 子集，样板已删（不要照抄一份「什么都不做」的映射函数回去）。显式写映射函数有两种不同的理由，不要混为一谈——展开见下面「什么时候必须显式映射」。`toValues(record, mode)` 把行 DTO 转成表单值（可以异步预取关联数据，`identity/users.tsx` 就是先 `GET .../roles` 取一次角色再拼进表单值；返回 `null` 表示取消打开，由调用方自行提示）。
- **`schema` 是函数形态** `(mode) => zodSchema`，不是裸 schema——mode 相关的必填规则（如「只在 create 态必填」）在这一层用 `mode` 分支解决。`books`/`roles` 没有 mode 相关字段，`schema: () => bookSchema` 是最简形式；`identity/users.tsx` 的 `password` 字段与 `tenants/index.tsx` 的 `adminEmailAddress`/`adminPassword` 都是 `mode === "create"` 三元决定要不要校验的例子。
- **`sheet.Sheet` 已经铺好三态 chrome**（title/pending/canEdit/onEdit/open/onOpenChange），页面只管往里塞字段。
- **条件字段用 `sheet.mode`**（如 `{sheet.mode === "create" && <sheet.form.AppField ...>}`，`identity/users.tsx` 的 `password` 字段、`tenants/index.tsx` 的 `adminEmailAddress`/`adminPassword` 都是这个写法），行记录用 `sheet.record`（如回显关联字段的 label 种子，`books/index.tsx` 里 `authorSeed` 的写法）；只读态用 `sheet.readOnly`。
- **`sheet.form` 就是一个普通 `useAppForm` 返回值**，`AppField`/`AppForm`/`FormErrors`/`Subscribe` 照常用；表单标准姿势的原理（三件套、`abpSubmitValidator`）见 [`forms.md`](./forms.md)。

字段渲染用 `sheet.form.AppField` + 预绑定组件，`label`/必填星号（`RequiredMark`）/`aria-required`/`data-invalid`/行内 `FieldError` 都在组件内部长好，页面只传语义 prop；`view` 态同样是 `disabled={sheet.readOnly}` 灰掉，不是另写一套只读渲染。数字字段（`field.NumberField`）内部已经处理了「空串裸转 `Number` 会静默变成 `0`」这个坑（映射成 `NaN` 交给 `z.number()` 判失败，回显时再显示成空串），页面直接用，不需要自己写这段转换逻辑。

关联字段（`authorId`）走 `field.ComboboxField` 远程搜索，见下面「常见坑」第一条的 `loadAuthorOptions` 退化写法。

### 什么时候必须显式映射

`toValues`/`toCreate`/`toUpdate` 能不能省，不是眼力活，但也不是只有一种「必须」——要分清两种不同的理由，混为一谈会误判某个映射函数「多余」而删掉：

**① 类型层条件必填：形状不匹配，省略编译不过。** `AbpSheetOptions` 的 `toCreate`/`toUpdate` 是条件类型——`TValues extends TCreate`（或 `TUpdate`）成立时才允许省略；不成立（表单值类型缺 DTO 要求的必填字段、或字段类型不兼容）时，`toCreate`/`toUpdate` 变成必填参数，不传直接编译报错。这类不用你判断，编译器会替你判断：

- **字段值域转换**：[`books/index.tsx`](../../examples/starter/src/routes/_layout/_authed/books/index.tsx) 的 `toInput`——`type` 字段 `SelectField` 是字符串值域，DTO 是数字字面量联合，两者结构上不兼容，`toInput` 若省略编译不过。

**② 表单形状与 DTO 结构上匹配，但业务上必须收窄。** 这类**编译器不会替你拦**——省略在类型层完全合法（`TValues extends TCreate/TUpdate` 仍成立），但默认的 identity 变换会把不该发的字段也带上，必须显式写：

- **关联数据异步预取**：[`identity/users.tsx`](../../examples/starter/src/routes/_layout/_authed/identity/users.tsx) 的 `toValues`——用户 DTO 不带 `roleNames`，打开前要先 `GET .../roles` 取一次角色再拼进表单值。
- **敏感字段不回显**：同样是 `identity/users.tsx`——`toRecordValues` 把 `password` 固定回填成空串，`toUpdateInput` 干脆不映射这个键，留空即「不改」。
- **空串归一 undefined**：`identity/users.tsx` 的 `toCreateInput`/`toUpdateInput` 对 `name`/`surname`/`phoneNumber` 都做了 `value.x || undefined`，避免「用户没填」被误报成「用户把它清空了」。
- **防止字段泄漏（create/update 字段集不对称）**：[`tenants/index.tsx`](../../examples/starter/src/routes/_layout/_authed/tenants/index.tsx) 的 `toUpdateInput`——`create` 多收 `adminEmailAddress`/`adminPassword`（开租户时建种子管理员），`TenantUpdateDto` 本身只要求 `name` 必填，`TenantFormValues` 结构上其实**仍然满足** `extends TenantUpdateDto`（多出的两个字段不影响赋值兼容性）,所以类型层 `toUpdate` 其实**可以省略**——但省略后默认 identity 变换会把这两个空字符串也塞进 PUT 请求体，靠后端「忽略未知属性」的隐式契约兜底，而不是让接口形状本身说话。`toUpdate: (value) => ({ name: value.name })` 因此是业务/安全选择,不是编译器逼出来的,页面组件里那句「toUpdate 显式保留」的注释就是在说明这一点。真正会被类型层强制显式传的场景见 [`test/abp-sheet-contract.test-d.ts`](../../examples/starter/test/abp-sheet-contract.test-d.ts) 的负例——「目标 DTO 存在 TValues 没有的必填字段」。

两种理由都成立时，函数上补一句 TSDoc 说明原因，让后来者一眼分清「这是真业务，不是漏迁移的样板」。以上情形之外、表单形状确实等于 DTO 子集时（如 `roles.tsx`），不传就是最小必要改动。

### 校验 schema：以生成的 body schema 为基底

不要从 `z.object({...})` 手写空白 schema——`jc-abp gen` 已经把后端 DTO 的校验特性（`[Required]`/`[StringLength]` 等）编译进 `@/api/schemas/<module>/<module>` 的 body schema（如 `postApiIdentityRolesBody`）。手写 schema 只照抄了必填，漏掉 `max` 这类长度约束，超长输入会一路提交到后端才收到 400——用生成的 schema 当基底、`.extend()` 只覆盖 UI 层需要而生成侧没有的语义（`trim`、必填的本地化消息），`max` 等约束原样继承：

```tsx
// roles.tsx 的 name 校验规则单独落到同目录的 -role-schema.ts（见下方说明），导出成具名工厂
// 而不是页面组件内的局部变量——校验规则是页面对外行为的一部分，测试要挂真实产物，不能只测
// 一份复刻。
export function buildRoleSchema(L: Localize) {
  return postApiIdentityRolesBody.extend({
    name: z
      .string()
      .trim()
      .min(1, L("Form:Required"))
      .max(postApiIdentityRolesBodyNameMax, L("Form:MaxLength", postApiIdentityRolesBodyNameMax)),
  });
}

// roles.tsx 组件内：
const roleSchema = buildRoleSchema(L);
```

三条要点：

- **后端约束免费继承**：`.extend()` 只重声明要覆盖的键，没提到的键原样沿用生成 schema 的校验规则和类型。
- **UI 必填与词条消息用 `extend` 覆盖**：生成侧的 `min(0)` 只表示「非负长度」，不等于 ABP 的 `[Required]`（会放行空串）；真正的必填语义、`trim`、以及要走 `L()` 的本地化消息都在 `extend` 里针对该字段重新声明。
- **表单值域与生成侧冲突的键，`omit` 后重声明**：像 `books` 的 `type`——`SelectField` 的值域是字符串，生成侧是 number literal union，两者类型不兼容，先 `.omit({ type: true })` 摘掉这个键，再在 `extend` 里补一个 `z.string()`。

**schema 工厂要具名导出，护栏才能挂真实产物**：校验规则（尤其 `max` 这类边界值）是页面对外行为的一部分，组件测试如果只在挂具里复刻同一套 `.extend(...)` 调用，页面代码将来悄悄改回手写 schema、漏掉 `max`，测试仍然全绿——护栏名存实亡。因此把 schema 构造提成具名导出的工厂函数，测试直接 `import` 它来搭挂具。`roles.tsx` 本身经 `@/auth` 引入了 `@tanstack/react-start` 的 server fn，在没有接 `tanstackStart` vite 插件的纯 `vitest` 环境下无法被测试文件直接 import（`Missing "#tanstack-router-entry" specifier`）——遇到这种情况，把 schema 工厂拆到同目录的 `-` 前缀文件（如 `identity/-role-schema.ts`，路由生成器按前缀跳过，不会被误当路由），只依赖 `zod`/生成的 body schema/`@jcoder/abp-react/react` 的 `Localize` 类型，页面与测试各自 `import` 同一份实现。

## ④ 列定义

`TableColumnDef<TDto>[]`（v9 的原生 `ColumnDef` 首个泛型位是 `TFeatures` 不是 `TData`，直接用会报 `TS2559`；`TableColumnDef` 是已绑好特性集的别名），`header` 走 `useLocalization()` 的 `L()` 取词条：

```ts
const columns = useMemo<TableColumnDef<AbpSwaggerBooksBookDto>[]>(
  () => [
    { accessorKey: "name", header: () => L("App::BookName") },
    { accessorKey: "authorName", header: () => L("App::BookAuthor"), enableSorting: false },
    {
      accessorKey: "publishDate",
      header: () => L("App::BookPublishDate"),
      cell: ({ getValue }) => {
        const value = getValue() as string | undefined;
        return value ? value.slice(0, 10) : "";
      },
    },
  ],
  [L],
);
```

`header` 里要用 `L()` 就必须把 `columns` 写在组件体内，而 `columns` 又必须引用稳定——`useAbpTable` 内部的 `useDataTable` 每渲染收到新数组都会重建列模型。好在 `useLocalization()` 返回的 `L` 引用稳定，所以 `useMemo(() => [...], [L])` 等价于永久 memo，两个约束不冲突。列里若还引用了其它组件内值（如某个 `useState`），一并写进依赖数组，不要漏。违反引用稳定契约时 DEV 期会有 `console.warn` 提示。

关联字段（如 `authorName`）、枚举字段（如 `type`）大多不支持服务端排序，记得给 `enableSorting: false`；后端没排过序的列硬允许排序，点了也是空转。

**后端排序字段名与列 id 不一致时**：`toAbpListParams` 直接拿 `column.id` 拼 `Sorting` 参数。前端列叫 `authorName`、后端要 `author.name` 的话，请把列 id 显式设成**后端认的名字**、用 `accessorFn` 取值：

```ts
{ id: "author.name", accessorFn: (row) => row.authorName, header: () => L("App::BookAuthor") }
```

写成 `accessorKey: "authorName"` 会让请求带上 `Sorting=authorName`，后端不认——**不报错，只是排序不生效**。

### 多列排序

- **怎么用**：按住 <kbd>Shift</kbd> 点表头可把该列叠加为第二、第三排序列（不按 <kbd>Shift</kbd> 点表头是替换，只留这一列）。
- **怎么读**：两列以上排序时，表头会在列名后显示优先级序号（1 = 主排序、2 = 次排序……）；只排一列时不显示。
- **怎么退出**：两列以上排序时工具条自动出现「清除排序」按钮，点一次清空全部排序列——**缺省就在**。单列态下点掉表头（三态循环到「不排序」）同样能退出。

后端侧不需要额外接线：`toAbpListParams` 会把多列排序状态拼成形如 `"roleName,creationTime desc"` 的 `Sorting` 参数发给 ABP，后端的 System.Linq.Dynamic 原生支持这种逗号分隔的多字段排序表达式——这不是前端画出来的假排序。

## ⑤ `useAbpTable`：表格侧接线 + JSX 组装

`useAbpTable(source, opts)` 建查询表单、把结构化筛选参数收在 hook 内部、把 service 归一成 `AbpTableSource`、再建 TanStack 表实例——一次调用给出页面渲染需要的全部东西：

```tsx
const t = useAbpTable(bookService, {
  columns,
  selectable: true,
  query: { defaults: { Name: "", MinPublishDate: "" } },
  onOpen: sheet.open,
});
```

`onOpen` 接 `sheet.open`（跨 hook 的唯一一根接线）就是表格侧对「打开表单」的全部认知——`t` 不知道、也不需要知道 `sheet` 内部长什么样；不接 `onOpen` 就是纯列表页（查看/编辑项不渲染，症状可见非静默，不是悄悄没反应）。

`t` 返回的绑定成员按 JSX 里的位置分工：

```tsx
return (
  <section className="space-y-4">
    <h1 className="text-2xl font-normal">
      {L("App::Books")}
    </h1>

    <t.Table>
      <t.QueryForm>
        <t.queryForm.AppField name="Name">
          {(f) => <f.TextField label={L("App::BookName")} />}
        </t.queryForm.AppField>
        <t.queryForm.AppField name="MinPublishDate">
          {(f) => <f.DateField label={L("App::BookPublishedAfter")} />}
        </t.queryForm.AppField>
      </t.QueryForm>

      <t.BulkBar>
        <t.BulkDelete />
      </t.BulkBar>
    </t.Table>

    <sheet.Sheet>{/* 见第③步 */}</sheet.Sheet>
  </section>
);
```

`t.Table` 只认三种直接子元素——`t.QueryForm`（查询区，见第⑥步）、`t.BulkBar`（批量条，见第⑨步）、`t.Toolbar`（工具条追加项，见第⑩步）；不传即整块不出现，传别的元素会触发 DEV 告警且被忽略。这三个绑定成员的**引用跨渲染稳定**（工厂产出，不是每渲染新建的组件），children 里剩下的排列（骨架/空态/错误态、分页、搜索框、列显隐菜单、新建按钮）全由 `t.Table` 内部铺好。

## ⑥ 结构化筛选

查询区本就是 TanStack Form——`t.queryForm` 是 `useAppForm` 的普通返回值，`t.queryForm.AppField` 是唯一的字段写法，跟表单侧的 `sheet.form.AppField` 同一个 idiom。**渲染的每个字段名必须在 `query.defaults` 里声明初值**（哪怕是字符串空值 `Name: ""`）——`t.queryForm.AppField` 的 `name` 类型就是 `query.defaults` 声明对象的 keyof,不是全量的端点参数类型,写 `name="Naem"` 这种拼错在编译期就报错,「渲染字段未在 defaults 声明」这类此前只能靠运行时兜底/崩溃的情况变成编译不过。

```tsx
const t = useAbpTable(bookService, {
  columns,
  query: { defaults: { Name: "", MinPublishDate: "" } },
  onOpen: sheet.open,
});
```

```tsx
<t.QueryForm>
  <t.queryForm.AppField name="Name">
    {(f) => <f.TextField label={L("App::BookName")} placeholder={L("App::BookName")} />}
  </t.queryForm.AppField>
  <t.queryForm.AppField name="MinPublishDate">
    {(f) => <f.DateField label={L("App::BookPublishedAfter")} />}
  </t.queryForm.AppField>
</t.QueryForm>
```

跟 [`books/index.tsx`](../../examples/starter/src/routes/_layout/_authed/books/index.tsx) 完全一致——这就是整份查询区所需的全部代码。`GetApiAppBookParams` 只有 `Name`/`MinPublishDate` 两个端点自有查询参数，没有上界字段，所以 books 页只声明这两个真实字段，不伪造一个后端会静默丢弃的 `MaxPublishDate`。

查询区不是独立卡片——`t.QueryForm` 的字段整体渲染进表格卡片内的**高级筛选面板**：带正常标签、三列网格，底部是面板自己的「重置 / 查询」按钮行。面板默认收起，由顶部条右侧功能组里的漏斗钮开合（与刷新/密度/列设置同组，勾选行进入批量态时也不会消失）。面板展开时左区的快速搜索框会让位——面板里是精确的字段筛选，同屏再摆一个模糊搜索是重复入口；收起后若仍有筛选生效，漏斗钮带一个圆点提示（读屏另有「已应用 N 个筛选条件」）。

### `QueryDateRange`：区间字段的单控件写法

两端字段（如「起止日期」）要放进查询区时用 `QueryDateRange`——一个 `DateRangePicker` 同时读写两个扁平查询参数（`from`/`to` 仍与后端 DTO 一一对应），不需要像旧版双字段拼接写法那样手动拼两个 `t.queryForm.AppField`。**本仓库现有端点（book/users/roles/tenants）都只有单侧下界参数,没有一个真的有对应的上界字段,端点只有下界参数时用上面那份 `MinPublishDate` 单 `f.DateField` 写法**（即 `books` 页实际用的写法）——下面是一个假想端点确实带上下界两个日期参数时的写法,你的端点需要真有这两个参数才能照抄:

```tsx
const t = useAbpTable(bookService, {
  columns,
  query: { defaults: { Name: "", MinPublishDate: "", MaxPublishDate: "" } },
  onOpen: sheet.open,
});
```

```tsx
<QueryDateRange
  form={t.queryForm}
  from="MinPublishDate"
  to="MaxPublishDate"
  label={L("App::PublishDate")}
/>
```

`QueryDateRange` 直接接 `t.queryForm`，不需要外面再套 `t.queryForm.AppField`——`from`/`to` 两个字段名由组件内部订阅/写回，一次区间选择同时更新两端。**端点只有下界参数时用单 `f.DateField`**（即上面 books 页实际用的写法），不要为了凑一个不存在的上界参数伪造一个后端会静默丢弃的字段。

### 字段怎么渲染

- 不传 `options`：落到 `TextField`（`type="date"` 时渲染成 `<input type="date">`）。
- 传 `options`：落到 `SelectField`。
- 需要别的控件（远程 combobox、多选、开关）：`children` 里直接用对应的字段组件（`f.ComboboxField`/`f.MultiComboboxField`/`f.SwitchField`），跟表单侧字段同一套组件，用法一致。

### `queryDefaults`：默认值只有一处

默认值挂在 `query.defaults` 上,字段本身**不带** `default`。首帧就带着这份默认值发一次请求（不是先发一次未筛选的请求、挂载后再发一次筛选过的,那样会有一闪而过的未筛数据）；点【重置】回到这份默认值并立即重新生效——不需要用户紧接着再点一次【查询】。

这也是「混入一个固定参数（如租户 id）」的写法：`query.defaults` 里放一个没有对应 `t.queryForm.AppField` 的键,它会一直留在 `defaultValues` 里,每次提交、每次重置都带着——等价于旧版本的 `extraParams`,但这份键名受端点参数类型约束,拼错编译期就报错。

### 计算型默认值必须在 route `loader` 里算

「默认查最近一周」是最常见的真实默认值，也最容易写错的一种：

- **渲染期算 `new Date()` 会水合不一致**——服务端与客户端可能跨时区、跨午夜，算出不同的日期。
- **「最近一周」是相对哪个时区**——ABP 的租户时区在应用配置的 `timing.timeZone.iana` 上；用浏览器本地时区去算，跨时区的租户看到的窗口会算错。

正确写法是在 route 的 `loader` 里算好、经 `Route.useLoaderData()` 取出来再传给 `query.defaults`——`loader` 在 SSR 时只在服务端跑一次，结果序列化给客户端，两端从构造上就是同一个值：

```tsx
function lastWeekIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

export const Route = createFileRoute("/_layout/_authed/books/")({
  loader: () => ({ defaultSince: lastWeekIso() }),
  component: BooksPage,
})

function BooksPage() {
  const { defaultSince } = Route.useLoaderData()
  const t = useAbpTable(bookService, {
    columns,
    query: { defaults: { Name: "", MinPublishDate: defaultSince } },
    onOpen: sheet.open,
  })
  // ……
}
```

### 跨字段校验要给 issue 一个具体 `path`

这项校验挂在 `query.validators` 上：

```tsx
const t = useAbpTable(bookService, {
  columns,
  query: {
    defaults: { Name: "", MinPublishDate: "", MaxPublishDate: "" },
    validators: {
      onDynamic: z
        .object({ MinPublishDate: z.string().optional(), MaxPublishDate: z.string().optional() })
        .refine((v) => !v.MinPublishDate || !v.MaxPublishDate || v.MinPublishDate <= v.MaxPublishDate, {
          message: L("App::BookDateRangeInvalid"),
          path: ["MaxPublishDate"], // 挂到具体字段，错误才会走该字段的内联渲染
        }),
    },
  },
});
```

不给 `.refine` 的 issue 挂 `path`，错误会落进 `errorMap.onDynamic` 的 `""` 桶——现有 `FormErrors` 只订阅 `onSubmit`，渲染不出来，提交被拦下但界面毫无反应。DEV 期会用 `console.warn` 把这种情况喊出来，但正解还是把 `path` 挂到某个具体字段上。

### 现实提醒：多数 ABP 内置端点用不上

`AbpIdentity`/`AbpTenantManagement` 这类模块自带的端点（用户、角色、租户）只暴露一个 `Filter` 字符串，没有逐字段查询参数。结构化筛选是给**你自己的业务端点**用的，需要后端 input DTO 上真有对应参数——标准做法是自定义 `GetXxxListDto : PagedAndSortedResultRequestDto`，在其上加业务字段（即本节示例用到的 book 端点的 `Name`/`MinPublishDate`）。

## ⑦ 路由页面文件落位

TanStack Start 文件路由，落到 `src/routes/_layout/_authed/books/index.tsx`（`_layout` 是侧边栏布局壳、`_authed` 是登录守卫壳，两个都是 pathless layout route）：

```tsx
export const Route = createFileRoute("/_layout/_authed/books/")({
  component: BooksPage,
});
```

**`beforeLoad: requirePermission(...)` 什么时候要**：只有第②步给 `createCrudService` 传了 `policy`（或对应的 `policies`）、也就是后端确实用权限特性保护了这个应用服务时才需要加。`books/index.tsx` 因为 demo 后端没给 book 定义策略，路由上没有 `beforeLoad`；`identity/users.tsx` 有 `AbpIdentity.Users` 策略，路由上就要对齐：

```tsx
import { IdentityPermissions } from "@/permissions";

export const Route = createFileRoute("/_layout/_authed/identity/users")({
  beforeLoad: requirePermission(IdentityPermissions.Users.Default),
  errorComponent: RouteError,
  component: UsersPage,
});
```

`requirePermission` 从 `@/auth` 导入，`errorComponent: RouteError` 让路由级硬错误只占内容区、侧栏保持在位（来自 `@/routes/shell-boundary`）。两处策略名必须一致——`crud-service` 的 `policy` 只控制按钮显隐，真正拦访问的是路由这层的 `beforeLoad`，少加这一步页面本身可以直接绕开按钮隐藏点 URL 进去。

## ⑧ 行操作

`row` 配置块收在 `useAbpTable` 第二参上（引用必须稳定：模块级函数或 `useCallback`）：

```tsx
const t = useAbpTable(roleService, {
  columns,
  row: { menu: permissionMenuItem },
  onOpen: sheet.open,
});
```

`AbpTableRowConfig` 的六个键（`view`/`edit`/`delete` 三个各自独立、只是语义相近合并成一行展示）：

| 键 | 签名 | 语义 |
|---|---|---|
| `menu` | `(row, table) => ReactNode` | 追加在内置「···」菜单三项（查看/编辑/删除）之后 |
| `actions` | `(row, table) => ReactNode` | 插入内置「···」菜单**左侧**，行内常驻 |
| `view`/`edit`/`delete` | `boolean` | 覆盖对应内置项的默认出现条件 |
| `click` | `false \| ((row) => void)` | 覆盖「点行开详情」的默认行为；`false` 关闭 |

内置项默认出现条件：查看——`click === false && onOpen !== undefined`（点行被关掉时才出现「查看」，两者都开会让同一个动作有两个入口）；编辑——`source.can.update && onOpen !== undefined`；删除——只读 service（无 `useDelete`）恒不出现，其余按 `source.can.delete`。菜单里一项都没有时，「···」触发器整个不渲染，不会留一个点开是空的按钮。

**真实用例**：[`identity/roles.tsx`](../../examples/starter/src/routes/_layout/_authed/identity/roles.tsx)、[`identity/users.tsx`](../../examples/starter/src/routes/_layout/_authed/identity/users.tsx) 都用 `row.menu` 把「权限管理」收进「···」菜单（不再行内常驻）：

```tsx
// 引用必须稳定：进 useAbpTable 的 columns memo 依赖，内联箭头会让列模型每渲染重建（DEV 有 churn 告警）。
const permissionMenuItem = useCallback(
  (row: VoloAbpIdentityIdentityRoleDto) =>
    canManagePermissions ? (
      <DropdownMenuItem onSelect={() => setPermissionsFor(row)}>
        <KeyRound />
        {L("Admin:Permissions")}
      </DropdownMenuItem>
    ) : null,
  [canManagePermissions, L],
);

const t = useAbpTable(roleService, { columns, row: { menu: permissionMenuItem }, onOpen: sheet.open });
```

高频、要一键触达的操作适合改用 `row.actions`（占一个常驻图标位换取可发现性，触屏设备没有 hover，是保证高频入口可发现的唯一办法）；低频、可以多点一次收纳进菜单的操作用 `row.menu`——本仓 roles/users 两页选择把「权限管理」收进菜单，把行内位置留给更克制的默认排列。两种写法示意（`row.actions` 版本，供对照，非本仓实际代码）：

```tsx
row: {
  actions: (row) =>
    canManagePermissions ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={L("Admin:Permissions")}
                  onClick={() => setPermissionsFor(row)}>
            <KeyRound />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{L("Admin:Permissions")}</TooltipContent>
      </Tooltip>
    ) : null,
}
```

**接管排列**：`row.menu`/`row.actions` 只能「加」，不能重排「···」菜单外壳本身或彻底改变菜单/常驻插槽的相对位置——要做到这一步，见文末「选层指南」里的 L3（fork `abp-table.tsx`）。

## ⑨ 批量条

`t.BulkBar` 是批量态的容器，选中数 > 0 时自动出现，内容由页面决定。批量删除有内置实现 `t.BulkDelete`——删除 mutation 与列表失效都已经在 source 上，页面再写一遍就是把同一份样板抄进每个 CRUD 页：

```tsx
<t.BulkBar>
  <t.BulkDelete />
</t.BulkBar>
```

`t.BulkDelete` 自带二次确认对话框、逐条删除、结果汇总与选择态回填，页面零接线。它在 `source.can.delete` 为假时自渲染为 `null`，不必再套 `{t.source.can.delete && …}`。

其余批量动作仍然自己写——`t.selectedRows`（`TDto[]`）与 `t.keepSelected`（`(ids: string[]) => void`）是入口，和内置删除并排放即可：

```tsx
<t.BulkBar>
  <Button
    variant="ghost"
    size="sm"
    onClick={() => toast.success(L("App::ExportSelected", t.selectedRows.length))}
  >
    {L("App::ExportSelected", t.selectedRows.length)}
  </Button>
  <t.BulkDelete />
</t.BulkBar>
```

几个要点：

- **为什么是 N 次单删**：这套 ABP 后端没有任何批删端点（全是 `DELETE /{id}`），`t.BulkDelete` 逐条串行调用 `source.delete`，不并发——ABP 的删除常连带关联清理，并发提交容易撞上后端的并发/死锁保护，把「后端拒绝」误算成「这条删不掉」。
- **只发一条提示**：批量走的是另一个不带回调的 mutation 实例。单条删除的 `onSuccess`/`onError` 是逐条触发的，复用它删 N 条就会弹 N 个 toast、发 N 次失效重取；整批只在结束后失效一次。
- **结果按三分支汇总**：全成功 `Crud:Deleted`；全失败 `Crud:OperationFailed`；部分失败 `Crud:BulkDeletePartialFailure`（`{0}` 成功数 `{1}` 失败数）——不能只报「失败」而把成功了几条丢掉。
- **失败的行留在勾选里**：成功的行随失效重取从列表消失、天然退出选中；失败的行经 `keepSelected` 留在选中态，用户不用重新勾选，直接再点一次就是重试。
- **自实现数据源要支持批删**，得在 `AbpTableSource.delete` 上给出可选的 `many(ids) => Promise<{ failed: string[] }>`；没给则 `t.BulkDelete` 不渲染并在 DEV 告警（`createCrudService` 的产物自带）。

## ⑩ 工具条追加

顶部条右区（刷新 · 导出 · 密度 · 列设置）大半是内建能力，不用接线：刷新对当前查询发起 `refetch`，拉取中图标自转；密度在舒适 / 紧凑两档间切换（行高见 DESIGN.md「Data tables」，随行内是否有操作按钮而不同），状态存内存；列显隐菜单同理。三者只要用 `useAbpTable`/`t.Table` 就自动出现。

导出是唯一的插槽式能力——`useAbpTable(bookService, { onExport: () => exportCsv(t.getListParams()) })`：传了 `onExport` 顶部条才会渲染导出图标，不传就不出现；组件库不内置任何导出实现（CSV/XLSX 都不假设），点击只是把回调转发出去，`t.getListParams()` 返回当前已提交的完整请求参数（分页/排序/搜索 + 结构化筛选合并后的快照，不是表单草稿），业务方自己决定导出全部匹配行还是别的语义。

`t.Toolbar` 把内容追加在内建「新建」按钮右侧，用于 `onExport` 覆盖不了的自定义工具条动作。本仓库现有页面都还没有这类追加操作，下面是等价于上面 `onExport` 示例的 `t.Toolbar` 写法，仅在需要自定义按钮外观（而非内建导出图标）时才用这条路：

```tsx
<t.Table>
  {/* …t.QueryForm / t.BulkBar 见上 */}
  <t.Toolbar>
    <Button variant="outline" size="sm" onClick={() => exportCsv(t.getListParams())}>
      {L("App::ExportAll")}
    </Button>
  </t.Toolbar>
</t.Table>
```

`exportCsv` 是业务自己实现的导出函数（示意），`t.Toolbar`/`t.getListParams` 都是真实的绑定成员/方法。

## 选层指南

本仓库的表格/CRUD 能力分四层，从上到下依次收窄适用面、放开控制力。挑层的原则是「够用就好」——不要因为某个更底层存在就默认往下走。

| 你的情况 | 用哪层 |
|---|---|
| 标准 ABP 后端 CRUD 页（含纯表格页、跳路由页） | `useAbpTable`（+ 需要新建/编辑时加 `useAbpSheet`） |
| 数据源不走 `createCrudService`，但仍要 ABP 式装配（权限门控/行操作/错误态/分页钳制） | `useAbpTable` 传 `(params) => AbpTableSource` 回调，参考实现见 [`books/-tiers/books-l1-demo.tsx`](../../examples/starter/src/routes/_layout/_authed/books/-tiers/books-l1-demo.tsx) |
| 非 ABP 的通用表（无分页协议假设） | L2 `useDataTableState` + `useDataTable` + `<DataTable table={dt}>`，参考实现见 [`books/-tiers/books-l2-demo.tsx`](../../examples/starter/src/routes/_layout/_authed/books/-tiers/books-l2-demo.tsx) |
| 要改装配本身（重排「···」菜单外壳、批量条排布、工具条结构） | fork 对应的装配组件文件（`abp-table.tsx`/`abp-query-form.tsx`/`abp-bulk-bar.tsx`/`row-actions-menu.tsx`……），copy-in 分发下这本就是正当用法 |

`useAbpPage`/`useAbpCrud`/`useCrud`/`QueryField`/`QueryRange`/`tableRef`/`render*` 系列回调已全部退役，不再出现在页面代码里。`books` 页把前三档摆在同一个页面里做成页签（`index.tsx` 的 `Tabs`），可以直接切换比对。

**自定义数据源（`source` 回调）**：`useAbpTable` 第一参既可以是 `createCrudService` 的产物，也可以是 `(params: ListParams) => AbpTableSource<TDto>` 回调，回调内部可以无条件调用其他 hook——种类（service / 回调）在一次 `useAbpTable` 调用的生命周期内不得跨渲染切换，但这不是问题，因为调用方本就只会恒传其中一种。回调要产出的 `AbpTableSource<TDto>` 形状：

```ts
export interface AbpTableSource<TDto> {
  listQuery: { data?: PagedResult<TDto>; isPending: boolean; isFetching: boolean; isError: boolean; refetch?: () => void };
  pageCount: number;
  totalCount: number;
  delete?: { mutate: (id: string) => void };   // 只读数据源不带这个键
  can: { create: boolean; update: boolean; delete: boolean };
  supportsFilter: boolean;
}
```

`books-l1-demo.tsx` 的写法：

```tsx
const t = useAbpTable<AbpSwaggerBooksBookDto>(
  (params) => {
    // biome-ignore lint/correctness/useHookAtTopLevel: source 回调种类跨渲染不变，分支 lifetime 稳定
    const listQuery = useGetApiAppBook(params, {
      query: { placeholderData: keepPreviousData, select: toPagedResult },
    });
    const totalCount = listQuery.data?.totalCount ?? 0;
    return {
      listQuery: {
        data: listQuery.data,
        isPending: listQuery.isPending,
        isFetching: listQuery.isFetching,
        isError: listQuery.isError,
        refetch: () => void listQuery.refetch(),
      },
      pageCount: Math.max(Math.ceil(totalCount / params.MaxResultCount), 1),
      totalCount,
      delete: { mutate: (id: string) => deleteBook.mutate({ id }) },
      can: { create: false, update: false, delete: true },
      supportsFilter: false,
    };
  },
  { columns },
);

return <t.Table />;
```

**L2 通用表**（非 ABP 数据源，`books-l2-demo.tsx`）：

```tsx
const state = useDataTableState();
const listQuery = useGetApiAppBook(toAbpListParams(state.params), {
  query: { placeholderData: keepPreviousData },
});
const dt = useDataTable({
  state,
  columns,
  data: listQuery.data?.items ?? [],
  pageCount: Math.max(Math.ceil((listQuery.data?.totalCount ?? 0) / state.pagination.pageSize), 1),
  rowCount: listQuery.data?.totalCount ?? 0,
});

return (
  <DataTable
    table={dt}
    loading={listQuery.isPending}
    fetching={listQuery.isFetching && !listQuery.isPending}
  />
);
```

L2 层刻意维持「显式传实例」的社区惯用形态（`table={dt}`）而不是绑定成员——逃生层受众本来就要拿实例自己拼，`DataTableToolbar`/`DataTableColumnsMenu`/`DataTableSortMenu` 等散件各自显式收 `table` prop。

## 内建行为（不用你操心，但要知道存在）

以下不变式由框架内部维持，页面代码不需要、也不应该自己重新实现：

- **错误态保留查询区/搜索框**，且带同参「重试」按钮（瞬时错误如网络抖动/500，参数不变、点重试即重发；改输入触发的 400 走改参数这条路径，二者互不影响）。
- **末页删空后自动钳制页码**：删到当前页清空时，页码自动回退到新的末页而不是停在越界空页；仅在取数完成（非 pending/fetching/error）时生效。
- **批量删除内建**：`t.BulkDelete`（放在 `t.BulkBar` 里）自带二次确认、串行删除、结果三分支提示与失败项回填，页面零接线；无删除权限时自渲染为 `null`。
- **删除后选中态自动剪枝**：勾选的行被删除或因数据变动离场后，`rowSelection` 自动清理对应 id，不会出现「已选 0 项」的幽灵批量条。
- **筛选/排序/搜索变化自动回第 1 页并清空选择**。
- **`concurrencyStamp` 自动回传**：`sheet` 内部从行记录读出并附加到 update 请求，页面的 `toUpdate` 不需要手动拼这个字段。
- **服务端校验错误自动落位到对应字段**：走 `abpSubmitValidator`，与客户端 zod 校验同链渲染。

## 菜单项 + 词条

### `menu.tsx`

`src/menu.tsx` 的 `menuItems: MenuItem<FileRouteTypes["to"]>[]` 是纯声明式数组，`to` 字段类型来自 `@/routeTree.gen` 的路径联合类型，路由删除/改名会在编译期暴露菜单死链；`buildMenu` 会按 `requiredPolicy` 剪枝。挂一个叶子项：

```tsx
import { Book } from "lucide-react";

{ key: "books", label: "App::Books", to: "/books", icon: <Book /> }
```

有权限策略保护的实体要带上 `requiredPolicy`，跟路由的 `beforeLoad` 策略名一致：

```tsx
{
  key: "identity-users",
  label: "AbpIdentity::Users",
  to: "/identity/users",
  icon: <Users />,
  requiredPolicy: IdentityPermissions.Users.Default,
}
```

### 词条

**约定**：开发者自己新增的词条一律写进 `src/i18n/<culture>.json`（如 `src/i18n/en.json`、`src/i18n/zh-Hans.json`），放在 **`"App"` 桶**下：

```json
{
  "App": {
    "Books": "Books",
    "BookName": "Name",
    "BookNameRequired": "Name is required"
  }
}
```

页面里用 `L("App::BookName")` 取。`__root.tsx` 里这份 JSON 和各块的 `*-messages.json` 一起深合并（`mergeCatalogs(...)`）进 `AppConfigProvider` 的 `messages`——这一步 `jc-abp init` 已经接好，新增页面**不需要碰 `__root.tsx`**，只管往 `App` 桶里加键。

如果字段用到 ABP 内置资源的词条（比如 `AbpIdentity::UserName`），直接用对应资源桶名，不要抄进 `App` 桶——后端本地化资源变了才不会跟前端硬编码的翻译打架。

## 常见坑

1. **远程 combobox 没有 `Filter` 端点时退化为客户端过滤，不要伪造服务端参数**。检查关联实体的 `Get...Params` 类型（同第②步判断 `supportsFilter` 的方法）——没有 `Filter` 字段就说明后端不支持按关键字搜，`loadOptions` 应该固定拉一批（如前 20 条）再在前端按子串过滤：

   ```ts
   async function loadAuthorOptions(search: string): Promise<ComboboxOption[]> {
     const result = await getApiAppAuthor({ SkipCount: 0, MaxResultCount: AUTHOR_PAGE_SIZE });
     const items = result.items ?? [];
     const query = search.trim().toLowerCase();
     const filtered = query ? items.filter((a) => (a.name ?? "").toLowerCase().includes(query)) : items;
     return filtered.map((a) => ({ value: a.id ?? "", label: a.name ?? "" }));
   }
   ```

2. **给新页面补一条 CRUD 链路组件级冒烟测试**。单元测试测不出「三方库运行时 × 真实 Web API × 多步用户序列」这类接缝缺陷。不需要每个新实体都单独写一份，照 [`examples/starter/test/crud-flow.test.tsx`](../../examples/starter/test/crud-flow.test.tsx) 的模式（`createCrudService` + `useAbpSheet` + `useAbpTable` 组合、内存 mock service，跑 open→reopen、字段错误→改值→重提交、delete→204→invalidate 三条序列）复刻一份挂到自己的实体上。

3. **纯创建页可以不经 `useAbpSheet` 单独存在**：[`books/new.tsx`](../../examples/starter/src/routes/_layout/_authed/books/new.tsx) 是长表单逃生舱示范——不走侧滑抽屉，直接用 `useAppForm(abpFormOptions({...}))` 接一个独立页面。这类页面不涉及「打开已有记录回填」，不受表单侧任何 reset 时序细节影响。

## 完整参照

- [`examples/starter/src/routes/_layout/_authed/books/index.tsx`](../../examples/starter/src/routes/_layout/_authed/books/index.tsx)——本文全部代码摘自这里，L0/L1/L2 三层页签对照、无权限策略、带远程 combobox 的最小完整样例。
- [`examples/starter/src/routes/_layout/_authed/identity/users.tsx`](../../examples/starter/src/routes/_layout/_authed/identity/users.tsx)——有权限策略（`beforeLoad` + `policy`）、create-only 密码字段、`MultiCombobox`、异步预取关联数据、`lazy` 加载权限面板的进阶样例。
- [`examples/starter/src/routes/_layout/_authed/identity/roles.tsx`](../../examples/starter/src/routes/_layout/_authed/identity/roles.tsx)——更简单的样例：无远程 combobox，`row.menu` 追加一个权限面板入口。
- [`examples/starter/src/routes/_layout/_authed/tenants/index.tsx`](../../examples/starter/src/routes/_layout/_authed/tenants/index.tsx)——create/update 字段集不对称、`toUpdate` 显式写以防字段泄漏（类型层其实允许省略，是业务/安全选择而非编译强制）的样例。
- 表单体系的完整架构（四层分层、字段组件参考、校验四通道、服务端错误落位、脱离 ABP 用法）见 [`forms.md`](./forms.md)。
