// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { composeFeatures, type FeatureModule } from "../templates/features-compose";

function marker(id: string) {
  return function Marker({ children }: { children: ReactNode }) {
    return createElement("div", { "data-testid": id }, children);
  };
}

function modules(entries: Record<string, FeatureModule>) {
  return Object.fromEntries(Object.entries(entries).map(([path, mod]) => [path, { default: mod }]));
}

describe("composeFeatures", () => {
  it("nests providers in folder order, outermost first", () => {
    const { FeatureProviders } = composeFeatures(
      modules({
        "./b/feature.tsx": { Provider: marker("b") },
        "./a/feature.tsx": { Provider: marker("a") },
      }),
    );
    render(createElement(FeatureProviders, null, createElement("span", { "data-testid": "app" })));
    const a = screen.getByTestId("a");
    const b = screen.getByTestId("b");
    expect(a.contains(b)).toBe(true);
    expect(b.contains(screen.getByTestId("app"))).toBe(true);
  });

  it("renders the app untouched when no feature is installed", () => {
    const { FeatureProviders, featureHead, featureMessages } = composeFeatures({});
    render(createElement(FeatureProviders, null, createElement("span", { "data-testid": "app" })));
    expect(screen.getByTestId("app")).toBeTruthy();
    expect(featureHead).toEqual({ meta: [], links: [] });
    expect(featureMessages).toEqual([]);
  });

  it("names the file when a feature module has no default export", () => {
    expect(() =>
      composeFeatures({ "./bad/feature.tsx": {} as { default: FeatureModule } }),
    ).toThrow("./bad/feature.tsx must default-export a FeatureModule");
  });

  it("concatenates head entries and catalogs in folder order, skipping features without them", () => {
    const { featureHead, featureMessages } = composeFeatures(
      modules({
        "./pwa/feature.tsx": {
          head: {
            meta: [{ name: "theme-color", content: "#fff" }],
            links: [{ rel: "manifest", href: "/m" }],
          },
          messages: { en: { "": { Reload: "Reload" } } },
        },
        "./bare/feature.tsx": {},
        "./chat/feature.tsx": { messages: { en: { "": { Send: "Send" } } } },
      }),
    );
    expect(featureHead.meta).toEqual([{ name: "theme-color", content: "#fff" }]);
    expect(featureHead.links).toEqual([{ rel: "manifest", href: "/m" }]);
    expect(featureMessages).toEqual([
      { en: { "": { Send: "Send" } } },
      { en: { "": { Reload: "Reload" } } },
    ]);
  });
});

// starter 是 init 产物的参照实现；聚合点归 CLI 模板定义，两边必须逐字一致。
it.each([
  ["features-compose.ts", "examples/starter/src/features/compose.ts"],
  ["features-index.ts.tpl", "examples/starter/src/features/index.ts"],
])("starter mirrors the %s template verbatim", (template, starterPath) => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
  expect(read(`../../../${starterPath}`)).toBe(read(`../templates/${template}`));
});
