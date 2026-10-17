import { describe, expect, it } from 'vitest';
import { SAVE_STRATEGIES } from '@/views/DataManagement/config/saveStrategies.js';

const ADMIN = { userId: 'admin-uuid', userName: 'admin' };

describe('data admin save strategies（DB 约束对齐）', () => {
  it('photoAlbums：可写字段齐全（原来没有策略，点保存直接报「暂不支持」）', async () => {
    const payload = await SAVE_STRATEGIES.photoAlbums({
      editingItem: {
        title: '  旅行相册  ',
        subtitle: '2026 夏',
        cover_url: 'https://x/y.webp',
        status: 'published',
        shared_to_community: true,
      },
    });
    expect(payload).toEqual({
      title: '旅行相册',
      subtitle: '2026 夏',
      cover_url: 'https://x/y.webp',
      status: 'published',
      shared_to_community: true,
    });
  });

  it('birthdayEvents：target_user_id 必须随载荷提交（NOT NULL）', async () => {
    const payload = await SAVE_STRATEGIES.birthdayEvents({
      editingItem: {
        target_user_id: 'user-1',
        title: '生日快乐',
        celebration_date: '2026-10-17',
      },
    });
    expect(payload.target_user_id).toBe('user-1');
  });

  it('blockWallItems：note 新建补齐 author_id/author_username/item_type/color', async () => {
    const payload = await SAVE_STRATEGIES.blockWallItems({
      editingItem: { content: '你好', item_type: 'note' },
      ...ADMIN,
    });
    expect(payload).toMatchObject({
      author_id: 'admin-uuid',
      author_username: 'admin',
      item_type: 'note',
      content: '你好',
      color: 'butter',
    });
  });

  it('blockWallItems：photo 新建给出明确提示（后台没有宽高采集）', async () => {
    await expect(
      SAVE_STRATEGIES.blockWallItems({
        editingItem: { item_type: 'photo', image_url: 'https://x/y.webp' },
        ...ADMIN,
      }),
    ).rejects.toThrow(/图片方块请在用户端发布/);
  });

  it('blockWallItems：类型不可改（note ↔ photo 会撞 CHECK）', async () => {
    await expect(
      SAVE_STRATEGIES.blockWallItems({
        editingItem: { item_type: 'note', content: 'x' },
        originalItem: { item_type: 'photo' },
        ...ADMIN,
      }),
    ).rejects.toThrow(/类型不可修改/);
  });

  it('bohCreatorShows：author_id + 合法平台 + 非空描述', async () => {
    const payload = await SAVE_STRATEGIES.bohCreatorShows({
      editingItem: {
        author_id: 'creator-1',
        title: '作品',
        description: '一段描述',
        video_url: 'https://www.bilibili.com/video/BV1xx',
        creator_platform: 'bilibili',
        creator_platform_id: '123',
      },
    });
    expect(payload).toMatchObject({
      author_id: 'creator-1',
      creator_platform: 'bilibili',
      description: '一段描述',
    });
    await expect(
      SAVE_STRATEGIES.bohCreatorShows({
        editingItem: {
          author_id: 'creator-1',
          title: '作品',
          description: 'x',
          video_url: 'https://x',
          creator_platform: 'youtube',
        },
      }),
    ).rejects.toThrow(/平台必须是/);
  });

  it('campaignRewards：状态白名单与 DB CHECK 对齐', async () => {
    await expect(
      SAVE_STRATEGIES.campaignRewards({ editingItem: { status: 'granted' } }),
    ).resolves.toEqual({ status: 'granted' });
    await expect(
      SAVE_STRATEGIES.campaignRewards({ editingItem: { status: 'pending' } }),
    ).rejects.toThrow(/发放状态无效/);
  });
});
