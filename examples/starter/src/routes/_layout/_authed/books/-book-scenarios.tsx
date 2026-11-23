import { useLocalization } from "@jcoder-stack/abp-react/react";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export const BOOK_SCENARIOS = [
  "default",
  "view",
  "filtered",
  "selectAll",
  "empty",
  "noMatch",
  "failing",
  "long",
] as const;

export type BookScenario = (typeof BOOK_SCENARIOS)[number];

const LABEL: Record<BookScenario | "narrow", string> = {
  default: "App::BookScenarioDefault",
  view: "App::BookScenarioView",
  filtered: "App::BookScenarioFiltered",
  selectAll: "App::BookScenarioSelectAll",
  empty: "App::BookScenarioEmpty",
  noMatch: "App::BookScenarioNoMatch",
  failing: "App::BookScenarioFailing",
  long: "App::BookScenarioLong",
  narrow: "App::BookScenarioNarrow",
};

const PRESSED = "aria-pressed:border-foreground/55 aria-pressed:font-medium";

/**
 * 演示页顶部的场景条：一个按钮把表格切到一种状态（筛选生效、空列表、刷新失败……），
 * 再配一行说明「该看哪里」，不用自己去造数据或断网。下面一行是当前地址，筛选、分页、排序都在里面。
 * 「窄屏」开一个手机宽度的 iframe：响应式按视口生效，在宽屏里缩容器是看不到效果的。
 */
export function BookScenarioBar(props: { onApply: (scenario: BookScenario) => void }) {
  const L = useLocalization();
  const [active, setActive] = useState<BookScenario>("default");
  const [narrow, setNarrow] = useState(false);
  const href = useRouterState({ select: (s) => s.location.href });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {BOOK_SCENARIOS.map((scenario) => (
          <Button
            key={scenario}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={active === scenario}
            className={PRESSED}
            onClick={() => {
              setActive(scenario);
              props.onApply(scenario);
            }}
          >
            {L(LABEL[scenario])}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={narrow}
          className={PRESSED}
          onClick={() => setNarrow(true)}
        >
          {L(LABEL.narrow)}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{L(`${LABEL[active]}Hint`)}</p>
      <code className="block truncate rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
        {decodeURIComponent(href)}
      </code>
      <Dialog open={narrow} onOpenChange={setNarrow}>
        <DialogContent className="w-auto max-w-none p-2 sm:max-w-none">
          <DialogTitle className="sr-only">{L(LABEL.narrow)}</DialogTitle>
          <iframe
            title={L(LABEL.narrow)}
            src={href}
            className="h-180 max-h-svh w-97.5 rounded-md border"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
