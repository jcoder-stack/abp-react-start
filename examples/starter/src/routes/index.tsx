import { useLocalization, useSession } from "@jcoder-stack/abp-react/react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Check,
  Code2,
  Copy,
  KeyRound,
  Languages,
  LayoutDashboard,
  type LucideIcon,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { BrandMark } from "@/components/abp/layout/brand-mark";
import { LocaleSwitcher } from "@/components/abp/layout/locale-switcher";
import { ThemeToggle } from "@/components/abp/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { clientEnv } from "@/env";
import { cn } from "@/lib/utils";
import { AbpTableDemo } from "./-showcase/abp-table-demo";
import { ComboboxDemo } from "./-showcase/combobox-demo";
import { DataTableDemo } from "./-showcase/data-table-demo";
import { DatePickerDemo } from "./-showcase/date-picker-demo";
import { FeatureRow, UsageRow } from "./-showcase/feature-row";
import { FormDemo } from "./-showcase/form-demo";
import { TreeDemo } from "./-showcase/tree-demo";

export const Route = createFileRoute("/")({ component: Landing });

const INSTALL_COMMAND = "npx jc-abp init";

const FEATURES: { icon: LucideIcon; titleKey: string; descKey: string }[] = [
  { icon: KeyRound, titleKey: "Landing:FeatureAuthTitle", descKey: "Landing:FeatureAuthDesc" },
  { icon: ShieldCheck, titleKey: "Landing:FeaturePermTitle", descKey: "Landing:FeaturePermDesc" },
  { icon: Languages, titleKey: "Landing:FeatureI18nTitle", descKey: "Landing:FeatureI18nDesc" },
  { icon: Code2, titleKey: "Landing:FeatureApiTitle", descKey: "Landing:FeatureApiDesc" },
  {
    icon: LayoutDashboard,
    titleKey: "Landing:FeatureAdminTitle",
    descKey: "Landing:FeatureAdminDesc",
  },
  { icon: Building2, titleKey: "Landing:FeatureTenantTitle", descKey: "Landing:FeatureTenantDesc" },
];

const USAGE_ROWS = [
  {
    titleKey: "Landing:UsageI18nTitle",
    descKey: "Landing:UsageI18nDesc",
    bulletKeys: ["Landing:UsageI18nB1", "Landing:UsageI18nB2", "Landing:UsageI18nB3"],
    label: "useLocalization()",
    code: 'const L = useLocalization()\n\nL("AbpIdentity::DisplayName:UserName")\nL("Table:PageOf", page, total)\n\nconst culture = useCulture()',
  },
  {
    titleKey: "Landing:UsagePermTitle",
    descKey: "Landing:UsagePermDesc",
    bulletKeys: ["Landing:UsagePermB1", "Landing:UsagePermB2", "Landing:UsagePermB3"],
    label: "permissions",
    code: 'import { IdentityPermissions } from "@/permissions"\n\nbeforeLoad: requirePermission(IdentityPermissions.Users.Default)\n\nconst can = usePermissionChecker()\ncan.any([IdentityPermissions.Users.Create, IdentityPermissions.Users.Update])\n\n<PermissionGuard policy={IdentityPermissions.Users.Delete}>…</PermissionGuard>',
  },
  {
    titleKey: "Landing:UsageCrudTitle",
    descKey: "Landing:UsageCrudDesc",
    bulletKeys: ["Landing:UsageCrudB1", "Landing:UsageCrudB2", "Landing:UsageCrudB3"],
    label: "identity/roles.tsx",
    code: 'const roleService = createCrudService({\n  useList: useGetApiIdentityRoles,\n  useCreate: usePostApiIdentityRoles,\n  useUpdate: usePutApiIdentityRolesId,\n  useDelete: useDeleteApiIdentityRolesId,\n  listKey: getGetApiIdentityRolesQueryKey,\n  policy: IdentityPermissions.Roles.Default,\n})\n\nconst sheet = useAbpSheet(roleService, { emptyValues, schema: () => roleSchema })\nconst t = useAbpTable(roleService, { columns, onOpen: sheet.open })\n\n<t.Table>\n  <t.BulkBar>\n    <t.BulkDelete />\n  </t.BulkBar>\n</t.Table>\n\n<sheet.Sheet>\n  <sheet.form.AppField name="name">\n    {(field) => <field.TextField label={L("...:RoleName")} required />}\n  </sheet.form.AppField>\n</sheet.Sheet>',
  },
  {
    titleKey: "Landing:UsageMenuTitle",
    descKey: "Landing:UsageMenuDesc",
    bulletKeys: ["Landing:UsageMenuB1", "Landing:UsageMenuB2", "Landing:UsageMenuB3"],
    label: "menu.tsx",
    code: 'export const menuItems: MenuItem<FileRouteTypes["to"]>[] = [\n  { key: "home", label: "App::Home", to: "/" },\n  {\n    key: "identity",\n    label: "AbpIdentity::Menu:IdentityManagement",\n    children: [\n      { key: "users", label: "AbpIdentity::Users", to: "/identity/users",\n        requiredPolicy: IdentityPermissions.Users.Default },\n    ],\n  },\n  { key: "tenants", label: "...Tenants", to: "/tenants",\n    requiredPolicy: TenantManagementPermissions.Tenants.Default,\n    requiredFeature: "AbpTenantManagement.Enable" },\n]',
  },
] as const;

