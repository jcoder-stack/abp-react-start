#!/usr/bin/env bash
#
# 重放「真实开发者装上本框架后的初始化流程」，产出 examples/starter。
#
# 约定：examples/starter 不是手工演进的示例应用，而是**本脚本的产物**——
#   脚手架（@tanstack/cli create）→ 装 @jcoder-stack 包 → jc-abp init → jc-abp gen
# 加上一份清单化的「手写增量」（Book CRUD 示范页与它自带的 mock 后端、菜单项、App 词条、test/、
# monorepo 适配的 package.json/tsconfig 与 __root/router 接线）。
#
# 于是「改组件」的真值方向是反的：改 registry/ui/blocks/** 或 packages/cli/**，
# 再重放本脚本让 starter 跟上；**不要**直接改 starter 里由 registry 块分发的文件，
# 那些改动下次重放就会被覆盖。
#
# 手写增量的存放位置就是产物自身：重放前把 HANDWRITTEN_PATHS 清单里的路径从
# 现有目标目录抢救到临时区，生成完再盖回去。首次 bootstrap 或换目录时用
# --preserve-from 指向一份已有的 starter。
#
# 第一步会 rm -rf 目标目录：抢救清单之外、且从未 git add 过的文件（典型如手改过还没提交的
# .env）在那一下就没了。所以 rm 之前会跑一遍「目标目录里有没有清单之外的未跟踪文件」的检查，
# 有就中止并列出来，要跳过用 --force（真吃过亏才跳，别把它当默认习惯）。
#
# 用法:
#   scripts/regenerate-example.sh [--target <dir>] [--backend <url>] [--preserve-from <dir>] [--force]
#
#   --target        产物目录，默认 examples/starter；仓库内重放必须落在 examples/* 下（workspace:*
#                    与 registry 依赖解析都靠这个），指到别处只给非致命警告——真实开发者拿发布包
#                    重放到任意目录是成立的场景，这里不拦。
#   --backend       ABP 后端地址（取 /swagger/v1/swagger.json 喂 jc-abp gen），默认 https://localhost:44316
#   --preserve-from 手写增量的来源目录，默认与 --target 相同（即原地重放）
#   --force         跳过「目标目录里有未跟踪且不在抢救清单内的文件」检查，直接 rm -rf
#
# 前置：已跑过 `bun install` 与 `bun run build`（jc-abp 的 bin 吃 packages/cli/dist）。
# 后端自签证书时脚本内部已置 NODE_TLS_REJECT_UNAUTHORIZED=0 供 gen 抓 swagger 用。

set -euo pipefail
export LC_ALL=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TARGET_DIR="$REPO_ROOT/examples/starter"
BACKEND_URL="https://localhost:44316"
PRESERVE_FROM=""
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET_DIR="$2"; shift 2 ;;
    --backend) BACKEND_URL="$2"; shift 2 ;;
    --preserve-from) PRESERVE_FROM="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '2,35p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

TARGET_DIR="$(cd "$(dirname "$TARGET_DIR")" && pwd)/$(basename "$TARGET_DIR")"
PRESERVE_FROM="${PRESERVE_FROM:-$TARGET_DIR}"
APP_NAME="$(basename "$TARGET_DIR")"
SWAGGER_URL="${BACKEND_URL%/}/swagger/v1/swagger.json"

