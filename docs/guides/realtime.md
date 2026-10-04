# 实时通信（SignalR）

> 简体中文版。English edition: [`realtime.en.md`](realtime.en.md)

可选功能 `signalr` 让前端连上 ABP 后端的 SignalR Hub：后台推送通知、看板实时刷新、聊天。

```bash
npx jc-abp add signalr          # 已有项目
npx jc-abp init --with signalr  # 新项目
```

装完多出 `src/features/signalr/`，并新增依赖 `@microsoft/signalr`（只在第一次建连时按需下载，不进首屏）。

## 后端要先有 Hub

ABP 默认模板**没有任何 Hub**，ABP 也没有内置通知模块。没有 Hub 时前端会安静降级：每个标签页只发一次 negotiate，拿到 404 就记下「这个 Hub 不在」，不重试、不报错。要让它真的工作，把下面的代码加进你的 ABP 后端（以 `*.HttpApi.Host` 项目为例）。

### 1. 依赖 SignalR 模块

安装 NuGet 包 `Volo.Abp.AspNetCore.SignalR`，然后：

```csharp
[DependsOn(typeof(AbpAspNetCoreSignalRModule))]
public class MyProjectHttpApiHostModule : AbpModule
{
}
```

### 2. 让 Hub 接受查询串里的 token

WebSocket 不能带 `Authorization` 头，SignalR 把 token 放在 `?access_token=`。在 `OnApplicationInitialization` 里、`app.UseAuthentication()` **之前**加：

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

只对 `/signalr-hubs` 生效。如果后端改了 Hub 路由前缀，中间件里的 `StartsWithSegments("/signalr-hubs")` 与前端 `.env` 的 `SIGNALR_HUB_PREFIX` 必须一起改成同一个值。token 会出现在 URL 上，**访问日志不要记录 query string**。

漏了这一步不会报 401：negotiate 请求带着 `Authorization` 头照样通过，只是 WebSocket 与 SSE 握手失败，SignalR 悄悄退回长轮询——功能正常，但每条消息都是一次 HTTP 往返。如果 DevTools 里看到反复的 `…/signalr-hubs/<hub>?id=…` 轮询请求而不是一条 WebSocket，就是这个中间件没加，或者加在了 `UseAuthentication()` 之后。

### 3. 前提：浏览器能直连后端（CORS）

SignalR 不经 BFF，浏览器直接连 `AUTH_ABP_BASE_URL`，所以：

- 把前端源（如 `http://localhost:3000`）加进 `appsettings.json` 的 `App:CorsOrigins`。前端用 Bearer，不需要跨域 cookie。
- `AUTH_ABP_BASE_URL` 必须是用户浏览器能访问的地址，不能是只在内网或 docker 网络里可达的主机名。
- 前端是 https 时，`AUTH_ABP_BASE_URL` 也必须是 https。

任何一条不满足，控制台会出现 CORS 或混合内容（mixed content）错误，Hub 状态停在 `connecting`，约 50 秒后放弃，直到下一个订阅者出现（页面级 Hub 是下次进入订阅它的页面；通知 Hub 挂在根上，是下次整页加载）。

### 4. 通知 Hub 与推送服务

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
    object Title,             // string 或 LocalizableText
    object? Message = null,   // string 或 LocalizableText
    string? Url = null);      // 站内路径，如 "/approvals/7"（不能含空格或控制字符）

public class NotificationPusher(IHubContext<NotificationHub> hub) : ITransientDependency
{
    public Task ToUserAsync(Guid userId, NotificationPayload payload) =>
        hub.Clients.User(userId.ToString()).SendAsync("ReceiveNotification", payload);

