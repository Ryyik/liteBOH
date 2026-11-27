import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource } from '../helpers/source.js';

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');

const COMMUNITY = 'src/views/user-center/UserSpace/components/CommunityTab.vue';
const COMMUNITY_CSS = 'src/views/user-center/UserSpace/styles/shell-community.css';

describe('成员页极简布局契约', () => {
  it('共享 token 同时覆盖用户空间与首页成员宿主', () => {
    const css = squeezeSource(read(COMMUNITY_CSS)).replaceAll("'", '"');

    expect(css).toContain(':where(.user-space-page, .community-page-grid)');
    expect(css).toContain('html[data-theme="dark"] .community-page-grid');
  });

  it('移除重复概览卡与节目中心入口', () => {
    const source = squeezeSource(read(COMMUNITY));

    expect(source).not.toContain('community-pulse');
    expect(source).not.toContain('方块节目中心');
    expect(source).not.toContain("emit('switch-tab'");
  });

  it('主列表常驻，搜索与筛选收进独立工具区', () => {
    const source = squeezeSource(read(COMMUNITY));

    expect(source).toContain('community-main-header');
    expect(source).toContain('community-tools');
    expect(source).not.toContain('toggleCommunityExpand');
    expect(source).not.toContain('isCommunityExpanded');
  });

  it('成员卡不再堆叠生日、加入日期与粉丝关注计数', () => {
    const source = squeezeSource(read(COMMUNITY));

    expect(source).not.toContain('user-meta');
    expect(source).not.toContain('formatJoinDate');
    expect(source).not.toContain('canClickFollow');
    expect(source).not.toContain('getFollowCountsBatch');
    expect(source).toMatch(/v-if="user\.bio"/);
  });

  it('成员卡只保留在线提示，不再展示离线时间', () => {
    const source = squeezeSource(read(COMMUNITY));

    expect(source).not.toContain('formatUserOnlineStatus');
    expect(source).not.toContain('formatOnlineStatusTooltip');
    expect(source).toContain('v-if="isUserOnline(user, hideOnlineStatus)"');
    expect(source).toContain('在线');
  });
});
