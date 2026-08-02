import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import type { Identity } from "../../src/auth";
import { type GuardContext, requireAuth, requirePermission } from "../../src/router/guards";

const admin: Identity = {
  isAuthenticated: true,
  user: { id: "1", userName: "admin", roles: [] },
  grantedPolicies: { "AbpIdentity.Users": true },
  tenant: null,
};
const anonymous: Identity = {
  isAuthenticated: false,
  user: null,
  grantedPolicies: {},
  tenant: null,
};

function catchThrown(fn: () => void): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected the guard to throw");
}

describe("requireAuth", () => {
  it("passes an authenticated identity and redirects an anonymous one to login", () => {
    const guard = requireAuth();
    expect(() =>
      guard({ context: { identity: admin }, location: { href: "/books" } }),
    ).not.toThrow();

    const thrown = catchThrown(() =>
      guard({ context: { identity: anonymous }, location: { href: "/books?page=2" } }),
    );
    expect(isRedirect(thrown)).toBe(true);
    const redirect = thrown as Response & { options: { href?: string } };
    expect(redirect.options.href).toBe(
      `/api/auth/login?returnUrl=${encodeURIComponent("/books?page=2")}`,
    );
  });

  it("appends returnUrl with & when loginPath already carries a query", () => {
    const guard = requireAuth({ loginPath: "/api/auth/login?provider=x" });
    const thrown = catchThrown(() =>
      guard({ context: { identity: anonymous }, location: { href: "/books" } }),
    );
    const redirect = thrown as Response & { options: { href?: string } };
    expect(redirect.options.href).toBe(
      `/api/auth/login?provider=x&returnUrl=${encodeURIComponent("/books")}`,
    );
  });

  it("throws a plain error when identity was never injected into the route context", () => {
    const guard = requireAuth();
    const thrown = catchThrown(() =>
      guard({ context: {} as unknown as GuardContext, location: { href: "/books" } }),
    );
    expect(isRedirect(thrown)).toBe(false);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("identity missing");
    expect((thrown as Error).message).toContain("beforeLoad");
  });
});

describe("requirePermission", () => {
  it("passes a granted policy and redirects a missing one to /forbidden", () => {
    expect(() =>
      requirePermission("AbpIdentity.Users")({ context: { identity: admin } }),
    ).not.toThrow();

    const thrown = catchThrown(() =>
      requirePermission("Missing")({ context: { identity: admin } }),
    );
    expect(isRedirect(thrown)).toBe(true);
    const redirect = thrown as Response & { options: { to?: string } };
    expect(redirect.options.to).toBe("/forbidden");
  });

  it("sends an anonymous visitor to /forbidden unless loginPath is configured", () => {
    const thrown = catchThrown(() =>
      requirePermission("AbpIdentity.Users")({ context: { identity: anonymous } }),
    );
    expect((thrown as Response & { options: { to?: string } }).options.to).toBe("/forbidden");

    const toLogin = catchThrown(() =>
      requirePermission("AbpIdentity.Users", { loginPath: "/api/auth/login?provider=x" })({
        context: { identity: anonymous },
        location: { href: "/books" },
      }),
    );
    expect((toLogin as Response & { options: { href?: string } }).options.href).toBe(
      `/api/auth/login?provider=x&returnUrl=${encodeURIComponent("/books")}`,
    );
  });

  it("keeps sending an authenticated but unauthorized user to redirectTo even with loginPath", () => {
    const thrown = catchThrown(() =>
      requirePermission("Missing", { loginPath: "/api/auth/login" })({
        context: { identity: admin },
        location: { href: "/books" },
      }),
    );
    expect((thrown as Response & { options: { to?: string } }).options.to).toBe("/forbidden");
  });

  it("throws a plain error when identity was never injected into the route context", () => {
    const thrown = catchThrown(() =>
      requirePermission("X")({ context: {} as unknown as GuardContext }),
    );
    expect(isRedirect(thrown)).toBe(false);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("identity missing");
    expect((thrown as Error).message).toContain("beforeLoad");
  });
});
