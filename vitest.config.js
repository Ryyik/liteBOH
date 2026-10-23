import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    // forks 而非默认的 threads：记忆 Volume 里的 130 个文件在 threads 池下会出现卡顿与偶发假死，
    // forks 是隔离更好的那一档（CI 上同理）。
    pool: 'forks',
    // ⚠️⚠️ 这里曾是 `maxForks: 2` —— vitest 5 里是**未知选项，被静默忽略**（v3 起改名 maxWorkers，
    // 未知键不做校验、不报错）。归因用的是一对**睡眠探针对照实验**（2026-10-15，6 个各睡 8s 的文件）：
    //   maxForks: 2  → 15.7s  ⇒ 6 个文件全并发，限流失效
    //   maxWorkers: 2 → 31.7s ⇒ 3 批 × 8s，限流生效
    // 失效的代价：project-structure.test.js 的同步全仓扫描被 CPU 争抢饿死 ⇒ 撞 45s 超时，
    // 全量 1 failed（2026-09-28 首次记录、2026-10-15 复现）。配套把 collectStructureReport
    // 的 src 读两遍合并成单遍（17s → 9.1s，报告逐条一致），双保险。
    // 经验两条：① 「限流失效」不会报错，只会让最重的用例偶发红；② summary 的
    // 「N workers spawned」数的是**隔离体**（每文件一个），不是并发数 —— 别拿它当限流证据。
    maxWorkers: 2,
    // ⚠️ 2026-10-23 实测：想靠 `isolate: false` 省掉「每文件重启 worker」的开销，**这条路在本仓走不通**。
    // 背景数字：全量 250 文件在 M4/16GB 上 maxWorkers:2 要 132s，其中 250 个隔离体各花 ~1.64s 启动
    // （vitest 自己报的 ~66s），把 maxWorkers 提到 6 也只从 132s → 111s（瓶颈是隔离开销不是并行度）。
    // 于是试了 --no-isolate：**248 / 250 个文件直接红**，报错集中在 tests/integration/*，
    // 表现为 `TypeError: Cannot read properties of undefined (reading 'select')` —— 上一个文件里
    // 建好的 supabase client mock 被下一个文件当成已被拆除。单文件跑 --no-isolate 是绿的，
    // 说明不是配置错，是**这套测试的 mock 生命周期依赖「每文件一个干净模块图」**。
    // 结论：隔离是刚需，别再试 isolate:false / 减小 worker 启动开销这条线；要提速只能减少文件数或单文件耗时。
    // 兜底：万一哪天换了更强的机器或者加了更重的用例，先给宽裕的余量，
    // 而不是在每个重用例里各写一份硬编码时长。
    testTimeout: 45000,
  },
});
