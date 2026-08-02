// @vitest-environment jsdom
import type { MenuItem } from "@jcoder/abp-react/react";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NavMain } from "@/components/abp/layout/nav-main";
import { admin, anonymous, renderWithProviders } from "./test-utils";

const items: MenuItem[] = [
  { key: "home", label: "Menu:Home", to: "/" },
  { key: "users", label: "Menu:Users", to: "/users", requiredPolicy: "AbpIdentity.Users" },
  {
    key: "admin",
    label: "Menu:Admin",
    requiredPolicy: "AbpIdentity.Users",
    children: [{ key: "roles", label: "Menu:Roles", to: "/roles" }],
  },
];

describe("NavMain", () => {
  it("prunes menu items the identity lacks permission for", async () => {
    renderWithProviders(<NavMain items={items} />, { identity: anonymous });
    expect(await screen.findByText("Menu:Home")).toBeDefined();
    expect(screen.queryByText("Menu:Users")).toBeNull();
    expect(screen.queryByText("Menu:Admin")).toBeNull();
  });

  it("renders granted items and collapsible children", async () => {
    renderWithProviders(<NavMain items={items} />, { identity: admin, path: "/roles" });
    expect(await screen.findByText("Menu:Users")).toBeDefined();
    // 子项所在组默认展开（当前路径命中 children）
    expect(await screen.findByText("Menu:Roles")).toBeDefined();
  });
});
