import type { AuthRuntime } from "@jcoder-stack/abp-react/proxy";
import { createRuntime } from "./auth.config";

let runtime: AuthRuntime | undefined;

/** 进程级 auth 运行时单例；仅在 server 侧 import（路由 handler / server fn / middleware）。 */
export function getAuthRuntime(): AuthRuntime {
  runtime ??= createRuntime();
  return runtime;
}
