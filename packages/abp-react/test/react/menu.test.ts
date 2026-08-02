import { describe, expect, it } from "vitest";
import { buildMenu, findBreadcrumbs, type MenuItem } from "../../src/react/menu";

const items: MenuItem[] = [
  { key: "home", label: "Menu:Home", to: "/", order: 0 },
  {
    key: "admin",
    label: "Menu:Admin",
    order: 2,
    requiredPolicy: "Admin",
    children: [
      { key: "users", label: "Menu:Users", to: "/admin/users", requiredPolicy: "Admin.Users" },
    ],
  },
  {
    key: "chat",
    label: "Menu:Chat",
    to: "/chat",
    order: 1,
    requiredFeature: "Chat",
    requireAuth: true,
  },
];

describe("buildMenu", () => {
  it("prunes by policy, feature and auth; drops linkless parents with no children; sorts by order", () => {
    const menu = buildMenu(items, {
      grantedPolicies: { Admin: true },
      features: { Chat: "false" },
      isAuthenticated: true,
    });
    expect(menu.map((m) => m.key)).toEqual(["home"]);
  });

  it("keeps a requiredFeature item when the value is the PascalCase boolean ABP persists", () => {
    const menu = buildMenu(items, {
      grantedPolicies: {},
      features: { Chat: "True" },
      isAuthenticated: true,
    });
    expect(menu.map((m) => m.key)).toEqual(["home", "chat"]);
  });

  it("drops the children key entirely when a linked parent loses every child", () => {
    const linkedParent: MenuItem[] = [
      {
        key: "admin",
        label: "Menu:Admin",
        to: "/admin",
        children: [
          { key: "users", label: "Menu:Users", to: "/admin/users", requiredPolicy: "Admin.Users" },
        ],
      },
    ];
    const menu = buildMenu(linkedParent, { grantedPolicies: {} });
    expect(menu.map((m) => m.key)).toEqual(["admin"]);
    expect(menu[0]?.children).toBeUndefined();
  });

  it("keeps the subtree when everything is granted", () => {
    const menu = buildMenu(items, {
      grantedPolicies: { Admin: true, "Admin.Users": true },
      features: { Chat: "true" },
      isAuthenticated: true,
    });
    expect(menu.map((m) => m.key)).toEqual(["home", "chat", "admin"]);
    expect(menu[2]?.children?.map((m) => m.key)).toEqual(["users"]);
  });
});

describe("findBreadcrumbs", () => {
  it("returns the ancestor chain of the exact match, else the longest prefix match", () => {
    expect(findBreadcrumbs(items, "/admin/users").map((m) => m.key)).toEqual(["admin", "users"]);
    expect(findBreadcrumbs(items, "/admin/users/42").map((m) => m.key)).toEqual(["admin", "users"]);
    expect(findBreadcrumbs(items, "/nowhere").map((m) => m.key)).toEqual([]);
  });

  it("only prefix-matches at path segment boundaries", () => {
    const menu: MenuItem[] = [
      {
        key: "admin",
        label: "Menu:Admin",
        to: "/admin",
        children: [{ key: "users", label: "Menu:Users", to: "/admin/users" }],
      },
    ];
    expect(findBreadcrumbs(menu, "/administration").map((m) => m.key)).toEqual([]);
    expect(findBreadcrumbs(menu, "/admin/users").map((m) => m.key)).toEqual(["admin", "users"]);
    expect(findBreadcrumbs(menu, "/admin/roles").map((m) => m.key)).toEqual(["admin"]);
  });
});
