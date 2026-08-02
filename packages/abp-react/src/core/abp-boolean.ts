/**
 * Whether an ABP setting/feature string value means `true`.
 *
 * The comparison must stay case-insensitive: ABP reads these values with `bool.Parse` and never
 * normalizes them, so a provider default ships as `"true"` while anything saved through the
 * settings/features UI comes back as C# `bool.ToString()` output, i.e. `"True"`. A strict `=== "true"`
 * silently turns whole features off the first time an admin hits Save.
 */
export function isAbpTrue(value: string | undefined | null): boolean {
  return value?.toLowerCase() === "true";
}