const STACK = [
  { name: "React 19", roleKey: "Landing:StackReact" },
  { name: "TanStack Start", roleKey: "Landing:StackStart" },
  { name: "TanStack Query", roleKey: "Landing:StackQuery" },
  { name: "TanStack Table", roleKey: "Landing:StackTable" },
  { name: "TanStack Form", roleKey: "Landing:StackForm" },
  { name: "shadcn/ui", roleKey: "Landing:StackShadcn" },
  { name: "Tailwind v4", roleKey: "Landing:StackTailwind" },
  { name: "Orval", roleKey: "Landing:StackOrval" },
  { name: "ABP", roleKey: "Landing:StackAbp" },
] as const;

const IN_ACTION_ROWS = [
  {
    name: "data-table",
    snippet:
      "const dt = useDataTable({ state, columns, data, pageCount });\n<DataTable table={dt} />",
    titleKey: "Showcase:DataTableTitle",
    descKey: "Showcase:DataTableDesc",
    bulletKeys: ["Showcase:DataTableB1", "Showcase:DataTableB2", "Showcase:DataTableB3"],
    Demo: DataTableDemo,
  },
  {
    name: "form",
    snippet: '<SheetForm mode="create" onSubmit={submit}>…</SheetForm>',
    titleKey: "Showcase:FormTitle",
    descKey: "Showcase:FormDesc",
    bulletKeys: ["Showcase:FormB1", "Showcase:FormB2", "Showcase:FormB3"],
    Demo: FormDemo,
  },
  {
    name: "tree",
    snippet: "<Tree nodes={nodes} checkable checked={checked} />",
    titleKey: "Showcase:TreeTitle",
    descKey: "Showcase:TreeDesc",
    bulletKeys: ["Showcase:TreeB1", "Showcase:TreeB2", "Showcase:TreeB3"],
    Demo: TreeDemo,
  },
  {
    name: "combobox",
    snippet: "<Combobox value={value} onChange={setValue} options={options} />",
    titleKey: "Showcase:ComboboxTitle",
    descKey: "Showcase:ComboboxDesc",
    bulletKeys: ["Showcase:ComboboxB1", "Showcase:ComboboxB2", "Showcase:ComboboxB3"],
    Demo: ComboboxDemo,
  },
  {
    name: "date-picker",
    snippet: "<DatePicker value={date} onChange={setDate} />",
    titleKey: "Showcase:DatePickerTitle",
    descKey: "Showcase:DatePickerDesc",
    bulletKeys: ["Showcase:DatePickerB1", "Showcase:DatePickerB2", "Showcase:DatePickerB3"],
    Demo: DatePickerDemo,
  },
  {
    name: "abp-table",
    snippet: "const t = useAbpTable(bookService, { columns, onOpen: sheet.open });\n<t.Table />",
    titleKey: "Showcase:AbpTableTitle",
    descKey: "Showcase:AbpTableDesc",
    bulletKeys: [
      "Showcase:AbpTableCrud",
      "Showcase:AbpTablePermission",
      "Showcase:AbpTableConcurrency",
    ],
    Demo: AbpTableDemo,
  },
] as const;

