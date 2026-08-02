import { z } from "zod";

export const currentUserSchema = z.object({
  isAuthenticated: z.boolean(),
  id: z.string().nullable(),
  userName: z.string().nullable(),
  tenantId: z.string().nullable(),
  email: z.string().nullable().optional(),
  name: z.string().nullish(),
  // `surName` is ABP's own casing on CurrentUserDto (the identity module's own DTOs use
  // `surname`); mirroring the wire keeps the parse a pure shape check.
  surName: z.string().nullish(),
  emailVerified: z.boolean().nullish(),
  phoneNumber: z.string().nullish(),
  phoneNumberVerified: z.boolean().nullish(),
  sessionId: z.string().nullish(),
  impersonatorUserId: z.string().nullish(),
  impersonatorTenantId: z.string().nullish(),
  impersonatorUserName: z.string().nullish(),
  impersonatorTenantName: z.string().nullish(),
  // swagger marks CurrentUserDto.roles nullable, and ABP does send `null`; `.default([])` only
  // covers the absent case, so a null would otherwise fail the whole config parse.
  roles: z
    .array(z.string())
    .nullish()
    .transform((roles) => roles ?? []),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const currentTenantSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  isAvailable: z.boolean(),
});
export type CurrentTenant = z.infer<typeof currentTenantSchema>;

type DegradeReporter = (error: z.ZodError) => void;

/**
 * `.catch` swallows the issues it recovers from, which would make every fallback below invisible
 * to `parseApplicationConfiguration`'s `onError`. Parsing is synchronous, so a reporter swapped in
 * around one `safeParse` call can never interleave with another parse.
 */
let activeReporter: DegradeReporter | null = null;

// `ctx.error.issues` rather than `ctx.issues`: only the former is finalized, the latter is still
// the raw internal form.
function degradeTo<T>(fallback: T): (ctx: { error: { issues: z.core.$ZodIssue[] } }) => T {
  return (ctx) => {
    activeReporter?.(new z.ZodError(ctx.error.issues));
    return fallback;
  };
}

const languageSchema = z.object({ cultureName: z.string(), displayName: z.string() });

export const localizationSchema = z
  .object({
    currentCulture: z.object({ name: z.string() }).catch(degradeTo({ name: "en" })),
    defaultResourceName: z.string().nullish().catch(degradeTo(undefined)),
    // A single drifted entry is dropped on its own, so it cannot take the rest of the list
    // (and with it the whole localization subtree) down with it.
    languages: z
      .array(languageSchema.nullable().catch(degradeTo(null)))
      .transform((entries) => entries.filter((entry) => entry !== null))
      .catch(degradeTo([])),
    values: z.record(z.string(), z.record(z.string(), z.string())).catch(degradeTo({})),
  })
  .catch(degradeTo({ currentCulture: { name: "en" }, languages: [], values: {} }));
export type Localization = z.infer<typeof localizationSchema>;

/** ABP leaves client-visible settings/features that were never assigned as `null`; that is a legal
 * "unset", normalized to `undefined` rather than reported as drift. Anything else degrades to
 * `undefined` too, but is reported. Either way one bad leaf never empties the whole table. */
const abpValueSchema = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)
  .catch(degradeTo(undefined));

const abpValueTableSchema = z
  .object({ values: z.record(z.string(), abpValueSchema).catch(degradeTo({})) })
  .catch(degradeTo({ values: {} }));

const applicationConfigurationShape = {
  currentUser: currentUserSchema,
  // swagger marks grantedPolicies nullable and the subtree can arrive null for an anonymous
  // caller; a null converges to "nothing granted" (fail-closed) rather than throwing a white
  // screen, while any other drift still fails fast per this file's contract.
  auth: z
    .object({
      grantedPolicies: z
        .record(z.string(), z.boolean())
        .nullish()
        .transform((policies) => policies ?? {}),
    })
    .nullable()
    .transform((auth) => auth ?? { grantedPolicies: {} }),
  setting: abpValueTableSchema,
  localization: localizationSchema,
  currentTenant: currentTenantSchema,
  features: abpValueTableSchema,
};
/** Runtime schema preserves unknown top-level keys (extraProperties / custom contributors); the exported type omits that index signature so server-fn return values stay serializable. */
export const applicationConfigurationSchema = z.looseObject(applicationConfigurationShape);
// Inferred from the shape as a strict object rather than from the loose schema above, whose
// index signature would otherwise leak into every consumer of this type.
export type ApplicationConfiguration = z.infer<z.ZodObject<typeof applicationConfigurationShape>>;

/** Parse ABP application-configuration.
 *
 *  Unknown top-level keys pass through. The setting, localization and features subtrees degrade
 *  per leaf on shape drift, so one bad language entry or setting value never empties its table.
 *  A null auth subtree (or null grantedPolicies) reads as nothing granted.
 *
 *  Degradations go to `opts.onError`. A hard failure (a broken currentUser, say) still throws,
 *  but only after `opts.onError` has seen it. */
export function parseApplicationConfiguration(
  raw: unknown,
  opts?: { onError?: (error: z.ZodError) => void },
): ApplicationConfiguration {
  const outerReporter = activeReporter;
  activeReporter = opts?.onError ?? null;
  let result: z.ZodSafeParseResult<ApplicationConfiguration>;
  try {
    result = applicationConfigurationSchema.safeParse(raw);
  } finally {
    activeReporter = outerReporter;
  }
  if (!result.success) {
    opts?.onError?.(result.error);
    throw result.error;
  }
  return result.data;
}
