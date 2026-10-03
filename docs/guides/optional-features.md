# 可选功能

> 简体中文版。English edition: [`optional-features.en.md`](optional-features.en.md)

有些能力不是每个项目都要：PWA、SignalR 实时通知。它们做成**可选功能**——不装就零开销，要装时新项目、已有项目各有一条命令。

## 安装

新项目，init 时一起装：

```bash
npx jc-abp init --with pwa,signalr
```

已有项目（0.4 起由 `jc-abp init` 生成的都行），事后补装：

```bash
npx jc-abp add pwa
```

`add <功能>` 可以重复执行：已经有的部分跳过，只补缺的。

## 装进来的是什么

每个功能是一个 shadcn 块，文件落在 `src/features/<名字>/`，入口是 `feature.tsx`。它默认导出一个 `FeatureModule`：

| 字段 | 作用 |
| --- | --- |
| `Provider` | 包在 `SessionProvider` 里面，能读会话与应用配置 |
| `head` | 追加到根路由的 `meta` / `links` |
| `messages` | 功能自带的词条，合并时排最前、优先级最低，应用词条可以同名覆盖 |

`src/features/index.ts` 用 `import.meta.glob("./*/feature.tsx")` 把它们收集起来，`__root.tsx` 只引用这一处。所以：

- **装功能 = 多一个目录**，`__root.tsx` 不用再改；
- **删功能 = 删掉那个目录**（PWA 例外，先看它自己的指南里的卸载步骤）。

入口刻意叫 `feature.tsx` 而不是 `index.tsx`：很多项目自己也用 `src/features/<模块>/index.tsx` 放业务代码，glob 不会把它们卷进根 bundle。

## 老项目的 `__root.tsx`

0.5 之前生成的项目，第一次装功能时 CLI 会给 `src/routes/__root.tsx` 补四处（import、head 两个数组、词条合并、`<FeatureProviders>` 包住 `<Outlet />`），原文件备份为 `__root.tsx.pre-features.bak`。

如果你改过 `__root.tsx`、CLI 认不出它的形状，它**一个字都不改**，而是打印手工接线的四步。照做一次即可，之后再装别的功能不用再动。

## 环境变量

功能需要的变量会追加到 `.env.example`；`.env` 存在时也追加。已有的 key（包括注释掉的 `# KEY=`）不覆盖，`.env` 不存在时不会替你新建。