type Localizer = (key: string, ...args: (string | number)[]) => string;

/**
 * 匿名态给登录入口，认证态给「进入控制台」（整页跳转进 shell）。换成你自己的官网即可；文案在
 * _layout/shell-messages.json 的 Landing:* / Showcase:* 桶。
 */
function Landing() {
  const L = useLocalization();
  const { status, identity } = useSession();
  const authed = status === "authenticated";

  return (
    // 落地页在 _layout 侧边栏壳之外，拿不到 SidebarProvider 自带的 TooltipProvider；
    // 顶栏的 ThemeToggle/LocaleSwitcher 用了 Tooltip，这里自备一个。
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-svh flex-col bg-background">
        <SiteNav L={L} authed={authed} />
        <main className="flex-1">
          <Hero L={L} authed={authed} userName={identity.user?.userName ?? ""} />
          <Features L={L} />
          <InAction L={L} />
          <Usage L={L} />
          <StackSection L={L} />
          <CtaBand L={L} authed={authed} />
        </main>
        <SiteFooter L={L} />
      </div>
    </TooltipProvider>
  );
}

function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-6", className)}>{children}</div>;
}

function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className="size-8 shrink-0" />
      <span className="text-lg font-semibold">{clientEnv.VITE_APP_TITLE}</span>
    </span>
  );
}

/** 认证态跳控制台用整页跳转（`<a href>`）而非 typed Link：进 shell 是上下文切换，且 --no-admin 项目没有该路由时不会编译报错。 */
function ConsoleLink({ L, size }: { L: Localizer; size?: "sm" | "lg" }) {
  return (
    <Button asChild size={size}>
      <a href="/identity/users">
        {L("Landing:NavConsole")}
        {size === "lg" && <ArrowRight />}
      </a>
    </Button>
  );
}

function SignInLink({ L, size, label }: { L: Localizer; size?: "sm" | "lg"; label: string }) {
  return (
    <Button asChild size={size}>
      <a href="/api/auth/login">
        {L(label)}
        {size === "lg" && <ArrowRight />}
      </a>
    </Button>
  );
}

function SiteNav({ L, authed }: { L: Localizer; authed: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <Shell className="flex h-16 items-center gap-6">
        <Brand />
        <nav className="ml-4 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">
            {L("Landing:NavFeatures")}
          </a>
          <a href="#in-action" className="transition-colors hover:text-foreground">
            {L("Landing:NavComponents")}
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
          <span className="ml-1">
            {authed ? (
              <ConsoleLink L={L} size="sm" />
            ) : (
              <SignInLink L={L} size="sm" label="Landing:NavSignIn" />
            )}
          </span>
        </div>
      </Shell>
    </header>
  );
}

function Hero({ L, authed, userName }: { L: Localizer; authed: boolean; userName: string }) {
  return (
    <section className="relative overflow-hidden border-b">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 flex justify-center"
      >
        <div className="size-[38rem] rounded-full bg-primary/15 blur-[120px]" />
      </div>
      <Shell className="relative flex flex-col items-center py-24 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          {L("Landing:HeroEyebrow")}
        </span>
        <h1 className="mt-6 max-w-3xl text-4xl font-medium sm:text-5xl">
          {L("Landing:HeroTitleLead")}{" "}
          <span className="bg-gradient-to-r from-primary to-sidebar-primary bg-clip-text text-transparent">
            {L("Landing:HeroTitleAccent")}
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {authed ? L("Landing:HeroWelcomeBack", userName) : L("Landing:HeroSubtitle")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {authed ? (
            <ConsoleLink L={L} size="lg" />
          ) : (
            <SignInLink L={L} size="lg" label="Landing:HeroPrimary" />
          )}
          <Button asChild size="lg" variant="outline">
            <a href="#in-action">{L("Landing:HeroSecondary")}</a>
          </Button>
        </div>
        <InstallBlock L={L} />
      </Shell>
    </section>
  );
}

function InstallBlock({ L }: { L: Localizer }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(INSTALL_COMMAND).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="mt-10 w-full max-w-md">
      <p className="mb-2 text-xs text-muted-foreground">{L("Landing:InstallHint")}</p>
      <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 font-mono text-sm">
        <Terminal className="size-4 shrink-0 text-muted-foreground" />
        <code className="flex-1 text-left text-foreground">
          <span className="text-muted-foreground">$ </span>
          {INSTALL_COMMAND}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={L(copied ? "Landing:Copied" : "Landing:Copy")}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function SectionEyebrow({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-2xs font-semibold uppercase tracking-wider text-primary">
        {eyebrow}
      </span>
      <h2 className="mt-2 max-w-2xl text-2xl font-normal sm:text-3xl">{title}</h2>
    </div>
  );
}

function Features({ L }: { L: Localizer }) {
  return (
    <section id="features" className="border-b py-20">
      <Shell>
        <SectionEyebrow eyebrow={L("Landing:FeaturesEyebrow")} title={L("Landing:FeaturesTitle")} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="rounded-xl border bg-card p-6">
              <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{L(titleKey)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{L(descKey)}</p>
            </div>
          ))}
        </div>
      </Shell>
    </section>
  );
}

