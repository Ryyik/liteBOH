/**
 * 全局分享目标注册表（模块级单例）
 *
 * 单内容视图（新闻详情弹窗、帖子详情页等）在打开时调用 setShareTarget 注册
 * 「当前正在浏览的内容」，导航栏分享岛（ShareIsland）据此决定：
 * - 「复制链接」复制内容深链（无注册目标时回退为当前页面 URL）
 * - 「站内转发」转发该内容到论坛（forward 指向帖子 id 或官方卡来源）
 *
 * forward 两种形态：
 * - { postId }                  —— 直接转发 posts 表中的帖子
 * - { sourceType, sourceId }    —— 官方卡（news/activity 镜像），转发前需按来源解析卡 id
 */

let shareTarget = null;

/**
 * 注册当前分享目标（同一时刻只保留一个，后注册覆盖前者）
 * @param {{ owner: string, title?: string, summary?: string, image?: string, path?: string, forward?: object|null }} ctx
 */
export const setShareTarget = (ctx = {}) => {
  if (!ctx || !ctx.owner) return;
  shareTarget = {
    owner: String(ctx.owner),
    title: String(ctx.title || '').trim(),
    summary: String(ctx.summary || '').trim(),
    image: String(ctx.image || '').trim(),
    path: String(ctx.path || '').trim(),
    forward:
      ctx.forward && (ctx.forward.postId || (ctx.forward.sourceType && ctx.forward.sourceId))
        ? { ...ctx.forward }
        : null,
  };
};

/**
 * 清除注册目标（带 owner 校验，避免后打开的页面误关先打开页面的注册）
 * @param {string} owner
 */
export const clearShareTarget = (owner) => {
  if (!shareTarget) return;
  if (!owner || shareTarget.owner === String(owner)) shareTarget = null;
};

/** 读取当前分享目标（可能为 null） */
export const getShareTarget = () => shareTarget;

/**
 * 由注册目标构造可分享的站内深链（hash 路由）；
 * 无目标时回退为当前页面完整 URL。
 */
export const buildShareUrl = (target = null) => {
  const path = String(target?.path || '').trim();
  if (path && typeof window !== 'undefined') {
    const origin = window.location.origin;
    return `${origin}/#${path.startsWith('/') ? path : `/${path}`}`;
  }
  if (typeof window !== 'undefined') return window.location.href;
  return '';
};

/**
 * 组装 `navigator.share` 的 payload —— **分享正文必须自带链接**，单一真源。
 *
 * ⚠️ 为什么必须有这一层（2026-11-20 手机端实测报障）：
 *   系统分享面板里部分目标（微信「发送给朋友」、部分安卓机型的「复制」、
 *   少数浏览器实现）**只读 `text` 字段、把 `url` 丢掉**。于是用户点「复制」
 *   拿到的只有一句标题，没有地址 —— 复制了也没法发给别人。
 *   所以 `text` 里必须自己带上 URL；`url` 字段仍然照传（标准通道 / 系统面板
 *   会自动把它渲染成卡片），两条路径都成立。
 *
 * 站内所有文字类分享都必须走这里，不要各自手拼 `text`（手拼的版本一定会漏）。
 *
 * @param {{ title?: string, text?: string, url?: string, summary?: string }} payload
 *        `text` 是「除链接以外的正文」（如标题 + 奖品/摘要）；不传则退回 title。
 * @returns {{ title: string, text: string, url: string }}
 */
export const buildSharePayload = ({ title = '', text = '', url = '', summary = '' } = {}) => {
  const safeTitle = String(title || '').trim();
  const safeUrl = String(url || '').trim();
  /* 正文优先级：显式 text → summary → title；末尾统一补链接 */
  const body = String(text || summary || safeTitle || '').trim();
  const safeText = safeUrl ? (body ? `${body}\n${safeUrl}` : safeUrl) : body;
  return {
    title: safeTitle || 'BOHLITE',
    text: safeText,
    url: safeUrl,
  };
};
