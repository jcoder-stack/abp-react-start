import { type MenuItem, useLocalization, useMenu } from "@jcoder/abp-react/react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

interface SearchEntry {
  key: string;
  label: string;
  to: string;
  icon?: MenuItem["icon"];
  group?: string;
}

// 上游 items 已按权限剪枝
function flattenMenu(menu: MenuItem[], L: (key: string) => string): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const item of menu) {
    if (item.children !== undefined && item.children.length > 0) {
      const group = L(item.label);
      for (const child of item.children) {
        if (child.to !== undefined) {
          entries.push({
            key: child.key,
            label: L(child.label),
            to: child.to,
            icon: child.icon,
            group,
          });
        }
      }
    } else if (item.to !== undefined) {
      entries.push({ key: item.key, label: L(item.label), to: item.to, icon: item.icon });
    }
  }
  return entries;
}

/** 侧栏菜单搜索：⌘K/Ctrl+K 或点击触发 Command 弹层，模糊过滤权限内菜单，选中即导航。 */
export function NavSearch({ items }: { items: MenuItem[] }) {
  const L = useLocalization();
  const menu = useMenu(items);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // SSR 拿不到平台信息，挂载后再按真实平台切 ⌘/Ctrl 角标，避免水合不一致。
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(`${navigator.platform} ${navigator.userAgent}`));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const entries = flattenMenu(menu, L);
  const groups = new Map<string, SearchEntry[]>();
  for (const entry of entries) {
    const bucket = entry.group ?? "";
    groups.set(bucket, [...(groups.get(bucket) ?? []), entry]);
  }

  const select = (entry: SearchEntry) => {
    setOpen(false);
    void navigate({ to: entry.to });
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip={L("Layout:Search")} onClick={() => setOpen(true)}>
            <Search />
            <span>{L("Layout:Search")}</span>
            <kbd className="ml-auto text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {isMac ? "⌘K" : "Ctrl+K"}
            </kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={L("Layout:Search")}
        description={L("Layout:SearchPlaceholder")}
      >
        <CommandInput placeholder={L("Layout:SearchPlaceholder")} />
        <CommandList>
          <CommandEmpty>{L("Layout:SearchEmpty")}</CommandEmpty>
          {[...groups.entries()].map(([group, groupEntries]) => (
            <CommandGroup
              key={group === "" ? "__top" : group}
              heading={group === "" ? undefined : group}
            >
              {groupEntries.map((entry) => (
                <CommandItem
                  key={entry.key}
                  value={`${entry.group ?? ""} ${entry.label}`.trim()}
                  onSelect={() => select(entry)}
                >
                  {entry.icon}
                  {entry.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
