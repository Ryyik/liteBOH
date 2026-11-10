import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf8');
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const newsroom = () => stripComments(read('src/views/Newsroom/index.vue'));
const host = () => stripComments(read('src/views/NewsEditor/index.vue'));

describe('资讯列表就地编辑（plans/042 §10.4 A 档）', () => {
  it('三种卡片形态都接原语：主卡 / 次级列表 / 网格卡', () => {
    const source = newsroom();
    // 标题：featuredNews 1 处 + 网格 news 1 处 + 次级 news 1 处
    expect(source.match(/field="title"/g)?.length).toBe(3);
    expect(source.match(/field="excerpt"/g)?.length).toBe(2);
    expect(source.match(/field="image"/g)?.length).toBe(3);
    for (const field of ['field="title"', 'field="excerpt"', 'field="image"']) {
      expect(source).toContain(field);
    }
    expect(source).toContain('table="news"');
  });

  it('节目（静态数据）不可编辑：row 传 null，原语退化成纯容器', () => {
    const source = newsroom();
    // 8 处原语（标题 3 + 摘要 2 + 封面 3）全部带 kind 判断，节目卡拿不到 row
    // ⇒ 一个编辑控件都不渲染（真机实测：3 张节目卡的 ×/换图 数量为 0）
    expect(source.match(/:row="[^"]*\.kind === 'news' \? [^"]* : null"/g)?.length).toBe(8);
  });

  it('编辑控件只在编辑态渲染', () => {
    const source = newsroom();
    expect(source).toContain(
      'const isInlineNewsEditing = computed(() => Boolean(inlineEditor?.active))',
    );
    expect(source.match(/v-if="isInlineNewsEditing && [^"]*kind === 'news'"/g)?.length).toBe(3);
    // 删除按钮带表名，走宿主的删除通道（快照 + 确认）
    expect(source.match(/inlineEditor\.remove\([a-zA-Z]+, 'news'\)/g)?.length).toBe(3);
  });

  it('封面根节点从 div 换成原语后必须显式 block（否则 aspect-ratio 失效）', () => {
    const css = read('src/views/Newsroom/style.scoped.css');
    const at = css.indexOf('.news-image {');
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 260)).toContain('display: block');
  });

  it('分类 / 日期不在就地编辑范围（枚举与格式化值）', () => {
    const source = newsroom();
    expect(source).not.toContain('field="category"');
    expect(source).not.toContain('field="date"');
  });
});

describe('NewsEditor 宿主', () => {
  it('直接挂载前台页面组件，不复制一份 DOM', () => {
    expect(host()).toContain('<Newsroom />');
    expect(host()).toContain("from '@/views/Newsroom/index.vue'");
  });

  it('写入走 API 层，且失效 news 缓存（否则下次进前台还是旧字）', () => {
    expect(host()).toContain('patchAdminRow');
    expect(host()).toContain('deleteAdminRow');
    expect(host()).not.toMatch(/supabase\s*\.from\(/);
    expect(host()).toContain("invalidateByTags(['news'])");
  });

  it('先取原始行 → 删除成功 → 再落快照，快照不带展示用的 kind', () => {
    const source = host();
    const remove = source.match(/const remove = async \(row\) => \{([\s\S]*?)\n\};/);
    expect(remove, '找不到 remove').toBeTruthy();
    const body = remove[1];
    const fetchAt = body.indexOf('fetchRecordById(');
    const deleteAt = body.indexOf('deleteAdminRow(');
    const snapshotAt = body.indexOf('recordDeletedSnapshot(');
    expect(fetchAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeGreaterThan(-1);
    // 原始行必须在删除前取（删完查不到）；快照必须在删除成功后写（失败不留幽灵条目）
    expect(fetchAt, '取原始行必须在删除之前').toBeLessThan(deleteAt);
    expect(snapshotAt, '快照必须在删除成功之后写').toBeGreaterThan(deleteAt);
    expect(body).toContain('delete snapshot.kind');
  });

  it('校验与字段上限来自 tables.js 的 news 配置（单一真源）', () => {
    expect(host()).toContain('dataConfig.news.fields');
    expect(host()).toContain('validateInlineField(metaOf(field), value)');
  });
});

describe('宿主注册与共用组件', () => {
  it('/admin/news-editor 已注册：requiresAdmin + bodyClass 覆盖成 page-newsroom', () => {
    const routes = read('src/router/routes/admin.ts');
    const at = routes.indexOf("'/admin/news-editor'");
    expect(at).toBeGreaterThan(-1);
    const block = routes.slice(at, at + 420);
    expect(block).toContain('requiresAdmin: true');
    expect(block).toContain("bodyClass: 'page-newsroom'");
  });

  it('侧栏与导航表都登记了（否则只能手敲地址）', () => {
    const tabs = read('src/views/DataManagement/config/tabs.js');
    expect(tabs).toContain("id: 'news-editor'");
    expect(tabs).toContain("subPages: ['news-editor']");
    const nav = read('src/views/DataManagement/composables/useDataAdminNavigation.js');
    expect(nav).toContain("'news-editor'");
    expect(nav).toContain("'news-editor': '/admin/news-editor'");
  });

  it('工具栏是共用组件：两个宿主都 import，且宿主里不再有第二份浮动样式', () => {
    for (const file of ['src/views/ShopEditor/index.vue', 'src/views/NewsEditor/index.vue']) {
      const source = stripComments(read(file));
      expect(source, `${file} 没有用共用工具栏`).toContain('InlineEditorBar');
    }
    const bar = stripComments(read('src/components/inline-editor/InlineEditorBar.vue'));
    expect(bar).toContain('liquid-glass');
    expect(bar).toContain('useInlineEditor()');
    // 商城宿主不再自己写 .se-bar / .se-toast
    const shop = stripComments(read('src/views/ShopEditor/index.vue'));
    expect(shop).not.toContain('.se-bar');
    expect(shop).not.toContain('.se-toast');
  });
});
