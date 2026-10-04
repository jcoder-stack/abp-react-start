import { useLocalization } from "@jcoder-stack/abp-react/react";
import { type ReactNode, useEffect } from "react";
import { toast } from "sonner";
import type { FeatureModule } from "@/features/compose";
import { watchForNewVersion } from "@/features/pwa/new-version";
import pwaMessages from "@/features/pwa/pwa-messages.json";
import { registerServiceWorker } from "@/features/pwa/register";

function PwaProvider({ children }: { children: ReactNode }) {
  const L = useLocalization();
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  useEffect(
    () =>
      watchForNewVersion(window, () => {
        toast.info(L("Pwa:NewVersion"), {
          id: "pwa-new-version",
          duration: Number.POSITIVE_INFINITY,
          action: { label: L("Pwa:Reload"), onClick: () => window.location.reload() },
        });
      }),
    [L],
  );
  // 不放进 head.meta：路由的 head 合并按 name 去重，两条 theme-color 只会剩一条；React 19 会把
  // 这里的 <meta> 提升进 <head>（SSR 同样）。两个 hex 镜像主题 :root / .dark 的 --background
  // （meta 读不了 CSS 变量），由测试钉住。
  return (
    <>
      <meta name="theme-color" content="#f6f9fd" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#050e1e" media="(prefers-color-scheme: dark)" />
      {children}
    </>
  );
}

/** Installable app + offline page. */
const pwa: FeatureModule = {
  Provider: PwaProvider,
  head: {
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/pwa/apple-touch-icon.png" },
    ],
  },
  messages: pwaMessages,
};

export default pwa;
