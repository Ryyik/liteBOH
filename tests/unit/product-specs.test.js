/**
 * 商品「可选规格」单一真源守卫（2026-11-11 用户报障）
 *
 * 报障原话：「这个商城的规格不对啊…现在还有个名称和值，很容易搞错，你看这个包的就是」。
 * 线上数据（`select specifications from products`）三种错法并存，全部是双栏造成的：
 *
 *   · id=412 斜挎包   [{label:'配色',value:'蓝'}, {label:'配色',value:'卡其'}, {label:'配色',value:'灰'}]
 *        ⇒ 详情页三个按钮**全叫「配色」**，用户根本没法选；
 *          卡片 chips 渲染成「配色 蓝 配色 卡其 配色 灰」。
 *   · id=410 热水袋   [{label:'棕色',value:'棕色外观'}, …]   ⇒ 名称对、值多加「外观」。
 *   · id=304 纪念册   [{label:'硬壳精装版',value:'Hardcover'}] ⇒ 唯一用对的一例。
 *   · id=299/300     [{label:'绝版',value:'A2H'}, …]        ⇒ value 随手敲的，还会撞车。
 *
 * 新契约：**一个可选值就是一个词**。读取层归一出「用户看到并点选的那个词」，
 * 落库仍写 `{label, value}` 但两者同值（下游加购去重 / 订单快照读 value，不用改）。
 *
 * 下面的用例直接把上面四条真实数据钉住 —— 归一规则一旦被改回「只做形态兼容」，
 * 前四条立刻变红。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeProductSpecs,
  parseSpecInput,
  toSpecRecords,
  validateSpecNames,
  SPEC_MAX_ROWS,
  SPEC_NAME_MAX_LENGTH,
} from '@/utils/product-specs.js';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const namesOf = (raw) => normalizeProductSpecs(raw).map((item) => item.label);

describe('线上真实数据的归一结果（事故现场四条）', () => {
  it('斜挎包：名称栏重复填「配色」时，选项取 value —— 三个按钮必须分别叫 蓝/卡其/灰', () => {
    const raw = [
      { label: '配色', value: '蓝' },
      { label: '配色', value: '卡其' },
      { label: '配色', value: '灰' },
    ];
    expect(namesOf(raw)).toEqual(['蓝', '卡其', '灰']);
  });

  it('热水袋：名称唯一时保留名称，不被 value 里多余的「外观」二字带走', () => {
    const raw = [
      { label: '棕色', value: '棕色外观' },
      { label: '白色', value: '白色外观' },
    ];
    expect(namesOf(raw)).toEqual(['棕色', '白色']);
  });

  it('纪念册：单个规格取名称（Hardcover 这种内部值不该露给用户）', () => {
    expect(namesOf([{ label: '硬壳精装版', value: 'Hardcover' }])).toEqual(['硬壳精装版']);
  });

  it('小熊/面包：value 是随手敲的 A2H，用户看到的必须是 绝版 / 现货', () => {
    expect(namesOf([{ label: '绝版', value: 'A2H' }])).toEqual(['绝版']);
    expect(namesOf([{ label: '现货', value: 'A2H' }])).toEqual(['现货']);
  });

  it('归一后 label 与 value 恒等（下游按 value 去重/快照才不会与展示错位）', () => {
    for (const raw of [
      [{ label: '配色', value: '蓝' }],
      [{ label: '棕色', value: '棕色外观' }],
      [{ label: '硬壳精装版', value: 'Hardcover' }],
    ]) {
      for (const item of normalizeProductSpecs(raw)) {
        expect(item.label).toBe(item.value);
      }
    }
  });
});

describe('归一函数本身', () => {
  it('单条且名称是通用词（配色/尺码…）时取 value', () => {
    expect(namesOf([{ label: '配色', value: '蓝' }])).toEqual(['蓝']);
    expect(namesOf([{ label: '尺码', value: 'M' }])).toEqual(['M']);
  });

  it('兼容 JSON 字符串与「纯字符串数组」两种落库形态', () => {
    expect(namesOf('[{"label":"配色","value":"蓝"},{"label":"配色","value":"灰"}]')).toEqual([
      '蓝',
      '灰',
    ]);
    expect(namesOf(['红', '黄', '蓝'])).toEqual(['红', '黄', '蓝']);
  });

  it('空值 / 非数组 / 坏 JSON 一律返回空数组（调用方据此走「单一款式」）', () => {
    for (const raw of [null, undefined, '', '   ', 'not-json', 42, {}]) {
      expect(normalizeProductSpecs(raw)).toEqual([]);
    }
  });

  it('剔除空行与两侧空白，并按选项名去重（保留首个）', () => {
    expect(
      namesOf([
        { label: ' 红 ', value: '' },
        { label: '', value: '' },
        { label: '红', value: '红' },
        { label: '蓝', value: '蓝' },
      ]),
    ).toEqual(['红', '蓝']);
  });

  it('超长选项名按上限截断，不会把卡片挤爆', () => {
    const long = '很'.repeat(SPEC_NAME_MAX_LENGTH + 10);
    const [first] = normalizeProductSpecs([{ label: long, value: long }]);
    expect(first.label.length).toBe(SPEC_NAME_MAX_LENGTH);
  });
});

describe('批量输入：运营直接粘「红,黄,蓝」', () => {
  it('中英文逗号、顿号、分号、换行都当分隔符', () => {
    expect(parseSpecInput('红,黄,蓝')).toEqual(['红', '黄', '蓝']);
    expect(parseSpecInput('红，黄，蓝')).toEqual(['红', '黄', '蓝']);
    expect(parseSpecInput('红、黄；蓝\n灰')).toEqual(['红', '黄', '蓝', '灰']);
  });

  it('拆完去空、去重（运营常粘成「红,,蓝」）', () => {
    expect(parseSpecInput('红, ,蓝,红')).toEqual(['红', '蓝']);
  });

  it('落库形态双写同值', () => {
    expect(toSpecRecords(['红', '蓝'])).toEqual([
      { label: '红', value: '红' },
      { label: '蓝', value: '蓝' },
    ]);
  });

  it('toSpecRecords 不去重：重复是 user error，要由校验报出来而不是静默吞掉', () => {
    expect(toSpecRecords(['红', '红'])).toHaveLength(2);
    expect(validateSpecNames(['红', '红'])).toContain('重复');
  });
});

describe('校验文案', () => {
  it('重复值必须拦住（旧实现是「规格值不能重复」，现在按选项名判）', () => {
    expect(validateSpecNames(['蓝', '蓝'])).toContain('重复');
  });

  it('合法列表返回空串', () => {
    expect(validateSpecNames(['蓝', '卡其', '灰'])).toBe('');
    expect(validateSpecNames([])).toBe('');
  });

  it('超过上限被拦', () => {
    const tooMany = Array.from({ length: SPEC_MAX_ROWS + 1 }, (_, i) => `值${i}`);
    expect(validateSpecNames(tooMany)).toContain(String(SPEC_MAX_ROWS));
  });
});

describe('编辑面板：双栏必须消失', () => {
  const panels = [
    'src/views/ShopConsole/index.vue',
    'src/views/Shop/ProductSpecsSheet.vue',
    'src/views/DataManagement/components/EditDrawer.vue',
  ];

  for (const file of panels) {
    it(`${file} 只有「可选值」一栏，不再有名称/值两个输入框`, () => {
      const source = read(file);
      // 只认**属性里**的事故写法（注释里会提到历史，那是应该留的）
      expect(source).not.toMatch(/placeholder="内部值"/);
      expect(source).not.toMatch(/placeholder="显示名称"/);
      expect(source).not.toMatch(/placeholder="规格值（M）"/);
      expect(source).not.toMatch(/placeholder="规格名称（尺码）"/);
      expect(source).not.toMatch(/placeholder="规格值"/);
      expect(source).not.toMatch(/placeholder="规格名称"/);
      expect(source).not.toMatch(/aria-label="规格内部值"/);
      expect(source).not.toMatch(/aria-label="规格显示名称"/);
    });
  }

  it('两个持有数据的面板接入单一真源（EditDrawer 只做 UI，写入走 emit，不需要 import）', () => {
    for (const file of [
      'src/views/ShopConsole/index.vue',
      'src/views/Shop/ProductSpecsSheet.vue',
    ]) {
      expect(read(file)).toContain('product-specs.js');
    }
  });

  it('保存时统一走 toSpecRecords（label/value 双写），不再各自 filter 两栏', () => {
    const console_ = read('src/views/ShopConsole/index.vue');
    expect(console_).toMatch(/specifications:\s*toSpecRecords\(/);
    expect(console_).not.toMatch(/item\.label\.trim\(\)\s*&&\s*item\.value\.trim\(\)/);

    const sheet = read('src/views/Shop/ProductSpecsSheet.vue');
    expect(sheet).toContain('toSpecRecords(names)');
  });

  it('前台卡片 chips 只显示一个词，不再拼「名称 值」', () => {
    const shop = read('src/views/Shop/index.vue');
    expect(shop).not.toContain('{{ spec.label }} {{ spec.value }}');
  });

  it('后台数据管理保存商品时也走归一（顺手洗掉历史脏数据），不再按 label && value 静默丢行', () => {
    const strategies = read('src/views/DataManagement/config/saveStrategies.js');
    expect(strategies).toContain('normalizeProductSpecs(editingItem.specifications)');
    expect(strategies).not.toMatch(/filter\(\(spec\)\s*=>\s*spec\.label\s*&&\s*spec\.value\)/);
  });
});

describe('详情页不再显示商品分类（2026-11-11：吐司顶着「BOH Bag」）', () => {
  it('ProductDetailSheet 模板里没有分类行，也没有遗留的死 CSS', () => {
    const sheet = read('src/views/Shop/ProductDetailSheet.vue');
    expect(sheet).not.toContain('{{ product.category }}');
    expect(sheet).not.toContain('class="surface-category"');
    expect(sheet).not.toContain('.surface-category {');
  });
});
