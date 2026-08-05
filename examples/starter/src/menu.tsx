import type { MenuItem } from "@jcoder-stack/abp-react/react";
import {
  Book,
  Building2,
  FlaskConical,
  Home,
  IdCard,
  Settings,
  Shield,
  Users,
  Wrench,
} from "lucide-react";
import {
  IdentityPermissions,
  SettingManagementPermissions,
  TenantManagementPermissions,
} from "@/permissions";
import type { FileRouteTypes } from "@/routeTree.gen";

/** app-shell 块分发的净版导航，外加一个「组件演示」分组（本 starter 的手写增量）。
 *  真实 ABP 模块（Identity / TenantManagement / SettingManagement）与演示页分开摆：Book 不是
 *  ABP 自带实体，它的数据来自 `books/-book-api.ts` 里的进程内 mock，没有后端权限策略可挂，
 *  故不带 requiredPolicy。换成你自己的业务模块时把这一整组删掉即可。 */
export const menuItems: MenuItem<FileRouteTypes["to"]>[] = [
  { key: "home", label: "App::Home", to: "/home", icon: <Home /> },
  {
    key: "identity",
    label: "AbpIdentity::Menu:IdentityManagement",
    icon: <IdCard />,
    children: [
      {
        key: "identity-users",
        label: "AbpIdentity::Users",
        to: "/identity/users",
        icon: <Users />,
        requiredPolicy: IdentityPermissions.Users.Default,
      },
      {
        key: "identity-roles",
        label: "AbpIdentity::Roles",
        to: "/identity/roles",
        icon: <Shield />,
        requiredPolicy: IdentityPermissions.Roles.Default,
      },
    ],
  },
  {
    key: "tenants",
    label: "AbpTenantManagement::Menu:TenantManagement",
    to: "/tenants",
    icon: <Building2 />,
    requiredPolicy: TenantManagementPermissions.Tenants.Default,
  },
  {
    key: "system",
    label: "App::System",
    icon: <Settings />,
    children: [
      {
        key: "settings",
        label: "App::Settings",
        to: "/settings",
        icon: <Wrench />,
        requiredPolicy: SettingManagementPermissions.Emailing,
      },
    ],
  },
  {
    key: "demo",
    label: "App::Demo",
    icon: <FlaskConical />,
    children: [{ key: "books", label: "App::Books", to: "/books", icon: <Book /> }],
  },
];
