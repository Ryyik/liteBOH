#!/usr/bin/env node
/**
 * check-first-paint-closure.mjs — 首屏入口闭包的不变量门禁（源码级，不需要构建）
 *
 * ── 为什么需要它 ─────────────────────────────────────────────────────
 * 2026-11-14 的性能勘察（docs/2026-11-14-首屏与userspace性能勘察.md）量出两笔
 * 「用户根本没用到、但每个首次访客都要付」的下载：
 *
 *   ① 空闲预取把整条 AI 链路拉下来：BOHAI 页 77.4 + 引擎 115.5 + markdown 29.7
 *      ≈ 225.8 KiB。A/B 实测 LCP 8.83 s → 7.62 s（−1.21 s）。
 *   ② 「只有发帖才用」的模块被静态拽进入口闭包：压缩库 19.5 + 图片审核 11.4 + … ≈ 33 KiB。
 *
 * 这两类回归**没有任何现有门禁会报**：check:first-paint 只管骨架色值，
 * check:first-paint-budget 只看 index.html 直接引用的字节（路由闭包和 idle 预取
 * 都不在里面），check:shell-precache 只管「壳是不是齐了」。加一份 `import`、
 * 在数组里补一个 path，就能把几十上百 KiB 悄悄塞回首屏 —— 而且几个月后才有人发现。
 *
 * 所以这里用**源码级**断言把它们钉住。不做产物级是因为本门禁要进 verify:fast
 * （10 秒级、不跑构建）：源码断言在 PR 当场就能红，产物断言只能在 build 之后。
 * 代价是它只能拦「明面上的静态依赖」—— 产物口径的真实字节仍由
 * check:first-paint-budget（build 之后）与性能探针兜底，两者互补，不互相替代。
 *
 * ── 四条规则与它们守的东西 ────────────────────────────────────────────
 *   A 只读「状态/判定」的消费者不得静态 import 图片审核管线
 *     （content-moderation.js 与论坛的预载守卫）
 *     → 它们要的只是冷却状态与两个判定（moderation-cloud-state.js）。改回静态 import
 *       pipeline 会把 pipeline → forum-image-moderation → nsfw 兜底链整条拖进
 *       「内容 / 我」的首屏闭包或论坛流的静态图。
 *   B image-compression.js 不得顶层静态 import browser-image-compression
 *     → 这个文件被 avatar-storage 静态引用（发帖/换头像才用），库里那 19.5 KiB
 *       只能经函数内 `import()` 到达；连 `?url` 静态 import 都不行 —— Rollup 会把
 *       `?url` 与库本体包进同一个 chunk 并留下静态边。
 *   C 空闲预取清单只允许底栏高频席位
 *     → 加一个路由 = 给**所有**首次访客（包括永不打开它的人）加一份完整依赖闭包。
 *       要预取低频页，走 hover/focus 通道（useRoutePrefetch 的另一个入口）。
 *   D src 内不得静态 import nsfwjs / tfjs 权重
 *     → nsfw-weights 实测 2477 KiB gzip、单行 360 万字符，进静态图就是灾难。
 *       它必须只在「云端审核判定不可达」后经动态 import 加载。
 *
 * ── 退出码 ───────────────────────────────────────────────────────────
 *   0  全部通过
 *   1  有违反（打印文件、行号与修法）
 *
 * ── 反证（改完请自己验一次）──────────────────────────────────────────
 *   把 useRoutePrefetch.js 的 IDLE_PREFETCH_PATHS 加回 '/ai-chat' → 规则 C 红；
 *   把 content-moderation.js 的 import 改回 image-moderation-pipeline → 规则 A 红。
 *   两条都由 scripts/lib/gate-fixtures.mjs 的 fixture 自动注入验证（check:gates-self-test）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const violations = [];
const fail = (rule, msg) => violations.push(`[${rule}] ${msg}`);

const read = (p) => {
  try {
    return readFileSync(join(ROOT, p), 'utf8');
  } catch {
    fail('IO', `读不到 ${p}`);
    return '';
  }
};

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

/**
 * 抽出文件里所有**静态** import 的模块名（含多行 import 与副作用 import）。
 *
 * ⚠️ 别用「一行一条」的正则：本仓库的 import 多为多行写法
 *    （`import {\n  a,\n  b,\n} from './x.js';`），`[^;\n]*?` 跨不过换行会**静默漏检** ——
 *    这条规则第一次自证时就是这么漏的（注入了违规却没红）。用 `[^;]*?` 允许换行，
 *    import 语句里不会出现分号（动态 import 是 `import(`，不匹配 `\s+`）。
 */
const staticImportSpecifiers = (src) => {
  const out = [];
  const fromRe = /(?:^|\n)[ \t]*import\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(fromRe)) out.push({ spec: m[1], index: m.index });
  const sideEffectRe = /(?:^|\n)[ \t]*import\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(sideEffectRe)) out.push({ spec: m[1], index: m.index });
  return out;
};

