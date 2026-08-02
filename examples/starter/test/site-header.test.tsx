// @vitest-environment jsdom

import type { MenuItem } from "@jcoder-stack/abp-react/react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AbpBreadcrumb } from "@/components/abp/layout/abp-breadcrumb";
import { LocaleSwitcher } from "@/components/abp/layout/locale-switcher";
import { TenantSwitcher } from "@/components/abp/layout/tenant-switcher";
import { ThemeToggle } from "@/components/abp/layout/theme-toggle";
import { admin, makeConfig, renderWithProviders } from "./test-utils";

const items: MenuItem[] = [
  { key: "home", label: "Menu:Home", to: "/" },
  {
    key: "admin",
    label: "Menu:Admin",
    children: [{ key: "users", label: "Menu:Users", to: "/users" }],
  },
];

describe("AbpBreadcrumb", () => {
  it("renders the ancestor chain for the current path", async () => {
    renderWithProviders(<AbpBreadcrumb items={items} />, { identity: admin, path: "/users" });
    expect(await screen.findByText("Menu:Admin")).toBeDefined();
    expect(await screen.findByText("Menu:Users")).toBeDefined();
  });

  it("renders an ancestor with its own `to` as a clickable link", async () => {
    const itemsWithLinkableParent: MenuItem[] = [
      { key: "home", label: "Menu:Home", to: "/" },
      {
        key: "system",
        label: "Menu:System",
        to: "/system",
        children: [{ key: "users", label: "Menu:Users", to: "/users" }],
      },
    ];
    renderWithProviders(<AbpBreadcrumb items={itemsWithLinkableParent} />, {
      identity: admin,
      path: "/users",
    });
    const parent = await screen.findByText("Menu:System");
    expect(parent.closest("a")?.getAttribute("href")).toBe("/system");
  });
});

describe("LocaleSwitcher", () => {
  it("lists languages from app-config and links through /api/culture with returnUrl", async () => {
    renderWithProviders(<LocaleSwitcher />, { identity: admin, path: "/users" });
    // Radix 的下拉触发器靠 onPointerDown 开合，不是 onClick（jsdom 无原生 PointerEvent 时见 test-utils 的垫片）。
    fireEvent.pointerDown(await screen.findByRole("button", { name: /language/i }), { button: 0 });
    const zh = await screen.findByRole("menuitem", { name: "简体中文" });
    const href = zh.closest("a")?.getAttribute("href") ?? zh.getAttribute("href");
    expect(href).toContain("/api/culture?culture=zh-Hans");
    expect(href).toContain(`returnUrl=${encodeURIComponent("/users")}`);
  });
});

describe("TenantSwitcher", () => {
  it("does not render when multi-tenancy is unavailable", async () => {
    renderWithProviders(<TenantSwitcher />, {
      identity: admin,
      config: makeConfig({ currentTenant: { id: null, name: null, isAvailable: false } }),
    });
    expect(screen.queryByRole("button", { name: /tenant|host/i })).toBeNull();
  });

  it("shows the host label and opens the switch dialog", async () => {
    renderWithProviders(<TenantSwitcher />, { identity: admin });
    fireEvent.click(await screen.findByRole("button", { name: /host/i }));
    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(await screen.findByLabelText(/tenant name/i)).toBeDefined();
  });
});

describe("ThemeToggle", () => {
  it("switches the dark class and persists the choice", async () => {
    renderWithProviders(<ThemeToggle />, { identity: admin });
    fireEvent.pointerDown(await screen.findByRole("button", { name: /theme/i }), { button: 0 });
    fireEvent.click(await screen.findByRole("menuitem", { name: /dark/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});
