import type { MenuItem } from "@jcoder-stack/abp-react/react";
import { Home } from "lucide-react";
import type { FileRouteTypes } from "@/routeTree.gen";

/** --no-admin 安装的最小导航：仅首页。加页面时在此追加菜单项，`to` 由路由树类型收窄、写错编译报错。 */
export const menuItems: MenuItem<FileRouteTypes["to"]>[] = [
  { key: "home", label: "App::Home", to: "/", icon: <Home /> },
];
