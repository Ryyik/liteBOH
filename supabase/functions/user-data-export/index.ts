/**
 * 用户数据导出 Edge Function（仿 X 的异步导出体验）
 *
 * action:
 * - create   申请导出（7 天一次；不允许与进行中任务并行），后台异步打包
 * - status   查询当前任务状态（前端轮询）
 * - download 获取短时效签名下载链接（10 分钟）
 * - cancel   取消进行中的任务
 *
 * 打包流程：收集各表数据 → 下载图片（Cloudinary CDN / Supabase avatars）
 * → jszip 生成 ZIP（JSON 用 DEFLATE，图片用 STORE）→ 上传私有桶 user-exports
 * → 状态置为 ready，7 天后过期（懒清理）。
 *
 * 健壮性设计：
 * - 单表查询失败仅记录到 manifest.skipped，不中断整体导出
 * - 时间预算 / 图片数量 / 图片体积三重上限，超限截断并在 manifest 注明
 * - 关键节点检查任务是否已被取消
 * - 处理中断（函数被杀）由 status/create 时将超过 5 分钟无心跳的任务标记为 failed
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.99.1';
// jszip exposes its constructor as the package default export in Deno's npm
// compatibility layer. A named import makes the function fail during module
// initialization before it can handle any request.
import JSZip from 'npm:jszip@3.10.1';

const EXPORT_BUCKET = 'user-exports';
const RATE_LIMIT_DAYS = 7;
const LINK_VALID_SECONDS = 600;
const ROW_LIMIT = 10_000;
const MAX_IMAGES = 300;
const MAX_TOTAL_IMAGE_BYTES = 50 * 1024 * 1024; // 50MB，兼顾内存与墙钟时限
const IMAGE_CONCURRENCY = 8;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const TIME_BUDGET_MS = 100_000; // 图片下载阶段预算；确保整体（下载+压缩+上传）在平台 150s 墙钟内完成
const UPLOAD_TIMEOUT_MS = 60_000;
const STALE_THRESHOLD_MS = 3 * 60_000;
const PROGRESS_WRITE_INTERVAL_MS = 2_000;

// M2: create 入口限流（5 次/小时），防止高频创建任务造成资源放大
const EXPORT_CREATE_RATE_LIMIT_MAX_REQUESTS = 5;
const EXPORT_CREATE_RATE_LIMIT_WINDOW_MS = 3_600_000;

// M1: 图片下载域名白名单（防 SSRF）。仅允许可信 CDN 与当前 Supabase 项目 host
// （avatars 等 storage 直链）。新增自托管图片域名时，在下方数组追加小写 hostname（不含协议与端口）。
const ALLOWED_IMAGE_HOSTS = new Set([
  'res.cloudinary.com',
  'cdn.blockofhome.cn',
]);
try {
  const supabaseHost = new URL(Deno.env.get('SUPABASE_URL') || '').hostname.toLowerCase();
  if (supabaseHost) ALLOWED_IMAGE_HOSTS.add(supabaseHost);
} catch {
  // SUPABASE_URL 缺失或非法时忽略
}

/** 用户数据表导出清单：表名 / ZIP 内路径 / 过滤列 */
interface TableSpec {
  table: string;
  path: string;
  column: string | null; // null 表示使用 orFilter
  label: string;
  orFilter?: boolean;
}

