// @vitest-environment jsdom
import type { MenuItem } from "@jcoder-stack/abp-react/react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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

  it("停在详情页时点亮所属的菜单项", async () => {
    renderWithProviders(<NavMain items={items} />, { identity: admin, path: "/roles/42" });
    const roles = await screen.findByText("Menu:Roles");
    expect(roles.closest("a")?.getAttribute("data-active")).toBe("true");
  });

  it("子项是当前页时，一级项带上 data-has-active-child", async () => {
    renderWithProviders(<NavMain items={items} />, { identity: admin, path: "/roles/42" });
    const group = (await screen.findByText("Menu:Admin")).closest("[data-sidebar='menu-item']");
    expect(group?.getAttribute("data-has-active-child")).toBe("true");
  });

  it("手动折叠所属组后，一级项仍带 data-has-active-child", async () => {
    renderWithProviders(<NavMain items={items} />, { identity: admin, path: "/roles/42" });
    const trigger = await screen.findByRole("button", { name: "Menu:Admin" });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByText("Menu:Roles")).toBeNull());
    const group = trigger.closest("[data-sidebar='menu-item']");
    expect(group?.getAttribute("data-has-active-child")).toBe("true");
  });
});
