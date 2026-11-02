import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 结算弹窗结构契约（2026-11-01 竖屏改版）：
 * 直接读源码断言关键结构 —— 防止后续重构把「显式关闭按钮 / 自绘下拉箭头 /
 * 紧凑两列」悄悄删掉。断言全部先去掉空白再匹配，prettier 重排不影响。
 */
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const compact = (s) => s.replace(/\s+/g, '');

describe('周边结算弹窗（contact-card）竖屏契约', () => {
  const tpl = compact(read('src/views/Shop/index.vue'));
  const css = compact(read('src/views/Shop/style.scoped.css'));

  it('有显式关闭按钮（竖屏下点遮罩可能被键盘吞掉，必须有实体按钮）', () => {
    expect(tpl).toContain('class="contact-close"');
    expect(css).toContain('.contact-close{');
    expect(css).toContain('position:absolute');
  });

  it('省份下拉必须自绘：appearance:none + ::after chevron（不用默认控件）', () => {
    // 模板用 .addr-select 包住 select
    expect(tpl).toContain('class="addr-select"');
    expect(tpl).toContain('<selectv-model="checkoutForm.province"');
    // CSS：去原生箭头 + 伪元素补箭头 + 右侧留出箭头空间
    expect(css).toContain('appearance:none');
    expect(css).toContain('.addr-select::after{');
    expect(css).toMatch(/\.addr-selectselect{[^}]*padding:030px012px/);
  });

  it('textarea 不给拖拽手柄（拖大会把竖屏版面顶变形）', () => {
    expect(css).toMatch(/\.contact-fieldtextarea{[^}]*resize:none/);
  });

  it('收件人 + 电话走两列紧凑布局（field-grid-2）', () => {
    expect(tpl).toContain('class="field-grid-2"');
    expect(css).toMatch(/\.field-grid-2{[^}]*grid-template-columns:minmax\(0,1fr\)minmax\(0,1fr\)/);
  });

  it('弹窗可内滚（max-height + overscroll-behavior），矮竖屏不会被撑出屏幕', () => {
    expect(css).toMatch(/\.contact-card{[^}]*max-height/);
    expect(css).toMatch(/\.contact-card{[^}]*overscroll-behavior:contain/);
  });

  it('金额行包在 contact-summary 里：上缘分隔一次，行间不再画线', () => {
    expect(tpl).toContain('class="contact-summary"');
    expect(css).toContain('.contact-summary{');
    expect(css).toContain('.contact-summary.contact-line+.contact-line{');
  });
});

/**
 * 地址「识别」按钮的降级链契约（2026-11-02）：
 *   A) clipboard.readText() 能读 → 直接拆分填表；
 *   B) 读不到（iOS WKWebView / iframe / 未授权）→ 进入等待粘贴态，
 *      文档捕获阶段的一次性 paste 监听把用户 Ctrl+V / 长按粘贴接住。
 * 这些都是「不做就静默失效」的行为：按钮点了没反应时用户只会以为坏了，
 * 所以用源码契约把它们钉住（断言同样先压空白，prettier 重排不影响）。
 */
describe('周边地址识别（剪贴板 + 粘贴兜底）契约', () => {
  const src = compact(read('src/views/Shop/index.vue'));
  const css = compact(read('src/views/Shop/style.scoped.css'));

  it('识别按钮绑 readClipboardAddress，并按识别中 / 等待粘贴切换文案', () => {
    expect(src).toContain('@click="readClipboardAddress"');
    expect(src).toContain(':disabled="recognizing"');
    expect(src).toContain("awaitingPaste?'等待粘贴':'识别'");
  });

  it('先走标准剪贴板 API（且必须有存在性守卫，无该 API 的 WebView 不能抛错）', () => {
    expect(src).toContain('if(navigator.clipboard?.readText){');
    expect(src).toMatch(/text=awaitnavigator\.clipboard\.readText\(\)/);
  });

  it('读不到时进入等待粘贴态：文档捕获阶段挂一次性 paste 监听 + 15s 自动解除', () => {
    expect(src).toContain("document.addEventListener('paste',onDocumentPaste,true)");
    expect(src).toContain('setTimeout(stopPasteWatch,15000)');
    expect(src).toContain('awaitingPaste.value=true');
  });

  it('兜底粘贴要拆分成三段并退出等待态（不能只把文本塞进输入框）', () => {
    expect(src).toMatch(/functiononDocumentPaste\(event\)\{[\s\S]*?applyAddressText\(text\)/);
    // 拆不出来时原文留在识别框（不丢字），拆出来才清空
    expect(src).toContain("checkoutForm.pasteText=ok?'':text");
    expect(src).toMatch(/applyAddressText\(text\);[\s\S]*?stopPasteWatch\(\)/);
  });

  it('粘贴监听必须能被收回：关弹层、组件卸载都要 stopPasteWatch', () => {
    expect(src).toMatch(
      /constcloseContactModal=\(\)=>\{showContactModal\.value=false;stopPasteWatch\(\);?\}/,
    );
    expect(src).toMatch(/onBeforeUnmount\(\(\)=>\{[^}]*stopPasteWatch\(\)/);
    expect(src).toMatch(
      /functionstopPasteWatch\(\)\{[\s\S]*?removeEventListener\('paste',onDocumentPaste,true\)/,
    );
  });

  it('等待态有可见反馈：按钮描边走品牌色（否则用户不知道「点了在等什么」）', () => {
    expect(src).toContain(':class="{\'is-awaiting\':awaitingPaste}"');
    expect(css).toMatch(/\.addr-paste-btn\.is-awaiting\{[^}]*border-color/);
  });
});
