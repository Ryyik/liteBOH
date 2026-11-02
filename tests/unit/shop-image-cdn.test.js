/**
 * 周边商城图片地址解析守卫（2026-11-02 线上裂图事故）
 *
 * 事故现场（用户三张线上截图）：
 *   · 商品卡「8 周年纪念海报」—— 蓝底问号（Safari 的裂图图标）
 *   · 抽奖卡「中秋节抽奖 / 七夕抽奖」—— 整块灰，图始终不出现
 *   · 订单列表每一行 —— 空白方块（`@error` 把 img 隐藏了）
 *
 * 根因是**同一个**：这三处的 `src` 直接用了数据库原值。库里混存两种形态：
 *   ① `mascot-new-landscape-orig.webp` 裸文件名 → 必须经 getImageUrl 映射打包产物，
 *      直接塞进 src 会被解析成 `/mascot-new-landscape-orig.webp` → 404（订单列表全空即此）
 *   ② `https://res.cloudinary.com/...` → 该域名**中国大陆不可达**（同 `utils/db-image-url.js`
 *      头部 2026-09-29 的实测记录），且是无变换的 1MB+ 原图（抽奖封面一直灰着即此）
 *
 * 真源：`src/utils/db-image-url.js` 的 `resolveDbCardImage` / `resolveDbDetailImage`。
 * 这组测试锁两件事：解析函数本身的行为，以及**周边各视图必须走它**（防止再手写 src）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveDbCardImage, resolveDbDetailImage } from '@/utils/db-image-url.js';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const CLOUDINARY_POSTER =
  'https://res.cloudinary.com/dkqae7j1m/image/upload/v1786423219/boh-cloud-plus/admin-shop-console/eqarepv0lcvcy65hugbd.webp';

describe('解析函数：Cloudinary 原址必须改写到自建 CDN', () => {
  it('卡面：换成 cdn.blockofhome.cn，并带上卡面尺寸变换', () => {
    const url = resolveDbCardImage(CLOUDINARY_POSTER);
    expect(url).not.toContain('res.cloudinary.com');
    expect(url.startsWith('https://cdn.blockofhome.cn/')).toBe(true);
    expect(url).toContain('/image/upload/');
    expect(url).toContain('f_auto');
    expect(url).toContain('w_640');
    /* 云名（路径第一段）必须保留：CDN 是 Cloudinary 的 CNAME，去掉就 404 */
    expect(url).toContain('/dkqae7j1m/');
  });

  it('详情：只压不拉（c_limit），不会把小图放大糊掉', () => {
    const url = resolveDbDetailImage(CLOUDINARY_POSTER);
    expect(url).not.toContain('res.cloudinary.com');
    expect(url).toContain('c_limit');
    expect(url).toContain('w_1600');
  });

  it('空值返回空串（调用方据此走占位，不渲染空 src 的 img）', () => {
    expect(resolveDbCardImage('')).toBe('');
    expect(resolveDbCardImage(null)).toBe('');
    expect(resolveDbDetailImage(undefined)).toBe('');
  });

  it('已是自建 CDN 的地址不被二次改写（幂等）', () => {
    const already = resolveDbCardImage(CLOUDINARY_POSTER);
    expect(resolveDbCardImage(already)).toBe(already);
  });

  it('裸文件名解析成可访问路径（订单列表全空方块的直接成因）', () => {
    /* 库里 `mascot-new-landscape-orig.webp` 这类值直接进 src 会被浏览器按当前路由
       解析成 `/mascot-new-landscape-orig.webp` → 404。解析后必须是带目录的路径。 */
    const url = resolveDbCardImage('mascot-new-landscape-orig.webp');
    expect(url).not.toBe('mascot-new-landscape-orig.webp');
    expect(url).toMatch(/^(\/|https?:\/\/)/);
    expect(url).toContain('mascot-new-landscape-orig');
    expect(url.endsWith('.webp')).toBe(true);
  });
});

describe('周边各视图：图片必须经解析函数，不得直用库里的原值', () => {
  const views = {
    'src/views/Shop/index.vue': 'resolveDbCardImage',
    'src/views/Shop/ProductDetailSheet.vue': 'resolveDbDetailImage',
    'src/views/Shop/BagPanel.vue': 'resolveDbCardImage',
    'src/views/Shop/LotteryPanel.vue': 'resolveDbCardImage',
    'src/views/Shop/LotteryDetailSheet.vue': 'resolveDbDetailImage',
    'src/views/Shop/OrderPanel.vue': 'resolveDbCardImage',
    'src/views/Shop/OrderDetailSheet.vue': 'resolveDbCardImage',
  };

  for (const [file, symbol] of Object.entries(views)) {
    it(`${file} 走 ${symbol}`, () => {
      const source = read(file);
      expect(source).toContain(`import { ${symbol} } from '@/utils/db-image-url.js'`);
      expect(source).toContain(`${symbol}(`);
    });
  }

  it('没有任何视图把 image / cover_image_url 直接塞进 img[src]', () => {
    /* 事故三连的原始写法：src 直接吃库值。留一条正则守在这里，
       以后新加卡片忘了走解析函数，这条会先红。 */
    const rawSrcPattern =
      /:src="(?:item|product|order)\.(?:image|cover_image_url)"|:src="item\.cover_image_url"/;
    const offenders = Object.keys(views).filter((file) => rawSrcPattern.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('订单缩略图先解析再渲染（全空方块的直接成因）', () => {
    const panel = read('src/views/Shop/OrderPanel.vue');
    expect(panel).toMatch(/const thumbOf = \(order\) =>\s*resolveDbCardImage\(/);
    expect(panel).not.toContain("String(order?.items?.[0]?.image || order?.image || '').trim()");
  });

  it('抽奖封面先解析再渲染（1MB 原图 + 大陆不可达 = 一直灰着）', () => {
    const panel = read('src/views/Shop/LotteryPanel.vue');
    expect(panel).toMatch(/const coverOf = \(item\) =>\s*resolveDbCardImage\(/);
    expect(panel).not.toContain(':src="item.cover_image_url"');
  });
});

describe('裂图兜底：失败后退回占位图标，不留碎图问号', () => {
  it('统一走 useImageFailure，而不是各写一份 ref', () => {
    for (const file of [
      'src/views/Shop/index.vue',
      'src/views/Shop/ProductDetailSheet.vue',
      'src/views/Shop/BagPanel.vue',
      'src/views/Shop/LotteryPanel.vue',
      'src/views/Shop/LotteryDetailSheet.vue',
      'src/views/Shop/OrderPanel.vue',
      'src/views/Shop/OrderDetailSheet.vue',
    ]) {
      const source = read(file);
      expect(source).toContain('@/composables/useImageFailure.js');
      expect(source).toContain('@error=');
    }
  });

  it('错误处理不再用 style.display=none（那会留一个空方块）', () => {
    for (const file of ['src/views/Shop/OrderPanel.vue', 'src/views/Shop/OrderDetailSheet.vue']) {
      expect(read(file)).not.toContain('@error="$event.target.style.display = \'none\'"');
    }
  });
});
