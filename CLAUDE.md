# CLAUDE.md

Claude Code 专用入口。项目规则本体在 [AGENTS.md](./AGENTS.md)，**请先读它**。

```
@AGENTS.md
```

补充两点 Claude 侧的事：

1. 本仓库的 `.claude/settings.local.json` 目前只 allow 了 4 条命令（`Bash(python3 *)`、`Bash(npx vite *)`、`Bash(npx eslint *)`、`Bash(git stash *)`）。要跑 `node scripts/probes/*.mjs`、`./node_modules/.bin/vitest` 之类的会被拦，需要时往 allow 里加。
2. `.git/hooks/post-commit` 和 `post-checkout` 被 Qoder 的 tracker 占用，改钩子时要小心别覆盖它。
