import { cn } from "@/lib/utils";

/**
 * 产品标识。换成自己的品牌时改这一个文件即可，侧栏、落地页顶导航、登录页都取它。
 *
 * 藏蓝砖 + 反白笔画：砖取 primary、六边形与三角取 primary-foreground，浅色是深蓝砖白笔画、
 * 暗色自动翻成浅蓝砖深笔画，组件不需要知道当前主题。全站除状态色外只有一个色相，所以标识
 * 也不另带第二种颜色。尺寸由外部 className 给（`size-*`），viewBox 保证不失真。
 * 改动图形后必须在 16 / 24 / 32 / 48px 四档各看一眼——16px 是 favicon、24px 是侧栏图标轨。
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
      <rect width={64} height={64} rx={16} className="fill-primary" />
      <path
        d="M32 11 L50.2 21.5 V42.5 L32 53 L13.8 42.5 V21.5 Z"
        className="stroke-primary-foreground"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path
        d="M28 24.5 L41 32 L28 39.5 Z"
        className="fill-primary-foreground stroke-primary-foreground"
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </svg>
  );
}
