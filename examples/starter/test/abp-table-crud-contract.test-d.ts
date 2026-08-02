import { test } from "vitest";
import type { AbpTableSource } from "@/components/abp/crud/abp-table-source";
import { useAbpTable } from "@/components/abp/table/use-abp-table";

/**
 * 类型契约：自定义数据源（非 `CrudService`，如 books 页 L1 层那种手写回调）必须仍然只需要满足
 * `AbpTableSource` 声明的最小接口面就能接入 `useAbpTable` 的 source 回调分支，`AbpTableSource`
 * 收窄字段、新增必填字段时下面的调用编译失败。反向不约束，自定义源可以多出字段，那正是结构化
 * 接口的意义（`widerSource` 钉住这一点）。本文件由 `vitest --typecheck` 静态检查、从不执行；
 * `@ts-expect-error` 失守会让 `npm test` 失败。
 */

interface Book {
  id: string;
  name: string;
}

/** 最小结构：只读、无删除能力的自定义源，省略 `delete`/`listQuery.refetch` 两个可选字段
 * 仍必须编译通过。 */
function minimalSource(): AbpTableSource<Book> {
  return {
    listQuery: { data: undefined, isPending: false, isFetching: false, isError: false },
    pageCount: 1,
    totalCount: 0,
    can: { create: false, update: false, delete: false },
    supportsFilter: true,
  };
}

const columns: Parameters<typeof useAbpTable<Book>>[1]["columns"] = [];

test("满足最小接口面的自定义源能接入 useAbpTable 的 source 回调分支", () => {
  // 包一层同名 hook 只为满足 rules-of-hooks 的命名约定；typecheck 模式下从不执行。
  function useAbpTableSourceContractCheck() {
    return useAbpTable<Book>((_params) => minimalSource(), { columns });
  }
  void useAbpTableSourceContractCheck;
});

test("自定义源多出字段依然可赋给 AbpTableSource（反向不约束）", () => {
  function widerSource(): AbpTableSource<Book> & { extra: string } {
    return { ...minimalSource(), extra: "x" };
  }
  void widerSource;
});

test("缺必填字段（如 can）必须编译期报错，而非静默退化成 any", () => {
  function missingCanIsRejected(): AbpTableSource<Book> {
    // @ts-expect-error 缺 can 字段，AbpTableSource 的最小接口面必填它
    return {
      listQuery: { data: undefined, isPending: false, isFetching: false, isError: false },
      pageCount: 1,
      totalCount: 0,
      supportsFilter: true,
    };
  }
  void missingCanIsRejected;
});
