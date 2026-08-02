import type { MenuItem } from "@jcoder-stack/abp-react/react";
import { Building2, Home, IdCard, Settings, Shield, Users, Wrench } from "lucide-react";
import {
  IdentityPermissions,
  SettingManagementPermissions,
  TenantManagementPermissions,
} from "@/permissions";
import type { FileRouteTypes } from "@/routeTree.gen";

/** `to` 类型化自生成路由树,路由改名/删除在此 typecheck 失败而非运行时死链;extend 时照 requiredPolicy 格式补。 */
export const menuItems: MenuItem<FileRouteTypes["to"]>[] = [
  { key: "home", label: "App::Home", to: "/", icon: <Home /> },
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
];
