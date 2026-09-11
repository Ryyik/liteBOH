/**
 * p1-strip-utility-kit.mjs — 从 10 个全局样式文件中移除死工具类 kit
 * .box-shadownone / .box-sizing / .padding / .border-none
 * 注意：这些 SCSS 编译产物是 CRLF 行尾，正则一律 \r?\n。
 */
import fs from 'node:fs';

const files = [
  'src/styles/components/buttons.css',
  'src/styles/components/headings.css',
  'src/styles/components/cursor.css',
  'src/styles/components/close-button.css',
  'src/styles/components/link_underline.css',
  'src/styles/components/overlay.css',
  'src/styles/components/page__animate.css',
  'src/styles/pages/globalpage.css',
  'src/styles/pages/section__header.css',
  'src/styles/layouts/footer.css',
];

// 先做混血选择器手术（保留活部分；\s* 可跨越 \r\n）
const surgery = [
  [/\.box-shadownone,\s*\.btn:hover,\s*\r?\n\.btn:focus\s*\{/, null], // 替换串运行时按文件 EOL 生成
  [/\.box-sizing,\s*body\s*\{/, 'body {'],
  [/\.border-none,\s*\.footer-home \.main-nav-bottom\s*\{/, '.footer-home .main-nav-bottom {'],
];

// 纯死块：三行一体横幅注释 + 规则（兼容 CRLF/LF、两种大括号风格）
const bannerRule = (title, cls) =>
  new RegExp(
    '[ \\t]*\\/\\*[ \\t]*\\*{10,}[ \\t]*\\r?\\n' +
    '\\*[ \\t]*' + title + '[ \\t]*\\r?\\n' +
    '\\*{10,}\\*[ \\t]*\\/[ \\t]*\\r?\\n' +
    '\\.' + cls + '\\s*\\{[^{}]*\\}[ \\t]*\\r?\\n?',
    'g'
  );
const pureRemovals = [
  ['Box Shadow', 'box-shadownone'],
  ['Box Sizing', 'box-sizing'],
  ['Padding', 'padding'],
  ['Boreder None', 'border-none'],
  ['Border None', 'border-none'],
];

let totalRemoved = 0;
for (const f of files) {
  let t = fs.readFileSync(f, 'utf8');
  const isCRLF = /\r\n/.test(t);
  const before = t;
  // surgery[0] 的替换串按文件自身 EOL 生成，避免混入裸 LF
  t = t.replace(surgery[0][0], isCRLF ? '.btn:hover,\r\n.btn:focus {' : '.btn:hover,\n.btn:focus {');
  t = t.replace(surgery[1][0], surgery[1][1]);
  t = t.replace(surgery[2][0], surgery[2][1]);
  // 修复此前运行留下的裸 LF 行尾（仅 buttons.css 一处）
  if (isCRLF) t = t.replace('.btn:hover,\n.btn:focus {', '.btn:hover,\r\n.btn:focus {');
  for (const [title, cls] of pureRemovals) {
    t = t.replace(bannerRule(title, cls), () => { totalRemoved++; return ''; });
  }
  t = t.replace(/(?:\r?\n){3,}/g, (m) => (isCRLF ? '\r\n\r\n' : '\n\n'));
  if (t !== before) {
    fs.writeFileSync(f, t);
    console.log('edited:', f);
  } else {
    console.log('NO CHANGE:', f);
  }
}
console.log('pure blocks removed:', totalRemoved);
