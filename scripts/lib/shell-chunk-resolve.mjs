/**
 * shell-chunk-resolve.mjs — 判定 SHELL_CHUNKS 里每个名字在当前产物中的归宿
 *
 * 为什么需要独立成模块：这段判定原来内联在 vite.config.js 的 generateBundle 里，
 * 无法单测。而它恰好是「静音真警报」的高风险点 —— 一旦判错，真缺模块时也不出声。
 * 抽成纯函数后，tests/unit/shell-chunk-resolve.test.js 能对四个分支逐一反证。
 *
 * 背景（2026-10-31 部署实测）：Linux CI 的 rollup 会把 auth-api / bag /
 * useGlobalAiPreferences 并进 app.js，macOS 上它们独立成 chunk。两边总字节一致、
 * 预缓存覆盖也一致；但旧实现逐名 `this.warn('找不到')`，导致每次部署都刷 3 条假警报。
 * 假警报的代价不只是噪音：它会诱导人去把名字从 SHELL_CHUNKS 删掉，而删掉之后
 * macOS 构建里这些模块又独立成 chunk、漏进 globPatterns → 真实白屏。
 *
 * 所以判定不能问「有没有同名 chunk」，要问「模块最终落在哪个 chunk，那个 chunk
 * 是否已在预缓存范围」。前者跨平台不稳定，后者跨平台一致。
 */

const baseName = (fileName) => String(fileName).split('/').pop();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {object} params
 * @param {Array<{fileName: string, isEntry?: boolean, modules?: Record<string, unknown>}>} params.chunks
 *   rollup generateBundle 的 chunk 列表
 * @param {string[]} params.shellChunks  即 vite.config.js 的 SHELL_CHUNKS
 * @returns {{shellJs: Set<string>, messages: Array<{level: 'info'|'warn', text: string}>}}
 *   shellJs 供调用方继续算壳样式范围；messages 供调用方按级别打到构建日志
 */
export function resolveShellChunks({ chunks, shellChunks }) {
  const shellJs = new Set(chunks.filter((c) => c.isEntry).map((c) => baseName(c.fileName)));
  const messages = [];
  const missing = [];

  for (const name of shellChunks) {
    const hit = chunks.find((c) =>
      new RegExp(`/${escapeRe(name)}-[A-Za-z0-9_-]+\\.js$`).test(c.fileName),
    );
    if (hit) shellJs.add(baseName(hit.fileName));
    else missing.push(name);
  }

  for (const name of missing) {
    const moduleRe = new RegExp(`(^|/)${escapeRe(name)}\\.(js|jsx|ts|tsx|mjs|cjs|vue)$`);
    const host = chunks.find((c) => Object.keys(c.modules || {}).some((id) => moduleRe.test(id)));
    const hostName = host ? baseName(host.fileName) : '';

    if (host && shellJs.has(hostName)) {
      messages.push({
        level: 'info',
        text: `壳 chunk "${name}" 未独立成 chunk，已并入 ${hostName}（跨平台分块差异，预缓存覆盖不受影响）`,
      });
    } else if (host) {
      messages.push({
        level: 'warn',
        text: `壳 chunk "${name}" 被并入 ${hostName}，但该 chunk 不在壳预缓存范围 —— 请同步 SHELL_CHUNKS`,
      });
    } else {
      messages.push({
        level: 'warn',
        text: `壳 chunk "${name}" 在产物里找不到 —— 请同步 SHELL_CHUNKS`,
      });
    }
  }

  return { shellJs, messages };
}
