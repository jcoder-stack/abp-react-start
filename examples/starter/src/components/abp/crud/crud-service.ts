import type { AbpListParams, PagedResult } from "@jcoder-stack/abp-react/core";
import type { keepPreviousData } from "@tanstack/react-query";

export interface PagedResultLike<T> {
  items?: T[] | null;
  totalCount?: number;
}

/** ABP 分页协议 4 字段 + 端点自有查询参数的透传位：交叉 Record 才能把端点自有参数一起传下去。
 * interface 没有隐式索引签名，所以 `AbpListParams` 类型的变量赋不进来；推断出的匿名对象类型可以。 */
export type ListParams = AbpListParams & Record<string, unknown>;

/** 这 4 个参数名由表格状态机独占。端点自有参数撞上其中任何一个都不会生效，
 *  这条规则是固定的，不随当前的排序或搜索状态变化。 */
export const ABP_RESERVED_LIST_PARAM_NAMES: ReadonlySet<string> = new Set([
  "SkipCount",
  "MaxResultCount",
  "Sorting",
  "Filter",
]);

interface MutationCbs {
  onSuccess?: () => void;
  onError?: () => void;
}

/** 写操作的两个 hook。只读 service 不必满足，`WritableCrudService`（文件尾）交叉它把两者钉成必填。
 *  用方法简写而非属性签名，是为了拿到参数双变，让 orval 生成的 hook 赋得进来。 */
export interface CrudWriteHooks<TCreate, TUpdate> {
  useCreate(options?: { mutation?: MutationCbs }): {
    mutateAsync: (variables: { data: TCreate }) => Promise<unknown>;
    isPending: boolean;
  };
  useUpdate(options?: { mutation?: MutationCbs }): {
    mutateAsync: (variables: { id: string; data: TUpdate }) => Promise<unknown>;
    isPending: boolean;
  };
}

/** 删除 hook，单独拆分：读写但不可删（如仅管理员可删）的 service 场景下无需满足。 */
export interface CrudDeleteHook {
  useDelete(options?: { mutation?: MutationCbs }): {
    mutate: (variables: { id: string }) => void;
    mutateAsync: (variables: { id: string }) => Promise<unknown>;
    isPending: boolean;
  };
}

/** orval 为 CRUD 端点生成的 hook 形状。返回类型只列 `useAbpTable`/`useAbpSheet` 真正读的字段，
 *  其余靠协变兼容。`useList` 必填，只读 service 也要能查；写/删各自可选，
 *  由 `createCrudService` 按实传逐个钉回。 */
export interface CrudHooks<TDto extends { id?: string }, TCreate, TUpdate>
  extends Partial<CrudWriteHooks<TCreate, TUpdate>>,
    Partial<CrudDeleteHook> {
  useList(
    params: ListParams,
    options?: {
      query?: {
        placeholderData?: typeof keepPreviousData;
        select?: (raw: PagedResultLike<TDto>) => PagedResult<TDto>;
      };
    },
  ): { data?: PagedResult<TDto>; isPending: boolean; isFetching: boolean; isError: boolean };
}

/** 端点参数类型决定 supportsFilter 能取什么值：端点没有 Filter 时必填 false。漏填会落到缺省的
 *  true，做出一个能打字能回车、什么都不发生的搜索框。
 *
 *  违规时报错多半落在 `useCreate`/`useUpdate` 行，只有一条直接指向 supportsFilter，先查这条。
 *  有两种看着像修复、实际是把约束关掉的改法：补回显式类型参数，或把描述符先标注成
 *  `CrudServiceDef<…>` 再传入（标注会换成带索引签名的 `CrudHooks["useList"]`，
 *  `"Filter" extends keyof` 于是恒真）。 */
export type FilterConfig<TListParams> = "Filter" extends keyof TListParams
  ? { supportsFilter?: boolean }
  : { supportsFilter: false };

/** `CrudServiceDef` 与 `createCrudService` 入参共用的元数据槽位，抽出来免得两处各写一份。 */
interface CrudServiceMeta {
  /** react-query 失效前缀（orval 的 getGetXxxQueryKey）。invalidate 用它一次清掉所有分页态。 */
  listKey: () => readonly unknown[];
  policy?: string;
  policies?: Partial<{ create: string; update: string; delete: string }>;
}

declare const crudServiceCapabilities: unique symbol;

/** 类型层反解用的幽灵字段。运行时从不写它（可选，缺失照样满足结构类型），但悬浮提示里会显示成
 *  `CrudServiceTypeWitness<...>` 这个噪音字段。已知无害，别当 bug 删掉。
 *
 *  `useCreate`/`useUpdate` 不在 `CrudServiceDef` 的结构体里（只读 service 上要求它们彻底不存在），
 *  `CrudService<infer TDto, infer TCreate, …>` 这类反解就没有真实属性可以落点。三个类型参数都收进
 *  这一个字段，反解才不受"hook 有没有实传""返回类型交没交叉 Capability"的影响。 */
interface CrudServiceTypeWitness<TCreate, TUpdate, TListParams> {
  readonly [crudServiceCapabilities]?: {
    create: TCreate;
    update: TUpdate;
    listParams: TListParams;
  };
}

/** `CrudService` 展开后的形状，不是 `createCrudService` 的入参契约。别拿它标注描述符再传进去，
 *  那会关掉 `supportsFilter` 的约束（见 `FilterConfig`）。这里只含 `useList`，
 *  写/删 hook 由 `createCrudService` 的返回类型交叉 `CrudCapability` 钉回。 */
type CrudServiceDef<TDto extends { id?: string }, TCreate, TUpdate, TListParams> = Pick<
  CrudHooks<TDto, TCreate, TUpdate>,
  "useList"
