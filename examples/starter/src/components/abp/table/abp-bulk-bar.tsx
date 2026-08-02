import { useLocalization } from "@jcoder-stack/abp-react/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export interface AbpBulkBarViewProps {
  selectedCount: number;
  onClear: () => void;
  children?: ReactNode;
}

/** 装配层内部构件：t.BulkBar 内容的内联容器：计数 + 插槽内容 + 清除，经 DataTableToolbar 的 bulk 槽渲染进顶部条左区。不公开导出。 */
export function AbpBulkBarView(props: AbpBulkBarViewProps) {
  const L = useLocalization();
  // 数字高亮但不拆词条：按数字在【译文】里的实际位置切分，中英语序自动各就各位
  // （"2 selected" / "已选 2 项"），避免为了着色把整句拆成两个键。
  const countText = L("Table:NSelected", props.selectedCount);
  const countNum = String(props.selectedCount);
  const numAt = countText.indexOf(countNum);
  const count = (
    <span className="text-foreground">
      {numAt === -1 ? (
        countText
      ) : (
        <>
          {countText.slice(0, numAt)}
          <span className="font-semibold text-primary">{countNum}</span>
          {countText.slice(numAt + countNum.length)}
        </>
      )}
    </span>
  );

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-3 text-sm">
      {count}
      <Separator orientation="vertical" className="!h-4" />
      {props.children}
      <Button type="button" variant="ghost" size="sm" onClick={props.onClear}>
        {L("Table:Clear")}
      </Button>
    </div>
  );
}
