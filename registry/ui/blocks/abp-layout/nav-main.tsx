import { type MenuItem, useLocalization, useMenu } from "@jcoder-stack/abp-react/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { activeMenuPath } from "@/components/abp/layout/nav-active";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

/** 权限剪枝后的主菜单。 */
export function NavMain({ items }: { items: MenuItem[] }) {
  const menu = useMenu(items);
  const L = useLocalization();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // 当前项按段边界上的最长前缀选，不用字符串相等：详情页的路径比菜单项长，见 nav-active.ts
  const active = activeMenuPath(
    menu.flatMap((item) => [item.to, ...(item.children ?? []).map((child) => child.to)]),
    pathname,
  );
  return (
    <SidebarGroup>
      <SidebarMenu>
        {menu.map((item) =>
          item.children !== undefined && item.children.length > 0 ? (
            <Collapsible
              key={item.key}
              asChild
              defaultOpen={item.children.some((child) => child.to === active)}
              className="group/collapsible"
            >
              {/* 由 React 判定这一组是否含当前页：收成图标轨时靠它挂指示条。用户先折叠这一组时
                  子项会被卸载，CSS 用 :has() 去找子按钮就找不到了 */}
              <SidebarMenuItem
                data-has-active-child={
                  item.children.some((child) => child.to === active) || undefined
                }
              >
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={L(item.label)}>
                    {item.icon}
                    <span>{L(item.label)}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.children.map((child) => (
                      <SidebarMenuSubItem key={child.key}>
                        <SidebarMenuSubButton asChild isActive={child.to === active}>
                          <Link to={child.to ?? "/"}>
                            {child.icon}
                            <span>{L(child.label)}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ) : (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton asChild isActive={item.to === active} tooltip={L(item.label)}>
                <Link to={item.to ?? "/"}>
                  {item.icon}
                  <span>{L(item.label)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ),
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
