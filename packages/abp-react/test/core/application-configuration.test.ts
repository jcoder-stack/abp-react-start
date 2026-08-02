import { describe, expect, it, vi } from "vitest";
import { parseApplicationConfiguration } from "../../src/core/application-configuration";

const sample = {
  currentUser: {
    isAuthenticated: true,
    id: "u1",
    userName: "admin",
    tenantId: null,
    email: "a@b.c",
    roles: ["admin"],
  },
  auth: { grantedPolicies: { "AbpIdentity.Users": true } },
  setting: { values: { "Abp.Localization.DefaultLanguage": "en" } },
  localization: {
    currentCulture: { name: "en" },
    defaultResourceName: "App",
    languages: [{ cultureName: "en", displayName: "English" }],
    values: { App: { Save: "Save" } },
  },
  currentTenant: { id: null, name: null, isAvailable: false },
  features: { values: { "Feature.X": "true" } },
};

describe("parseApplicationConfiguration", () => {
  it("parses a valid payload", () => {
    const config = parseApplicationConfiguration(sample);
    expect(config.currentUser.isAuthenticated).toBe(true);
    expect(config.auth.grantedPolicies["AbpIdentity.Users"]).toBe(true);
    expect(config.localization.values.App?.Save).toBe("Save");
    expect(config.currentTenant.id).toBeNull();
  });

  it("throws on malformed payload", () => {
    expect(() => parseApplicationConfiguration({ auth: {} })).toThrow();
  });

  it("preserves unknown top-level keys (extraProperties / custom contributors)", () => {
    const config = parseApplicationConfiguration({ ...sample, extraProperties: { foo: "bar" } });
    expect((config as Record<string, unknown>).extraProperties).toEqual({ foo: "bar" });
  });

  it("degrades drifted non-critical subtrees to defaults instead of failing", () => {
    const config = parseApplicationConfiguration({
      ...sample,
      setting: "not-an-object",
      features: 123,
      localization: null,
    });
    expect(config.setting.values).toEqual({});
    expect(config.features.values).toEqual({});
    expect(config.localization.currentCulture.name).toBe("en");
    expect(config.currentUser.isAuthenticated).toBe(true);
  });

  it("drops only the malformed language entry, leaving siblings, values and culture intact", () => {
    const onError = vi.fn();
    const config = parseApplicationConfiguration(
      {
        ...sample,
        localization: {
          ...sample.localization,
          currentCulture: { name: "zh-Hans" },
          languages: [
            { cultureName: "en", displayName: 42 },
            { cultureName: "zh-Hans", displayName: "简体中文" },
          ],
        },
      },
      { onError },
    );
    expect(config.localization.languages).toEqual([
      { cultureName: "zh-Hans", displayName: "简体中文" },
    ]);
    expect(config.localization.values.App?.Save).toBe("Save");
    expect(config.localization.currentCulture.name).toBe("zh-Hans");
    expect(onError).toHaveBeenCalled();
  });

  it("degrades a drifted currentCulture without wiping the localization values", () => {
    const onError = vi.fn();
    const config = parseApplicationConfiguration(
      { ...sample, localization: { ...sample.localization, currentCulture: "en" } },
      { onError },
    );
    expect(config.localization.currentCulture.name).toBe("en");
    expect(config.localization.values.App?.Save).toBe("Save");
    expect(config.localization.languages).toHaveLength(1);
    expect(onError).toHaveBeenCalled();
  });

  it.each(["setting", "features"] as const)(
    "keeps the other %s values when one of them is null",
    (subtree) => {
      const config = parseApplicationConfiguration({
        ...sample,
        [subtree]: { values: { Unset: null, Kept: "true" } },
      });
      expect(config[subtree].values.Kept).toBe("true");
      expect(config[subtree].values.Unset).toBeUndefined();
    },
  );

  it.each(["setting", "features"] as const)(
    "keeps the other %s values when one of them has a drifted type",
    (subtree) => {
      const onError = vi.fn();
      const config = parseApplicationConfiguration(
        { ...sample, [subtree]: { values: { Broken: { nested: true }, Kept: "true" } } },
        { onError },
      );
      expect(config[subtree].values.Kept).toBe("true");
      expect(config[subtree].values.Broken).toBeUndefined();
      expect(onError).toHaveBeenCalled();
    },
  );

  // 独立于上面那条「多子树同时漂移」的用例：那条里 localization 的降级已经会触发 onError，
  // 遮住 setting 整棵子树是否上报。只漂移 setting 才能锁住这条路径。
  it("reports a whole-subtree degradation instead of failing silently", () => {
    const onError = vi.fn();
    parseApplicationConfiguration({ ...sample, setting: "not-an-object" }, { onError });
    expect(onError).toHaveBeenCalled();
  });

  it("leaves onError untouched for a fully valid payload", () => {
    const onError = vi.fn();
    parseApplicationConfiguration(sample, { onError });
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["absent", undefined],
    ["empty", []],
    ["populated", ["admin"]],
  ])("normalizes a %s roles list to an array", (_label, roles) => {
    const config = parseApplicationConfiguration({
      ...sample,
      currentUser: { ...sample.currentUser, roles },
    });
    expect(config.currentUser.roles).toEqual(Array.isArray(roles) ? roles : []);
  });

  it.each([
    ["the auth subtree", { auth: null }],
    ["grantedPolicies", { auth: { grantedPolicies: null } }],
  ])("falls back to no granted policies when %s is null", (_label, patch) => {
    const config = parseApplicationConfiguration({ ...sample, ...patch });
    expect(config.auth.grantedPolicies).toEqual({});
  });

  it("still throws when the auth subtree has drifted to another shape", () => {
    expect(() => parseApplicationConfiguration({ ...sample, auth: "boom" })).toThrow();
  });

  it("keeps the profile fields ABP sends alongside the identity ones", () => {
    const config = parseApplicationConfiguration({
      ...sample,
      currentUser: {
        ...sample.currentUser,
        name: "San",
        surName: "Zhang",
        emailVerified: true,
        phoneNumber: "13800000000",
        phoneNumberVerified: false,
        sessionId: "s1",
        impersonatorUserName: "host-admin",
      },
    });
    expect(config.currentUser.name).toBe("San");
    expect(config.currentUser.surName).toBe("Zhang");
    expect(config.currentUser.emailVerified).toBe(true);
    expect(config.currentUser.phoneNumber).toBe("13800000000");
    expect(config.currentUser.phoneNumberVerified).toBe(false);
    expect(config.currentUser.sessionId).toBe("s1");
    expect(config.currentUser.impersonatorUserName).toBe("host-admin");
  });

  it("invokes onError before throwing when a critical field is broken", () => {
    let captured: unknown;
    expect(() =>
      parseApplicationConfiguration(
        { ...sample, currentUser: { isAuthenticated: "yes" } },
        {
          onError: (error) => {
            captured = error;
          },
        },
      ),
    ).toThrow();
    expect(captured).toBeDefined();
  });
});
