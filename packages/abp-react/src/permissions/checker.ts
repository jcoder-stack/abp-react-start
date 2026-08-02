import { type GrantedPolicies, isGranted, type PermissionStrategy } from "./is-granted";

/** Callable permission checker; `can(x)` and `can.all(...)` require every policy, `can.any(...)` requires one of them, `can.not(policy)` negates a single check. Variadic args are flattened, and an empty policy set is always denied. */
export interface PermissionChecker {
  (policy: string | string[]): boolean;
  /** True when every listed policy is granted. `all()` and `all([])` are false:
   *  a spread of no policies must not open a gate. */
  all(...policies: Array<string | string[]>): boolean;
  /** True when at least one listed policy is granted; `any()` and `any([])` are false. */
  any(...policies: Array<string | string[]>): boolean;
  /** True when the given policy is not granted. Takes a single policy so it cannot be read as "none of these are granted". */
  not(policy: string): boolean;
}

/** Create a permission checker bound to the given policies, returning a callable with `all`, `any`, and `not` methods. */
export function createPermissionChecker(policies: GrantedPolicies): PermissionChecker {
  // The empty set is denied rather than left to every()'s vacuous truth: a variadic call whose
  // arguments spread to nothing is a bug in the caller, and reading it as "granted" would let a
  // guard silently render.
  const check = (list: string[], strategy: PermissionStrategy): boolean =>
    list.length > 0 && isGranted(policies, list, { strategy });
  const can = ((policy: string | string[]) =>
    check(Array.isArray(policy) ? policy : [policy], "all")) as PermissionChecker;
  can.all = (...ps) => check(ps.flat(), "all");
  can.any = (...ps) => check(ps.flat(), "any");
  can.not = (policy) => !isGranted(policies, policy);
  return can;
}
