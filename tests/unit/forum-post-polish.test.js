/**
 * forum-post-polish.test.js —— 发帖「智能整理」的纯函数守卫
 *
 * 为什么这些都是单测而不是探针：整理链路的两个高风险点都在**源码逻辑**里
 * （提示词约束有没有写对、解析会不会把正文吞掉），而探针只能验证「点一下有反应」。
 * 真正会静默出错的是解析：模型多回一句解释、少一个字段，肉眼看不出来，
 * 但用户点「应用」就会丢掉整段正文。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPolishMessages,
  hasPolishableText,
  isPolishResultChanged,
  parsePolishResult,
  POST_POLISH_MAX_INPUT_CHARS,
  POST_POLISH_MAX_TITLE_CHARS,
} from '../../src/views/Forum/composables/post-polish.js';
import { FORUM_POST_TITLE_MAX_LENGTH } from '../../src/views/Forum/forum-config.js';

/** 模拟 BOHAI 的 extractBohAIJsonObject（只做本测试需要的三种形态） */
const extractJson = (text) => {
  const withoutFence = String(text).replace(/```(?:json)?\s*([\s\S]*?)```/i, '$1');
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
};

describe('标题上限单源', () => {
  it('整理用的标题上限就是编辑器标题框的上限（不写第二份 50）', () => {
    expect(POST_POLISH_MAX_TITLE_CHARS).toBe(FORUM_POST_TITLE_MAX_LENGTH);
  });
});

describe('hasPolishableText', () => {
  it('只有正文 / 只有标题 / 两者都有，都算可整理', () => {
    expect(hasPolishableText({ content: '有正文' })).toBe(true);
    expect(hasPolishableText({ title: '只有标题' })).toBe(true);
    expect(hasPolishableText({ title: 'a', content: 'b' })).toBe(true);
  });

  it('空白与纯空格一律视为没有内容（避免拿空稿去打模型）', () => {
    expect(hasPolishableText({})).toBe(false);
    expect(hasPolishableText({ title: '   ', content: '\n\n' })).toBe(false);
  });
});

