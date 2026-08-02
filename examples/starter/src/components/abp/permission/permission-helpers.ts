import type { VoloAbpPermissionManagementPermissionGrantInfoDto } from "@/api/models";
import { collectSubtreeIds, findParentChain, type TreeNode } from "@/components/tree/tree-helpers";

/** 单个权限授予信息，直接复用生成 DTO（`voloAbpPermissionManagementPermissionGrantInfoDto`），字段名以后端为准：`name`/`displayName`/`parentName`/`isGranted`/`grantedProviders`。 */
export type PermissionLike = VoloAbpPermissionManagementPermissionGrantInfoDto;

/** 由 `parentName` 建树（`label` 直接取后端已本地化的 `displayName`），根节点=`parentName` 为空的权限；同组内构建，不跨组。 */
export function buildPermissionTree(permissions: PermissionLike[]): TreeNode[] {
  const byParent = new Map<string, PermissionLike[]>();
  for (const permission of permissions) {
    const parentKey = permission.parentName ?? "";
    const bucket = byParent.get(parentKey) ?? [];
    bucket.push(permission);
    byParent.set(parentKey, bucket);
  }

  function build(parentKey: string): TreeNode[] {
    return (byParent.get(parentKey) ?? []).map((permission) => {
      const id = permission.name ?? "";
      const children = build(id);
      return {
        id,
        label: permission.displayName ?? id,
        ...(children.length > 0 ? { children } : {}),
      };
    });
  }

  return build("");
}

function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const found = findNode(node.children ?? [], id);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * ABP 的级联规则：勾一个权限时父链一并勾上（父是子的前置条件），取消时清掉整个子树。
 * 单独勾父节点不连带勾子节点，父只是前置条件，不代表业务上要授予所有子权限。
 *
 * `locked` 是由 `lockedNames` 算出的「他 provider 授予、本视图只读」的权限名集合。
 * 级联遍历命中它就跳过，不勾也不清，保持调用前的成员资格，勾和清两个方向对称。
 */
export function applyCheck(
  state: Set<string>,
  permissions: PermissionLike[],
  name: string,
  checked: boolean,
  locked?: Set<string>,
): Set<string> {
  const tree = buildPermissionTree(permissions);
  const next = new Set(state);
  if (checked) {
    if (!locked?.has(name)) {
      next.add(name);
    }
    for (const ancestorId of findParentChain(tree, name)) {
      if (!locked?.has(ancestorId)) {
        next.add(ancestorId);
      }
    }
    return next;
  }
  const node = findNode(tree, name);
  const idsToRemove = node !== undefined ? collectSubtreeIds(node) : [name];
  for (const id of idsToRemove) {
    if (!locked?.has(id)) {
      next.delete(id);
    }
  }
  return next;
}

/**
 * 组头「全选」：勾选=组内全部权限进入 checked；取消=组内全部权限移出 checked。
 *
 * `locked`（可选，语义同 `applyCheck`）：命中的权限名跳过，保持调用前的成员资格。
 */
export function toggleGroup(
  state: Set<string>,
  groupPermissions: PermissionLike[],
  checked: boolean,
  locked?: Set<string>,
): Set<string> {
  const next = new Set(state);
  for (const permission of groupPermissions) {
    const name = permission.name ?? "";
    if (locked?.has(name)) {
      continue;
    }
    if (checked) {
      next.add(name);
    } else {
      next.delete(name);
    }
  }
  return next;
}

/** PUT 全量载荷：`all` 里每个权限都要有一条（含 `isGranted: false`），后端按整份覆盖，不是增量 diff。 */
export function toUpdatePayload(
  all: PermissionLike[],
  checked: Set<string>,
): { name: string; isGranted: boolean }[] {
  return all.map((permission) => {
    const name = permission.name ?? "";
    return { name, isGranted: checked.has(name) };
  });
}

/** 只读判定：权限已授予，且 `grantedProviders` 里有非当前 provider 的条目，
 *  说明这条授予来自别处（比如角色），当前 provider 视图改不了。 */
export function lockedNames(permissions: PermissionLike[], providerName: string): Set<string> {
  const locked = new Set<string>();
  for (const permission of permissions) {
    const grantedByOther = (permission.grantedProviders ?? []).some(
      (provider) => provider.providerName !== providerName,
    );
    if (permission.isGranted === true && grantedByOther) {
      locked.add(permission.name ?? "");
    }
  }
  return locked;
}
