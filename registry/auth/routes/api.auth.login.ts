import { handleLogin } from "@jcoder/abp-react/proxy";
import { createFileRoute } from "@tanstack/react-router";
import { getAuthRuntime } from "@/auth/runtime";

export const Route = createFileRoute("/api/auth/login")({
  server: { handlers: { GET: ({ request }) => handleLogin(request, getAuthRuntime()) } },
});
