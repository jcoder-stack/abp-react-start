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

/**
 * 按关键字过滤树：命中节点连同其整棵子树保留（搜到上级还要能逐个勾它的下级），命中节点的祖先链
 * 也保留，其余剔除；`expanded` 是保留下来的父节点 id，交给 `Tree` 的 `defaultExpanded` 才能直接
 * 看到命中的深层节点。`label` 是 ReactNode，只对字符串 label 做匹配——非字符串节点视为不命中，
 * 但其命中的子孙仍会把它保留下来。大小写不敏感；关键字为空白时原样返回，避免无谓重建。
 */
export function filterTree(
  nodes: TreeNode[],
  keyword: string,
): { nodes: TreeNode[]; expanded: string[] } {
  const needle = keyword.trim().toLowerCase();
  if (needle === "") return { nodes, expanded: [] };
  const expanded: string[] = [];
  return { nodes: filterNodes(nodes, needle, expanded), expanded };
}

function filterNodes(nodes: TreeNode[], needle: string, expanded: string[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    const selfMatches = typeof node.label === "string" && node.label.toLowerCase().includes(needle);
    if (selfMatches) {
      if ((node.children?.length ?? 0) > 0) expanded.push(node.id);
      result.push(node);
      continue;
    }
    const children = filterNodes(node.children ?? [], needle, expanded);
    if (children.length === 0) continue;
    expanded.push(node.id);
    result.push({ ...node, children });
  }
  return result;
}
