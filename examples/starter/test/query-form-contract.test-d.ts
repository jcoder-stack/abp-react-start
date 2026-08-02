import { expectTypeOf, test } from "vitest";
import { createCrudService } from "@/components/abp/crud/crud-service";
import { useAbpTable } from "@/components/abp/table/use-abp-table";
import {
  getGetApiAppBookQueryKey,
  useDeleteApiAppBookId,
  useGetApiAppBook,
  usePostApiAppBook,
  usePutApiAppBookId,
} from "@/routes/_layout/_authed/books/-book-api";

/**
 * 类型契约：`useAbpTable` 的 `t.queryForm.AppField` 的 `name` 必须收窄到调用点自己在
 * `query.defaults` 里声明的键，而不是退化成 `string`，传别的字段名编译期就要炸，否则查询字段
 * 可以拼错名字、悄悄不生效。本文件由 `vitest --typecheck` 静态检查、从不执行；
 * `@ts-expect-error` 失守会让 `npm test` 失败。
 *
 * 这条收窄曾经整体失效（`queryForm.state.values` 退化成 `unknown`，见 `use-abp-table.ts` 里
 * `UseAbpTableOptions.query.validators` 的 TSDoc），根因不是 `queryDefaults` 的兜底转型，
 * 而是那时候 `validators?: Parameters<typeof useAppForm>[0]["validators"]` 这个自引用类型：
 * 把它和 `defaultValues: queryDefaults` 放进同一个 `useAppForm({...})` 调用的参数对象里，会让
 * 这次调用对 `TFormData` 的泛型推断整体塌缩。现已改为显式形状（照抄 `AbpFormConfig["validators"]`
 * 的写法），下面的负例即为回归探针。
 *
 * 「ABP 分页协议保留字段（Sorting/SkipCount/MaxResultCount/Filter）不得进查询表单」这条旧契约
 * （曾属于已删除的 `QueryField` 机制）没有随之恢复：新实现里 `TQueryDefaults` 只是调用点自己
 * 给的字面量类型，与端点参数类型完全解耦，编译期无从判断某个键是否属于 ABP 保留名，这条约束
 * 目前只存在于运行时（`useAbpTable` 内部的 `devWarn("use-abp-table:reserved-param:...")`），
 * 且没有专属的运行时用例覆盖它，记为已知缺口而非本文件要补的范围。
 */

const bookService = createCrudService({
  useList: useGetApiAppBook,
  useCreate: usePostApiAppBook,
  useUpdate: usePutApiAppBookId,
  useDelete: useDeleteApiAppBookId,
  listKey: getGetApiAppBookQueryKey,
  supportsFilter: false,
});

test("AppField 的 name 只接受 query.defaults 里声明的键", () => {
  // 包一层同名 hook 只为满足 rules-of-hooks 的命名约定；typecheck 模式下从不执行。
  function useQueryFormContractCheck() {
    const t = useAbpTable(bookService, {
      columns: [],
      query: { defaults: { Name: "Alpha", MinPublishDate: "2020-01-01" } },
    });

    t.queryForm.AppField({ name: "Name", children: () => null });
    t.queryForm.AppField({ name: "MinPublishDate", children: () => null });
    // @ts-expect-error name 只接受调用点在 query.defaults 里声明的键（Name | MinPublishDate）
    t.queryForm.AppField({ name: "TotallyBogus", children: () => null });

    expectTypeOf(t.queryForm.state.values).not.toBeUnknown();
    return t;
  }
  void useQueryFormContractCheck;
});
