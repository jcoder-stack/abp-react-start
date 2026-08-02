/** Map of policy names to their grant status. */
export type GrantedPolicies = Record<string, boolean>;

/** Strategy for combining multiple policies: 'all' (AND) or 'any' (OR). */
export type PermissionStrategy = "all" | "any";

/** Check if one or more policies are granted; empty array is vacuously true for 'all', false for 'any'. */
export function isGranted(
  policies: GrantedPolicies,
  policy: string | string[],
  opts?: { strategy?: PermissionStrategy },
): boolean {
  const list = Array.isArray(policy) ? policy : [policy];
  const strategy = opts?.strategy ?? "all";
  return strategy === "all"
    ? list.every((p) => policies[p] === true)
    : list.some((p) => policies[p] === true);
}
