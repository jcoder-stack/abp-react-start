import type { ReactNode } from "react";
import { formatInstant, tenantTimeZone } from "../core";
import { useAppConfig } from "./app-config";

/** 当前租户的时区（IANA 名，缺省 `"UTC"`）。loader 里用 `tenantTimeZone(appState.config)`。 */
export function useTenantTimeZone(): string {
  return tenantTimeZone(useAppConfig());
}

/**
 * 按租户时区显示一个真实时刻（`yyyy-MM-dd HH:mm`，等宽数字）。
 *
 * 给模块级列定义用：cell 里不能直接调 hook，而列定义必须保持模块级常量（引用稳定）。
 * `empty` 是值为空时的占位，由调用方从词条取。等宽数字写成内联样式而不是 Tailwind 类：
 * 这个包不带 Tailwind，类名在使用方项目里未必被扫描到。
 */
export function Instant(props: {
  value: string | null | undefined;
  className?: string;
  empty?: string;
}): ReactNode {
  const timeZone = useTenantTimeZone();
  const text = formatInstant(props.value, timeZone);
  return (
    <span className={props.className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {text || props.empty}
    </span>
  );
}
