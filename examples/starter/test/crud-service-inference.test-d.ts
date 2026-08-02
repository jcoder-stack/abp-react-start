import { test } from "vitest";
import {
  getGetApiIdentityRolesQueryKey,
  useDeleteApiIdentityRolesId,
  useGetApiIdentityRoles,
  usePostApiIdentityRoles,
  usePutApiIdentityRolesId,
} from "@/api/endpoints/role/role";
import {
  getGetApiMultiTenancyTenantsQueryKey,
  useDeleteApiMultiTenancyTenantsId,
  useGetApiMultiTenancyTenants,
  usePostApiMultiTenancyTenants,
  usePutApiMultiTenancyTenantsId,
} from "@/api/endpoints/tenant/tenant";
import {
  getGetApiIdentityUsersQueryKey,
  useDeleteApiIdentityUsersId,
  useGetApiIdentityUsers,
  usePostApiIdentityUsers,
  usePutApiIdentityUsersId,
} from "@/api/endpoints/user/user";
import type {
  VoloAbpIdentityIdentityRoleCreateDto,
  VoloAbpIdentityIdentityRoleDto,
  VoloAbpIdentityIdentityRoleUpdateDto,
  VoloAbpIdentityIdentityUserCreateDto,
  VoloAbpIdentityIdentityUserDto,
  VoloAbpIdentityIdentityUserUpdateDto,
  VoloAbpTenantManagementTenantCreateDto,
  VoloAbpTenantManagementTenantDto,
  VoloAbpTenantManagementTenantUpdateDto,
} from "@/api/models";
import type { CrudService, FilterConfig } from "@/components/abp/crud/crud-service";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { IdentityPermissions, TenantManagementPermissions } from "@/permissions";
import {
  getGetApiAppBookQueryKey,
  useDeleteApiAppBookId,
  useGetApiAppBook,
  usePostApiAppBook,
  usePutApiAppBookId,
} from "@/routes/_layout/_authed/books/-book-api";
import type {
  AbpSwaggerBooksBookDto,
  AbpSwaggerBooksCreateUpdateBookDto,
} from "@/routes/_layout/_authed/books/-book-models";

/**
 * 类型契约：省略 `createCrudService` 的显式类型参数后，推断所得是否与四个页面手写的完全一致。
 * 严格相等而非 `extends`，推断更宽时 `extends` 照样通过，而「更宽」正是这里唯一要拦的东西。
 * 本文件由 `vitest --typecheck` 静态检查、从不执行；`@ts-expect-error` 失守会让 `npm test` 失败。
 *
 * 2026-07-27 实测：12 条里 6 条不等（users/roles/tenants 的 `TCreate`/`TUpdate`）。orval 给这三个
 * 端点的 mutation variables 套了 `NonReadonly<>`，它经 `Pick<T, WritableKeys<T>>` 把 DTO 上
 * `readonly extraProperties?` 整个摘掉，于是推断值 ≡ `Omit<手写 DTO, "extraProperties">`。book 端点
 * 的 DTO 没有 readonly 成员、orval 未套包装，故三条全过。不等的 6 条用 `@ts-expect-error` 就地留证：
 * 断言本身不放宽，哪天 orval 或 DTO 变得一致，指令失效反过来会报错，契约状态不会悄悄漂移。
 */

/** 沿用条件类型恒等判定而非 vitest 的 `toEqualTypeOf`，6 条 `@ts-expect-error` 留证依赖当前
 * 判定语义的精确边界（readonly/可选修饰符），换算法可能让留证悄悄翻转。 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** 断言为真则通过；为假时 `false` 赋不进 `true`，编译报错。 */
function assertTrue<T extends true>(_v?: T): void {}

/** 从服务描述符反解出它被实例化时的三个类型参数（`CrudService` 未把它们暴露成属性）。 */
type ArgsOf<T> =
  T extends CrudService<infer TDto, infer TCreate, infer TUpdate>
    ? { dto: TDto; create: TCreate; update: TUpdate }
    : never;

// ── books ──（examples/starter/src/routes/_layout/_authed/books/index.tsx）

const inferredBook = createCrudService({
  useList: useGetApiAppBook,
  useCreate: usePostApiAppBook,
  useUpdate: usePutApiAppBookId,
  useDelete: useDeleteApiAppBookId,
  listKey: getGetApiAppBookQueryKey,
  supportsFilter: false,
});

const explicitBook = createCrudService<
  AbpSwaggerBooksBookDto,
  AbpSwaggerBooksCreateUpdateBookDto,
  AbpSwaggerBooksCreateUpdateBookDto
>({
  useList: useGetApiAppBook,
  useCreate: usePostApiAppBook,
  useUpdate: usePutApiAppBookId,
  useDelete: useDeleteApiAppBookId,
  listKey: getGetApiAppBookQueryKey,
  supportsFilter: false,
});

// ── identity/users ──（examples/starter/src/routes/_layout/_authed/identity/users.tsx）

