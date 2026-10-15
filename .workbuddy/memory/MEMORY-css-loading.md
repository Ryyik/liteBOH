# BOHLITE 分册规则：资源加载 / __vitePreload / CSS 自愈
> 主文件是 `MEMORY.md`（常驻注入）。本册按需读取 —— 动「动态 CSS / 路由级样式 / 自愈链 / 部署竞态」时先读这里。
> 2026-10-13 实测记录，全部数字有物证；细节长文见当日 `2026-10-13.md`。

## 机制事实（先读懂这个再动手）
- `cssCodeSplit:true` ⇒ **路由级 CSS（含 SFC scoped、`<style src>`）不在 index.html 里**，由路由 chunk 的 JS 经 `__vitePreload` 建 `<link>` 注入；SW 只预缓存 index.html 引用的 2 个壳 CSS，其余走 runtimeCaching `/static/css/` CacheFirst。
- ⚠️ **助手时序（dist 内核实）**：**并发建 link → 全 settle → 依次 reportError 每个 rejected → 最后才 `loadModule()`**。`reportError` 没人 `preventDefault` 就 **throw**，那一步在 `.then` 里 ⇒ **整条链 reject、`loadModule()` 永不执行** ⇒ 一条 CSS 404 能炸掉整个路由 chunk 的 `import()`（表现为「点底栏毫无反应、导航被吞」）。CSS 失败必须无条件吞（`utils/vite-preload-recovery.js` 的 `shouldSwallowPreloadError`），JS chunk 失败才维持上抛。
- ⚠️ **去重表 `i[url]` 在 fetch 完成前写入** ⇒ 失败后同会话再 `import` 同一文件**直接 resolve、永不重建 link**（「切走再切回」是假重试）⇒ 页内重试只能**摘旧 link 用同一 href 重建**（`async-loaders.js` 的 `reloadProfileStyleLink`，现已收口到 style-load-guard）。
- ⚠️ **`__vitePreload` 给 CSS link 带 `crossOrigin`** ⇒ 失败/过渡态 sheet 读 `cssRules` 抛 SecurityError（`link.sheet` 的**取值本身**也会抛，try 必须包住它）；按规则数判活必须包 try（读不到＝未生效）。健康 link 实测可读（profile-base 224 条）。
- 全局恢复链预算有限：`vite:preloadError` 有 30s sessionStorage 冷却（`boh_vite_preload_reload_ts`），index.html 的 link-error 监听有 `bohAssetRecovery` 一次性护栏 ⇒ 一次会话只够救一两次，**别把持久故障的兜底全押在它上面**。

## 单一真源（写新代码前必读）
- ⚠️ **动态 CSS 的失败兜底只有一个实现处**：`src/utils/style-load-guard.js`（`isStyleLinkApplied` / `findStyleLink` / `reloadStyleLink` / `repairStyleLinks` / `createBoundedRepairLoop` / `createStyleSheetGuard`；判活读 cssRules 包 try / 摘旧 link 同一 href 重建 / 有限退避 + 修好即停 + 离开即停）。新页面要兜动态 CSS 就 `createStyleSheetGuard({ matchers, delays, isActive })`，**不要再写一份**，守卫 `tests/unit/style-load-guard.test.js` 会拦「本地自建 link / 自读 cssRules」。已接入：profile 三样式（`async-loaders.js`）、暗色主题 8 个 CSS（`theme-css-loader.js`）。
- ⚠️ `theme-css-loader.js` 曾把 `loadedThemeSet = theme` 写在 `await` **之前** ⇒ 8 个暗色 CSS 一次失败就永不重试（且调用点全 `.catch(() => {})` ⇒ 静默停在「半暗」）。已修：**`loadedThemeSet` 只在复核通过后落位**；matcher 由 `DARK_THEME_CSS` 的 key 派生（不另抄一份正则）。
- ⚠️ 异步组件统一走工厂 **`createPanelAsync(loader, { label })`**（`src/utils/async-component.js`）：delay 120 / timeout 20s / 退避重试 2 次（300/600ms）/ 失败上报 `async_component_failure` / **内联样式**错误卡（不依赖任何 CSS）。**裸 `defineAsyncComponent` 已清零**（24→0），门禁 `check:async-component-fallback` 台账归零 ⇒ 新增一处即红；替换时**不要**再手写第二份。
- ⚠️ 「先裸后穿」就绪门：`UserSpaceMain.vue` 的 `.content-home-host` 带 `:data-styles-ready`，scoped CSS 未就绪时 `visibility:hidden`；放行两条路 = `areProfileStylesApplied()` 或 **1000ms 超时兜底**（不能永久空白）。判就绪**必须**用 `guard.areApplied()`，`repairNow()===0` 会误判（「link 尚未建出」也是 0）。

