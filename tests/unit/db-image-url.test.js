import { beforeEach, describe, expect, it, vi } from 'vitest';

// cloudinary-client 会 import supabase-client，测试环境不需要真实客户端
vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'mycloud');
vi.stubEnv('VITE_CLOUDINARY_DELIVERY_BASE_URL', 'https://cdn.example.com');

const {
  resolveDbImageUrl,
  resolveDbCardImage,
  resolveDbDetailImage,
  resolveDbPointsCardImage,
  DB_CARD_IMAGE_TRANSFORM,
  DB_DETAIL_IMAGE_TRANSFORM,
  DB_POINTS_CARD_IMAGE_TRANSFORM,
} = await import('../../src/utils/db-image-url.js');

const CLOUDINARY_PNG =
  'https://res.cloudinary.com/mycloud/image/upload/v1784647508/boh-cloud-plus/admin-activities/abc.png';
const CLOUDINARY_JPG =
  'https://res.cloudinary.com/mycloud/image/upload/v1786419554/boh-cloud-plus/admin-activities/def.jpg';

describe('db-image-url', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('空值与直通', () => {
    it('空 / null / undefined → 空串（调用方据此走占位，不渲染空 src 的 img）', () => {
      expect(resolveDbImageUrl('')).toBe('');
      expect(resolveDbImageUrl(null)).toBe('');
      expect(resolveDbImageUrl(undefined)).toBe('');
      expect(resolveDbImageUrl('   ')).toBe('');
    });

    it('已是自建 CDN 的地址原样返回（幂等，不会被二次改写）', () => {
      const url = 'https://cdn.example.com/mycloud/image/upload/v1/a.png';
      expect(resolveDbImageUrl(url)).toBe(url);
      expect(resolveDbCardImage(url)).toBe(url);
    });

    it('非 Cloudinary 的外链原样返回', () => {
      const url = 'https://example.org/photo.webp';
      expect(resolveDbImageUrl(url)).toBe(url);
      expect(resolveDbCardImage(url)).toBe(url);
    });

    it('data: / blob: 原样返回', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      expect(resolveDbImageUrl(dataUrl)).toBe(dataUrl);
      expect(resolveDbCardImage(dataUrl)).toBe(dataUrl);
    });
  });

  describe('本地别名 @/assets 解析', () => {
    it('@/ 别名被解析成非空的可渲染 URL，且不再残留 @/ 前缀', () => {
      const out = resolveDbCardImage('@/assets/images/2022-7-4years.webp');
      expect(out).toBeTruthy();
      expect(out.startsWith('@/')).toBe(false);
    });

    it('裸文件名按 assets/images 相对路径解析', () => {
      const out = resolveDbImageUrl('2022-7-4years.webp');
      expect(out).toBeTruthy();
      expect(out).toContain('2022-7-4years');
    });
  });

  describe('Cloudinary → 自建 CDN 改写（本次裂图的根因）', () => {
    it('无 transform 时只换主机，路径与查询串不变', () => {
      const out = resolveDbImageUrl(CLOUDINARY_PNG);
      expect(out).toBe(
        'https://cdn.example.com/mycloud/image/upload/v1784647508/boh-cloud-plus/admin-activities/abc.png',
      );
      expect(out).not.toContain('res.cloudinary.com');
    });

    it('带 transform 时把变换段插在 /image/upload/ 之后', () => {
      const out = resolveDbCardImage(CLOUDINARY_PNG);
      expect(out).toBe(
        `https://cdn.example.com/mycloud/image/upload/${DB_CARD_IMAGE_TRANSFORM}/v1784647508/boh-cloud-plus/admin-activities/abc.png`,
      );
    });

    it('jpg 同样改写（id=17 剧本杀那条就是 jpg）', () => {
      const out = resolveDbCardImage(CLOUDINARY_JPG);
      expect(out).not.toContain('res.cloudinary.com');
      expect(out).toContain(DB_CARD_IMAGE_TRANSFORM);
      expect(out.endsWith('def.jpg')).toBe(true);
    });

    it('详情档用 c_limit,w_1600（只压不拉），与卡片档不同', () => {
      const out = resolveDbDetailImage(CLOUDINARY_PNG);
      expect(out).toContain(DB_DETAIL_IMAGE_TRANSFORM);
      expect(out).not.toContain(DB_CARD_IMAGE_TRANSFORM);
    });

    // 反证：把「改写」这一步去掉（等价于本次修复前的 getImageUrl 直通行为），下面两条必须变红。
    // 若哪天有人把 resolveDbImageUrl 简化回 getImageUrl，这两条会当场抓住。
    it('反证：任何带 transform 的解析结果都不得残留 res.cloudinary.com', () => {
      for (const raw of [CLOUDINARY_PNG, CLOUDINARY_JPG]) {
        expect(resolveDbCardImage(raw)).not.toContain('res.cloudinary.com');
        expect(resolveDbDetailImage(raw)).not.toContain('res.cloudinary.com');
      }
    });

    it('反证：已带同名 transform 的地址不重复插入变换段', () => {
      const once = resolveDbCardImage(CLOUDINARY_PNG);
      const twice = resolveDbCardImage(once);
      expect(twice).toBe(once);
      expect(twice.match(/c_fill/g)?.length).toBe(1);
    });
  });

  // 2026-09-29：方块积分卡自定义卡面（profiles.points_card_image_url）裂图。
  // 与活动页 id=16/17 是同一类根因——DB 存 Cloudinary 直链，渲染端没改写。
  describe('积分卡面档（c_limit 只压不裁）', () => {
    it('改写后不含 res.cloudinary.com，且带上卡面档变换', () => {
      const out = resolveDbPointsCardImage(CLOUDINARY_PNG);
      expect(out).not.toContain('res.cloudinary.com');
      expect(out).toContain(DB_POINTS_CARD_IMAGE_TRANSFORM);
    });

    it('必须是 c_limit 而不是 c_fill：卡面是整幅画，预裁会砍主体', () => {
      const out = resolveDbPointsCardImage(CLOUDINARY_PNG);
      expect(out).toContain('c_limit');
      expect(out).not.toContain('c_fill');
      // 与卡片档（c_fill）明确区分，避免有人图省事合并两档
      expect(DB_POINTS_CARD_IMAGE_TRANSFORM).not.toBe(DB_CARD_IMAGE_TRANSFORM);
    });

    it('幂等：已是 CDN 地址 / 已带变换时不二次改写', () => {
      const once = resolveDbPointsCardImage(CLOUDINARY_PNG);
      expect(resolveDbPointsCardImage(once)).toBe(once);
      expect(resolveDbPointsCardImage(once).match(/c_limit/g)?.length).toBe(1);
    });

    it('空值 → 空串（卡面据此退回占位，不渲染空 src）', () => {
      expect(resolveDbPointsCardImage('')).toBe('');
      expect(resolveDbPointsCardImage(null)).toBe('');
    });
  });
});
