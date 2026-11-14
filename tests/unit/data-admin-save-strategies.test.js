import { describe, expect, it } from 'vitest';
import { SAVE_STRATEGIES } from '@/views/DataManagement/config/saveStrategies.js';

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

  // 'birthdayEvents' 用例已随生日后台退场删除（2026-11-12）：
  // 生日两页签 + /admin/birthday 已下线（表仍保留），SAVE_STRATEGIES.birthdayEvents 同步移除。

  // 'blockWallItems' 三个用例已随方块墙退场删除（2026-10-19）：
  // 管理面板 tab 与 SAVE_STRATEGIES.blockWallItems 均已移除。

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

  // 2026-11-01 周边改版：users 收货三件套（资料即收货信息的后台修正通道）
  it('users：收货三件套 trim 提交，空白落 null，可写字段在白名单内', async () => {
    const payload = await SAVE_STRATEGIES.users({
      editingItem: {
        username: '  小方  ',
        shipping_recipient: '  张三  ',
        shipping_phone: ' 138 0000 0000 ',
        shipping_address: '  浙江省杭州市西湖区文三路 100 号  ',
      },
    });
    expect(payload.shipping_recipient).toBe('张三');
    expect(payload.shipping_phone).toBe('138 0000 0000');
    expect(payload.shipping_address).toBe('浙江省杭州市西湖区文三路 100 号');
  });

  it('users：联系电话格式非法要拒绝，空白电话/地址合法（用户可现场补填）', async () => {
    await expect(
      SAVE_STRATEGIES.users({ editingItem: { username: 'a', shipping_phone: 'abc@#1234567890' } }),
    ).rejects.toThrow(/联系电话格式不正确/);
    await expect(
      SAVE_STRATEGIES.users({ editingItem: { username: 'a', shipping_phone: '  ' } }),
    ).resolves.toMatchObject({ shipping_phone: null });
    await expect(
      SAVE_STRATEGIES.users({ editingItem: { username: 'a', shipping_address: '' } }),
    ).resolves.toMatchObject({ shipping_address: null });
  });
});
