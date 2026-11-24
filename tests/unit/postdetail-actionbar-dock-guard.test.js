/**
 * postdetail-actionbar-dock-guard.test.js —— 弹窗底部操作栏「必须贴底」的源码守卫
 *
 * ── 为什么需要这条守卫（2026-11-24 用户报障）─────────────────────────────
 * 报障原话：「评论区操作按钮应该贴底部」，截图里输入框那一行浮在半空，下方留一大片白底。
 *
 * 结构事实：`.pd-actionbar` 是 `.pd-modal-info`（纵向 flex）的**最后一项**。
 * 它能贴底，本来**只**靠前面的 `.pd-info-scroll` 有 `flex: 1` 把剩余高度吃掉。
 * 这个依赖是隐式的、单通道的 —— 一旦有人给 info-scroll 换掉 flex（或网格行高退化、
 * 内容不足等任何让 scroll 不再占满的情形），操作栏就直接浮到内容末尾，
 * 而**滚动稳定性、按钮可见性这些常见断言全都还是绿的**（实测：只把 info-scroll 的
 * flex 改掉，按钮从 875 掉到 397，浮空 478px，但没有任何既有断言变红）。
 *
 * 修法是给操作栏自己一条独立兜底：`margin-top: auto` —— 不再依赖兄弟节点是否争气。
 *
 * ── 为什么是源码断言而不是探针 ──────────────────────────────────────────
 * 探针只能跑「当前正常」这一条路径。要覆盖「兄弟节点将来被改」这类退化，
 * 探针得为每种退化各造一个 fixture，成本高且仍会漏。这里守的是**不变式本身**
 * （兜底属性在、且没有被后续同前缀规则覆盖掉），退化情形由它兜住。
 * 几何结果另有 scripts/probes/probe-pd-modal.mjs 的 A8 在真实浏览器里量
 * （已同步把口径从过时的 10~26px 改成 ≤2px）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(root, 'src/views/PostDetail/modal-layout.css'), 'utf8');

/** 去掉注释：注释里会合法地**复述**这些属性名来解释原因（本文件顶部就写了）。 */
const stripCssComments = (text) => String(text).replace(/\/\*[\s\S]*?\*\//g, '');

const code = stripCssComments(css);

/**
 * 取出某条规则块的全部声明。只认**单一、精确**的选择器（避免误命中组合选择器）。
 * 返回 null 表示这段规则不存在。
 */
const ruleBody = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm');
  const match = re.exec(code);
  return match ? match[1] : null;
};

describe('弹窗底部操作栏必须贴底（.post-detail-page--modal .pd-actionbar）', () => {
  const body = ruleBody('.post-detail-page--modal .pd-actionbar');

  it('规则块存在（没被改名或误删）', () => {
    expect(body).not.toBeNull();
  });

  it('有 margin-top: auto —— 独立兜底，不依赖兄弟节点 flex:1 是否争气', () => {
    /* 这是本次报障的**修复本体**。去掉它，只要 .pd-info-scroll 不再占满剩余空间，
       操作栏就会浮在内容末尾（实测浮空 478px）。
       ⚠️ 别写成 `margin: ... auto` 简写再断言 `marginTop`：简写的 auto 是
       「水平居中」语义，跟这里要的「顶端推到底」不是同一件事，断言也会误绿。 */
    expect(body).toMatch(/margin-top\s*:\s*auto\s*;/);
  });

  it('有 flex: none —— 内容多时不许被压缩掉按钮行', () => {
    expect(body).toMatch(/flex\s*:\s*none\s*;/);
  });

  it('贴底契约没有被后续同前缀规则撤销（margin-top 不得被改回固定值）', () => {
    /* 抽出所有「以 .post-detail-page--modal .pd-actionbar 开头」的规则块，
       后面任何一条只要重设了 margin-top 且不是 auto，就等于把兜底悄悄关掉。 */
    const re = /\.post-detail-page--modal\s+\.pd-actionbar(?![\w-])\s*\{([^}]*)\}/g;
    const blocks = [...code.matchAll(re)].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThan(0);
    const revocations = blocks.filter((blk) => {
      const m = /margin-top\s*:\s*([^;]+);/.exec(blk);
      return m && m[1].trim() !== 'auto';
    });
    expect(revocations).toEqual([]);
  });
});

describe('横屏弹窗与竖屏整页两套操作栏各自的贴底机制不互相污染', () => {
  it('整页档仍是 position:fixed + bottom 走 --pd-dock-inset（键盘抬升）', () => {
    /* 竖屏底栏靠 fixed 贴视口，与弹窗内嵌档的 flex 贴底是两套机制。
       混用（例如给 .pd-actionbar--page 加 margin-top:auto）会破坏 keyboard inset 语义。 */
    const page = ruleBody('.post-detail-page .pd-actionbar--page');
    expect(page).not.toBeNull();
    expect(page).toMatch(/position\s*:\s*fixed\s*;/);
    expect(page).toMatch(/bottom\s*:\s*var\(--pd-dock-inset\s*,\s*0px\)\s*;/);
  });

  it('弹窗档不写 position:fixed（它靠 flex 布局贴底，不是脱离文档流）', () => {
    const modal = ruleBody('.post-detail-page--modal .pd-actionbar');
    expect(modal).not.toMatch(/position\s*:\s*fixed/);
  });
});
