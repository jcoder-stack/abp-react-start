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
      <p className="text-sm text-muted-foreground">{L("Shell:ForbiddenHint")}</p>
      <p className="space-x-4 text-sm">
        <Link to="/home" className="text-primary underline-offset-4 hover:underline">
          {L("Shell:BackHome")}
        </Link>
        {/* 权限不够的正解常常是换个账号:注销是鉴权态变化,必须整页跳转(a href),不走 SPA navigate */}
        <a href="/api/auth/logout" className="text-primary underline-offset-4 hover:underline">
          {L("Shell:SignOut")}
        </a>
      </p>
    </section>
  );
}
