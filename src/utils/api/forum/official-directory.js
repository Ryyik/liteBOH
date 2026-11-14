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
 *
 * ── 2026-11-14：两处提速（实测见 scripts/probes/probe-forum-feed-causal.mjs）──
 * 1. **in-flight 去重**：fetchDirectory 可能被并发调用（预热 + hydrate 的 await）。
 *    没有这一层就是 2 个请求变 4 个，比不预热更糟。
 * 2. **warmOfficialDirectory()**：调用方在**发 feed 请求之前**预热，
 *    让 news/activities 与 posts 落在同一波，而不是串在 posts 之后。
 *    实测（定向延迟反证）：目录若串在 posts 后，首帖时刻 1:1 跟着它走
 *    （延迟 1500ms → 首帖 +1484ms）；并行后首帖回落 ≈576ms。
 */
import { supabase } from '@/utils/supabase-client.js';

const DIRECTORY_TTL_MS = 5 * 60 * 1000;

let directoryCache = null; // { newsByTitle, activityByTitle, fetchedAt }
let inFlight = null; // Promise —— 并发调用共享同一次请求

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
 * 并把空结果缓存一个 TTL（与旧行为一致：目录缺失只降级兜底，不影响主 feed，
 * 也避免预热失败后每次进 feed 都重打一遍）。
 */
export async function loadOfficialDirectory() {
  if (directoryCache && Date.now() - directoryCache.fetchedAt < DIRECTORY_TTL_MS) {
    return directoryCache;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      return await fetchDirectory();
    } catch {
      return { newsByTitle: new Map(), activityByTitle: new Map(), fetchedAt: Date.now() };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * 预热：fire-and-forget，永不抛错、永不阻塞调用方。
 * 放在「发 feed 请求之前」调用（ForumMain.fetchForumData 的入口），
 * 让目录与 posts 同波并发，而不是等 posts 回来才串行发。
 */
export function warmOfficialDirectory() {
  void loadOfficialDirectory();
}
