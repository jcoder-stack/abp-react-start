import { handleLogout } from "@jcoder-stack/abp-react/proxy";
import { createFileRoute } from "@tanstack/react-router";
import { getAuthRuntime } from "@/auth/runtime";

export const Route = createFileRoute("/api/auth/logout")({
  server: { handlers: { GET: ({ request }) => handleLogout(request, getAuthRuntime()) } },
});
