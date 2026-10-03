import { RealtimeProvider } from "@jcoder-stack/abp-react/realtime";
import type { ReactNode } from "react";
import type { FeatureModule } from "@/features/compose";
import { getHubConnectionInfoFn } from "@/features/signalr/server-fns";

/** Module level: RealtimeProvider reads it once and needs one stable reference. */
const getConnectionInfo = (hub: string) => getHubConnectionInfoFn({ data: { hub } });

function SignalRProvider({ children }: { children: ReactNode }) {
  return <RealtimeProvider getConnectionInfo={getConnectionInfo}>{children}</RealtimeProvider>;
}

const signalr: FeatureModule = { Provider: SignalRProvider };

export default signalr;
