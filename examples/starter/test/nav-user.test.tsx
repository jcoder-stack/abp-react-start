// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NavUser } from "@/components/abp/layout/nav-user";
import { admin, anonymous, renderWithProviders } from "./test-utils";

describe("NavUser", () => {
  it("shows a sign-in link when anonymous", async () => {
    renderWithProviders(<NavUser />, { identity: anonymous });
    const login = await screen.findByRole("link", { name: /sign in/i });
    expect(login.getAttribute("href")).toBe("/login");
  });

  it("shows the user name when authenticated", async () => {
    renderWithProviders(<NavUser />, { identity: admin });
    expect(await screen.findByText("admin")).toBeDefined();
    expect(await screen.findByText("admin@abp.io")).toBeDefined();
  });
});
