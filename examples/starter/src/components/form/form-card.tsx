import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 表单分区卡片：分区标题 + 卡片容器，宽抽屉（`size="lg"`/`"xl"`）里靠它把长表单切成几段。
 *
 * 与 `FormSection` 的分工：`FormSection` 是整页表单的「左标题 / 右字段」分区，靠外层
 * `divide-y` 容器连排；`FormCard` 是抽屉里自带外框的一段，彼此之间留空隙。标题与
 * `FormSection` 同规格（`text-sm font-semibold`）。
 *
 * 查看态的 SheetForm 认 `data-form-card`：里面是分区卡片时，外层就不再自己当一张卡片。
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
      className={cn("space-y-4 rounded-lg border bg-card p-4", props.className)}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        {props.description !== undefined && (
          <p className="text-xs text-muted-foreground">{props.description}</p>
        )}
      </div>
      {props.children}
    </div>
  );
}
