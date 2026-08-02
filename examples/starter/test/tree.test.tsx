// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { Tree } from "@/components/tree/tree";
import {
  collectSubtreeIds,
  deriveIndeterminate,
  findParentChain,
  type TreeNode,
} from "@/components/tree/tree-helpers";
import treeMessages from "@/components/tree/tree-messages.json";
import { renderWithProviders } from "./test-utils";

const nodes: TreeNode[] = [
  {
    id: "root",
    label: "Root",
    children: [
      { id: "child-a", label: "Child A" },
      {
        id: "child-b",
        label: "Child B",
        children: [{ id: "grandchild", label: "Grandchild" }],
      },
    ],
  },
];

function renderTree(props: Partial<ComponentProps<typeof Tree>> = {}) {
  return renderWithProviders(<Tree nodes={nodes} {...props} />, { messages: treeMessages });
}

describe("Tree rendering", () => {
  it("hides children until the expand arrow is toggled", async () => {
    renderTree();
    expect(await screen.findByText("Root")).toBeDefined();
    expect(screen.queryByText("Child A")).toBeNull();

    fireEvent.click(screen.getByTestId("tree-toggle-root"));
    expect(screen.getByText("Child A")).toBeDefined();
    expect(screen.getByText("Child B")).toBeDefined();
    expect(screen.queryByText("Grandchild")).toBeNull();
  });

  it("honors defaultExpanded to reveal nested children upfront", async () => {
    renderTree({ defaultExpanded: ["root", "child-b"] });
    expect(await screen.findByText("Grandchild")).toBeDefined();
  });

  it("indents rows by depth * 16px", async () => {
    renderTree({ defaultExpanded: ["root", "child-b"] });
    expect((await screen.findByTestId("tree-row-root")).style.paddingLeft).toBe("0px");
    expect(screen.getByTestId("tree-row-child-a").style.paddingLeft).toBe("16px");
    expect(screen.getByTestId("tree-row-grandchild").style.paddingLeft).toBe("32px");
  });
});

describe("Tree checkable", () => {
  it("reports id+checked through onCheckChange without cascading to other nodes", async () => {
    const onCheckChange = vi.fn();
    renderTree({ checkable: true, defaultExpanded: ["root"], onCheckChange });
    fireEvent.click(await screen.findByTestId("tree-checkbox-child-a"));
    expect(onCheckChange).toHaveBeenCalledTimes(1);
    expect(onCheckChange).toHaveBeenCalledWith("child-a", true);
  });

  it("renders indeterminate nodes with aria-checked mixed, distinct from checked", async () => {
    renderTree({
      checkable: true,
      checked: new Set(["child-a"]),
      indeterminate: new Set(["root"]),
      defaultExpanded: ["root"],
    });
    expect((await screen.findByTestId("tree-checkbox-root")).getAttribute("aria-checked")).toBe(
      "mixed",
    );
    expect(screen.getByTestId("tree-checkbox-child-a").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("tree-checkbox-child-b").getAttribute("aria-checked")).toBe("false");
  });

  // 「半选画的是横杠不是勾」的断言已删：它盯的是 data-state / data-slot 这类 DOM 内部结构
  // （data-state 还是 Radix Checkbox 自己的属性），而「半选区别于全选」这件用户可见的事
  // 已由上一条用例的 aria-checked="mixed" 覆盖。

  it("disables the checkbox for disabled nodes and never fires onCheckChange", async () => {
    const disabledNodes: TreeNode[] = [{ id: "d", label: "Disabled", disabled: true }];
    const onCheckChange = vi.fn();
    renderWithProviders(<Tree nodes={disabledNodes} checkable onCheckChange={onCheckChange} />, {
      messages: treeMessages,
    });
    const checkbox = await screen.findByTestId("tree-checkbox-d");
    expect((checkbox as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(checkbox);
    expect(onCheckChange).not.toHaveBeenCalled();
  });
});

describe("Tree icons", () => {
  it("renders a static icon as-is and leaves no slot when a node has none", async () => {
    const iconNodes: TreeNode[] = [
      { id: "with-icon", label: "With icon", icon: <span data-testid="static-icon" /> },
      { id: "no-icon", label: "No icon" },
    ];
    renderWithProviders(<Tree nodes={iconNodes} />, { messages: treeMessages });
    expect(await screen.findByTestId("static-icon")).toBeDefined();
    expect(screen.queryByTestId("tree-icon-no-icon")).toBeNull();
  });

  it("swaps a function icon between folder/folder-open as the expanded state toggles", async () => {
    const folderNodes: TreeNode[] = [
      {
        id: "folder",
        label: "Folder",
        icon: ({ expanded }) =>
          expanded ? <span data-testid="folder-open" /> : <span data-testid="folder" />,
        children: [{ id: "file", label: "File" }],
      },
    ];
    renderWithProviders(<Tree nodes={folderNodes} />, { messages: treeMessages });
    expect(await screen.findByTestId("folder")).toBeDefined();
    expect(screen.queryByTestId("folder-open")).toBeNull();

    fireEvent.click(screen.getByTestId("tree-toggle-folder"));
    expect(screen.getByTestId("folder-open")).toBeDefined();
    expect(screen.queryByTestId("folder")).toBeNull();
  });
});

describe("collectSubtreeIds", () => {
  const branch: TreeNode = {
    id: "a",
    label: "A",
    children: [
      { id: "b", label: "B", children: [{ id: "c", label: "C" }] },
      { id: "d", label: "D" },
    ],
  };

  it.each([
    ["includes the node itself and every descendant across levels", branch, ["a", "b", "c", "d"]],
    ["returns just the node id for a leaf", { id: "leaf", label: "Leaf" }, ["leaf"]],
  ] as const)("%s", (_label, node, expected) => {
    expect(collectSubtreeIds(node)).toEqual(expected);
  });
});

describe("findParentChain", () => {
  const tree: TreeNode[] = [
    {
      id: "root",
      label: "Root",
      children: [{ id: "a", label: "A", children: [{ id: "b", label: "B" }] }],
    },
  ];

  it.each([
    ["returns the root-to-parent path excluding the node itself", "b", ["root", "a"]],
    ["returns an empty array for a root-level node", "root", []],
    ["returns an empty array when the id is not found anywhere", "missing", []],
  ] as const)("%s", (_label, id, expected) => {
    expect(findParentChain(tree, id)).toEqual(expected);
  });
});

describe("deriveIndeterminate", () => {
  const tree: TreeNode[] = [
    {
      id: "root",
      label: "Root",
      children: [
        { id: "a", label: "A" },
        {
          id: "b",
          label: "B",
          children: [
            { id: "b1", label: "B1" },
            { id: "b2", label: "B2" },
          ],
        },
      ],
    },
  ];

  it.each([
    ["marks an ancestor as indeterminate when only some descendants are checked", ["a"], ["root"]],
    ["does not mark a fully-checked subtree as indeterminate", ["a", "b1", "b2"], []],
    ["does not mark a fully-unchecked subtree as indeterminate", [], []],
    ["propagates a nested partial selection up through every ancestor", ["b1"], ["b", "root"]],
    // 显式出现在 checked 里的节点不再叠加半选态,哪怕它的子树是混合的。
    ["does not double-mark a node already present in checked", ["root", "a"], []],
  ] as const)("%s", (_label, checked, expected) => {
    expect(deriveIndeterminate(tree, new Set(checked))).toEqual(new Set(expected));
  });
});
