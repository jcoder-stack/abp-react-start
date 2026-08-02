import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 放进 `<div className="divide-y rounded-lg border bg-card">` 容器里连排，分区线由容器 divide-y 画。 */
export function FormSection(props: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 p-6 md:grid-cols-[220px_1fr] md:gap-8", props.className)}>
      <div>
        <h3 className="text-sm font-semibold">{props.title}</h3>
        {props.description !== undefined && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {props.description}
          </p>
        )}
      </div>
      <div className="min-w-0 space-y-4">{props.children}</div>
    </div>
  );
}