const TABLE_SPECS: TableSpec[] = [
  { table: 'user_addresses', path: 'profile/addresses.json', column: 'user_id', label: '收货地址' },
  { table: 'user_follows', path: 'profile/following.json', column: 'follower_id', label: '关注列表' },
  { table: 'user_follows', path: 'profile/followers.json', column: 'following_id', label: '粉丝列表' },
  { table: 'posts', path: 'forum/posts.json', column: 'author_id', label: '论坛帖子' },
  { table: 'forum_post_images', path: 'forum/post_images.json', column: 'user_id', label: '帖子图片记录' },
  { table: 'forum_post_drafts', path: 'forum/drafts.json', column: 'user_id', label: '帖子草稿' },
  { table: 'comments', path: 'forum/comments.json', column: 'author_id', label: '论坛评论' },
  { table: 'likes', path: 'forum/likes.json', column: 'user_id', label: '帖子点赞' },
  { table: 'forum_weekly_checkins', path: 'forum/checkins.json', column: 'user_id', label: '每周签到' },
  { table: 'boh_cloud_entries', path: 'cloud/entries.json', column: 'user_id', label: 'Cloud+ 条目' },
  { table: 'boh_cloud_share_channels', path: 'cloud/share_channels.json', column: 'user_id', label: 'Cloud+ 分享链接' },
  { table: 'boh_treehole_spaces', path: 'treehole/space.json', column: 'user_id', label: '树洞空间' },
  { table: 'boh_treehole_memories', path: 'treehole/memories.json', column: 'user_id', label: '树洞记忆' },
  { table: 'user_impressions', path: 'interactions/impressions_authored.json', column: 'author_id', label: '发出的印象' },
  { table: 'user_impressions', path: 'interactions/impressions_received.json', column: 'target_id', label: '收到的印象' },
  { table: 'block_wall_items', path: 'interactions/block_wall_items.json', column: 'author_id', label: '留言墙' },
  { table: 'notifications', path: 'interactions/notifications.json', column: 'recipient_id', label: '站内通知' },
  { table: 'lottery_entries', path: 'records/lottery_entries.json', column: 'user_id', label: '抽奖报名' },
  { table: 'user_gifts', path: 'records/gifts.json', column: 'user_id', label: '礼物记录' },
  { table: 'points_transactions', path: 'records/points_transactions.json', column: 'user_id', label: '积分流水' },
  { table: 'poster_requests', path: 'records/poster_requests.json', column: 'user_id', label: '海报申请' },
  // messages 表可能已被移除，查询失败时静默跳过并记录到 manifest
  { table: 'messages', path: 'records/messages.json', column: null, orFilter: true, label: '私信' },
];

class CancelledError extends Error {
  constructor() {
    super('export cancelled');
  }
}

const nowIso = () => new Date().toISOString();

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const createServiceClient = () => {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
};

