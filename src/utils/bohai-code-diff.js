// BOH AI 代码 Diff 工具
// ------------------------------------------------------------
// 阶段 1.3 任务：当 AI 回复里带"代码块 + 文件路径"或"修改建议"时，
// 自动算出原文件 vs AI 修改后的行级 diff，让用户看清"AI 改了什么"。
// 不依赖 Monaco / diff 库，纯 JS 实现 Myers diff 简化版
// ------------------------------------------------------------

/**
 * 单行 diff：返回 { type: 'equal'|'add'|'remove', text }
 * 走 LCS（最长公共子序列）算法，代码长度在 1-2000 行都很快
 */
const computeLineDiff = (originalLines, modifiedLines) => {
  const a = Array.isArray(originalLines) ? originalLines : [];
  const b = Array.isArray(modifiedLines) ? modifiedLines : [];
  const m = a.length;
  const n = b.length;
  // 1. 建 LCS 长度表
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // 2. 回溯生成 diff
  const out = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ type: 'equal', text: a[i - 1], oldLine: i, newLine: j });
      i -= 1; j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ type: 'remove', text: a[i - 1], oldLine: i, newLine: null });
      i -= 1;
    } else {
      out.push({ type: 'add', text: b[j - 1], oldLine: null, newLine: j });
      j -= 1;
    }
  }
  while (i > 0) {
    out.push({ type: 'remove', text: a[i - 1], oldLine: i, newLine: null });
    i -= 1;
  }
  while (j > 0) {
    out.push({ type: 'add', text: b[j - 1], oldLine: null, newLine: j });
    j -= 1;
  }
  return out.reverse();
};

/**
 * 统计 diff 摘要
 */
export const summarizeDiff = (diff) => {
  if (!Array.isArray(diff)) return { added: 0, removed: 0, equal: 0 };
  let added = 0;
  let removed = 0;
  let equal = 0;
  for (const item of diff) {
    if (item.type === 'add') added += 1;
    else if (item.type === 'remove') removed += 1;
    else equal += 1;
  }
  return { added, removed, equal };
};

/**
 * 主入口：把"原文本 + 修改后文本"算出 diff
 * 自动按行切分（支持 \n / \r\n）
 */
export const buildDiff = (original, modified) => {
  const a = String(original ?? '').split(/\r?\n/);
  const b = String(modified ?? '').split(/\r?\n/);
  // 去掉末尾空行（如果两边都有）
  if (a.length && a[a.length - 1] === '') a.pop();
  if (b.length && b[b.length - 1] === '') b.pop();
  return computeLineDiff(a, b);
};

/**
 * 合并连续 add/remove 成"修改"块（更易读）
 * 输出格式：
 *   { type: 'context', lines: [...] }    // unchanged
 *   { type: 'modify', oldLines: [...], newLines: [...] } // 改动
 *   { type: 'add', lines: [...] }         // 纯新增
 *   { type: 'remove', lines: [...] }      // 纯删除
 */
export const groupDiffIntoHunks = (diff) => {
  if (!Array.isArray(diff) || diff.length === 0) return [];
  const hunks = [];
  let i = 0;
  while (i < diff.length) {
    const item = diff[i];
    if (item.type === 'equal') {
      // 把连续 equal 合并成一个 context
      const lines = [item];
      i += 1;
      while (i < diff.length && diff[i].type === 'equal') {
        lines.push(diff[i]);
        i += 1;
      }
      hunks.push({ type: 'context', lines });
      continue;
    }
    // 遇到 remove / add，尝试合并成 modify 块
    const removeLines = [];
    const addLines = [];
    while (i < diff.length && (diff[i].type === 'remove' || diff[i].type === 'add')) {
      if (diff[i].type === 'remove') removeLines.push(diff[i]);
      else addLines.push(diff[i]);
      i += 1;
    }
    if (removeLines.length > 0 && addLines.length > 0) {
      hunks.push({ type: 'modify', oldLines: removeLines, newLines: addLines });
    } else if (removeLines.length > 0) {
      hunks.push({ type: 'remove', lines: removeLines });
    } else {
      hunks.push({ type: 'add', lines: addLines });
    }
  }
  return hunks;
};

/**
 * 把 diff 渲染成 HTML（用于直接 v-html 展示）
 * 极简实现：- 红 / + 绿 / = 灰，避免引入额外样式系统
 * 注意：输出需要走 DOMPurify 兜底
 */
export const renderDiffHtml = (diff) => {
  const lines = Array.isArray(diff) ? diff : [];
  const escape = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const out = [];
  for (const item of lines) {
    const cls = item.type === 'add'
      ? 'diff-add'
      : item.type === 'remove'
        ? 'diff-remove'
        : 'diff-equal';
    const prefix = item.type === 'add' ? '+' : item.type === 'remove' ? '-' : ' ';
    out.push(
      `<div class="diff-line ${cls}"><span class="diff-prefix">${prefix}</span><span class="diff-text">${escape(item.text)}</span></div>`
    );
  }
  return out.join('');
};

/**
 * 估算 diff 块"是否值得展示"（避免无意义 diff 浪费屏幕）
 * 返回 true 当且仅当存在实际改动 且 改动比例 < 95%
 */
export const shouldShowDiff = (original, modified) => {
  const diff = buildDiff(original, modified);
  const stats = summarizeDiff(diff);
  if (stats.added === 0 && stats.removed === 0) return false;
  const total = stats.added + stats.removed + stats.equal;
  if (total === 0) return false;
  const changeRatio = (stats.added + stats.removed) / total;
  return changeRatio < 0.95;
};

/**
 * 从 markdown code fence 里抽"文件路径注释"
 * 支持：
 *   ```js:src/utils/foo.js
 *   ```python // path: src/utils/foo.py
 *   ```ts
 *   // @file: src/utils/foo.ts
 */
export const extractFilePathFromCodeBlock = (raw) => {
  if (typeof raw !== 'string') return '';
  // 优先 ```lang:path
  const m1 = raw.match(/^```[\w-]*\s*:?\s*([\w./-]+\.[\w]+)\s*$/m);
  if (m1) return m1[1];
  // 兜底：第一行是 // @file: / // path: / # path: / -- path:
  const m2 = raw.match(/^\s*(?:\/\/|#|--|<!--)\s*@?file:\s*([\w./-]+\.[\w]+)\s*$/im);
  if (m2) return m2[1];
  // 额外兜底：// path:  / # path:  / -- path:  (没有 @file: 前缀)
  const m3 = raw.match(/^\s*(?:\/\/|#|--)\s*path:\s*([\w./-]+\.[\w]+)\s*$/im);
  if (m3) return m3[1];
  return '';
};

/**
 * 提取 markdown 文本里"所有代码块 + 文件路径"
 * 用于 CodeDiffViewer 一次性渲染多个 diff
 */
export const extractCodeBlocksWithPaths = (markdown) => {
  if (typeof markdown !== 'string') return [];
  const out = [];
  const re = /```([\w-]*)(?:\s*:?\s*([\w./-]+\.[\w]+))?\n([\s\S]*?)```/g;
  let match = re.exec(markdown);
  while (match) {
    const lang = match[1] || '';
    const declaredPath = match[2] || '';
    const body = match[3] || '';
    // 优先用声明路径，兜底用注释里的 @file
    const inferredPath = declaredPath || extractFilePathFromCodeBlock(body);
    out.push({
      lang,
      path: inferredPath,
      content: body,
      start: match.index,
      end: match.index + match[0].length
    });
    match = re.exec(markdown);
  }
  return out;
};
