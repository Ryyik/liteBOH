// BOH AI 文件上下文集成
// ------------------------------------------------------------
// 阶段 2.1 任务：让用户在 BOHAI 里直接引用项目文件
// 语法：
//   #file:src/utils/foo.js        读取整个文件
//   #file:src/utils/foo.js#L10-L30  只读第 10-30 行
//   #dir:src/utils                 列出目录下所有文件
//   #search:foo bar                全文搜索"foo bar"（可选）
//
// 设计要点：
// 1. 解析纯函数，方便测试
// 2. 文件读取走 Tauri / window.fs 抽象（具体实现在 useChatEngine 里）
// 3. 大文件截断（>8KB 自动截到 8KB + 提示行数）
// ------------------------------------------------------------

export const MAX_FILE_BYTES = 8 * 1024;
export const MAX_CONTEXT_FILES = 20;

/**
 * 解析用户消息里的 #file: / #dir: / #search: 标记
 * @returns { files: [{path, range}], dirs: [path], searches: [query] }
 */
export const parseFileContextTags = (text) => {
  if (typeof text !== 'string' || !text) {
    return { files: [], dirs: [], searches: [] };
  }
  const files = [];
  const dirs = [];
  const searches = [];
  // 文件路径字符:字母数字 + . / - _
  // 贪婪匹配:因为文件路径不包含空格,自然不会越界
  const fileRe = /#file:([\w./-]+?)(?=#L(\d+)(?:-L?(\d+))?|\s|$|[\n,;])/g;
  const dirRe = /#dir:([\w./-]+?)(?=\s|$|[\n,;])/g;
  // 搜索内容:仅匹配不含中文/换行/井号/空白的紧凑查询词
  // 用户通常写 #search:keyword,后跟空格或中文,这里只取一段连续的 ASCII/标点
  const searchRe = /#search:([^\s\n#\u4e00-\u9fa5\u3000]+)/g;
  let m = fileRe.exec(text);
  while (m) {
    files.push({
      path: m[1],
      range: m[2] ? { start: Number(m[2]), end: m[3] ? Number(m[3]) : Number(m[2]) } : null
    });
    m = fileRe.exec(text);
  }
  m = dirRe.exec(text);
  while (m) {
    dirs.push(m[1]);
    m = dirRe.exec(text);
  }
  m = searchRe.exec(text);
  while (m) {
    searches.push(m[1].trim());
    m = searchRe.exec(text);
  }
  return { files, dirs, searches };
};

/**
 * 把文件引用从用户消息里"剥掉"，剩余的纯文本送进对话
 * 避免 #file: 标记污染对话历史
 */
export const stripFileContextTags = (text) => {
  if (typeof text !== 'string') return '';
  return text
    .replace(/#file:[\w./-]+?(?:#L\d+(?:-L?\d+)?)?(?=\s|$|[\n,;])/g, '')
    .replace(/#dir:[\w./-]+(?=\s|$|[\n,;])/g, '')
    .replace(/#search:[^\s\n#\u4e00-\u9fa5\u3000]+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^\s+|\s+$/g, '');
};

/**
 * 截断文件内容，超过 8KB 自动截到 8KB 并追加"已截断"提示
 */
export const truncateFileContent = (content, maxBytes = MAX_FILE_BYTES) => {
  if (typeof content !== 'string') return { text: '', truncated: false, totalBytes: 0 };
  if (content.length <= maxBytes) {
    return { text: content, truncated: false, totalBytes: content.length };
  }
  // 按行截断，避免断在中间
  const cut = content.slice(0, maxBytes);
  const lastNewline = cut.lastIndexOf('\n');
  const safe = lastNewline > maxBytes * 0.5 ? cut.slice(0, lastNewline) : cut;
  return {
    text: `${safe}\n\n…（已截断，原文件共 ${content.length} 字节,展示前 ${safe.length} 字节）`,
    truncated: true,
    totalBytes: content.length
  };
};

/**
 * 从原文里抽某段行号
 */
export const sliceFileByRange = (content, range) => {
  if (!content || !range) return content || '';
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, Number(range.start) || 1);
  const end = Math.min(lines.length, Number(range.end) || start);
  const sliced = lines.slice(start - 1, end).join('\n');
  return `// [L${start}-L${end} / 共 ${lines.length} 行]\n${sliced}`;
};

/**
 * 把多个文件内容拼成"系统上下文"块
 * 注意：这里只是拼接文本，不替换用户消息
 */
export const buildFileContextBlock = (loadedFiles) => {
  if (!Array.isArray(loadedFiles) || loadedFiles.length === 0) return '';
  const parts = ['[用户引用的项目文件上下文]'];
  loadedFiles.forEach((file, i) => {
    if (i >= MAX_CONTEXT_FILES) return;
    const rangeNote = file.range ? ` (L${file.range.start}-L${file.range.end})` : '';
    parts.push(`\n### ${file.path}${rangeNote}\n\`\`\`${file.lang || ''}\n${file.content}\n\`\`\``);
  });
  if (loadedFiles.length > MAX_CONTEXT_FILES) {
    parts.push(`\n（还有 ${loadedFiles.length - MAX_CONTEXT_FILES} 个文件未载入,过多文件会撑爆上下文窗口）`);
  }
  return parts.join('\n');
};

/**
 * 估算加载文件的总字节数
 */
export const estimateContextSize = (loadedFiles) => {
  if (!Array.isArray(loadedFiles)) return 0;
  return loadedFiles.reduce((sum, f) => sum + (f.content?.length || 0), 0);
};

/**
 * 路径是否合法（防止用户引用 ../ 逃逸到工作区外）
 */
export const isSafeRelativePath = (rawPath) => {
  if (typeof rawPath !== 'string' || !rawPath) return false;
  if (rawPath.includes('..')) return false;
  if (rawPath.startsWith('/') || rawPath.startsWith('~')) return false;
  if (/^[A-Z]:/i.test(rawPath)) return false; // 阻止 Windows 绝对路径
  if (rawPath.length > 500) return false;
  return /^[\w./-]+$/.test(rawPath);
};

/**
 * 文件后缀到语言的映射
 */
export const inferLanguageFromPath = (rawPath) => {
  if (typeof rawPath !== 'string') return '';
  const ext = rawPath.split('.').pop()?.toLowerCase() || '';
  const map = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'tsx', jsx: 'jsx',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    html: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml',
    md: 'markdown', sh: 'bash', bash: 'bash', zsh: 'bash',
    sql: 'sql', vue: 'vue', svelte: 'svelte', php: 'php'
  };
  return map[ext] || '';
};
