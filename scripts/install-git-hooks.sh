#!/bin/sh
# npm prepare 钩子：npm install / npm ci 后自动安装 git hooks（幂等）。
#
# 为什么存在：git 不跟踪 .git/hooks/，靠「新环境手动 cp」（pre-commit 注释里的
# 老办法）总会漏装 —— 2026-10-18 的结论是漏配检查不该依赖任何人记住任何事，
# 从安装这一步就开始机制化。
#
# 范围：只安装 scripts/git-hooks/ 下的钩子（目前 pre-commit / pre-push）。
# .git/hooks/ 里 Qoder tracker 占用的 post-commit / post-checkout 不在本目录、不受影响。
#
# 安装形态：**symlink 指向仓库内源文件** —— 源改动即时生效，无需重复安装
# （pre-push 钩子 2026-10-18 当天就因「cp 安装后改源不生效」踩过一次）。
# 已有真实文件时：与源相同 → 升级为 symlink；不同 → 不动并警告（防吞本机自定义钩子）。

set -e
SRC_DIR="$(cd "$(dirname "$0")/git-hooks" && pwd)"
HOOKS_DIR="$(git rev-parse --git-path hooks 2>/dev/null || echo ".git/hooks")"

mkdir -p "$HOOKS_DIR"

changed=0
for src in "$SRC_DIR"/*; do
  name="$(basename "$src")"
  dst="$HOOKS_DIR/$name"
  if [ -L "$dst" ]; then
    # 已是 symlink：指向变了就重建（源文件移动/更名后的自愈），否则跳过
    target="$(readlink "$dst")"
    if [ "$target" != "$src" ]; then
      ln -sf "$src" "$dst"
      changed=$((changed + 1))
      echo "[install-git-hooks] 已更新 symlink $name → $src"
    fi
    continue
  fi
  if [ -f "$dst" ]; then
    if cmp -s "$src" "$dst"; then
      # 以前用 cp 安装的同内容文件：升级为 symlink（此后随源更新）
      rm "$dst"
      ln -s "$src" "$dst"
      chmod +x "$src" 2>/dev/null || true
      changed=$((changed + 1))
      echo "[install-git-hooks] $name 已升级为 symlink（随源更新）"
    else
      echo "[install-git-hooks] ⚠️ $HOOKS_DIR/$name 已存在且内容不同，未覆盖（如需更新请手动 diff）"
    fi
    continue
  fi
  ln -s "$src" "$dst"
  chmod +x "$src" 2>/dev/null || true
  changed=$((changed + 1))
  echo "[install-git-hooks] 已安装 $name → $src"
done

if [ "$changed" -eq 0 ]; then
  echo "[install-git-hooks] git hooks 均为最新"
fi
