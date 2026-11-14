/**
 * bohai-knowledge-patch.test.js — 知识库「变更单」解析（2026-11-12）
 *
 * 这条链路的风险不在「解析不出来」（那只是不显示卡片），而在**解析错了**：
 * 一个错误的 id 被当成合法变更送进 EF，管理员点一下就会改错切片。
 * 所以这里对「校验」格外严格：非法 action、非 uuid、缺正文，一律丢弃。
 */
import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_CHUNK_MAX_CHARS,
  KNOWLEDGE_PATCH_TAG,
  buildKnowledgePatchPromptAppendix,
  hasKnowledgePatchBlock,
  normalizeKnowledgePatch,
  parseKnowledgePatchBlocks,
} from '../../src/views/BOHAI/utils/retrieval/knowledge-patch';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const wrap = (payload) => `<${KNOWLEDGE_PATCH_TAG}>${payload}</${KNOWLEDGE_PATCH_TAG}>`;

describe('单条提议校验', () => {
  it('合法 update 通过，字段被裁到上限', () => {
    const patch = normalizeKnowledgePatch({
      action: 'update',
      id: UUID,
      title: '标题',
      content: '新的正文',
      reason: '用户要求更正',
    });
    expect(patch).toMatchObject({ action: 'update', id: UUID, title: '标题', content: '新的正文' });
  });

  it('action 不在白名单 → 丢弃（不许出现 "delete" 这种后端根本没有的动作）', () => {
    expect(normalizeKnowledgePatch({ action: 'delete', id: UUID, content: 'x' })).toBeNull();
    expect(normalizeKnowledgePatch({ action: 'drop', id: UUID, content: 'x' })).toBeNull();
  });

  it('id 不是 uuid → 丢弃（EF 会 400，提前挡掉）', () => {
    expect(normalizeKnowledgePatch({ action: 'update', id: 'K1', content: 'x' })).toBeNull();
  });

  it('update 缺正文 → 丢弃；archive 有 id 即可', () => {
    expect(normalizeKnowledgePatch({ action: 'update', id: UUID })).toBeNull();
    expect(normalizeKnowledgePatch({ action: 'archive', id: UUID })).toMatchObject({
      action: 'archive',
    });
  });

  it('create 不需要 id，但需要正文', () => {
    expect(normalizeKnowledgePatch({ action: 'create', content: '新知识' })).toMatchObject({
      action: 'create',
    });
    expect(normalizeKnowledgePatch({ action: 'create', content: '' })).toBeNull();
  });

  it('edit 需要 id + find；replace 允许空串（＝删除该片段）', () => {
    expect(
      normalizeKnowledgePatch({ action: 'edit', id: UUID, find: '旧说法', replace: '' }),
    ).toMatchObject({ action: 'edit', id: UUID, find: '旧说法', replace: '' });

    // 缺 find ⇒ 后端必然 400，提前挡掉
    expect(normalizeKnowledgePatch({ action: 'edit', id: UUID, replace: 'x' })).toBeNull();
    expect(
      normalizeKnowledgePatch({ action: 'edit', id: UUID, find: '   ', replace: 'x' }),
    ).toBeNull();
    // edit 也要 uuid（和 update / archive 同口径）
    expect(
      normalizeKnowledgePatch({ action: 'edit', id: 'K1', find: 'a', replace: 'b' }),
    ).toBeNull();
  });

  it('edit 的 find 不做 trim（多行锚点带缩进是合法的）', () => {
    const find = '\n  第一条细节\n  ';
    const patch = normalizeKnowledgePatch({ action: 'edit', id: UUID, find, replace: 'x' });
    expect(patch.find).toBe(find);
  });

  it('非对象 / 数组 → null', () => {
    expect(normalizeKnowledgePatch(null)).toBeNull();
    expect(normalizeKnowledgePatch('update')).toBeNull();
    expect(normalizeKnowledgePatch([{ action: 'update' }])).toBeNull();
  });

  /* 正文上限必须与 DB 的 `boh_ai_knowledge_chunks_content_len`（1..3000）
     和 EF 的 MAX_CHUNK_CONTENT_CHARS 一致，否则「合法的变更单」到库里才炸。
     反证：把 KNOWLEDGE_CHUNK_MAX_CHARS 改回 20000 → 第一条必红。 */
  it('正文上限与 DB / EF 同口径（3000），且超长内容不被静默截断', () => {
    expect(KNOWLEDGE_CHUNK_MAX_CHARS).toBe(3000);

    const longContent = '甲'.repeat(4500);
    const patch = normalizeKnowledgePatch({ action: 'update', id: UUID, content: longContent });
    // 不能让 4500 字悄悄变成 3000 字再入库（少了哪句没人知道）——
    // 原样保留，由 EF 回可读的 400「content is too long (max 3000 chars)」
    expect(patch.content).toHaveLength(4500);
  });
});

