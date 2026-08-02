import { useLocalization } from "@jcoder/abp-react/react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { User } from "lucide-react";
import { useMemo } from "react";
import { AppSidebar } from "@/components/abp/layout/app-sidebar";
import { SiteHeader } from "@/components/abp/layout/site-header";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { clientEnv } from "@/env";
import { menuItems } from "../menu";

/** Pathless layout route: wraps every non-login page in the sidebar shell; /login sits outside it. */
export const Route = createFileRoute("/_layout")({
  component: Layout,
});

function Layout() {
  const L = useLocalization();
  // 引用稳定的 JSX。AppSidebar 是 memo 组件，内联元素会让它每次导航都重执行。
  const userMenuItems = useMemo(
    () => (
      <DropdownMenuItem asChild>
        <Link to="/profile">
          <User />
          {L("Admin:Profile")}
        </Link>
      </DropdownMenuItem>
    ),
    [L],
  );
  return (
    <SidebarProvider>
      <AppSidebar
        items={menuItems}
        title={clientEnv.VITE_APP_TITLE}
        userMenuItems={userMenuItems}
      />
      <SidebarInset>
        <SiteHeader items={menuItems} />
        <main className="flex flex-1 flex-col gap-4 px-6 py-5">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
