/**
 * shortcuts.ts — **前置捷径**阶段（plans/025 v2 · Step 5-1）
 *
 * `sendMessage` 在进入检索/装配之前，先跑四条「命中即返回」的捷径：
 *   ① 待确认的树洞创建回复  ② 发帖草稿  ③ 页面创建草稿  ④ MC 资源搜索
 *
 * 抽出来的价值：这四条**顺序敏感**（谁先命中谁负责），原先散在 1666 行的
 * `sendMessage` 里只能靠肉眼数；现在是一个有名字、可单测的单元。
 *
 * ⚠️ 阶段函数签名统一 `(ctx, options)` —— `ctx` 由壳一次构造并透传（见 `plans/025` §4 Step 5）。
 * 本文件是 Step 5 的第一个 stage，其余阶段按同样形态逐个搬。
 */

/** 捷径阶段需要的注入（全部由 `useChatEngine` 提供，本文件不持有状态）。 */
export interface ShortcutStageCtx {
  handlePendingTreeholeCreationReply: (userText: string) => Promise<unknown>;
  tryStartActionDraftFromUserInput: (userText: string, sessionIndex: number) => Promise<unknown>;
  tryStartPageCreationFromUserInput: (userText: string, sessionIndex: number) => Promise<unknown>;
  handleResourceSearchRequest: (userText: string) => Promise<unknown>;
}

export interface ShortcutStageOptions {
  userText: string;
  sessionIndex: number;
}

/**
 * 跑四条前置捷径。
 *
 * @returns `true` = 已被某条捷径接管（调用方应**立即 return**，不再走检索/装配）。
 *
 * ⚠️ **顺序不可换**：树洞回复确认必须在最前（它是「上一轮的追问」，语义上优先于本轮新意图）；
 * 资源搜索在最后（它最"宽"，放前面会抢走发帖/建页的输入）。
 */
export const runShortcutBranches = async (
  ctx: ShortcutStageCtx,
  { userText, sessionIndex }: ShortcutStageOptions,
): Promise<boolean> => {
  if (await ctx.handlePendingTreeholeCreationReply(userText)) return true;
  if (await ctx.tryStartActionDraftFromUserInput(userText, sessionIndex)) return true;
  if (await ctx.tryStartPageCreationFromUserInput(userText, sessionIndex)) return true;
  if (await ctx.handleResourceSearchRequest(userText)) return true;
  return false;
};
