# docs/reference/ — 外部设计参考稿

这里放**不是本项目产品代码**、但设计/动效实现时要对照的第三方套件。它们不参与构建，也不应被
Prettier/ESLint 扫描；`.prettierignore` 按目录整体排除。

| 目录 | 来源 | 用途 |
| --- | --- | --- |
| `apple-style/` | Apple 设计语言参考套件 | 间距、材质、按钮与导航的对照 |
| `claude-style/` | Claude 设计语言参考套件 | 排版、色板与交互密度对照 |
| `golden-time-style/` | Golden Time 设计语言参考套件 | 侧栏、表格与数据面板对照 |
| `google-style/` | Google 设计语言参考套件 | 组件、图表与信息层级对照 |

## 规则

- 这些目录是**参考资料**，不是可复用组件库；不要把产品代码 import 进来。
- 需要新增参考套件时放本目录，目录名用小写连字符（不要空格），并同步 `.prettierignore`。
- 历史报告里出现的 `Apple Style/` 等根目录路径是当时的记录，不回写历史日志。