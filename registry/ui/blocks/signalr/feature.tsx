import { useSession } from "@jcoder-stack/abp-react/react";
import { RealtimeProvider } from "@jcoder-stack/abp-react/realtime";
import type { ReactNode } from "react";
import type { FeatureModule } from "@/features/compose";
import { NotificationToaster } from "@/features/signalr/notifications";
import notificationsMessages from "@/features/signalr/notifications-messages.json";
import { getHubConnectionInfoFn } from "@/features/signalr/server-fns";

/** Module level: RealtimeProvider reads it once and needs one stable reference. */
const getConnectionInfo = (hub: string) => getHubConnectionInfoFn({ data: { hub } });

function SignalRProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  return (
    <RealtimeProvider getConnectionInfo={getConnectionInfo}>
      {/* 匿名访客拿到的只会是 null，不挂就省掉每次页面加载那一趟 server fn。 */}
      {status === "authenticated" ? <NotificationToaster /> : null}
      {children}
    </RealtimeProvider>
  );
}

const signalr: FeatureModule = { Provider: SignalRProvider, messages: notificationsMessages };

export default signalr;
