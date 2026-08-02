import type { ReactNode } from "react";
import type { PermissionGuardProps } from "../../src/react/session";

/**
 * 类型契约：`policy`/`all`/`any` 三选一。此前三者同传只有 `policy` 生效、另两个被静默忽略，
 * 类型层不阻止。本文件由 `bun run typecheck` 静态检查、从不执行；`@ts-expect-error`
 * 失守会让 typecheck 失败。
 */

declare const children: ReactNode;

const policyOnly: PermissionGuardProps = { policy: "A", children };
const allOnly: PermissionGuardProps = { all: ["A", "B"], children };
const anyOnly: PermissionGuardProps = { any: ["A", "B"], children };
const authOnly: PermissionGuardProps = { requireAuth: true, children };

// @ts-expect-error policy 与 all 互斥
const policyAndAll: PermissionGuardProps = { policy: "A", all: ["B"], children };
// @ts-expect-error policy 与 any 互斥
const policyAndAny: PermissionGuardProps = { policy: "A", any: ["B"], children };
// @ts-expect-error all 与 any 互斥
const allAndAny: PermissionGuardProps = { all: ["A"], any: ["B"], children };
// @ts-expect-error all 收敛为 string[]，不再接受裸 string
const allAsString: PermissionGuardProps = { all: "A", children };
// @ts-expect-error any 收敛为 string[]，不再接受裸 string
const anyAsString: PermissionGuardProps = { any: "A", children };

export {
  allAndAny,
  allAsString,
  allOnly,
  anyAsString,
  anyOnly,
  authOnly,
  policyAndAll,
  policyAndAny,
  policyOnly,
};
