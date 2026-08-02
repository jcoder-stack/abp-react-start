import { handleSetTenant } from "@jcoder/abp-react/proxy";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tenant")({
  server: { handlers: { GET: ({ request }) => handleSetTenant(request) } },
});
