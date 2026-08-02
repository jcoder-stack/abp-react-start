/** ABP 内置模块权限名常量，与后端 *Permissions 定义类逐一对应；业务模块权限照此格式在本文件追加。 */
export const IdentityPermissions = {
  Users: {
    Default: "AbpIdentity.Users",
    Create: "AbpIdentity.Users.Create",
    Update: "AbpIdentity.Users.Update",
    Delete: "AbpIdentity.Users.Delete",
    ManagePermissions: "AbpIdentity.Users.ManagePermissions",
  },
  Roles: {
    Default: "AbpIdentity.Roles",
    Create: "AbpIdentity.Roles.Create",
    Update: "AbpIdentity.Roles.Update",
    Delete: "AbpIdentity.Roles.Delete",
    ManagePermissions: "AbpIdentity.Roles.ManagePermissions",
  },
} as const;

export const TenantManagementPermissions = {
  Tenants: {
    Default: "AbpTenantManagement.Tenants",
    Create: "AbpTenantManagement.Tenants.Create",
    Update: "AbpTenantManagement.Tenants.Update",
    Delete: "AbpTenantManagement.Tenants.Delete",
    ManageFeatures: "AbpTenantManagement.Tenants.ManageFeatures",
    ManageConnectionStrings: "AbpTenantManagement.Tenants.ManageConnectionStrings",
  },
} as const;

export const SettingManagementPermissions = {
  Emailing: "SettingManagement.Emailing",
  EmailingTest: "SettingManagement.Emailing.Test",
  TimeZone: "SettingManagement.TimeZone",
} as const;
