#!/usr/bin/env bash
# 打包冒烟：跑一遍真实的 npm pack（prepack/postpack 生命周期照常触发），再断言 tarball 里的 package.json
# 没有 workspace: 残留。另外单独跑一次 prepublishOnly——npm pack 不触发它，而它正是「发布时才炸」的
# 高发点（找不到 tsup 之类）。
set -euo pipefail

cd "$(dirname "$0")/.."
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

# 依赖区间必须在提交的 package.json 里就是真实版本，不能指望 prepack 改写。
# npm 在跑 prepack 之前就把 manifest 快照下来当 registry 元数据了：tarball 是 prepack 之后打的所以
# 干净，元数据里却留着 workspace:*。而依赖解析读的正是元数据，于是包发得出去、装不下来。
# （exports/main 不受影响——那些是从装好的 tarball 里读的。）实测于 2026-08-02，verdaccio 复现。
echo "==> 提交态 manifest 不得含 workspace: 依赖区间"
manifest_status=0
for dir in packages/abp-react packages/cli registry; do
  if grep -q '"workspace:' "$dir/package.json"; then
    echo "ERROR: $dir/package.json 里有 workspace: 区间，改成真实版本区间（如 ^0.1.0）：" >&2
    grep '"workspace:' "$dir/package.json" >&2
    manifest_status=1
  fi
done
if [ "$manifest_status" -ne 0 ]; then
  exit 1
fi

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
