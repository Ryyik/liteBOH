# AI 开发环境须知（必读通道）

> 为什么单独有这份文件（2026-10-15 AI 环境审计的核心结论）：
>
> 环境级坑**早就被记录了**，却记在 `.workbuddy/memory/MEMORY.md` 这种**按需通道**里
> ⇒ **每个新会话都要重新踩一遍**才真正"读到"。规则放错通道 = 每条都要重踩一遍才生效。
> 所以本文把「每次会话都会踩」的规则搬进必读通道，并尽量变成**一条命令的绿灯**（`npm run env:doctor`）。
>
> 阅读顺序：先跑 `npm run env:doctor`，再读 §2（并行会话纪律）。

---

## 1. 开工三步

```bash
npm run env:doctor     # 35 项环境自检（实测，不靠平台名推断）；诊断档，永远 exit 0
npm run gate:plan      # 按本次改动路径，列出「额外要跑」的探针/命令清单（--json 可机读）
npm run verify:fast    # 6 道秒级门禁，约 10s
git status --porcelain | wc -l   # 工作区有多脏（并行会话判断依据）
# 三步并作一条：npm run session:start
```

`env:doctor` 输出 `❌` 就按它给的 `↳` 提示修；`⚠️` 是「本机如此」的事实，读一眼即可。
想要它当门禁用 `npm run env:doctor:strict`（有 `❌` 时 exit 1）。

> ⚠️ **它是诊断，不是门禁，刻意不进 `verify`。** 理由是「工具缺席」属于环境事实、
> 不是代码缺陷 —— 塞进 verify 只会变成一条永远红的假门禁。**别顺手把它接进 `verify`／`build:ci`。**

---

## 2. 并行会话纪律（**最要命的一条**）

同一个工作区可能同时有**多个 AI 会话**在改代码。这带来三条硬规则：

1. **提交只给明确路径，永远不要 `git add -A`／`git add .`／`git commit -a`。**
   工作区里随时有别人未提交的改动，一把梭就是替别人提交（而且提交信息还是你的）。
   正确形态：`git commit -F <msg> -- <路径> <路径>`。

2. **未提交的修复会被对方 git 级回滚 —— 交付后要立刻自证。**
   2026-10-11 实证：一个会话自证通过后 11 分钟，修复被另一会话的 `git restore` 抹掉。
   ⇒ 交付后**立刻** grep 一遍修复点 + 复跑守卫；不要以为「刚才绿了」就完事。

3. **跨应用同理（2026-10-16 实证）**：两个 WorkBuddy 同开一个仓库时**写只许一家**（单主），
   另一家只读；收工/中断前把「当前状态/下一步/未竟点」落进当日 memory——续做全靠它。

配套现实：

- `lint-staged` 会**卷进无关的未暂存文件**。每次 commit 后核对 `git show --stat HEAD`。
  误入的修法：`git reset --soft HEAD~1` → `git restore --staged <侵入文件>` → 路径式重新提交。
- last-write-wins：两个会话改同一文件时，后写的赢，**没有合并提示**，也不会报错。
- 棘轮是共享的：`eslint . -f json` 的 set diff 才能归因（用 `npm run lint:delta`，见 §4）。

---

## 3. 环境级坑（10 条，逐条给了正确做法）

| # | 坑 | 正确做法 | 已自动化 |
| --- | --- | --- | --- |
| 1 | `npx <tool>` 会被 **SIGTERM** | 一律用 `./node_modules/.bin/<tool>` | `env:doctor` 实测探测 |
| 2 | vite 只绑定 **IPv6** | 探针/脚本连 `http://[::1]:5173`（或启动时显式 `--host ::`） | ❌ 记在这里 |
| 3 | `nohup … &` 后台服务**随工具调用被杀** | 用托管后台任务（`run_in_background`），不要自己 detach | ❌ 记在这里 |
| 4 | safe-delete 拦「一次删 >50 文件」（跑 build 前删 `dist` 就撞它） | 跑 `vite build`／`build:ci` **之前**先 `mv dist /tmp/dist-$(date +%s)`。⚠️ 直接建会报 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，并**吐「壳样式允许清单为空」等次生 warning 误导**（真正的失败在删除那一步）；`node_modules/.vite` 同理。CI 上没有这个 shim | `env:doctor` 检查 dist 残留 |
| 5 | **PATH 上的 `grep` 是 toybox shim（既不是 BSD 也不是 GNU），`\|`、`\b`、`\s`、`\w`、`\d` 全部静默 0 命中——而且 `-E` 也救不了 `\s`** | ① 用 POSIX 类（`[[:space:]]`/`[[:alpha:]]`…）；② 复杂正则直接 `/usr/bin/grep`（系统自带的 BSD grep 反而**全功能**，`\|`/`\s`/`\b` 都支持）；③ 更复杂就用 Grep 工具（ripgrep） | `env:doctor` 实测出完整能力矩阵 |
| 6 | `github.com` HTTPS 被 **SNI 阻断** | push 走 `ssh.github.com:443`；兜底 `scripts/push-via-api.py` | `env:doctor --deep` 探测 |
| 7 | Playwright 与外层代理冲突 | 必须 `channel:'chrome'` + `--proxy-server=direct:// --proxy-bypass-list=*` | `env:doctor` 提示代理变量 |
| 8 | macOS 无 `timeout`、BSD `find` 有/无 `-newermt` 因版本而异 | 别在脚本里用 `timeout`；用 `git ls-files` 替代时间过滤 | `env:doctor` 实测探测 |
| 9 | `lint-staged` 卷进无关未暂存文件 | 提交后核对 `git show --stat HEAD`（见 §2） | ❌ 记在这里 |
| 10 | ~~**deno 本地装不了**~~（2026-10-16 复核：可装） | `deno check` 本地可预验 EF（dl.deno.land 直下）；CI 门禁照旧 | ❌ |

