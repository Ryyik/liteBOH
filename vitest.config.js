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
    // 兜底：万一哪天换了更强的机器或者加了更重的用例，先给宽裕的余量，
    // 而不是在每个重用例里各写一份硬编码时长。
    testTimeout: 45000,
  },
});
