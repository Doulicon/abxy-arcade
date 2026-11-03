#!/usr/bin/env bash
# 重新镜像 EmulatorJS 运行时到 server/public/emulatorjs（升级 EmulatorJS 版本时执行一次）
# 用法: bash scripts/fetch-emulator.sh [版本号]   默认 stable
set -euo pipefail

VERSION="${1:-stable}"
BASE="https://cdn.emulatorjs.org/${VERSION}/data"
OUT="$(cd "$(dirname "$0")/.." && pwd)/server/public/emulatorjs"
CORES=(fceumm snes9x gambatte mgba mupen64plus_next genesis_plus_gx melonds fbneo fbalpha2012_cps1 fbalpha2012_cps2)

fetch() {
  local rel="$1" dst="$OUT/$1" code
  mkdir -p "$(dirname "$dst")"
  code=$(curl -sS -L --max-time 180 --retry 3 --retry-delay 2 -o "$dst" -w "%{http_code}" "$BASE/$rel")
  if [ "$code" != "200" ]; then
    rm -f "$dst"
    printf 'SKIP %-46s %s\n' "$rel" "$code"
    return 0
  fi
  printf '%-50s %8s\n' "$rel" "$(du -h "$dst" | cut -f1)"
}

echo "== 版本: $VERSION =="
for f in loader.js emulator.min.js emulator.min.css emulator.css version.json; do fetch "$f"; done
for c in en-US zh-CN ja-JA ko-KO; do fetch "localization/$c.json"; done
for f in extractzip.js extract7z.js libunrar.js libunrar.wasm; do fetch "compression/$f"; done

for c in "${CORES[@]}"; do
  fetch "cores/$c-wasm.data"          # 有 WebGL2 时使用
  fetch "cores/$c-legacy-wasm.data"   # 无 WebGL2（软渲染/远程桌面）时使用
  fetch "cores/reports/$c.json"       # 内核构建信息，缺失会关闭核心缓存
done

# 内网 / 代理环境无需外网版本检查，注释掉这一行可保留官方行为
if [ -f "$OUT/emulator.min.js" ]; then
  sed -i 's/&&this\.checkForUpdates()/\&\&0\&\&this.checkForUpdates()/' "$OUT/emulator.min.js"
fi

echo "== 完成 =="
du -sh "$OUT"
