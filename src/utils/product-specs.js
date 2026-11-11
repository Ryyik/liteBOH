/**
 * product-specs.js —— 商品「规格选项」的**单一真源**
 *
 * 背景（2026-11-11 用户报障）：规格曾经是「显示名称 + 内部值」两栏，
 * 运营几乎必然填错。线上实际数据就是三种错法并存：
 *
 *   · id=412 斜挎包  [{label:'配色', value:'蓝'}, {label:'配色', value:'卡其'}, …]
 *       —— 把「配色」当名称重复填三遍 ⇒ 详情页三个按钮**全都叫「配色」**，用户没法选；
 *          卡片 chips 还会渲染成「配色 蓝 配色 卡其 配色 灰」。
 *   · id=410 热水袋  [{label:'棕色', value:'棕色外观'}, …]
 *       —— 名称填对了，值多加「外观」二字，两栏各填一半语义。
 *   · id=304 纪念册  [{label:'硬壳精装版', value:'Hardcover'}]
 *       —— 唯一用对的一例，但运营根本记不住「什么时候该填英文」。
 *   · id=299/300     [{label:'绝版', value:'A2H'}]、[{label:'现货', value:'A2H'}]
 *       —— value 是随手敲的，同一商品同 value 还会撞车。
 *
 * 结论：**「名称 + 值」这个模型对这家店的规模是负收益**。运营只需要「有哪些可选」，
 * 用户只需要「点一个」。所以读取层统一归一成「一个选项名」，双栏 UI 一并撤掉。
 *
 * 数据契约（不变）：库里仍是 `[{ label, value }]`。归一后 `label === value`，
 * 保留 `value` 只是因为下游契约还在用：
 *   · `stores/bag.ts` 用 `selectedSpec`（= value）做购物袋同一商品不同规格的行去重；
 *   · 下单 RPC 快照写 `selected_spec` / `selected_spec_label` 两个字段。
 * 把两者统一成同一字符串后，这两个下游**一个字都不用改**，历史订单也不受影响
 * （订单里存的是当时的字符串快照）。
 *
 * ⚠️ 归一发生在**读取层**而不是靠一次性刷库：库里那些错数据不必迁移就自动愈合，
 * 运营下次在后台保存时自然会写回干净形态。改写库会动历史数据，收益为零、风险不小。
 */

/** 一条规格行的最大长度（与旧面板的 maxlength 对齐） */
export const SPEC_NAME_MAX_LENGTH = 24;

/** 单件商品最多几行规格（面板上限，防止误贴一长串把 UI 撑爆） */
export const SPEC_MAX_ROWS = 10;

/**
 * 旧数据里被当成「显示名称」的那一类通用词。
 *
 * 命中它且 `value` 有实质内容时，选项名取 `value` —— 这是斜挎包那类数据的解药：
 * 单条 `{label:'配色', value:'蓝'}` 归一后应该是「蓝」，不是「配色」。
 */
const GENERIC_SPEC_NAMES = new Set([
  '规格',
  '规格值',
  '规格选项',
  '属性',
  '配色',
  '颜色',
  '色彩',
  '色',
  '尺码',
  '尺寸',
  '大小',
  '款式',
  '型号',
  '版本',
]);

const trimText = (value) => String(value ?? '').trim();

/** 兼容三种落库形态：数组 / JSON 字符串 / 空 */
const coerceSpecArray = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/**
 * 把任意形态的规格数据归一成「干净的可选值列表」。
 *
 * @param {unknown} raw 数据库原值（数组 / JSON 字符串 / null）
 * @returns {{ label: string, value: string }[]} `label === value`，已去重、已剔空
 */
export function normalizeProductSpecs(raw) {
  const rows = coerceSpecArray(raw)
    .map((item) => {
      // 也兼容「直接给字符串数组」的写法：['红','黄'] —— 没有双栏时这是最自然的形态
      if (typeof item === 'string') {
        const text = trimText(item);
        return { label: text, value: text };
      }
      if (!item || typeof item !== 'object') return { label: '', value: '' };
      return { label: trimText(item.label), value: trimText(item.value) };
    })
    .filter((row) => row.label || row.value);

  if (!rows.length) return [];

  // 先统计同名次数：「配色」出现 3 次 ⇒ 说明运营把类目名填进了名称栏，真实选项在 value 里
  const labelCount = new Map();
  for (const row of rows) {
    if (!row.label) continue;
    labelCount.set(row.label, (labelCount.get(row.label) || 0) + 1);
  }

  const seen = new Set();
  const normalized = [];
  for (const row of rows) {
    const labelIsDuplicated = row.label ? (labelCount.get(row.label) || 0) > 1 : false;
    const labelIsGeneric = GENERIC_SPEC_NAMES.has(row.label);

    // 选项名的取值优先级：重复/通用词 ⇒ value；否则 ⇒ label；最后兜底另一个非空值
    const text = (
      labelIsDuplicated || labelIsGeneric ? row.value || row.label : row.label || row.value
    ).slice(0, SPEC_NAME_MAX_LENGTH);

    if (!text || seen.has(text)) continue;
    seen.add(text);
    normalized.push({ label: text, value: text });
  }

  return normalized;
}

/**
 * 把一段「红,黄,蓝」/「红，黄，蓝」/ 换行分隔的文本拆成选项数组。
 *
 * 只用于**粘贴**与批量快捷输入，不参与逐字输入（中文输入法下逐字拆分会打断组词）。
 *
 * @param {string} text
 * @returns {string[]} 已 trim、已去空、已去重的选项名
 */
export function parseSpecInput(text) {
  const parts = trimText(text)
    .split(/[,，、;；\n\r]+/)
    .map((part) => trimText(part).slice(0, SPEC_NAME_MAX_LENGTH))
    .filter(Boolean);

  return Array.from(new Set(parts));
}

/**
 * 把选项名数组包成落库形态（`{label, value}` 双写同一个字符串）。
 *
 * 刻意**不在这里去重**：重复是 user error，要由 `validateSpecNames` 报给用户，
 * 静默吞掉会让人以为「填了 3 个怎么只存了 2 个」。
 * @param {string[]} names
 */
export const toSpecRecords = (names) =>
  (Array.isArray(names) ? names : parseSpecInput(names))
    .map((name) => trimText(name).slice(0, SPEC_NAME_MAX_LENGTH))
    .filter(Boolean)
    .map((name) => ({ label: name, value: name }));

/** 选项名数组是否合法（非空、无重复、不超上限）—— 返回错误文案，通过则返回空串 */
export function validateSpecNames(names) {
  const list = Array.isArray(names) ? names.map(trimText).filter(Boolean) : [];
  if (list.length > SPEC_MAX_ROWS) {
    return `最多 ${SPEC_MAX_ROWS} 个可选值`;
  }
  const duplicated = list.find((name, index) => list.indexOf(name) !== index);
  if (duplicated) {
    return `可选值「${duplicated}」重复了，用户会分不清选的是哪一个`;
  }
  const tooLong = list.find((name) => name.length > SPEC_NAME_MAX_LENGTH);
  if (tooLong) {
    return `可选值最长 ${SPEC_NAME_MAX_LENGTH} 个字`;
  }
  return '';
}
