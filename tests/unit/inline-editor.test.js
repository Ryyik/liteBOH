import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateInlineField } from '@/utils/inline-editor-validate.js';

/**
 * 就地编辑（后台直接渲染前台页面 + 页面内点击改字）。
 *
 * 这组用例守的是三条**会静默坏掉**的约束，而不是某个具体 UI：
 *   1. 校验不能绕过 —— 页面上能存进去的值必须和表单一致（最易出的数据事故）
 *   2. 根元素不能换 —— scoped 样式靠「根元素 = 前台原来那个标签」命中，一改就整块失效
 *   3. 前台不能背编辑依赖 —— 上传/浮层只能由后台注入，否则首屏预算被拖胖
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(resolve(ROOT, relative), 'utf8');

/**
 * 结构断言前先剥注释：本仓注释密度很高，而且注释里会**合法地**出现
 * 「刻意不用 contenteditable」这类反例词，直接搜全文必然误报。
 */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('字段级校验（就地编辑与表单同源）', () => {
  const title = { key: 'title', label: '商品名称', required: true, maxLength: 25 };

  it('必填字段为空（含纯空格）必须拦住', () => {
    expect(validateInlineField(title, '')).toBe('商品名称不能为空');
    expect(validateInlineField(title, '   ')).toBe('商品名称不能为空');
  });

  it('超长必须拦住，文案带上限值', () => {
    expect(validateInlineField(title, 'a'.repeat(26))).toBe('商品名称最多 25 个字');
  });

  it('合法值放行', () => {
    expect(validateInlineField(title, '围巾小狗')).toBe('');
  });

  it('空串不触发 min 下限（空值该不该拦由 required 决定）', () => {
    expect(validateInlineField({ key: 'stock', label: '库存', min: 0 }, '')).toBe('');
  });

  it('低于 min 时拦住', () => {
    expect(validateInlineField({ key: 'stock', label: '库存', min: 0 }, '-1')).toBe(
      '库存不能小于 0',
    );
  });

  it('没有字段配置时不做判断（不存在的字段不该被凭空拦下）', () => {
    expect(validateInlineField(null, '任意值')).toBe('');
  });
});