// Supabase's newer `sb_secret_...` keys are valid API keys but are not JWTs.
// supabase-js Storage currently mirrors the key into `Authorization: Bearer`,
// which makes Storage reject them with "Invalid Compact JWS". Keep the key in
// `apikey` and only send a Bearer header when it is an actual JWT.
const getStorageHeaders = (token: string, contentType?: string) => {
  const anonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim().replace(/^['"]|['"]$/g, '');
  const headers: Record<string, string> = { apikey: anonKey, Authorization: `Bearer ${token}` };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
};

const uploadExportFile = async (path: string, bytes: Uint8Array, token: string) => {
  const base = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const url = `${base}/storage/v1/object/${EXPORT_BUCKET}/${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...getStorageHeaders(token, 'application/zip'), 'x-upsert': 'true' },
    body: bytes,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`上传导出文件失败 HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
};

const createExportSignedUrl = async (path: string, expiresIn: number, token: string) => {
  const base = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const response = await fetch(`${base}/storage/v1/object/sign/${EXPORT_BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...getStorageHeaders(token, 'application/json') },
    body: JSON.stringify({ expiresIn }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.signedURL) return null;
  return body.signedURL.startsWith('http') ? body.signedURL : `${base}/storage/v1${body.signedURL}`;
};

const verifyUser = async (
  request: Request,
): Promise<
  | { ok: true; userId: string; token: string }
  | { ok: false; status: number; message: string }
> => {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return { ok: false, status: 401, message: '缺少登录凭证' };

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!url || !anonKey || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return { ok: false, status: 500, message: '服务器配置缺失' };
  }

  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, message: '登录状态已失效，请重新登录' };
  }
  return { ok: true, userId: data.user.id, token };
};

// =============================================
// 任务维护：过期懒清理 + 中断任务标记
// =============================================

const cleanupExpiredJobs = async (svc: ReturnType<typeof createServiceClient>, userId: string) => {
  const { data: expired } = await svc
    .from('user_data_export_jobs')
    .select('id, file_path')
    .eq('user_id', userId)
    .eq('status', 'ready')
    .lt('expires_at', nowIso());
  for (const job of expired ?? []) {
    if (job.file_path) {
      await svc.storage.from(EXPORT_BUCKET).remove([job.file_path]).catch(() => {});
    }
    await svc
      .from('user_data_export_jobs')
      .update({ status: 'expired', stage: '已过期' })
      .eq('id', job.id);
  }
};

const markStaleJobsFailed = async (svc: ReturnType<typeof createServiceClient>, userId: string) => {
  const staleBefore = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  const { data: stale } = await svc
    .from('user_data_export_jobs')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'processing')
    .lt('last_active_at', staleBefore);
  for (const job of stale ?? []) {
    await svc
      .from('user_data_export_jobs')
      .update({ status: 'failed', stage: '导出中断', error: '导出任务意外中断，请重新申请', completed_at: nowIso() })
      .eq('id', job.id);
  }
};

const getLatestJob = async (svc: ReturnType<typeof createServiceClient>, userId: string) => {
  const { data } = await svc
    .from('user_data_export_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
};

// =============================================
// 图片 URL 提取工具
// =============================================

const looksLikeImageUrl = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^https?:\/\//i.test(s) &&
  (s.includes('/image/upload/') || /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|$)/i.test(s));

// M1: 图片 URL 域名必须在白名单内，防止 SSRF（URL.hostname 已天然去除端口）
const isAllowedImageHost = (url: string): boolean => {
  try {
    return ALLOWED_IMAGE_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
};

const collectImageUrlsFromJson = (node: unknown, out: Set<string>) => {
  if (!node) return;
  if (looksLikeImageUrl(node)) {
    out.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectImageUrlsFromJson(item, out);
    return;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectImageUrlsFromJson(value, out);
    }
  }
};

const extOf = (url: string): string => {
  try {
    const m = new URL(url).pathname.match(/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i);
    return m ? `.${m[1].toLowerCase()}` : '.jpg';
  } catch {
    return '.jpg';
  }
};

interface ImageTask {
  url: string;
  path: string;
}

// =============================================
// 后台导出主流程
// =============================================

const runExport = async (userId: string, jobId: string, storageToken: string) => {
  const svc = createServiceClient();
  const startedAt = Date.now();
  let lastProgressWrite = 0;
  // L1: 已上传的导出文件路径；取消/竞态时用它清理孤儿文件（外层 catch 需要访问）
  let filePath = '';

  const writeProgress = async (progress: number, stage: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressWrite < PROGRESS_WRITE_INTERVAL_MS) return;
    lastProgressWrite = now;
    await svc
      .from('user_data_export_jobs')
      .update({ progress: Math.round(progress), stage, last_active_at: nowIso() })
      .eq('id', jobId);
  };

  const checkCancelled = async () => {
    const { data } = await svc
      .from('user_data_export_jobs')
      .select('status')
      .eq('id', jobId)
      .maybeSingle();
    if (!data || data.status !== 'processing') throw new CancelledError();
  };

  try {
    await writeProgress(2, '准备中', true);

    // ---------- 阶段一：收集文本数据（5% → 25%） ----------
    const jsonFiles = new Map<string, unknown[]>();
    const totals: Record<string, number> = {};
    const skipped: Array<{ table: string; path: string; reason: string }> = [];
    // L2: 达到单表行数上限（ROW_LIMIT）被截断的表，记录到 manifest.truncated_tables 供前端提示
    const truncatedTables: string[] = [];

    const { data: profileRow } = await svc
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    jsonFiles.set('profile/profile.json', profileRow ? [profileRow] : []);
    totals['个人资料'] = profileRow ? 1 : 0;

    for (let i = 0; i < TABLE_SPECS.length; i++) {
      const spec = TABLE_SPECS[i];
      let query = svc.from(spec.table).select('*').limit(ROW_LIMIT);
      if (spec.orFilter) {
        query = query.or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
      } else {
        query = query.eq(spec.column!, userId);
      }
      const { data, error } = await query;
      // 每张表查询后即时响应取消，避免阶段一长时间无法取消
      await checkCancelled();
      if (error) {
        // L3: 单表失败（如表已移除）只记录、不中断、不透传原始错误细节
        console.error('[user-data-export] table skipped:', spec.table, error);
        skipped.push({ table: spec.table, path: spec.path, reason: '数据表暂时无法读取' });
        totals[spec.label] = 0;
        continue;
      }
      const rows = data ?? [];
      jsonFiles.set(spec.path, rows);
      totals[spec.label] = rows.length;
      if (rows.length >= ROW_LIMIT) {
        truncatedTables.push(spec.label);
      }
      await writeProgress(5 + ((i + 1) / TABLE_SPECS.length) * 20, `正在收集数据（${i + 1}/${TABLE_SPECS.length}）`);
    }

    await checkCancelled();

    // ---------- 阶段二：收集并下载图片（25% → 88%） ----------
    const profile = profileRow as Record<string, unknown> | null;
    const images: ImageTask[] = [];
    const seenUrls = new Set<string>();
    const pushImage = (url: unknown, folder: string, prefix: string) => {
      if (!looksLikeImageUrl(url) || seenUrls.has(url)) return;
      // M1: 域名白名单校验，非白名单图片记入 skipped 不下载
      if (!isAllowedImageHost(url)) {
        skipped.push({ table: 'images', path: url, reason: 'UNSUPPORTED_IMAGE_HOST' });
        seenUrls.add(url);
        return;
      }
      seenUrls.add(url);
      images.push({ url, path: `${folder}/${prefix}_${String(images.length + 1).padStart(3, '0')}${extOf(url)}` });
    };

    // 优先级：头像 / 背景图 → Cloud+ → 帖子图 → 留言墙
    if (profile) {
      pushImage(profile.avatar_url, 'profile', 'avatar');
      pushImage(profile.profile_background_url, 'profile', 'background');
    }
    const cloudRows = (jsonFiles.get('cloud/entries.json') ?? []) as Array<Record<string, unknown>>;
    for (const row of cloudRows) {
      pushImage(row.cover_image_url, 'cloud/images', 'cloud');
      const inner = new Set<string>();
      collectImageUrlsFromJson(row.content_blocks, inner);
      for (const url of inner) pushImage(url, 'cloud/images', 'cloud');
    }
    const postImageRows = (jsonFiles.get('forum/post_images.json') ?? []) as Array<Record<string, unknown>>;
    for (const row of postImageRows) {
      const postId = typeof row.post_id === 'string' ? row.post_id.slice(0, 8) : 'unknown';
      pushImage(row.url, `forum/images/${postId}`, 'img');
    }
    const wallRows = (jsonFiles.get('interactions/block_wall_items.json') ?? []) as Array<Record<string, unknown>>;
    for (const row of wallRows) {
      pushImage(row.image_url, 'interactions/block_wall_images', 'wall');
    }

    const discoveredImageCount = images.length;
    const failedImages: string[] = [];
    const downloaded = new Map<string, Uint8Array>();
    let totalBytes = 0;
    let truncated = false;
    const queue = [...images];
    let doneCount = 0;

    const worker = async () => {
      for (;;) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) {
          truncated = truncated || queue.length > 0;
          return;
        }
        const item = queue.shift();
        if (!item) return;
        if (downloaded.size >= MAX_IMAGES || totalBytes >= MAX_TOTAL_IMAGE_BYTES) {
          truncated = true;
          return;
        }
        try {
          const res = await fetch(item.url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
          if (res.ok) {
            const buf = new Uint8Array(await res.arrayBuffer());
            if (totalBytes + buf.byteLength <= MAX_TOTAL_IMAGE_BYTES) {
              downloaded.set(item.path, buf);
              totalBytes += buf.byteLength;
            } else {
              truncated = true;
            }
          } else {
            failedImages.push(item.path);
          }
        } catch {
          failedImages.push(item.path);
        }
        doneCount++;
        if (doneCount % 5 === 0 || queue.length === 0) {
          await writeProgress(
            25 + (discoveredImageCount === 0 ? 63 : (doneCount / discoveredImageCount) * 63),
            discoveredImageCount === 0 ? '正在整理数据' : `正在下载图片（${doneCount}/${discoveredImageCount}）`,
          );
        }
        if (doneCount % 25 === 0) await checkCancelled();
      }
    };
    await Promise.all(Array.from({ length: IMAGE_CONCURRENCY }, () => worker()));

    await checkCancelled();

    // ---------- 阶段三：生成 ZIP（88% → 96%） ----------
    const dateStr = new Date().toISOString().slice(0, 10);
    const root = `BOH_export_${dateStr}`;
    const zip = new JSZip();
    const manifest = {
      type: 'boh-user-data-export',
      version: 1,
      exportedAt: nowIso(),
      totals,
      truncated_tables: truncatedTables,
      images: {
        discovered: discoveredImageCount,
        downloaded: downloaded.size,
        failed: failedImages.length,
        truncated,
        limits: { maxImages: MAX_IMAGES, maxTotalBytes: MAX_TOTAL_IMAGE_BYTES },
      },
      skipped,
    };
    const readme = [
      'BOH 个人数据导出',
      `生成时间：${nowIso()}`,
      '',
      '此压缩包包含你在本站产生的个人数据副本：',
      '- manifest.json：各模块数据条数与打包统计',
      '- profile/：个人资料、收货地址、关注与粉丝',
      '- forum/：帖子、评论、点赞、签到及帖子图片',
      '- cloud/：Cloud+ 云空间条目与图片',
      '- treehole/：树洞空间与记忆',
      '- interactions/：印象、留言墙、通知',
      '- records/：抽奖报名、礼物、积分流水、海报申请、私信（若存在）',
      '',
      truncated ? '注意：图片数量或体积超出上限，部分图片未包含在本次导出中，详见 manifest.json。' : '',
      '数据截止至生成时间。如需再次导出，请在设置中重新申请（每 7 天一次）。',
    ].filter(Boolean).join('\n');

    const fileRows = [...jsonFiles.keys()]
      .map((path) => `<li><a href="${escapeHtml(path)}">${escapeHtml(path)}</a></li>`)
      .join('');
    const previewPayload = {
      totals,
      files: Object.fromEntries(jsonFiles.entries()),
      images: [...downloaded.keys()],
      exportedAt: manifest.exportedAt,
    };
    const previewDataJson = JSON.stringify(previewPayload).replace(/</g, '\\u003c');
    const previewHtml = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BOH 数据导出预览</title>
<style>
 :root{color-scheme:light;--ink:#171717;--muted:#6b6b6b;--line:#ffffffb8;--glass:#ffffffa6;--soft:#f0f0f0b8;--accent:#111}
 *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 18% 10%,#fff 0,#f4f4f4 34%,#dedede 100%);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
 main{max-width:920px;margin:44px auto;padding:0 20px}h1{margin:0;font-size:30px}h2{font-size:18px;margin:0 0 12px}.muted{color:var(--muted)}
 .panel{background:var(--glass);backdrop-filter:blur(24px) saturate(120%);-webkit-backdrop-filter:blur(24px) saturate(120%);border:1px solid var(--line);border-radius:16px;padding:20px;margin-top:16px;box-shadow:0 12px 32px #00000012,inset 0 1px #ffffffd9}.hero{display:flex;align-items:center;gap:14px}.icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#ffffffc7;font-size:22px}
 .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.stat{background:#ffffff70;border:1px solid #fff9;border-radius:12px;padding:13px 15px}.stat b{display:block;font-size:25px;color:var(--accent)}.stat span{color:var(--muted);font-size:13px}
 table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #00000012}th{color:var(--muted);font-weight:600}td:last-child,th:last-child{text-align:right}
 .tabs{display:flex;gap:6px;overflow:auto}.tab{border:1px solid #ffffffb8;background:#ffffff70;color:var(--muted);padding:9px 15px;border-radius:10px;cursor:pointer;white-space:nowrap;font:inherit}.tab.active{background:#171717;color:#fff;border-color:#171717}.view{display:none}.view.active{display:block}.item{border:1px solid #ffffffb8;border-radius:12px;padding:15px;margin-top:12px;background:#ffffff55}.meta{font-size:13px;color:var(--muted)}.title{font-weight:700;margin:8px 0 3px}.text{white-space:pre-wrap;color:#414141}.comment{border-left:3px solid #999;margin-top:12px;padding-left:12px;color:#4b4b4b}.thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}.thumb{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:9px;background:#ddd;border:1px solid #fff}.record{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #00000012}.record:last-child{border-bottom:0}.record small{display:block;color:var(--muted)}.files{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:0;padding:0;list-style:none}.files a{display:block;padding:10px 12px;border:1px solid #ffffffb8;border-radius:10px;color:var(--ink);text-decoration:none;background:#ffffff70}
 @media(max-width:620px){main{margin:24px auto}.stats{grid-template-columns:1fr}.files{grid-template-columns:1fr}h1{font-size:26px}}
 </style></head><body><main>
 <h1>BOH 数据导出预览</h1><div class="muted">本地打开，无需联网 · 生成时间：<span id="date"></span></div>
 <section class="panel hero"><div class="icon">▣</div><div><strong>你的数据副本</strong><div class="muted">文字、图片、论坛和互动记录均已整理。</div></div></section>
 <section class="panel"><div class="stats"><div class="stat"><b id="total">0</b><span>数据记录</span></div><div class="stat"><b id="imageCount">0</b><span>已下载图片</span></div><div class="stat"><b>${escapeHtml(failedImages.length)}</b><span>失败图片</span></div></div></section>
 <section class="panel"><div class="tabs"><button class="tab active" data-view="forum">论坛</button><button class="tab" data-view="cloud">Cloud+</button><button class="tab" data-view="treehole">树洞</button><button class="tab" data-view="activity">互动记录</button><button class="tab" data-view="records">文字记录</button></div><div id="forum" class="view active"></div><div id="cloud" class="view"></div><div id="treehole" class="view"></div><div id="activity" class="view"></div><div id="records" class="view"></div></section>
 <section class="panel"><h2>数据文件</h2><ul class="files">${fileRows}</ul><p class="muted">完整统计见 <a href="manifest.json">manifest.json</a>。</p></section>
 </main><script>const DATA=${previewDataJson};
 const esc=(v)=>String(v??'').replace(/[&<>\"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));const rows=(...names)=>names.flatMap((n)=>Array.isArray(DATA.files[n])?DATA.files[n]:[]);const pick=(o,...keys)=>{for(const k of keys)if(o&&o[k]!=null)return o[k];return ''};const fmt=(v)=>v?new Date(v).toLocaleString('zh-CN'):'';
 const post=(r)=>'<article class="item"><strong>'+esc(pick(r,'author_name','nickname','username','author_id','user_id','title'))+'</strong><div class="meta">'+esc(fmt(pick(r,'created_at','published_at','updated_at')))+' </div><div class="title">'+esc(pick(r,'title','subject'))+'</div><div class="text">'+esc(pick(r,'content','body','text','description'))+'</div></article>';
 const record=(r)=>'<div class="record"><div><strong>'+esc(pick(r,'title','type','action','content','name')||'记录')+'</strong><small>'+esc(fmt(pick(r,'created_at','occurred_at'))+'</small></div><b>'+esc(pick(r,'amount','status','value'))+'</b></div>';
 const render=()=>{document.getElementById('date').textContent=fmt(DATA.exportedAt);document.getElementById('imageCount').textContent=DATA.images.length;document.getElementById('total').textContent=Object.values(DATA.totals).reduce((a,b)=>a+Number(b||0),0);const posts=rows('forum/posts.json'),comments=rows('forum/comments.json');document.getElementById('forum').innerHTML=(posts.length?posts.slice(0,50).map(post).join(''):'<div class="item">暂无论坛文字记录</div>')+(comments.length?'<h2 style="margin-top:20px">评论</h2>'+comments.slice(0,80).map(post).join(''):'');document.getElementById('cloud').innerHTML=(rows('cloud/entries.json').slice(0,50).map(post).join('')||'<div class="item">暂无 Cloud+ 记录</div>');document.getElementById('treehole').innerHTML=(rows('treehole/memories.json','treehole/space.json').slice(0,50).map(post).join('')||'<div class="item">暂无树洞文字记录</div>');document.getElementById('activity').innerHTML=rows('interactions/notifications.json','interactions/impressions_authored.json','interactions/impressions_received.json','interactions/block_wall_items.json').slice(0,80).map(record).join('')||'<div class="item">暂无互动记录</div>';document.getElementById('records').innerHTML=rows('records/points_transactions.json','records/lottery_entries.json','records/gifts.json','records/poster_requests.json','records/messages.json').slice(0,100).map(record).join('')||'<div class="item">暂无文字记录</div>';};document.querySelectorAll('.tab').forEach((t)=>t.onclick=()=>{document.querySelectorAll('.tab,.view').forEach((e)=>e.classList.remove('active'));t.classList.add('active');document.getElementById(t.dataset.view).classList.add('active')});render();</script></body></html>`;

    zip.file(`${root}/index.html`, previewHtml);
    zip.file(`${root}/README.txt`, readme);
    zip.file(`${root}/manifest.json`, JSON.stringify(manifest, null, 2));
    for (const [path, rows] of jsonFiles) {
      zip.file(`${root}/${path}`, JSON.stringify(rows, null, 2));
    }
    for (const [path, bytes] of downloaded) {
      // 图片本身已是压缩格式，用 STORE 避免二次压缩浪费 CPU
      zip.file(`${root}/${path}`, bytes, { compression: 'STORE' });
    }

    const bytes = await zip.generateAsync(
      {
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: { level: 3 },
        comment: `BOH user data export ${nowIso()}`,
      },
      (meta) => {
        void writeProgress(88 + (meta.percent / 100) * 8, '正在生成压缩包');
      },
    );

    await checkCancelled();

    // ---------- 阶段四：上传并完成（96% → 100%） ----------
    await writeProgress(96, '正在上传', true);
    filePath = `${userId}/${jobId}.zip`;

    // 上传期间保持心跳，避免长传输被 stale 检测误判为中断
    const heartbeat = setInterval(() => {
      void svc
        .from('user_data_export_jobs')
        .update({ last_active_at: nowIso() })
        .eq('id', jobId);
    }, 45_000);

    try {
      // SDK 上传（直连 REST 的 Bearer 密钥会被 Storage 以 Invalid Compact JWS 拒绝）
      // 外层用超时竞速兜底，防止上传无限挂起
      let uploaded = false;
      let lastUploadError = '';
      for (let attempt = 1; attempt <= 2 && !uploaded; attempt++) {
        try {
          const uploadPromise = uploadExportFile(filePath, bytes, storageToken);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`上传超过 ${UPLOAD_TIMEOUT_MS / 1000}s 未完成`)), UPLOAD_TIMEOUT_MS);
          });
          await Promise.race([uploadPromise, timeoutPromise]);
          uploaded = true;
        } catch (uploadError) {
          lastUploadError = String((uploadError as Error)?.message || uploadError);
          console.error(`user-data-export: 上传异常（第 ${attempt} 次）`, uploadError);
        }
        if (!uploaded && attempt < 2) await new Promise((r) => setTimeout(r, 2_000 * attempt));
      }
      if (!uploaded) throw new Error(`上传导出文件失败：${lastUploadError}`);

      await checkCancelled();

      const { data: finalizedRows, error: finalizeError } = await svc
        .from('user_data_export_jobs')
        .update({
          status: 'ready',
          stage: '已就绪，可下载',
          progress: 100,
          totals,
          file_path: filePath,
          file_size: bytes.byteLength,
          completed_at: nowIso(),
          expires_at: new Date(Date.now() + RATE_LIMIT_DAYS * 86_400_000).toISOString(),
          last_active_at: nowIso(),
        })
        .eq('id', jobId)
        .eq('status', 'processing')
        .select('id');
      if (finalizeError) throw new Error(`更新任务状态失败：${finalizeError.message}`);
      // L1: 0 行匹配说明 processing 行已被取消流程抢先更新（竞态），清理孤儿文件
      if (!Array.isArray(finalizedRows) || finalizedRows.length === 0) {
        try {
          await svc.storage.from(EXPORT_BUCKET).remove([filePath]);
        } catch (cleanupError) {
          console.error('user-data-export: 竞态清理导出文件失败', cleanupError);
        }
        return;
      }
    } finally {
      clearInterval(heartbeat);
    }
  } catch (error) {
    if (error instanceof CancelledError) {
      // L1: 上传完成后才被取消时，删除已上传的孤儿 ZIP，避免存储泄漏
      if (filePath) {
        try {
          await svc.storage.from(EXPORT_BUCKET).remove([filePath]);
        } catch (cleanupError) {
          console.error('user-data-export: 取消后清理导出文件失败', cleanupError);
        }
      }
      return;
    }
    // L3: 原始错误仅进服务端日志，对外固定文案避免泄露内部细节
    console.error('user-data-export: 导出失败', error);
    await svc
      .from('user_data_export_jobs')
      .update({
        status: 'failed',
        stage: '导出失败',
        error: '导出过程出现异常，请稍后重试',
        completed_at: nowIso(),
        last_active_at: nowIso(),
      })
      .eq('id', jobId)
      .eq('status', 'processing');
  }
};

