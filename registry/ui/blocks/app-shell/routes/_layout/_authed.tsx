import { useLocalization } from "@jcoder-stack/abp-react/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAuth } from "@/auth";

/** Pathless layout route: guards every child route behind an authenticated session. */
export const Route = createFileRoute("/_layout/_authed")({
  beforeLoad: requireAuth(),
  pendingComponent: AuthPending,
  component: () => <Outlet />,
});

function AuthPending() {
  const L = useLocalization();
  return <p>{L("Shell:Loading")}</p>;
}