describe('buildPolishMessages', () => {
  const messages = buildPolishMessages({ title: '标题', content: '正文内容' });

  it('恰好两条消息，system 在前', () => {
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('system 里必须写明「不新增事实」与「不删信息点」——整理不是重写', () => {
    expect(messages[0].content).toContain('不得新增原文没有的信息');
    expect(messages[0].content).toContain('不得删除原文里存在的信息点');
  });

  it('system 里必须要求纯文本正文（不要 Markdown 标记）', () => {
    expect(messages[0].content).toContain('不要使用 Markdown 标记');
  });

  it('要求只输出 JSON，并给出字段形状', () => {
    expect(messages[0].content).toContain('只输出 JSON');
    expect(messages[0].content).toContain('"title"');
    expect(messages[0].content).toContain('"content"');
  });

  it('不传采样参数：EF 会覆盖它们，传了只会误导下一个人', () => {
    // 这条防的是「好心加个 temperature: 0.3」。EF buildRuntimePayload 会用
    // 服务端 policy 覆盖 model/max_tokens/temperature/top_p，客户端值不生效。
    expect(messages[0].content).not.toMatch(/temperature/i);
    expect(Object.keys(messages[0])).toEqual(['role', 'content']);
  });

  it('超长正文按上限截断后才送模型（不在这一步做整段替换的输入）', () => {
    const long = '字'.repeat(POST_POLISH_MAX_INPUT_CHARS + 200);
    const [system, user] = buildPolishMessages({ content: long });
    expect(user.content.length).toBeLessThan(long.length + 100);
    expect(user.content).toContain('字'.repeat(POST_POLISH_MAX_INPUT_CHARS));
    expect(system.content).toContain(String(POST_POLISH_MAX_INPUT_CHARS));
  });

  it('没有标题时明确告诉模型「还没有写」，而不是留一个空标签', () => {
    const [, user] = buildPolishMessages({ content: '只有正文' });
    expect(user.content).toContain('标题：（用户还没有写标题');
  });
});

describe('parsePolishResult —— 模型输出的三种形态', () => {
  it('标准 JSON：拿到结构化的标题与正文', () => {
    const result = parsePolishResult('{"title":"新标题","content":"新正文"}', { extractJson });
    expect(result).toEqual({ title: '新标题', content: '新正文', degraded: false });
  });

  it('```json 围栏包裹：照样能解析（模型最常见的违反格式方式）', () => {
    const raw = '```json\n{"title":"T","content":"C"}\n```';
    expect(parsePolishResult(raw, { extractJson })).toEqual({
      title: 'T',
      content: 'C',
      degraded: false,
    });
  });

  it('JSON 前后带解释文字：靠首尾大括号定位仍能取到', () => {
    const raw = '好的，整理如下：\n{"title":"T","content":"C"}\n希望有帮助。';
    const result = parsePolishResult(raw, { extractJson });
    expect(result.title).toBe('T');
    expect(result.content).toBe('C');
  });

  it('正文里的换行必须保留（分段是整理的主要价值）', () => {
    const raw = '{"title":"T","content":"第一段\\n\\n第二段"}';
    expect(parsePolishResult(raw, { extractJson }).content).toBe('第一段\n\n第二段');
  });

  it('模型不听话、返回分栏文本：走标签兜底并标记 degraded', () => {
    const raw = '标题：我的标题\n正文：第一句。\n第二句。';
    const result = parsePolishResult(raw, { extractJson });
    expect(result.title).toBe('我的标题');
    expect(result.content).toContain('第一句。');
    expect(result.degraded).toBe(true);
  });

  it('完全裸文本：整段当正文，标题留空（宁可没标题，也不能丢正文）', () => {
    const result = parsePolishResult('就是一段没有格式的话。', { extractJson });
    expect(result.title).toBe('');
    expect(result.content).toBe('就是一段没有格式的话。');
    expect(result.degraded).toBe(true);
  });

  it('空回复：返回空正文，调用方据此报错而不是应用空白', () => {
    expect(parsePolishResult('   ', { extractJson })).toEqual({
      title: '',
      content: '',
      degraded: true,
    });
  });

  it('模型超长输出被钳制（它不保证遵守上限）', () => {
    const raw = JSON.stringify({ title: '标'.repeat(200), content: '文'.repeat(5000) });
    const result = parsePolishResult(raw, { extractJson });
    expect(result.title.length).toBeLessThanOrEqual(POST_POLISH_MAX_TITLE_CHARS);
    expect(result.content.length).toBeLessThanOrEqual(POST_POLISH_MAX_INPUT_CHARS);
  });

  it('content 缺失但给了 body 字段：兼容这一种别名', () => {
    const result = parsePolishResult('{"title":"T","body":"用 body 装的正文"}', { extractJson });
    expect(result.content).toBe('用 body 装的正文');
  });
});

describe('isPolishResultChanged', () => {
  it('内容一致返回 false（避免「应用」了却没有任何变化）', () => {
    expect(
      isPolishResultChanged({ title: '标题', content: '正文' }, { title: '标题', content: '正文' }),
    ).toBe(false);
  });

  it('仅标题变化算改动', () => {
    expect(
      isPolishResultChanged({ title: 'A', content: '正文' }, { title: 'B', content: '正文' }),
    ).toBe(true);
  });

  it('仅分段变化算改动（换行不被折叠）', () => {
    expect(isPolishResultChanged({ content: '一句两句' }, { content: '一句\n\n两句' })).toBe(true);
  });

  it('只是连续空格差异不算改动（不然每次都会说「整理好了」）', () => {
    expect(isPolishResultChanged({ content: 'a  b' }, { content: 'a b' })).toBe(false);
  });
});

/**
 * 撤销链的守卫（2026-10-25 改版后新增）
 *
 * 交互改成「直接替换 + 可撤销」之后，撤销就成了唯一的安全网 ——
 * 它一旦坏了，用户手写的正文会被 AI 的文字永久覆盖且无法恢复。
 * 而这类失效**不会报错**：按钮点了、界面没反应，只有用户自己发现。
 * 所以下面每条都锁一个具体的失效方式。
 */
describe('useForumPostPolish —— 直接替换 + 撤销', () => {
  // 默认把两段时长压成 0：单测验证的是**时序关系**，不是真实等待。
  // 真实值由「落点时序」那一组单独验。
  const setup = async (responseText, { reject = null, settleMs = 0, exitMs = 0 } = {}) => {
    vi.resetModules();
    vi.doMock('@/utils/bohai-model-client.js', () => ({
      getBohAIModelStatus: () => ({ hasConfig: true }),
      extractBohAIJsonObject: extractJson,
      callBohAIModel: reject
        ? vi.fn().mockRejectedValue(reject)
        : vi.fn().mockResolvedValue({ content: responseText }),
    }));
    const mod = await import('../../src/views/Forum/composables/useForumPostPolish.js');
    const applied = [];
    const api = mod.useForumPostPolish({ onApplied: (d) => applied.push(d), settleMs, exitMs });
    return { api, applied, mod };
  };

  const ORIGINAL = { title: '原标题', content: '原正文' };
  const AI = JSON.stringify({ title: '新标题', content: '新正文' });

  it('★ 成功后直接写回（不经过预览态）', async () => {
    const { api, applied } = await setup(AI);
    await api.polish(ORIGINAL);
    expect(applied).toEqual([{ title: '新标题', content: '新正文' }]);
    expect(api.status.value).toBe('applied');
    expect(api.isApplied.value).toBe(true);
  });

  it('★ 撤销写回的是「发起请求前」的原文，不是 AI 的文字', async () => {
    const { api, applied } = await setup(AI);
    await api.polish(ORIGINAL);
    const ok = api.undo();
    expect(ok).toBe(true);
    expect(applied).toEqual([
      { title: '新标题', content: '新正文' },
      { title: '原标题', content: '原正文' },
    ]);
    expect(api.status.value).toBe('idle');
  });

  it('★ 未应用时撤销是空操作（否则会把稿件清成空串）', async () => {
    const { api, applied } = await setup(AI);
    expect(api.undo()).toBe(false);
    expect(applied).toEqual([]);
    expect(api.status.value).toBe('idle');
  });

  it('★ 连点两次撤销不该写回两次', async () => {
    const { api, applied } = await setup(AI);
    await api.polish(ORIGINAL);
    expect(api.undo()).toBe(true);
    expect(api.undo()).toBe(false);
    expect(applied.filter((d) => d.title === '原标题')).toHaveLength(1);
  });

  it('AI 没改动时不进入 applied（不给一个指向「没发生的变化」的撤销）', async () => {
    const same = JSON.stringify({ title: ORIGINAL.title, content: ORIGINAL.content });
    const { api, applied } = await setup(same);
    await api.polish(ORIGINAL);
    expect(applied).toEqual([]);
    expect(api.status.value).toBe('idle');
    expect(api.isApplied.value).toBe(false);
  });

  it('请求失败落到 error，且不写回稿件', async () => {
    const { api, applied } = await setup(null, { reject: new Error('网络炸了') });
    const out = await api.polish(ORIGINAL);
    expect(out).toBeNull();
    expect(applied).toEqual([]);
    expect(api.status.value).toBe('error');
    expect(api.errorMessage.value).toContain('网络炸了');
  });

  it('用户主动取消（AbortError）安静回到 idle，不当成错误', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { api } = await setup(null, { reject: abortErr });
    await api.polish(ORIGINAL);
    expect(api.status.value).toBe('idle');
    expect(api.errorMessage.value).toBe('');
  });

  it('超长正文不发起请求（截断输入会导致输出被截断）', async () => {
    const { api, applied } = await setup(AI);
    const out = await api.polish({
      title: 'T',
      content: '字'.repeat(POST_POLISH_MAX_INPUT_CHARS + 1),
    });
    expect(out).toBeNull();
    expect(applied).toEqual([]);
    expect(api.status.value).toBe('error');
  });
});

/**
 * 落点时序（2026-10-25 第二轮，用户口径「光效结束时文字刚好被替换」）
 *
 * 这一组锁的是**顺序**，不是时长：哪一刻切状态、哪一刻写文字。
 * 上一版的病根就在于「写文字」和「流光结束」是同一个瞬间 —— 那不是参数问题，
 * 是顺序问题，所以必须用能观测顺序的手段来守。
 *
 * 手段：`settleMs` 传一个真实（但很短）的值 + 轮询 `status`。不用假时钟 ——
 * 这个状态机的等待发生在 `await` 之后，假时钟要配合 `advanceTimersByTimeAsync`
 * 与微任务队列交替推进，写起来脆、失败信息也难读。
 */
describe('useForumPostPolish —— 落点与文字替换同步', () => {
  const ORIGINAL = { title: '原标题', content: '原正文' };
  const AI = JSON.stringify({ title: '新标题', content: '新正文' });

  /** 每 5ms 采一次 `status`，直到 predicate 成立或超时（超时=失败，好报错）。 */
  const waitFor = async (predicate, { timeout = 1500, step = 5 } = {}) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (predicate()) return true;
      await new Promise((r) => setTimeout(r, step));
    }
    return false;
  };

  const setup = async ({ settleMs, exitMs }) => {
    vi.resetModules();
    vi.doMock('@/utils/bohai-model-client.js', () => ({
      getBohAIModelStatus: () => ({ hasConfig: true }),
      extractBohAIJsonObject: extractJson,
      callBohAIModel: vi.fn().mockResolvedValue({ content: AI }),
    }));
    const mod = await import('../../src/views/Forum/composables/useForumPostPolish.js');
    const applied = [];
    const api = mod.useForumPostPolish({
      onApplied: (d) => applied.push(d),
      settleMs,
      exitMs,
    });
    return { api, applied, mod };
  };

  it('★ 两个时长常量都是正数、且有先后关系（落点等待 > 状态停拍）', async () => {
    const mod = await import('../../src/views/Forum/composables/useForumPostPolish.js');
    expect(mod.POLISH_SETTLE_MS).toBeGreaterThan(0);
    expect(mod.POLISH_EXIT_MS).toBeGreaterThan(0);
    // 落点后的停拍必须明显短于落点等待：此时文字已恢复原色，
    // 再等一个长时长只会让状态行悬在「正在收尾…」上，读成卡顿。
    expect(mod.POLISH_EXIT_MS).toBeLessThan(mod.POLISH_SETTLE_MS);
  });

  it('★ 结果到手后先进 settling，**此时文字还没换**', async () => {
    const { api, applied } = await setup({ settleMs: 120, exitMs: 0 });
    const done = api.polish(ORIGINAL);

    // 等到进入 settling（说明结果已解析、落点等待已开始）
    expect(await waitFor(() => api.status.value === 'settling')).toBe(true);
    // 落点等待期间：输入框里仍是原文，撤销也还不可用
    expect(applied).toEqual([]);
    expect(api.settled.value).toBe(false);
    expect(api.isApplied.value).toBe(false);

    await done;
    // 落点之后才写回
    expect(applied).toEqual([{ title: '新标题', content: '新正文' }]);
    expect(api.settled.value).toBe(true);
    expect(api.status.value).toBe('applied');
  });

  it('★ 写回发生在「落点等待到点」之后，不是立刻（这一条就是上一版的病）', async () => {
    const settleMs = 160;
    const { api, applied } = await setup({ settleMs, exitMs: 0 });
    const startedAt = Date.now();
    const done = api.polish(ORIGINAL);

    // 请求已回来、已进 settling —— 从这一刻起计「落点等待起点」
    expect(await waitFor(() => api.status.value === 'settling')).toBe(true);
    const settlingAt = Date.now();
    // 此刻绝不该已经写回
    expect(applied).toEqual([]);

    await done;
    const writtenAt = Date.now();
    // 写回必须晚于落点等待起点接近一个 settleMs（留 30ms 容差给调度抖动）
    expect(writtenAt - settlingAt).toBeGreaterThanOrEqual(settleMs - 30);
    // 也别把整条链拖长太多
    expect(writtenAt - startedAt).toBeLessThan(settleMs + 800);
  });

  it('★ 落点之后状态行还有 exitMs 的停拍（status 仍是 settling，但 settled=true）', async () => {
    const exitMs = 160;
    const { api, applied } = await setup({ settleMs: 40, exitMs });
    const done = api.polish(ORIGINAL);

    // 落点：文字已写回，但状态还没进 applied
    expect(await waitFor(() => api.settled.value)).toBe(true);
    expect(applied).toEqual([{ title: '新标题', content: '新正文' }]);
    expect(api.status.value).toBe('settling');

    await done;
    expect(api.status.value).toBe('applied');
  });

  it('★ 落点等待期间是 busy（输入框只读、按钮禁用、不能重复发），落点后才是 applied', async () => {
    const { api } = await setup({ settleMs: 120, exitMs: 0 });
    const done = api.polish(ORIGINAL);

    expect(await waitFor(() => api.isBusy.value)).toBe(true);
    expect(api.isBusy.value).toBe(true);
    expect(api.isApplied.value).toBe(false);

    await done;
    expect(api.isBusy.value).toBe(false);
    expect(api.isApplied.value).toBe(true);
  });

  it('★ 落点等待期间撤销无效（没写回就没有可撤销的东西）', async () => {
    const { api, applied } = await setup({ settleMs: 120, exitMs: 0 });
    const done = api.polish(ORIGINAL);

    expect(await waitFor(() => api.status.value === 'settling')).toBe(true);
    expect(api.undo()).toBe(false);
    expect(applied).toEqual([]);

    await done;
    expect(api.undo()).toBe(true);
    expect(applied).toEqual([
      { title: '新标题', content: '新正文' },
      { title: '原标题', content: '原正文' },
    ]);
  });

  it('★ 落点等待途中被 reset：落点不再落（文字不该在取消之后才被换掉）', async () => {
    const { api, applied } = await setup({ settleMs: 200, exitMs: 0 });
    api.polish(ORIGINAL);

    expect(await waitFor(() => api.status.value === 'settling')).toBe(true);
    api.reset();

    // 等得比 settleMs 更久，确认那次定时器真的没把文字写回去
    await new Promise((r) => setTimeout(r, 320));
    expect(applied).toEqual([]);
    expect(api.status.value).toBe('idle');
  });

  it('★ 落点等待压成 0 时，落点与状态切换同帧完成（降级路径不能挂）', async () => {
    const { api, applied } = await setup({ settleMs: 0, exitMs: 0 });
    await api.polish(ORIGINAL);
    expect(applied).toEqual([{ title: '新标题', content: '新正文' }]);
    expect(api.status.value).toBe('applied');
    expect(api.settled.value).toBe(true);
  });
});

