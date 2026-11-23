/**
 * 论坛「问博莱克」内联回答卡片的接线守卫（2026-11-22）。
 *
 * 这是一次「入口换通道」的重构：旧链路 = 检索拼长 prompt → showIsland.ai 弹悬浮岛；
 * 新链路 = 检索 → BohForumAnswerCard 内联流式 → 点卡片经 boh-ai-session-handoff 跳
 * /ai-chat 自动打开这条对话。源码级断言锁三件事：
 *   ① 旧链路不许回来（弹岛 / 「悬浮岛为你解答」文案 / 长 prompt 拼装）；
 *   ② 新链路的两个关键口径真的接上（换词收卡；卡片停流 → flush → 登记 → 跳页）；
 *   ③ 交接的消费侧在 useBohShell（onMounted + onActivated 都要消费，keepAlive 两条路都通）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

/** .vue 的 <template> 区（scriptSection 的对称面；ForumMain 是 script 在前的 SFC）：
    模板断言（:key / :question）从这里读 */
const templateSection = (source) => {
  const start = source.indexOf('<template>');
  const end = source.lastIndexOf('</template>');
  return start >= 0 && end > start ? source.slice(start, end) : '';
};

const hostCode = () =>
  squeezeSource(stripComments(scriptSection(read('src/views/Forum/ForumMain.vue'))));
const hostTemplateCode = () =>
  squeezeSource(stripComments(templateSection(read('src/views/Forum/ForumMain.vue'))));
const cardCode = () =>
  squeezeSource(
    stripComments(scriptSection(read('src/views/Forum/components/BohForumAnswerCard.vue'))),
  );
const shellCode = () =>
  squeezeSource(stripComments(read('src/views/Bolek/composables/useBohShell.js')));

describe('ForumMain：问博莱克走内联卡片，旧弹岛链路退场', () => {
  it('宿主不得再调 showIsland.ai（岛是下拉 / ⌘K 的对话入口，不再接论坛搜索）', () => {
    expect(hostCode()).not.toContain('showIsland.ai(');
  });

  it('宿主不得再拼长 prompt / 留「悬浮岛为你解答」文案', () => {
    const code = hostCode();
    expect(code).not.toContain('正在悬浮岛');
    expect(code).not.toContain('当前无法唤起悬浮岛');
    expect(code).not.toContain('用户刚在社区论坛的搜索框里提问');
  });

  it('检索成功必须交付 inlineAsk（原句 + 相关帖），nonce 进 :key', () => {
    const code = hostCode();
    expect(code).toContain('inlineAsk.value = {');
    expect(code).toContain('nonce: (inlineAskNonce += 1)');
    expect(hostTemplateCode()).toContain(':key="inlineAsk.nonce"');
    expect(hostTemplateCode()).toContain(':question="inlineAsk.question"');
    expect(hostTemplateCode()).toContain(':posts="inlineAsk.posts"');
  });

  it('换关键词必须收卡 + 清 hint（watch(searchKeyword) → dismissInlineAsk）', () => {
    const code = hostCode();
    expect(code).toMatch(/watch\(searchKeyword, \(\) => \{[\s\S]{0,80}dismissInlineAsk/);
  });

  it('cancelPendingSearch 恰好两处（askBolek / 卸载清理）—— forum-feed-query 单源守卫同口径', () => {
    expect(hostCode().match(/cancelPendingSearch\(\)/g)).toHaveLength(2);
  });

  it('卡片必须经 createPanelAsync 懒加载（markdown chunk 不进 ForumMain 图）', () => {
    expect(hostCode()).toMatch(
      /const BohForumAnswerCard = createPanelAsync\( ?\(\) => import\('\.\/components\/BohForumAnswerCard\.vue'\)/,
    );
  });
});

describe('BohForumAnswerCard：原句进引擎、证据进 system prompt、点卡片交接', () => {
  it('新会话 origin 必须是 quick-ask（侧栏「在搜索里问过」分组零改动继承）', () => {
    expect(cardCode()).toContain("engine.startNewChat('quick-ask')");
  });

  it('档位契约：卡片恒走 balance（模式表缺 balance 时交给引擎兜底）', () => {
    const code = cardCode();
    expect(code).toContain('BOH_DEFAULT_MODE_ID');
    expect(code).toMatch(/modeIds\.includes\(BOH_DEFAULT_MODE_ID\)/);
  });

  it('检索证据走 evidenceBlock（不拼进用户消息）', () => {
    expect(cardCode()).toContain('engine.setAttachedContext({ evidenceBlock: buildEvidenceBlock');
  });

  it('发送的是原句（inputMessage = props.question）', () => {
    expect(cardCode()).toContain('engine.inputMessage.value = String(props.question');
  });

  it('点卡片四步链：停流 → 强制落盘 → 登记交接 → push 全页', () => {
    const code = cardCode();
    expect(code).toMatch(/if \(streaming\.value\) engine\.stopGeneration\(\)/);
    expect(code).toContain('engine.flushSessionsToStorage();');
    expect(code).toContain('requestBolekSessionOpen(timestamp)');
    expect(code).toContain("router.push('/ai-chat')");
  });

  it('点卡片必须豁免链接与选中文本（复制答案不等于要跳页）', () => {
    const code = cardCode();
    expect(code).toMatch(/event\.target\.closest\?\.\('a, button'\)/);
    expect(code).toMatch(/selection\.trim\(\)/);
  });
});

describe('useBohShell：全页消费交接（两条进入路径都要接）', () => {
  it('消费真源必须 import 自 boh-ai-session-handoff', () => {
    expect(shellCode()).toContain("from '@/utils/boh-ai-session-handoff.js'");
    expect(shellCode()).toContain('consumePendingBolekSessionOpen()');
  });

  it('onMounted 与 onActivated 都要消费（keepAlive 冷启 / 复活两条路）', () => {
    const code = shellCode();
    expect(code.match(/consumeSessionHandoff\(\)/g)).toHaveLength(2);
  });

  it('消费前必须无条件 reload（syncSessionsIfStale 的条件版会静默跳过）', () => {
    expect(shellCode()).toMatch(/consumeSessionHandoff[\s\S]{0,600}?reloadSessionsFromStorage\(\)/);
  });

  it('按 timestamp 找会话并 switchSession（会话无 id，timestamp 是唯一稳定身份）', () => {
    expect(shellCode()).toMatch(
      /findIndex\(\(session\) => session\?\.timestamp === targetTimestamp\)/,
    );
    expect(shellCode()).toMatch(/switchSession\(index\)/);
  });
});
