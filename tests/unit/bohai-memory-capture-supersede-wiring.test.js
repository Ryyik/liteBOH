/**
 * bohai-memory-capture-supersede-wiring.test.js — 自动沉淀「同主题改口」接线（plans/044 阶段 0 B）
 *
 * 背景：`memory-supersede.js` 提供了 `resolveSharedCandidateWrite`，但 2026-11-22 复核时
 * `treehole-space-api.js` 的候选循环**根本没调用它** —— 判定模块是死代码，
 * G2（旧事实出得去）实际未修。本测试锁住接线本身：
 *
 *   ① 候选循环先调 `resolveSharedCandidateWrite`，且**先于** `isLikelyDuplicateText`
 *      联合去重闸（后者的 `continue` 会把改口判成重复直接吞掉）；
 *   ② `exact` ⇒ 跳过；`supersede` 且定位到带 id 的旧行 ⇒ 写入前归档旧行；
 *   ③ 归档必须在**写新记忆之前**（否则新事实落库时旧事实还是 active）；
 *   ④ 判定只喂公共记忆库的**行**（带 id），不是内容串数组；
 *   ⑤ utils/api 层不许反向 import `views/BOHAI`（架构债，正是本次下沉的理由）。
 *
 * 运行时行为（真的读写库）由 integration 链兜底；这里只锁源码契约与纯函数接线，
 * 不连任何远端库。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSharedCandidateWrite } from '../../src/utils/memory/memory-supersede.js';
import { squeezeSource, stripComments } from '../helpers/source.js';

const apiPath = resolve(import.meta.dirname, '../../src/utils/api/treehole/treehole-space-api.js');
const readApi = () => readFileSync(apiPath, 'utf8');
const apiCode = () => squeezeSource(stripComments(readApi()));

describe('候选循环接线（treehole-space-api.js）', () => {
  it('⭐ 调用了 resolveSharedCandidateWrite（判定模块不再是死代码）', () => {
    const code = apiCode();
    expect(code).toContain('resolveSharedCandidateWrite(');
    expect(code).toContain("from '../../memory/memory-supersede.js'");
  });

  it('⭐ supersede 判定必须先于联合去重闸（否则改口被当成重复吞掉）', () => {
    const code = apiCode();
    const decisionAt = code.indexOf('resolveSharedCandidateWrite(');
    /* 只看循环体内的那次调用：定义在 import 之后的第一次调用即循环内 */
    const dedupeAt = code.indexOf('isLikelyDuplicateText(candidate.content, existingContents)');
    expect(decisionAt).toBeGreaterThan(-1);
    expect(dedupeAt).toBeGreaterThan(-1);
    expect(decisionAt).toBeLessThan(dedupeAt);
  });

  it('归档动作在写入新记忆之前（顺序不能反）', () => {
    const code = apiCode();
    const archiveAt = code.indexOf('updateSharedAIMemoryStatus(');
    const saveAt = code.indexOf('await saveCandidateToShared(candidate)');
    expect(archiveAt).toBeGreaterThan(-1);
    expect(saveAt).toBeGreaterThan(-1);
    expect(archiveAt).toBeLessThan(saveAt);
  });

  it('归档失败不阻断写入（降级为并存），并计入 supersededCount', () => {
    const code = apiCode();
    expect(code).toContain('旧记忆归档失败，改为并存写入');
    expect(code).toContain('stats.supersededCount += 1');
    expect(code).toContain('supersededCount: 0');
  });

  it('判定喂的是公共记忆库的「行」（带 id），不是内容串数组', () => {
    const code = apiCode();
    expect(code).toContain('existingSharedRows');
    expect(code).toContain('resolveSharedCandidateWrite(candidate.content, existingSharedRows)');
  });

  it('⚠️ utils/api 层不许反向 import views/BOHAI（本次下沉的理由）', () => {
    const raw = readApi();
    expect(raw).not.toMatch(/from\s+['"][^'"]*views\/BOHAI/);
    expect(raw).not.toMatch(/from\s+['"]@\/views\//);
  });
});

describe('exact / supersede / none 三出口的语义（纯函数层）', () => {
  const ROWS = [
    { id: 'row-1', content: '我现在住在上海' },
    { id: 'row-2', content: '我养了一只猫' },
  ];

  it('exact ⇒ 跳过（与联合去重闸命中同语义）', () => {
    expect(resolveSharedCandidateWrite('我现在住在上海', ROWS).kind).toBe('exact');
  });

  it('supersede ⇒ 带 id 的旧行（供归档）', () => {
    const r = resolveSharedCandidateWrite('我现在住在北京', ROWS);
    expect(r.kind).toBe('supersede');
    expect(r.supersededMemory?.id).toBe('row-1');
  });

  it('none ⇒ 落回联合去重闸（现行跳过行为保留）', () => {
    expect(resolveSharedCandidateWrite('我这周开始学吉他', ROWS).kind).toBe('none');
  });
});
