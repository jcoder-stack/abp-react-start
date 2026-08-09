# 发版

> 简体中文版。English edition: [`releasing.en.md`](releasing.en.md)

这份文档讲**怎么把改动发出去**——CI 在什么时刻把关、版本号要改哪几处、预发布怎么做真机验收。面向维护者，不是使用者。

## CI 在什么时刻跑

`.github/workflows/` 下两个 workflow 都是 `on: push: tags: ["v*"]` + `workflow_dispatch`，**PR 不触发任何 CI**。这是刻意的：lint/typecheck/test/build 本地每次改动都跑，CI 再跑一遍是重复消耗；而发版是唯一「记错了代价最大」的时刻。

| workflow | 跑什么 | 为什么只在这里 |
| --- | --- | --- |
| `ci.yml` | lint、typecheck、test、build，外加 **registry 产物漂移检查** | 漂移检查只在这里有：块源码改了却忘了 `build:registry`，仓库自己的代码是完整的，lint/typecheck/test 全部看不见，只有装出来的项目才会拿到旧文件 |
| `publish-smoke.yml` | `scripts/publish-smoke.sh`：真跑 `npm pack` 与 `prepublishOnly` | 发布链路（`prepublishOnly` 的可执行文件解析、`prepack` 的 `publishConfig` 改写、tarball 内容）只有真打一次包才会暴露问题 |

想在别的时候要一份干净机器上的复核（换 Node/bun 版本、怀疑 lockfile），在 Actions 页面手动触发。

`npm publish` **是手动的**，仓库里没有发布 workflow。

## 版本号要改哪几处

历史上（0.1.0 → 0.1.3）都是 3 处，各包的 `version`：

- `packages/abp-react/package.json`
- `packages/cli/package.json`
- `registry/package.json`

**跨 minor 时还有第 4 处**：`registry/package.json` 的 `dependencies["@jcoder-stack/abp-react"]`。它现在是 `^0.1.0`，而 caret 区间**整体排除预发布版本**——实测：

```
0.2.0-rc.1  satisfies ^0.1.0      -> false
0.1.4-rc.1  satisfies ^0.1.0      -> false
0.2.0-rc.1  satisfies ^0.2.0-rc.1 -> true
0.2.0       satisfies ^0.2.0-rc.1 -> true
```

不同步改这处，`registry@0.2.0-rc.1` 会去解析**上一个正式版**的 `abp-react`，验收等于白做，而且症状是「装得下来但装错了版本」，比装不下来更难发现。

`publish-smoke.sh` 抓不到这件事——它只 grep `workspace:` 残留，不验证跨包区间能否互相解析。

## 还要跟着改的东西

`scripts/regenerate-example.sh` 里有一张 **pin 表**（`patch_package_json` 内），把脚手架产物锁到与 `examples/starter` 提交态一致的版本，保证重放可复现。**升级 starter 的 TanStack 依赖时必须同步这张表**，否则下次重放会把依赖悄悄打回旧版。

漏改的代价是隐性的：`bun install` 照跑、测试照过，只有重放产物的 `package.json` 与提交态对不上。

## 发正式版

```bash
# main 上，改完上述版本号
git commit -am "chore: release X.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

推标签自动触发两个 workflow。**等它们变绿再发布**——这是它们存在的全部意义。

然后按依赖顺序发（`registry` 依赖 `abp-react`，反了会出现一段时间的悬空依赖）：

```bash
(cd packages/abp-react && npm publish)
(cd packages/cli       && npm publish)
(cd registry           && npm publish)
```

四个历史标签全部从 `main` 切，没有过 release 分支。单人仓库不值得为 rc 期间的并行开发付 cherry-pick 的成本。

## 预发布与真机验收

改动够大时（依赖大版本升级、块组件改形状）先发 rc，用**已发布的包**在仓库外重放一次，再发正式版。

理由是 `examples/starter` 用 `workspace:*` 接三个包，仓库内的一切验证测的都是**源码**，测不到发布产物。发布链路上有一类只在真发布时才炸的问题——`publish-smoke.sh` 的注释里记着一例：npm 在 `prepack` **之前**就把 manifest 快照成 registry 元数据，`workspace:` 残留会让包「发得出去、装不下来」（2026-08-02 用 verdaccio 复现）。

### 发 rc

版本号用 `X.Y.0-rc.N`，其余同上，但发布时带 `--tag next`：

```bash
(cd packages/abp-react && npm publish --tag next)
(cd packages/cli       && npm publish --tag next)
(cd registry           && npm publish --tag next)
```

`--tag next` 是关键：不占 `latest`，现有用户 `npx jc-abp` 与 `npm i @jcoder-stack/abp-react` 拿到的仍是上一个正式版。

### 验收

**不能直接用 `scripts/regenerate-example.sh`**——它恒把三个包写成 `workspace:*`，只适合仓库内重放。按它注释里那条「真实开发者」路径手动走一遍：

```bash
npx --yes @tanstack/cli@latest create acc-test --framework React \
  --package-manager bun --no-git --no-examples --no-toolchain --no-intent --non-interactive
cd acc-test
bun add @jcoder-stack/abp-react@next
bun add -D @jcoder-stack/cli@next @jcoder-stack/registry@next
bunx jc-abp init
bunx jc-abp gen                 # 指向真实 ABP 后端
bunx jc-abp add <改动涉及的块>
bun run dev && bun run build
```

至少要看三件事：

1. **装得下来，且装到的是 rc**——正面验证上面那个跨包区间问题。`bun pm ls | grep jcoder` 确认三个包的实际版本。
2. **装进来的块在真实项目里编得过**——仓库内 typecheck 吃的是 `src`，装出来的项目吃的是 `dist` 与 copy-in 的源码，两者不等价。
3. **对真实 ABP 后端跑通 CRUD**——mock 后端复现不了真实的 ABP 错误形状与权限行为。

### 通过之后

版本改成 `X.Y.0`，把 `registry` 的依赖区间收成 `^X.Y.0`，重新打标签、`npm publish`（不带 `--tag`，默认进 `latest`）。

不通过就在 `main` 上修完发 `-rc.N+1`。**rc 版本号烧掉就是烧掉**，npm 不允许复用，也不要 `unpublish`——它会破坏已经装过该版本的人的 lockfile。
