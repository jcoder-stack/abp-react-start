import { handleAbpStream } from "@jcoder-stack/abp-react/proxy";
import { createFileRoute } from "@tanstack/react-router";
import { getAuthRuntime } from "@/auth/runtime";

export const Route = createFileRoute("/api/stream/$")({
  server: { handlers: { GET: ({ request }) => handleAbpStream(request, getAuthRuntime()) } },
});