    public Task ToUsersAsync(IEnumerable<Guid> userIds, NotificationPayload payload) =>
        hub.Clients.Users(userIds.Select(id => id.ToString())).SendAsync("ReceiveNotification", payload);
}
```

ABP 的 SignalR 模块已把 `Clients.User(id)` 映射到 `CurrentUser.Id`，多租户下用户 id 本身唯一。需要「推给所有人」时注意 `Clients.All` 会跨租户。

在应用服务里推送：

```csharp
await _notificationPusher.ToUserAsync(approverId, new NotificationPayload(
    Id: GuidGenerator.Create().ToString(),
    Severity: "info",
    Title: new LocalizableText("Approvals:NewRequest", "MyProject", new Dictionary<string, string> { ["name"] = requester }),
    Url: $"/approvals/{request.Id}"));
```

`Title` / `Message` 传词条 key 时，由前端按每个接收者自己的语言解析——同一条推送可能发给不同语言的用户。`MyProject` 是 ABP 的资源名，前端以 `MyProject::Approvals:NewRequest` 查后端词条，`{name}` 被替换。

## 前端用法

装好后通知自动弹成 toast（级别对应 severity，带 url 时有「查看」按钮）。要改样子就改 `src/features/signalr/notifications.tsx`——装进来就归你了。

`url` 必须是同源的站内路径：以 `/` 开头，不以 `//` 或 `/\` 开头，不含控制字符与空格。不合规的 `url` 会被丢弃，toast 照常显示，只是没有「查看」按钮。

收到通知时额外做点事：

```tsx
import { useNotificationEvent } from "@/features/signalr/notifications";

useNotificationEvent((notification) => {
  if (notification.url?.startsWith("/approvals")) {
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  }
});
```

### 自定义 Hub

Hub 名是 ABP 的路由名：`DashboardHub` → `dashboard`，`ChatHub` → `chat`（只能用小写字母、数字、短横线）。

看板刷新（只收不发）：

```tsx
import { useHubEvent } from "@jcoder-stack/abp-react/realtime";

useHubEvent("dashboard", "Changed", () => {
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
});
```

聊天（收发都有）：

```tsx
import { useHub, useHubEvent } from "@jcoder-stack/abp-react/realtime";

const chat = useHub("chat");
useHubEvent("chat", "MessageReceived", (user, text) => append(String(user), String(text)));

<Button disabled={chat.state !== "connected"} onClick={() => chat.invoke("SendMessage", draft)}>
  发送
</Button>
```

同一个 Hub 在一个标签页里只有一条连接，多少个组件订阅都共享；最后一个订阅者离开 5 秒后才断开，路由切换不会反复重连。

## 行为细节

| 情况 | 前端表现 |
| --- | --- |
| 未登录 | 不建连 |
| 后端没有这个 Hub（404） | 状态 `unavailable`，本标签页不再尝试 |
| token 被拒（401） | 重取一次 token 再试；仍被拒则 `disconnected`，本页面内不再尝试（token 本身不被后端接受，例如 audience 或 scope 不对） |
| 用户缺少 Hub 要求的权限（403） | `disconnected`，本页面内不再尝试 |
| 首次连接失败（网络、CORS、后端不可达） | 按 0、2、5、10、30 秒重试，仍不成功则 `disconnected`，本次页面访问内放弃，直到下一个订阅者 |
| 连上之后断开（网络断开 / 后端重启） | 按 0、2、5、10、30 秒退避重连，之后每 60 秒一次，不放弃 |
| 登出 / 切租户 / 切语言 | 整页跳转，连接随页面结束 |

「Hub 不在」的标记存在本标签页的 sessionStorage 里，刷新页面不会清除。后端补上 Hub 之后，新开一个标签页（或清掉该站点的 session storage）再试。

`.env` 里的 `SIGNALR_HUB_PREFIX` 只在后端改过 Hub 路由前缀时才需要设置（默认 `/signalr-hubs`）。

页面没打开时推送的通知会丢失——这是实时推送的语义。需要离线也收到的，等后续的通知收件箱。

## 安全

业务 API 仍然全部经 BFF 代理，token 不进浏览器。SignalR 是唯一的例外，边界见 [architecture.md](../architecture.md#signalr-的-token-例外)。
