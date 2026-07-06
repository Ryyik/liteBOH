/**
 * HTML 渲染引擎
 * 负责：组装预览 HTML、构建 ZIP 下载
 */

/**
 * 从 codeData 构建预览 URL
 * @param {object} codeData - { title, html, ... }
 * @returns {string} Blob URL
 */
export function buildPreviewUrl(codeData) {
  if (!codeData?.html) return ''
  try {
    const blob = new Blob([codeData.html], { type: 'text/html;charset=utf-8' })
    return URL.createObjectURL(blob)
  } catch (e) {
    console.error('buildPreviewUrl 失败:', e)
    return ''
  }
}

/**
 * 释放预览 URL
 */
export function revokePreviewUrl(url) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

/**
 * 构建 ZIP 下载
 * @param {object} codeData - { title, html }
 * @returns {Promise<Blob>} ZIP blob
 */
export async function buildCodeZip(codeData) {
  if (!codeData?.html) throw new Error('没有可下载的代码')

  // 动态导入 JSZip（按需加载）
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  const title = (codeData.title || 'AI生成网页').replace(/\s+/g, '_')

  // 从 HTML 中提取 CSS 和 JS 作为独立文件（可选）
  const html = codeData.html
  let css = ''
  let js = ''

  // 提取 <style> 内容
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/)
  if (styleMatch) css = styleMatch[1].trim()

  // 提取 <script> 内容
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/)
  if (scriptMatch) js = scriptMatch[1].trim()

  // 如果没有提取到独立 CSS/JS，直接把完整 HTML 作为一个文件
  if (!css && !js) {
    zip.file(`${title}.html`, html)
  } else {
    // 创建内联了 CSS/JS 的完整 HTML（保留原 HTML 结构）
    zip.file(`${title}.html`, html)

    // 同时提供独立的 CSS 和 JS 文件
    if (css) zip.file(`${title}.css`, css)
    if (js) zip.file(`${title}.js`, js)
  }

  // 添加说明文件
  zip.file('README.txt',
    `AI 生成网页\n标题：${codeData.title || '未知'}\n描述：${codeData.description || ''}\n\n${title}.html 为完整网页文件，可直接在浏览器打开。`
  )

  return await zip.generateAsync({ type: 'blob' })
}

/**
 * 触发 ZIP 下载
 */
export function downloadZipBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
