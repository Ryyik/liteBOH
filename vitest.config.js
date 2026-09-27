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
    poolOptions: {
      forks: {
        // 关键数字，别顺手调高。130 个测试文件默认按核数并发时，
        // tests/unit/project-structure.test.js 会被 CPU 争抢饿死 —— 它里面的
        // collectStructureReport() 是一次同步全仓扫描，单跑 7s，全并发下能撞到 45s 超时，
        // 表现为每次全量都红这一条。压到 2 之后不但全绿，整套还更快：
        //   maxForks=核数  144s（collect 241s，1 failed）
        //   maxForks=2     122s（collect  39s，全过）
        // 并发不是越多越好 —— CPU 密集的同步任务抢不到时间片，只是在互相拖累。
        maxForks: 2,
      },
    },
    // 兜底：万一哪天换了更强的机器或者加了更重的用例，先给宽裕的余量，
    // 而不是在每个重用例里各写一份硬编码时长。
    testTimeout: 45000,
  },
});
