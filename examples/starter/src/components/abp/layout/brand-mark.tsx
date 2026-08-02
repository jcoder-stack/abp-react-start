import { cn } from "@/lib/utils";

/**
 * 产品标识。换成自己的品牌时改这一个文件即可，侧栏、落地页顶导航、登录页都取它。
 *
 * 颜色走 `--brand-*` token 而非写死：暗色下轮廓翻白、播放三角换成青色（深蓝底上的
 * 蓝三角对比度不够），这两处切换由 token 自己完成，组件不需要知道当前是什么主题。
 * 尺寸由外部的 className 给（`size-*`），viewBox 保证任意尺寸都不失真。
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn("size-8", className)}
      role="img"
      aria-label="ABP React Start"
    >
      <path
        d="M32 4.5 L54.5 17.5 V43.5 L32 56.5 L9.5 43.5 V17.5 Z"
        className="stroke-brand-ink"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path
        d="M27 23 L43 32 L27 41 Z"
        className="fill-brand-mark stroke-brand-mark"
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <circle
        cx={54.5}
        cy={17.5}
        r={5.5}
        className="fill-brand-spark stroke-brand-ink-contrast"
        strokeWidth={2.5}
      />
    </svg>
  );
}
