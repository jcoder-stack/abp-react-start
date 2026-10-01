// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApplicationConfiguration } from "../../src/core";
import { AppConfigProvider } from "../../src/react/app-config";
import { Instant, useTenantTimeZone } from "../../src/react/time-zone";

function makeConfig(timeZoneName: string | null): ApplicationConfiguration {
  return {
    currentUser: { isAuthenticated: false, id: null, userName: null, tenantId: null, roles: [] },
    auth: { grantedPolicies: {} },
    setting: { values: {} },
    localization: { currentCulture: { name: "en" }, languages: [], values: {} },
    currentTenant: { id: null, name: null, isAvailable: true },
    features: { values: {} },
    timing: { timeZone: { iana: { timeZoneName } } },
  };
}

function ZoneProbe() {
  return <span data-testid="zone">{useTenantTimeZone()}</span>;
}

describe("useTenantTimeZone / Instant", () => {
  it("按租户时区显示时刻", () => {
    render(
      <AppConfigProvider config={makeConfig("Asia/Shanghai")}>
        <ZoneProbe />
        <Instant value="2026-09-30T16:30:00Z" />
      </AppConfigProvider>,
    );
    expect(screen.getByTestId("zone").textContent).toBe("Asia/Shanghai");
    expect(screen.getByText("2026-10-01 00:30")).toBeTruthy();
  });

  it("租户未配置时区时按 UTC", () => {
    render(
      <AppConfigProvider config={makeConfig(null)}>
        <Instant value="2026-09-30T16:30:00Z" />
      </AppConfigProvider>,
    );
    expect(screen.getByText("2026-09-30 16:30")).toBeTruthy();
  });

  it("空值渲染 empty 占位", () => {
    render(
      <AppConfigProvider config={makeConfig("UTC")}>
        <Instant value={null} empty="—" />
      </AppConfigProvider>,
    );
    expect(screen.getByText("—")).toBeTruthy();
  });
});
