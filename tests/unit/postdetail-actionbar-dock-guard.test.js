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
import { scriptSection } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(root, 'src/views/PostDetail/modal-layout.css'), 'utf8');

/** 去掉注释：注释里会合法地**复述**这些属性名来解释原因（本文件顶部就写了）。 */
const stripCssComments = (text) => String(text).replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * 取 .vue 的 `<script>` 区（**必须**先排掉模板区）。
 * 直接用 `stripCssComments` 扫全文会踩 `assets/image/*` 里的裸开注释符，
 * 与远处闭注释符配对后一次删掉半篇源码 —— 本仓 `tests/helpers/source.js` 记着这次事故。
 */
const scriptSectionOf = (vueSource) => scriptSection(vueSource);

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

/**
 * 无图帖降级（弹窗单栏全宽）—— 这条路径**探针覆盖不到**，所以在这里守。
 *
 * 为什么不在探针里测：`probe-pd-modal` 的 A9 靠 feed 里真实存在一条无图帖。
 * 2026-11-24 实测当前库**一条都没有**（12 张卡里 2 张「看着像」的其实是
 * `ad-slot ad-slot-fixed` 广告位，它们也带 `.post-card-v2` 类 —— 这正是 A9 长红的真因：
 * 旧判据「没有 .image-post-thumb」优先命中广告卡，随后按索引点标题点时错位到别的帖子上）。
 * 探针里如实打 SKIP，不为「看起来全绿」去伪造数据；契约改由源码守卫。
 */
describe('无图帖降级契约（弹窗媒体列只认正文图）', () => {
  const main = readFileSync(resolve(root, 'src/views/PostDetail/PostDetailMain.vue'), 'utf8');
  const script = stripCssComments(scriptSectionOf(main));

  it('hasMedia 只认「非 cover fallback」的图', () => {
    /* 若去掉 isCoverFallback 这个过滤，「有封面字段但无正文图」的帖会撑起一条空白媒体列，
       用户视角就是「无图帖却显示左半边空白」。这是回归点，不是实现细节。 */
    expect(script).toMatch(
      /detailImages\.value\.some\(\s*\(image\)\s*=>\s*!image\?\.isCoverFallback/,
    );
  });

  it('媒体列与 has-media 类都由同一个 hasMedia 驱动（不许分叉）', () => {
    /* 两处判据一旦分叉，会出现「媒体列渲染了但 body 没加 has-media 类」⇒ 单栏样式套在双列上。 */
    expect(main).toMatch(/v-if="hasMedia"\s+class="pd-modal-media"/);
    expect(main).toMatch(/'pd-modal-body--has-media':\s*hasMedia/);
  });

  it('无图帖走单栏：has-media 缺席时列模板是单列', () => {
    const css = readFileSync(resolve(root, 'src/views/PostDetail/modal-layout.css'), 'utf8');
    const plainCss = stripCssComments(css);
    // 基础 .pd-modal-body 必须是单列；双列只挂在 --has-media 变体上
    const base = /\.post-detail-page--modal\s+\.pd-modal-body\s*\{([^}]*)\}/.exec(plainCss);
    expect(base).not.toBeNull();
    expect(base[1]).toMatch(/grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s*;/);
    const variant = /\.post-detail-page--modal\s+\.pd-modal-body--has-media\s*\{([^}]*)\}/.exec(
      plainCss,
    );
    expect(variant).not.toBeNull();
    expect(variant[1]).toContain('--pd-media-col');
  });
});