case "$TARGET_DIR" in
  "$REPO_ROOT"/examples/*) ;;
  *)
    echo "警告: --target ($TARGET_DIR) 不在仓库的 examples/* workspace 下——" \
      "仓库内重放（workspace:* 依赖解析、registry 目录定位）要求目标落在 examples/* 里；" \
      "指到别处仅在你拿的是已发布的 @jcoder-stack 包（而非本仓库 workspace 源码）重放时才行得通。" >&2
    ;;
esac

# 手写增量清单：这些路径不由脚手架/init/gen 产出，重放时原样保留。
# .cta.json 与 public/ 是旧版 @tanstack/cli 脚手架的产物，新版不再生成——当作项目资产保留。
# package.json 不在清单里——它是「生成产物 + 一段确定性补丁」（见 patch_package_json），
# 这样 shadcn 装块时追加的运行期依赖能自动留下，不会被一份写死的旧文件盖掉。
HANDWRITTEN_PATHS=(
  "tsconfig.json"
  ".gitignore"
  ".cta.json"
  "public"
  ".env"
  "README.md"
  "vite.config.ts"
  "src/router.tsx"
  "src/routes/__root.tsx"
  "src/routes/_layout/forbidden.tsx"
  "src/routes/_layout/_authed/books"
  "src/menu.tsx"
  "src/i18n"
  "test"
)

# monorepo 适配补丁：真实开发者这里是
#   bun add @jcoder-stack/abp-react && bun add -D @jcoder-stack/cli @jcoder-stack/registry
# starter 身在本仓库，所以写 workspace:*。测试/类型工具链由仓库根统一持有，
# 从成员 package.json 里摘掉，避免与根上的 typescript/vitest 版本打架。
# init 之前先跑一次（让 @jcoder-stack 包与 registry 可解析），init/gen 之后再跑一次
# （把 shadcn 追加的依赖留下、同时确保这些覆盖没被冲掉）。
patch_package_json() {
  node -e '
const fs = require("node:fs");
const [path, appName] = process.argv.slice(1);
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.name = appName;
pkg.private = true;
pkg.dependencies["@jcoder-stack/abp-react"] = "workspace:*";
pkg.dependencies["@tanstack/react-query"] = "^5.0.0";
pkg.dependencies["zod"] = "^4.0.0";
// 新版 @tanstack/cli 脚手架把部分依赖写成 "latest"、并不再带 SSR/router 周边包；
// 锁回与 starter 提交态一致的版本保证重放可复现（有意升级时改这份 pin 表）。
Object.assign(pkg.dependencies, {
  "@tanstack/react-devtools": "^0.10.8",
  "@tanstack/react-router": "^1.170.18",
  "@tanstack/react-router-devtools": "^1.167.0",
  "@tanstack/react-router-ssr-query": "^1.167.1",
  "@tanstack/react-start": "^1.168.32",
  "@tanstack/router-plugin": "^1.132.0",
  "lucide-react": "^0.545.0",
  "radix-ui": "^1.6.4",
});
Object.assign(pkg.devDependencies, {
  "@tailwindcss/typography": "^0.5.16",
  "@tanstack/devtools-vite": "^0.8.1",
});
pkg.devDependencies["@jcoder-stack/cli"] = "workspace:*";
pkg.devDependencies["@jcoder-stack/registry"] = "workspace:*";
for (const owned of ["typescript", "vitest", "jsdom", "@testing-library/dom", "@testing-library/react", "@types/node", "@types/react", "@types/react-dom"]) {
  delete pkg.devDependencies[owned];
}
delete pkg.pnpm;
pkg.scripts = {
  dev: "vite dev",
  build: "vite build",
  start: "node dist/server/server.js",
  "generate-routes": "tsr generate",
};
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
pkg.dependencies = sortKeys(pkg.dependencies);
pkg.devDependencies = sortKeys(pkg.devDependencies);
fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
' "$TARGET_DIR/package.json" "$APP_NAME"
}

step() { echo; echo "==> $*"; }

# rel（相对 TARGET_DIR/PRESERVE_FROM）是否落在 HANDWRITTEN_PATHS 清单内——整条路径本身，
# 或某个清单目录条目（如 "src/i18n"、"test"）之下。
path_is_handwritten() {
  local rel="$1" p
  for p in "${HANDWRITTEN_PATHS[@]}"; do
    if [[ "$rel" == "$p" || "$rel" == "$p"/* ]]; then
      return 0
    fi
  done
  return 1
}

# 抢救结束后的自检：HANDWRITTEN_PATHS 里但凡在 PRESERVE_FROM 真实存在的路径，必须已经落进
# STASH_DIR——缺一个就说明抢救本身出了岔子（权限、符号链接等异常），绝不能带着这种半抢救状态
# 往下走到 rm -rf。
verify_rescue_complete() {
  local rel src stashed missing=()
  for rel in "${HANDWRITTEN_PATHS[@]}"; do
    src="$PRESERVE_FROM/$rel"
    stashed="$STASH_DIR/$rel"
    if [[ -e "$src" && ! -e "$stashed" ]]; then
      missing+=("$rel")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "错误: 以下手写增量路径在 $PRESERVE_FROM 里存在，但没能抢救到 $STASH_DIR，中止（不执行 rm -rf $TARGET_DIR）:" >&2
    printf '    %s\n' "${missing[@]}" >&2
    exit 1
  fi
  # 抢救到的条目为零说明来源不是完整 starter（多半是上一次重放崩溃后的半成品）——
  # 继续跑会产出缺全部手写增量的假产物；先从 git/崩溃保留的抢救区把来源恢复完整再重放。
  local rescued
  rescued="$(find "$STASH_DIR" -mindepth 1 -print -quit 2>/dev/null)"
  if [[ -z "$rescued" ]]; then
    echo "错误: 手写增量一条都没抢救到——$PRESERVE_FROM 看起来不是完整的 starter，中止。" >&2
    exit 1
  fi
}

# rm -rf 目标目录前的护栏：清单之外、且从未 git add 过的文件（典型如手改过还没提交的 .env）
# 在 rm -rf 那一下就永久丢了，只靠 HANDWRITTEN_PATHS 这份人工清单保命并不可靠。只在目标落在
# 本仓库内时能用 git 判断"跟踪"与否——落在仓库外的目标本来就没有这层安全网，交由 --target 的
# workspace-glob 警告去提示，这里不重复拦。
guard_untracked_files() {
  if [[ ! -e "$TARGET_DIR" ]]; then
    return
  fi
  case "$TARGET_DIR" in
    "$REPO_ROOT"/*) ;;
    *)
      echo "    目标不在仓库内，跳过未跟踪文件检查（git 无法判断该目录的跟踪状态）"
      return
      ;;
  esac

  local target_rel line rel flagged=()
  target_rel="${TARGET_DIR#"$REPO_ROOT"/}"
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    rel="${line#"$target_rel"/}"
    path_is_handwritten "$rel" || flagged+=("$rel")
  done < <(git -C "$REPO_ROOT" ls-files --others --exclude-standard -- "$TARGET_DIR")

  if [[ ${#flagged[@]} -eq 0 ]]; then
    return
  fi
  if [[ "$FORCE" -ne 1 ]]; then
    echo "错误: $TARGET_DIR 里有未被 git 跟踪、且不在 HANDWRITTEN_PATHS 抢救清单内的文件，rm -rf 会把它们永久删掉，中止:" >&2
    printf '    %s\n' "${flagged[@]}" >&2
    echo "确认这些文件可以丢弃后加 --force 重跑。" >&2
    exit 1
  fi
  echo "    --force：跳过未跟踪文件检查，即将连同以下未跟踪且不在抢救清单内的文件一起删除:"
  printf '    %s\n' "${flagged[@]}"
}

step "目标: $TARGET_DIR  (app 名 $APP_NAME)"
echo "    后端 swagger: $SWAGGER_URL"
echo "    手写增量来源: $PRESERVE_FROM"

# vite dev server 会 watch $TARGET_DIR，rm -rf/重建期间与之竞争会让重放进程间歇性
# node fatal（实测三次崩溃均在 dev server 开着时发生，停掉后同版本一次通过）。
if lsof -ti:5173 >/dev/null 2>&1; then
  echo "错误: 5173 端口有 dev server 在跑（vite 正 watch starter），先停掉再重放。" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 抢救手写增量
# ---------------------------------------------------------------------------
STASH_DIR="$(mktemp -d)"
# 成功才清抢救区；中途崩溃时保留，手写增量还能从 $STASH_DIR 找回。
trap '[[ $? -eq 0 ]] && rm -rf "$STASH_DIR" || echo "!! 重放未成功，手写增量备份保留在: $STASH_DIR"' EXIT

step "抢救手写增量到 $STASH_DIR"
for rel in "${HANDWRITTEN_PATHS[@]}"; do
  src="$PRESERVE_FROM/$rel"
  if [[ -e "$src" ]]; then
    mkdir -p "$STASH_DIR/$(dirname "$rel")"
    cp -R "$src" "$STASH_DIR/$rel"
    echo "    保留 $rel"
  else
    echo "    (缺) $rel — 生成产物将保持 init/脚手架原样"
  fi
done
verify_rescue_complete

step "护栏: 检查 $TARGET_DIR 里有没有清单之外的未跟踪文件"
guard_untracked_files

# ---------------------------------------------------------------------------
# 生成段：脚手架 → 依赖 → init → gen。这一段的产物是「真实开发者拿到的东西」。
# ---------------------------------------------------------------------------
# `bun run typecheck` 的 tsc -b 会向 packages/*/dist emit 无扩展名 import 的 JS，覆盖 tsup
# 产物后 node 直接跑不动 CLI——重放前必须重建，否则 init 步骤在 rm -rf 之后才崩，starter 只剩半成品。
step "0/5 重建 @jcoder-stack 包 dist（防 tsc -b 污染产物）"
(cd "$REPO_ROOT" && bun run build)

