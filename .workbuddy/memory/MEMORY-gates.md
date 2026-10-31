# 门禁 / 测试 —— 分册

> 从 `MEMORY.md` 外置（2026-10-31）。**改门禁 / 加测试 / 调基线前读它。** 主索引见 `MEMORY.md`。

## 门禁地图

- `npm run verify` 一条兜底（**12 道 check → lint → type-check → test → 棘轮总账**，2026-10-15 起 fail-fast：最贵的排最后）；发布前 `verify:full`。
- **`npm run gate:plan`**：改了什么 → 额外要跑什么，一条命令（映射真源 `scripts/lib/gate-map.json`；verify 永远兜底）。**别再通读表格做关键词匹配。**
- **`npm run check:doc-truth`**（verify 链内）：AGENTS.md 关键数字与实测对账 + 必读面字节棘轮。文档数字写错/过时当场红 —— 别手改估计值。
- **`npm run prepush`**：推送前对 HEAD 的干净 worktree 跑全部门禁 + `npm ci --dry-run`。**推送前必跑** —— 它专抓「本地绿 = 工作区绿、CI 红 = 提交树红」四兄弟：没提交的门禁/基线/lock 配套、先行入库的半成品测试。`--full` 加跑 lint/type-check/test。
- `npm run session:start` ＝ env:doctor + verify:fast。

## 基线 / 棘轮

- ⚠️ **基线校准（一切 `--update`）必须在提交树口径上做**：脏工作区的读数含未提交的清理/新增，本地/CI 会差（实测同 commit 2701 vs 2706）。
- ⚠️ doc-truth 计数口径 = `git ls-tree HEAD`（提交树恒定）；文件系统口径随「谁在改什么」漂移。
- 新增门禁必须在 `scripts/lib/gate-fixtures.mjs` 加样本，否则 `check:gates-self-test` 列未覆盖；棘轮 baseline 只许下调 ——
  **上调＝凭空造余量**：注入样本（暗色样本只有 +1）落在余量内 ⇒ 棘轮不再判红 ⇒ 自检当场报「假绿嫌疑」
  （2026-10-27 实证：dark-tokens 误写 2518 / 实测 2465，余量 53 把这道门禁废掉）。
- ⚠️ **`check:gates-self-test` 刻意不在 `verify` 主链**（`docs/AI-ENV.md`「勿进主链」）⇒ **verify 绿 ≠ prepush 绿**。
  动过棘轮基线的一律跑 `npm run prepush`（它跑在 HEAD 干净检出上，故修正必须先提交才会变绿）。
- ⚠️ `check:layering` 棘轮盯**三类出口**（`supabase.from` / `rpc` / `functions.invoke`），不只 from ——
  视图加一个 `functions.invoke` 也会红（2026-10-17 实证两连红）；收口到 `src/utils/api/*` 后**必须
  `--update` 同步下调基线**，否则 gates-self-test 注入样本落在基线内 ⇒ 假绿被自检当场抓（实证）。
- `security:audit` **按变更域分档**（判定纯函数 `scripts/lib/audit-scope.mjs`）：改了 `package.json`/lock 才阻断，
  否则 `--advisory` 只告警 —— 判据是 npm 公告库这种**外部时间线**（同一份 lock 昨天绿今天红），一律阻断只会教人无视门禁。
  新公告由 `.github/workflows/audit-scheduled.yml`（每日 09:07 严格档）开 issue 兜底。护栏 `dependency-audit-scope.test.js`。
- lint 带 `--max-warnings` 棘轮（**以 package.json 现值为准**，2026-10-15 = 116）⇒ 报绿必须同时报警告条数
  （口径 `eslint . -f json`）；计数归零才翻 error；上调必走 commit message。**红了用 `npm run lint:delta` 归因。**

## 写测试的纪律

- 源码守卫：两边过**同一个** `tests/helpers/source.js` 归一函数；否定断言先 `scriptSection()` + `stripComments()`。
- ⚠️ 「找不到元素就跳过」＝假绿温床 ⇒ 找不到就 **fail**；「模板里有 X」是没牙断言 ⇒ 给产物打 `data-*` 钩子按 id 对齐断言；
  反证**只撤单点**（撤两处会中途崩）。
- 数据管理面板表格类 tab：`query-config.js` 六张查询地图缺任一（尤其 `TAB_SELECT_COLUMNS`）＝**静默空列表、连请求都不发**
  （2026-10-16 活动报名明细事故）⇒ 新增 tab 必须补齐；护栏 `tests/unit/data-admin-tab-config-coverage.test.js`。
- ⚠️ 源码守卫禁写格式化敏感的连续子串（lint-staged 重排 57 文件令 `tabIds: [ 'x'` 字面量断言假红）
  ⇒ 按**数组项 / 正则宽容**断言。

## 已修 / 已删的过时规则

- ✅ ~~满载跑 verify 偶发 `project-structure.test.js` 45s 超时~~ **已修（2026-10-15）**：根因是
  `maxForks: 2` 在 vitest 5 是未知选项被**静默忽略**（正名 `maxWorkers`）+ src 双读合并单遍。
  通用教训：**未知配置项静默忽略，「限流失效」的唯一表现是最重用例偶发红；summary 的「N workers spawned」数的是隔离体不是并发数，别拿它当限流证据。**
- ⛔ 已删：「project-structure 满载抖动 ⇒ 判红先单跑」—— 已修到根，这条过时规则不再适用。
