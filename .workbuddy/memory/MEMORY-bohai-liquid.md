# BOHLITE 分册规则：BOH分镜 / 液态玻璃 / BOHAI 材质地图

> 主文件是 `MEMORY.md`（常驻注入）。本册**按需读取** ——
> 动「BOH分镜 / 液态玻璃观感 / BOHAI 输入区材质 / 折射级覆盖层」时先读这里。
> 2026-10-13 / 10-14 / 10-15 实测记录，数字均有物证；当日细节见同名日期日志。

## 新增工具（2026-10-15 AI 环境审计落地）

> ⚠️ 这几条同时也在 `docs/AI-ENV.md`（必读通道）与 `AGENTS.md` §5；
> 这里只留"别改坏什么"，避免又造第二份真源。

- 开工先跑 `npm run env:doctor`（30 项**实测**自检）。⚠️ **诊断档，永远 exit 0，刻意不进 verify**；`--strict` 才当门禁。
- lint 棘轮红了用 `npm run lint:delta`（**别手工 set diff**）。两条设计别改坏：
  `HEAD` 侧走 `git show` + `eslint --stdin --stdin-filename`（**不碰工作区**，`git stash` 会动并行会话的改动）；
  基线侧并发 6 + 剪枝（5m56s → 1m05s，`--full` 才全量）。
- `check:root-clean`（`verify` 链内）：根目录沙盒棘轮，冻结 25 html + 3 临时脚本，新增即红。
  落点 `docs/demos/`，归拢后 `check:root-clean:update` 降基线。
- ⚠️ **判据必须连带单位**：审计报告称「AGENTS.md 3 行超 2000 字符被截断」是**错的** ——
  macOS `awk length` 按**字节**算，那三行 2406 字节 / 1326 字符，**从未截断**。一个 `length` 就能编出一条结论。
- ⚠️ 实测坑复现：新脚本 import 了没用到的符号 ⇒ lint 立刻 117/116 超棘轮。**新脚本落地后先跑一次 `lint:delta`。**

## BOH分镜（2026-10-13 起，进行中）

- 定义（用户定）：视频拍摄脚本编辑器，**支持 AI 生成或手写，可导出**，要能嵌进网页。
  原型 `boh-fenjing-demo.html`（仓库根，单文件零依赖，同 ai-config-demo 惯例）。
- 生态结论：网页端同类**全是 React，无一可直接集成**（Vue 无现成货）。
  可抄：openframe（MIT，10 个景别 SVG 已移植）；
  禁抄：OpenShotDesigner / mediastory（GPL）、youmedhub / storyboarder（**无 license**）。
  剪映草稿导出 **JS 侧无成熟库**（生态全在 Python/C#/Java）。
- 拟落点：Vue 3 组件 + Supabase，AI 走现有模型配置通道；
  导出链 ＝ 项目 JSON 单一真源 → CSV / PDF / Markdown 派生。
  用户问过「是否按 React 重写」——结论：**不重写**（能抄到的 React 代码量极小，等于零收益、全量成本）。

## 液态玻璃

- **不是 React 专属**。用户已选型 **`@wxperia/liquid-glass-vue`**（MIT；实拍 demo ＝ `demo-wxperia-liquid.html`，
  16 项探针全绿，含透明度/磨砂滑杆）。⚠️ 集成五坑（详见 2026-10-13 日志）：
  1. 默认导出是插件 ⇒ 要用命名导出 `{ LiquidGlass }`；
  2. 浮层式定位（必须传 `style`）；
  3. 玻璃紧贴内容尺寸；
  4. shader worker 绝对路径需拷 `public/assets/`（仅 shader 模式用）；
  5. **模糊公式 `blur = (overLight?12:4) + blurAmount×32` px**，阅读面建议 0.4~0.5、装饰按钮 0.1~0.25；
     **透明度 ＝ 内容层白膜 α（默认 0.12，≥0.40 切深字）**。
- 另一备选 `liquid-web`（MIT、跨框架、可内联）。
- **Beta7 交付配方（含滑杆口径与六条清单）＝ `docs/未完成任务清单.md` §21。**

## BOHAI 材料地图（2026-10-14 盘点）

- **已有 CSS 液态玻璃「一组材质、六个消费者」**（`boh-composer.css:913-939` + `boh-stream.css:886-902`；
  材质单源 `--liquid-filter-sm`，颜色 `--boh-glass-*` 成对）；侧栏/工作台/气泡/代码块**保持实心是设计口径**。
- 折射级（WXperia）**已落地进 src/**（2026-10-14：`BohGlassRefract.vue` 覆盖层组件 + 输入框/模型/工具三处，
  `probe-bohai-glass.mjs` 19 项全绿；`.boh-main` z-index 已让位、菜单 z 40→20-22；
  **用户透明度滑杆已落 设置→外观**（`glassOpacity` 偏好持久化）。
- ⚠️ **官方样貌单源 ＝ `src/config/liquid-glass-spec.js`**
  （2026-10-14 两次「白底玻璃隐形」事故——本会话 + 并行会话各一次——后建立：
  厚膜 + 撤投影是死因；改观感只改 spec + 跑 `bohai-glass-look-spec` 守卫；
  参数已对齐官方 demo：blur 0.4 / 位移 70 / 白膜默认 0.25，唯一有意分歧 `elasticity=0`）。
- ⚠️ **采样根硬约束**：玻璃祖先链上的任何堆叠上下文（z-index / isolation / opacity / filter / transform）
  都会降级或灭掉模糊 —— **真实代码 `.boh-main{z-index:1}` 接线时必改**（菜单 z 40→20 保抽屉层级）；
  堆叠 A/B 必须**整页重建**（运行时切换不复合）；elasticity 必须 0；
  overlay 结构 + `glassSize:{width:'100%'}` 可让 autogrow 零 JS 跟随。详见 `docs/未完成任务清单.md` §21.7。