step "1/5 清空并用 @tanstack/cli 建 TanStack Start 脚手架"
rm -rf "$TARGET_DIR"
npx --yes @tanstack/cli@latest create "$APP_NAME" \
  --target-dir "$TARGET_DIR" \
  --framework React \
  --package-manager bun \
  --no-git --no-examples --no-toolchain --no-intent --no-install --non-interactive

step "2/5 把 @jcoder-stack 包接成 workspace 依赖并安装"
patch_package_json
(cd "$REPO_ROOT" && bun install)

step "3/5 jc-abp init（auth 外壳 + 全部 shadcn 块 + components.json/lib-utils/主题 css 播种）"
(cd "$TARGET_DIR" && node "$REPO_ROOT/packages/cli/bin/jc-abp.js" init)

step "4/5 jc-abp gen（对着真实后端 swagger 生成 react-query 客户端）"
(cd "$TARGET_DIR" && NODE_TLS_REJECT_UNAUTHORIZED=0 \
  node "$REPO_ROOT/packages/cli/bin/jc-abp.js" gen --input "$SWAGGER_URL" --output src/api)

# ---------------------------------------------------------------------------
# 手写增量段：init/gen 覆盖不到的部分，盖回抢救出来的清单文件。
# ---------------------------------------------------------------------------
step "5/5 回植手写增量"
for rel in "${HANDWRITTEN_PATHS[@]}"; do
  stashed="$STASH_DIR/$rel"
  [[ -e "$stashed" ]] || continue
  dest="$TARGET_DIR/$rel"
  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  cp -R "$stashed" "$dest"
  echo "    回植 $rel"
