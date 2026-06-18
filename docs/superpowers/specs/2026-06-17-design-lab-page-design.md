# 设计实验室页面（/lab）设计文档

## 目标
在网站内新增一个常驻的「设计实验室」页面，真实对比 shadcn-vue、Naive UI、Element Plus 三家组件库在 Button / Input / Card / Dialog / Tabs / Select 六个常用组件上的视觉与交互差异，帮助团队做组件库选型。

## 技术方案
- **方案**：真实安装三家库（方案 A）。
- **Tailwind 处理**：项目原本无 Tailwind，为支持 shadcn-vue，引入 Tailwind CSS v3 + PostCSS。
- **库版本**：
  - `tailwindcss` / `postcss` / `autoprefixer`（开发依赖）
  - `shadcn-vue`：通过 CLI 初始化，按需引入 button / input / card / dialog / tabs / select
  - `naive-ui`
  - `element-plus`

## 页面结构
- 路径：`/lab`
- 布局：
  - 顶部：标题 + 简介 +「统一 BOH 主题」开关
  - 左侧边栏：组件类型导航（Button / Input / Card / Dialog / Tabs / Select）
  - 右侧主区域：三列并排展示台，分别展示 shadcn-vue / Naive UI / Element Plus 的当前组件
- 交互：
  - 点击左侧导航切换当前组件类型。
  - 所有组件真实可交互。
  - 主题开关开启时，给三家组件统一加上 BOH 品牌绿色、圆角与字体；关闭时展示各库默认风格。

## 路由与导航
- 在 `src/router/index.ts`（或合适的 routes 文件）新增 `/lab` 路由。
- 在 `UnifiedNavbar` 增加「实验室」入口。

## 文件规划
- `src/views/Lab/index.vue`：实验室主页面
- `src/views/Lab/components/`（如需）：展示台子组件
- `tailwind.config.js`、`postcss.config.js`：Tailwind 配置
- `components.json`：shadcn-vue 配置文件
- `src/components/ui/*`：shadcn-vue 组件（由 CLI 生成）

## 兼容性
- 页面仅作为内部参考入口，默认不阻塞主业务路径。
- 若某库组件样式与全局样式冲突，通过 scoped style 或 CSS 变量覆盖隔离。
