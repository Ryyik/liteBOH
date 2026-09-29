import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

/**
 * 断言前先剥注释，**且必须先取 `<script>` 区**。
 * 两个理由，都是实测出来的（2026-09-29）：
 *   1. 注释里会**合法地**复述弃用写法 —— ProfileMain 的新注释就写了
 *      `ref(getNotificationStoreSync())` 来解释为什么删掉它 → 不剥注释就是假红；
 *   2. 对 .vue 全文剥注释会**吃掉真实代码** —— 模板里的 `accept="image/*"` 里的
 *      开注释符会与远处的闭注释符错配，ProfileMain.vue 一次被删 42,458 字节
 *      → 否定断言静默变松（假绿）。
 * 细节与反证见 `tests/helpers/source.js` 与 `tests/unit/source-helper.test.js`。
 */
const codeOf = (rel) => stripComments(scriptSection(read(rel)));

/**
 * 宿主白名单：所有需要「未读消息角标」的组件。
 * 它们只允许通过 `@/stores/notification-loader` 的**共享 ref** 取实例，
 * 不许再自建 `ref(getNotificationStoreSync())` 加一份自己的兜底 load。
 */
const HOSTS = [
  'src/App.vue',
  'src/components/UnifiedNavbar/index.vue',
  'src/views/Home/index.vue',
  'src/views/user-center/Messages/index.vue',
  'src/views/user-center/UserSpace/UserSpaceMain.vue',
  'src/views/Forum/ForumMain.vue',
  // 第 7 个宿主，2026-09-29 收敛（此前是唯一漏网的一份局部副本）
  'src/views/Profile/ProfileMain.vue',
];

describe('通知 store 加载器：单一真源', () => {
  it('loader 提供共享 ref 与 ensure 两个出口', () => {
    const loader = read('src/stores/notification-loader.ts');
    expect(loader).toContain('export function getNotificationStoreRef()');
    expect(loader).toContain('export async function ensureNotificationStore()');
    expect(loader).toContain('export function getNotificationStoreSync()');
  });

  it('没有任何宿主再自建 ref(getNotificationStoreSync())', () => {
    // 反证教训：ProfileMain 曾用 `ref(getNotificationStoreSync())` 建**局部** ref，
    //   只在 setup 期取一次快照，且兜底 load 的条件是 `!value && isLoggedIn`。
    //   于是「登出态挂载 → 之后登录且不重挂」这条路径上它永远是 null：
    //   横屏左栏消息角标恒空，而其它宿主预载好的实例也照不进来。
    //   共享 ref 之后，任一宿主加载成功，其余宿主的 computed 立即可见。
    for (const host of HOSTS) {
      expect(codeOf(host), `${host} 应改用共享 ref`).not.toMatch(
        /ref\(\s*getNotificationStoreSync\(\)\s*\)/,
      );
    }
  });

  it('ProfileMain 与其余宿主同形（共享 ref + ensure，而不是低层 API）', () => {
    const profile = codeOf('src/views/Profile/ProfileMain.vue');
    expect(profile).toContain(
      "import { ensureNotificationStore, getNotificationStoreRef } from '@/stores/notification-loader';",
    );
    expect(profile).toMatch(/const railNotificationStore = getNotificationStoreRef\(\);/);
    expect(profile).toContain('void ensureNotificationStore();');
    // 低层 API 一旦回流，就意味着又有人开始自己造 ref
    expect(profile).not.toContain('loadNotificationStore');
  });
});
