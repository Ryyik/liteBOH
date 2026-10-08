/**
 * psych-guard.ts — **心理访谈守门 + 状态推进**（plans/025 v2 · Step 5-3 第七刀，5-3 收干）
 *
 * 两段（原 `sendMessage` 内联）：
 *   ① **守门**：prompt 是软约束 ⇒ 代码兜底。模型在「助手惯性」下会持续给选项、一轮多问、
 *      甚至替用户编造经历 —— 检测到违规就用重写指令**再生成一次**，且**只在重写稿严格更优时采纳**
 *      （`shouldAdoptRewrite`，纯函数、可测）。每轮最多重写一次（不递归），避免死循环与延迟叠加。
 *   ② **推进访谈状态**：把本轮 assistant 回复记进 `expertState`（下一轮的状态块与 L2 规则据此计算）。
 *
 * ⚠️ 三条**行为不可改**：
 *   1. 守门只在 `psychInterviewActive && !shouldRepairDegenerateStream` 时跑（退化修复优先级更高）；
 *   2. **采纳判据**必须是 `shouldAdoptRewrite`（不能「非空就替换」—— 守门误报会把回答改差，且全程不可见）；
 *   3. 留痕 `lastViolations` / `guardStats` 必须**同时登记进 `bohai-chat-session-store` 白名单**，
 *      否则保存时被静默丢弃（上一版 `lastViolations` 就是这么失效的）。
 */
import { nextTick } from 'vue';

export interface PsychFindingLike {
  type?: string;
}

export interface PsychExpertSessionLike {
  messages?: Array<{ content?: string }>;
  expertState?: unknown;
}

export interface PsychGuardDeps {
  cleanAssistantVisibleReply: (text: string) => string;
  filterThinkingContent: (text: string) => string;
  detectViolations: (
    draft: string,
    ctx: { prevReply: string; prevUserText: string },
  ) => PsychFindingLike[];
  shouldRewrite: (findings: PsychFindingLike[]) => boolean;
  buildRewriteInstruction: (findings: PsychFindingLike[]) => string;
  appendPromptSection: (base: string, section: string, maxChars: number) => string;
  callModelInternal: (
    modelId: string,
    prompt: string,
    systemPrompt: string,
    history: unknown[],
    signal: AbortSignal,
    maxTokens: number,
    profile: unknown,
  ) => Promise<string>;
  shouldAdoptRewrite: (
    findings: PsychFindingLike[],
    rewrite: string,
    ctx: { prevReply: string; prevUserText: string },
  ) => boolean;
  updateContent: (text: string) => void;
  scrollToBottom: () => void;
  summarizeViolations: (findings: PsychFindingLike[]) => unknown;
  bumpGuardStats: (stats: unknown, delta: Record<string, unknown>) => unknown;
  getSessionByIndex: (index: number) => PsychExpertSessionLike | null | undefined;
  recordAssistantTurn: (expertState: unknown, reply: string) => unknown;
}

export interface PsychGuardOptions {
  psychInterviewActive: boolean;
  shouldRepairDegenerateStream: boolean;
  assistantMessage: string;
  session: PsychExpertSessionLike;
  messageIndex: number;
  finalPrompt: string;
  maxFinalPromptChars: number;
  generationModelId: string;
  systemPromptContent: string;
  recentMessages: unknown[];
  requestController: AbortController;
  generationProfile: unknown;
  sessionIndex: number;
}

export const runPsychGuardStage = async (
  deps: PsychGuardDeps,
  {
    psychInterviewActive,
    shouldRepairDegenerateStream,
    assistantMessage,
    session,
    messageIndex,
    finalPrompt,
    maxFinalPromptChars,
    generationModelId,
    systemPromptContent,
    recentMessages,
    requestController,
    generationProfile,
    sessionIndex,
  }: PsychGuardOptions,
): Promise<void> => {
  // 心理访谈守门（prompt 是软约束，必须代码兜底）
  if (psychInterviewActive && !shouldRepairDegenerateStream) {
    const psychDraft = deps.cleanAssistantVisibleReply(
      deps.filterThinkingContent(assistantMessage),
    );
    // 「上一问」= 当前 assistant 之前最近的那条 assistant（中间隔一条 user）
    const previousAssistantReply = session.messages?.[messageIndex - 2]?.content || '';
    // 「对方上一句」用于检测复述（把他的话重排一遍当接住）
    const previousUserMessage = session.messages?.[messageIndex - 1]?.content || '';
    const psychFindings = deps.detectViolations(psychDraft, {
      prevReply: previousAssistantReply,
      prevUserText: previousUserMessage,
    });
    const guardTriggered = deps.shouldRewrite(psychFindings);
    let guardAdopted = false;

    if (guardTriggered) {
      const rewritePrompt = deps.appendPromptSection(
        finalPrompt,
        `\n${deps.buildRewriteInstruction(psychFindings)}`,
        maxFinalPromptChars,
      );
      const rewriteReply = await deps.callModelInternal(
        generationModelId,
        rewritePrompt,
        systemPromptContent,
        recentMessages,
        requestController.signal,
        0,
        generationProfile,
      );
      const rewriteFiltered = deps.cleanAssistantVisibleReply(
        deps.filterThinkingContent(rewriteReply),
      );
      // 只在重写稿严格更优时采纳（判据在 guards.js 的 shouldAdoptRewrite，纯函数、可测）。
      // 原先只要非空就替换 —— 于是守门的误报会拿一版更拘谨的回答盖掉原本可用的回答，
      // 而且全程不可见。约束系统不应有把输出改差的权限。
      guardAdopted = deps.shouldAdoptRewrite(psychFindings, rewriteFiltered, {
        prevReply: previousAssistantReply,
        prevUserText: previousUserMessage,
      });
      if (guardAdopted) {
        deps.updateContent(rewriteFiltered);
        nextTick(deps.scrollToBottom);
      }
    }

    // 留痕：触发率与采纳率是判断「prompt 规则够不够 / 守门有没有误报」的唯一依据。
    // 注意：guardStats / lastViolations 必须同时登记进 bohai-chat-session-store 的白名单，
    // 否则保存时会被静默丢弃（上一版的 lastViolations 就是这么失效的）。
    const violationTarget = deps.getSessionByIndex(sessionIndex);
    if (violationTarget?.expertState) {
      violationTarget.expertState = {
        ...(violationTarget.expertState as Record<string, unknown>),
        lastViolations: deps.summarizeViolations(psychFindings),
        guardStats: deps.bumpGuardStats(
          (violationTarget.expertState as { guardStats?: unknown }).guardStats,
          {
            triggered: guardTriggered,
            adopted: guardAdopted,
            types: psychFindings.map((finding) => finding.type),
          },
        ),
      };
    }
  }

  // 推进访谈状态（向下追问深度 / 小结点）—— 下一轮的状态块与 L2 规则据此计算
  if (psychInterviewActive) {
    const stateTarget = deps.getSessionByIndex(sessionIndex);
    if (stateTarget?.expertState) {
      const finalReply = stateTarget.messages?.[messageIndex]?.content || '';
      stateTarget.expertState = deps.recordAssistantTurn(stateTarget.expertState, finalReply);
    }
  }
};
