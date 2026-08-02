#!/usr/bin/env bash
# 打包冒烟：跑一遍真实的 npm pack（prepack/postpack 生命周期照常触发），再断言 tarball 里的 package.json
# 没有 workspace: 残留。npm publish 不认 bun 的 workspace: 协议，残留会原样发出去、装到宿主时解析失败。
# 另外单独跑一次 prepublishOnly——npm pack 不触发它，而它正是「发布时才炸」的高发点（找不到 tsup 之类）。
set -euo pipefail

cd "$(dirname "$0")/.."
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

for dir in packages/abp-react packages/cli; do
  echo "==> $dir: prepublishOnly"
  (cd "$dir" && npm run --silent prepublishOnly)
done

for dir in packages/abp-react packages/cli registry; do
  echo "==> $dir: npm pack"
  (cd "$dir" && npm pack --pack-destination "$out")
done

shopt -s nullglob
tarballs=("$out"/*.tgz)
if [ "${#tarballs[@]}" -ne 3 ]; then
  echo "ERROR: 期望 3 个 tarball，实得 ${#tarballs[@]}——npm pack 没有产出预期产物。" >&2
  exit 1
fi

status=0
for tarball in "${tarballs[@]}"; do
  manifest="$(tar -xzOf "$tarball" package/package.json)"
  if printf '%s' "$manifest" | grep -q '"workspace:'; then
    echo "ERROR: $(basename "$tarball") 里仍有未改写的 workspace: 依赖区间：" >&2
    printf '%s' "$manifest" | grep '"workspace:' >&2
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  exit 1
fi

echo "publish smoke ok"
