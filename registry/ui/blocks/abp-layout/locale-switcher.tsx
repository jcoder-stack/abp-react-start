import { useAppConfig, useCulture, useLocalization } from "@jcoder-stack/abp-react/react";
import { useRouterState } from "@tanstack/react-router";
import { Check, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** 语言切换：列表来自 app-config 的真实语言集；经 /api/culture 302 生效（cookie 优先机制）。 */
export function LocaleSwitcher() {
  const { localization } = useAppConfig();
  const current = useCulture();
  const L = useLocalization();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (localization.languages.length === 0) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label={L("Layout:Language")}
            >
              <Languages />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{L("Layout:Language")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {localization.languages.map((lang) => (
          <DropdownMenuItem key={lang.cultureName} asChild>
            <a
              href={`/api/culture?culture=${encodeURIComponent(lang.cultureName)}&returnUrl=${encodeURIComponent(pathname)}`}
            >
              <span className="flex-1">{lang.displayName}</span>
              {lang.cultureName === current && <Check className="size-4" />}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
