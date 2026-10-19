/**
 * bohai-entity-resolver.test.js — 锁查询侧人物实体链接（2026-10-19）
 *
 * 关键口径：
 *   ① 别名必须能命中知识库里真实存在、但旧 BOH_MEMBER_NAMES 漏掉的人（翼儿/胡俊杰/刘镇福）；
 *   ② 歧义别名（一二/橙子/汉堡/End）必须有「人物信号」才触发，挡住「一二线城市」「橙子酱」；
 *   ③ 同一句里出现同一人的多个别名（胡俊杰 + 一二）要归并成一个实体。
 */
import { describe, expect, it } from 'vitest';
import {
  getEntityAliasPattern,
  hasEntityAlias,
  normalizeEntityText,
  resolveQueryEntities,
} from '../../src/utils/boh-entity-resolver.js';

describe('人物实体解析（resolveQueryEntities）', () => {
  it('翼儿 → 一二（旧硬编码名单漏掉的核心别名）', () => {
    const result = resolveQueryEntities('翼儿是谁');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].id).toBe('person-yier');
    expect(result.entities[0].canonicalName).toBe('一二');
    expect(result.entities[0].matchedAliases).toContain('翼儿');
    expect(result.expandedQuery).toContain('一二');
    expect(result.expandedQuery).toContain('胡俊杰');
  });

  it('同一句里的多个别名归并成一个实体', () => {
    const result = resolveQueryEntities('胡俊杰和一二是什么关系');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].id).toBe('person-yier');
    expect(result.entities[0].matchedAliases).toEqual(expect.arrayContaining(['胡俊杰', '一二']));
  });

  it('「查看翼儿的资料」是人物题，不因为像操作题就丢掉实体', () => {
    const result = resolveQueryEntities('查看翼儿的资料');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].id).toBe('person-yier');
  });

  it.each([
    ['小牛今天上线了吗', 'person-xiaoniu'],
    ['刘镇福是谁', 'person-liuzhenfu'],
    ['lzf 是谁', 'person-liuzhenfu'],
    ['武宇轩最近怎么样', 'person-eleven'],
    ['End 是谁', 'person-end'],
  ])('%s → %s', (query, entityId) => {
    const result = resolveQueryEntities(query);
    expect(result.entities.map((entity) => entity.id)).toContain(entityId);
  });

  it.each([
    '今天天气怎么样',
    '帮我算一下',
    '一二线城市有哪些',
    '一二三线城市是什么',
    '橙子酱怎么做',
    '汉堡包的热量',
    'weekend 是什么',
    '笔墨纸砚是什么',
  ])('歧义/普通用法不误判：%s', (query) => {
    expect(resolveQueryEntities(query).entities).toHaveLength(0);
  });

  it('空输入返回空结果，不抛错', () => {
    for (const value of ['', '   ', null, undefined]) {
      const result = resolveQueryEntities(value);
      expect(result.entities).toHaveLength(0);
      expect(result.needsClarification).toBe(false);
    }
  });

  it('hasEntityAlias 与 resolveQueryEntities 同口径', () => {
    expect(hasEntityAlias('翼儿是谁')).toBe(true);
    expect(hasEntityAlias('一二线城市')).toBe(false);
  });
});

describe('人物别名归一（normalizeEntityText / getEntityAliasPattern）', () => {
  it('全角/半角、大小写、标点、空格归一', () => {
    expect(normalizeEntityText('  翼儿，')).toBe('翼儿');
    expect(normalizeEntityText('ＰＶＰ大神Eleven')).toBe('pvp大神eleven');
    expect(normalizeEntityText('小牛 无聊')).toBe('小牛无聊');
  });

  it('别名正则包含真实别名且转义安全', () => {
    const pattern = getEntityAliasPattern();
    expect(pattern).toContain('翼儿');
    expect(pattern).toContain('胡俊杰');
    expect(pattern).not.toContain('（');
  });
});
