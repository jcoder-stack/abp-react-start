"use client";

import { useLocalization } from "@jcoder-stack/abp-react/react";
import { ChevronsUpDownIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Tree } from "@/components/tree/tree";
import { deriveIndeterminate, filterTree, type TreeNode } from "@/components/tree/tree-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface TreeMultiSelectProps {
  nodes: TreeNode[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** 自定义触发按钮上的回显；缺省是「未选→placeholder，≤2 项→名称，>2 项→已选 N 项」。 */
  renderValue?: (count: number, labels: string[]) => ReactNode;
  disabled?: boolean;
  /** 触发按钮的 id，供外部 `<Label htmlFor>` 关联。 */
  id?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
}

/** 触发按钮上最多逐个列出的名称条数，再多就只报数量——长名字会把按钮撑出对话框。 */
const MAX_INLINE_LABELS = 2;

function collectLabels(nodes: TreeNode[], values: Set<string>, into: string[]): void {
  for (const node of nodes) {
    if (values.has(node.id) && typeof node.label === "string") into.push(node.label);
    collectLabels(node.children ?? [], values, into);
  }
}

/**
 * 下拉式多选树：可搜索、带三态回显。
 *
 * **不做级联**：勾中父节点不会自动勾中子节点，是否连带下级由调用方决定（比如另给一个「含下级」
 * 开关）——这里替用户勾上子节点会让那个开关失去意义，也会把多余的 id 发给后端。
 */
export function TreeMultiSelect({
  nodes,
  values,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  renderValue,
  disabled,
  id,
  "aria-required": ariaRequired,
  "aria-invalid": ariaInvalid,
}: TreeMultiSelectProps) {
  const L = useLocalization();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");

  const checked = useMemo(() => new Set(values), [values]);
  // 半选态按完整树推导：过滤后的树缺了未命中的子节点，据此推导会把「部分勾选」误判成全选。
  const indeterminate = useMemo(() => deriveIndeterminate(nodes, checked), [nodes, checked]);
  const filtered = useMemo(() => filterTree(nodes, keyword), [nodes, keyword]);
  const labels = useMemo(() => {
    const result: string[] = [];
    collectLabels(nodes, checked, result);
    return result;
  }, [nodes, checked]);

  function toggle(id: string, next: boolean) {
    onChange(next ? [...values, id] : values.filter((item) => item !== id));
  }

  function triggerText(): ReactNode {
    if (renderValue) return renderValue(values.length, labels);
    if (values.length === 0) return placeholder ?? L("Tree:SelectPlaceholder");
    // 名称没收齐（有非字符串 label 的节点）就只报数量，否则会少列几项、看着像丢了选择。
    if (labels.length === values.length && values.length <= MAX_INLINE_LABELS) {
      return labels.join(L("Tree:SelectSeparator"));
    }
    return L("Tree:SelectCount", values.length);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // 关掉就丢掉搜索词：下次打开要看到完整的树，而不是上一次的过滤结果
        if (!next) setKeyword("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-required={ariaRequired}
          aria-invalid={ariaInvalid}
          className="w-full justify-between font-normal"
        >
          <span className={values.length === 0 ? "truncate text-muted-foreground" : "truncate"}>
            {triggerText()}
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <div className="border-b p-2">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={searchPlaceholder ?? L("Tree:SelectSearch")}
            aria-label={searchPlaceholder ?? L("Tree:SelectSearch")}
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {filtered.nodes.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              {emptyText ?? L("Tree:SelectEmpty")}
            </p>
          ) : (
            // Tree 的展开态是内部 state，只认首次挂载时的 defaultExpanded：关键字变了要重挂载，
            // 否则搜到的深层节点仍藏在收起的父节点里。
            <Tree
              key={keyword}
              nodes={filtered.nodes}
              defaultExpanded={filtered.expanded}
              checkable
              checked={checked}
              indeterminate={indeterminate}
              onCheckChange={toggle}
            />
          )}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {L("Tree:SelectCount", values.length)}
          </span>
          {values.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
              {L("Tree:SelectClear")}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
