/**
 * 源码守卫断言的「格式宽容」归一工具。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 本仓库有大量「读源码文件 + `toContain(字面量)`」的守卫断言（用来锁住某个调用、
 * 某个类名、某段契约不被误删）。这类断言天然**对格式敏感**，而 prettier 会重排源码，
 * 于是它们会在「格式化某个文件」时集体假红。**已经咬过三次**：
 *   · 2026-09-27：prettier 重排 UserSpaceMain 等，CI 源码正则断言三连挂（c79a81c5 修）；
 *   · 2026-09-28：重排 useModelConfig.js 又挂一次；
 *   · 2026-09-28：全量格式化 src 做实证排查，一次性挂 9 处（6 个文件）。
 *
 * ── prettier 对源码的改动只有四类会影响逐字断言 ──────────────────────
 *   1. 换行与缩进（长行拆行、import 展开成多行、属性跨行）；
 *   2. 给最后一个元素补**尾逗号**（`,)` `,]` `,}`）；
 *   3. **引号风格**：`.prettierrc` 的 `singleQuote: true` 也作用于 CSS，
 *      `html[data-theme="dark"]` 会被改成 `html[data-theme='dark']`（模板属性不受影响）；
 *   4. **补分号**：`return foo()` → `return foo();`。
 *
 * 1、2 两类交给 `squeezeSource` / `flattenSource`；3、4 两类**不要**指望归一工具
 * （引号与分号在个别场景下是有意义的信息，全局抹掉会连真话一起抹掉），要么把断言写成
 * `/html\[data-theme=['"]dark['"]\]/` 这种双引号宽容的正则，要么把正则边界写成
 * `\(\)[\s\S]*?\n\s*\}`（容忍 `;` 与缩进）。
 *
 * ── 两个归一函数，边界在哪（这是实测出来的，不是推测）────────────────
 *   · `squeezeSource`：空白压成**单个空格** + 去尾逗号 + 去闭括号前空白。
 *     能抹平的断行：**token 之间**（拆实参、拆数组/对象字面量、属性跨行）、
 *     **闭括号之前**。
 *     ⚠️ **抹不平**：断行紧跟在**开括号之后**（`Boolean(\n  a || b\n)`）或**属性值引号之后**
 *     （`:key="\n  expr\n"`）—— 因为压成单空格后会留下 `Boolean( a || b)` / `:key=" expr "`，
 *     与人类写法 `Boolean(a || b)` 不是同一个串（`tests/unit/source-helper.test.js`
 *     用反证锁住了这一点）。
 *   · `flattenSource`：上面全部规则 + **移除所有空白**。断点落在哪都无所谓，代价是必须
 *     **两边都包裹**（不能再与「没包裹的字面量」共存）。
 *
 * 怎么选：默认 `squeezeSource`（可与既有未包裹字面量共存）；断言里出现了上面那两种
 * 「开括号后 / 引号后」的断行，就换成 `flattenSource`。
 *
 * ── 两条纪律 ────────────────────────────────────────────────────────
 *   1. **两边都要过同一个归一函数** —— 只归源码不归期望串，等于没归；
 *   2. **别混用**：同一处断言的源码与期望串必须用同一个函数，否则归了个寂寞。
 *
 * ── 用法 ────────────────────────────────────────────────────────────
 *   import { squeezeSource, flattenSource } from '../helpers/source.js';
 *
 *   const code = squeezeSource(await read('some/file.js'));
 *   expect(code).toContain(squeezeSource(`foo(a, b)`));
 *
 *   // prettier 在 `(` 后或 `="` 后断行时：
 *   expect(flattenSource(src)).toContain(flattenSource(`Boolean(a || b)`));
 *
 * 契约由 tests/unit/source-helper.test.js 锁住（改本文件必须让它继续绿）。
 */
export const squeezeSource = (text) =>
  String(text)
    // 1) 压平所有空白（换行 / 缩进 / 多空格）
    .replace(/\s+/g, ' ')
    // 2) 去掉「右括号/右方括号/右花括号前的逗号」= prettier 补的尾逗号。
    //    两个坑都踩过：
    //    · 早先写成 `,(\s*[)\]}]?)`，字符组后的 `?` 让括号变成可选 → 把**所有**逗号
    //      都删了（import 里的也一起没了），测试当场抓到；
    //    · 改前瞻后又写成 `[)\]}]` —— 这个字符类在 JS 里**不匹配 `}`**（实测），
    //      于是 `{ a: 1, }` 修不掉。改用显式交替，不再依赖转义歧义。
    .replace(/,\s*(?=\)|\]|\})/g, '')
    // 3) 去掉闭括号前的空白。**这一步是第 2 步的必要收尾**：第 2 步把逗号和它后面的空格
    //    一起吃了，于是「有尾逗号」的一侧归出 `safeErrorDetail}`、「没尾逗号」的一侧归出
    //    `safeErrorDetail }` —— 同一段代码格式化前后会归出两个不同的串，断言在两种树上
    //    不能同时绿（本文件的自测当场抓到）。人类写法不会出现 `foo(a )`，不会误伤既有字面量。
    .replace(/\s+(?=\)|\]|\})/g, '');

/**
 * 全空白移除版归一：给「prettier 会在开括号后 / 属性值引号后断行」的场景用（见文件头）。
 * 复用 `squeezeSource` 而不是另写一遍正则 —— 尾逗号规则只该有一个定义处。
 */
export const flattenSource = (text) => squeezeSource(text).replace(/\s+/g, '');

/**
 * ── 2026-09-29 新增：断言「某个弃用写法不再出现」时，先把注释剥掉 ──────────────
 *
 * 动机：这类守卫天然要在**全文**上做否定断言，而注释里会**合法地**复述那个弃用写法
 * （例：ProfileMain 的新注释写了 `ref(getNotificationStoreSync())` 来解释为什么删掉它）。
 * 直接在原文上断言 → 假红。
 *
 * ⚠️ **不要**对 .vue 全文跑 `/\*[\s\S]*?\*\//g` —— 实测（2026-09-29）：
 *   `src/views/Profile/ProfileMain.vue` 的模板里有 `accept="image/*"`，其中的
 *   开注释符（斜杠+星号）会与**远处**的闭注释符（星号+斜杠）配对，一次删掉 42,458 字节
 *   （84,605 → 42,147），把中间的真实代码（含 import 行）一起吃掉
 *   → 否定断言**静默变松（假绿）**。
 *   实测 7 个通知宿主里 6 个都含裸的开注释符（index.vue 25 处 / ForumMain 19 处 …）。
 * （本注释自身也不写字面的开闭注释符连写：那会把这段说明提前截断。）
 * 正解是两段式：先 `scriptSection()` 只取 `<script>` 区，再 `stripComments()`。
 */
export const scriptSection = (vueSource) => {
  const text = String(vueSource);
  const blocks = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  // 非 .vue（纯 .js / .ts）：没有 script 标签，原样返回
  return blocks.length ? blocks.join('\n') : text;
};

/**
 * 剥掉 JS 注释。**必须**先用 `scriptSection()` 把 .vue 的模板区排掉（原因见上）。
 * `(^|[^:])` 那个前瞻是为了别把 `https://` / `vite://` 里的双斜杠当成注释起点。
 */
export const stripComments = (code) =>
  String(code)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
