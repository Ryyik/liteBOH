/**
 * useForumPostPolish.js —— 发帖编辑器的「智能整理」状态机与调用
 *
 * 与 `post-polish.js` 的分工：那边是**纯函数**（提示词 / 解析 / 判据），这边只管
 * 状态与网络。这样拆的理由是纯函数能单测、而网络调用只能靠探针，
 * 把两者混在一个文件里会让「解析写错」和「请求写错」看起来是同一种失败。
 *
 * ── 交互口径（2026-10-25 用户定稿，**推翻了上一版的预览面板**）──────────
 *   ① 生成期间：**光效直接打在标题/正文上**，让用户看着自己那段文字在「被处理」；
 *   ② 生成完成：**直接替换**成智能整理后的文字，不弹预览、不要求二次确认；
 *   ③ 之后给一个**撤销**入口，点了恢复原文。
 *
 *   为什么可以去掉预览：撤销就是安全网。上一版要求先预览，是因为「整段替换不可逆
 *   （编辑器没有 undo 栈）」—— 现在补上了真正的撤销，那条理由就不成立了，
 *   而多一次点击的预览面板反而是负担。**前提是撤销必须真的可靠**，
 *   所以原文快照与恢复路径是本文件的重点（见 `undo` 与 `applyResult`）。
 *
 * ── 2026-10-25 第二次修订：「光效结束时文字刚好被替换」────────────────
 * 用户口径（原话）：「光效结束时文字刚好被替换（可撤销），现在的我不满意」。
 * 上一版的失效方式很具体 —— 请求一回来，流光在**同一帧**被摘掉、文字同时跳到新内容，
 * 观感是「光没了，字也突然变了」，两个变化互相抢注意力，谁也不像「完成」。
 *
 * 修法不是调时长，而是把**完成**做成一个独立的、有落点的阶段：
 *
 *        running ──(结果到手)──▶ settling ──(settleMs)──▶ applied
 *                                   └ 状态行先报「快好了」，
 *                                     落点那一刻才写回文字、摘掉流光
 *
 * 三条硬约束（任一漏掉就退回旧观感）：
 *   ① **文字替换由落点事件触发，不由「动画时长」硬编码触发** —— JS 侧只认
 *      `SETTLE_MS` 这一个数，CSS 侧的等待时长用 `var(--post-polish-settle)`
 *      读同一个数（见组件里把它绑到 style 上的地方）。两处各写一个数就必然漂移。
 *   ② **拆开「文字落点」与「状态收尾」**：`settling` 期间状态行已报「快好了」，
 *      但输入框仍是原文；`applied` 之后状态行再停 `exitMs`，文字已恢复原色。
 *      上一版正是把这两件事压成一个瞬间。
 *   ③ **落点之前用户仍能看到原文**：settling 期间输入框还是旧文字（`readonly`），
 *      所以「被替换的是什么」是可对照的。少了这条，动画就只是在掩盖一次跳变。
 *
 * ⚠️ `settleMs` / `exitMs` 走依赖注入是为了单测能跑成 0ms ——
 *    单测不该为了验证时序真等 600ms，那会让整条链慢到没人愿意跑。
 *
 * ── 调用协议（这里有一条容易踩的暗坑）──────────────────────────────
 * `callBohAIModel` 最终打到 EF `runtime-chat`，而 EF 的
 * `buildRuntimePayload()`（`api-key-vault/index.ts:2129-2143`）会用**服务端
 * policy 覆盖** `model / max_tokens / temperature / top_p`。
 * ⇒ 客户端传的采样参数**全部无效**，实际产出上限只由 `mode` 选中的那行配置决定。
 * 不传 mode 时 EF 落到 `fast`（`max_tokens = 1200`、`quota_multiplier = 0.00`）。
 *
 * 选 `fast` 不选 `pro` 的理由：
 *   ① 整理是高频小任务（用户可能改两笔就再点一次），`fast` 倍率 0 不扣额度；
 *   ② 输出长度与输入基本等长，`fast` 的 1200 token 上限对 ≤900 字的正文够用；
 *   ③ `callBohAIModel` 本身不接受 mode 参数 —— 想换档必须绕到 `callVaultSiliconChat`
 *      直连。不值得为这个任务多写一条调用链。
 *
 * ── 为什么不用 BOHAI 的壳（useBohShell）────────────────────────────
 * 壳是为「整页对话」设计的：它带会话、消息流、检索连接器、额度环、斜杠命令。
 * 发帖整理只要一次无状态调用。拉整个壳进来会让编辑器拖上一个
 * BOHAIModel 级别的依赖，而发帖是首屏就会用到的路径。所以这里直接调模型客户端。
 */
