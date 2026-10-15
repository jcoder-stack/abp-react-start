# 发版

> 简体中文版。English edition: [`releasing.en.md`](releasing.en.md)

这份文档讲**怎么把改动发出去**——CI 在什么时刻把关、版本号要改哪几处、预发布怎么做真机验收。面向维护者，不是使用者。

## CI 在什么时刻跑

`.github/workflows/` 下两个 workflow 都是 `on: push: tags: ["v*"]` + `workflow_dispatch`，**PR 不触发任何 CI**。这是刻意的：lint/typecheck/test/build 本地每次改动都跑，CI 再跑一遍是重复消耗；而发版是唯一「记错了代价最大」的时刻。

| workflow | 跑什么 | 为什么只在这里 |
| --- | --- | --- |
| `ci.yml` | lint、typecheck、test、build，外加 **registry 产物漂移检查** | 漂移检查只在这里有：块源码改了却忘了 `build:registry`，仓库自己的代码是完整的，lint/typecheck/test 全部看不见，只有装出来的项目才会拿到旧文件 |
| `publish-smoke.yml` | `scripts/publish-smoke.sh`：真跑 `npm pack` 与 `prepublishOnly` | 发布链路（`prepublishOnly` 的可执行文件解析、`prepack` 的 `publishOverrides` 改写、tarball 内容）只有真打一次包才会暴露问题 |

想在别的时候要一份干净机器上的复核（换 Node/bun 版本、怀疑 lockfile），在 Actions 页面手动触发。

`npm publish` **是手动的**，仓库里没有发布 workflow。

### 打标签前先在干净环境复现一遍

CI 只在推标签时跑，所以「本地全绿、CI 挂」只会在发版那一刻才暴露，而标签那时已经推出去了（见下文的标签保护）。本机环境会掩盖依赖解析问题：`~/node_modules` 之类仓库外散落的依赖、全局安装的包，都能让一个本该解析失败的 import 在本地碰巧成功。0.4.3 的 cli `gen` 测试就是这样——生成的 schema 引 `zod`，临时目录往上没有 `node_modules`，bun 的 isolated 安装又不把 `zod` 放进仓库根的 `node_modules`，本地靠 `~/node_modules` 里的一份过了，干净的 CI runner 上直接挂。

打标签前，在一个仓库外没有散落依赖的环境里（全新 clone 到临时目录、容器，或先在 Actions 页面对 `main` 手动触发 `ci.yml`）跑一遍 `bun install --frozen-lockfile && bun run lint && bun run typecheck && bun run test`。

## 版本号要改哪几处

历史上（0.1.0 → 0.1.3）都是 3 处，各包的 `version`：

- `packages/abp-react/package.json`
- `packages/cli/package.json`
- `registry/package.json`

**还有第 4 处**：`registry/package.json` 的 `dependencies["@jcoder-stack/abp-react"]`。三个包锁步同版发布，这个区间必须逐次对齐成 `^<本次版本>`。

`publish-smoke.sh` 会拦（CI 在推标签时跑它），报错长这样：

```
ERROR: registry/package.json 的 dependencies.@jcoder-stack/abp-react 是 "^0.1.0"，应为 "^0.2.0-rc.1"
```

之所以要逐次对齐、而不是留一个宽区间「反正容得下」，是因为 caret 区间**整体排除预发布版本**——实测：

```
0.2.0-rc.1  satisfies ^0.1.0      -> false
0.1.4-rc.1  satisfies ^0.1.0      -> false
0.2.0-rc.1  satisfies ^0.2.0-rc.1 -> true
0.2.0       satisfies ^0.2.0-rc.1 -> true
```

区间停在旧版时，`registry` 会去解析**上一个正式版**的 `abp-react`，验收等于白做，而且症状是「装得下来但装错版本」，比装不下来更难发现。

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

**`v*` 标签有仓库保护规则，推出去后不能强推移动**（`git push -f` 改标签指向会被拒）。0.4.3 就是这样：标签停在 release 提交 `65951bb`，事后补的测试修复只能落在 `main` 上，标签与 `main` 差一个提交。所以：

- 标签推出去之前确认该过的都过了（见上文「打标签前先在干净环境复现一遍」）。
- 发版后需要修补（只动测试/CI、不影响发布产物）时，不要挪标签：在 Actions 页面对 `main` 用 `workflow_dispatch` 重跑 `ci.yml` / `publish-smoke.yml` 拿绿灯即可。
- 确实必须让标签指向新提交时，到 GitHub 仓库设置（Rules / Tag protection）里临时放开 `v*` 规则，挪完立刻恢复。已经发到 npm 的版本不受标签影响，也不能重发——产物有问题就发下一个 patch。

然后按依赖顺序发（`registry` 依赖 `abp-react`，反了会出现一段时间的悬空依赖）：

```bash
(cd packages/abp-react && npm publish)
(cd packages/cli       && npm publish)
(cd registry           && npm publish)
```

**`npm publish` 成功后，新版本要 1 到数分钟才在 registry 上可见。** 这段时间里 `npm view` 查不到、依赖它的包也解析不到，再发一次同版本会得到 `409 Cannot publish over previously staged version` 或 `You cannot publish over the previously published versions`——**这不是失败，不要重试**，上一次已经成功了。用 registry 的 `time` 字段确认：

```bash
curl -s https://registry.npmjs.org/@jcoder-stack/abp-react | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).time["X.Y.Z"]))'
```

打出时间戳即已发布。**发 `registry` 之前先这样确认 `abp-react` 的新版已可见**——`registry` 依赖 `^X.Y.Z`，赶在可见之前发，紧跟着装的人会解析失败。

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

版本改成 `X.Y.0`，把 `registry` 的依赖区间同步成 `^X.Y.0`（不同步 `publish-smoke.sh` 会拦），重新打标签、`npm publish`（不带 `--tag`，默认进 `latest`）。

不通过就在 `main` 上修完发 `-rc.N+1`。**rc 版本号烧掉就是烧掉**，npm 不允许复用，也不要 `unpublish`——它会破坏已经装过该版本的人的 lockfile。