// =============================================
// HTTP action 处理
// =============================================

const handleCreate = async (userId: string, storageToken: string, origin: string | null) => {
  const svc = createServiceClient();

  // M2: create 入口限流（5 次/小时），防止高频创建导出任务造成资源放大
  const rateCheck = await checkRateLimitDb(
    `export-create:${userId}`,
    EXPORT_CREATE_RATE_LIMIT_MAX_REQUESTS,
    EXPORT_CREATE_RATE_LIMIT_WINDOW_MS,
  );
  if (!rateCheck.ok) {
    return jsonResponse(
      {
        ok: false,
        error: '导出申请过于频繁，请稍后再试',
        nextAvailableAt: new Date(Date.now() + rateCheck.retryAfter * 1000).toISOString(),
      },
      429,
      origin,
    );
  }

  await cleanupExpiredJobs(svc, userId);
  await markStaleJobsFailed(svc, userId);

  // 不允许并行任务
  const { data: active } = await svc
    .from('user_data_export_jobs')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'processing')
    .limit(1)
    .maybeSingle();
  if (active) {
    return jsonResponse({ ok: false, error: '已有进行中的导出任务，请等待完成' }, 409, origin);
  }

  // 7 天一次（仅统计成功完成的任务；失败/取消不占用额度）
  const { data: lastDone } = await svc
    .from('user_data_export_jobs')
    .select('requested_at')
    .eq('user_id', userId)
    .in('status', ['ready', 'expired'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastDone) {
    const nextAvailable = new Date(
      new Date(lastDone.requested_at).getTime() + RATE_LIMIT_DAYS * 86_400_000,
    );
    if (nextAvailable.getTime() > Date.now()) {
      return jsonResponse(
        {
          ok: false,
          error: `每 ${RATE_LIMIT_DAYS} 天可申请一次导出`,
          nextAvailableAt: nextAvailable.toISOString(),
        },
        429,
        origin,
      );
    }
  }

  const { data: job, error: insertError } = await svc
    .from('user_data_export_jobs')
    .insert({ user_id: userId, status: 'processing', stage: '准备中', progress: 0 })
    .select('*')
    .maybeSingle();
  // M3: (user_id) where status='processing' 唯一部分索引兜底，与并行请求撞车时返回 409
  if (insertError?.code === '23505') {
    return jsonResponse({ ok: false, error: '已有进行中的导出任务，请等待完成' }, 409, origin);
  }
  if (insertError || !job) {
    return jsonResponse({ ok: false, error: '创建导出任务失败，请稍后重试' }, 500, origin);
  }

  // 后台异步执行；EdgeRuntime.waitUntil 保证响应返回后继续运行
  const processing = runExport(userId, job.id, storageToken);
  if (typeof (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime !== 'undefined') {
    (globalThis as { EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime.waitUntil(processing);
  } else {
    void processing;
  }

  return jsonResponse({ ok: true, job }, 200, origin);
};

const handleStatus = async (userId: string, origin: string | null) => {
  const svc = createServiceClient();
  await cleanupExpiredJobs(svc, userId);
  await markStaleJobsFailed(svc, userId);
  const job = await getLatestJob(svc, userId);
  return jsonResponse({ ok: true, job }, 200, origin);
};

const handleDownload = async (userId: string, storageToken: string, origin: string | null) => {
  const svc = createServiceClient();
  await cleanupExpiredJobs(svc, userId);

  const job = await getLatestJob(svc, userId);
  if (!job || job.status !== 'ready' || !job.file_path) {
    return jsonResponse({ ok: false, error: '没有可下载的导出文件' }, 404, origin);
  }

  const signedUrl = await createExportSignedUrl(job.file_path, LINK_VALID_SECONDS, storageToken);
  if (!signedUrl) {
    return jsonResponse({ ok: false, error: '生成下载链接失败，请稍后重试' }, 500, origin);
  }

  return jsonResponse(
    {
      ok: true,
      url: signedUrl,
      expiresIn: LINK_VALID_SECONDS,
      fileName: `BOH_export_${String(job.id).slice(0, 8)}.zip`,
      fileSize: job.file_size ?? null,
    },
    200,
    origin,
  );
};

const handleCancel = async (userId: string, origin: string | null) => {
  const svc = createServiceClient();
  const job = await getLatestJob(svc, userId);
  if (!job || job.status !== 'processing') {
    return jsonResponse({ ok: false, error: '没有进行中的导出任务' }, 404, origin);
  }
  await svc
    .from('user_data_export_jobs')
    .update({ status: 'cancelled', stage: '已取消', completed_at: nowIso(), last_active_at: nowIso() })
    .eq('id', job.id)
    .eq('status', 'processing');
  return jsonResponse({ ok: true }, 200, origin);
};

// =============================================
// 入口
// =============================================

serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }

  try {
    const auth = await verifyUser(req);
    if (!auth.ok) {
      return jsonResponse({ ok: false, error: auth.message }, auth.status, origin);
    }

    let body: { action?: string } = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        // 空 body 时按 status 处理
      }
    }
    const action = String(body.action || 'status');

    switch (action) {
      case 'create':
        return await handleCreate(auth.userId, auth.token, origin);
      case 'status':
        return await handleStatus(auth.userId, origin);
      case 'download':
        return await handleDownload(auth.userId, auth.token, origin);
      case 'cancel':
        return await handleCancel(auth.userId, origin);
      default:
        return jsonResponse({ ok: false, error: '未知操作' }, 400, origin);
    }
  } catch (error) {
    console.error('user-data-export:', error);
    return jsonResponse({ ok: false, error: '服务器内部错误' }, 500, origin);
  }
});
