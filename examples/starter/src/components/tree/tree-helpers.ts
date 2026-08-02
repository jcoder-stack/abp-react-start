import type { ReactNode } from "react";

/**
 * 通用树节点，零业务知识。`label`/`icon` 由消费方传入，本文件不认识任何具体业务字段。
 * `icon` 为函数时按当前展开态求值，用于文件目录式开合图标（folder/folder-open）。
 */
export interface TreeNode {
  id: string;
  label: ReactNode;
  icon?: ReactNode | ((ctx: { expanded: boolean }) => ReactNode);
  children?: TreeNode[];
  disabled?: boolean;
}

/** 收集子树内全部节点 id（含自身），深度优先。 */
export function collectSubtreeIds(node: TreeNode): string[] {
  const ids = [node.id];
  for (const child of node.children ?? []) {
    ids.push(...collectSubtreeIds(child));
  }
  return ids;
}

/** 从根到目标节点的父节点 id 路径（根→父，不含自身）；未找到返回 []。 */
export function findParentChain(nodes: TreeNode[], id: string): string[] {
  return searchParentChain(nodes, id, []) ?? [];
}

function searchParentChain(nodes: TreeNode[], id: string, ancestors: string[]): string[] | null {
  for (const node of nodes) {
    if (node.id === id) {
      return ancestors;
    }
    const found = searchParentChain(node.children ?? [], id, [...ancestors, node.id]);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/**
 * 推导「子树部分勾选」的父节点集合（自身未勾）。级联策略不在此处，这只是给消费方的只读推导：
 * 子树全勾/全不勾都不算半选；节点自身若已在 `checked` 里，即便子树非全勾也不重复标记。
 */
export function deriveIndeterminate(nodes: TreeNode[], checked: Set<string>): Set<string> {
  const result = new Set<string>();
  walkIndeterminate(nodes, checked, result);
  return result;
}

type SubtreeState = "checked" | "unchecked" | "mixed";

function walkIndeterminate(nodes: TreeNode[], checked: Set<string>, result: Set<string>): void {
  for (const node of nodes) {
    const children = node.children ?? [];
    if (children.length === 0) {
      continue;
    }
    if (subtreeState(node, checked) === "mixed" && !checked.has(node.id)) {
      result.add(node.id);
    }
    walkIndeterminate(children, checked, result);
  }
}

function subtreeState(node: TreeNode, checked: Set<string>): SubtreeState {
  const children = node.children ?? [];
  if (children.length === 0) {
    return checked.has(node.id) ? "checked" : "unchecked";
  }
  const childStates = children.map((child) => subtreeState(child, checked));
  if (childStates.every((state) => state === "checked")) {
    return "checked";
  }
  if (childStates.every((state) => state === "unchecked")) {
    return "unchecked";
  }
  return "mixed";
}
