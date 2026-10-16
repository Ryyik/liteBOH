# CLAUDE.md

Claude Code 专用入口。项目规则本体在 [AGENTS.md](./AGENTS.md)，**请先读它**。

```
@AGENTS.md
```

补充两点 Claude 侧的事：

1. `.claude/settings.local.json` 是**本机文件**（已被全局 gitignore，不入库；allow 列表 2026-10-16 已按常用工作集扩充：`Bash(node scripts/*)`、`Bash(./node_modules/.bin/*)`、`Bash(gh run *)`、git 只读类等）。缺什么往里加；**别 allow `git push` / `supabase functions deploy` 这类外发/破坏性操作**。
2. `.git/hooks/post-commit` 和 `post-checkout` 被 Qoder 的 tracker 占用，改钩子时要小心别覆盖它。
