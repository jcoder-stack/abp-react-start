import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Identity } from "../auth";
import { createPermissionChecker, type PermissionChecker } from "../permissions";

/** 会话上下文值：Identity + 派生的状态/权限检查 + 服务端重取。 */
export interface SessionValue {
  identity: Identity;
  status: "authenticated" | "anonymous";
  can: PermissionChecker;
  /** 从服务端重取身份；被更新的注水身份或更晚发起的 reload 超越时，本次结果被丢弃。 */
  reload(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export interface SessionProviderProps {
  /** SSR 注水的初始身份；prop 变化（路由 invalidate）时跟随。 */
  identity: Identity;
  /** reload 的取数通道（应用注入 getIdentityFn 这类 server fn）。 */
  fetchIdentity?: () => Promise<Identity>;
  children: ReactNode;
}

/** 以 Identity 为中心的会话 Provider；token 永远不会出现在这棵树里。 */
export function SessionProvider(props: SessionProviderProps): ReactNode {
  const { identity: hydrated, fetchIdentity, children } = props;
  const [identity, setIdentity] = useState(hydrated);
  const [prevHydrated, setPrevHydrated] = useState(hydrated);
  // 每次身份更新都作废在途 reload：迟到的结果若落地，会把旧身份盖回更新后的身份上。
  const generation = useRef(0);
  if (hydrated !== prevHydrated) {
    setPrevHydrated(hydrated);
    setIdentity(hydrated);
    generation.current += 1;
  }
  const reload = useCallback(async () => {
    if (fetchIdentity === undefined) return;
    const started = ++generation.current;
    const next = await fetchIdentity();
    if (started === generation.current) setIdentity(next);
  }, [fetchIdentity]);
  const value = useMemo<SessionValue>(
    () => ({
      identity,
      status: identity.isAuthenticated ? "authenticated" : "anonymous",
      can: createPermissionChecker(identity.grantedPolicies),
      reload,
    }),
    [identity, reload],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** 读会话上下文；在 <SessionProvider> 外使用时抛错。 */
export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}

/** 当前用户（匿名时 null）。 */
export function useCurrentUser(): Identity["user"] {
  return useSession().identity.user;
}

/** 能力转述表（policy → boolean）；单点检查用 usePermission。 */
export function useGrantedPolicies(): Record<string, boolean> {
  return useSession().identity.grantedPolicies;
}

export function usePermissionChecker(): PermissionChecker {
  return useSession().can;
}

/** 单个 policy（或数组=全部）是否被授予。 */
export function usePermission(policy: string | string[]): boolean {
  return useSession().can(policy);
}

interface PermissionGuardBaseProps {
  requireAuth?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

/** 权限检查三选一（省略三者则只剩 requireAuth 门槛）；`never` 分支让同传两个在编译期即被拒。 */
export type PermissionGuardProps = PermissionGuardBaseProps &
  (
    | { policy: string | string[]; all?: never; any?: never }
    | { policy?: never; all: string[]; any?: never }
    | { policy?: never; all?: never; any: string[] }
    | { policy?: never; all?: never; any?: never }
  );

/** 权限检查通过时渲染 children，否则 fallback（默认 null）。feature 门槛请外套 FeatureGuard。 */
export function PermissionGuard(props: PermissionGuardProps): ReactNode {
  const { policy, all, any, requireAuth, fallback = null, children } = props;
  const { identity, can } = useSession();
  let granted = true;
  if (policy !== undefined) granted = can(policy);
  else if (all !== undefined) granted = can.all(all);
  else if (any !== undefined) granted = can.any(any);
  if (granted && requireAuth === true) granted = identity.isAuthenticated;
  return granted ? children : fallback;
}
