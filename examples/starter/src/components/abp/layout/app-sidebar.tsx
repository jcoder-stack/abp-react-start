import type { MenuItem } from "@jcoder/abp-react/react";
import { type ComponentProps, memo, type ReactNode } from "react";
import { BrandMark } from "@/components/abp/layout/brand-mark";
import { NavMain } from "@/components/abp/layout/nav-main";
import { NavSearch } from "@/components/abp/layout/nav-search";
import { NavUser } from "@/components/abp/layout/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/** memo：布局壳每次导航都重渲染，侧栏 props 引用稳定时整棵子树跳过重执行。激活态高亮由 NavMain 内部订阅 pathname 自行更新，不依赖父级渲染。 */
export const AppSidebar = memo(function AppSidebar({
  items,
  title,
  logo,
  userMenuItems,
  ...props
}: {
  items: MenuItem[];
  title: string;
  logo?: ReactNode;
  userMenuItems?: ReactNode;
} & ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                {/* size-8! 提权：SidebarMenuButton 带 [&>svg]:size-4，会把标识压成 16px */}
                {logo ?? <BrandMark className="size-8! shrink-0" />}
                <span className="truncate font-medium">{title}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavSearch items={items} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser userMenuItems={userMenuItems} />
      </SidebarFooter>
    </Sidebar>
  );
});