> &
  CrudServiceMeta &
  FilterConfig<ListParams> &
  CrudServiceTypeWitness<TCreate, TUpdate, TListParams>;

/** 第 4 个类型参数是端点自有的查询参数类型，经 `CrudServiceTypeWitness` 在别名体内被引用；
 *  `use-abp-table.ts` 里 `t.queryForm.AppField` 的字段名收窄靠它反解。
 *
 *  默认不含 useCreate/useUpdate/useDelete：只读 service 上这些成员不存在，而不是类型为 undefined。
 *  `createCrudService` 按实传交叉回来，`WritableCrudService` 再把 create/update 钉成必填。 */
export type CrudService<
  TDto extends { id?: string },
  TCreate,
  TUpdate,
  TListParams extends Record<string, unknown> = Record<string, unknown>,
> = CrudServiceDef<TDto, TCreate, TUpdate, TListParams> & {
  resolvedPolicies: { create?: string; update?: string; delete?: string };
};

/** 要求 service 可写。`CrudService` 本身不保证 useCreate/useUpdate 存在，
 *  需要写操作的调用方（如 `useAbpSheet`）用它约束入参。 */
export type WritableCrudService<
  TDto extends { id?: string },
  TCreate,
  TUpdate,
  TListParams extends Record<string, unknown> = Record<string, unknown>,
> = CrudService<TDto, TCreate, TUpdate, TListParams> & CrudWriteHooks<TCreate, TUpdate>;

/** 类型级严格相等。`CrudCapability` 拿它跟 `WildcardMutationHook` 比，
 *  普通的互相 `extends` 会把两个不同的具体签名判成相等。 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** 三个可选 mutation hook 的类型参数缺省值。`options: never` 处在逆变位，任何真实 hook 都赋得进来。
 *  没用 `undefined` 当缺省：那会把"没传这个 hook"判成"要求 hook 的类型是 undefined"，入参直接报错。
 *  代价是显式指定类型实参时会被误判成未传，本文件之外没有这种用法。 */
type WildcardMutationHook = (options?: never) => unknown;

/** 可选 hook 的存在性投影：`TWitness` 等于缺省值就当没传，产出空对象（键彻底不存在，
 *  而不是类型为 undefined）；否则产出一个必填键。`createCrudService` 的返回类型逐个交叉它。 */
type CrudCapability<TKey extends string, TWitness, TValue> =
  Equals<TWitness, WildcardMutationHook> extends true ? Record<never, never> : Record<TKey, TValue>;

/** 服务描述符：绑定 orval 生成的 hook，按 ABP 命名约定派生权限策略（X → X.Create/.Update/.Delete）。
 *  纯数据，零执行。
 *
 *  `useList` 写成 `TUseList &` 具体签名的交叉，三个 mutation hook 同样处理，且各自嵌在自己的属性里。
 *  这个形状别动。合成单个签名，TS 会在 orval 的重载源上放弃泛型推断、静默回退缺省值，
 *  `supportsFilter` 的约束就永远走不到 false 分支；把裸类型参数提到顶层交叉，同级那些自带类型参数
 *  的函数属性也会推不出来。真改了编译器会响，只是报错位置离这里很远（TDto 塌成 `{ id?: string }`）。 */
export function createCrudService<
  TDto extends { id?: string },
  TCreate = unknown,
  TUpdate = TCreate,
  TUseList extends (params: never, ...rest: never[]) => unknown = (params: ListParams) => {
    data?: PagedResult<TDto>;
    isPending: boolean;
    isFetching: boolean;
    isError: boolean;
  },
  TUseCreate extends (options?: never) => unknown = WildcardMutationHook,
  TUseUpdate extends (options?: never) => unknown = WildcardMutationHook,
  TUseDelete extends (options?: never) => unknown = WildcardMutationHook,
>(
  def: {
    useList: TUseList & CrudHooks<TDto, TCreate, TUpdate>["useList"];
  } & Partial<{
    useCreate: TUseCreate & CrudWriteHooks<TCreate, TUpdate>["useCreate"];
    useUpdate: TUseUpdate & CrudWriteHooks<TCreate, TUpdate>["useUpdate"];
    useDelete: TUseDelete & CrudDeleteHook["useDelete"];
  }> &
    FilterConfig<NonNullable<Parameters<TUseList>[0]>> &
    CrudServiceMeta,
): CrudService<TDto, TCreate, TUpdate, NonNullable<Parameters<TUseList>[0]>> &
  CrudCapability<"useCreate", TUseCreate, CrudWriteHooks<TCreate, TUpdate>["useCreate"]> &
  CrudCapability<"useUpdate", TUseUpdate, CrudWriteHooks<TCreate, TUpdate>["useUpdate"]> &
  CrudCapability<"useDelete", TUseDelete, CrudDeleteHook["useDelete"]> {
  const base = def.policy;
  return {
    ...def,
    resolvedPolicies: {
      create: def.policies?.create ?? (base ? `${base}.Create` : undefined),
      update: def.policies?.update ?? (base ? `${base}.Update` : undefined),
      delete: def.policies?.delete ?? (base ? `${base}.Delete` : undefined),
    },
  } as unknown as CrudService<TDto, TCreate, TUpdate, NonNullable<Parameters<TUseList>[0]>> &
    CrudCapability<"useCreate", TUseCreate, CrudWriteHooks<TCreate, TUpdate>["useCreate"]> &
    CrudCapability<"useUpdate", TUseUpdate, CrudWriteHooks<TCreate, TUpdate>["useUpdate"]> &
    CrudCapability<"useDelete", TUseDelete, CrudDeleteHook["useDelete"]>;
}
