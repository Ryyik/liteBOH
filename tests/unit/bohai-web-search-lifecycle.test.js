import { describe, expect, it } from 'vitest';
import { useWebSearchLifecycle } from '../../src/views/BOHAI/composables/useWebSearchLifecycle.js';

/**
 * 联网搜索生命周期的行为单测（2026-10-08）：
 * `webSearchResults` 是消息流折叠面板轮换标题的数据真源 ——
 *  · 结果一次性返回 ⇒ 到达即填充（「实时」的可达口径）；
 *  · 每轮开始先清空 ⇒ 关闭联网的那一轮绝不显示上一轮旧标题；
 *  · 失败/中止 ⇒ 清单保持空（面板退回「正在检索可信网页」文案）。
 */
const PAGE = (title, url) => ({ title, url });

describe('useWebSearchLifecycle — 结果清单', () => {
  it('成功时把结果映射进 webSearchResults（到达即实时）', async () => {
    const lifecycle = useWebSearchLifecycle({
      search: async () => ({
        ok: true,
        count: 4,
        results: [
          PAGE('方块之家 BOH 发布公告', 'https://example.com/a'),
          PAGE('', 'https://www.example.com/b'), // 无标题但带 url：保留，标题由展示层兜 host
          PAGE('   ', ''), // 纯空白标题且无 url：整条过滤
          { title: '无 url 但有标题', url: '' },
        ],
      }),
    });
    const result = await lifecycle.runWebSearch('方块之家', undefined);
    expect(result.ok).toBe(true);
    // 标题一律 trim；纯空白 + 无 url 的整条过滤
    expect(lifecycle.webSearchResults.value).toEqual([
      { title: '方块之家 BOH 发布公告', url: 'https://example.com/a' },
      { title: '', url: 'https://www.example.com/b' },
      { title: '无 url 但有标题', url: '' },
    ]);
  });

  it('新一轮开始先清空上一轮标题（关闭联网的那轮不显示旧标题）', async () => {
    let observedDuringSecondRun = '未观察';
    const lifecycle = useWebSearchLifecycle({
      search: async (query) => {
        if (query === '第一轮') {
          return { ok: true, results: [PAGE('旧标题', 'https://old.example.com')] };
        }
        // 第二轮 search 已被调用、但尚未返回 ⇒ 此刻清单必须已经是空
        observedDuringSecondRun = lifecycle.webSearchResults.value.length;
        return { ok: false, results: [] };
      },
    });
    await lifecycle.runWebSearch('第一轮', undefined);
    expect(lifecycle.webSearchResults.value.map((p) => p.title)).toEqual(['旧标题']);

    await lifecycle.runWebSearch('第二轮', undefined);
    expect(observedDuringSecondRun).toBe(0);
    expect(lifecycle.webSearchResults.value).toEqual([]);
    expect(lifecycle.webSearchActive.value).toBe(false);
  });

  it('搜索抛错 → 返回 ok:false 且清单为空、激活态复位', async () => {
    const lifecycle = useWebSearchLifecycle({
      search: async () => {
        throw new Error('网络中断');
      },
    });
    const result = await lifecycle.runWebSearch('任意', undefined);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('网络中断');
    expect(lifecycle.webSearchResults.value).toEqual([]);
    expect(lifecycle.webSearchActive.value).toBe(false);
  });

  it('resetWebSearchLifecycle 复位激活态并清空清单', async () => {
    const lifecycle = useWebSearchLifecycle({
      search: async () => ({ ok: true, results: [PAGE('标题', 'https://example.com')] }),
    });
    await lifecycle.runWebSearch('任意', undefined);
    expect(lifecycle.webSearchResults.value.length).toBe(1);
    lifecycle.resetWebSearchLifecycle();
    expect(lifecycle.webSearchActive.value).toBe(false);
    expect(lifecycle.webSearchResults.value).toEqual([]);
  });

  it('结果清单最多保留 8 条（面板与持久化都不许膨胀）', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => PAGE(`第${i}条`, `https://e.com/${i}`));
    const lifecycle = useWebSearchLifecycle({
      search: async () => ({ ok: true, results: twelve }),
    });
    await lifecycle.runWebSearch('任意', undefined);
    expect(lifecycle.webSearchResults.value.length).toBe(8);
  });
});
