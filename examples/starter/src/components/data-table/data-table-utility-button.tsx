import { type ComponentProps, type ComponentType, createContext, type ReactNode, use } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** 工具栏窄屏时把功能钮收进「更多」面板，面板内经它告诉各个钮「你现在是一行菜单项」。
 *  `close` 关掉面板；引用必须稳定。 */
export const UtilityMenuContext = createContext<{ close: () => void } | null>(null);

export interface DataTableUtilityButtonProps
  extends Omit<ComponentProps<typeof Button>, "variant" | "size"> {
  /** 钮的名字：宽屏是 aria-label 和 tooltip，收进「更多」后是那一行的可见文字。 */
  label: string;
  /** 「这里有东西不在默认状态」的圆点（筛选生效、视图改过）。纯视觉提示，读屏文案另给。 */
  dot?: boolean;
  /** 这个钮要弹出下一层（视图设置、排序菜单）时，传那一层的触发器组件，如 `PopoverTrigger`、
   *  `DropdownMenuTrigger`。由本组件来套而不是让调用方包在外面：tooltip 必须在触发器外层，
   *  反过来嵌的话 Radix 的下拉菜单第二次打开后点选项会失灵。 */
  trigger?: ComponentType<{ asChild?: boolean; children: ReactNode }>;
  /** 图标，以及需要的 sr-only 状态文案。 */
  children: ReactNode;
}

/** 工具栏右侧功能组里的一个钮。宽屏是 32px 的 ghost 图标钮加 tooltip；被工具栏收进「更多」
 *  面板时自动改画成 44px 高的「图标 + 文字」行。页面自己往 `t.Utility` 里放钮也用它，
 *  两种形态就都不用管。 */
export function DataTableUtilityButton({
  label,
  dot,
  trigger: Trigger,
  className,
  children,
  onClick,
  ...props
}: DataTableUtilityButtonProps) {
  const menu = use(UtilityMenuContext);

  if (menu) {
    const row = (
      <Button
        type="button"
        variant="ghost"
        className={cn("h-11 w-full justify-start gap-2 px-3 font-normal", className)}
        {...props}
        onClick={(event) => {
          onClick?.(event);
          // 自己还要弹出下一层的钮不能关面板：它是那一层的锚点，面板一关它就卸载，
          // 刚弹出的东西跟着没了。
          if (!Trigger) menu.close();
        }}
      >
        {children}
        {label}
        {dot && <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-primary" />}
      </Button>
    );
    return Trigger ? <Trigger asChild>{row}</Trigger> : row;
  }

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("relative size-8 text-muted-foreground", className)}
      aria-label={label}
      {...props}
      onClick={onClick}
    >
      {children}
      {dot && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
        />
      )}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {Trigger ? <Trigger asChild>{button}</Trigger> : button}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