/* ── A：只读「判定/状态」的消费者不得静态 import 图片审核管线 ─────────
 * 两处都已改成只 import moderation-cloud-state.js：
 *   · content-moderation.js（文本审核）—— 它要的是共享冷却状态；
 *   · views/Forum/composables/useForumImageModerationPreload.js（预载守卫）—— 它要的是
 *     isCloudModerationCoolingDown / shouldSkipLocalModel 两个判定。
 * 任一处退回静态 import，图片审核管线（含 forum-image-moderation → nsfw 兜底链）
 * 就跟着进「内容 / 我」的首屏闭包或论坛流的静态图。
 */
const PIPELINE_STATE_ONLY = [
  'src/utils/content-moderation.js',
  'src/views/Forum/composables/useForumImageModerationPreload.js',
];
for (const file of PIPELINE_STATE_ONLY) {
  const src = read(file);
  for (const { spec, index } of staticImportSpecifiers(src)) {
    if (!/image-moderation-pipeline/.test(spec)) continue;
    fail(
      'A',
      `${file}:${lineOf(src, index)} 静态 import 了图片审核管线（${spec}）。\n` +
        '     修法：只 import 它需要的状态/判定 —— ./moderation-cloud-state.js\n' +
        '     （同一份 ESM 单例实现，语义等价，但不会把 pipeline 拖进闭包）',
    );
  }
}

/* ── B：压缩库不得有顶层静态边（含 ?url）──────────────────────────── */
const IMAGE_COMPRESSION = 'src/utils/image-compression.js';
const icSrc = read(IMAGE_COMPRESSION);
for (const { spec, index } of staticImportSpecifiers(icSrc)) {
  if (!/browser-image-compression/.test(spec)) continue;
  fail(
    'B',
    `${IMAGE_COMPRESSION}:${lineOf(icSrc, index)} 顶层静态 import 了 browser-image-compression（${spec}）。\n` +
      '     修法：保持在函数内 `await import(...)`（见 loadImageCompression / loadCompressionWorkerLibUrl）。\n' +
      '     ⚠️ 连 `?url` 变体也不行：Rollup 会把它和库本体包进同一个 chunk 并留下静态边。',
  );
}

/* ── C：idle 预取清单只允许底栏高频席位 ───────────────────────────── */
const PREFETCH = 'src/composables/useRoutePrefetch.js';
/* 允许清单 = 底栏五个席位里「入口已经在首屏加载」之外的那一个。
   新增任何路由前先问：它是不是每个访客都会在 3 秒内打开？不是 → 走 hover。 */
const IDLE_PREFETCH_ALLOW = new Set(['/user-space']);
const pfSrc = read(PREFETCH);
const idleDecl = pfSrc.match(/const\s+IDLE_PREFETCH_PATHS\s*=\s*\[([\s\S]*?)\]/);
if (!idleDecl) {
  fail('C', `${PREFETCH} 里找不到 IDLE_PREFETCH_PATHS —— 解析规则失效，请不要放行`);
} else {
  const paths = [...idleDecl[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const p of paths) {
    if (!IDLE_PREFETCH_ALLOW.has(p)) {
      fail(
        'C',
        `${PREFETCH} 的 idle 预取清单包含低频路由 '${p}'。\n` +
          '     修法：从清单里删掉；需要时由 hover/focus 触发（prefetchRoute 的另一条通道）。\n' +
          '     代价参考：/ai-chat 曾因此让每个首次访客多下 225.8 KiB、LCP +1.21 s。',
      );
    }
  }
}

/* ── D：nsfwjs / tfjs 权重不得进静态图 ────────────────────────────── */
const SRC_ROOT = join(ROOT, 'src');
const walk = (dir, out = []) => {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(js|ts|vue|mjs)$/.test(name)) out.push(full);
  }
  return out;
};
const HEAVY_STATIC = [
  { re: /\bnsfwjs\b/, name: 'nsfwjs' },
  { re: /\bnsfw-weights\b/, name: 'nsfw-weights' },
  { re: /(^|\/)@tensorflow\//, name: '@tensorflow/*' },
];
for (const file of walk(SRC_ROOT)) {
  const src = readFileSync(file, 'utf8');
  for (const { spec, index } of staticImportSpecifiers(src)) {
    for (const { re, name } of HEAVY_STATIC) {
      if (!re.test(spec)) continue;
      fail(
        'D',
        `${relative(ROOT, file)}:${lineOf(src, index)} 静态 import 了 ${name}（${spec}）。\n` +
          '     修法：改成函数内 `await import(...)`（nsfw-weights 实测 2477 KiB gzip）。',
      );
    }
  }
}

/* ── 收口 ─────────────────────────────────────────────────────────── */
if (violations.length) {
  console.error('\n✗ check:first-paint-closure —— 首屏入口闭包被塞回重量级依赖：\n');
  for (const v of violations) console.error(`   ${v}\n`);
  console.error(
    '   背景与量级见 docs/2026-11-14-首屏与userspace性能勘察.md §3 / §5。\n' +
      '   这些依赖不是不能加载，而是**不能出现在首屏之前**。\n',
  );
  process.exit(1);
}
console.log(
  '✓ check:first-paint-closure：文本审核未拖图片管线；压缩库无顶层静态边；' +
    'idle 预取只含底栏高频席；nsfw/tfjs 无静态引入。',
);
