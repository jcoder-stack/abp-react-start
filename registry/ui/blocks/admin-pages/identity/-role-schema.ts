import type { Localize } from "@jcoder/abp-react/react";
import { z } from "zod";
import { postApiIdentityRolesBody, postApiIdentityRolesBodyNameMax } from "@/api/schemas/role/role";

// roles.tsx 的 name 校验规则单独落到这个 `-` 前缀文件（route 文件生成器按前缀跳过，不会被
// 误当路由）：roles.tsx 经 `@/auth`（含 @tanstack/react-start 的 server fn）链路，在没有
// tanstackStart vite 插件的 vitest 环境里无法被测试文件直接 import；测试需要挂真实产物而非
// 复刻校验规则，这份不依赖 `@/auth`/`createFileRoute` 的模块因此是两边（页面 + 测试）都能安全
// import 的唯一交点。

/** 以生成的 body schema 为基底：max(256) 这类后端约束免费继承（此前漏了，超长要打到后端才
 * 400）；必填与 trim 是 UI 语义、生成侧没有（ABP [Required] 未映射成 minLength），词条消息在
 * 此覆盖。 */
export function buildRoleSchema(L: Localize) {
  return postApiIdentityRolesBody.extend({
    name: z
      .string()
      .trim()
      .min(1, L("Form:Required"))
      .max(postApiIdentityRolesBodyNameMax, L("Form:MaxLength", postApiIdentityRolesBodyNameMax)),
  });
}
