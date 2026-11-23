# docs/ — 文档索引

> 仓库入口是 [AGENTS.md](../AGENTS.md)；本页只负责回答“要找哪份文档”。
>
> 2026-11-21 重组：**活文档**进 [`guides/`](guides/)，**时点报告**按月份进 [`reports/YYYY-MM/`](reports/)；
> `docs/` 根目录只保留本页与 [`未完成任务清单.md`](未完成任务清单.md)。

## 入口级

| 文档 | 什么时候读 |
| --- | --- |
| [未完成任务清单.md](未完成任务清单.md) | 接手 / 续做，先看现在有哪些半成品和下一步 |
| [guides/](guides/) | 会长期维护的规则、环境、门禁、模板与专项说明 |
| [reports/](reports/) | 审查 / 审计 / 交付 / 诊断的时点报告，写完即冻结 |
| [demos/](demos/) | 原型与视觉沙盒；根目录 demo 已于 2026-11-21 全部归拢到这里 |
| [reference/](reference/) | 第三方设计参考套件，不是产品代码 |
| [database/](database/) | 数据库 schema、策略与迁移参考 |
| [decisions/](decisions/) | 技术选型与口径定稿（目前预留，未单独收件） |

## 常用直达

- 不知道改完要跑什么：读 [`guides/gate-matrix.md`](guides/gate-matrix.md)。
- 命令行为很怪 / 开工前：读 [`guides/AI-ENV.md`](guides/AI-ENV.md)。
- 要跑浏览器探针：读 [`guides/PROBES.md`](guides/PROBES.md)。
- 要写报告 / 方案：先读 [`guides/报告模板.md`](guides/报告模板.md)。
- 拆组件、搬代码、外置 CSS：读 [`guides/重构验证协议.md`](guides/重构验证协议.md)。
- BOH AI 的视觉 / 交互规格：读 [`guides/DESIGN-Bolek.md`](guides/DESIGN-Bolek.md)。

## 维护规则

1. **活文档进 `guides/`**：会持续更新、需要长期被引用的规则与说明。
2. **时点报告进 `reports/YYYY-MM/`**：完成后冻结，不把后续结论回写进旧报告；新报告按创建月份归档。
3. **根目录不再平铺 md**：新增文档先判断是活文档还是时点报告，再落到对应目录。
4. 搬迁/改名后跑 `npm run check:doc-links`；它会抓 docs/plans/根目录的行内相对链接。