function InAction({ L }: { L: Localizer }) {
  return (
    <section id="in-action" className="border-b bg-muted/20 py-24">
      <Shell>
        <SectionEyebrow eyebrow={L("Landing:InActionEyebrow")} title={L("Landing:InActionTitle")} />
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
          {L("Showcase:Intro")}
        </p>
        <div className="mt-16 space-y-20 sm:space-y-28">
          {IN_ACTION_ROWS.map((row, i) => {
            const { Demo } = row;
            return (
              <FeatureRow
                key={row.name}
                index={String(i + 1).padStart(2, "0")}
                name={row.name}
                snippet={row.snippet}
                title={L(row.titleKey)}
                description={L(row.descKey)}
                bullets={row.bulletKeys.map((key) => L(key))}
                reverse={i % 2 === 1}
              >
                <Demo />
              </FeatureRow>
            );
          })}
        </div>
      </Shell>
    </section>
  );
}

function Usage({ L }: { L: Localizer }) {
  return (
    <section className="border-b py-24">
      <Shell>
        <SectionEyebrow eyebrow={L("Landing:UsageEyebrow")} title={L("Landing:UsageTitle")} />
        <div className="mt-16 space-y-20 sm:space-y-24">
          {USAGE_ROWS.map((row, i) => (
            <UsageRow
              key={row.label}
              title={L(row.titleKey)}
              description={L(row.descKey)}
              bullets={row.bulletKeys.map((key) => L(key))}
              label={row.label}
              code={row.code}
              reverse={i % 2 === 1}
            />
          ))}
        </div>
      </Shell>
    </section>
  );
}

function StackSection({ L }: { L: Localizer }) {
  return (
    <section className="border-b bg-muted/20 py-20">
      <Shell>
        <SectionEyebrow eyebrow={L("Landing:StackEyebrow")} title={L("Landing:StackTitle")} />
        <div className="mx-auto mt-12 grid max-w-4xl gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {STACK.map((item) => (
            <div key={item.name} className="flex flex-col gap-1 border-l border-border pl-4">
              <span className="font-mono text-sm text-foreground">{item.name}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {L(item.roleKey)}
              </span>
            </div>
          ))}
        </div>
      </Shell>
    </section>
  );
}

function CtaBand({ L, authed }: { L: Localizer; authed: boolean }) {
  return (
    <section className="border-b py-20">
      <Shell className="flex flex-col items-center text-center">
        <h2 className="max-w-2xl text-2xl font-normal sm:text-3xl">{L("Landing:CtaTitle")}</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {L("Landing:CtaSubtitle")}
        </p>
        <div className="mt-8">
          {authed ? (
            <ConsoleLink L={L} size="lg" />
          ) : (
            <SignInLink L={L} size="lg" label="Landing:HeroPrimary" />
          )}
        </div>
      </Shell>
    </section>
  );
}

function SiteFooter({ L }: { L: Localizer }) {
  return (
    <footer className="py-10">
      <Shell className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <Brand />
        <p className="text-xs text-muted-foreground">{L("Landing:FooterTagline")}</p>
      </Shell>
    </footer>
  );
}
