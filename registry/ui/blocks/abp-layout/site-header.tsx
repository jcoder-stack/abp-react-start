import type { MenuItem } from "@jcoder-stack/abp-react/react";
import { AbpBreadcrumb } from "@/components/abp/layout/abp-breadcrumb";
import { LocaleSwitcher } from "@/components/abp/layout/locale-switcher";
import { TenantSwitcher } from "@/components/abp/layout/tenant-switcher";
import { ThemeToggle } from "@/components/abp/layout/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader({ items }: { items: MenuItem[] }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:rounded-t-xl">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <AbpBreadcrumb items={items} />
      <div className="ml-auto flex items-center gap-1">
        <LocaleSwitcher />
        <TenantSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
