/**
 * node-fetch 的浏览器替身（构建期别名，见 vite.config.js 的 resolve.alias）
 *
 * 为什么需要它
 * ─────────────
 * `@tensorflow/tfjs-core` 的产物里保留了 Node 平台分支：
 *     importFetch: () => require('node-fetch')
 * 浏览器永不执行这个分支（它的 package.json 里 `browser: { "node-fetch": false }`），
 * 但 Vite 只要**真的去解析** `node-fetch`，就会拿到它的 ESM 入口 `lib/index.mjs`，
 * 而那个文件开头是 `import https from 'https'` —— `https` 是 Node 内置模块，
 * 浏览器端没有这个「包」，Vite 直接抛：
 *     [plugin:vite:import-analysis] Failed to resolve entry for package "https"
 * 并弹出整页报错遮罩（遮罩会把所有点击全吃掉），同时那次模块加载失败会把
 * 整个 tfjs chunk 一起拖死 —— 也就是论坛的图片安全检测（nsfwjs）不可用。
 *
 * 为什么不靠 optimizeDeps.exclude
 * ─────────────
 * 只写 `exclude: ['node-fetch']` 会把「预构建扫描」这条路堵住，但代价是：
 * 真被 import 时 Vite **直接把 Node 版 ESM 源码喂给浏览器**，于是同样的错在
 * transform 阶段再炸一次（2026-09-25 实测：`import 'node-fetch'` 被重写成
 * `/node_modules/node-fetch/lib/index.mjs`，请求它必返回上面那个错误页）。
 * 别名指到这里之后，两条路都不再碰 node-fetch 包本身。
 *
 * 行为影响：浏览器侧零变化（本来就调不到）；万一将来真有代码调用它，
 * 抛的是明确的「浏览器不可用」，而不是 `require is not defined` 这种玄学错。
 */
const unavailable = () => {
  throw new Error('node-fetch 在浏览器环境不可用：本项目已把它别名到空实现（见 vite.config.js）');
};

export default unavailable;
export const fetch = unavailable;
export const Headers = unavailable;
export const Request = unavailable;
export const Response = unavailable;
export const Blob = typeof globalThis !== 'undefined' ? globalThis.Blob : undefined;
export const FormData = typeof globalThis !== 'undefined' ? globalThis.FormData : undefined;
export const AbortError = Error;
export const FetchError = Error;
export const isRedirect = () => false;
