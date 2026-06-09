// BOH AI 调试模式检测器
// ------------------------------------------------------------
// 阶段 1.2 任务：识别用户输入里的"调试意图"（报错、堆栈、异常）
// 命中后自动应用调试模板，根因 → 修复 → 验证三段式 prompt
// ------------------------------------------------------------

// 经典异常模式：Error / Exception / Traceback / fatal
// 注意只匹配"代码异常"，不匹配"我犯了个错误"这种自然语言
const STACK_TRACE_PATTERNS = [
  /at\s+[\w.$<>]+\s+\((?:[\w./-]+:\d+:\d+|file:.*)\)/i,         // Java / Node 堆栈
  /File\s+"[^"]+",\s+line\s+\d+,\s+in\s+<module>/i,              // Python Traceback
  /Traceback\s+\(most recent call last\)/i,
  /^\s*at\s+[A-Z][\w]*Exception|Error:\s/m,                      // .NET / Java
  /Uncaught\s+(?:Error|Exception|TypeError|ReferenceError|SyntaxError)/i, // 前端 console
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError)\b/,
  /\b(?:NullPointerException|ClassNotFoundException|IOException|SQLException|IllegalArgumentException)\b/,
  /\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|EPIPE|ECONNRESET)\b/, // Node 网络错误码
  /\bHTTP\/?[\d.]*\s+[45]\d\d\b/,                                // HTTP 4xx/5xx
  /\bpanic:\s+runtime error:\s+invalid memory address\b/,         // Go panic
  /\bsegfault\b/i,
  /\bEXC_BAD_ACCESS\b/,
  /\bcore dumped\b/,
  /\bERROR\s+(\d+)\s+\([A-Z0-9_]+\):/,                            // PostgreSQL 错误
  /\b\d{3,4}\s+\[Error\]:\s/                                    // MySQL 错误
];

// 调试意图关键词：报错 / 崩溃 / 闪退 / 异常 / 出错 / 跑不起来
const DEBUG_INTENT_KEYWORDS = [
  '报错', '崩溃', '闪退', '卡住', '跑不起来', '运行不了', '起不来', '启动失败',
  '挂了', '白屏', '404', '500', '502', '503', '连接失败', '连不上', '超时',
  '调试', '排查', '定位', '复现', '修复一下', '帮我修', '帮我看看这个错',
  'bug', 'error', 'exception', 'crash', 'panic', 'stack trace'
];

// 编程语言嗅探（命中后用对应 prompt 模板）
const LANGUAGE_HINTS = [
  { id: 'javascript', patterns: [/\b(?:const|let|var|function|=>|async|await)\b/, /\b(?:TypeError|ReferenceError)\b/, /\bNode\.js\b|\bnpm\b|\byarn\b/i] },
  { id: 'python', patterns: [/\bTraceback\b/, /\bimport\s+[\w.]+/, /\bdef\s+\w+\s*\(/, /IndentationError/] },
  { id: 'java', patterns: [/\bat\s+[\w.$<>]+\.[\w$<>]+\(.*:\d+\)/, /Exception in thread/, /\bpublic\s+(?:static\s+)?(?:void|class)\b/] },
  { id: 'sql', patterns: [/\bSELECT\b.*\bFROM\b/i, /\b(?:MySQL|PostgreSQL|Oracle|SQLite)\b/i, /\b\d{3,4}\s+\[Error\]/] },
  { id: 'go', patterns: [/\bpanic:\s+/, /goroutine\s+\d+/, /runtime error:/] },
  { id: 'rust', patterns: [/thread '.*' panicked/, /error[E\d{4}]/, /at src\//] },
  { id: 'minecraft', patterns: [/\b(?:mc|minecraft)\b/i, /\/give\b|\/tp\b|\/fill\b|\/setblock\b/] }
];

/**
 * 是否包含堆栈/异常代码
 */
export const containsStackTrace = (text) => {
  if (typeof text !== 'string' || !text) return false;
  return STACK_TRACE_PATTERNS.some((re) => re.test(text));
};

/**
 * 是否包含调试意图关键词
 */
export const hasDebugIntentKeyword = (text) => {
  if (typeof text !== 'string' || !text) return false;
  const lower = text.toLowerCase();
  return DEBUG_INTENT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
};

/**
 * 嗅探编程语言
 */
export const sniffLanguage = (text) => {
  if (typeof text !== 'string' || !text) return '';
  for (const hint of LANGUAGE_HINTS) {
    if (hint.patterns.every((p) => p.test(text))) return hint.id;
    // 单一强特征（堆栈）也认
    if (hint.patterns.some((p) => p.test(text))) return hint.id;
  }
  return '';
};

/**
 * 命中条件：堆栈命中 OR (调试关键词 + 文本超过 60 字符 + 含代码符号)
 * 避免把"我心情崩溃了"误判为调试
 */
export const isDebugRequest = (text) => {
  if (typeof text !== 'string' || !text) return false;
  if (containsStackTrace(text)) return true;
  if (!hasDebugIntentKeyword(text)) return false;
  const hasCodeMarkers = /[{};<>]|=>|\bfunction\b|\bclass\b|\bimport\b|\bfrom\b|\breturn\b/.test(text);
  return hasCodeMarkers || text.length >= 60;
};

/**
 * 抽取错误摘要（第一行报错，剪到 200 字符）
 */
export const extractErrorSummary = (text) => {
  if (typeof text !== 'string') return '';
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/Error|Exception|panic|Traceback|Trace \(most/i.test(trimmed)) {
      return trimmed.slice(0, 200);
    }
  }
  // 兜底：取第一行非空
  const first = lines.find((l) => l.trim());
  return first ? first.trim().slice(0, 200) : '';
};

/**
 * 生成调试 prompt 模板（AUTO 模式下命中后注入）
 * 不替代用户上下文，只追加在 system prompt 末尾
 */
export const buildDebugPromptAppendix = (ctx = {}) => {
  const lang = ctx.language || sniffLanguage(ctx.text);
  const summary = ctx.summary || extractErrorSummary(ctx.text);
  return `你正在 BOH AI 的【调试模式】下工作。
检测到用户贴了${lang ? ` ${lang} ` : ' '}错误信息${summary ? `（"${summary}"）` : ''}。

请严格按以下结构回答：

1. **根因分析**：用 1-3 句话定位最可能的根因。引用具体行号、函数名、变量名。
2. **复现路径**：如果不确定根因，列出 1-3 个最可能的触发场景。
3. **修复方案**：给出可直接复制运行的代码片段，标清替换位置（文件名 + 行号）。
4. **验证步骤**：1-3 步可执行的验证方法（命令 / 单元测试 / 手动复现）。

约束：
- 除非用户明确说"先别改"，否则直接给"复制就能用"的修复
- 如果错误信息不足（缺日志、缺代码、缺环境），先问 1-2 个最关键的问题，不要一上来就让用户贴一堆
- 推荐用 diff 或 before/after 对比展示修改
- 不要输出免责声明`;
};

/**
 * 综合判断：用户输入是否需要进入调试模式
 * 返回 { isDebug, language, summary, promptAppendix }
 */
export const analyzeDebugRequest = (text) => {
  if (!isDebugRequest(text)) {
    return { isDebug: false, language: '', summary: '', promptAppendix: '' };
  }
  const language = sniffLanguage(text);
  const summary = extractErrorSummary(text);
  const promptAppendix = buildDebugPromptAppendix({ text, language, summary });
  return { isDebug: true, language, summary, promptAppendix };
};
