/**
 * gate-fixtures.mjs — 门禁自检的**违规样本**声明
 *
 * 背景：本仓库出过两次「检查在跑、但永远绿」——
 *   ① check-project-structure 只过滤 .js，而路由全是 .ts → 53 条一条没查，却输出 clean；
 *   ② check:dark-tokens 跑在观察档（总量上升只打 ⚠️，exit 0）→ 永不阻断任何构建。
 * 两者都表现为「CI 全绿」。假绿是静默的，靠人盯是盯不住的。
 *
 * 所以每道门禁都要能回答一个问题：**「你凭什么证明自己会红？」**
 * 本文件就是那些证据。每条 fixture 声明「怎么造一个已知违规」，由
 * scripts/check-gates-self-test.mjs 注入 → 跑门禁 → 断言退出码非 0 → 撤销。
 *
 * 写 fixture 的三条纪律：
 *   1. **prepare() 必须返回 restore()**，且 restore 幂等 —— 崩溃时也要能还原干净；
 *   2. **注入必须真的改变内容**（editFile 会断言），否则 fixture 会静默失效，
 *      那种「样本没生效、门禁自然绿」的假阳性比没有自检更糟；
 *   3. 优先选**破坏面最小**的落点：能新建临时文件就别改已有文件，能改注释外的
 *      末行就别动文件中部。
 */
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 改写已有文件，返回还原函数。
 * 若 mutate 没改变任何内容 → 抛错（说明 fixture 已失效，例如上游把锚点改了）。
 */
const editFile = (file, mutate, label) => {
  if (!existsSync(file)) throw new Error(`落点不存在：${file}`);
  const original = readFileSync(file, 'utf8');
  const next = mutate(original);
  if (next === original) {
    throw new Error(`注入无效（fixture 已失效，锚点可能被上游改掉了）：${label} @ ${file}`);
  }
  writeFileSync(file, next);
  return () => writeFileSync(file, original);
};

/** 新建临时文件，返回删除函数。文件已存在则拒绝（避免覆盖真实文件）。 */
const createFile = (file, content) => {
  if (existsSync(file)) throw new Error(`落点已存在，拒绝覆盖：${file}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return () => rmSync(file, { force: true });
};

/** 在文件末尾追加（比改中部安全） */
const appendTo = (file, snippet, label) =>
  editFile(file, (s) => (s.endsWith(snippet) ? s : `${s}\n${snippet}\n`), label);

/**
 * 每条：
 *   gate        package.json 里的 npm script 名（自检直接跑它，确保测的是真实入口）
 *   why         这条门禁防的是什么（写给人看，避免 fixture 被当成噪声删掉）
 *   prepare()   注入违规，返回还原函数
 */
export const FIXTURES = [
  {
    gate: 'check:views',
    why: 'src/views 下 .vue 与同名目录并存会让路由解析歧义',
    prepare: () =>
      createFile(
        'src/views/Home.vue',
        '<!-- gates-self-test 临时样本：与 src/views/Home/ 目录制造同名冲突 -->\n',
      ),
  },
  {
    gate: 'check:structure',
    why: '运行时图片目录混入 png/jpg 原图会让打包体积失控（应归档到 docs/assets-source）',
    prepare: () =>
      createFile('src/assets/images/__gates_probe.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  },
  {
    gate: 'check:auth-validation',
    why: '前端与服务端的密码长度下限必须一致，否则前端校验形同虚设（2026-06 出过 8 vs 6 的漂移）',
    prepare: () =>
      editFile(
        'src/utils/auth-validation.js',
        (s) => s.replace(/(PASSWORD_MIN_LENGTH\s*=\s*)8\b/, '$19'),
        'PASSWORD_MIN_LENGTH 8 → 9',
      ),
  },
  {
    gate: 'check:liquid-glass',
    why: '毛玻璃材质只能有一处实现，别处手写 blur() 会与 tokens 分叉、改一处漏一处',
    prepare: () =>
      appendTo(
        'src/styles/components/buttons.css',
        '.__gates_probe { backdrop-filter: blur(20px); }',
        '手写 backdrop-filter blur(20px)',
      ),
  },
  {
    gate: 'check:important-budget',
    why: '!important 是存量债棘轮，只许降不许升（靠它拦「用 !important 抢特异性」这种绕过）',
    prepare: () =>
      appendTo(
        'src/styles/common/glass-aliases.css',
        '.__gates_probe { color: red !important; }',
        '新增 1 处 !important（该文件基线为 0）',
      ),
  },
  {
    gate: 'check:dark-tokens:strict',
    why: '暗色裸色值棘轮：新增裸色值意味着以后调色要改 N 处，只许降不许升',
    prepare: () =>
      editFile(
        'src/styles/themes/dark-mode.css',
        (s) =>
          s.replace(
            '[data-theme="dark"] {',
            '[data-theme="dark"] {\n  --gates-probe-naked-color: #ff00ff;',
          ),
        '暗色块内注入裸色值',
      ),
  },
  {
    gate: 'check:first-paint',
    why: '首屏骨架色值必须与 token 同步，否则会白屏闪烁或主题错色',
    prepare: () =>
      editFile(
        'src/styles/common/tokens.css',
        (s) => s.replace(/(--boh-page-bg:\s*)#[0-9a-fA-F]{3,8}/, '$1#123456'),
        '--boh-page-bg 改成与骨架不一致的值',
      ),
  },
];

/**
 * 已知**无法**自证的门禁及原因 —— 列出来是为了让「未覆盖」变成明账，
 * 而不是留一块没人知道的盲区。
 */
export const UNTESTABLE = [
  {
    gate: 'security:anon-check',
    why: '需要 Supabase Management API token 读 pg_catalog，离线无法造违规',
  },
  { gate: 'check:shell-precache', why: '读 dist/ 产物，需先构建' },
  { gate: 'check:bundle-size', why: '读 dist/ 产物，需先构建' },
  { gate: 'check:route-css-runtime', why: '要起 preview 服务 + 浏览器，属手工专项' },
  { gate: 'check:sw-upgrade', why: '要 dist 与 dist-check 双产物对比，属手工专项' },
  { gate: 'lint / type-check / test', why: '本身即测试套件，红不红由用例决定，无需造样本' },
  { gate: '各类 probe:*', why: '要浏览器环境（Playwright），样本即测试用例本身' },
];