import { computed, onScopeDispose, ref, shallowRef } from 'vue';
import {
  callBohAIModel,
  extractBohAIJsonObject,
  getBohAIModelStatus,
} from '@/utils/bohai-model-client.js';
import {
  buildPolishMessages,
  hasPolishableText,
  isPolishResultChanged,
  parsePolishResult,
  POST_POLISH_MAX_INPUT_CHARS,
} from './post-polish.js';

/**
 * 状态机取值。
 * - `idle`     什么都没发生
 * - `running`  请求在飞（标题/正文上跑流光）
 * - `settling` 结果已到手，状态行报「快好了」；文字还没换（落点才换）
 * - `applied`  已写回、且可撤销
 * - `error`    失败（附人话文案）
 *
 * 刻意**没有** `ready`（预览态）—— 见文件头「交互口径」。
 */
export const POLISH_STATUS = Object.freeze({
  idle: 'idle',
  running: 'running',
  settling: 'settling',
  applied: 'applied',
  error: 'error',
});

/**
 * 落点阶段（`settling`）的默认时长 —— **与 CSS 是同一个数，别改一处**。
 *
 * 消费者有两处，都得读它：
 *   ① 本文件的定时器（决定文字在哪一刻被替换）；
 *   ② `PostComposer` 把它绑成 `--post-polish-settle`（落点前的等待时长）。
 *
 * ⚠️ 替换必须等这个时长，不能一拿到结果就写回：先把「快好了」看清楚，
 *    再让文字在确定的时刻落点。
 *
 * 取值理由：600ms 足够让最后一轮流光被看清，又不会让已经拿到结果的用户
 * 觉得卡。短于 400ms 就读成「闪一下」，长于 800ms 会被当成卡顿。
 */
export const POLISH_SETTLE_MS = 600;

/**
 * 落点之后状态行**再停一拍**的时长（此时文字已换好，流光已从 textarea 摘掉）。
 *
 * ⚠️ 200ms 只服务于状态行文案：落点那一刻 `isBusyPolishing` 已经变 false，
 *    文字恢复原色；再停一拍，是让用户看清「已智能整理」与撤销入口，
 *    而不是继续给新文字叠动画。
 *    再长会让状态行悬在「快好了，正在收尾…」上，读成卡顿。
 */
export const POLISH_EXIT_MS = 200;

/**
 * @param {{
 *   onApplied?: (draft: { title: string, content: string }) => void,
 *   settleMs?: number,
 *   exitMs?: number,
 * }} [options]
 *   `onApplied` 把结果写回宿主自己的 `newPost` —— 本 composable 不持有稿件
 *   （那是宿主的单一真源），它只在内存里留一份**原文快照**用于撤销。
 *   `settleMs` / `exitMs` 只为单测能跑成 0ms，业务代码不要传。
 */
