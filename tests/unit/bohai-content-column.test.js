import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource, stripComments } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// 消息列的横向布局守卫（2026-10-12 两轮用户口径合并）。
//
// ① **AI 回复靠左、用户气泡靠右**：列宽约束在**消息级**，不在容器级 ——
//    容器（`.boh-stream-pad`）必须全宽，否则用户气泡只能贴到内容列右缘
//    （实测 1440 下 928），够不到可用区域右边（`main.right − 40 = 1400`）。
// ② **用户气泡 = 白色底 + 灰描边**：底色走 `--boh-bubble-bg` 单源 ——
//    直接用 `--boh-bg-card`（#f5f5f5 灰）就是报障本身。
// ③ 输入框 / 底部说明仍走 `--boh-content-ml`/`--boh-content-mr` 靠左（与 AI 回复同列）。
//
// ⚠️ 断言只认**令牌与选择器接线**，不认像素；几何后果由
//    `scripts/probes/probe-bohai-shell.mjs` 钉。
// ⚠️ 取块前先 `stripComments`：否定断言会被注释里的复述满足（本仓踩过）。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const TOKENS = 'src/views/BOHAI/BOHAI/styles/tokens.css';
const STREAM = 'src/views/BOHAI/BOHAI/components/styles/boh-stream.css';
const COMPOSER = 'src/views/BOHAI/BOHAI/components/styles/boh-composer.css';

/** 取某条规则块：`anchor` 是紧邻该规则 `{` 的原文片段（含 `{` 或结尾逗号） */
const blockOf = (source, anchor) => {
  const at = source.indexOf(anchor);
  if (at < 0) return null;
  const brace = source.indexOf('{', at);
  if (brace < 0) return null;
  return stripComments(source.slice(brace + 1, source.indexOf('}', brace)));
};

const blockOfFile = (relPath, anchor) => blockOf(read(relPath), anchor);

describe('列宽与对齐令牌只有一处定义', () => {
  it('内容列宽 880px', () => {
    expect(squeezeSource(read(TOKENS))).toContain(squeezeSource('--boh-content-w: 880px;'));
  });

  it('靠左对齐令牌是「0 + auto」', () => {
    const tokens = squeezeSource(read(TOKENS));
    expect(tokens).toContain(squeezeSource('--boh-content-ml: 0;'));
    expect(tokens).toContain(squeezeSource('--boh-content-mr: auto;'));
  });
});

describe('输入区与底部说明：横向对齐走令牌（与 AI 回复同列）', () => {
  const cases = [
    { anchor: '.boh-composer {' },
    { anchor: '.boh-cp-note {' },
    { anchor: '.boh-cp-warn {' },
    { anchor: '.boh-cp-alert,' },
  ];

  it.each(cases)('$anchor 的横向外边距走令牌', ({ anchor }) => {
    const block = blockOfFile(COMPOSER, anchor);
    expect(block, `${anchor} 未找到`).toBeTruthy();
    expect(squeezeSource(block)).toContain(squeezeSource('var(--boh-content-mr)'));
    expect(squeezeSource(block)).toContain(squeezeSource('var(--boh-content-ml)'));
    // 掉队的写法：块内自己写 auto 横向外边距（与令牌口径打架，且两处会不一致）
    expect(block).not.toMatch(/margin:[^;]*\bauto\b/);
  });

  it('输入区的令牌引用数与消费者数一致（新增消费者必须同步本断言）', () => {
    // 4 = .boh-composer / .boh-cp-note / .boh-cp-alert+notice / .boh-cp-warn
    expect((read(COMPOSER).match(/var\(--boh-content-mr\)/g) || []).length).toBe(4);
  });
});

describe('AI 回复靠左、用户气泡靠右（列宽下移到消息级）', () => {
  it('消息容器不再限宽 —— 限宽写回容器会让用户气泡够不到右边', () => {
    const block = blockOfFile(STREAM, '.boh-stream-pad {');
    expect(block, '.boh-stream-pad 未找到').toBeTruthy();
    expect(block).not.toMatch(/max-width/);
    expect(block).not.toMatch(/margin/);
  });

  it('AI 回复自己限宽到内容列宽', () => {
    const block = blockOfFile(STREAM, '.boh-msg.is-ai {');
    expect(block, '.boh-msg.is-ai 未找到').toBeTruthy();
    expect(squeezeSource(block)).toContain(squeezeSource('max-width: var(--boh-content-w)'));
  });

  it('用户消息靠右', () => {
    const block = blockOfFile(STREAM, '.boh-msg.is-user {');
    expect(block, '.boh-msg.is-user 未找到').toBeTruthy();
    expect(squeezeSource(block)).toContain(squeezeSource('justify-content: flex-end'));
  });
});

describe('用户气泡：白色底 + 灰描边', () => {
  it('底色走 `--boh-bubble-bg` 单源，不再用卡片灰', () => {
    const block = blockOfFile(STREAM, '.boh-bubble {');
    expect(block, '.boh-bubble 未找到').toBeTruthy();
    expect(squeezeSource(block)).toContain(squeezeSource('background: var(--boh-bubble-bg)'));
    expect(block).not.toContain('var(--boh-bg-card)');
  });

  it('描边沿用 `--boh-border`（浅色 #e5e5e5 灰）', () => {
    expect(squeezeSource(blockOfFile(STREAM, '.boh-bubble {'))).toContain(
      squeezeSource('border: 1px solid var(--boh-border)'),
    );
  });

  it('气泡底色令牌在浅色与暗色各定义一次', () => {
    const tokens = read(TOKENS);
    expect((tokens.match(/--boh-bubble-bg:/g) || []).length).toBe(2);
    // 浅色 = 页面白底；暗色 = 卡片色
    expect(squeezeSource(tokens)).toContain(squeezeSource('--boh-bubble-bg: var(--boh-bg-page);'));
    expect(squeezeSource(tokens)).toContain(squeezeSource('--boh-bubble-bg: var(--boh-bg-card);'));
  });
});
