import { type MenuItem, useBreadcrumbs, useLocalization } from "@jcoder-stack/abp-react/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** 面包屑：菜单树 × 当前路径 → 祖先链；末项为当前页。 */
export function AbpBreadcrumb({ items }: { items: MenuItem[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const chain = useBreadcrumbs(items, pathname);
  const L = useLocalization();
  if (chain.length === 0) return null;
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {chain.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
            <BreadcrumbItem className={index < chain.length - 1 ? "hidden md:block" : undefined}>
              {index === chain.length - 1 ? (
                <BreadcrumbPage>{L(item.label)}</BreadcrumbPage>
              ) : item.to !== undefined ? (
                <BreadcrumbLink asChild>
                  <Link to={item.to}>{L(item.label)}</Link>
                </BreadcrumbLink>
              ) : (
                <span>{L(item.label)}</span>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
