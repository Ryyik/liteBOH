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
    forward: ctx.forward && (ctx.forward.postId || (ctx.forward.sourceType && ctx.forward.sourceId))
      ? { ...ctx.forward }
      : null
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
