import { type MenuItem, useLocalization, useMenu } from "@jcoder-stack/abp-react/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
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
  return (
    <SidebarGroup>
      <SidebarMenu>
        {menu.map((item) =>
          item.children !== undefined && item.children.length > 0 ? (
            <Collapsible
              key={item.key}
              asChild
              defaultOpen={item.children.some((child) => child.to === pathname)}
              className="group/collapsible"
            >
              <SidebarMenuItem>
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
                        <SidebarMenuSubButton asChild isActive={child.to === pathname}>
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
              <SidebarMenuButton asChild isActive={item.to === pathname} tooltip={L(item.label)}>
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
