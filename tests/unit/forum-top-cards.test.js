import { describe, expect, it } from 'vitest';
import {
  buildForumCheckinCard,
  buildForumPromoCard,
  getForumPromoDismissKey,
  getLocalWeekStartKey,
} from '@/views/Forum/forum-top-card-model.js';
import { SAVE_STRATEGIES } from '@/views/DataManagement/config/saveStrategies.js';
import { dataConfig } from '@/views/DataManagement/config/tables.js';

const CHRISTMAS_HERO = {
  id: 'hero-xmas',
  builtin_key: 'christmas-xmas',
  title: '把头像挂上树',
  eyebrow: null,
  subtitle: null,
  links: [],
};

const PROMO_ITEM = {
  id: 'card-1',
  label: '圣诞交换礼物',
  kind: 'hero',
  hero_id: 'hero-xmas',
  version: 3,
};

describe('forum top cards · promo', () => {
  it('圣诞 builtin Hero 映射成极简卡文案与站内 CTA', () => {
    const card = buildForumPromoCard(PROMO_ITEM, [CHRISTMAS_HERO]);
    expect(card).toMatchObject({
      key: 'promo:card-1',
      id: 'card-1',
      type: 'promo',
      version: 3,
      eyebrow: '圣诞活动',
      title: '圣诞交换礼物',
      subtitle: '挂上头像，随机配对。',
      ctaText: '立即参与',
      to: '/xmas',
      icon: 'gift',
    });
  });

  it('普通 Hero 使用自身标题与第一条链接', () => {
    const card = buildForumPromoCard(PROMO_ITEM, [
      {
        id: 'hero-xmas',
        builtin_key: null,
        title: '主题活动',
        eyebrow: '活动',
        subtitle: '活动说明',
        links: [{ text: '查看', to: '/activity' }],
      },
    ]);
    expect(card).toMatchObject({
      eyebrow: '活动',
      title: '主题活动',
      subtitle: '活动说明',
      ctaText: '查看',
      to: '/activity',
      icon: 'sparkles',
    });
  });

  it('Hero 缺失或卡型不是 hero 时不渲染', () => {
    expect(buildForumPromoCard(PROMO_ITEM, [])).toBeNull();
    expect(buildForumPromoCard({ ...PROMO_ITEM, kind: 'carousel' }, [CHRISTMAS_HERO])).toBeNull();
  });

  it('关闭键包含版本：升版后重新出现', () => {
    expect(getForumPromoDismissKey({ id: 'card-1', version: 3 })).toBe('card-1:3');
    expect(getForumPromoDismissKey({ id: 'card-1', version: 4 })).not.toBe('card-1:3');
  });
});

describe('forum top cards · checkin', () => {
  it('按周生成签到卡与关闭键', () => {
    const card = buildForumCheckinCard({ weekStart: '2026-11-23' });
    expect(card).toMatchObject({
      key: 'checkin:2026-11-23',
      type: 'checkin',
      title: '每周签到',
      ctaText: '签到',
      weekKey: '2026-11-23',
    });
    expect(buildForumCheckinCard({ weekStart: '' })).toBeNull();
  });

  it('本地周键固定落到周一', () => {
    expect(getLocalWeekStartKey(new Date(2026, 10, 27, 12))).toBe('2026-11-23');
    expect(getLocalWeekStartKey('2026-11-30T08:00:00')).toBe('2026-11-30');
  });
});

describe('forum top cards · 数据管理开关', () => {
  it('论坛卡片页签提供状态字段，可改为停用', async () => {
    const fields = dataConfig.forumCards.fields;
    const statusField = fields.find((field) => field.key === 'status');
    expect(statusField?.options?.map((option) => option.value)).toEqual(['active', 'inactive']);

    const payload = await SAVE_STRATEGIES.forumCards({
      editingItem: {
        label: '圣诞交换礼物',
        kind: 'hero',
        hero_id: '17a3eef9-47d1-49c9-81b7-2c1d13aeb1ea',
        status: 'inactive',
        priority: 100,
        version: 1,
        starts_at: null,
        ends_at: null,
      },
    });
    expect(payload.status).toBe('inactive');
    expect(payload.hero_id).toBe('17a3eef9-47d1-49c9-81b7-2c1d13aeb1ea');
  });
});