describe('从回复里提取变更单', () => {
  it('提取单条，并把原始 JSON 从展示文本里剥掉', () => {
    const text = `好的，我建议这样改：\n${wrap(
      JSON.stringify({ action: 'update', id: UUID, content: '改后的正文' }),
    )}\n已生成变更单，请确认。`;
    const { patches, cleanText } = parseKnowledgePatchBlocks(text);
    expect(patches).toHaveLength(1);
    expect(patches[0].content).toBe('改后的正文');
    expect(cleanText).toContain('好的，我建议这样改');
    expect(cleanText).toContain('已生成变更单');
    expect(cleanText).not.toContain(KNOWLEDGE_PATCH_TAG);
    expect(cleanText).not.toContain('"action"');
  });

  it('数组形式一次给多条', () => {
    const text = wrap(
      JSON.stringify([
        { action: 'archive', id: UUID },
        { action: 'update', id: UUID, content: 'b' },
      ]),
    );
    expect(parseKnowledgePatchBlocks(text).patches).toHaveLength(2);
  });

  it('模型包了 ```json 也能解析', () => {
    const text = wrap('```json\n{"action":"archive","id":"' + UUID + '"}\n```');
    expect(parseKnowledgePatchBlocks(text).patches).toHaveLength(1);
  });

  it('非法 JSON → 不产出 patch，但块本身仍被剥掉（不把裸 JSON 糊到界面上）', () => {
    const text = `说明\n${wrap('{不是合法 json')}\n结束`;
    const { patches, cleanText } = parseKnowledgePatchBlocks(text);
    expect(patches).toHaveLength(0);
    expect(cleanText).toBe('说明\n\n结束');
  });

  it('半截块（只有开标签、模型忘了闭合）→ 从开标签起整段剥掉，且不解析', () => {
    const text = `说明文字\n<${KNOWLEDGE_PATCH_TAG}>{"action":"update","id":"${UUID}"`;
    const { patches, cleanText } = parseKnowledgePatchBlocks(text);
    expect(patches).toHaveLength(0);
    expect(cleanText).toBe('说明文字');
  });

  it('混合：一条合法 + 一条非法 ⇒ 只保留合法的', () => {
    const text = wrap(
      JSON.stringify([
        { action: 'update', id: UUID, content: 'ok' },
        { action: 'delete', id: UUID, content: 'bad' },
      ]),
    );
    const { patches } = parseKnowledgePatchBlocks(text);
    expect(patches).toHaveLength(1);
    expect(patches[0].content).toBe('ok');
  });

  it('没有标签时原样返回（绝大多数普通回答走这条）', () => {
    const text = '这是一段普通回答，没有变更单。';
    const result = parseKnowledgePatchBlocks(text);
    expect(result.patches).toHaveLength(0);
    expect(result.cleanText).toBe(text);
    expect(hasKnowledgePatchBlock(text)).toBe(false);
  });

  it('空输入不崩', () => {
    expect(parseKnowledgePatchBlocks('').cleanText).toBe('');
    expect(parseKnowledgePatchBlocks(undefined).patches).toHaveLength(0);
  });
});

describe('prompt 附录', () => {
  it('明确写了「不能直接改数据库、要等管理员确认」', () => {
    const text = buildKnowledgePatchPromptAppendix();
    expect(text).toContain('不能');
    expect(text).toContain('确认');
    expect(text).toContain(KNOWLEDGE_PATCH_TAG);
  });

  it('标签名与解析器共用同一常量（改一处两处都动）', () => {
    expect(buildKnowledgePatchPromptAppendix()).toContain(`<${KNOWLEDGE_PATCH_TAG}>`);
    expect(buildKnowledgePatchPromptAppendix()).toContain(`</${KNOWLEDGE_PATCH_TAG}>`);
  });
});
