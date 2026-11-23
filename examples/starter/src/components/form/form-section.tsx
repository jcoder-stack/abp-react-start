import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 放进 `<div className="divide-y rounded-lg border bg-card">` 容器里连排，分区线由容器 divide-y 画。
 *
 * 落在 `SheetForm` 查看态的 `<dl>` 里时自动收成记录布局：去掉两栏网格与 p-6 内边距，标题变成
 * 一条浅底小节头、说明不再显示，字段行之间改由发丝线分隔——否则每个分区会顶着自己的留白挤在键值卡里，行的
 * 左右边距也与顶层 `FieldRow` 对不齐。
 */
export function FormSection(props: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 p-6 md:grid-cols-[220px_1fr] md:gap-8",
        "in-[dl]:block in-[dl]:p-0",
        props.className,
      )}
    >
      <div className="in-[dl]:bg-muted in-[dl]:px-3 in-[dl]:py-2">
        <h3 className="text-sm font-semibold in-[dl]:text-xs in-[dl]:font-medium in-[dl]:text-muted-foreground">
          {props.title}
        </h3>
        {props.description !== undefined && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground in-[dl]:hidden">
            {props.description}
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-4 in-[dl]:divide-y in-[dl]:space-y-0">{props.children}</div>
    </div>
  );
}
