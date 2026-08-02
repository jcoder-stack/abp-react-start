import { useLocalization } from "@jcoder/abp-react/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useGetApiPermissionManagementPermissions,
  usePutApiPermissionManagementPermissions,
} from "@/api/endpoints/permissions/permissions";
import type { VoloAbpPermissionManagementPermissionGroupDto } from "@/api/models";
import {
  applyCheck,
  buildPermissionTree,
  lockedNames,
  type PermissionLike,
  toggleGroup,
  toUpdatePayload,
} from "@/components/abp/permission/permission-helpers";
import { SubmitButton } from "@/components/form/submit-button";
import { Tree } from "@/components/tree/tree";
import { deriveIndeterminate, type TreeNode } from "@/components/tree/tree-helpers";
import { TriStateCheckbox } from "@/components/tree/tri-state-checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

export interface PermissionSheetProps {
  providerName: "R" | "U";
  providerKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}

/** 级联/全选/只读判定委托 permission-helpers 的纯函数。 */
export function PermissionSheet(props: PermissionSheetProps) {
  const { providerName, providerKey, open, onOpenChange, title } = props;
  const L = useLocalization();

  const query = useGetApiPermissionManagementPermissions(
    { providerName, providerKey },
    { query: { enabled: open } },
  );
  const mutation = usePutApiPermissionManagementPermissions();

  const groups = useMemo(() => query.data?.groups ?? [], [query.data]);
  const allPermissions = useMemo<PermissionLike[]>(
    () => groups.flatMap((group) => group.permissions ?? []),
    [groups],
  );
  const locked = useMemo(
    () => lockedNames(allPermissions, providerName),
    [allPermissions, providerName],
  );

  const [checked, setChecked] = useState<Set<string>>(new Set());

  // allPermissions 只在新数据到位（打开 sheet 触发新 fetch）时换引用，借它驱动本地勾选态回到服务端的 isGranted。
  useEffect(() => {
    setChecked(
      new Set(
        allPermissions
          .filter((permission) => permission.isGranted === true)
          .map((permission) => permission.name ?? ""),
      ),
    );
  }, [allPermissions]);

  function handleCheck(name: string, value: boolean) {
    setChecked((prev) => applyCheck(prev, allPermissions, name, value, locked));
  }

  function handleGroupToggle(group: VoloAbpPermissionManagementPermissionGroupDto, value: boolean) {
    setChecked((prev) => toggleGroup(prev, group.permissions ?? [], value, locked));
  }

  function handleSubmit() {
    mutation.mutate(
      {
        data: { permissions: toUpdatePayload(allPermissions, checked) },
        params: { providerName, providerKey },
      },
      {
        onSuccess: () => {
          toast.success(L("Crud:Saved"));
          onOpenChange(false);
        },
        // 失败必须出声：没有 onError 时抽屉停在原地且零提示，用户会以为没点到而反复提交。
        onError: () => toast.error(L("Crud:OperationFailed")),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <form
          className="flex flex-1 flex-col overflow-y-auto"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <div className="flex-1 space-y-2 px-4 py-2">
            {query.isError ? (
              <p className="text-sm text-destructive">{L("Admin:LoadFailed")}</p>
            ) : query.isPending ? (
              <div className="space-y-2" data-testid="permission-sheet-skeleton">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <Accordion
                type="multiple"
                defaultValue={groups[0]?.name != null ? [groups[0].name] : []}
              >
                {groups.map((group) => {
                  const groupPermissions = group.permissions ?? [];
                  const tree = withLocked(buildPermissionTree(groupPermissions), locked);
                  const indeterminate = deriveIndeterminate(tree, checked);
                  const groupState = groupCheckState(groupPermissions, checked);
                  const groupKey = group.name ?? "";
                  return (
                    <AccordionItem key={groupKey} value={groupKey}>
                      {/* Checkbox 是 <button role="checkbox">，不能嵌进 AccordionTrigger 自己的 <button>（无效 HTML），所以并排放，不塞进 trigger 子节点。 */}
                      <div className="flex items-center gap-2">
                        <TriStateCheckbox
                          checked={groupState}
                          aria-label={L("Admin:SelectAll")}
                          data-testid={`permission-group-select-all-${groupKey}`}
                          onCheckedChange={(value: boolean | "indeterminate") =>
                            handleGroupToggle(group, value === true)
                          }
                        />
                        <AccordionTrigger className="py-2">
                          {group.displayName ?? groupKey}
                        </AccordionTrigger>
                      </div>
                      <AccordionContent>
                        <Tree
                          nodes={tree}
                          checkable
                          checked={checked}
                          indeterminate={indeterminate}
                          defaultExpanded={collectParentIds(tree)}
                          onCheckChange={handleCheck}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
          <SheetFooter>
            <SubmitButton pending={mutation.isPending} />
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {L("Form:Cancel")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function groupCheckState(
  permissions: PermissionLike[],
  checked: Set<string>,
): boolean | "indeterminate" {
  if (permissions.length === 0) return false;
  const checkedCount = permissions.filter((permission) =>
    checked.has(permission.name ?? ""),
  ).length;
  if (checkedCount === 0) return false;
  if (checkedCount === permissions.length) return true;
  return "indeterminate";
}

/** 把 lockedNames 的判定结果落到树节点的 `disabled`（他 provider 授予的权限在本视图只读）。 */
function withLocked(nodes: TreeNode[], locked: Set<string>): TreeNode[] {
  return nodes.map((node) => ({
    ...node,
    disabled: locked.has(node.id),
    ...(node.children !== undefined ? { children: withLocked(node.children, locked) } : {}),
  }));
}

/** 用作 Tree 的 defaultExpanded，权限树默认全展开。 */
function collectParentIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children !== undefined && node.children.length > 0) {
      ids.push(node.id, ...collectParentIds(node.children));
    }
  }
  return ids;
}
