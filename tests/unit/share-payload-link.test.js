/**
 * share-payload-link.test.js —— 「分享正文必须自带链接」的单一真源（2026-11-20）
 *
 * 背景（手机端实测报障）：点「分享 → 复制」只拿到一句标题、没有地址。
 * 真因是 `navigator.share({ title, text, url })` 里**部分系统分享面板目标只读 `text`、
 * 把 `url` 丢掉**（微信「发送给朋友」、部分安卓机型的「复制」）。
 *
 * 修法不是各处手拼 `text`（手拼的版本一定会漏一两处），而是收敛到
 * `buildSharePayload`。本文件锁三件事：
 *   ① `text` 一定含完整 URL（给了 url 就必须出现）；
 *   ② 没有 url 时不能凭空造出「undefined」/ 空行垃圾；
 *   ③ `title` / `url` 字段仍然照传（标准通道与系统卡片要靠它们）。
 *
 * 这是**行为**测试（直接调函数），不是源码字符匹配 —— prettier 改不动它。
 */
import { describe, expect, it } from 'vitest';
import { buildSharePayload } from '../../src/composables/useShareTarget.js';

const URL_A = 'https://www.blockofhome.cn/#/lottery/abc-123';

describe('buildSharePayload：正文自带链接', () => {
  it('给了 url ⇒ text 末尾就是完整链接', () => {
    const payload = buildSharePayload({
      title: '中秋月饼抽奖',
      text: '中秋月饼抽奖 · 奖品：咖啡券',
      url: URL_A,
    });
    expect(payload.text.endsWith(URL_A)).toBe(true);
    // 正文本身还在（不能只剩链接）
    expect(payload.text).toContain('奖品：咖啡券');
  });

  it('text 只有标题时，结果 = 标题 + 换行 + 链接', () => {
    const payload = buildSharePayload({ title: 'BOH 新闻', text: 'BOH 新闻', url: URL_A });
    expect(payload.text).toBe(`BOH 新闻\n${URL_A}`);
  });

  it('不传 text 时退回 title（不能出现空正文 + 光秃秃一个链接之外的空行）', () => {
    const payload = buildSharePayload({ title: '公告', url: URL_A });
    expect(payload.text).toBe(`公告\n${URL_A}`);
  });

  it('不传 text 也不传 title、只有 summary 时用 summary 当正文', () => {
    const payload = buildSharePayload({ summary: '一句摘要', url: URL_A });
    expect(payload.text).toBe(`一句摘要\n${URL_A}`);
  });

  it('title / url 字段照传（系统卡片要靠它们，不能被合并进 text 就丢掉）', () => {
    const payload = buildSharePayload({ title: '标题', text: '正文', url: URL_A });
    expect(payload.title).toBe('标题');
    expect(payload.url).toBe(URL_A);
  });

  it('没有 url 时：不拼接、不产生 "undefined" 这种垃圾正文', () => {
    const payload = buildSharePayload({ title: '标题', text: '正文' });
    expect(payload.text).toBe('正文');
    expect(payload.text).not.toContain('undefined');
    expect(payload.url).toBe('');
  });

  it('全空时 text 为空串，title 回落到 BOHLITE（navigator.share 不接受空 title 的机型）', () => {
    const payload = buildSharePayload({});
    expect(payload.text).toBe('');
    expect(payload.title).toBe('BOHLITE');
  });

  it('首尾空白被裁掉（粘贴来的标题常带换行）', () => {
    const payload = buildSharePayload({ title: '  标题  ', text: '  正文  ', url: `  ${URL_A}  ` });
    expect(payload.title).toBe('标题');
    expect(payload.text).toBe(`正文\n${URL_A}`);
    expect(payload.url).toBe(URL_A);
  });
});
