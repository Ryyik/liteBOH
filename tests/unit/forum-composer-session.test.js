/**
 * forum-composer-session.test.js — 锁「横屏左栏发布会话闸门」的 await 契约
 * （2026-10-11 用户报障：首页横屏点「内容」应弹「保存草稿」，实际是一层遮罩盖着页面）
 *
 * 事故/动机：会话状态与会话关闭原先**只在 UserSpaceMain 里写了一份**，首页那条线
 * 完全没有接线 —— 切落点时不收会话，被 Teleport 到 body 的 `.mobile-composer-overlay`
 * 就原样盖在内容区上（用户看到的「遮罩」），而且论坛侧的「保存草稿」确认链根本走不到。
 * 现在两处共用 `useForumComposerSession`，本文件锁它的三条契约。
 *
 * ⚠️ 第一性断言是**第 2 条**：`dismissComposerSession()` 必须等 forums 侧的
 *    `closeComposer()` 落定才 resolve。ForumMain 侧有未保存内容时会弹确认框、
 *    Promise 挂到用户点完为止；一旦有人把 `await` 漏掉（或改成 fire-and-forget），
 *    「先导航、后弹框」的顺序就反了 —— 那正是用户看到的「遮罩盖着页面」。
 */
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useForumComposerSession } from '../../src/views/user-center/UserSpace/composables/useForumComposerSession.js';

const createShellRef = (closeComposer) => ref({ closeComposer });

describe('useForumComposerSession —— 发布会话闸门', () => {
  it('初始为关闭（会话真源在 ForumMain，外层不许自己推）', () => {
    const { composerOpen } = useForumComposerSession(ref(null));
    expect(composerOpen.value).toBe(false);
  });

  it('handleComposerState 把外层状态跟着 ForumMain 的开关走（含强制布尔化）', () => {
    const { composerOpen, handleComposerState } = useForumComposerSession(ref(null));
    handleComposerState(true);
    expect(composerOpen.value).toBe(true);
    handleComposerState(false);
    expect(composerOpen.value).toBe(false);
    // 事件可能带 undefined / 非布尔值：一律归成布尔，别让模板拿到脏值
    handleComposerState(undefined);
    expect(composerOpen.value).toBe(false);
    handleComposerState('yes');
    expect(composerOpen.value).toBe(true);
  });

  it('dismissComposerSession 调的是分区壳透传的 closeComposer', async () => {
    const closeComposer = vi.fn().mockResolvedValue(undefined);
    const { dismissComposerSession } = useForumComposerSession(createShellRef(closeComposer));
    await dismissComposerSession();
    expect(closeComposer).toHaveBeenCalledTimes(1);
  });

  it('★dismissComposerSession 必须等 closeComposer 落定才 resolve（用户没选完不许导航）', async () => {
    let releaseShell = null;
    const closeComposer = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseShell = resolve;
        }),
    );
    const { dismissComposerSession } = useForumComposerSession(createShellRef(closeComposer));

    let settled = false;
    const pending = dismissComposerSession().then(() => {
      settled = true;
    });

    // 模拟「论坛弹了保存草稿确认框、用户还没点」：此刻闸门绝不能放行
    await Promise.resolve();
    expect(closeComposer).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    releaseShell();
    await pending;
    expect(settled).toBe(true);
  });

  it('方块 tab 未挂载 / 壳没暴露 closeComposer 时静默返回，不抛错', async () => {
    const empty = useForumComposerSession(ref(null));
    await expect(empty.dismissComposerSession()).resolves.toBeUndefined();

    const noMethod = useForumComposerSession(ref({}));
    await expect(noMethod.dismissComposerSession()).resolves.toBeUndefined();
  });
});
