import { test } from "vitest";
import { QueryDateRange } from "@/components/abp/table/query-date-range";
import { useAppForm } from "@/components/form/form-hook";

/**
 * 类型契约：`QueryDateRange` 的 `form` prop 必须接受真实 `useAppForm` 实例，`QueryDateRangeForm`
 * 结构面的 `Field` 返回类型必须是 `ReactNode | Promise<ReactNode>`（React 19 类型下 TanStack Form
 * 真实 `Field` 的返回类型），窄化成单纯 `ReactNode` 会在这里报 TS2322（协变检查不兼容）。
 * `from`/`to` 只接受该表单 `defaultValues` 里声明的字段名。本文件由 `vitest --typecheck` 静态
 * 检查、从不执行；`@ts-expect-error` 失守会让 `npm test` 失败（.test.tsx 只走 esbuild 转译，
 * 不经 tsc/vitest typecheck，抓不住这类协变问题，这正是本文件存在的原因）。
 */

test("QueryDateRange 的 form prop 接受真实 useAppForm 实例，from/to 只接受声明的字段名", () => {
  // 包一层同名 hook 只为满足 rules-of-hooks 的命名约定；typecheck 模式下从不执行。
  function useQueryDateRangeContractCheck() {
    const form = useAppForm({
      defaultValues: { Min: "", Max: "" },
      onSubmit: () => {},
    });

    QueryDateRange({ form, from: "Min", to: "Max", label: "Published" });
    // @ts-expect-error from 只接受 defaultValues 里声明的键（"Min" | "Max"）
    QueryDateRange({ form, from: "TotallyBogus", to: "Max", label: "Published" });
    // @ts-expect-error to 只接受 defaultValues 里声明的键（"Min" | "Max"）
    QueryDateRange({ form, from: "Min", to: "TotallyBogus", label: "Published" });

    return form;
  }
  void useQueryDateRangeContractCheck;
});
