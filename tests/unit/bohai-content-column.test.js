import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource, stripComments } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// 内容列（AI 回复 / 输入框 / 底部说明）**横向对齐**的单一真源守卫（2026-10-12）。
//
// 用户口径：AI 回复要靠左、并加宽（原口径是 768px 居中，DESIGN §4 已同步）。
// 三处消费者必须共用同一对令牌 —— 否则「输入框与 AI 回复错开」这种缺陷**不报错、
// 只是看着歪**（本仓对这类静默错位的既定做法就是源码守卫，探针进不了 CI）。
//
// ⚠️ 断言只认**令牌接线**，不认像素：像素值只在 `tokens.css` 出现一次，由本文件锁住；
//    几何后果（真的靠左、右侧留白更大）由 `scripts/probes/probe-bohai-shell.mjs` 钉。
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

describe('内容列横向对齐 · 令牌只有一处定义', () => {
  it('对齐令牌是「靠左」口径（0 + auto）', () => {
    const tokens = squeezeSource(read(TOKENS));
    expect(tokens).toContain(squeezeSource('--boh-content-ml: 0;'));
    expect(tokens).toContain(squeezeSource('--boh-content-mr: auto;'));
  });

  it('内容列宽度 880px', () => {
    expect(squeezeSource(read(TOKENS))).toContain(squeezeSource('--boh-content-w: 880px;'));
  });
});

describe('内容列的每个消费者都走令牌（没有掉队的）', () => {
  const cases = [
    { file: STREAM, anchor: '.boh-stream-pad {' },
    { file: COMPOSER, anchor: '.boh-composer {' },
    { file: COMPOSER, anchor: '.boh-cp-note {' },
    { file: COMPOSER, anchor: '.boh-cp-warn {' },
  ];

  it.each(cases)('$anchor 的横向外边距走令牌', ({ file, anchor }) => {
    const block = blockOf(read(file), anchor);
    expect(block, `${anchor} 未找到`).toBeTruthy();
    expect(squeezeSource(block)).toContain(squeezeSource('var(--boh-content-mr)'));
    expect(squeezeSource(block)).toContain(squeezeSource('var(--boh-content-ml)'));
    // 掉队的写法：块内自己写 auto 横向外边距（与令牌口径打架，且两处会不一致）
    expect(block).not.toMatch(/margin:[^;]*\bauto\b/);
  });

  it('消费者总数与令牌引用数一致（新增消费者必须同步本断言）', () => {
    const countIn = (relPath) => (read(relPath).match(/var\(--boh-content-mr\)/g) || []).length;
    // 4 = .boh-composer / .boh-cp-note / .boh-cp-alert+notice / .boh-cp-warn
    expect(countIn(COMPOSER)).toBe(4);
    expect(countIn(STREAM)).toBe(1);
  });

  it('底部说明那组（alert / notice）也接了令牌', () => {
    const block = blockOf(read(COMPOSER), '.boh-cp-alert,');
    expect(block, '.boh-cp-alert 组未找到').toBeTruthy();
    expect(squeezeSource(block)).toContain(squeezeSource('var(--boh-content-mr)'));
  });
});
