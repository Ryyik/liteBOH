/**
 * 官方内容目录（news / activities 的 title → 行 映射），供论坛 feed 的官方卡兜底使用。
 *
 * 起因：docs/2026-09-29-加载速度与提速全面评测报告.md §5.2 / §10 P1-2 ——
 * ForumMain 每次进 feed 都全量拉 news+activities 两张表（实测 2.6+1.5KB，2 个 RTT），
 * 但目录只在「帖子缺封面/缺类型且标题能对上」时才被消费。这两张表变更频率极低
 * （管理端内容），故整表拉一次后 memo 5 分钟；memo 期内后续 hydrate 零请求。
 *
 * 注意：这里只做**兜底**目录（title 精确匹配），帖子自身的 post_kind /
 * cover_image_url 永远优先 —— 别把「信 feed 自带类型」的历史事故（官方帖类型显示错）
 * 重新引进来。list_forum_posts RPC 的 24 列里没有 post_kind，所以 RPC 路径的行
 * 由调用方（ForumMain hydrateOfficialPostKinds）单独回源 posts 表补 kind。
 */
import { supabase } from '@/utils/supabase-client.js';

const DIRECTORY_TTL_MS = 5 * 60 * 1000;

let directoryCache = null; // { newsByTitle, activityByTitle, fetchedAt }

async function fetchDirectory() {
  const [newsRes, activityRes] = await Promise.all([
    supabase.from('news').select('title, image'),
    supabase.from('activities').select('title, image'),
  ]);
  const build = (rows) => new Map((rows || []).map((row) => [String(row.title || '').trim(), row]));
  directoryCache = {
    newsByTitle: build(newsRes.data),
    activityByTitle: build(activityRes.data),
    fetchedAt: Date.now(),
  };
  return directoryCache;
}

/**
 * 取官方目录（title 已 trim 归一）。memo 命中时零网络请求；失败时返回空映射
 * （与旧行为一致：目录缺失只降级兜底，不影响主 feed）。
 */
export async function loadOfficialDirectory() {
  if (directoryCache && Date.now() - directoryCache.fetchedAt < DIRECTORY_TTL_MS) {
    return directoryCache;
  }
  try {
    return await fetchDirectory();
  } catch {
    return { newsByTitle: new Map(), activityByTitle: new Map(), fetchedAt: Date.now() };
  }
}
