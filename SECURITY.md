# 安全策略

## 报告漏洞

**请不要开公开 issue。**

用 GitHub 的私密漏洞报告：仓库页 → **Security** → **Report a vulnerability**。这条渠道只有维护者看得到，修复发布前不会公开。

报告里请尽量包含：受影响的包与版本、复现步骤或 PoC、你认为的影响面。

这是个业余时间维护的项目，我会尽快回，但给不出承诺的 SLA。修好之后会发补丁版本并在 release notes 里注明，你可以选择署名或匿名。

## 支持的版本

| 版本 | 状态 |
| --- | --- |
| 0.1.x | 接受安全修复 |

1.0 之前只维护最新的次版本。

## 值得优先看的地方

这个框架自己承担了几件安全相关的事，出问题的话影响的是使用者的应用：

- **会话密封**（`auth/codec.ts`、`auth/cookies.ts`）。会话以加密 cookie 形式存在，密钥来自 `AUTH_SESSION_SECRET`。伪造、解密、跨租户重放都属于此处。
- **OIDC 握手**（`auth/oidc/`、`auth/pkce.ts`）。state 与 PKCE 的生成和校验、握手 cookie 的寿命、`returnUrl` 的开放重定向。
- **BFF 代理**（`proxy/`）。它替浏览器持有 access token 并转发请求，是攻击面最集中的一层。已知并已挡住的两类：调用方伪造 `__tenant` 一类的头（按固定名单剔除，大小写不敏感），以及用绝对 URL 或 `//host` 让请求连同 Bearer 打到任意主机（SSRF + token 外泄）。绕过这两道的写法请报告。
- **日志脱敏**（`logger/redact.ts`）。凭据不该出现在日志里。注意 OAuth 的 `state` 不在默认脱敏名单内，那是有意的——它本来就明文出现在浏览器地址栏。

## 不属于本项目的范围

- **权限判定不是安全边界。** `requirePermission`、`PermissionGuard`、`can()` 都只管界面显隐，真正的授权在 ABP 后端。前端能被绕过是设计如此，不构成漏洞；后端没挡住才是。
- **`id_token` 的签名不在前端验。** 信任建立在 IdP 与 BFF 之间的 TLS 通道和 code 交换上，`auth/oidc/claims.ts` 只解 payload。
- ABP 后端自身、你自己的应用代码，以及 `examples/starter` 里那个进程内的 Book mock 后端（它只是演示用的假数据源，不面向生产）。
- 需要攻击者已经拿到 `AUTH_SESSION_SECRET`、后端凭据或用户设备的场景。
