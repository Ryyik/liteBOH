import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/source.js';

/* 共享 composable 的「有消费方」守卫（2026-11-23，plans/045 阶段 1 · 僵尸 composable 处置）

   起因：2026-10 的死代码审计把 8 个 composable 报成「零外部消费、要么接入要么删除」。
   逐个复核发现 8/8 都是假阳性 —— 审计既漏了不带 `.js` 后缀的 import
   （`from '@/composables/useDebounceThrottle'`），也没看 `src/main.js` 这类非视图入口。
   真正的僵尸面在另一处：useDebounceThrottle 里两个 lodash 兼容变体零引用，已删。

   这道守卫只锁一件事：src/composables/ 下每个共享 composable 至少有 1 个 src 消费方。
   无消费方 = 债务（接入或删除），不允许静默留着。例外必须写进 ALLOWLIST 并附原因。

   判据是 import 语句而不是「名字出现过」—— 注释里提到某个 composable 不算消费方。 */

const ALLOWLIST = {
  // 实验室（/lab）2026-10-19 退场，但 enforcement 真源（TIER_QUOTA_MAP、线上表
  // lab_usage_records、3 个 RPC）保留给博莱克 Work 接管，文件头注明「勿直接删」。
  'useLabQuota.js': '实验室退场、配额真源待博莱克 Work 接管（文件头注 2026-10-19）',
};

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|ts|vue|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
};

const CONSUMER_FILES = walk('src').filter((file) => !file.startsWith('src/composables/'));

const importsComposable = (file, base) => {
  const code = stripComments(readFileSync(file, 'utf8'));
  const staticRe = new RegExp(`\\bfrom\\s+['"][^'"]*composables/${base}(?:\\.js)?['"]`);
  const dynamicRe = new RegExp(`\\bimport\\(\\s*['"][^'"]*composables/${base}(?:\\.js)?['"]`);
  return staticRe.test(code) || dynamicRe.test(code);
};

describe('共享 composable 有消费方', () => {
  it('src/composables/ 下每个文件至少被一个 src 文件 import（ALLOWLIST 之外无例外）', () => {
    const files = readdirSync('src/composables').filter((name) => name.endsWith('.js'));
    const orphans = files
      .filter((name) => !ALLOWLIST[name])
      .filter((name) => {
        const base = name.replace(/\.js$/, '');
        return !CONSUMER_FILES.some((file) => importsComposable(file, base));
      });
    expect(orphans, '这些 composable 没有消费方：接入或删除，不要静默留着').toEqual([]);
  });

  /* plans/045 阶段 1 的结论要能被反证：这 8 个曾被报成「零外部消费」，
     现在逐个钉住一个已知消费方。消费方删掉/换名时这里立刻红，
     避免「审计说完就忘、下轮再报一遍」。 */
  it('阶段 1 审计清单里的 8 个 composable 都有已知消费方', () => {
    const evidence = [
      ['useGlassBlur', 'src/components/ui/BohGlassRefract.vue'],
      ['useImageLoaded', 'src/views/CommunityAlbums/index.vue'],
      ['useImageFailure', 'src/views/Shop/BagPanel.vue'],
      ['useKeyboardInset', 'src/main.js'],
      ['useSwipeActions', 'src/views/user-center/Messages/index.vue'],
      ['useScrollStage', 'src/views/BOHApp/index.vue'],
      ['useDebounceThrottle', 'src/views/user-center/Messages/index.vue'],
      ['useRoutePrefetch', 'src/components/UnifiedNavbar/index.vue'],
    ];
    for (const [base, consumer] of evidence) {
      expect(importsComposable(consumer, base), `${consumer} 不再消费 ${base}`).toBe(true);
    }
  });
});
