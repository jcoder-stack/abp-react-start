// @vitest-environment jsdom
import type { FrontendCatalog } from "@jcoder-stack/abp-react/i18n";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "./test-utils";

vi.mock("@/auth/server-fns", () => ({ loginWithPasswordFn: vi.fn() }));

import { loginWithPasswordFn } from "@/auth/server-fns";
import layoutMessages from "@/components/abp/layout/layout-messages.json";
import { LoginForm } from "@/components/abp/login/login-form";
import loginMessages from "@/components/abp/login/login-messages.json";

const messages: FrontendCatalog = {
  en: { "": { ...layoutMessages.en?.[""], ...loginMessages.en?.[""] } },
  "zh-Hans": {
    "": { ...layoutMessages["zh-Hans"]?.[""], ...loginMessages["zh-Hans"]?.[""] },
  },
};

describe("LoginForm", () => {
  it("shows the failed alert with the error code on bad credentials", async () => {
    vi.mocked(loginWithPasswordFn).mockResolvedValue({
      ok: false as const,
      error: "invalid_credentials" as const,
    });
    renderWithProviders(<LoginForm />, { messages });
    fireEvent.change(await screen.findByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(await screen.findByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(await screen.findByRole("button", { name: /^sign in$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("invalid_credentials");
  });

  it("submits the entered credentials and shows no alert on success", async () => {
    vi.mocked(loginWithPasswordFn).mockResolvedValue({ ok: true as const });
    renderWithProviders(<LoginForm />, { messages });
    fireEvent.change(await screen.findByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(await screen.findByLabelText(/password/i), { target: { value: "pw" } });
    fireEvent.click(await screen.findByRole("button", { name: /^sign in$/i }));
    await waitFor(() =>
      expect(loginWithPasswordFn).toHaveBeenCalledWith({
        data: { userName: "admin", password: "pw" },
      }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the initial error from the OIDC callback redirect", async () => {
    renderWithProviders(<LoginForm initialError="invalid_state" />, { messages });
    expect((await screen.findByRole("alert")).textContent).toContain("invalid_state");
  });
});