## 探针与验收
- 复现/验收探针 `probe:css-failure`（五段：基线差分 / 持续失败 / 路由 CSS 失败 / 恢复链限流下的自愈 / 暗色主题自愈）。判据用**自校准差分**（先采健康基线再逐属性 diff），写死属性值会被层叠覆盖坑。
- 视觉留证探针 `probe:css-visual`（`scripts/probes/probe-css-visual-check.mjs`）：五态截图（健康我的页 / 健康成员页 / 故障我的页 / 故障成员页 / 自愈后）+ 场景 F 就绪门验收；`deviceScaleFactor:2`、`serviceWorkers:'block'`；输出默认 `/tmp/css-visual-<ts>`；有 violation 时 exit 1。
- ⚠️⚠️ **程序化差分判据会严重低估视觉故障（2026-10-13 截图实测）**：我的页三 CSS 全失败时 `getComputedStyle` 差分只报 **1 项**，肉眼却是**大面积塌陷**；成员页路由 CSS 失败时差分只报 4 项，肉眼是**整页被巨型黑色 loading 圆环占满 + 隐藏的 `<input type=file>` 露出**。**结论：样式类改动/故障的验收必须带截图肉眼过，采样点不能替代视觉。**
- ⚠️ 探针 `page.evaluate(fn)` **只序列化函数体**：闭包里的模块级变量在页面里不存在（踩过 `DARK_THEME_KEYS is not defined`）⇒ 依赖一律作为**参数**传进去。
- ⚠️ 探针起服务**不能 `(… &)` 脱离**（老坑复现：curl 刚 200、下条 ECONNREFUSED）⇒ 必须走托管后台任务。
- ⚠️ 探针基线的采样点若依赖条件渲染（`.community-page-grid` 只在点开「成员」页签后出现），基线必须先走到那个状态，否则基线全 null、差分退化成没牙断言。

## 可观测
- 出口 `monitoring.js` 的 `reportEvent(type, payload)`（端点**惰性读取**，未配 `VITE_MONITORING_ENDPOINT` 时静默返回 false ⇒ 线上没配就等于没上报，改前先确认）。已接信号：`css_load_failure`（按资源名去重）、`style_repair_giveup`（scope profile / dark-theme，「有 load_failure 无 giveup」＝自愈成功，成对看才有意义）。

## 部署竞态
- 对策：**已知有新构建时，在「用户本来就要换页的那一拍」先整页切构建**（`version-checker.applyPendingUpdateBeforeNavigation` + `router/index.ts` 的 beforeEach 最前面 `next(false)`）；防循环靠 `boh_version_reload_target`（同一 buildId 只试一次）。验收探针 `probe-update-on-navigation`、`probe-version-update-click`。
- ⚠️ **别再提「SW 导航改 NetworkFirst」**（2026-10-13 评估后撤回）：旧 SW 用旧预缓存 index.html 应答导航已由 `version-checker.forceCleanAndReload`（等新 SW 接管 / 否则注销 SW + 清缓存）正面处理，且 `dismantleServiceWorkers` 的兜底**依赖** NavigationRoute「预缓存未命中回落网络」行为 —— 关掉 `navigateFallback` 会动摇它。
- GitHub Pages 是 `upload-pages-artifact` + `deploy-pages` **全量替换** ⇒ 旧 hash 必然 404（部署竞态根因）。deploy.yml 保留上一版 static 与否**待用户拍板**（体积翻倍）。

## 坑（写测试/门禁时）
- ⚠️ 棘轮名 ≤20 字符（`check-ratchet-summary` 列宽 20，超了整张表歪）。
- node 22 `globalThis.navigator` 只读 ⇒ 测试用 `Object.defineProperty`。
- `import.meta.env` 在模块顶层读取 ⇒ 想用 `vi.stubEnv` 驱动真行为就得**惰性读取**。
- lint 的 `--max-warnings` 棘轮对**新增未用变量**当场红（探针里多一个变量即 116→117 失败）。
