import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * plans/042 B4 / AC-7：三个发放台必须共用同一个 UserPicker。
 *
 * 这条守卫要拦的不是「少写一次 import」，而是**第四份选人实现**：
 * 以前积分 / 订阅 / 抽奖补参与各写一套（去抖 280ms vs 无去抖、回车行为、
 * 排序按积分/时间、空结果一句话），同一个用户名在三个页面搜出三种顺序。
 */

const read = (path) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8');

const GRANT_CONSOLES = [
  'src/views/DataManagement/components/PointsGrantConsole.vue',
  'src/views/DataManagement/components/SubscriptionGrantConsole.vue',
  'src/views/DataManagement/components/LotteryJoinGrant.vue',
];

describe('三个发放台共用 UserPicker', () => {
  it.each(GRANT_CONSOLES)('%s import 了 UserPicker', (path) => {
    expect(read(path)).toContain("from './shared/UserPicker.vue'");
  });

  it.each(GRANT_CONSOLES)('%s 不再自带一套选人搜索状态', (path) => {
    const source = read(path);
    // 旧实现的三个特征：本地关键词 / 本地结果 / 本地 searching
    expect(source).not.toContain('const searchResults = ref(');
    expect(source).not.toContain('const searching = ref(');
    expect(source).not.toContain('const userResults = ref(');
  });
});

describe('UserPicker 自身的行为口径', () => {
  const source = read('src/views/DataManagement/components/shared/UserPicker.vue');

  it('去抖 250ms（C6）', () => {
    expect(source).toContain('const DEBOUNCE_MS = 250;');
  });

  it('按相关性排序而不是按积分/时间（D1 打分单一真源）', () => {
    expect(source).toContain('scoreRow');
  });

  it('空结果给「粘贴 UUID」入口（B4）', () => {
    expect(source).toContain('UUID_PATTERN');
    expect(source).toContain('addManualUser');
  });

  it('保留最近选择', () => {
    expect(source).toContain('recentKey');
    expect(source).toContain('localStorage');
  });
});
