import { cn } from "@/lib/utils";

/**
 * 必填字段 label 后的星号标记。仅视觉提示（`aria-hidden`），真正的必填语义由 input 自身的
 * `required`/`aria-required` 承载，标记不再对读屏播报，避免「星号 + required」重复念两遍。
 */
export function RequiredMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("ml-0.5 select-none text-destructive", className)}>
      *
    </span>
  );
}