export function useForumPostPolish({
  onApplied,
  settleMs = POLISH_SETTLE_MS,
  exitMs = POLISH_EXIT_MS,
} = {}) {
  const status = ref(POLISH_STATUS.idle);
  const errorMessage = ref('');
  /** 落点是否已经发生 —— 状态行据此从「快好了」切到「已智能整理」。 */
  const settled = ref(false);
  /** 本次整理是否真的改了字（没改就不必进 applied 态、也不该给撤销） */
  const changed = shallowRef(false);

  /**
   * 原文快照 —— 撤销的唯一依据。
   * ⚠️ 必须在**发起请求之前**拍，而不是在应用时拍：应用时宿主已经改过
   *    `newPost` 了，那时再读就是「AI 的文字」，撤销会变成空操作。
   */
  let snapshot = { title: '', content: '' };

  let controller = null;
  /** 落点定时器句柄（cancel/reset/新请求都要清，否则落点会打在已取消的这一次上）。 */
  let settleTimer = null;

  const clearSettleTimer = () => {
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  };

  /** 等 `ms`；`ms <= 0` 时不等 —— 单测走这条分支。 */
  const waitSettle = (ms) => {
    if (!(ms > 0)) return Promise.resolve();
    return new Promise((resolve) => {
      settleTimer = setTimeout(() => {
        settleTimer = null;
        resolve();
      }, ms);
    });
  };

  const hasConfig = computed(() => Boolean(getBohAIModelStatus().hasConfig));
  const isRunning = computed(() => status.value === POLISH_STATUS.running);
  /** 正在落点前的等待段（文字仍是原文、textarea 仍只读）—— 与 `isRunning` 分开。 */
  const isSettling = computed(() => status.value === POLISH_STATUS.settling);
  const isApplied = computed(() => status.value === POLISH_STATUS.applied);
  const isBusy = computed(
    () => status.value === POLISH_STATUS.running || status.value === POLISH_STATUS.settling,
  );

  const writeDraft = (draft) => {
    if (typeof onApplied === 'function') onApplied(draft);
  };

  const reset = () => {
    clearSettleTimer();
    if (controller) {
      controller.abort();
      controller = null;
    }
    status.value = POLISH_STATUS.idle;
    errorMessage.value = '';
    changed.value = false;
    settled.value = false;
    snapshot = { title: '', content: '' };
  };

  /**
   * 正文是否超出可整理上限。
   *
   * ⚠️ 超限时**不给按钮**而不是截断后照样发：整段替换一旦拿的是截断输入，
   * 输出也会是截断的，用户就丢了后半篇文章。宁可明确说不能整理。
   */
  const isOverLimit = (draft = {}) =>
    String(draft.content || '').length > POST_POLISH_MAX_INPUT_CHARS;

  const canPolish = (draft = {}) =>
    Boolean(hasConfig.value) && hasPolishableText(draft) && !isOverLimit(draft);

  /**
   * 发起整理。成功后**先等落点、再写回**，然后进入 `applied`（可撤销）。
   *
   * 失败一律落到 `error` + 人话文案，不抛给调用方 —— 这是编辑器的辅助动作，
   * 不该让一次网络抖动冒泡成未捕获异常（发帖器已经在处理上传/发布两条异步链了）。
   */
  const polish = async (draft = {}) => {
    if (!canPolish(draft)) {
      if (!hasConfig.value) {
        status.value = POLISH_STATUS.error;
        errorMessage.value = 'AI 服务暂不可用，稍后再试。';
      } else if (isOverLimit(draft)) {
        status.value = POLISH_STATUS.error;
        errorMessage.value = `正文超过 ${POST_POLISH_MAX_INPUT_CHARS} 字，暂不支持一键整理。`;
      }
      return null;
    }

    // 上一轮的落点定时器必须先清掉：它一旦落地，会把**这一轮**的文字写回去。
    clearSettleTimer();
    if (controller) controller.abort();
    controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

    // 原文快照：撤销的唯一依据（必须在写回之前拍，见上方字段注释）
    snapshot = {
      title: String(draft.title || ''),
      content: String(draft.content || ''),
    };

    status.value = POLISH_STATUS.running;
    errorMessage.value = '';
    changed.value = false;
    settled.value = false;

    try {
      const { content: raw } = await callBohAIModel({
        messages: buildPolishMessages(draft),
        signal: controller?.signal,
      });

      const parsed = parsePolishResult(raw, { extractJson: extractBohAIJsonObject });
      if (!parsed.content) {
        status.value = POLISH_STATUS.error;
        errorMessage.value = '没能整理出内容，换个写法再试一次。';
        return null;
      }

      const nextDraft = {
        title: parsed.title || snapshot.title,
        content: parsed.content,
      };

      // 没改动就不进 applied（否则「撤销」按钮指向一次没有发生的变化，很怪）
      if (!isPolishResultChanged(snapshot, nextDraft)) {
        status.value = POLISH_STATUS.idle;
        changed.value = false;
        return { ...nextDraft, unchanged: true };
      }

      /*
       * ★ 落点：文字在这里被换掉，流光也在同一刻从 textarea 上摘掉。
       *
       * 顺序是有意的：先切 `settling`（状态行改成「快好了」），**再**等这个时长。
       * 反过来（先等再切）会让「快好了」在替换之后才出现，用户看到的是
       * 「字先变了，文案才追上」—— 因果反了。
       */
      status.value = POLISH_STATUS.settling;
      await waitSettle(settleMs);

      writeDraft(nextDraft);
      settled.value = true;
      changed.value = true;

      /*
       * 落点之后状态行再停 `exitMs` 才进 applied —— 此时新文字已恢复原色，
       * 这一段只留给「已智能整理」与撤销入口，不再动文字。
       * `exitMs <= 0` 时同帧进 applied。
       */
      if (exitMs > 0) await waitSettle(exitMs);

      status.value = POLISH_STATUS.applied;
      return nextDraft;
    } catch (error) {
      if (error?.name === 'AbortError') {
        // 用户主动取消：安静回到 idle，不报错（报错会让人以为出了问题）
        clearSettleTimer();
        status.value = POLISH_STATUS.idle;
        settled.value = false;
        return null;
      }
      status.value = POLISH_STATUS.error;
      errorMessage.value = String(error?.message || '').trim() || '整理失败，请稍后再试。';
      return null;
    } finally {
      controller = null;
    }
  };

  /**
   * 撤销：把快照写回，回到 `idle`。
   *
   * ⚠️ 三条硬约束（任一漏掉都会变成「撤销无效」而没人发现）：
   *   ① 只在 `applied` 态可用 —— 别的时候快照是空的，写回会把稿件清空；
   *   ② 写回的是**发起请求前**的快照（见 snapshot 注释）；
   *   ③ 撤销后立刻清快照 —— 连点两次不该把第二次当成「再撤销一次」。
   */
  const undo = () => {
    if (status.value !== POLISH_STATUS.applied) return false;
    const restored = { ...snapshot };
    snapshot = { title: '', content: '' };
    writeDraft(restored);
    status.value = POLISH_STATUS.idle;
    changed.value = false;
    settled.value = false;
    return true;
  };

  /** 用户自己动过稿子 ⇒ 「撤销」不再指向一次干净的变化，收起入口。 */
  const dismissUndo = () => {
    if (status.value !== POLISH_STATUS.applied) return;
    status.value = POLISH_STATUS.idle;
    snapshot = { title: '', content: '' };
    changed.value = false;
    settled.value = false;
  };

  const cancel = () => reset();

  onScopeDispose(() => {
    clearSettleTimer();
    if (controller) {
      controller.abort();
      controller = null;
    }
  });

  return {
    status,
    errorMessage,
    changed,
    /** 落点是否已发生（状态行据此从「正在整理」切到「已智能整理」）。 */
    settled,
    isRunning,
    isSettling,
    isBusy,
    isApplied,
    hasConfig,
    canPolish,
    isOverLimit,
    polish,
    undo,
    dismissUndo,
    cancel,
    reset,
  };
}
