import { expectTypeOf, test } from "vitest";
import { createCrudService } from "@/components/abp/crud/crud-service";

/**
 * 类型契约：`createCrudService` 的 mutation hooks（useCreate/useUpdate/useDelete）必须可选。
 * 只传 `useList` 也要能编译过，且未传的键在返回类型上不存在（而不是存在但类型为 `undefined`）。
 * 本文件由 `vitest --typecheck` 静态检查、从不执行。
 */

test("只传 useList 的只读 service 编译通过，且返回类型上不存在 useCreate", () => {
  const readOnlyService = createCrudService({
    useList: (_params: { Filter?: string }) => ({
      data: undefined,
      isPending: false,
      isFetching: false,
      isError: false,
    }),
    listKey: () => ["audit"] as const,
  });

  expectTypeOf(readOnlyService).not.toHaveProperty("useCreate");
});
