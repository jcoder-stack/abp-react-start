import { useLocalization } from "@jcoder-stack/abp-react/react";
import { createFileRoute, Link } from "@tanstack/react-router";

/** 403 page. Permission guards redirect an authenticated but unauthorized user here. */
export const Route = createFileRoute("/_layout/forbidden")({
  component: Forbidden,
});

function Forbidden() {
  const L = useLocalization();
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-normal">{L("Shell:Forbidden")}</h1>
      <p>{L("Shell:ForbiddenHint")}</p>
      <Link to="/">{L("Shell:BackHome")}</Link>
    </section>
  );
}
