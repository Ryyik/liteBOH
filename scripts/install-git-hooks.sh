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

# ⚠️ linked worktree 里**绝不能**安装（2026-11-09 事故级坑）。
#
# 触发链：`npm run prepush` → 建临时 worktree（$TMPDIR/boh-prepush-XXXX）→
#   `npm ci --dry-run` → npm 跑 `prepare` → 本脚本。
# 此时：worktree 与主仓**共享**同一个 .git/hooks，而 `$0` 在临时目录里，
#   SRC_DIR 于是指向临时目录 ⇒ 主仓的 pre-commit / pre-push 被改成
#   「指向临时目录」的软链 ⇒ prepush 收尾删临时目录 ⇒ 两个钩子全部断链。
# 后果是静默的：git 对断链钩子直接跳过、不报警，于是 pre-commit 的 lint-staged
#   和 pre-push 的漏配快速档**双双失效且无人知道**（本次 push 没跑 prepush
#   就是这个原因）。
# 判据：linked worktree 的 git-dir 是 `<主仓>/.git/worktrees/<名字>`，
#   而 git-common-dir 是 `<主仓>/.git` —— 两者不同即说明不是主检出。
GIT_DIR_ABS="$(git rev-parse --path-format=absolute --git-dir 2>/dev/null || echo '')"
GIT_COMMON_ABS="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo '')"
if [ -n "$GIT_DIR_ABS" ] && [ "$GIT_DIR_ABS" != "$GIT_COMMON_ABS" ]; then
  # 变量必须写 ${...}：本机 sh 在 `$VAR` 紧跟中文全角括号时会吞掉括号首字节
  # （实测输出 `（��`），花括号是唯一可靠的边界。
  echo "[install-git-hooks] 当前是 linked worktree（${GIT_DIR_ABS}），跳过："
  echo "                    共享的 .git/hooks 只应由主检出写入，否则会把它改成临时路径软链。"
  exit 0
fi

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
