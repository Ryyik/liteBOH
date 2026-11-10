import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf8');

/** 去掉注释：说明性文字里会引用这些字符串，那是解释不是实现 */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const card = () => stripComments(read('src/views/Shop/LotteryCard.vue'));
const panel = () => stripComments(read('src/views/Shop/LotteryPanel.vue'));

describe('抽奖卡抽组件：卡片只有一份实现（plans/042 §10.4 A 档）', () => {
  it('LotteryPanel 不再自己写卡片标记，改用 LotteryCard', () => {
    const source = panel();
    expect(source).toContain("from './LotteryCard.vue'");
    // 卡片的壳、封面、标题区都搬走了：面板里不该再出现这些 class
    for (const marker of ['class="lt-card"', 'class="lt-cover"', 'class="lt-title"', 'lt-body']) {
      expect(source, `面板里仍残留 ${marker}`).not.toContain(marker);
    }
  });

  it('两个分组复用同一个组件（进行中 / 历史），没有第二份模板', () => {
    const source = panel();
    expect(source.match(/<LotteryCard/g)?.length).toBe(2);
    expect(source).toContain(':lottery="item"');
  });

  it('卡片样式随模板一起搬进组件（面板不再留 .lt-card 规则）', () => {
    expect(panel()).not.toMatch(/\.lt-card\s*\{/);
    expect(card()).toMatch(/\.lt-card\s*\{/);
  });

  it('字段写回走事件，卡片不直接改 prop 对象', () => {
    const source = card();
    expect(source).toContain("emit('update:field'");
    expect(source).not.toMatch(/lottery\.(title|prize_title|cover_image_url)\s*=[^=]/);
    expect(panel()).toContain('applyField');
  });
});

describe('抽奖卡就地编辑', () => {
  it('三个原语都声明目标表 lotteries（否则会写到 products 上）', () => {
    const source = card();
    expect(source.match(/table="lotteries"/g)?.length).toBe(3);
    for (const field of ['field="title"', 'field="prize_title"', 'field="cover_image_url"']) {
      expect(source).toContain(field);
    }
  });

  it('编辑态根节点换成 div（卡片内部有可点元素，button 里不能再嵌 button）', () => {
    expect(card()).toMatch(/:is="isInlineEditing \? 'div' : 'button'"/);
  });

  it('编辑态根节点补回键盘入口，且焦点在输入框时不抢键', () => {
    const source = card();
    expect(source).toMatch(/@keydown="onKeydown"/);
    expect(source).toContain("emit('open', props.lottery, null)");
  });

  it('删除按钮只在编辑态渲染，并带上表名', () => {
    const source = card();
    expect(source).toMatch(/v-if="isInlineEditing"[\s\S]{0,200}class="lt-remove"/);
    expect(source).toContain("inlineEditor.remove(props.lottery, 'lotteries')");
  });

  it('状态 / 报名数 / 开奖时间不可就地改（枚举与投影，走完整表单）', () => {
    const source = card();
    for (const field of ['field="status"', 'field="entry_count"', 'field="draw_at"']) {
      expect(source).not.toContain(field);
    }
  });

  it('封面兜底逻辑只有一份（CDN 改写 + 加载失败降级）', () => {
    const source = card();
    expect(source).toContain('resolveDbCardImage');
    expect(source).toContain('useImageFailure');
    expect(panel()).not.toContain('resolveDbCardImage');
  });
});

describe('一页两表：上下文与原语都按表区分', () => {
  it('写入键带表名，同名字段不会互相串忙碌态', () => {
    const ctx = stripComments(read('src/composables/useInlineEditor.js'));
    expect(ctx).toContain("const keyOf = (row, field, table = '')");
    expect(ctx).toContain("`${table}#${row?.id ?? 'new'}:${field}`");
  });

  it('commit / undo / remove 都把表透传给宿主', () => {
    const ctx = stripComments(read('src/composables/useInlineEditor.js'));
    expect(ctx).toContain('save(row, field, next, table)');
    expect(ctx).toContain('save(row, field, previous, table)');
    expect(ctx).toContain('await remove(row, table)');
    expect(ctx).toContain('labelOf?.(field, table)');
  });

  it('三个原语都声明 table 并传递下去', () => {
    for (const name of ['EditableText', 'EditableImage', 'EditableNumber']) {
      const source = stripComments(read(`src/components/inline-editor/${name}.vue`));
      expect(source, `${name} 缺 table prop`).toContain("table: { type: String, default: '' }");
    }
    const text = stripComments(read('src/components/inline-editor/EditableText.vue'));
    expect(text).toContain('props.table)');
    expect(text).toContain('editor?.validate?.(props.field, next, props.row, props.table)');
    const image = stripComments(read('src/components/inline-editor/EditableImage.vue'));
    expect(image).toContain('editor.uploadImage(props.row, props.field, file, props.table)');
  });

  it('宿主按表取字段配置，商品路径保持默认（传空 = products）', () => {
    const host = stripComments(read('src/views/ShopEditor/index.vue'));
    expect(host).toContain('dataConfig.lotteries.table');
    expect(host).toContain('dataConfig.lotteries.fields');
    expect(host).toContain('metaOfTable');
    // 校验与上限都必须带表，否则抽奖 title 会按商品规则校验
    expect(host).toContain('validateInlineField(metaOf(field, table), value)');
    expect(host).toContain('metaOfTable(table).fields.find');
  });

  it('抽奖封面与商品图分目录上传，便于定位链路', () => {
    const host = stripComments(read('src/views/ShopEditor/index.vue'));
    expect(host).toContain('boh-cloud-plus/admin-lottery-inline');
    expect(host).toContain('boh-cloud-plus/admin-shop-inline');
  });

  it('删除快照记的是真实表与对应 tab（恢复时才会落到对的表）', () => {
    const host = stripComments(read('src/views/ShopEditor/index.vue'));
    expect(host).toContain('recordDeletedSnapshot(original || row, target)');
    expect(host).toContain('tab: meta.tab');
    expect(host).toContain('tabLabel: meta.label');
  });
});
