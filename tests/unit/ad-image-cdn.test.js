/**
 * 信息流广告图地址解析守卫（2026-11-11 线上「白图」事故）
 *
 * 事故现场：论坛信息流里的广告卡上，图片区永远是一块近白底（`.ad-slot-media`
 * 的 `#f2f2f4`），后台「上传到 Cloud」之后再传一张也照旧白。
 *
 * 根因：`AdSlot.vue` 的模板直接把库值塞进 `src`：
 *     <img :src="ad.image_url" ... />
 * `advertisements.image_url` 存的是上传返回的 **Cloudinary 原址**
 * （`https://res.cloudinary.com/<cloud>/image/upload/...`），而该域名在中国大陆不可达
 * （实测记录见 `utils/db-image-url.js` 头部，2026-09-29 起全站统一改写到
 * `cdn.blockofhome.cn`）。全站其它库图都走 `resolveDbImageUrl`，只有广告位漏了。
 *
 * ⚠️ 这条缺陷的**表象特别容易误判**：请求是 TLS 阶段挂起，不是 rejected
 * ⇒ `@error` 不触发 ⇒ 连 📢 占位都不出现，只剩一块接近纯白的底色，
 * 所以报障文案是「白图」而不是「裂图」。因此下面的守卫只能锁**渲染用的 src 域名**，
 * 不能锁「有没有触发 error」。
 *
 * 后台那一半（「上传了也是白图」）：`EditDrawer` 的预览与 `DataAdmin` 的列表/卡片缩略图
 * 当时走的是 `getImageUrl`（asset-helper）——它对 `http(s)` **原样直通**，不做 CDN 改写，
 * 于是同一张图在后台也白。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveDbAdImage, DB_AD_IMAGE_TRANSFORM } from '@/utils/db-image-url.js';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const CLOUDINARY_AD =
  'https://res.cloudinary.com/dkqae7j1m/image/upload/v1794362329/boh-cloud-plus/admin-ads/rivr2pyugfsi2azo4qb8.jpg';

describe('广告图解析：Cloudinary 原址必须改写到自建 CDN', () => {
  it('换成 cdn.blockofhome.cn，且保留云名（CDN 是 Cloudinary 的 CNAME，去掉就 404）', () => {
    const url = resolveDbAdImage(CLOUDINARY_AD);
    expect(url).not.toContain('res.cloudinary.com');
    expect(url.startsWith('https://cdn.blockofhome.cn/')).toBe(true);
    expect(url).toContain('/dkqae7j1m/');
    expect(url.endsWith('rivr2pyugfsi2azo4qb8.jpg')).toBe(true);
  });

  it('带 f_auto + 宽度上限变换（原图 81KB 的 750×750 方图，广告卡只用 724×427）', () => {
    const url = resolveDbAdImage(CLOUDINARY_AD);
    expect(url).toContain(DB_AD_IMAGE_TRANSFORM);
    expect(DB_AD_IMAGE_TRANSFORM).toContain('f_auto');
    expect(DB_AD_IMAGE_TRANSFORM).toContain('w_1400');
  });

  it('必须是 c_limit 而不是 c_fill：裁切决策归 CSS 的 object-fit，预裁会让 card_size=auto 档变形', () => {
    expect(DB_AD_IMAGE_TRANSFORM).toContain('c_limit');
    expect(DB_AD_IMAGE_TRANSFORM).not.toContain('c_fill');
    // 与卡片档（c_fill,w_640,h_440 固定框）明确区分，避免有人图省事合并两档
    expect(DB_AD_IMAGE_TRANSFORM).not.toBe('f_auto,q_auto:good,c_fill,w_640,h_440');
  });

  it('幂等：已是 CDN 地址不二次改写、不重复插变换段', () => {
    const once = resolveDbAdImage(CLOUDINARY_AD);
    const twice = resolveDbAdImage(once);
    expect(twice).toBe(once);
    expect(twice.match(/c_limit/g)?.length).toBe(1);
  });

  it('空值 → 空串（调用方据此退回 📢 占位，不渲染空 src 的 img）', () => {
    expect(resolveDbAdImage('')).toBe('');
    expect(resolveDbAdImage(null)).toBe('');
    expect(resolveDbAdImage(undefined)).toBe('');
  });

  it('外链广告图（非 Cloudinary）原样返回，不被套上 CDN 主机', () => {
    const external = 'https://cdn.example.org/promo.png';
    expect(resolveDbAdImage(external)).toBe(external);
  });
});

describe('AdSlot.vue：广告图必须经解析函数，不得直用库值', () => {
  const slot = read('src/views/Forum/components/AdSlot.vue');

  it('引入并使用 resolveDbAdImage', () => {
    expect(slot).toContain('resolveDbAdImage');
    expect(slot).toMatch(/const mediaUrl = computed\(\(\) =>\s*resolveDbAdImage\(/);
    expect(slot).toContain(':src="mediaUrl"');
  });

  it('反证：模板里不得再出现 `:src="ad.image_url"`（事故现场写法）', () => {
    expect(slot).not.toContain(':src="ad.image_url"');
    expect(slot).not.toMatch(/:src="[^"]*\bad\.image_url/);
  });

  it('加载失败退回 📢 占位，且失败标记按 URL 记账（换图能自动恢复）', () => {
    expect(slot).toContain('useImageFailure');
    expect(slot).toContain('@error="markFailed(mediaUrl)"');
  });
});

describe('后台预览：图片地址同样不得直通（「上传了也是白图」的另一半）', () => {
  const targets = {
    'src/views/DataManagement/components/EditDrawer.vue': 'resolveDbImageUrl',
    'src/views/DataManagement/DataAdmin.vue': 'resolveDbImageUrl',
  };

  for (const [file, symbol] of Object.entries(targets)) {
    it(`${file} 走 ${symbol}，不再用 getImageUrl`, () => {
      const source = read(file);
      expect(source).toContain(symbol);
      // getImageUrl 对 http(s) 原样直通，不改写 Cloudinary 主机 —— 用它预览库图必然白
      expect(source).not.toContain('getImageUrl');
    });
  }
});
