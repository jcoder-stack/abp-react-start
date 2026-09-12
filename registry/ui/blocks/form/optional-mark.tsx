import { useLocalization } from "@jcoder-stack/abp-react/react";
import { cn } from "@/lib/utils";

/**
 * 选填字段 label 后的「选填」标记。
 *
 * 标的是**少数派**：后台表单里多数字段必填，逐个挂红星等于让一张还没被碰过的表单布满
 * 错误信号，而红色在本系统里只表示出错与危险，这么用会把它的分量花掉。改为只标选填，
 * 一张表上通常只剩一两个标记。
 *
 * 与 RequiredMark 一样只是视觉提示（`aria-hidden`）：必填语义由控件自身的
 * `required`/`aria-required` 承载，不让读屏把标记和属性念两遍。
 */
export function OptionalMark({ className }: { className?: string }) {
  const L = useLocalization();
  return (
    <span
      aria-hidden
      className={cn("ml-1 font-normal text-muted-foreground select-none", className)}
    >
      {L("Form:Optional")}
    </span>
  );
}
