// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { memo } from "react";
import { describe, expect, it } from "vitest";
import type { ApplicationConfiguration } from "../../src/core";
import {
  AppConfigProvider,
  FeatureGuard,
  useCulture,
  useFeatureEnabled,
  useLocalization,
  useSettingBoolean,
} from "../../src/react/app-config";

const config: ApplicationConfiguration = {
  currentUser: {
    isAuthenticated: false,
    id: null,
    userName: null,
    tenantId: null,
    roles: [],
  },
  auth: { grantedPolicies: {} },
  setting: { values: { "Abp.Feature.X": "true" } },
  localization: {
    currentCulture: { name: "zh-Hans" },
    languages: [],
    values: { Res: { Hello: "你好 {0}" } },
  },
  currentTenant: { id: null, name: null, isAvailable: true },
  features: { values: { Chat: "true" } },
};

function Probe() {
  const L = useLocalization();
  return (
    <div>
      <span data-testid="culture">{useCulture()}</span>
      <span data-testid="hello">{L("Res::Hello", "世界")}</span>
      <span data-testid="setting">{String(useSettingBoolean("Abp.Feature.X"))}</span>
      <span data-testid="feature">{String(useFeatureEnabled("Chat"))}</span>
    </div>
  );
}

describe("AppConfigProvider", () => {
  it("exposes culture, backend localization, settings and features", () => {
    render(
      <AppConfigProvider config={config}>
        <Probe />
      </AppConfigProvider>,
    );
    expect(screen.getByTestId("culture").textContent).toBe("zh-Hans");
    expect(screen.getByTestId("hello").textContent).toBe("你好 世界");
    expect(screen.getByTestId("setting").textContent).toBe("true");
    expect(screen.getByTestId("feature").textContent).toBe("true");
  });

  it("resolves ::Key against the config's defaultResourceName", () => {
    // ABP 把默认资源名放在 app-config 里，Provider 应把它接进 translator，
    // 否则按 ABP 文档写法的 `::Key` 会静默显示成裸 key。
    const withDefaultResource: ApplicationConfiguration = {
      ...config,
      localization: { ...config.localization, defaultResourceName: "Res" },
    };
    function Bare() {
      return <span data-testid="bare">{useLocalization()("::Hello", "世界")}</span>;
    }
    render(
      <AppConfigProvider config={withDefaultResource}>
        <Bare />
      </AppConfigProvider>,
    );
    expect(screen.getByTestId("bare").textContent).toBe("你好 世界");
  });

  it("treats the PascalCase booleans ABP persists as enabled", () => {
    const saved: ApplicationConfiguration = {
      ...config,
      setting: { values: { "Abp.Feature.X": "True" } },
      features: { values: { Chat: "True" } },
    };
    render(
      <AppConfigProvider config={saved}>
        <Probe />
      </AppConfigProvider>,
    );
    expect(screen.getByTestId("setting").textContent).toBe("true");
    expect(screen.getByTestId("feature").textContent).toBe("true");
  });

  it("does not re-render consumers when only inline callback props change identity", () => {
    let renders = 0;
    const Consumer = memo(function Consumer() {
      renders += 1;
      useLocalization();
      return null;
    });
    const missing: string[] = [];
    const tree = (
      <AppConfigProvider config={config} onMissingKey={(key) => missing.push(key)}>
        <Consumer />
      </AppConfigProvider>
    );
    const { rerender } = render(tree);
    expect(renders).toBe(1);
    rerender(
      <AppConfigProvider config={config} onMissingKey={(key) => missing.push(key)}>
        <Consumer />
      </AppConfigProvider>,
    );
    expect(renders).toBe(1);
  });

  it("routes missing keys to the latest onMissingKey prop", () => {
    const first: string[] = [];
    const second: string[] = [];
    function Missing() {
      return <span data-testid="missing">{useLocalization()("Res::Nope")}</span>;
    }
    const { rerender } = render(
      <AppConfigProvider config={config} onMissingKey={(key) => first.push(key)}>
        <Missing />
      </AppConfigProvider>,
    );
    expect(first).toEqual(["Res::Nope"]);
    rerender(
      <AppConfigProvider config={config} onMissingKey={(key) => second.push(key)}>
        <Missing />
      </AppConfigProvider>,
    );
    expect(second).toEqual(["Res::Nope"]);
  });

  it("FeatureGuard renders children only when the flag is enabled", () => {
    render(
      <AppConfigProvider config={config}>
        <FeatureGuard feature="Chat">
          <span>chat on</span>
        </FeatureGuard>
        <FeatureGuard feature="Off" fallback={<span>off</span>}>
          <span>never</span>
        </FeatureGuard>
      </AppConfigProvider>,
    );
    expect(screen.getByText("chat on")).toBeDefined();
    expect(screen.getByText("off")).toBeDefined();
    expect(screen.queryByText("never")).toBeNull();
  });
});
