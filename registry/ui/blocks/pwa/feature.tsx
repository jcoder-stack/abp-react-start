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
  return children;
}

/**
 * Installable app + offline page. The two theme-color hex values mirror --background in the
 * theme's :root and .dark (meta tags cannot read CSS variables); a test keeps them in sync.
 */
const pwa: FeatureModule = {
  Provider: PwaProvider,
  head: {
    meta: [
      { name: "theme-color", content: "#f6f9fd", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#050e1e", media: "(prefers-color-scheme: dark)" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/pwa/apple-touch-icon.png" },
    ],
  },
  messages: pwaMessages,
};

export default pwa;
