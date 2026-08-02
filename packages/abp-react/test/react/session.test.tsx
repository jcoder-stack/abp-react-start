// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Identity } from "../../src/auth";
import {
  PermissionGuard,
  SessionProvider,
  useCurrentUser,
  usePermission,
  useSession,
} from "../../src/react/session";

const anonymous: Identity = {
  isAuthenticated: false,
  user: null,
  grantedPolicies: {},
  tenant: null,
};
const admin: Identity = {
  isAuthenticated: true,
  user: { id: "1", userName: "admin", roles: ["admin"] },
  grantedPolicies: { "AbpIdentity.Users": true },
  tenant: null,
};
const stale: Identity = {
  isAuthenticated: true,
  user: { id: "9", userName: "stale", roles: [] },
  grantedPolicies: {},
  tenant: null,
};

function Probe() {
  const { status } = useSession();
  const user = useCurrentUser();
  const canUsers = usePermission("AbpIdentity.Users");
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.userName ?? "-"}</span>
      <span data-testid="can">{String(canUsers)}</span>
    </div>
  );
}

describe("SessionProvider / useSession", () => {
  it("exposes identity, derived status and permission checks", () => {
    render(
      <SessionProvider identity={admin}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(screen.getByTestId("user").textContent).toBe("admin");
    expect(screen.getByTestId("can").textContent).toBe("true");
  });

  it("reload() swaps in the identity fetched from the server", async () => {
    function Reloader() {
      const { reload, status } = useSession();
      return (
        <button type="button" onClick={() => void reload()}>
          {status}
        </button>
      );
    }
    render(
      <SessionProvider identity={anonymous} fetchIdentity={async () => admin}>
        <Reloader />
      </SessionProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("anonymous");
    await act(async () => {
      screen.getByRole("button").click();
    });
    expect(screen.getByRole("button").textContent).toBe("authenticated");
  });

  it("keeps the newest reload result when an earlier one resolves late", async () => {
    const pending: Array<(identity: Identity) => void> = [];
    let reload!: () => Promise<void>;
    function Capture() {
      const session = useSession();
      reload = session.reload;
      return <span data-testid="user">{session.identity.user?.userName ?? "-"}</span>;
    }
    render(
      <SessionProvider
        identity={anonymous}
        fetchIdentity={() => new Promise<Identity>((resolve) => pending.push(resolve))}
      >
        <Capture />
      </SessionProvider>,
    );
    await act(async () => {
      void reload();
      void reload();
    });
    expect(pending).toHaveLength(2);
    await act(async () => {
      pending[1]?.(admin);
      pending[0]?.(stale);
    });
    expect(screen.getByTestId("user").textContent).toBe("admin");
  });

  it("discards an in-flight reload once a new identity is hydrated", async () => {
    const pending: Array<(identity: Identity) => void> = [];
    let reload!: () => Promise<void>;
    function Capture() {
      const session = useSession();
      reload = session.reload;
      return <span data-testid="user">{session.identity.user?.userName ?? "-"}</span>;
    }
    const fetchIdentity = () => new Promise<Identity>((resolve) => pending.push(resolve));
    const { rerender } = render(
      <SessionProvider identity={anonymous} fetchIdentity={fetchIdentity}>
        <Capture />
      </SessionProvider>,
    );
    await act(async () => {
      void reload();
    });
    rerender(
      <SessionProvider identity={admin} fetchIdentity={fetchIdentity}>
        <Capture />
      </SessionProvider>,
    );
    await act(async () => {
      pending[0]?.(stale);
    });
    expect(screen.getByTestId("user").textContent).toBe("admin");
  });

  it("follows a new SSR-hydrated identity prop", () => {
    const { rerender } = render(
      <SessionProvider identity={anonymous}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId("status").textContent).toBe("anonymous");
    rerender(
      <SessionProvider identity={admin}>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
  });

  it("useSession outside the provider throws", () => {
    expect(() => render(<Probe />)).toThrow(/SessionProvider/);
  });
});

describe("PermissionGuard", () => {
  it("renders children only when the check passes; falls back otherwise", () => {
    render(
      <SessionProvider identity={admin}>
        <PermissionGuard policy="AbpIdentity.Users">
          <span>allowed</span>
        </PermissionGuard>
        <PermissionGuard policy="Missing.Policy" fallback={<span>denied</span>}>
          <span>never</span>
        </PermissionGuard>
      </SessionProvider>,
    );
    expect(screen.getByText("allowed")).toBeDefined();
    expect(screen.getByText("denied")).toBeDefined();
    expect(screen.queryByText("never")).toBeNull();
  });

  it("all requires every policy; any requires at least one", () => {
    render(
      <SessionProvider identity={admin}>
        <PermissionGuard
          all={["AbpIdentity.Users", "Missing.Policy"]}
          fallback={<span>no-all</span>}
        >
          <span>yes-all</span>
        </PermissionGuard>
        <PermissionGuard
          any={["AbpIdentity.Users", "Missing.Policy"]}
          fallback={<span>no-any</span>}
        >
          <span>yes-any</span>
        </PermissionGuard>
      </SessionProvider>,
    );
    expect(screen.getByText("no-all")).toBeDefined();
    expect(screen.getByText("yes-any")).toBeDefined();
  });

  it("requireAuth gates on authentication state", () => {
    render(
      <SessionProvider identity={anonymous}>
        <PermissionGuard requireAuth fallback={<span>login please</span>}>
          <span>secret</span>
        </PermissionGuard>
      </SessionProvider>,
    );
    expect(screen.getByText("login please")).toBeDefined();
  });
});
