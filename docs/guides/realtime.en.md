# Real-time communication (SignalR)

> English edition. 简体中文版：[`realtime.md`](realtime.md)

The optional `signalr` feature connects the frontend to your ABP backend's SignalR hubs: background push notifications, live-refreshing dashboards, chat.

```bash
npx jc-abp add signalr          # existing project
npx jc-abp init --with signalr  # new project
```

It adds `src/features/signalr/` and one new dependency, `@microsoft/signalr` (downloaded on demand at the first connection; it is not in the first-paint bundle).

## The backend needs a hub first

The default ABP template has **no hubs at all**, and ABP ships no notification module. Without a hub the frontend degrades quietly: each tab sends a single negotiate, records "this hub is not there" on a 404, and neither retries nor reports an error. To make it actually work, add the code below to your ABP backend (the `*.HttpApi.Host` project, for example).

### 1. Depend on the SignalR module

Install the NuGet package `Volo.Abp.AspNetCore.SignalR`, then:

```csharp
[DependsOn(typeof(AbpAspNetCoreSignalRModule))]
public class MyProjectHttpApiHostModule : AbpModule
{
}
```

### 2. Let hubs accept the token from the query string

A WebSocket cannot carry an `Authorization` header, so SignalR puts the token in `?access_token=`. In `OnApplicationInitialization`, add this **before** `app.UseAuthentication()`:

```csharp
app.Use(async (httpContext, next) =>
{
    var accessToken = httpContext.Request.Query["access_token"];
    if (!string.IsNullOrEmpty(accessToken) &&
        httpContext.Request.Path.StartsWithSegments("/signalr-hubs"))
    {
        httpContext.Request.Headers.Authorization = "Bearer " + accessToken;
    }
    await next();
});
```

It applies to `/signalr-hubs` only. If the backend changes the hub route prefix, the middleware's `StartsWithSegments("/signalr-hubs")` and the frontend's `SIGNALR_HUB_PREFIX` in `.env` must be changed to the same value. The token appears in the URL, so **do not log the query string in access logs**.

### 3. CORS

The browser connects to the backend directly: add the frontend origin (for example `http://localhost:3000`) to `App:CorsOrigins` in `appsettings.json`. The frontend uses a Bearer token, so no cross-origin cookies are needed.

### 4. The notification hub and pusher

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Volo.Abp.AspNetCore.SignalR;
using Volo.Abp.DependencyInjection;

[Authorize]
[HubRoute("/signalr-hubs/notifications")]
public class NotificationHub : AbpHub
{
}

public record LocalizableText(string Key, string? Resource = null, IDictionary<string, string>? Args = null);

public record NotificationPayload(
    string Id,
    string Severity,          // "info" | "success" | "warning" | "error"
    object Title,             // a string or LocalizableText
    object? Message = null,   // a string or LocalizableText
    string? Url = null);      // an in-app path such as "/approvals/7" (no spaces or control characters)

public class NotificationPusher(IHubContext<NotificationHub> hub) : ITransientDependency
{
    public Task ToUserAsync(Guid userId, NotificationPayload payload) =>
        hub.Clients.User(userId.ToString()).SendAsync("ReceiveNotification", payload);

    public Task ToUsersAsync(IEnumerable<Guid> userIds, NotificationPayload payload) =>
        hub.Clients.Users(userIds.Select(id => id.ToString())).SendAsync("ReceiveNotification", payload);
}
```

ABP's SignalR module already maps `Clients.User(id)` to `CurrentUser.Id`, and under multi-tenancy a user id is unique on its own. When you need "push to everyone", note that `Clients.All` crosses tenants.

Push from an application service:

```csharp
await _notificationPusher.ToUserAsync(approverId, new NotificationPayload(
    Id: GuidGenerator.Create().ToString(),
    Severity: "info",
    Title: new LocalizableText("Approvals:NewRequest", "MyProject", new Dictionary<string, string> { ["name"] = requester }),
    Url: $"/approvals/{request.Id}"));
```

When `Title` / `Message` carry a catalog key, the frontend resolves it in each recipient's own language — one push may reach users of different languages. `MyProject` is the ABP resource name; the frontend looks up the backend entry as `MyProject::Approvals:NewRequest` and substitutes `{name}`.

## Frontend usage

Once installed, notifications pop up as toasts automatically (the level follows `severity`; with a url there is a "View" button). To change how they look, edit `src/features/signalr/notifications.tsx` — once installed, it is yours.

`url` must be a same-origin in-app path: it starts with `/`, does not start with `//` or `/\`, and contains no control characters or spaces. A non-conforming `url` is dropped and the toast still shows, just without the "View" button.

To do something extra when a notification arrives:

```tsx
import { useNotificationEvent } from "@/features/signalr/notifications";

useNotificationEvent((notification) => {
  if (notification.url?.startsWith("/approvals")) {
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  }
});
```

### Custom hubs

The hub name is ABP's route name: `DashboardHub` → `dashboard`, `ChatHub` → `chat` (lowercase letters, digits and hyphens only).

A dashboard refresh (receive only):

```tsx
import { useHubEvent } from "@jcoder-stack/abp-react/realtime";

useHubEvent("dashboard", "Changed", () => {
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
});
```

Chat (send and receive):

```tsx
import { useHub, useHubEvent } from "@jcoder-stack/abp-react/realtime";

const chat = useHub("chat");
useHubEvent("chat", "MessageReceived", (user, text) => append(String(user), String(text)));

<Button disabled={chat.state !== "connected"} onClick={() => chat.invoke("SendMessage", draft)}>
  Send
</Button>
```

A hub has exactly one connection per tab, shared by however many components subscribe; it disconnects 5 seconds after the last subscriber leaves, so route changes do not reconnect over and over.

## Behavior details

| Situation | What the frontend does |
| --- | --- |
| Signed out | No connection |
| The backend has no such hub (404) | State `unavailable`; no further attempts in this tab |
| Token rejected (401) | Fetch a fresh token and retry once; if still rejected, `disconnected` and no more attempts on this page (usually the backend is missing the middleware from step 2) |
| Network drop / backend restart | Reconnect with backoff at 0, 2, 5, 10, 30 seconds, then every 60 seconds, never giving up |
| Sign-out / tenant switch / language switch | Full-page redirect; the connection ends with the page |

`SIGNALR_HUB_PREFIX` in `.env` only needs setting if you changed the hub route prefix on the backend (default `/signalr-hubs`).

Notifications pushed while no page is open are lost — that is the semantics of real-time push. If you need delivery while offline, wait for the notification inbox planned for later.

## Security

Business APIs still all go through the BFF proxy, and tokens stay out of the browser. SignalR is the one exception; its boundary is in [architecture.en.md](../architecture.en.md#the-signalr-token-exception).