> ⚠️ **一条最重要的"本机事实"**：你 shell 里的 `grep` / `sed` / `find` 是 **WorkBuddy CLI 的
> toybox shim**（`command -v` 会指到 `brokered-bin/codebuddy-toybox-dispatch`），**既不是 BSD
> 也不是 GNU** —— CLI 约定像 GNU（`sed -i` **不要**后缀），但正则/选项集小得多；系统的
> `/usr/bin/grep` / `/usr/bin/sed` 才是 BSD 系（`sed -i` **要**后缀）。
> **这两条方向相反**，所以别背"BSD 要后缀"这种口诀 —— 一律跑 `npm run env:doctor` 看实测矩阵。

补充（同属"本机事实"，一并记下）：

- **`date -d` 不存在**（取时间戳用 `date -v` 或直接交给 shell 算）。
- `/tmp` 下的一次性 ESM 脚本**引不到仓库依赖** ⇒ 用 `createRequire('<repo>/package.json')`，或把脚本放仓库根（用完删）。
- 探针 `page.evaluate(fn)` **只序列化函数体** ⇒ 闭包依赖必须作为**参数**传进去。
- node 22 的 `globalThis.navigator` 是**只读**的 ⇒ 要 mock 得走 `Object.defineProperty`。
- **探针里伪造登录**：等 `#app.__vue_app__` 出现后改 `pinia.state.value.auth`（**不要**种 `sb-*-auth-token`）。
- **看 CI**：`gh run watch <id> --exit-status` —— `--exit-status` 才能让脚本按结论退码。

---

## 4. 门禁反馈链与棘轮归因

`verify` 全链 = 12 道 check(≈10s) + lint(≈25s) + type-check(≈58s) + test(≈3min) + 棘轮总账，
合计 **4~5 分钟**；`verify:full` 再加构建与产物门禁，**10 分钟量级**。
所以：小改用 `verify:fast`（≈10s），别每次全量。

**lint 棘轮是全局计数**（`--max-warnings 116`，见 `package.json`），它 exit 1 时**不告诉你是谁加的**。
归因用这条命令，别再造手工 set diff：

```bash
npm run lint:delta     # 变更文件 vs HEAD 的警告差集 + 距上限还有几格
npm run lint:delta -- --all   # 只看当前全量聚合
```

它的做法值得知道：**「HEAD」那一侧是用 `git show HEAD:<path>` 喂给
`eslint --stdin --stdin-filename <原相对路径>` 得到的**，因此
**完全不碰你的工作区** —— 与并行会话同工作区时这点是硬要求
（`git stash` 会把别人未提交的改动一起动掉，本仓库出过这类事故）。

---

## 5. 相关脚本索引（2026-10-15 新增）

| 命令 | 作用 | 定位 |
| --- | --- | --- |
| `npm run env:doctor` | 35 项环境自检（实测） | 诊断，永远 exit 0 |
| `npm run gate:plan` | 改动路径 → 额外要跑什么（真源 `scripts/lib/gate-map.json`） | 诊断，永远 exit 0 |
| `npm run session:start` | env:doctor + verify:fast 并一条 | 诊断 |
| `npm run env:doctor:strict` | 有 ❌ 时 exit 1 | 门禁（预检脚本用） |
| `npm run lint:delta` | lint 警告差集归因 | 诊断 |
| `npm run check:root-clean` | 根目录沙盒棘轮（新增即红） | **门禁**，在 verify 链内 |
| `npm run check:doc-truth` | AGENTS.md 关键数字对账 + 必读面字节棘轮 | **门禁**，在 verify 链内 |
| `npm run clean:screenshots --keep-days=7` | `debug-screenshots/` 轮转 | 维护 |
| `npm run check:gates-self-test` | 证明每道门禁真的会红 | 门禁自检（勿进主链） |

---

## 6. 工作区迁移注记

项目在 macOS TCC 保护区（`~/Documents/`）、AI 工具箱在 `~/WorkBuddy/` ⇒ 每个新会话都要跨目录 + 一次授权；
根治法：把项目挪出保护区（或给终端预授权）。

## 7. 沙箱命令规则（schema 已确认，2026-10-15）

WorkBuddy 的「设置 → 安全中心 → 命令安全」背后是 `~/.workbuddy/settings.json` 的
`sandbox.orderedRules.command.rules`（JSON 数组）。**规则结构是从渲染器源码确认的，不是猜的**：

```json
{ "id": "...", "source": "user", "prefix": "git push", "action": "ask" }
```

- `prefix` ＝ **可执行名 + 参数前缀**（如 `git push`），按数组顺序自上而下匹配；只取可执行名最后一段路径。
- `action` ∈ `allow / ask / deny`。
- ⚠️ **它只做前缀匹配，不做正则/条件** ⇒ **拦不住「grep 且不带 -E」这类**（`deny grep` 会堵死所有 grep、
  `ask grep` 每条命令都弹确认，都不可用）。grep 静默失败坑的拦截层是 §3 的能力矩阵 + `check:shell-grep` 门禁。
- 它适合拦的是**整类命令**：`deny "rm -rf /"`、`ask "git push"`、`ask "npm publish"` 这类。
  要加就经 UI 加（保证 schema 正确）；想批量自动化时，先在 UI 建一条再从 settings.json 回读真实形状。
