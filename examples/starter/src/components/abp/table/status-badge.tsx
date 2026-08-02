import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CLASSES = {
  success: "bg-status-success/15 text-status-success",
  info: "bg-status-info/15 text-status-info",
  warning: "bg-status-warning/15 text-status-warning",
  error: "bg-status-error/15 text-status-error",
  neutral: "bg-status-neutral/15 text-status-neutral",
} as const;

export type Status = keyof typeof STATUS_CLASSES;

/**
 * 语义状态徽章：status-* 色点 + 同色文字 + 半透明底的胶囊。行/记录的状态一律用它，
 * 不用 primary/destructive 实心 Badge：accent 只表示「操作」，实心红只表示「危险动作」。
 */
export function StatusBadge(props: { status: Status; className?: string; children: ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full border-transparent font-medium",
        STATUS_CLASSES[props.status],
        props.className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {props.children}
    </Badge>
  );
}
