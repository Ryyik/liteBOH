import { ref } from 'vue';

/**
 * 横屏左栏「发布会话」（.mobile-composer-overlay）的共享闸门 —— 单一真源。
 *
 * 由来（2026-10-11 用户报障）：首页 `/` 与 UserSpace 两处横屏左栏都得在
 * 「切换任何落点之前」先把发布会话收掉。当初只有 UserSpaceMain 接了这道闸门，
 * 首页那条完全没接线 ⇒ 会话开着时点左栏「内容」什么都不发生（那一席恰好等于
 * 首页恒定的 activeBottomNavId），被 Teleport 到 body 的全屏浮层就原样盖在内容区上
 * —— 用户看到的是「一层遮罩盖在页面上」，而且 closeMobileComposer 的
 * 「保存草稿」确认链永远走不到。
 *
 * 契约：
 *   · 会话开关的真源在 ForumMain 的 isMobileComposerOpen。它通过 `composer-state`
 *     事件经 ForumSectionShell 透传上来，父层只做转发 —— 不要自己推这个状态。
 *   · dismissComposerSession() 必须 await 之后再导航：ForumMain 侧有未保存内容时会弹
 *     「保存草稿」确认，用户选完 Promise 才 resolve。极性是 `await 收会话 → 再导航`，
 *     不是「先导航再补一刀」。
 *   · 方块 tab 未挂载时（ForumMain 不在 DOM）样式层不会有残留，静默返回即可。
 *
 * @param {import('vue').Ref} shellRef ForumSectionShell 的模板 ref（它透传 closeComposer）
 */
export function useForumComposerSession(shellRef) {
  /** 发布会话是否打开（由 ForumMain 的 composer-state 事件驱动） */
  const composerOpen = ref(false);

  /** 绑到 ForumSectionShell 的 @composer-state */
  const handleComposerState = (open) => {
    composerOpen.value = Boolean(open);
  };

  /**
   * 收掉发布会话：有未保存内容时由论坛弹「保存草稿」确认，用户选完才 resolve。
   * 任何「离开当前落点」的动作（切 tab / 跳路由 / 左栏其它动作）都必须先 await 它。
   */
  const dismissComposerSession = async () => {
    const view = shellRef?.value;
    if (view && typeof view.closeComposer === 'function') {
      await view.closeComposer();
    }
  };

  return { composerOpen, handleComposerState, dismissComposerSession };
}
