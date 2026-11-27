import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// 论坛极简重构共享组件的契约守卫（plans/051 批 1）。
//
// 测试环境是 node（无 jsdom）⇒ 不挂载组件；组件契约用源码守卫锁。
// 这些组件是「评论系统四份实现收敛成一份」的落点，下面每条断言都对应
// 一条已实测踩过的坑或 plans/051 §4 的红线，删断言前先看注释里的出处。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const scriptOf = (relPath) => squeezeSource(stripComments(scriptSection(read(relPath))));
const wholeOf = (relPath) => squeezeSource(read(relPath));

const COMPOSER = 'src/components/forum/ReplyComposer.vue';
const LIKE = 'src/components/forum/LikeButton.vue';
const MENU = 'src/components/forum/CardActionsMenu.vue';
const IDENTITY = 'src/components/forum/ReplyIdentityRow.vue';
const TOKENS = 'src/styles/common/tokens.css';

describe('ReplyComposer · 输入框唯一真源', () => {
  const code = scriptOf(COMPOSER);

  it('自动增高走 useAutoGrowTextarea 且 value 必须是 getter 形式', () => {
    // plans/051 §4-3 / plans/021 §1.3：父级会主动改写内容（切换回复对象/发送成功清空），
    // 只绑 @input 的实现在这些路径上不会收缩 → getter 是硬契约。
    expect(code).toContain(squeezeSource('useAutoGrowTextarea({ value: () => props.modelValue })'));
  });

  it('不允许把 getter 包成 unref（unref 只解 ref 不调函数，watcher 永不触发）', () => {
    expect(code).not.toContain('unref(');
  });

  it('三态齐全：发送中 / 冷却（秒数）/ 未登录（need-login）', () => {
    const whole = wholeOf(COMPOSER);
    expect(whole).toContain('composer-spinner');
    expect(code).toContain('props.cooldown');
    expect(code).toMatch(/emit\('need-login'\)/);
  });

  it('Enter 发送且有中文输入法 composition 保护', () => {
    expect(code).toContain('event.isComposing');
    expect(code).toContain('!event.shiftKey');
  });

  it('取消 = 清空语义：没有独立的取消按钮', () => {
    expect(code).not.toContain('cancel-reply');
    expect(code).toContain("'clear-target'");
  });
});

describe('LikeButton · 点赞唯一真源', () => {
  const code = scriptOf(LIKE);

  it('计数为 0 时隐藏数字（plans/051 §0：不是显示 0）', () => {
    expect(code).toContain('props.alwaysShowCount || props.count > 0');
  });

  it('计数走 tabular-nums', () => {
    expect(wholeOf(LIKE)).toContain('tabular-nums');
  });
});

describe('CardActionsMenu · 低频操作收口', () => {
  const code = wholeOf(MENU);

  it('面板 Teleport 到 body（卡片 contain:paint 会裁剪溢出后代 —— 左栏浮层事故同源）', () => {
    expect(code).toContain('<teleport to="body">');
  });

  it('滚动即关（捕获阶段监听，防宿主容器滚动后面板错位）', () => {
    expect(code).toContain("addEventListener('scroll', close, true)");
  });

  it('Esc 可关', () => {
    expect(code).toContain("event.key === 'Escape'");
  });

  it('destructive 项走 is-danger（删除类红色项由调用方标记）', () => {
    expect(code).toContain('is-danger');
  });
});

describe('ReplyIdentityRow · 身份行唯一真源', () => {
  const code = scriptOf(IDENTITY);

  it('「回复 @目标」显隐必须走 forum-helpers 的 shouldShowReplyTarget（顶层回复不 @ 自己）', () => {
    expect(code).toContain("from '@/utils/forum-helpers.js'");
    expect(code).toContain('shouldShowReplyTarget(props.replyTo, props.rootAuthor)');
  });

  it('不在组件内重新发明折叠规则（否定断言：不得出现手写比较）', () => {
    expect(code).not.toContain('replyTo !==');
    expect(code).not.toContain('target !==');
  });

  it('头像框走 resolveFrameForAuthor 单源（官方卡由父级不传 avatarFrameUrl 实现）', () => {
    expect(code).toContain('resolveFrameForAuthor(props.avatarFrameUrl, props.authorId)');
  });

  it('尺寸只有三档（40/28/20），加第四档必须先改 plans/051 §0', () => {
    expect(code).toContain("['lg', 'md', 'sm']");
  });
});

describe('apple token · 论坛极简唯一色源', () => {
  const css = wholeOf(TOKENS);

  it('Ultra 独占卡色在明暗两段都有定义（成对维护纪律）', () => {
    expect(css).toContain('--appl-ultra-card');
    // dark 段：取最后一个 data-theme（暗）块做局部断言；引号风格两版都认
    // （tokens.css 因 check:first-paint 的 pickDecl 固定用双引号，见 plans/051 纪律备注）
    const darkIdx = Math.max(
      css.lastIndexOf("data-theme='dark'"),
      css.lastIndexOf('data-theme="dark"'),
    );
    expect(darkIdx).toBeGreaterThan(-1);
    expect(css.slice(darkIdx)).toContain('--appl-ultra-card');
  });

  it('头像三档尺度 token 存在（40/28/20）', () => {
    expect(css).toContain('--appl-avatar-lg: 40px');
    expect(css).toContain('--appl-avatar-md: 28px');
    expect(css).toContain('--appl-avatar-sm: 20px');
  });
});
