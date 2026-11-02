/**
 * 地址拆分 / 合成（2026-11-01）
 *
 * 背景：结算弹层要把「省 / 市 / 详细地址」三段分开填（用户口径），
 * 同时支持「粘贴一整段地址 → 自动识别」。但 `profiles` 只有 **一个** `shipping_address` 文本列
 * （没有省/市列），且历史数据都是整段文本 —— 所以这里定两条铁律：
 *
 *   1. 存储始终是**一段完整地址**（`composeAddress`），不新增列、不动历史数据；
 *   2. 展示时**用同一套解析器**把它拆回三段（`parseAddress`），拆不出来就整段落进「详细地址」，
 *      绝不丢字 —— 宁可让用户手动改，也不能把用户写的地址吃掉一段。
 *
 * 纯本地、不联网：没有引第三方地址库（体积 + 隐私都不划算），只做省级名称匹配 +
 * 市/地区/自治州/盟的后缀匹配。识别不了就让用户自己补，比猜错更安全。
 */

/** 省级行政区（全称）。顺序按行政区划代码，直辖市排在最前。 */
export const PROVINCES = [
  '北京市',
  '天津市',
  '上海市',
  '重庆市',
  '河北省',
  '山西省',
  '辽宁省',
  '吉林省',
  '黑龙江省',
  '江苏省',
  '浙江省',
  '安徽省',
  '福建省',
  '江西省',
  '山东省',
  '河南省',
  '湖北省',
  '湖南省',
  '广东省',
  '海南省',
  '四川省',
  '贵州省',
  '云南省',
  '陕西省',
  '甘肃省',
  '青海省',
  '台湾省',
  '内蒙古自治区',
  '广西壮族自治区',
  '西藏自治区',
  '宁夏回族自治区',
  '新疆维吾尔自治区',
  '香港特别行政区',
  '澳门特别行政区',
];

/** 粘贴文本里常见的简写 / 别称 → 全称。长名优先匹配（内蒙古自治区 先于 内蒙古）。 */
const PROVINCE_ALIASES = [
  ['内蒙古自治区', ['内蒙古', '内蒙']],
  ['广西壮族自治区', ['广西']],
  ['西藏自治区', ['西藏']],
  ['宁夏回族自治区', ['宁夏']],
  ['新疆维吾尔自治区', ['新疆']],
  ['香港特别行政区', ['香港']],
  ['澳门特别行政区', ['澳门']],
  ['北京市', ['北京']],
  ['天津市', ['天津']],
  ['上海市', ['上海']],
  ['重庆市', ['重庆']],
  ['黑龙江省', ['黑龙江']],
  ['河北省', ['河北']],
  ['山西省', ['山西']],
  ['辽宁省', ['辽宁']],
  ['吉林省', ['吉林']],
  ['江苏省', ['江苏']],
  ['浙江省', ['浙江']],
  ['安徽省', ['安徽']],
  ['福建省', ['福建']],
  ['江西省', ['江西']],
  ['山东省', ['山东']],
  ['河南省', ['河南']],
  ['湖北省', ['湖北']],
  ['湖南省', ['湖南']],
  ['广东省', ['广东']],
  ['海南省', ['海南']],
  ['四川省', ['四川']],
  ['贵州省', ['贵州']],
  ['云南省', ['云南']],
  ['陕西省', ['陕西']],
  ['甘肃省', ['甘肃']],
  ['青海省', ['青海']],
  ['台湾省', ['台湾']],
];

/** 展开成 [{ name, full }]，按名字长度倒序 —— 短名先命中会把「内蒙古」当成「内蒙」。 */
const PROVINCE_MATCHERS = PROVINCE_ALIASES.flatMap(([full, aliases]) => [
  { key: full, full },
  ...aliases.map((alias) => ({ key: alias, full })),
]).sort((a, b) => b.key.length - a.key.length);

/** 市 / 地区 / 自治州 / 盟 的后缀（区、县算详细地址，不进「市」这一段） */
const CITY_SUFFIX = /^(.{1,12}?(?:市|地区|自治州|盟))/;
const PROVINCE_PREFIX = /^(?:中国|中华人民共和国)?\s*/;

const normalize = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 把一整段地址拆成 { province, city, detail }。
 * 拆不出省 ⇒ province / city 留空、detail 保留原文（不丢字优先）。
 */
export function parseAddress(raw) {
  const text = normalize(raw);
  if (!text) return { province: '', city: '', detail: '' };

  const withoutCountry = text.replace(PROVINCE_PREFIX, '');
  let province = '';
  let rest = withoutCountry;

  for (const matcher of PROVINCE_MATCHERS) {
    if (!withoutCountry.startsWith(matcher.key)) continue;
    province = matcher.full;
    rest = withoutCountry.slice(matcher.key.length).trim();
    break;
  }

  // 省名也可能不在开头（用户习惯先写「XX路」再写省），退一步全文查找。
  // ⚠️ 这种情况**只在省后面那段里找市**：整段找会把「人民路 5 号 深圳市」整个当成市名
  // （后缀匹配是惰性的，跨过空格一路吃到「市」），详细地址就空了 —— 实测踩过。
  if (!province) {
    const hit = PROVINCE_MATCHERS.find((matcher) => withoutCountry.includes(matcher.key));
    if (hit) {
      const index = withoutCountry.indexOf(hit.key);
      const before = withoutCountry.slice(0, index).trim();
      const after = withoutCountry.slice(index + hit.key.length).trim();
      province = hit.full;

      let city = '';
      let restAfter = after;
      const cityMatch = after.match(CITY_SUFFIX);
      if (cityMatch) {
        city = cityMatch[1].trim();
        restAfter = after.slice(city.length).trim();
      }
      return {
        province,
        city,
        detail: [before, restAfter].filter(Boolean).join(' '),
      };
    }
  }

  if (!province) return { province: '', city: '', detail: withoutCountry };

  let city = '';
  const cityMatch = rest.match(CITY_SUFFIX);
  if (cityMatch) {
    city = cityMatch[1].trim();
    rest = rest.slice(city.length).trim();
  }

  return { province, city, detail: rest };
}

/**
 * 三段（任一可空）→ 一段完整地址。直接拼接不加空格：
 * 落库的是一段中文地址（`浙江省杭州市西湖区文三路 100 号`），拆 → 合必须可逆 ——
 * 历史数据没有分隔空格，加了空格反而让「识别粘贴后落库」的字面变形。
 */
export function composeAddress({ province = '', city = '', detail = '' } = {}) {
  return [province, city, detail]
    .map((part) => normalize(part))
    .filter(Boolean)
    .join('');
}

/** 是否「像一段完整地址」：至少含省/市/区县/路/号之一，够长才自动填，避免误伤短文本 */
export function looksLikeFullAddress(value) {
  const text = normalize(value);
  if (text.length < 8) return false;
  return /(省|自治区|特别行政区|市|区|县|旗|镇|乡|街道|路|街|道|巷|号|栋|楼|室)/.test(text);
}