const inferredUser = createCrudService({
  useList: useGetApiIdentityUsers,
  useCreate: usePostApiIdentityUsers,
  useUpdate: usePutApiIdentityUsersId,
  useDelete: useDeleteApiIdentityUsersId,
  listKey: getGetApiIdentityUsersQueryKey,
  policy: IdentityPermissions.Users.Default,
  supportsFilter: true,
});

const explicitUser = createCrudService<
  VoloAbpIdentityIdentityUserDto,
  VoloAbpIdentityIdentityUserCreateDto,
  VoloAbpIdentityIdentityUserUpdateDto
>({
  useList: useGetApiIdentityUsers,
  useCreate: usePostApiIdentityUsers,
  useUpdate: usePutApiIdentityUsersId,
  useDelete: useDeleteApiIdentityUsersId,
  listKey: getGetApiIdentityUsersQueryKey,
  policy: IdentityPermissions.Users.Default,
  supportsFilter: true,
});

// ── identity/roles ──（examples/starter/src/routes/_layout/_authed/identity/roles.tsx）

const inferredRole = createCrudService({
  useList: useGetApiIdentityRoles,
  useCreate: usePostApiIdentityRoles,
  useUpdate: usePutApiIdentityRolesId,
  useDelete: useDeleteApiIdentityRolesId,
  listKey: getGetApiIdentityRolesQueryKey,
  policy: IdentityPermissions.Roles.Default,
  supportsFilter: true,
});

const explicitRole = createCrudService<
  VoloAbpIdentityIdentityRoleDto,
  VoloAbpIdentityIdentityRoleCreateDto,
  VoloAbpIdentityIdentityRoleUpdateDto
>({
  useList: useGetApiIdentityRoles,
  useCreate: usePostApiIdentityRoles,
  useUpdate: usePutApiIdentityRolesId,
  useDelete: useDeleteApiIdentityRolesId,
  listKey: getGetApiIdentityRolesQueryKey,
  policy: IdentityPermissions.Roles.Default,
  supportsFilter: true,
});

// ── tenants ──（examples/starter/src/routes/_layout/_authed/tenants/index.tsx）

const inferredTenant = createCrudService({
  useList: useGetApiMultiTenancyTenants,
  useCreate: usePostApiMultiTenancyTenants,
  useUpdate: usePutApiMultiTenancyTenantsId,
  useDelete: useDeleteApiMultiTenancyTenantsId,
  listKey: getGetApiMultiTenancyTenantsQueryKey,
  policy: TenantManagementPermissions.Tenants.Default,
  supportsFilter: true,
});

const explicitTenant = createCrudService<
  VoloAbpTenantManagementTenantDto,
  VoloAbpTenantManagementTenantCreateDto,
  VoloAbpTenantManagementTenantUpdateDto
>({
  useList: useGetApiMultiTenancyTenants,
  useCreate: usePostApiMultiTenancyTenants,
  useUpdate: usePutApiMultiTenancyTenantsId,
  useDelete: useDeleteApiMultiTenancyTenantsId,
  listKey: getGetApiMultiTenancyTenantsQueryKey,
  policy: TenantManagementPermissions.Tenants.Default,
  supportsFilter: true,
});

test("四个页面省略显式类型参数后推断与手写一致（已知 6 条 NonReadonly 差异就地留证）", () => {
  assertTrue<Equals<ArgsOf<typeof inferredBook>["dto"], ArgsOf<typeof explicitBook>["dto"]>>();
  assertTrue<
    Equals<ArgsOf<typeof inferredBook>["create"], ArgsOf<typeof explicitBook>["create"]>
  >();
  assertTrue<
    Equals<ArgsOf<typeof inferredBook>["update"], ArgsOf<typeof explicitBook>["update"]>
  >();

  assertTrue<Equals<ArgsOf<typeof inferredUser>["dto"], ArgsOf<typeof explicitUser>["dto"]>>();
  assertTrue<
    // @ts-expect-error 推断值 ≡ Omit<VoloAbpIdentityIdentityUserCreateDto, "extraProperties">
    Equals<ArgsOf<typeof inferredUser>["create"], ArgsOf<typeof explicitUser>["create"]>
  >();
  assertTrue<
    // @ts-expect-error 推断值 ≡ Omit<VoloAbpIdentityIdentityUserUpdateDto, "extraProperties">
    Equals<ArgsOf<typeof inferredUser>["update"], ArgsOf<typeof explicitUser>["update"]>
  >();

  assertTrue<Equals<ArgsOf<typeof inferredRole>["dto"], ArgsOf<typeof explicitRole>["dto"]>>();
  assertTrue<
    // @ts-expect-error 推断值 ≡ Omit<VoloAbpIdentityIdentityRoleCreateDto, "extraProperties">
    Equals<ArgsOf<typeof inferredRole>["create"], ArgsOf<typeof explicitRole>["create"]>
  >();
  assertTrue<
    // @ts-expect-error 推断值 ≡ Omit<VoloAbpIdentityIdentityRoleUpdateDto, "extraProperties">
    Equals<ArgsOf<typeof inferredRole>["update"], ArgsOf<typeof explicitRole>["update"]>
  >();

  assertTrue<Equals<ArgsOf<typeof inferredTenant>["dto"], ArgsOf<typeof explicitTenant>["dto"]>>();
  assertTrue<
    // @ts-expect-error 推断值 ≡ Omit<VoloAbpTenantManagementTenantCreateDto, "extraProperties">
    Equals<ArgsOf<typeof inferredTenant>["create"], ArgsOf<typeof explicitTenant>["create"]>
  >();
  assertTrue<
    // @ts-expect-error 推断值 ≡ Omit<VoloAbpTenantManagementTenantUpdateDto, "extraProperties">
    Equals<ArgsOf<typeof inferredTenant>["update"], ArgsOf<typeof explicitTenant>["update"]>
  >();
});

