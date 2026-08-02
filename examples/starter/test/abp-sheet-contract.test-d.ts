import { expectTypeOf, test } from "vitest";
import type { WritableCrudService } from "@/components/abp/crud/crud-service";
import { useAbpSheet } from "@/components/abp/sheet/use-abp-sheet";

/**
 * 类型契约：`toValues`/`toCreate`/`toUpdate` 的条件必填，`TValues` 与 `TCreate`/`TUpdate`
 * 结构相同时三个映射全部可省，形状不匹配时省略必须编译期报错（`AbpSheetOptions` 的条件类型）。
 * 两个负例分别只让 TCreate/TUpdate 其中一侧不匹配，避免单个 `@ts-expect-error` 同时盖住两侧、
 * 某一侧的检查失效也测不出来。
 *
 * `t.queryForm.AppField` 的 `name` 收窄契约由 `query-form-contract.test-d.ts` 覆盖，不在本文件
 * 重复。本文件由 `vitest --typecheck` 静态检查、从不执行；`@ts-expect-error` 失守会让
 * `npm test` 失败。
 */

interface WidgetDto {
  id?: string;
  concurrencyStamp?: string | null;
  name?: string;
}

// 只需类型形状用于钉桩，不需要真实端点，declare const 跳过实现，专注 useAbpSheet 的推断。
declare const identityWidgetService: WritableCrudService<
  WidgetDto,
  { name: string },
  { name: string }
>;
// 只有 TCreate 比 TValues 多出 extra，TUpdate 与 TValues 同构，单独钉住「省略 toCreate 必须报错」。
declare const mismatchCreateWidgetService: WritableCrudService<
  WidgetDto,
  { name: string; extra: number },
  { name: string }
>;
// 只有 TUpdate 比 TValues 多出 extra，TCreate 与 TValues 同构，单独钉住「省略 toUpdate 必须报错」。
declare const mismatchUpdateWidgetService: WritableCrudService<
  WidgetDto,
  { name: string },
  { name: string; extra: number }
>;

test("TValues 与 TCreate/TUpdate 同构时三个映射全部可省", () => {
  // 包一层同名 hook 只为满足 rules-of-hooks 的命名约定；typecheck 模式下从不执行。
  function useIdentityShapeCheck() {
    const identityShape = useAbpSheet(identityWidgetService, { emptyValues: { name: "" } });
    expectTypeOf(identityShape).toHaveProperty("form");
  }
  void useIdentityShapeCheck;
});

test("TCreate 形状不匹配时省略 toCreate 必须编译报错", () => {
  function useMismatchCreateCheck() {
    // @ts-expect-error toCreate 形状不匹配（TCreate 多出必填的 extra 字段），省略必须报错
    const mismatchCreateShape = useAbpSheet(mismatchCreateWidgetService, {
      emptyValues: { name: "" },
    });
    void mismatchCreateShape;
  }
  void useMismatchCreateCheck;
});

test("TUpdate 形状不匹配时省略 toUpdate 必须编译报错", () => {
  function useMismatchUpdateCheck() {
    // @ts-expect-error toUpdate 形状不匹配（TUpdate 多出必填的 extra 字段），省略必须报错
    const mismatchUpdateShape = useAbpSheet(mismatchUpdateWidgetService, {
      emptyValues: { name: "" },
    });
    void mismatchUpdateShape;
  }
  void useMismatchUpdateCheck;
});
