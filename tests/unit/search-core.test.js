import { describe, expect, it } from 'vitest';
import {
  MATCH_CONTAINS,
  SEARCH_MODE_ID,
  SEARCH_MODE_TAB,
  SEARCH_MODE_TEXT,
  SEARCH_MODE_USER,
  parseSearchQuery,
  searchTermOf,
  MATCH_EXACT,
  MATCH_NONE,
  MATCH_PREFIX,
  MATCH_WORD_START,
  UUID_PATTERN,
  buildContainsPattern,
  buildSearchFilters,
  buildStartsWithPattern,
  escapeLikePattern,
  groupByTab,
  normalizeKeyword,
  rankRows,
  scoreFieldValue,
  scoreRow,
} from '@/utils/search-core.js';
import { UUID_REGEX } from '@/views/DataManagement/composables/useDataAdminValidation.js';

const TAB_FIELDS = {
  products: [
    { column: 'id', type: 'uuid' },
    { column: 'title', type: 'text' },
    { column: 'description', type: 'text' },
    { column: 'stock', type: 'number' },
  ],
};

describe('normalizeKeyword：只规范化，不删字符', () => {
  it('保留 % _ , ( ) 这些用户真的会输入的字', () => {
    expect(normalizeKeyword(' 50% ')).toBe('50%');
    expect(normalizeKeyword('a_b')).toBe('a_b');
    expect(normalizeKeyword('张,李')).toBe('张,李');
    expect(normalizeKeyword('优惠(限时)')).toBe('优惠(限时)');
  });

  it('折叠空白并截断 120 字', () => {
    expect(normalizeKeyword('a   b')).toBe('a b');
    expect(normalizeKeyword('x'.repeat(200))).toHaveLength(120);
  });

  it('空值安全', () => {
    expect(normalizeKeyword(undefined)).toBe('');
    expect(normalizeKeyword(null)).toBe('');
    expect(normalizeKeyword(0)).toBe('0');
  });
});

describe('LIKE 转义（AC-5 / AC-6）', () => {
  it('% 与 _ 转成字面量，反斜杠自身先加倍', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('c\\d')).toBe('c\\\\d');
  });

  it('「50%」构造出的是转义模式而不是「50 」', () => {
    expect(buildContainsPattern('50%')).toBe('%50\\%%');
    expect(buildContainsPattern('50%')).not.toBe('%50 %');
  });

  it('含 or() 保留字符时整段加引号，且引号内保留通配符', () => {
    expect(buildContainsPattern('a(b)')).toBe('"%a(b)%"');
    expect(buildContainsPattern('x,y')).toBe('"%x,y%"');
    expect(buildContainsPattern('a"b')).toBe('"%a\\"b%"');
    expect(buildStartsWithPattern('a,b')).toBe('"a,b%"');
  });

  it('普通关键词不加引号（避免无谓的语法噪音）', () => {
    expect(buildContainsPattern('围巾')).toBe('%围巾%');
  });
});

describe('buildSearchFilters', () => {
  it('文本字段走转义后的 ilike，uuid/number 不参与模糊匹配', () => {
    const filters = buildSearchFilters('products', '50%', TAB_FIELDS);
    expect(filters).toEqual(['title.ilike.%50\\%%', 'description.ilike.%50\\%%']);
  });

  it('关键词是合法 UUID 时 uuid 字段精确匹配（不转义、不加引号）', () => {
    const id = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';
    const filters = buildSearchFilters('products', id, TAB_FIELDS);
    expect(filters).toContain(`id.eq.${id}`);
    expect(filters).toContain(`title.ilike.%${id}%`);
  });

  it('纯整数关键词命中 number 字段（精确），文本字段仍可模糊', () => {
    const filters = buildSearchFilters('products', '12', TAB_FIELDS);
    expect(filters).toContain('stock.eq.12');
    expect(filters).toContain('title.ilike.%12%');
  });

  it('只有特殊字符的关键词不报错、不产生空条件', () => {
    for (const keyword of ['%', '_', ',', '(', ')', '%%', '()']) {
      const filters = buildSearchFilters('products', keyword, TAB_FIELDS);
      expect(Array.isArray(filters)).toBe(true);
      expect(filters.length).toBeGreaterThan(0);
      filters.forEach((condition) => {
        const pattern = condition.slice(condition.indexOf('.ilike.') + '.ilike.'.length);
        expect(pattern.length).toBeGreaterThan(0);
        // 保留字符只允许出现在整段引号里，否则 or() 会把它们当分隔符拆开
        if (pattern.startsWith('"')) {
          expect(pattern.endsWith('"')).toBe(true);
        } else {
          expect(pattern).not.toMatch(/[,(:]/);
        }
      });
    }
  });

  it('空关键词与未知 tab 返回空数组', () => {
    expect(buildSearchFilters('products', '   ', TAB_FIELDS)).toEqual([]);
    expect(buildSearchFilters('nope', 'x', TAB_FIELDS)).toEqual([]);
  });
});

describe('相关性打分（AC-3 的基础）', () => {
  it('完全相等 > 前缀 > 词首 > 包含 > 不命中', () => {
    expect(scoreFieldValue('围巾小狗', '围巾小狗')).toBe(MATCH_EXACT);
    expect(scoreFieldValue('围巾小狗 秋冬', '围巾小狗')).toBe(MATCH_PREFIX);
    expect(scoreFieldValue('小狗 围巾', '围巾')).toBe(MATCH_WORD_START);
    expect(scoreFieldValue('小狗围巾保暖', '围巾')).toBe(MATCH_CONTAINS);
    expect(scoreFieldValue('帽子', '围巾')).toBe(MATCH_NONE);
  });

  it('大小写不敏感', () => {
    expect(scoreFieldValue('Winter Scarf', 'winter')).toBe(MATCH_PREFIX);
    expect(scoreFieldValue('winter scarf', 'WINTER')).toBe(MATCH_PREFIX);
  });

  it('长文本列权重低于标题列：同一匹配强度下标题优先', () => {
    const fields = TAB_FIELDS.products;
    const byTitle = scoreRow({ title: '围巾', description: 'x' }, '围巾', fields);
    const byDesc = scoreRow({ title: 'x', description: '围巾' }, '围巾', fields);
    expect(byTitle).toBeGreaterThan(byDesc);
  });

  it('排序：完全相等排第一，即使它原来在末尾', () => {
    const rows = [
      { title: '加厚围巾小狗保暖款' },
      { title: '帽子' },
      { title: '围巾小狗' },
      { title: '围巾小狗 联名' },
    ];
    const ranked = rankRows(rows, '围巾小狗', { fields: TAB_FIELDS.products });
    expect(ranked[0].title).toBe('围巾小狗');
    expect(ranked[ranked.length - 1].title).toBe('帽子');
  });

  it('无关键词或无字段时保持原顺序（不擅自改数据库排序）', () => {
    const rows = [{ title: 'b' }, { title: 'a' }];
    expect(rankRows(rows, '', { fields: TAB_FIELDS.products })).toEqual(rows);
    expect(rankRows(rows, 'a', { fields: [] })).toEqual(rows);
  });
});

describe('groupByTab：跨表结果分组', () => {
  it('按 tabId 分组并保留首次出现顺序', () => {
    const groups = groupByTab([
      { tabId: 'users', tabLabel: '用户', id: '1' },
      { tabId: 'products', tabLabel: '商品', id: '2' },
      { tabId: 'users', tabLabel: '用户', id: '3' },
    ]);
    expect(groups.map((g) => g.tabId)).toEqual(['users', 'products']);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items[0].id).toBe('2');
  });

  it('没有 tabId 的条目被忽略', () => {
    expect(groupByTab([{ id: 'x' }])).toEqual([]);
  });
});