test("ArgsOf 反解本身非空：显式侧钉回页面手写的具名类型", () => {
  /* 若 `ArgsOf` 匹配失败而退化成 `never`，上面 12 条会两侧同为 `never` 而假性通过。
     把显式侧钉回页面手写的具名类型，`never` 就通不过这 12 条。 */
  assertTrue<Equals<ArgsOf<typeof explicitBook>["dto"], AbpSwaggerBooksBookDto>>();
  assertTrue<Equals<ArgsOf<typeof explicitBook>["create"], AbpSwaggerBooksCreateUpdateBookDto>>();
  assertTrue<Equals<ArgsOf<typeof explicitBook>["update"], AbpSwaggerBooksCreateUpdateBookDto>>();

  assertTrue<Equals<ArgsOf<typeof explicitUser>["dto"], VoloAbpIdentityIdentityUserDto>>();
  assertTrue<Equals<ArgsOf<typeof explicitUser>["create"], VoloAbpIdentityIdentityUserCreateDto>>();
  assertTrue<Equals<ArgsOf<typeof explicitUser>["update"], VoloAbpIdentityIdentityUserUpdateDto>>();

  assertTrue<Equals<ArgsOf<typeof explicitRole>["dto"], VoloAbpIdentityIdentityRoleDto>>();
  assertTrue<Equals<ArgsOf<typeof explicitRole>["create"], VoloAbpIdentityIdentityRoleCreateDto>>();
  assertTrue<Equals<ArgsOf<typeof explicitRole>["update"], VoloAbpIdentityIdentityRoleUpdateDto>>();

  assertTrue<Equals<ArgsOf<typeof explicitTenant>["dto"], VoloAbpTenantManagementTenantDto>>();
  assertTrue<
    Equals<ArgsOf<typeof explicitTenant>["create"], VoloAbpTenantManagementTenantCreateDto>
  >();
  assertTrue<
    Equals<ArgsOf<typeof explicitTenant>["update"], VoloAbpTenantManagementTenantUpdateDto>
  >();
});

/* books 端点无 Filter，声称支持、或漏填都必须编译失败；identity/users 端点有 Filter，两者都合法。
 * 没有直接用 `@ts-expect-error` 包 `createCrudService({...})` 调用来测，那是最初的写法，但
 * `usePostApiAppBook`/`usePutApiAppBookId` 这类 orval mutation hook 本身也是带 TError/TContext
 * 缺省值的泛型函数；一旦 `supportsFilter` 违反约束令整个实参不存在任何满足约束的实例化，TS 会连带放弃
 * 对同一调用里 useCreate/useUpdate 的推断、回退到它们的缺省值 `unknown`，报错跨行级联到 useCreate/
 * useUpdate 各自的属性行，`@ts-expect-error` 的“仅抑制下一行”语义完全罩不住。改为对 `FilterConfig`
 * 单独断言，`Equals` 而非 `extends` 保证“既禁止漏填也禁止 true”一次断言覆盖两种违规，且不经完整调用、
 * 不会触发上述级联。
 *
 * `probeFilterConfig` 特意把 `useList` 声明成未拆解的整体类型参数 `T`，与 crud-service.ts 里
 * `createCrudService` 的 `TUseList` 同一种写法，再靠真实调用（而非显式指定类型实参）让 TS 从
 * `useGetApiAppBook` 反向推断 `T`。这是真正脆弱的一环：`FilterConfig` 本身的条件类型逻辑一直是对的，
 * 会碎的是「重载 hook 能不能被推断出来、而不是静默落回缺省值」，直接对 `typeof hook` 取
 * `Parameters<...>[0]` 不经过推断，测不出这环断没断。 */

declare function probeFilterConfig<T extends (params: never, ...rest: never[]) => unknown>(
  useList: T,
): FilterConfig<NonNullable<Parameters<T>[0]>>;

test("FilterConfig 经重载 hook 推断：无 Filter 端点钉死 false，有 Filter 端点可选", () => {
  const bookFilterProbe = probeFilterConfig(useGetApiAppBook);
  assertTrue<Equals<typeof bookFilterProbe, { supportsFilter: false }>>();

  const userFilterProbe = probeFilterConfig(useGetApiIdentityUsers);
  assertTrue<Equals<typeof userFilterProbe, { supportsFilter?: boolean }>>();
});
