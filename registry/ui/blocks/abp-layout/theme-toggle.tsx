import { useLocalization } from "@jcoder-stack/abp-react/react";
import { Check, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Theme = "light" | "dark" | "system";

const THEMES: { value: Theme; labelKey: string }[] = [
  { value: "light", labelKey: "Layout:ThemeLight" },
  { value: "dark", labelKey: "Layout:ThemeDark" },
  { value: "system", labelKey: "Layout:ThemeSystem" },
];

function applyTheme(theme: Theme) {
  localStorage.setItem("theme", theme);
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** 主题三选（light/dark/system），当前项带对勾；与 __root 的首绘内联脚本共用 localStorage.theme 约定。 */
export function ThemeToggle() {
  const L = useLocalization();
  // SSR 读不到 localStorage，挂载后再同步已存偏好。
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "system") setTheme(stored);
  }, []);

  const pick = (value: Theme) => {
    setTheme(value);
    applyTheme(value);
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label={L("Layout:Theme")}
            >
              <Sun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
              <Moon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{L("Layout:Theme")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {THEMES.map((item) => (
          <DropdownMenuItem key={item.value} onClick={() => pick(item.value)}>
            {L(item.labelKey)}
            {theme === item.value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
