import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/i18n/translator";

const base = {
  culture: "zh-Hans",
  backend: { AbpIdentity: { Users: "用户" } },
  frontend: {
    "zh-Hans": {
      App: { Save: "保存", Greeting: "你好 {name}", items: { one: "{0} 项", other: "{0} 项" } },
    },
    en: { App: { Save: "Save", Only: "EnOnly" } },
  },
  fallbackCulture: "en",
};

describe("createTranslator", () => {
  it("keeps plain frontend keys on the empty resource when a default resource name is set", () => {
    // 前端词库把键存在资源 "" 下且不写 `::`；defaultResourceName 只该作用于显式的 `::Key`，
    // 否则后端一旦下发 defaultResourceName，整个前端词库就全部查不到、页面显示裸 key。
    const t = createTranslator({
      culture: "en",
      defaultResourceName: "MyApp",
      frontend: { en: { "": { "Layout:Language": "Language" } } },
      backend: { MyApp: { Save: "Save" } },
    });
    expect(t.t("Layout:Language")).toBe("Language");
    expect(t.t("::Save")).toBe("Save");
  });

  it("resolves backend ABP resources", () => {
    expect(createTranslator(base).t("AbpIdentity::Users")).toBe("用户");
  });

  it("resolves frontend catalog for the current culture with interpolation", () => {
    const t = createTranslator(base);
    expect(t.t("App::Save")).toBe("保存");
    expect(t.t("App::Greeting", { name: "张三" })).toBe("你好 张三");
  });

  it("backend overrides frontend for the same key", () => {
    const t = createTranslator({
      culture: "en",
      backend: { App: { Save: "SAVE-FROM-BACKEND" } },
      frontend: { en: { App: { Save: "Save" } } },
    });
    expect(t.t("App::Save")).toBe("SAVE-FROM-BACKEND");
  });

  it("resolves a resource-less key against defaultResourceName", () => {
    const t = createTranslator({
      culture: "en",
      backend: { App: { Save: "Save" } },
      defaultResourceName: "App",
    });
    expect(t.t("::Save")).toBe("Save");
    expect(t.has("::Save")).toBe(true);
  });

  it("keeps the empty resource when no defaultResourceName is given", () => {
    const t = createTranslator({ culture: "en", backend: { "": { Save: "Save" } } });
    expect(t.t("::Save")).toBe("Save");
  });

  it("falls back to the primary subtag before the fallback culture", () => {
    const t = createTranslator({
      culture: "zh-Hans",
      frontend: { zh: { App: { Save: "保存" } }, en: { App: { Save: "Save" } } },
      fallbackCulture: "en",
    });
    expect(t.t("App::Save")).toBe("保存");
  });

  it("falls back to the fallback culture", () => {
    expect(createTranslator(base).t("App::Only")).toBe("EnOnly");
  });

  it("returns the key and calls onMissing when unresolved", () => {
    const onMissing = vi.fn();
    const t = createTranslator({ ...base, onMissing });
    expect(t.t("App::Nope")).toBe("App::Nope");
    expect(onMissing).toHaveBeenCalledWith("App::Nope");
  });

  it("plural selects the form by count and interpolates count as {0}", () => {
    expect(createTranslator(base).plural("App::items", 3)).toBe("3 项");
  });

  it("plural interpolates named args together with the count", () => {
    const t = createTranslator({
      culture: "en",
      frontend: {
        en: {
          App: { items: { one: "{name} has {count} item", other: "{name} has {count} items" } },
        },
      },
    });
    expect(t.plural("App::items", 3, { name: "Alice" })).toBe("Alice has 3 items");
    expect(t.plural("App::items", 1, { name: "Alice" })).toBe("Alice has 1 item");
  });

  it("has() reports resolvability", () => {
    const t = createTranslator(base);
    expect(t.has("App::Save")).toBe(true);
    expect(t.has("App::Nope")).toBe(false);
  });

  it("t() falls back to the `other` form for a plural entry has() reports as present", () => {
    const onMissing = vi.fn();
    const t = createTranslator({ ...base, onMissing });
    expect(t.has("App::items")).toBe(true);
    expect(t.t("App::items", 3)).toBe("3 项");
    expect(onMissing).not.toHaveBeenCalled();
  });

  it("has() is false for a plural entry without an `other` form", () => {
    const t = createTranslator({
      culture: "en",
      frontend: { en: { App: { items: { one: "one item" } } } },
    });
    expect(t.has("App::items")).toBe(false);
    expect(t.t("App::items")).toBe("App::items");
  });

  it("uses an injected interpolate implementation", () => {
    const t = createTranslator({
      culture: "en",
      backend: { App: { Greeting: "hi {name}" } },
      interpolate: (template) => `CUSTOM:${template}`,
    });
    expect(t.t("App::Greeting", { name: "x" })).toBe("CUSTOM:hi {name}");
  });

  it("uses an injected selectPluralForm implementation", () => {
    const t = createTranslator({
      culture: "en",
      frontend: { en: { App: { Items: { one: "one", other: "other" } } } },
      selectPluralForm: () => "PICKED",
    });
    expect(t.plural("App::Items", 5)).toBe("PICKED");
  });
});