describe('EditableText 的结构契约', () => {
  const source = stripComments(read('src/components/inline-editor/EditableText.vue'));

  it('根元素必须还是 span：父级 class 与 scoped 样式都靠它命中', () => {
    expect(source).toMatch(/<template>\s*<span\s/);
  });

  it('不得改用 contenteditable（Vue 的 patch 会把用户输入吃掉）', () => {
    expect(source).not.toContain('contenteditable');
  });

  it('提交顺序必须是「先校验、后乐观更新」', () => {
    const commit = source.match(/const commit = \(\) => \{([\s\S]*?)\n\};/);
    expect(commit, '找不到 commit 函数').toBeTruthy();
    const body = commit[1];
    const validateAt = body.indexOf('editor?.validate?');
    const emitAt = body.indexOf("emit('update:modelValue', next)");
    expect(validateAt, 'commit 里没有调用校验').toBeGreaterThan(-1);
    expect(emitAt, 'commit 里没有乐观更新').toBeGreaterThan(-1);
    expect(validateAt, '校验必须在 emit 之前，否则非法值会先写进界面').toBeLessThan(emitAt);
  });

  it('写库失败要回滚到旧值', () => {
    expect(source).toMatch(/catch\([\s\S]{0,120}emit\('update:modelValue', previous\.value\)/);
  });
});

describe('EditableImage 的结构契约', () => {
  const source = stripComments(read('src/components/inline-editor/EditableImage.vue'));

  it('上传实现由宿主注入，原语不得直接引入 Cloudinary', () => {
    expect(source).not.toMatch(/cloudinary/i);
    expect(source).toContain('editor?.uploadImage');
  });

  it('样式里只允许 position，不能写 display（会盖掉父级 .p-media 的 grid）', () => {
    const style = source.slice(source.indexOf('<style'));
    expect(style).not.toMatch(/\.eii\s*\{[^}]*display\s*:/);
  });
});

describe('商城页：编辑能力靠注入，不靠结构分叉', () => {
  const shop = stripComments(read('src/views/Shop/index.vue'));

  it('通过 useInlineEditor 取上下文，而不是自己判断角色', () => {
    expect(shop).toContain('useInlineEditor()');
  });

  it('删除角标与新增入口都挂在编辑态条件下', () => {
    for (const marker of ['class="p-card-remove"', 'class="p-card-new"']) {
      const at = shop.indexOf(marker);
      expect(at, `找不到 ${marker}`).toBeGreaterThan(-1);
      const before = shop.slice(Math.max(0, at - 240), at);
      expect(before, `${marker} 缺少 isInlineEditing 条件`).toContain('isInlineEditing');
    }
  });

  it('编辑态用 div 承载卡片（button 里不能嵌 button）', () => {
    expect(shop).toMatch(/:is="isInlineEditing \? 'div' : 'button'"/);
  });
});

describe('ShopEditor 宿主', () => {
  const host = stripComments(read('src/views/ShopEditor/index.vue'));

  it('直接挂载前台页面组件，不复制一份 DOM', () => {
    expect(host).toContain('<Shop />');
    expect(host).toContain("from '@/views/Shop/index.vue'");
  });

  it('提供写入通道时接的是 API 层，不是直连 supabase', () => {
    expect(host).toContain('patchAdminRow');
    expect(host).toContain('deleteAdminRow');
    expect(host).not.toMatch(/supabase\s*\.from\(/);
  });

  it('先取原始行 → 删除成功 → 再落快照（两个顺序都不能反）', () => {
    // 签名带 table（2026-11-10 起一页两表：商品 / 抽奖）
    const remove = host.match(/const remove = async \(row, table = ''\) => \{([\s\S]*?)\n\};/);
    expect(remove, '找不到 remove 函数').toBeTruthy();
    const body = remove[1];
    const fetchAt = body.indexOf('fetchRecordById(');
    const deleteAt = body.indexOf('deleteAdminRow(');
    const snapshotAt = body.indexOf('recordDeletedSnapshot(');
    expect(fetchAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeGreaterThan(-1);
    /* 取原始行必须在删除**之前**：删完就查不到了，只能拿页面对象当快照，
       而页面对象带展示派生列，恢复时 insert 会因 unknown column 整体失败。 */
    expect(fetchAt, '取原始行必须在删除之前').toBeLessThan(deleteAt);
    /* 快照必须等删除**成功**之后写：删除失败却留下一条「可恢复」，
       用户点恢复会撞主键冲突（2026-11-10 修，旧断言把顺序写反了）。 */
    expect(snapshotAt, '快照必须在删除成功之后写').toBeGreaterThan(deleteAt);
  });
});

describe('撤销：模板与界面必须同步', () => {
  const source = stripComments(read('src/composables/useInlineEditor.js'));
  const undoBody = () => {
    const match = source.match(/const undo = async \(\) => \{([\s\S]*?)\n  \};/);
    expect(match, '找不到 undo 函数').toBeTruthy();
    return match[1];
  };

  it('撤销时要把旧值写回 row[field]（只写库会让用户看到「什么都没发生」）', () => {
    expect(undoBody()).toMatch(/row\[field\]\s*=\s*previous/);
  });

  it('撤销失败要还原界面值并塞回历史', () => {
    const body = undoBody();
    expect(body).toMatch(/row\[field\]\s*=\s*next/);
    expect(body).toContain('history.value = [...history.value, entry]');
  });
});

describe('路由', () => {
  it('/admin/shop-editor 已注册且要求 admin', () => {
    const routes = read('src/router/routes/admin.ts');
    const at = routes.indexOf("'/admin/shop-editor'");
    expect(at).toBeGreaterThan(-1);
    const block = routes.slice(at, at + 320);
    expect(block).toContain('requiresAdmin: true');
  });
});

/* ── 以下是 2026-11-09 全量复核发现的问题，逐条锁住 ────────────────────── */

describe('复核修复：多行与键盘可达性', () => {
  const text = stripComments(read('src/components/inline-editor/EditableText.vue'));

  it('多行正文必须保留换行（white-space: pre-wrap）', () => {
    expect(text).toContain("'is-multiline': multiline");
    expect(text).toMatch(/\.iet\.is-multiline\s*\{[^}]*white-space:\s*pre-wrap/);
  });

  it('编辑态卡片换成 div 后要补回 Enter/Space 打开详情', () => {
    const shop = stripComments(read('src/views/Shop/index.vue'));
    expect(shop).toMatch(/@keydown="onCardKeydown/);
    const fn = shop.match(/const onCardKeydown = \(event, product\) => \{([\s\S]*?)\n\};/);
    expect(fn, '找不到 onCardKeydown').toBeTruthy();
    // 焦点在内部输入框时不能抢键
    expect(fn[1]).toContain('event.target !== event.currentTarget');
    expect(fn[1]).toContain('openProductDetails');
  });
});

describe('复核修复：写入一致性', () => {
  const source = stripComments(read('src/composables/useInlineEditor.js'));
  const commitBody = () => {
    const match = source.match(
      /const commit = \(row, field, next, previous, table = ''\) => \{([\s\S]*?)\n  \};/,
    );
    expect(match, '找不到 commit').toBeTruthy();
    return match[1];
  };

  it('同一字段的写入必须排队（并发 PATCH 乱序会用旧值覆盖新值）', () => {
    expect(source).toContain('enqueueWrite');
    expect(commitBody()).toContain('enqueueWrite(key');
  });

  it('撤销要先入栈再落库（否则改完立刻点撤销会扑空）', () => {
    const body = commitBody();
    const pushAt = body.indexOf('pushHistory(entry)');
    const saveAt = body.indexOf('enqueueWrite(key');
    expect(pushAt).toBeGreaterThan(-1);
    expect(saveAt).toBeGreaterThan(-1);
    expect(pushAt, 'pushHistory 必须在写库之前').toBeLessThan(saveAt);
  });

  it('撤销也走同一个队列，否则会被未完成的 commit 覆盖', () => {
    const undo = source.match(/const undo = async \(\) => \{([\s\S]*?)\n  \};/);
    expect(undo, '找不到 undo').toBeTruthy();
    expect(undo[1]).toContain('enqueueWrite(key');
  });

  it('失败红边要自动消退，不能只等「下次写成功」', () => {
    expect(source).toMatch(/setTimeout\([\s\S]{0,120}markFailed\(key, false\)/);
  });

  it('删除记录后要把它从撤销栈摘掉（否则会对着已删 id 报「已撤销」）', () => {
    expect(source).toContain('const forget = (row) =>');
    expect(source).toMatch(/remove: async \(row, table = ''\) => \{[\s\S]{0,160}forget\(row\)/);
  });
});

describe('复核修复：长度上限只有一份真源', () => {
  it('商品名称的 maxLength 写在字段配置里', () => {
    const tables = read('src/views/DataManagement/config/tables.js');
    const at = tables.indexOf("key: 'title', label: '商品名称'");
    expect(at).toBeGreaterThan(-1);
    expect(tables.slice(at, at + 140)).toContain('maxLength: 25');
  });

  it('原语从注入的字段声明读上限，宿主不再各写数字', () => {
    const text = stripComments(read('src/components/inline-editor/EditableText.vue'));
    // 带 table：同名字段在不同表里约束可以不同（商品 title / 抽奖 title）
    expect(text).toContain('editor?.metaOf?.(props.field, props.table)?.maxLength');
    const shop = stripComments(read('src/views/Shop/index.vue'));
    expect(shop, '宿主不该再硬编码 max-length').not.toContain(':max-length="25"');
  });

  it('宿主把 metaOf 注入上下文', () => {
    const host = stripComments(read('src/views/ShopEditor/index.vue'));
    expect(host).toContain('metaOf');
    expect(host).toMatch(/metaOf,\s*\n\s*notify/);
  });
});

describe('EditableNumber 的换算契约', () => {
  const source = stripComments(read('src/components/inline-editor/EditableNumber.vue'));

  it('金额按 scale 双向换算，显示用固定小数位', () => {
    expect(source).toContain('props.scale');
    expect(source).toContain('toFixed(props.decimals)');
  });

  it('提交前走同一套字段校验', () => {
    expect(source).toContain('editor?.validate?.');
  });

  it('编辑态限宽，避免把 flex 价格行挤成两行', () => {
    expect(source).toMatch(/\.ien\.is-editing\s*\{[^}]*max-width/);
  });
});

describe('宿主必须继承前台的 body 级布局', () => {
  /* 2026-11-09 复核发现的真问题：编辑页少了 body.page-shop，导致同一个 Shop 组件
     在两条路由下宽度不同（前台三列 320、编辑页三列 400），左侧竖栏也不让位。
     根因是 App.vue 用 `page-${route.name}` 生成 body 类，ShopEditor 得到 page-shopeditor。 */

  it('App.vue 允许路由用 meta.bodyClass 覆盖默认类名', () => {
    const app = read('src/App.vue');
    expect(app).toContain('route.meta?.bodyClass');
    // watch 必须同时盯 name 和 bodyClass，否则同类不同名的路由切换不会重算
    expect(app).toMatch(/watch\(\(\) => \[route\.name, route\.meta\?\.bodyClass\]/);
  });

  it('/admin/shop-editor 声明复用 page-shop', () => {
    const routes = read('src/router/routes/admin.ts');
    const at = routes.indexOf("'/admin/shop-editor'");
    expect(at).toBeGreaterThan(-1);
    expect(routes.slice(at, at + 600)).toContain("bodyClass: 'page-shop'");
  });
});
