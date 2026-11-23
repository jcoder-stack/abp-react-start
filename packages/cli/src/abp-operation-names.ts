import { z } from "zod";

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options"] as const;

/** One controller action from ABP's `/api/abp/api-definition`: the C# method behind an HTTP route. */
export interface AbpAction {
  httpMethod: string;
  url: string;
  /** C# method name, e.g. `GetListAsync`. */
  name: string;
  /** Swagger tag of the owning controller (ABP's `controllerGroupName`). */
  group: string;
}

const apiDefinitionSchema = z.object({
  modules: z.record(
    z.string(),
    z.object({
      controllers: z.record(
        z.string(),
        z.object({
          controllerName: z.string(),
          controllerGroupName: z.string().nullish(),
          actions: z.record(
            z.string(),
            z.object({ name: z.string(), httpMethod: z.string().nullish(), url: z.string() }),
          ),
        }),
      ),
    }),
  ),
});

/** Flatten an ABP api-definition document into its routed actions. Throws when the document is not an api-definition. */
export function readAbpActions(definition: unknown): AbpAction[] {
  const parsed = apiDefinitionSchema.parse(definition);
  const actions: AbpAction[] = [];
  for (const module of Object.values(parsed.modules)) {
    for (const controller of Object.values(module.controllers)) {
      for (const action of Object.values(controller.actions)) {
        if (!action.httpMethod) continue;
        actions.push({
          httpMethod: action.httpMethod,
          url: action.url,
          name: action.name,
          group: controller.controllerGroupName ?? controller.controllerName,
        });
      }
    }
  }
  return actions;
}

/** 路由参数名在 swagger 与 api-definition 两侧不保证同名（大小写、约束后缀），只按位置比较。 */
function routeKey(method: string, url: string): string {
  const path = url
    .replace(/^\/+|\/+$/g, "")
    .replace(/\{[^}]*\}/g, "{}")
    .toLowerCase();
  return `${method.toUpperCase()} ${path}`;
}

function words(value: string): string[] {
  return value.split(/[^A-Za-z0-9]+/).filter((word) => word !== "");
}

function pascal(value: string): string {
  return words(value)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function camel(value: string): string {
  const name = pascal(value);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** `role` + `GetListAsync` → `roleGetList`. */
function actionOperationId(group: string, actionName: string): string {
  return camel(group) + pascal(actionName.replace(/Async$/, ""));
}

/** 没有 api-definition 可对时的兜底：`GET /api/identity/roles/{id}` → `getRolesId`。去掉 `api` 与模块段，其余仍由路径推出。 */
function pathOperationId(method: string, path: string): string {
  const segments = path.split("/").filter((segment) => segment !== "");
  const rest = segments[0]?.toLowerCase() === "api" && segments.length > 2 ? segments.slice(2) : [];
  if (rest.length === 0) return "";
  return method.toLowerCase() + rest.map((segment) => pascal(segment)).join("");
}

interface OperationSlot {
  operation: Record<string, unknown>;
  candidate: string;
}

/** orval input transformer: give every operation without an `operationId` a short one — the ABP
 *  controller group + C# method name when `actions` covers its route, otherwise a path-derived name
 *  without the `api/<module>` prefix. Spec-provided ids are kept. A name two operations would share
 *  is assigned to neither, so those keep orval's default path naming. */
export function nameAbpOperations<T>(doc: T, actions: readonly AbpAction[]): T {
  const paths = (doc as { paths?: Record<string, unknown> }).paths;
  if (paths === undefined || paths === null) return doc;
  const byRoute = new Map(actions.map((a) => [routeKey(a.httpMethod, a.url), a]));
  const taken = new Map<string, number>();
  const count = (id: string) => taken.set(id, (taken.get(id) ?? 0) + 1);
  const slots: OperationSlot[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (item === null || typeof item !== "object") continue;
    for (const method of HTTP_METHODS) {
      const operation = (item as Record<string, unknown>)[method];
      if (operation === null || typeof operation !== "object") continue;
      const op = operation as Record<string, unknown>;
      if (typeof op.operationId === "string" && op.operationId !== "") {
        count(op.operationId);
        continue;
      }
      const action = byRoute.get(routeKey(method, path));
      const tag = Array.isArray(op.tags) && typeof op.tags[0] === "string" ? op.tags[0] : undefined;
      const candidate = action
        ? actionOperationId(tag ?? action.group, action.name)
        : pathOperationId(method, path);
      if (candidate === "") continue;
      count(candidate);
      slots.push({ operation: op, candidate });
    }
  }
  for (const { operation, candidate } of slots) {
    if (taken.get(candidate) === 1) operation.operationId = candidate;
  }
  return doc;
}