done

# init 把脚手架首页改名成 .bak（与 app-shell 的 _layout/index.tsx 抢 "/"），
# 主题 css 播种同样留了一份 .bak——都是给人肉恢复用的残留，产物里不留。
find "$TARGET_DIR/src" -name "*.bak" -delete

# shadcn 装块时会往 package.json 追加依赖，补丁再跑一次把 monorepo 覆盖压回去。
patch_package_json
(cd "$REPO_ROOT" && bun install)

# routeTree.gen.ts 平时由 vite 插件在 dev/build 时产出；这里显式生成一次，
# 好让重放完不必先跑一遍 build 就能通过 typecheck（registry/tsconfig.ui.json 也要 include 它）。
step "生成路由树 src/routeTree.gen.ts"
(cd "$TARGET_DIR" && bunx tsr generate)

# 脚手架用单引号/无分号，与本仓库 biome 风格不符。按仓库风格格式化产物；
# biome.json 已把 src/api、components/ui、routeTree.gen.ts 等「原样安装/生成」的目录排除在外，
# 所以这一步碰不到 shadcn 官方原语与 orval 产物。
step "按仓库 biome 风格格式化产物"
(cd "$REPO_ROOT" && bunx biome check --write "$TARGET_DIR" >/dev/null 2>&1 || true)

step "重放完成"
echo "接下来："
echo "  cd $REPO_ROOT && bun install"
echo "  bun run typecheck && bun run test"
echo "  bun run --filter './${TARGET_DIR#"$REPO_ROOT"/}' build"
echo "  （routeTree.gen.ts 要经过一次真实 build 才会补上 vite router-plugin 追加的 SSR 类型增强块、"
echo "    与仓库提交态字节一致——只跑本脚本就做逐字节 diff 会在该文件上看到假阳性）"
