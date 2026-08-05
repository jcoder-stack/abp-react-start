import { useCurrentUser, useLocalization } from "@jcoder-stack/abp-react/react";
import { createFileRoute } from "@tanstack/react-router";

/** 控制台首页:登录即可见,零权限要求——「进入控制台」与侧栏 Home 的落点,
 *  保证没有任何管理权限的用户也有地方可站,而不是砸在某个权限守卫的 403 上。 */
export const Route = createFileRoute("/_layout/_authed/home")({
  component: HomePage,
});

const FEATURES = [
  ["Home:FeatureAuthTitle", "Home:FeatureAuthDesc"],
  ["Home:FeatureTenantTitle", "Home:FeatureTenantDesc"],
  ["Home:FeatureI18nTitle", "Home:FeatureI18nDesc"],
] as const;

function HomePage() {
  const L = useLocalization();
  const user = useCurrentUser();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-normal">
        {user?.userName ? L("Home:WelcomeBack", user.userName) : L("Home:Welcome")}
      </h1>
      <p className="text-sm text-muted-foreground">{L("Home:Tagline")}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map(([title, desc]) => (
          <div key={title} className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">{L(title)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{L(desc)}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{L("Home:EditHint")}</p>
    </section>
  );
}