/**
 * 接线守卫（源码级）
 *
 * 文字流光有几条失效**不会报错**：`background-clip: text` 少了透明填充
 * （完全看不见）、CSS 与 JS 的落点时长各写一份、流光带回了彩色。
 * 这些只能靠源码断言守住 —— 它们都是「看起来在、其实没生效」的类型。
 */
describe('post-polish-sweep.css —— 文字流光的接线', () => {
  const css = readFileSync(
    resolve(import.meta.dirname, '../../src/views/Forum/styles/post-polish-sweep.css'),
    'utf8',
  );
  const composerVue = readFileSync(
    resolve(import.meta.dirname, '../../src/views/Forum/components/PostComposer.vue'),
    'utf8',
  );
  const themeCss = readFileSync(
    resolve(import.meta.dirname, '../../src/styles/themes/dark-mode.css'),
    'utf8',
  );
  const forumDarkCss = readFileSync(
    resolve(import.meta.dirname, '../../src/styles/themes/forum-dark.css'),
    'utf8',
  );

  it('★ 第五轮定稿：流光**必须**画在文字上（不是覆盖层）', () => {
    const flowBlock = css.match(/\.post-title-input\.is-polishing,[\s\S]*?\n\}/)?.[0] || '';
    expect(flowBlock).toContain('background-clip: text');
    expect(flowBlock).toContain('-webkit-text-fill-color: transparent');
    expect(flowBlock).toContain('background-image: linear-gradient');
    expect(flowBlock).toContain('animation: post-polish-text-flow');
    // 模板里不应再有任何覆盖层节点
    expect(composerVue).not.toContain('composer-polish-sweep');
    expect(composerVue).not.toContain('composer-polish-finish');
  });

  it('★ 流光是黑白的：不许出现彩色（设计语言仍是黑白灰）', () => {
    expect(css).not.toContain('conic-gradient');
    expect(css).not.toContain('hue-rotate');
    expect(themeCss).not.toContain('--post-polish-beam-');
    // 流光只允许 ink / low / shine 三档灰阶
    expect(css).toContain('--post-polish-ink');
    expect(css).toContain('--post-polish-low');
    expect(css).toContain('--post-polish-shine');
  });

  it('★ 流光是一条横向亮带（流光必须真的移动）', () => {
    const keyframes = css.match(/@keyframes post-polish-text-flow\s*\{[\s\S]*?\n\}/)?.[0] || '';
    // ⚠️ 百分比必须留在 0%–100%：220% 宽的图一旦移到区间外，透明字没有
    // 背景可绘，会露出白底（2026-10-26「文字变全白」的根因）。
    expect(keyframes).toContain('background-position: 100% 0');
    expect(keyframes).toContain('background-position: 0% 0');
    expect(keyframes).not.toContain('180%');
    expect(keyframes).not.toContain('-80%');
    // 时间真源：CSS 兜底与 JS 注入
    expect(css).toMatch(/--post-polish-flow:\s*2200ms/);
    expect(composerVue).toContain(':style="polishSweepStyle"');
  });

  it('★ 落点等待时长由 JS 注入，CSS 只留同值兜底（两处各写一份必然漂移）', () => {
    const mod = readFileSync(
      resolve(import.meta.dirname, '../../src/views/Forum/composables/useForumPostPolish.js'),
      'utf8',
    );
    const jsValue = Number(mod.match(/POLISH_SETTLE_MS\s*=\s*(\d+)/)?.[1] || NaN);
    const cssValue = Number(css.match(/--post-polish-settle:\s*(\d+)ms/)?.[1] || NaN);
    expect(Number.isFinite(jsValue)).toBe(true);
    // CSS 的兜底值必须与 JS 常量**同值**
    expect(cssValue).toBe(jsValue);
    // 组件必须真的把 JS 的值绑上去（否则 CSS 的兜底成了唯一真源，改 JS 无效）
    expect(composerVue).toContain("'--post-polish-settle': `${POLISH_SETTLE_MS}ms`");
  });

  it('★ 流光挂到两个真实 textarea 上（不是外层容器）', () => {
    expect((composerVue.match(/:class="\{ 'is-polishing': isBusyPolishing \}"/g) || []).length).toBe(2);
    expect(composerVue).toContain('class="post-title-input"');
    expect(composerVue).toContain('class="post-content-input"');
  });

  it('★ 暗色通用 textarea 规则不得清掉流光的 background-image', () => {
    const genericRules = forumDarkCss.match(
      /\[data-theme=['"]dark['"]\] \.forum-page textarea[^\{]*\{[^}]*\}/g,
    ) || [];
    expect(genericRules.length).toBeGreaterThan(0);
    for (const rule of genericRules) {
      // 通用暗色规则若用 background 简写且不带排除口，会把 is-polishing 的
      // background-image / background-clip 一起重置（实测暗色只剩透明文字）。
      if (/background\s*:/.test(rule)) {
        expect(rule).toContain('textarea:not(.is-polishing)');
      }
    }
  });

  it('★ reduce-motion 下必须复位 text-fill-color（否则文字直接消失）', () => {
    const reduceBlock = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduceBlock).toContain('--post-polish-settle: 1ms');
    expect(reduceBlock).toContain('--post-polish-exit: 1ms');
    expect(reduceBlock).toContain('animation: none');
    expect(reduceBlock).toContain('-webkit-text-fill-color: currentColor');
    expect(reduceBlock).toContain('background-clip: border-box');
    expect(css).toContain('.reduce-motion .composer-post-body');
  });

  it('★ 状态行有「收口中」这一支（落点前谎报「已整理」是错的）', () => {
    expect(composerVue).toContain('v-if="isPolishSettling"');
    expect(composerVue).toContain('正在收尾');
    // 撤销按钮只在真正写回之后出现
    expect(composerVue).toMatch(/v-else-if="polishApplied"[\s\S]{0,200}composer-polish-undo/);
  });

  it('★ 落点后流光立刻摘掉（完成后文字必须恢复可读的原色）', () => {
    // is-polishing 由 isBusyPolishing 控制；settled 之后 status 仍是 settling，
    // 但关键是不能让 is-polishing 在新文字上继续为真
    expect(composerVue).toContain(":class=\"{ 'is-polishing': isBusyPolishing }\"");
    const mod = readFileSync(
      resolve(import.meta.dirname, '../../src/views/Forum/composables/useForumPostPolish.js'),
      'utf8',
    );
    // settled 之后 status 才会变 applied，isBusy 随即为 false
    expect(mod).toMatch(/settled\.value = true;[\s\S]{0,400}status\.value = POLISH_STATUS\.applied/);
  });
});
