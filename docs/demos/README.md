# docs/demos/ — 原型与视觉沙盒的落点

## 为什么有这个目录

`AGENTS.md` §6 一直写着「不要往仓库根目录新增 `xxx-demo.html`」，
但这条规则**过去没有牙** —— 没有门禁、也没有指定的归拢目录，
所以每次做视觉沙盒都会"顺手放根目录"。2026-10-15 复核时根目录已经堆了 **25 个 html**。

现在两件事同时有了：

1. **门禁**：`npm run check:root-clean`（在 `verify` 链内）把根目录 html 基线冻结为 **0**
   （22 个存量已于 2026-11-21 全部归拢到本目录），只剩 3 个临时脚本；**新增即红**。
2. **落点**：就是这里。

## 2026-11-21 根目录归拢

根目录 22 个 demo html 已全部迁入本目录（清单见 `scripts/root-clean-baseline.json`，基线已同步降为
0 个 html + 3 个临时脚本）。其中 `ai-config-demo.html`、`join-wizard-demo.html` 原本用相对路径引
`src/assets/images/main1-1280.webp`，迁移后已改为 `../../src/assets/images/main1-1280.webp`：
**这两个文件不是严格单文件零依赖**，以后改名/再迁移时要一起检查。

## 已迁入（2026-10-15）

- `boh-fenjing-demo.html`（BOH分镜原型）· `demo-bohai-glass-refract.html` · `demo-wxperia-liquid.html`
  —— 原在仓库根，随全量入库迁到这里（单文件零依赖，直接打开可用）。
- `boot-timeout-fallback-demo.html` · `demo-data-admin-cf-layout.html`
- **`beta7-plan-vs-reality.html`**（2026-10-19 新增）—— Beta7 计划 vs 现状差异看板。
  数据全部来自 `plans/029-beta7-app-shell.md` 的四轮实测（§2.5 HIG 15 检查点 / §2.6 Glass 实测 /
  §2.7–2.9 Apple 五张脸对照 / D1–D8 / 7 阶段 / 13 决策 / 17 探针 15 门禁 / 11 风险）。
  **每个数字都带判据命令，可原样重跑。** 单文件零依赖，含 `prefers-color-scheme` 适配。
- **`bohai-portrait-audit.mjs`**（2026-10-21 新增）—— BOHAI 竖屏模式选择体检脚本，A–I 九组
  （四档菜单几何 / 触屏热区 / 竖屏 hover 卡 / 软键盘 / Esc / 游客锁态 / 设置页口径 / RPC 失败态 / 岛形态）。
  **刻意不做断言** ⇒ 它是诊断脚本不是探针，所以放这里、不进 `scripts/probes/` 的探针计数
  （`AGENTS.md` 的「198 个 probes」由 `check:doc-truth` 按 `git ls-tree HEAD` 对账，加进去要同步改文档）。
  方案落地后应转成带断言的 `scripts/probes/probe-bohai-mode-sheet.mjs`（见 `plans/031` §5）。
  ⚠️ 它跑真实 RPC（不 mock 模式表）：实测 RPC 0.6–9.6s 抖动，脚本已用「等骨架消失 + 行出现」重试，
  但偶发单节数据缺失时会在日志里打 `⚠️ 模式菜单未在 36s 内出现行`，不是脚本坏了。
- **`portrait-adaptive-audit.mjs`**（2026-10-22 新增）—— 竖屏「全宽布局 + 加载提示」体检脚本，
  22 个页面 × 两个场景（正常网络量宽度 / 只延迟 `/rest/v1/**` 与 `/rpc/**` 15s 量加载指示）。
  同样**不做断言** ⇒ 诊断脚本，不进探针计数。产出 `debug-screenshots/portrait-adaptive-<日期>/`。
  ⚠️ 真值来源是 pinia 注入的伪会话，`getCurrentUser()` 为 null ⇒ 依赖真实会话的页面
  （消息/概览/资产/礼物/咖啡馆）慢网结论**不可信**，只采信公开页与代码层证据。
  结论见 `docs/2026-10-22-竖屏全宽与加载提示洞察.md`；修复后应补 `check()` 断言再迁进 `scripts/probes/`。
- **`w1-island-overlap.mjs`**（2026-10-22 新增）—— 量「导航岛展开时是否压住 uspace 顶部内容」。
  同页面两个场景对照（首次访问弹引导 / 已看过引导），输出岛面、通知卡、tabs、封面的 rect 与间距。
  用途是**证伪**：洞察报告 W1 原判 P1「页面没给导航岛留安全区」，实测折叠态间距 24px / 77px 完全正常，
  被切的那行字是灵动岛通知卡的标题 ⇒ 改判 P3。⚠️ 前置的 dev server 要用 `localhost` 不要 `127.0.0.1`
  （vite 默认只绑 IPv6，IPv4 会拿到代理的 502）。
- **`request-timeout-audit.mjs`**（2026-10-22 新增）—— 量「数据面挂起时页面多久给出出口」。
  两种模式：`--mode=hang`（请求真挂 N 秒，找永不 settle 的链路）/ `--mode=abort`（等价于超时已触发，
  量错误链路本身的落点）。用途同样是**证伪**：洞察报告 L1 原判 P1「全仓没有超时、骨架永久转」，
  实测超时在 client 层（读 8s / 写 15s / EF 180s，2026-05 起），`/shop` 8.7s 落兜底 ⇒ 改判 P3。
  ⚠️ 原文的取样点是 4s，早于超时点 —— **量超时行为时，观察窗口必须长于超时本身**，否则量到的是「还没到点」。

- **`mascot-launch-demo.html`**（2026-11-05 新增）—— 吉祥物单品页视觉沙盒（对标 Apple 单品页）。
  ⚠️ **它不是单文件零依赖**：页面用相对路径引 `mascot-refs/product/web/*.webp`（6 张成品图，
  1.3MB，一起入库在本目录下）。原始扒站截图与抠图中间产物仍在根目录 `mascot-refs/`（已 gitignore），
  两者目录名相同但互不影响 —— 迁移/改名时别只搬 html。

## 放什么

| 类型 | 放哪 |
| --- | --- |
| **长期保留**的原型 / 视觉沙盒 / 单文件零依赖 demo | **本目录** |
| 一次性复现脚本 | 用完即删；要留就放 `scripts/probes/` 并起明确的名字 |
| 浏览器探针（会进 CI / 会长期维护） | `scripts/probes/*.mjs` |
| 构建/扫描产物 | `output/`（已 gitignore） |

## 根目录存量怎么办

根目录 html 基线已在 2026-11-21 清零；**以后新增视觉沙盒直接放本目录**，不要再放仓库根。
门禁仍保留 3 个历史临时脚本的基线，新增临时脚本同样会红。

```bash
git mv some-demo.html docs/demos/          # 如果确实还有遗漏
npm run check:root-clean:update            # 下调基线（下调永远是好方向，不用交代）
```

> ⚠️ 注意：大部分 demo 是单文件零依赖的（内联样式与脚本），直接 `git mv` 即可，不参与构建。
> 但 `ai-config-demo.html` / `join-wizard-demo.html` 依赖 `../../src/assets/images/...`，
> 再迁移时必须同步相对路径；其他 demo 若新加相对资源，也先打开确认一眼。
