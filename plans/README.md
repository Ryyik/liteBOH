# Animation Improvement Plans — BOHLITE

基于 emilkowalski/skills 的 `improve-animations` skill 对 BOHLITE 网站进行动效审计后生成的可执行计划。

- **审计时间**: 2026-07-19
- **审计基线 commit**: `eed9baf`
- **审计员**: GLM-5.2 + improve-animations skill
- **审计标准**: [AUDIT.md](../.agents/skills/improve-animations/AUDIT.md)

## Plans 总表

| # | 标题 | 严重度 | 类别 | 状态 | 依赖 |
|---|---|---|---|---|---|
| [001](./001-motion-tokens-and-animations-cleanup.md) | 建立 motion tokens 并修复 animations.css 的弱 easing 与 scale(0) | HIGH | Easing / Physicality / Cohesion | TODO | — |
| [002](./002-remove-transition-all-important-helper.md) | 清理 9 个 CSS 中复制粘贴的 .transition { all !important } helper | HIGH | Performance | TODO | 001 |
| [003](./003-fix-reduce-motion-keep-opacity-color.md) | 修正 reduce-motion 实现：保留 opacity/color 反馈，仅砍位移与缩放 | HIGH | Accessibility | TODO | — |
| [004](./004-fix-unified-nav-transition-all-and-bounce.md) | 修复 unified-nav.css 的 transition: all 与整页 bounce 过渡 | HIGH/MEDIUM | Performance / Physicality | TODO | 001 |
| [005](./005-add-router-view-fade-transition.md) | 路由切换加 fade 过渡 | LOW (Missed) | Missed opportunities | TODO | 001, 003 |

## 推荐执行顺序

```
                ┌─────────────┐
                │  Plan 001   │ ← 基础：建立全局 motion tokens
                │  (tokens +  │   必须最先做，其他 plan 引用 --ease-* 等 token
                │ animations) │
                └──────┬──────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Plan 002 │  │ Plan 003 │  │ Plan 004 │
  │ (清理    │  │ (reduce- │  │ (unified │
  │ transition│  │  motion) │  │  -nav)   │
  │  helper) │  │          │  │          │
  └────┬─────┘  └────┬─────┘  └──────────┘
       │             │
       └──────┬──────┘
              ▼
       ┌────────────┐
       │  Plan 005  │ ← 最后做：依赖 001 的 token 与 003 的 reduce-motion 基线
       │ (route     │
       │   fade)    │
       └────────────┘
```

**理由**：
1. **Plan 001 必须最先做**：所有其他 plan 都引用 `var(--ease-out)` / `var(--ease-emphasized)` 等 token。tokens.css 必须先在 main.js 中导入并被其他 CSS 看到。
2. **Plan 002、003、004 互相独立**，可以并行执行（修改不同文件）：
   - 002 修 9 个组件 CSS 文件
   - 003 修 6 个文件的 reduce-motion 块
   - 004 修 unified-nav.css
3. **Plan 005 最后做**：依赖 001 的 `--ease-out` token 与 003 的全局 reduce-motion 基线（路由过渡在 reduce-motion 下要缩短到 100ms）。

## 关键约束（来自 project_memory）

执行 plan 时必须遵守以下项目约束：
- **不破坏 BOHAI 工作区**：[motion-system.css](../src/views/BOHAI/BOHAI/styles/motion-system.css) 已是项目最佳实践样板，plan 001 不应修改它，只让全局 animations.css 对齐。
- **不破坏 RLS 与 API Key 配置**：本批 plan 全部为 CSS 修改，不涉及数据库或 API，无影响。
- **保留 useConfirmDialog 的统一 modal API**：[CommonAlertModal](../src/components/CommonAlertModal.vue) 已使用合理的 `cubic-bezier(0.16, 1, 0.3, 1)`，不在本批 plan 范围。
- **Vue error handling 保留**：不动 [App.vue](../src/App.vue) 的 `app.config.errorHandler`，Plan 005 只在 template 中包裹 `<Transition>`。

## 验证策略

每个 plan 完成后：
1. `npm run lint` 通过
2. `npm run build` 通过
3. `npm run dev` 后在浏览器手动执行该 plan 的 Feel check
4. 在 DevTools Rendering 面板测试 `prefers-reduced-motion: reduce` 下的行为

## 后续可选计划（未写）

以下发现未在本批生成 plan，可在第一批执行完毕后评估是否补充：
- **Finding 7** — 给主交互组件（Login/Forum/PostDetail/Profile/Home）补 `:active scale(0.97)` press feedback。影响多页面，建议分阶段。
- **Finding 9** — 给主要列表（Forum posts/Shows grid/Shop grid/Profile）加 30-80ms stagger 入场。锦上添花，BOHAI 已示范 `--bohai-item-order` CSS 变量模式。
- **Missed 2** — 成功时刻加 delight（已有 `canvas-confetti` 依赖但使用率低）。

## Reconcile（重新校准）

代码若发生变化（如其他 PR 修改了 animations.css 或 unified-nav.css），运行 `improve-animations reconcile` 重新检查 plan 是否仍准确：
- 标记已完成的 plan 为 DONE
- 刷新过时的 file:line 引用
- 退役已修复的 finding
