import { createLogger } from "@jcoder-stack/abp-react/logger";
import { useLocalization } from "@jcoder-stack/abp-react/react";
import { useHubEvent } from "@jcoder-stack/abp-react/realtime";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  type AppNotification,
  localizeText,
  parseNotification,
} from "@/features/signalr/notification";

export const NOTIFICATIONS_HUB = "notifications";
export const RECEIVE_NOTIFICATION = "ReceiveNotification";

const logger = createLogger({ scope: "realtime:notifications" });

/** Runs `handler` for every well-formed notification pushed to the signed-in user; malformed ones are dropped. */
export function useNotificationEvent(handler: (notification: AppNotification) => void): void {
  useHubEvent(NOTIFICATIONS_HUB, RECEIVE_NOTIFICATION, (raw) => {
    const notification = parseNotification(raw);
    if (notification === null) {
      logger.debug("dropped a malformed notification");
      return;
    }
    handler(notification);
  });
}

/**
 * Shows each pushed notification as a toast at its severity, with a View action when it carries a
 * url. Edit this file to change how notifications look; it is yours once installed.
 */
export function NotificationToaster(): null {
  const L = useLocalization();
  const router = useRouter();
  useNotificationEvent((notification) => {
    const { url } = notification;
    toast[notification.severity](localizeText(notification.title, L), {
      // 同一 id 再到达时 sonner 原地更新，不叠第二条。
      id: notification.id,
      description:
        notification.message === undefined ? undefined : localizeText(notification.message, L),
      action:
        url === undefined
          ? undefined
          : {
              label: L("Notifications:View"),
              // url 来自后端运行时，编译期无从校验，所以不用 typed Link。
              onClick: () => void router.navigate({ href: url }),
            },
    });
  });
  return null;
}
