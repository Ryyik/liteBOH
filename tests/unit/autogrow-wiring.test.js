import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection, stripComments, flattenSource } from '../helpers/source.js';

// plans/021 阶段 2/3：评论 / 回复 / 标题输入框的「多字扩展」全部收敛到
// composables/useAutoGrowTextarea.js 单源（阶段 3 Lab 部分随 2026-10-19 实验室退场删除）。
// 本文件锁三类事：
//   1. 接线在位（模板 ref + script 里的 useAutoGrowTextarea 调用）；
//   2. 自研实现已删（scrollHeight / style.height / autoResizeTitle / autoGrow 不再出现）；
//   3. 真源划分不被破坏（上限只住 CSS；composable 的写回必须无条件、getter 必须透传）。
// 真实布局由 scripts/probes/probe-reply-autogrow.mjs 在浏览器里验，两边不重复。

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const codeOf = (rel) => flattenSource(stripComments(scriptSection(read(rel))));

const COMPOSABLE = 'src/composables/useAutoGrowTextarea.js';

describe('useAutoGrowTextarea：单源纪律', () => {
  it('上限只在 CSS：JS 不写第二份像素值（读 getComputedStyle）', () => {
    const code = codeOf(COMPOSABLE);
    // 上限来自计算样式，且解析不了时归一为「无上限」而不是兜底常量
    expect(code).toContain('parseCssLength(style.maxHeight)');
    expect(code).not.toMatch(/maxHeight\s*[:=]\s*\d{2,}/);
  });

  it('height 写回必须无条件：相等就 return 会把元素永久留在 auto', () => {
    const code = codeOf(COMPOSABLE);
    // 2026-09-30 实测踩过：n=6 时 next 与上次同为 168 提前返回，高度掉回 85。
    // 写成「next === 上次就 return」的任何变体都不允许再出现。
    expect(code).not.toMatch(/if\s*\(\s*next\s*===/);
    expect(code).not.toMatch(/next\s*===\s*(last|prev)/);
    expect(code).toContain('el.style.height=`${next}px`;');
  });

  it('value 是 getter 时直接透传：不包 unref（unref 不解函数，watcher 永不触发）', () => {
    const code = codeOf(COMPOSABLE);
    expect(code).toContain("typeofvalue==='function'?value:()=>unref(value)");
    expect(code).not.toContain('watch(()=>unref(value)');
  });
});

describe('阶段 2：消息中心回复框接入', () => {
  const rel = 'src/views/user-center/Messages/index.vue';

  it('接线：模板 ref + value getter（取消/发送/关详情都会主动清空 replyContent）', () => {
    const raw = read(rel);
    expect(raw).toContain('ref="replyTextareaRef"');
    const code = codeOf(rel);
    expect(code).toContain('useAutoGrowTextarea({value:()=>replyContent.value})');
  });

  it('不夹带自研增高', () => {
    const code = codeOf(rel);
    expect(code).not.toMatch(/scrollHeight/);
    expect(code).not.toMatch(/style\.height/);
  });
});

describe('阶段 3：PostComposer 标题框收敛', () => {
  const rel = 'src/views/Forum/components/PostComposer.vue';

  it('自研 autoResizeTitle 已删，改接单源（受控 :value，必须传 getter）', () => {
    const code = codeOf(rel);
    expect(code).not.toContain('autoResizeTitle');
    expect(code).not.toMatch(/scrollHeight/);
    expect(code).not.toMatch(/style\.height/);
    expect(code).toContain('useAutoGrowTextarea({value:()=>props.newPost.title})');
  });

  it('标题框上限仍住 CSS（132px，composer.css）', () => {
    const css = read('src/views/Forum/styles/composer.css');
    expect(css).toMatch(/\.post-title-input\s*\{[^}]*max-height:\s*132px/);
  });
});

// 2026-10-19：原「阶段 3：Lab 输入框收敛」describe 块随实验室（/lab）退场删除 ——
// Lab/index.vue 与 style.scoped.css 已不在仓库，单源纪律由上方两个 describe 继续锁。

describe('ForumMain 引用转发弹窗：死 UI 不接线（2026-10-13 复核结论）', () => {
  it('PostCard 未声明/未发射 quote-repost，ForumMain 弹窗全站不可达；真实转发入口是 ShareIsland', () => {
    const postCard = read('src/views/Forum/components/PostCard.vue');
    expect(postCard).not.toContain("emit('quote-repost'");
    expect(postCard).not.toContain("'quote-repost',");
    // 万一未来有人重新接线，这条会红，提醒同步接 useAutoGrowTextarea + 更新探针绊线
  });
});
