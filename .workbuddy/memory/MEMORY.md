# BOHLITE 硬规则速查

> **本文件每会话常驻注入 ⇒ 必须保持精简（目标 ≤ 6KB）。** 细则进分册，**不要在这里加**。
> 每日进展见 `YYYY-MM-DD.md`；长文归档 `MEMORY-full-2026-09-29.md`。
> 🤖 **加东西之前先问一句**：这条是「每次会话都必须知道」吗？不是 ⇒ 进分册。
>
> 分册（按需读 —— **动对应领域前先读它**）：
> · `MEMORY-gates.md` —— 门禁地图 / 基线棘轮 / 写测试纪律
> · `MEMORY-css-theme.md` —— 特异性 / 液态玻璃 / 暗色 / 定位裁剪 / 布局
> · `MEMORY-routing.md` —— 路由规范 / 交互组件 / 数据口径 / 探针写法 / 过渡动效
> · `MEMORY-ops.md` —— Supabase / EF / CI / Cloud+ / 图片列 / 页游
> · `MEMORY-css-loading.md` —— 资源加载 / `__vitePreload` / CSS 自愈 / 部署竞态
> · `MEMORY-ai-config.md` —— AI 配置页 / 密钥与模型
> · `MEMORY-bohai-liquid.md` —— BOH分镜 / 液态玻璃 / BOHAI 材质地图
> · `docs/AI-ENV.md` —— **必读通道**：环境坑 10 条 + 并行会话纪律
> · `docs/gate-matrix.md` —— 门禁自证纪律 + 事故级坑记录
>
> 2026-10-31 第二次瘦身（16.5KB → 约 5KB）：CSS/主题、门禁/测试、路由/交互三段整体外置成分册。

## 开工三步

- `npm run env:doctor` —— 35 项**实测**环境自检。⚠️ 诊断档，永远 exit 0，刻意不进 verify；`--strict` 才当门禁。
- `npm run verify:fast`（约 10s）；`git status --porcelain | wc -l` 看工作区有多脏（并行会话判断依据）。
- 环境坑与并行会话纪律 → `docs/AI-ENV.md`（**别在这里再抄一份**）。

## 环境 / 工具

- 🔴 **沙箱内 `curl` 返回 `000` ≠ 外网不通**：判定「外部 API / 远端库不可达，只能靠推断」**之前**必须在沙箱外复测一次
  （2026-10-31 实证：`api.supabase.com` 沙箱内 `000`、`dangerouslyDisableSandbox` 下 `401` ⇒ 可达）。
- `supabase` CLI 已登录（ref `nplnlefdwfgtyimfkyih`），`supabase secrets list` 能查 EF 变量**名**；
  Supabase MCP 是 `supabase_read_only_user`，查表级 ACL **必须** `has_table_privilege('anon',…)` ——
  `role_table_grants where grantee='anon'` 对只读角色**返回全空**（假阴性，78 张表读成 0 张）。
- 🔴 **`grep` 是 shim（`brokered-bin/grep`）：带 `\|` 的双模式会静默返回空**（exit 1，和「真的没有」长得一样）。
  2026-10-30 实证：`grep -n "onUnmounted\|onDeactivated"` 空、单模式命中 3 处 ⇒ 误判「目录里没有 onUnmounted」。
  **交互式检索一律用 Grep 工具（rg 语法，alternation 写 `|`）**；`check:shell-grep` 只守脚本文件。
- 竖屏视觉巡检修真源 `scripts/probes/probe-portrait-visual-audit.mjs`（390×844 多档截图 + DOM 诊断 + axe 对比度，`--only=` 可筛）。

## 提交

- pre-commit 在 `.git/hooks/pre-commit`（**非 husky**；新环境 `cp scripts/git-hooks/pre-commit .git/hooks/ && chmod +x`）。
- 🔴 lint-staged 会卷进无关未暂存文件 ⇒ 每次 commit 后核对 `git show --stat HEAD`。
  误入修法：`git reset --soft HEAD~1` → `git restore --staged <侵入文件>` → 路径式 `git commit -F <msg> -- <路径…>`。
- 🔴 **`git status` 里的 ` M` 可能混着别人的在途改动** ⇒ 提交前对自己要提交的**每个**文件先 `git diff <file>` 扫一眼。
- ⚙️ lint-staged 只覆盖 `*.{js,mjs,vue,ts}` + json ⇒ 手跑 `prettier --write` **不要扫到 CSS 等其他类型**
  （仓库漂移文件多，会全文件重排带来百行级无关 churn）；CSS 改动一律手动局部编辑。
- 钩子会重排文件 ⇒ 提交前手跑同款（仅改动文件 `prettier --write` + `eslint --fix`），提交后对**提交后的树**再跑 verify。

## 三条最容易踩的

1. **样式类改动/故障的验收必须带截图肉眼过** —— 程序化差分只报 1 项时肉眼可能是大面积塌陷（详见 `MEMORY-css-theme.md`）。
2. **一切 `--update` 基线必须在提交树口径上做**，脏工作区读数会让本地/CI 差值（详见 `MEMORY-gates.md`）。
3. **`verify` 绿 ≠ `prepush` 绿**（`check:gates-self-test` 刻意不在主链）⇒ 动过基线必跑 `prepush`。
