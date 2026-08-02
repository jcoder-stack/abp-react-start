import { handleCallback } from "@jcoder-stack/abp-react/proxy";
import { createFileRoute } from "@tanstack/react-router";
import { getAuthRuntime } from "@/auth/runtime";

export const Route = createFileRoute("/api/auth/callback")({
  server: { handlers: { GET: ({ request }) => handleCallback(request, getAuthRuntime()) } },
});
