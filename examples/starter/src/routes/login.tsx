import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "@/components/abp/login/login-form";

export const Route = createFileRoute("/login")({
  validateSearch: (search) => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { error } = Route.useSearch();
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center py-10">
      <LoginForm initialError={error} className="w-full max-w-sm" />
    </div>
  );
}
