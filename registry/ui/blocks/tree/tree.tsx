"use client";

import { useLocalization } from "@jcoder/abp-react/react";
import { ChevronRightIcon } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { TreeNode } from "./tree-helpers";
import { TriStateCheckbox } from "./tri-state-checkbox";

export interface TreeProps {
  nodes: TreeNode[];
  defaultExpanded?: string[];
  checkable?: boolean;
  checked?: Set<string>;
  indeterminate?: Set<string>;
  onCheckChange?: (id: string, checked: boolean) => void;
}

const EMPTY_SET: Set<string> = new Set();

/**
 * 通用树形块：零业务知识，只负责层级渲染/展开收起/勾选态展示与上报。
 * 级联策略（勾子强制父链、去父清子树等）不在此处实现，由消费方基于 tree-helpers 的
 * 纯函数（collectSubtreeIds/findParentChain/deriveIndeterminate）自行组合。
 */
export function Tree({
  nodes,
  defaultExpanded,
  checkable = false,
  checked = EMPTY_SET,
  indeterminate = EMPTY_SET,
  onCheckChange,
}: TreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(defaultExpanded));

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div data-slot="tree">
      {nodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          expandedIds={expandedIds}
          onToggleExpanded={toggleExpanded}
          checkable={checkable}
          checked={checked}
          indeterminate={indeterminate}
          onCheckChange={onCheckChange}
        />
      ))}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  expandedIds,
  onToggleExpanded,
  checkable,
  checked,
  indeterminate,
  onCheckChange,
}: {
  node: TreeNode;
  depth: number;
  expandedIds: Set<string>;
  onToggleExpanded: (id: string) => void;
  checkable: boolean;
  checked: Set<string>;
  indeterminate: Set<string>;
  onCheckChange?: (id: string, checked: boolean) => void;
}) {
  const L = useLocalization();
  const labelId = useId();
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isExpanded = expandedIds.has(node.id);
  const icon = typeof node.icon === "function" ? node.icon({ expanded: isExpanded }) : node.icon;
  const checkedState = indeterminate.has(node.id) ? "indeterminate" : checked.has(node.id);

  return (
    <div data-slot="tree-node">
      <div
        className="flex items-center gap-1 py-1"
        style={{ paddingLeft: depth * 16 }}
        data-testid={`tree-row-${node.id}`}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? L("Tree:Collapse") : L("Tree:Expand")}
            data-testid={`tree-toggle-${node.id}`}
            onClick={() => onToggleExpanded(node.id)}
          >
            <ChevronRightIcon
              className={cn("size-4 transition-transform", isExpanded && "rotate-90")}
            />
          </button>
        ) : (
          <span className="size-4 shrink-0" aria-hidden="true" />
        )}
        {icon !== undefined && icon !== null ? (
          <span className="flex shrink-0 items-center" data-testid={`tree-icon-${node.id}`}>
            {icon}
          </span>
        ) : null}
        {checkable ? (
          <TriStateCheckbox
            checked={checkedState}
            disabled={node.disabled}
            aria-labelledby={labelId}
            data-testid={`tree-checkbox-${node.id}`}
            onCheckedChange={(value: boolean | "indeterminate") =>
              onCheckChange?.(node.id, value === true)
            }
          />
        ) : null}
        <span id={labelId} className="text-sm">
          {node.label}
        </span>
      </div>
      {hasChildren && isExpanded ? (
        <div data-slot="tree-children">
          {node.children?.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggleExpanded={onToggleExpanded}
              checkable={checkable}
              checked={checked}
              indeterminate={indeterminate}
              onCheckChange={onCheckChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
