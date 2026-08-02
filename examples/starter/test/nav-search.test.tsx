// @vitest-environment jsdom
import type { MenuItem } from "@jcoder/abp-react/react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NavSearch } from "@/components/abp/layout/nav-search";
import { admin, anonymous, renderWithProviders } from "./test-utils";

const items: MenuItem[] = [
  { key: "home", label: "Menu:Home", to: "/" },
  { key: "users", label: "Menu:Users", to: "/identity/users", requiredPolicy: "AbpIdentity.Users" },
  {
    key: "admin",
    label: "Menu:Admin",
    requiredPolicy: "AbpIdentity.Users",
    children: [{ key: "roles", label: "Menu:Roles", to: "/identity/roles" }],
  },
];

async function openDialog() {
  fireEvent.click(await screen.findByRole("button", { name: /Search/ }));
}

describe("NavSearch", () => {
  it("lists only menu entries the identity has permission for", async () => {
    renderWithProviders(<NavSearch items={items} />, { identity: anonymous });
    await openDialog();
    expect(await screen.findByText("Menu:Home")).toBeDefined();
    expect(screen.queryByText("Menu:Users")).toBeNull();
    expect(screen.queryByText("Menu:Roles")).toBeNull();
  });

  it("filters entries as the user types", async () => {
    renderWithProviders(<NavSearch items={items} />, { identity: admin });
    await openDialog();
    expect(await screen.findByText("Menu:Users")).toBeDefined();

    fireEvent.input(screen.getByPlaceholderText("Type to search the menu..."), {
      target: { value: "Roles" },
    });
    await waitFor(() => {
      expect(screen.queryByText("Menu:Home")).toBeNull();
    });
    expect(screen.getByText("Menu:Roles")).toBeDefined();
  });
});
