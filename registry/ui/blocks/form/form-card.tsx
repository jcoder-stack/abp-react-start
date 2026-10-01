import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 表单分区卡片：分区标题 + 卡片容器，宽抽屉（`size="lg"`/`"xl"`）里靠它把长表单切成几段。
 *
 * 与 `FormSection` 的分工：`FormSection` 是整页表单的「左标题 / 右字段」分区，靠外层
 * `divide-y` 容器连排；`FormCard` 是抽屉里自带外框的一段，彼此之间留空隙。标题与
 * `FormSection` 同规格（`text-sm font-semibold`）。
 *
 * 落在 `SheetForm` 查看态的 `<dl>` 里时与 `FormSection` 一样收成记录布局：去掉自己的外框与
 * 内边距，标题变成一行小节头，字段行之间改由发丝线分隔。整条记录于是只有外层那一张卡——
 * 卡片外的普通字段与卡片里的字段落在同一条竖线上，不会出现卡片套卡片或卡片旁的裸行。
 */
export function FormCard(props: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    // div 而非 section：查看态的 SheetForm 把内容放进 <dl>，<dl> 里只允许 div 包裹 dt/dd
    <div
      data-form-card=""
      className={cn(
        "space-y-4 rounded-lg border bg-card p-4",
        "in-[dl]:space-y-0 in-[dl]:rounded-none in-[dl]:border-0 in-[dl]:bg-transparent in-[dl]:p-0",
        props.className,
      )}
    >
      <div className="space-y-1 in-[dl]:px-3 in-[dl]:pt-3 in-[dl]:pb-1">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        {props.description !== undefined && (
          <p className="text-xs text-muted-foreground">{props.description}</p>
        )}
      </div>
      <div className="space-y-4 in-[dl]:space-y-0 in-[dl]:divide-y">{props.children}</div>
    </div>
  );
}
