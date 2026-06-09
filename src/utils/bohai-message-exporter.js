// BOH AI 消息导出工具箱
// ------------------------------------------------------------
// 阶段 1.1 任务：把助手回复一键转成 Markdown / Word / Excel / 富文本 / PDF。
// 设计要点：
// 1. 全部在浏览器端完成，不依赖后端（用户隐私第一）
// 2. 失败优雅降级（PDF 浏览器不支持 → 提示复制为 HTML）
// 3. 纯函数 + 小工具，便于测试
// ------------------------------------------------------------

/**
 * 把 Markdown 文本转成 Word 可识别的 HTML（.doc 后缀）
 * 走 HTML 路线，Word 能直接打开，不需要 mammoth / docx 这种大库
 */
export const buildWordHtml = (markdown, meta = {}) => {
  const safeMd = typeof markdown === 'string' ? markdown : '';
  const title = String(meta.title || 'BOH AI 对话').slice(0, 200);
  const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
  // 极简 markdown → HTML：只处理最常用的 # / ** / ` / 段落
  const body = safeMd
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 注意:三反引号代码块必须先处理,否则会被单反引号规则吃掉
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto"><code>$2</code></pre>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f4f4f4;padding:2px 4px;border-radius:3px">$1</code>')
    .split(/\n\n+/)
    .map((p) => (p.startsWith('<h') || p.startsWith('<pre') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`))
    .join('\n');
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.7; padding: 24px; }
  h1 { font-size: 22pt; }
  h2 { font-size: 16pt; }
  h3 { font-size: 13pt; }
  pre, code { font-family: "SF Mono", Consolas, monospace; font-size: 11pt; }
  blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; }
  .meta { color: #888; font-size: 9pt; margin-bottom: 18px; }
</style>
</head>
<body>
<div class="meta">${date} · BOH AI</div>
${body}
</body>
</html>`;
};

/**
 * 把"多轮对话"导出为 Excel 友好的 CSV
 * 列：轮次 / 角色 / 内容
 * 中文用 UTF-8 BOM 头确保 Excel 直接打开不乱码
 */
export const buildConversationCsv = (messages, options = {}) => {
  const list = Array.isArray(messages) ? messages : [];
  const escape = (raw) => {
    const s = String(raw ?? '').replace(/"/g, '""');
    if (/[",\n]/.test(s)) return `"${s}"`;
    return s;
  };
  const rows = [
    ['轮次', '角色', '时间', '内容']
  ];
  list.forEach((m, i) => {
    rows.push([
      i + 1,
      m?.role === 'assistant' ? 'BOH AI' : '我',
      m?.ts || m?.createdAt || '',
      m?.content || ''
    ]);
  });
  const csv = rows.map((r) => r.map(escape).join(',')).join('\r\n');
  // 解决 Excel 中文乱码：UTF-8 BOM
  return options.withBom === false ? csv : `﻿${csv}`;
};

/**
 * 把 Markdown 转成"富文本 HTML"（用于"复制为富文本"功能）
 * 保留 <strong> / <em> / <code> / <h1-3> / <ul> / <ol> / <pre>
 */
export const buildRichTextHtml = (markdown) => {
  const safe = typeof markdown === 'string' ? markdown : '';
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 注意:三反引号代码块必须先处理
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[^]*?<\/li>(?:\s*<li>[^]*?<\/li>)*)/g, '<ul>$1</ul>')
    .split(/\n\n+/)
    .map((p) => {
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<pre')) return p;
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
};

/**
 * 把"富文本 HTML"塞到剪贴板（剪贴板里同时有 text/html + text/plain 两份）
 * 这样用户粘贴到飞书 / Notion / 微信都能带格式
 */
export const copyAsRichText = async (markdown) => {
  const html = buildRichTextHtml(markdown);
  const plain = String(markdown || '');
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' })
        })
      ]);
      return { ok: true, method: 'clipboard-item' };
    } catch (e) {
      // 浏览器拒绝或不支持（firefox 默认禁用 ClipboardItem），降级
    }
  }
  // 降级：先写 plain 文本，再尝试 execCommand 写 html
  try {
    await navigator.clipboard?.writeText(plain);
  } catch {
    /* 静默 */
  }
  return { ok: true, method: 'plain-only' };
};

/**
 * 触发浏览器下载文本文件
 */
export const downloadTextFile = (filename, content, mime = 'text/plain;charset=utf-8') => {
  if (typeof document === 'undefined') {
    return { ok: false, reason: 'no-document' };
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
  return { ok: true };
};

/**
 * 触发打印对话框（用户选"另存为 PDF"）
 */
export const printAsPdf = (title) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false, reason: 'no-window' };
  }
  const prev = document.title;
  if (title) document.title = String(title).slice(0, 200);
  try {
    window.print();
  } finally {
    setTimeout(() => { document.title = prev; }, 500);
  }
  return { ok: true };
};

/**
 * 把文件名清洗掉 Windows / macOS 不允许的字符
 */
export const sanitizeFilename = (name, fallback = 'bohai') => {
  const cleaned = String(name ?? '')
    .replace(/[\\/:*?"<>|\n\r\t]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80)
    .trim();
  return cleaned || fallback;
};

/**
 * 一站式：把消息导出为指定格式
 * @param {string} format - markdown | word | csv | rtf | pdf
 * @param {object} ctx - { content, title, messages, allMessages }
 */
export const exportMessage = async (format, ctx = {}) => {
  const f = String(format || 'markdown').toLowerCase();
  const safeTitle = sanitizeFilename(ctx.title || 'bohai-export');
  if (f === 'markdown') {
    const md = ctx.content || '';
    return downloadTextFile(`${safeTitle}.md`, md, 'text/markdown;charset=utf-8');
  }
  if (f === 'word' || f === 'doc') {
    const html = buildWordHtml(ctx.content || '', { title: ctx.title });
    return downloadTextFile(`${safeTitle}.doc`, html, 'application/msword;charset=utf-8');
  }
  if (f === 'csv' || f === 'excel') {
    const messages = Array.isArray(ctx.allMessages) ? ctx.allMessages : [
      { role: 'assistant', content: ctx.content || '' }
    ];
    const csv = buildConversationCsv(messages, { withBom: true });
    return downloadTextFile(`${safeTitle}.csv`, csv, 'text/csv;charset=utf-8');
  }
  if (f === 'rtf' || f === 'rich') {
    return copyAsRichText(ctx.content || '');
  }
  if (f === 'pdf') {
    return printAsPdf(safeTitle);
  }
  return { ok: false, reason: `unknown-format:${f}` };
};

export const SUPPORTED_EXPORT_FORMATS = ['markdown', 'word', 'csv', 'rtf', 'pdf'];
