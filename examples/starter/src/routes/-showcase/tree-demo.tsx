import { useLocalization } from "@jcoder-stack/abp-react/react";
import { useMemo, useState } from "react";
import { Tree } from "@/components/tree/tree";
import {
  collectSubtreeIds,
  deriveIndeterminate,
  findParentChain,
  type TreeNode,
} from "@/components/tree/tree-helpers";

function buildNodes(L: (key: string) => string): TreeNode[] {
  const perms = (prefix: string): TreeNode[] => [
    { id: `${prefix}.view`, label: L("Showcase:PermView") },
    { id: `${prefix}.edit`, label: L("Showcase:PermEdit") },
  ];
  return [
    {
      id: "identity",
      label: L("Showcase:TreeIdentity"),
      children: [
        { id: "identity.users", label: L("Showcase:TreeUsers"), children: perms("identity.users") },
        { id: "identity.roles", label: L("Showcase:TreeRoles"), children: perms("identity.roles") },
      ],
    },
  ];
}

function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children ?? [], id);
    if (found) return found;
  }
  return undefined;
}

function collectLeafIds(nodes: TreeNode[]): string[] {
  return nodes.flatMap((n) => (n.children?.length ? collectLeafIds(n.children) : [n.id]));
}

/** tree 展示：受控勾选 + 级联策略（勾子带整棵子树、父节点按子节点全选与否回填）用 tree-helpers 纯函数组合，正是权限面板的做法。 */
export function TreeDemo() {
  const L = useLocalization();
  const nodes = useMemo(() => buildNodes(L), [L]);
  const leaves = useMemo(() => new Set(collectLeafIds(nodes)), [nodes]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const indeterminate = deriveIndeterminate(nodes, checked);

  const onCheckChange = (id: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      const node = findNode(nodes, id);
      for (const sid of node ? collectSubtreeIds(node) : [id]) {
        if (on) next.add(sid);
        else next.delete(sid);
      }
      // 从最近的父往根回填：父勾选态 = 直接子节点是否全部勾选。
      for (const pid of findParentChain(nodes, id).reverse()) {
        const parent = findNode(nodes, pid);
        const allChecked = (parent?.children ?? []).every((child) => next.has(child.id));
        if (allChecked) next.add(pid);
        else next.delete(pid);
      }
      return next;
    });
  };

  const selectedCount = [...checked].filter((id) => leaves.has(id)).length;

  return (
    <div>
      <Tree
        nodes={nodes}
        checkable
        defaultExpanded={["identity", "identity.users", "identity.roles"]}
        checked={checked}
        indeterminate={indeterminate}
        onCheckChange={onCheckChange}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        {L("Showcase:TreeSelected", String(selectedCount))}
      </p>
    </div>
  );
}
