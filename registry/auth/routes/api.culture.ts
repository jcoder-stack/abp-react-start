import { handleSetCulture } from "@jcoder-stack/abp-react/proxy";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/culture")({
  server: { handlers: { GET: ({ request }) => handleSetCulture(request) } },
});