describe('UUID 形状与校验模块同源', () => {
  it('两处正则等价', () => {
    const samples = [
      '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      '00AC36B4-6594-440F-A9C1-38B7BD47EE8B',
      'not-a-uuid',
      '00ac36b4-6594-440f-a9c1',
    ];
    samples.forEach((sample) => {
      expect(UUID_PATTERN.test(sample)).toBe(UUID_REGEX.test(sample));
    });
  });
});

describe('快捷前缀（plans/042 C3）', () => {
  const FIELDS = {
    products: [
      { column: 'id', type: 'uuid' },
      { column: 'title', type: 'text' },
      { column: 'description', type: 'text' },
    ],
    forum: [
      { column: 'id', type: 'uuid' },
      { column: 'author_username', type: 'text' },
      { column: 'content', type: 'text' },
    ],
  };

  it('parseSearchQuery 只认开头的三种前缀', () => {
    expect(parseSearchQuery('id:abc').mode).toBe(SEARCH_MODE_ID);
    expect(parseSearchQuery('ID:abc').mode).toBe(SEARCH_MODE_ID);
    expect(parseSearchQuery('tab:商品').mode).toBe(SEARCH_MODE_TAB);
    expect(parseSearchQuery('@小明').mode).toBe(SEARCH_MODE_USER);
    expect(parseSearchQuery('围巾 id:abc').mode).toBe(SEARCH_MODE_TEXT);
    expect(parseSearchQuery('  @小明  ').value).toBe('小明');
  });

  it('searchTermOf 去掉前缀，供打分/高亮使用', () => {
    expect(searchTermOf('id:00ac36b4-6594-440f-a9c1-38b7bd47ee8b')).toBe(
      '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
    );
    expect(searchTermOf('@小明')).toBe('小明');
    expect(searchTermOf('围巾')).toBe('围巾');
  });

  it('id: + 合法 UUID → 只精确匹配主键', () => {
    expect(
      buildSearchFilters('products', 'id:00ac36b4-6594-440f-a9c1-38b7bd47ee8b', FIELDS),
    ).toEqual(['id.eq.00ac36b4-6594-440f-a9c1-38b7bd47ee8b']);
  });

  it('id: + 半截 ID → 主键包含匹配，不再散到其它列', () => {
    const filters = buildSearchFilters('products', 'id:00ac36', FIELDS);
    expect(filters).toEqual(['id.ilike.%00ac36%']);
  });

  it('@ 只在用户名类列里搜（不碰正文）', () => {
    expect(buildSearchFilters('forum', '@小明', FIELDS)).toEqual(['author_username.ilike.%小明%']);
  });

  it('@ 但表里没有用户名列 → 退回全字段，宁宽不漏', () => {
    expect(buildSearchFilters('products', '@小明', FIELDS)).toEqual([
      'title.ilike.%小明%',
      'description.ilike.%小明%',
    ]);
  });

  it('tab: 不产生任何查询条件（跳表由 UI 处理）', () => {
    expect(buildSearchFilters('products', 'tab:商品', FIELDS)).toEqual([]);
  });

  it('id: 后面是空的 → 无条件，不发请求', () => {
    expect(buildSearchFilters('products', 'id:', FIELDS)).toEqual([]);
  });
});
