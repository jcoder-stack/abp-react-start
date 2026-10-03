import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Logger } from "../logger";
import { createRealtimeClient, type RealtimeClient } from "./client";
import type { ConnectionFactory, GetConnectionInfo, HubState } from "./types";

const RealtimeContext = createContext<RealtimeClient | null>(null);

export interface RealtimeProviderProps {
  /** Must be referentially stable (define it at module level); it is read once. */
  getConnectionInfo: GetConnectionInfo;
  connectionFactory?: ConnectionFactory;
  logger?: Logger;
  children: ReactNode;
}

/** Hosts one realtime client for the app. Nothing connects until a hook subscribes in an effect, so SSR stays inert. */
export function RealtimeProvider(props: RealtimeProviderProps): ReactNode {
  const { getConnectionInfo, connectionFactory, logger, children } = props;
  // 只在首次渲染建一次，context value 因此天然稳定；client 构造无副作用，SSR 也安全。
  const [client] = useState(() =>
    createRealtimeClient({ getConnectionInfo, connectionFactory, logger }),
  );
  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

function useRealtimeClient(): RealtimeClient {
  const client = useContext(RealtimeContext);
  if (client === null) throw new Error("realtime hooks must be used within <RealtimeProvider>");
  return client;
}

/** Calls `handler` for every `method` message on `hub`; the latest handler is always used, so it need not be memoized. */
export function useHubEvent(
  hub: string,
  method: string,
  handler: (...args: unknown[]) => void,
): void {
  const client = useRealtimeClient();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(
    () => client.on(hub, method, (...args) => handlerRef.current(...args)),
    [client, hub, method],
  );
}

export interface HubHandle {
  state: HubState;
  invoke<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
  send(method: string, ...args: unknown[]): Promise<void>;
}

/** Keeps `hub` connected while mounted and exposes its state plus invoke/send (they reject unless connected). */
export function useHub(hub: string): HubHandle {
  const client = useRealtimeClient();
  useEffect(() => client.retain(hub), [client, hub]);
  const subscribe = useCallback(
    (listener: () => void) => client.subscribeState(hub, listener),
    [client, hub],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => client.getState(hub),
    (): HubState => "idle",
  );
  return useMemo(
    () => ({
      state,
      invoke: <T,>(method: string, ...args: unknown[]) => client.invoke<T>(hub, method, ...args),
      send: (method: string, ...args: unknown[]) => client.send(hub, method, ...args),
    }),
    [client, hub, state],
  );
}
