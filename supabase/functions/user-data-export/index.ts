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
  // BOH Health 四表：健康数据已云同步，必须纳入用户数据导出（可携权）
  { table: 'health_profiles', path: 'health/profile.json', column: 'user_id', label: '健康档案' },
  { table: 'health_weight_logs', path: 'health/weight_logs.json', column: 'user_id', label: '体重记录' },
  { table: 'health_daily_logs', path: 'health/daily_logs.json', column: 'user_id', label: '每日健康日志' },
  { table: 'health_vault_records', path: 'health/vault_records.json', column: 'user_id', label: '体检报告库' },
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
      preview: 'liquid-glass-v2',
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
      '- index.html：双击即可离线浏览的网页预览（帖子、评论、图片、互动记录）',
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

    // L4: 已成功下载的图片 URL → ZIP 内相对路径，供预览页引用本地图片
    const resolvedImages = new Map<string, string>();
    for (const item of images) {
      if (downloaded.has(item.path)) resolvedImages.set(item.url, item.path);
    }

    const previewPayload = {
      totals,
      files: Object.fromEntries(jsonFiles.entries()),
      images: [...downloaded.keys()],
      resolvedImages: Object.fromEntries(resolvedImages),
      exportedAt: manifest.exportedAt,
      meta: { failedImages: failedImages.length, truncated },
    };
    const previewDataJson = JSON.stringify(previewPayload).replace(/</g, '\\u003c');
    const previewHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BOH 数据导出预览</title>
<style>
:root{
  color-scheme:light dark;
  --liquid-bg:rgba(255,255,255,.72);--liquid-bg-strong:rgba(255,255,255,.84);--liquid-bg-subtle:rgba(255,255,255,.58);--liquid-bg-nested:rgba(255,255,255,.42);
  --liquid-border:rgba(255,255,255,.65);--liquid-border-strong:rgba(255,255,255,.82);--liquid-border-hairline:rgba(15,23,42,.06);
  --liquid-blur:28px;--liquid-blur-sm:18px;--liquid-saturate:180%;
  --liquid-filter:blur(var(--liquid-blur)) saturate(var(--liquid-saturate)) brightness(1.02);
  --liquid-filter-sm:blur(var(--liquid-blur-sm)) saturate(var(--liquid-saturate)) brightness(1.02);
  --liquid-highlight:inset 0 1px 0 rgba(255,255,255,.86);--liquid-highlight-subtle:inset 0 1px 0 rgba(255,255,255,.55);
  --liquid-shadow:0 20px 60px rgba(15,23,42,.07),0 1px 3px rgba(15,23,42,.06);
  --liquid-shadow-sm:0 8px 24px rgba(15,23,42,.06);--liquid-shadow-overlay:0 24px 80px rgba(15,23,42,.14);
  --liquid-radius-lg:28px;--liquid-radius-md:16px;--liquid-radius-pill:999px;
  --liquid-text-primary:#1d1d1f;--liquid-text-secondary:#6e6e73;--liquid-text-tertiary:#8b9098;
  --ink:var(--liquid-text-primary);--muted:var(--liquid-text-secondary);--faint:var(--liquid-text-tertiary);
  --accent:#0071e3;--accent-soft:rgba(0,113,227,.12);--like:#ff3b30;--pos:#34c759;--neg:#ff3b30;
  --news:#ff3b30;--activity:#ff9500;--chip-bg:rgba(120,120,128,.10);--chip-line:rgba(15,23,42,.07);--hover:rgba(120,120,128,.08);
  --r-lg:var(--liquid-radius-lg);--r-md:var(--liquid-radius-md);--ease:cubic-bezier(.23,1,.32,1);
}
:root[data-theme="dark"]{
  --liquid-bg:rgba(28,28,36,.72);--liquid-bg-strong:rgba(40,40,52,.84);--liquid-bg-subtle:rgba(38,38,48,.58);--liquid-bg-nested:rgba(38,38,48,.42);
  --liquid-border:rgba(255,255,255,.12);--liquid-border-strong:rgba(255,255,255,.18);--liquid-border-hairline:rgba(255,255,255,.08);
  --liquid-highlight:inset 0 1px 0 rgba(255,255,255,.12);--liquid-highlight-subtle:inset 0 1px 0 rgba(255,255,255,.08);
  --liquid-shadow:0 20px 60px rgba(0,0,0,.4),0 1px 3px rgba(0,0,0,.3);--liquid-shadow-sm:0 8px 24px rgba(0,0,0,.3);--liquid-shadow-overlay:0 24px 80px rgba(0,0,0,.42);
  --liquid-text-primary:#f5f5f7;--liquid-text-secondary:#a1a1a6;--liquid-text-tertiary:#7c7c82;
  --accent:#2997ff;--accent-soft:rgba(41,151,255,.18);--like:#ff453a;--pos:#30d158;--neg:#ff453a;--news:#ff453a;--activity:#ff9f0a;
  --chip-bg:rgba(120,120,128,.18);--chip-line:rgba(255,255,255,.09);--hover:rgba(120,120,128,.16);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --liquid-bg:rgba(28,28,36,.72);--liquid-bg-strong:rgba(40,40,52,.84);--liquid-bg-subtle:rgba(38,38,48,.58);--liquid-bg-nested:rgba(38,38,48,.42);
    --liquid-border:rgba(255,255,255,.12);--liquid-border-strong:rgba(255,255,255,.18);--liquid-border-hairline:rgba(255,255,255,.08);
    --liquid-highlight:inset 0 1px 0 rgba(255,255,255,.12);--liquid-highlight-subtle:inset 0 1px 0 rgba(255,255,255,.08);
    --liquid-shadow:0 20px 60px rgba(0,0,0,.4),0 1px 3px rgba(0,0,0,.3);--liquid-shadow-sm:0 8px 24px rgba(0,0,0,.3);--liquid-shadow-overlay:0 24px 80px rgba(0,0,0,.42);
    --liquid-text-primary:#f5f5f7;--liquid-text-secondary:#a1a1a6;--liquid-text-tertiary:#7c7c82;
    --accent:#2997ff;--accent-soft:rgba(41,151,255,.18);--like:#ff453a;--pos:#30d158;--neg:#ff453a;--news:#ff453a;--activity:#ff9f0a;
    --chip-bg:rgba(120,120,128,.18);--chip-line:rgba(255,255,255,.09);--hover:rgba(120,120,128,.16);
  }
}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  :root{--liquid-bg:rgba(255,255,255,.96);--liquid-bg-strong:#fff;--liquid-bg-subtle:#f5f5f7}
  :root[data-theme="dark"]{--liquid-bg:#1e1e2a;--liquid-bg-strong:#252532}
}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  font-size:15px;line-height:1.6;color:var(--ink);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.bg{position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:
    radial-gradient(900px 620px at 12% -8%,rgba(0,113,227,.16),transparent 62%),
    radial-gradient(820px 560px at 90% 8%,rgba(142,102,255,.13),transparent 60%),
    radial-gradient(760px 560px at 52% 110%,rgba(255,149,0,.10),transparent 62%),
    linear-gradient(180deg,#f7f8fa 0%,#eef0f4 100%)}
:root[data-theme="dark"] .bg{
  background:
    radial-gradient(900px 620px at 12% -8%,rgba(41,151,255,.17),transparent 62%),
    radial-gradient(820px 560px at 90% 8%,rgba(142,102,255,.14),transparent 60%),
    radial-gradient(760px 560px at 52% 110%,rgba(255,159,10,.08),transparent 62%),
    linear-gradient(180deg,#0c0d13 0%,#12131b 100%)}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]) .bg{
    background:
      radial-gradient(900px 620px at 12% -8%,rgba(41,151,255,.17),transparent 62%),
      radial-gradient(820px 560px at 90% 8%,rgba(142,102,255,.14),transparent 60%),
      radial-gradient(760px 560px at 52% 110%,rgba(255,159,10,.08),transparent 62%),
      linear-gradient(180deg,#0c0d13 0%,#12131b 100%)}
}
.glass{background:var(--liquid-bg);backdrop-filter:var(--liquid-filter);-webkit-backdrop-filter:var(--liquid-filter);
  border:1px solid var(--liquid-border);box-shadow:var(--liquid-shadow),var(--liquid-highlight);border-radius:var(--r-lg)}
.glass-sm{background:var(--liquid-bg-subtle);backdrop-filter:var(--liquid-filter-sm);-webkit-backdrop-filter:var(--liquid-filter-sm);
  border:1px solid var(--liquid-border);box-shadow:var(--liquid-shadow-sm),var(--liquid-highlight-subtle);border-radius:var(--r-md)}
.topbar{position:fixed;top:12px;left:50%;transform:translateX(-50%);
  width:min(920px,calc(100% - 24px));height:56px;z-index:100;display:flex;align-items:center;gap:12px;padding:0 12px 0 18px;
  background:var(--liquid-bg-strong);backdrop-filter:var(--liquid-filter);-webkit-backdrop-filter:var(--liquid-filter);
  border:1px solid var(--liquid-border-strong);box-shadow:var(--liquid-shadow-sm),var(--liquid-highlight);border-radius:var(--liquid-radius-pill)}
.brand{display:flex;align-items:center;gap:10px;flex-shrink:0}
.brand-dot{width:26px;height:26px;border-radius:9px;flex-shrink:0;background:linear-gradient(135deg,#0071e3,#5e5ce6);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 4px 10px rgba(0,113,227,.35);display:grid;place-items:center;color:#fff}
.brand-dot svg{width:14px;height:14px}
.brand-title{font-size:14.5px;font-weight:700;letter-spacing:.01em;white-space:nowrap}
.brand-sub{font-size:11px;color:var(--faint);margin-top:-2px}
.search-wrap{flex:1;min-width:0;display:flex;justify-content:flex-end}
.search{display:flex;align-items:center;gap:7px;width:min(260px,100%);height:36px;padding:0 12px;border-radius:var(--liquid-radius-pill);
  background:var(--chip-bg);border:1px solid var(--chip-line);color:var(--muted);transition:background .18s var(--ease),border-color .18s var(--ease)}
.search:focus-within{background:var(--liquid-bg-nested);border-color:var(--accent)}
.search svg{width:14px;height:14px;flex-shrink:0;opacity:.7}
.search input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:13px;color:var(--ink)}
.search input::placeholder{color:var(--faint)}
.theme-btn{flex-shrink:0;height:36px;padding:0 13px;border-radius:var(--liquid-radius-pill);display:flex;align-items:center;gap:6px;cursor:pointer;
  border:1px solid var(--chip-line);background:var(--chip-bg);font:inherit;font-size:12.5px;font-weight:600;color:var(--muted);
  transition:transform .16s var(--ease),background .18s var(--ease)}
.theme-btn:hover{background:var(--hover)}
.theme-btn:active{transform:scale(.95)}
.theme-btn svg{width:14px;height:14px}
main{max-width:860px;margin:0 auto;padding:104px 20px 64px}
.panel{margin-top:18px;padding:22px}
.hero{display:flex;gap:16px;align-items:center}
.hero-icon{width:52px;height:52px;border-radius:16px;flex-shrink:0;background:linear-gradient(135deg,#0071e3,#5e5ce6);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 10px 24px rgba(0,113,227,.3);display:grid;place-items:center;color:#fff}
.hero-icon svg{width:24px;height:24px}
.hero h1{margin:0;font-size:24px;font-weight:800;letter-spacing:-.01em}
.hero .sub{color:var(--muted);font-size:13.5px;margin-top:3px}
.hero .pill{margin-left:auto;flex-shrink:0;font-size:11.5px;font-weight:600;color:var(--muted);padding:6px 12px;
  border-radius:var(--liquid-radius-pill);background:var(--chip-bg);border:1px solid var(--chip-line);white-space:nowrap}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.stat{padding:15px 17px}
.stat b{display:block;font-size:25px;font-weight:800;letter-spacing:-.02em;line-height:1.2;font-variant-numeric:tabular-nums}
.stat span{color:var(--muted);font-size:12.5px}
.tabs-sticky{position:sticky;top:84px;z-index:90;padding:6px;margin-bottom:2px;border-radius:var(--liquid-radius-pill)}
.tabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{flex-shrink:0;border:0;background:transparent;cursor:pointer;font:inherit;font-size:13.5px;font-weight:600;color:var(--muted);
  padding:9px 16px;border-radius:var(--liquid-radius-pill);display:flex;align-items:center;gap:7px;white-space:nowrap;
  transition:background .18s var(--ease),color .18s var(--ease)}
.tab:hover{background:var(--hover)}
.tab.active{background:var(--accent);color:#fff;box-shadow:0 6px 16px rgba(0,113,227,.3)}
.tab .n{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;padding:1px 7px;border-radius:var(--liquid-radius-pill);
  background:var(--chip-bg);color:var(--muted)}
.tab.active .n{background:rgba(255,255,255,.24);color:#fff}
.view{display:none;margin-top:16px}
.view.active{display:block;animation:fadeUp .32s var(--ease)}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.result-line{margin:0 2px 10px;font-size:12.5px;color:var(--faint)}
.post{padding:18px 20px;margin-top:14px;transition:transform .2s var(--ease),box-shadow .2s var(--ease)}
.post:hover{transform:translateY(-2px);box-shadow:var(--liquid-shadow-overlay),var(--liquid-highlight)}
.post-head{display:flex;align-items:center;gap:12px}
.avatar{width:42px;height:42px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;color:#fff;font-size:16px;font-weight:700;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 2px 6px rgba(0,0,0,.12);overflow:hidden}
.avatar img{width:100%;height:100%;object-fit:cover}
.avatar.sm{width:28px;height:28px;font-size:12px}
.author-info{display:flex;flex-direction:column;min-width:0}
.author-name{font-size:14px;font-weight:700;line-height:1.35;word-break:break-all}
.author-time{font-size:12px;color:var(--faint)}
.kind-badge{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:var(--liquid-radius-pill);margin-left:8px;vertical-align:1px}
.kind-badge.news{color:var(--news);background:rgba(255,59,48,.12)}
.kind-badge.activity{color:var(--activity);background:rgba(255,149,0,.14)}
.badge-self{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:var(--liquid-radius-pill);margin-left:6px;vertical-align:1px;color:var(--accent);background:var(--accent-soft)}
.post-title{margin:12px 0 0;font-size:17px;font-weight:700;letter-spacing:-.01em;line-height:1.45}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.tag{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:var(--muted);padding:3.5px 10px;
  border-radius:var(--liquid-radius-pill);background:var(--chip-bg);border:1px solid var(--chip-line)}
.tag svg{width:11px;height:11px}
.post-text{margin-top:10px;font-size:14.5px;line-height:1.75;color:var(--ink);white-space:pre-wrap;word-break:break-word}
.post-text.clamped{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.expand-btn{margin-top:6px;border:0;background:transparent;cursor:pointer;padding:2px 0;font:inherit;font-size:13px;font-weight:600;
  color:var(--accent);display:inline-flex;align-items:center;gap:3px}
.expand-btn svg{width:13px;height:13px;transition:transform .2s var(--ease)}
.expand-btn.open svg{transform:rotate(180deg)}
.thumb-grid{display:grid;gap:8px;margin-top:12px}
.thumb-grid.count-1{grid-template-columns:1fr}
.thumb-grid.count-2{grid-template-columns:1fr 1fr}
.thumb-grid.count-3{grid-template-columns:repeat(3,1fr)}
.thumb{position:relative;overflow:hidden;border-radius:13px;cursor:zoom-in;border:1px solid var(--liquid-border-hairline);
  background:var(--chip-bg);box-shadow:0 2px 8px rgba(15,23,42,.06);padding:0}
.thumb img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s var(--ease)}
.thumb:hover img{transform:scale(1.035)}
.thumb-grid.count-1 .thumb{aspect-ratio:16/9}
.thumb-grid.count-2 .thumb{aspect-ratio:4/3}
.thumb-grid.count-3 .thumb{aspect-ratio:1/1}
.post-foot{display:flex;align-items:center;gap:24px;margin-top:14px;padding-top:13px;border-top:1px solid var(--liquid-border-hairline)}
.act{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--muted)}
.act svg{width:15px;height:15px}
.act.liked{color:var(--like)}
.act.archive{margin-left:auto;font-size:11.5px;font-weight:600;color:var(--faint);gap:5px}
.act.archive svg{width:11px;height:11px}
.comments{margin-top:13px;padding-top:4px}
.comments-head{font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:8px}
.comment{display:flex;gap:9px;padding:7px 0}
.comment.reply{margin-left:37px;position:relative}
.comment.reply::before{content:"";position:absolute;left:-24px;top:14px;width:16px;height:1.5px;background:var(--chip-line)}
.comment-body{min-width:0;flex:1}
.comment-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.comment-author{font-size:12.5px;font-weight:700}
.comment-time{font-size:11px;color:var(--faint)}
.comment-text{font-size:13.5px;line-height:1.6;margin-top:1px;word-break:break-word}
.entry{padding:18px 20px;margin-top:14px}
.entry-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.entry-kind{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 10px;border-radius:var(--liquid-radius-pill)}
.entry-kind svg{width:11px;height:11px}
.entry-kind.cloud{color:var(--accent);background:var(--accent-soft)}
.entry-kind.hole{color:#bf5af2;background:rgba(191,90,242,.13)}
.cover{margin-top:13px;border-radius:13px;overflow:hidden;border:1px solid var(--liquid-border-hairline);box-shadow:0 2px 8px rgba(15,23,42,.06)}
.cover img{width:100%;aspect-ratio:16/8;object-fit:cover;display:block}
.record{display:flex;align-items:center;gap:13px;padding:13px 6px;border-bottom:1px solid var(--liquid-border-hairline)}
.record:last-child{border-bottom:0}
.record-icon{width:36px;height:36px;border-radius:11px;flex-shrink:0;display:grid;place-items:center}
.record-icon svg{width:16px;height:16px}
.ri-blue{color:var(--accent);background:var(--accent-soft)}
.ri-green{color:var(--pos);background:rgba(52,199,89,.13)}
.ri-orange{color:var(--activity);background:rgba(255,149,0,.13)}
.ri-purple{color:#bf5af2;background:rgba(191,90,242,.12)}
.ri-red{color:var(--neg);background:rgba(255,59,48,.11)}
.record-body{flex:1;min-width:0}
.record-title{font-size:13.5px;font-weight:650;line-height:1.4;word-break:break-word}
.record-sub{font-size:12px;color:var(--faint);margin-top:1px;word-break:break-word}
.record-side{flex-shrink:0;text-align:right}
.record-amount{font-size:14.5px;font-weight:750;font-variant-numeric:tabular-nums}
.record-time{font-size:11px;color:var(--faint);margin-top:1px}
.mood-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:650;padding:3.5px 11px;
  border-radius:var(--liquid-radius-pill);background:rgba(191,90,242,.12);color:#bf5af2}
:root[data-theme="dark"] .mood-chip{color:#d899f5}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .mood-chip{color:#d899f5}}
.files{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:4px}
.file{display:flex;align-items:center;gap:9px;padding:10px 13px;text-decoration:none;color:var(--ink);border-radius:12px;
  background:var(--chip-bg);border:1px solid var(--chip-line);transition:background .18s var(--ease)}
.file:hover{background:var(--hover)}
.file svg{width:14px;height:14px;color:var(--accent);flex-shrink:0}
.file-path{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-size{margin-left:auto;font-size:11px;color:var(--faint);flex-shrink:0;font-variant-numeric:tabular-nums;white-space:nowrap}
.foot-note{margin-top:26px;text-align:center;font-size:12px;color:var(--faint);line-height:1.8}
.lightbox{position:fixed;inset:0;z-index:200;display:none;cursor:zoom-out;
  background:rgba(10,12,18,.58);backdrop-filter:blur(22px) saturate(140%);-webkit-backdrop-filter:blur(22px) saturate(140%)}
.lightbox.open{display:grid;place-items:center}
.lb-img{max-width:min(1000px,88vw);max-height:76vh;border-radius:18px;border:1px solid rgba(255,255,255,.3);box-shadow:var(--liquid-shadow-overlay)}
.lb-cap{position:absolute;bottom:34px;left:50%;transform:translateX(-50%);max-width:80vw;padding:9px 18px;border-radius:var(--liquid-radius-pill);
  background:rgba(30,30,38,.62);border:1px solid rgba(255,255,255,.16);color:#fff;font-size:12.5px;font-weight:600;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:50%;
  border:1px solid rgba(255,255,255,.22);cursor:pointer;background:rgba(30,30,38,.55);color:#fff;display:grid;place-items:center;
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);transition:background .18s}
.lb-nav:hover{background:rgba(60,60,72,.7)}
.lb-nav svg{width:18px;height:18px}
.lb-prev{left:26px}.lb-next{right:26px}
.lb-close{position:absolute;top:22px;right:24px;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.22);
  cursor:pointer;background:rgba(30,30,38,.55);color:#fff;display:grid;place-items:center;
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.lb-close svg{width:16px;height:16px}
@media (max-width:640px){
  main{padding:96px 14px 48px}
  .brand-sub{display:none}
  .search{width:120px}
  .stats{grid-template-columns:1fr 1fr}
  .hero h1{font-size:20px}
  .hero .pill{display:none}
  .files{grid-template-columns:1fr}
  .lb-prev{left:10px}.lb-next{right:10px}
}
</style>
</head>
<body>
<div class="bg" aria-hidden="true"></div>
<header class="topbar">
  <div class="brand">
    <div class="brand-dot" id="brandIcon"></div>
    <div><div class="brand-title">BOH 数据导出</div><div class="brand-sub">本地存档 · 离线可读</div></div>
  </div>
  <div class="search-wrap">
    <label class="search"><span id="searchIcon"></span><input id="searchInput" type="search" placeholder="搜索帖子与评论…" autocomplete="off"></label>
  </div>
  <button class="theme-btn" id="themeBtn" type="button"><span id="themeIcon"></span><span id="themeLabel">自动</span></button>
</header>
<main>
  <section class="glass panel hero" style="margin-top:0">
    <div class="hero-icon" id="heroIcon"></div>
    <div><h1>你的数据副本</h1><div class="sub">生成时间 <span id="exportDate">—</span> · 点击图片可放大 · 支持浅色 / 深色</div></div>
    <span class="pill">离线存档</span>
  </section>
  <section class="stats">
    <div class="glass-sm stat"><b id="stRecords">0</b><span>数据记录</span></div>
    <div class="glass-sm stat"><b id="stImages">0</b><span>已打包图片</span></div>
    <div class="glass-sm stat"><b id="stInteract">0</b><span>论坛互动</span></div>
    <div class="glass-sm stat"><b id="stFiles">0</b><span>数据文件</span></div>
  </section>
  <div class="glass tabs-sticky"><nav class="tabs" id="tabs"></nav></div>
  <section class="view active" id="view-forum"></section>
  <section class="view" id="view-cloud"></section>
  <section class="view" id="view-treehole"></section>
  <section class="view" id="view-activity"></section>
  <section class="view" id="view-records"></section>
  <section class="view" id="view-files"></section>
  <p class="foot-note">
    此页面由导出任务自动生成，与压缩包内的 JSON / 图片配套 · 完整统计见 manifest.json<br>
    数据截止至生成时间，如需最新版本请在站点设置中重新申请导出
  </p>
</main>
<div class="lightbox" id="lightbox">
  <img class="lb-img" id="lbImg" alt="">
  <button class="lb-close" id="lbClose" type="button" aria-label="关闭"></button>
  <button class="lb-nav lb-prev" id="lbPrev" type="button" aria-label="上一张"></button>
  <button class="lb-nav lb-next" id="lbNext" type="button" aria-label="下一张"></button>
  <div class="lb-cap" id="lbCap"></div>
</div>
<script>
const DATA=${previewDataJson};
const ICONS={
  archive:'<path d="M20 9v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9"/><path d="M2 5h20v4H2z"/><path d="M10 13h4"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>',
  heart:'<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>',
  comment:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  cloud:'<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  lock:'<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  sparkle:'<path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z"/>',
  gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  ticket:'<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.2-4.2a1.8 1.8 0 0 0-2.6 0L5 20"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  auto:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" stroke="none"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  left:'<path d="m15 18-6-6 6-6"/>',
  right:'<path d="m9 18 6-6-6-6"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  checkin:'<path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="m9 14 2 2 4-4"/>'
};
const icon=function(name,filled){
  return '<svg viewBox="0 0 24 24" fill="'+(filled?'currentColor':'none')+'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICONS[name]+'</svg>';
};
const esc=function(v){return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
const fmtDate=function(v){if(!v)return '';try{return new Date(v).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}};
const pick=function(o){for(var i=1;i<arguments.length;i++){var k=arguments[i];if(o&&o[k]!=null&&o[k]!=='')return o[k]}return ''};
const rows=function(){var out=[];for(var i=0;i<arguments.length;i++){var n=arguments[i];if(Array.isArray(DATA.files[n]))out=out.concat(DATA.files[n])}return out};
const res=function(u){if(!u)return '';return (DATA.resolvedImages&&DATA.resolvedImages[u])||''};
const excerpt=function(s,n){s=String(s||'').replace(/\\s+/g,' ').trim();return s.length>n?s.slice(0,n)+'…':s};
const AV_COLORS=['#0071e3','#5e5ce6','#bf5af2','#ff9500','#34c759','#ff3b30','#64d2ff'];
const avColor=function(name){var s=String(name||'?'),h=0;for(var i=0;i<s.length;i++)h+=s.charCodeAt(i);return AV_COLORS[h%AV_COLORS.length]};
const avatarHtml=function(name,sm){
  var n=String(name||'?');
  return '<div class="avatar'+(sm?' sm':'')+'" style="background:linear-gradient(135deg,'+avColor(n)+','+avColor(n.split('').reverse().join(''))+')">'+esc(n.charAt(0).toUpperCase())+'</div>';
};
const selfName=(function(){var pr=rows('profile/profile.json')[0]||{};return pick(pr,'username','nickname','display_name','user_name')||'我'})();
const likedSet=(function(){var s=new Set();rows('forum/likes.json').forEach(function(r){if(r&&r.post_id)s.add(r.post_id)});return s})();
const postById=(function(){var m={};rows('forum/posts.json').forEach(function(p){if(p&&p.id)m[p.id]=p});return m})();
const cmtById=(function(){var m={};rows('forum/comments.json').forEach(function(c){if(c&&c.id)m[c.id]=c});return m})();
const postImgs=(function(){
  var m={};
  rows('forum/post_images.json').forEach(function(r){
    if(!r||!r.post_id)return;var p=res(r.url);if(!p)return;
    (m[r.post_id]=m[r.post_id]||[]).push(p);
  });
  return m;
})();
const deepUrls=function(node,out){
  if(!node)return;
  if(typeof node==='string'){var p=res(node);if(p)out.push(p);return}
  if(Array.isArray(node)){for(var i=0;i<node.length;i++)deepUrls(node[i],out);return}
  if(typeof node==='object'){var vs=Object.values(node);for(var j=0;j<vs.length;j++)deepUrls(vs[j],out)}
};
var LB_ITEMS=[];
const lbAttr=function(src,cap){LB_ITEMS.push({src:src,cap:cap});return ' data-lb-src="'+esc(src)+'" data-lb-cap="'+esc(cap)+'"'};
const thumbHtml=function(src,cap,cls){
  return '<button class="thumb'+(cls?' '+cls:'')+'" type="button"'+lbAttr(src,cap)+'><img src="'+esc(src)+'" alt="" loading="lazy"></button>';
};
const gridHtml=function(paths,cap){
  if(!paths||!paths.length)return '';
  var cls='count-'+Math.min(paths.length,3);
  var inner='';
  for(var i=0;i<paths.length;i++)inner+=thumbHtml(paths[i],cap);
  return '<div class="thumb-grid '+cls+'">'+inner+'</div>';
};
const commentHtml=function(c,isReply){
  var replyTo=c.reply_to_username?'<span class="comment-time">回复 @'+esc(c.reply_to_username)+'</span>':'';
  return '<div class="comment'+(isReply?' reply':'')+'">'+avatarHtml(c.author_username,true)+
    '<div class="comment-body"><div class="comment-head"><span class="comment-author">@'+esc(c.author_username||'匿名')+'</span>'+replyTo+
    '<span class="comment-time">'+esc(fmtDate(c.created_at))+'</span></div>'+
    '<div class="comment-text">'+esc(c.content)+'</div></div></div>';
};
const postHtml=function(p){
  var comments=(p&&p.id)?rows('forum/comments.json').filter(function(c){return c.post_id===p.id}):[];
  var roots=comments.filter(function(c){return !c.parent_id});
  var replies={};
  comments.forEach(function(c){if(c.parent_id){(replies[c.parent_id]=replies[c.parent_id]||[]).push(c)}});
  var commentsHtml=roots.map(function(c){return commentHtml(c,false)+(replies[c.id]||[]).map(function(r){return commentHtml(r,true)}).join('')}).join('');
  var kind=pick(p,'post_kind');
  var kindBadge=kind==='news'?'<span class="kind-badge news">新闻</span>':(kind==='activity'?'<span class="kind-badge activity">活动</span>':'');
  var liked=likedSet.has(p.id);
  var likeCount=String(pick(p,'like_count'));
  var likeText=likeCount!==''?likeCount:(liked?'已赞':'');
  var tags='';
  var tag=pick(p,'tag');
  if(tag)tags+='<span class="tag">'+esc(tag)+'</span>';
  var loc=pick(p,'location_name');
  if(loc)tags+='<span class="tag">'+icon('pin')+esc(loc)+'</span>';
  var title=pick(p,'title');
  var cap=title||excerpt(p.content,40)||'帖子图片';
  var html='<article class="glass-sm post">'+
    '<div class="post-head">'+avatarHtml(p.author_username)+
    '<div class="author-info"><span class="author-name">@'+esc(p.author_username||'我')+kindBadge+(liked?'<span class="badge-self">你赞过</span>':'')+'</span>'+
    '<span class="author-time">'+esc(fmtDate(p.created_at))+'</span></div></div>';
  if(title)html+='<h3 class="post-title">'+esc(title)+'</h3>';
  if(tags)html+='<div class="tags">'+tags+'</div>';
  html+=gridHtml(postImgs[p.id],cap);
  var content=String(p.content||'');
  var long=content.length>160;
  html+='<div class="post-text'+(long?' clamped':'')+'">'+esc(content)+'</div>';
  if(long)html+='<button class="expand-btn" type="button" data-expand>'+icon('chevron')+'<span>展开全文</span></button>';
  var cmtCount=Math.max(comments.length,Number(p.comment_count||0));
  html+='<div class="post-foot">'+
    '<span class="act'+(liked?' liked':'')+'">'+icon('heart',liked)+(likeText?'<span>'+esc(likeText)+'</span>':'')+'</span>'+
    (cmtCount?'<span class="act">'+icon('comment')+'<span>'+cmtCount+'</span></span>':'')+
    '<span class="act archive">'+icon('archive')+'存档自论坛</span></div>';
  if(commentsHtml)html+='<div class="comments"><div class="comments-head">'+comments.length+' 条评论</div>'+commentsHtml+'</div>';
  return html+'</article>';
};
const sectionEntry=function(kindHtml,timeHtml,bodyHtml){
  return '<article class="glass-sm entry"><div class="entry-head">'+kindHtml+timeHtml+'</div>'+bodyHtml+'</article>';
};
const cloudHtml=(function(){
  var list=rows('cloud/entries.json');
  if(!list.length)return '<div class="glass-sm entry">暂无 Cloud+ 记录</div>';
  return list.map(function(e){
    var paras='';var imgs=[];
    (Array.isArray(e.content_blocks)?e.content_blocks:[]).forEach(function(b){
      if(b&&typeof b==='object'&&typeof b.text==='string')paras+=(paras?'\\n\\n':'')+b.text;
      deepUrls(b,imgs);
    });
    var kind='<span class="entry-kind cloud">'+icon('cloud')+'Cloud+</span>';
    var time='<span class="author-time">'+esc(fmtDate(e.created_at))+'</span>';
    var body='';
    var title=pick(e,'title','name');
    if(title)body+='<h3 class="post-title">'+esc(title)+'</h3>';
    var tags=Array.isArray(e.tags)?e.tags:[];
    if(tags.length){var th='';for(var i=0;i<tags.length;i++)th+='<span class="tag">'+esc(tags[i])+'</span>';body+='<div class="tags">'+th+'</div>'}
    var cover=res(e.cover_image_url);
    if(cover)body+='<div class="cover">'+thumbHtml(cover,title||'Cloud+ 封面')+'</div>';
    var uniqueImgs=imgs.filter(function(v,i,a){return a.indexOf(v)===i});
    if(uniqueImgs.length)body+=gridHtml(uniqueImgs,title||'Cloud+ 图片');
    if(paras)body+='<div class="post-text">'+esc(paras)+'</div>';
    return sectionEntry(kind,time,body);
  }).join('');
})();
const treeholeHtml=(function(){
  var list=rows('treehole/memories.json');
  if(!list.length)return '<div class="glass-sm entry">暂无树洞记忆</div>';
  return list.map(function(m){
    var kind='<span class="entry-kind hole">'+icon('lock')+'树洞 · 仅自己可见</span>';
    var mood=pick(m,'mood','emotion','feeling');
    var time='<span class="author-time">'+esc(fmtDate(m.created_at))+'</span>'+(mood?'<span class="mood-chip" style="margin-left:auto">'+esc(mood)+'</span>':'');
    var body='<div class="post-text">'+esc(pick(m,'content','text','body'))+'</div>';
    return sectionEntry(kind,time,body);
  }).join('');
})();
const RI={like:['ri-red','heart'],comment:['ri-blue','comment'],follow:['ri-green','sparkle'],checkin:['ri-orange','checkin'],system:['ri-purple','bell'],
  impression:['ri-purple','sparkle'],wall:['ri-blue','image'],gift:['ri-green','gift'],lottery:['ri-blue','ticket'],poster:['ri-purple','image'],
  points:['ri-green','sparkle'],message:['ri-blue','mail']};
const recordRow=function(kind,title,sub,side,time){
  var ri=RI[kind]||['ri-blue','bell'];
  return '<div class="record"><div class="record-icon '+ri[0]+'">'+icon(ri[1])+'</div>'+
    '<div class="record-body"><div class="record-title">'+esc(title)+'</div>'+(sub?'<div class="record-sub">'+esc(sub)+'</div>':'')+'</div>'+
    '<div class="record-side">'+(side||'')+(time?'<div class="record-time">'+esc(fmtDate(time))+'</div>':'')+'</div></div>';
};
var activityParts=[];
(function(){
  var NOTI_LABEL={like:'收到点赞',comment:'收到评论',follow:'收到关注',follow_back:'收到关注',checkin:'签到提醒',system:'系统通知',mention:'收到提及'};
  var notis=rows('interactions/notifications.json');
  if(notis.length){
    activityParts.push('<div class="comments-head" style="margin:0 0 2px">站内通知</div>');
    notis.forEach(function(n){
      var label=NOTI_LABEL[n.type]||'站内通知';
      var rel='';
      if(n.comment_id&&cmtById[n.comment_id])rel=cmtById[n.comment_id].content;
      else if(n.post_id&&postById[n.post_id])rel=postById[n.post_id].title||postById[n.post_id].content;
      activityParts.push(recordRow(n.type==='like'?'like':(n.type==='comment'?'comment':(n.type==='follow'?'follow':(n.type==='checkin'?'checkin':'system'))),label,rel?excerpt(rel,60):'',pick(n,'status')==='unread'?'未读':'',n.created_at));
    });
  }
  var received=rows('interactions/impressions_received.json');
  if(received.length){
    activityParts.push('<div class="comments-head" style="margin:18px 0 2px">收到的印象</div>');
    received.forEach(function(i){
      activityParts.push(recordRow('impression',pick(i,'content','tag')||'一条印象',(pick(i,'category')||'')+(pick(i,'category')&&pick(i,'content')?' · ':''),'',i.created_at));
    });
  }
  var authored=rows('interactions/impressions_authored.json');
  if(authored.length){
    activityParts.push('<div class="comments-head" style="margin:18px 0 2px">发出的印象</div>');
    authored.forEach(function(i){
      activityParts.push(recordRow('impression',pick(i,'content','tag')||'一条印象',pick(i,'category'),'',i.created_at));
    });
  }
  var wall=rows('interactions/block_wall_items.json');
  if(wall.length){
    activityParts.push('<div class="comments-head" style="margin:18px 0 2px">留言墙</div>');
    wall.forEach(function(w){
      var img=res(w.image_url);
      var side='';
      if(img)side='<div class="cover" style="margin-top:8px;width:132px"><img src="'+esc(img)+'" alt="" loading="lazy"></div>';
      activityParts.push(recordRow('wall',pick(w,'content','text')||'一张留言',pick(w,'author_username')?'来自 @'+w.author_username:'',side,w.created_at));
    });
  }
})();
var recordsParts=[];
(function(){
  var pts=rows('records/points_transactions.json');
  if(pts.length){
    recordsParts.push('<div class="comments-head" style="margin:0 0 2px">积分流水</div>');
    pts.forEach(function(t){
      var amount=Number(t.amount||0);
      var side='<div class="record-amount" style="color:var('+(amount>=0?'--pos':'--neg')+')">'+(amount>=0?'+':'')+amount+'</div>';
      var balance=pick(t,'balance_after');
      recordsParts.push(recordRow('points',pick(t,'reason','remark','title')||'积分变动',balance!==''?'变动后余额 '+balance:'',side,t.created_at));
    });
  }
  var gifts=rows('records/gifts.json');
  if(gifts.length){
    recordsParts.push('<div class="comments-head" style="margin:18px 0 2px">礼物记录</div>');
    gifts.forEach(function(g){
      var price=Number(g.gift_price||0);
      recordsParts.push(recordRow('gift',pick(g,'gift_content')||'礼物',pick(g,'gift_status')+(price?' · '+price+' 积分':''),'',g.created_at));
    });
  }
  var msgs=rows('records/messages.json');
  if(msgs.length){
    recordsParts.push('<div class="comments-head" style="margin:18px 0 2px">私信</div>');
    msgs.forEach(function(m){
      recordsParts.push(recordRow('message',pick(m,'subject')||excerpt(m.content,40),pick(m,'sender_name')?'来自 '+m.sender_name:'',m.created_at?'':'',m.created_at));
      if(!m.subject&&m.content)recordsParts[recordsParts.length-1]=recordRow('message',excerpt(m.content,60),pick(m,'sender_name')?'来自 '+m.sender_name:'','',m.created_at);
    });
  }
  var lottery=rows('records/lottery_entries.json');
  if(lottery.length){
    recordsParts.push('<div class="comments-head" style="margin:18px 0 2px">抽奖报名</div>');
    lottery.forEach(function(l){
      recordsParts.push(recordRow('lottery',pick(l,'campaign_name','activity_name','title','name')||'抽奖活动',pick(l,'status','state'),'',l.created_at));
    });
  }
  var posters=rows('records/poster_requests.json');
  if(posters.length){
    recordsParts.push('<div class="comments-head" style="margin:18px 0 2px">海报申请</div>');
    posters.forEach(function(r){
      recordsParts.push(recordRow('poster',pick(r,'theme','style','title','prompt')||'海报申请',pick(r,'status','state'),'',r.created_at));
    });
  }
})();
const filesHtml=(function(){
  var html='';
  Object.keys(DATA.files).forEach(function(path){
    var arr=DATA.files[path];
    var size=arr.length?((JSON.stringify(arr).length/1024).toFixed(1)+' KB'):'—';
    html+='<a class="file" href="'+esc(path)+'" target="_blank" rel="noopener"><span>'+icon('file')+'</span>'+
      '<span class="file-path">'+esc(path)+'</span><span class="file-size">'+esc(size)+'</span></a>';
  });
  html+='<a class="file" href="manifest.json" target="_blank" rel="noopener"><span>'+icon('file')+'</span>'+
    '<span class="file-path">manifest.json</span><span class="file-size">打包统计</span></a>';
  html+='<a class="file" href="README.txt" target="_blank" rel="noopener"><span>'+icon('file')+'</span>'+
    '<span class="file-path">README.txt</span><span class="file-size">使用说明</span></a>';
  return html;
})();
const TABS=[
  ['forum','论坛',rows('forum/posts.json').length],
  ['cloud','Cloud+',rows('cloud/entries.json').length],
  ['treehole','树洞',rows('treehole/memories.json').length],
  ['activity','互动记录',rows('interactions/notifications.json').length+rows('interactions/impressions_received.json').length+rows('interactions/impressions_authored.json').length+rows('interactions/block_wall_items.json').length],
  ['records','文字记录',rows('records/points_transactions.json').length+rows('records/gifts.json').length+rows('records/messages.json').length+rows('records/lottery_entries.json').length+rows('records/poster_requests.json').length],
  ['files','数据文件',Object.keys(DATA.files).length]
];
const tabCount=function(id){
  for(var i=0;i<TABS.length;i++){if(TABS[i][0]===id)return TABS[i][2]}
  return 0;
};
document.getElementById('tabs').innerHTML=TABS.map(function(t,i){
  return '<button class="tab'+(i===0?' active':'')+'" type="button" data-tab="'+t[0]+'">'+t[1]+'<span class="n">'+t[2]+'</span></button>';
}).join('');
document.getElementById('view-forum').innerHTML=(function(){
  var posts=rows('forum/posts.json');
  if(!posts.length)return '<div class="glass-sm post">暂无论坛帖子</div>';
  return posts.map(postHtml).join('');
})();
document.getElementById('view-cloud').innerHTML=cloudHtml;
document.getElementById('view-treehole').innerHTML=treeholeHtml;
document.getElementById('view-activity').innerHTML=activityParts.length?'<div class="glass-sm entry">'+activityParts.join('')+'</div>':'<div class="glass-sm entry">暂无互动记录</div>';
document.getElementById('view-records').innerHTML=recordsParts.length?'<div class="glass-sm entry">'+recordsParts.join('')+'</div>':'<div class="glass-sm entry">暂无文字记录</div>';
document.getElementById('view-files').innerHTML='<div class="glass-sm panel" style="padding:16px"><div class="files">'+filesHtml+'</div></div>';
document.getElementById('stRecords').textContent=Object.keys(DATA.files).reduce(function(s,k){return s+(Array.isArray(DATA.files[k])?DATA.files[k].length:0)},0);
document.getElementById('stImages').textContent=(DATA.images||[]).length;
document.getElementById('stInteract').textContent=rows('forum/likes.json').length+rows('forum/comments.json').length;
document.getElementById('stFiles').textContent=Object.keys(DATA.files).length+2;
document.getElementById('exportDate').textContent=fmtDate(DATA.exportedAt);
document.getElementById('brandIcon').innerHTML=icon('archive');
document.getElementById('searchIcon').innerHTML=icon('search');
document.getElementById('heroIcon').innerHTML=icon('archive');
document.getElementById('lbClose').innerHTML=icon('x');
document.getElementById('lbPrev').innerHTML=icon('left');
document.getElementById('lbNext').innerHTML=icon('right');
var switchTab=function(id){
  var tabs=document.querySelectorAll('.tab');
  for(var i=0;i<tabs.length;i++)tabs[i].classList.toggle('active',tabs[i].getAttribute('data-tab')===id);
  var views=document.querySelectorAll('.view');
  for(var j=0;j<views.length;j++)views[j].classList.toggle('active',views[j].id==='view-'+id);
};
Array.prototype.forEach.call(document.querySelectorAll('.tab'),function(t){
  t.addEventListener('click',function(){switchTab(t.getAttribute('data-tab'))});
});
document.addEventListener('click',function(e){
  var btn=e.target.closest?e.target.closest('[data-expand]'):null;
  if(!btn)return;
  var text=btn.parentElement.querySelector('.post-text');
  var open=text.classList.toggle('clamped');
  btn.classList.toggle('open',!open);
  btn.querySelector('span').textContent=open?'展开全文':'收起';
});
var searchInput=document.getElementById('searchInput');
searchInput.addEventListener('input',function(){
  var q=searchInput.value.trim().toLowerCase();
  var posts=document.querySelectorAll('#view-forum .post');
  var hits=0;
  Array.prototype.forEach.call(posts,function(el){
    var hay=(el.textContent||'').toLowerCase();
    var match=!q||hay.indexOf(q)>=0;
    el.style.display=match?'':'none';
    if(match)hits++;
  });
  if(q)switchTab('forum');
  var line=document.getElementById('searchLine');
  if(!line){line=document.createElement('div');line.id='searchLine';line.className='result-line';document.getElementById('view-forum').prepend(line)}
  line.textContent=q?'找到 '+hits+' 条与「'+searchInput.value.trim()+'」相关的记录':'';
});
LB_ITEMS=[];
Array.prototype.forEach.call(document.querySelectorAll('[data-lb-src]'),function(el){
  LB_ITEMS.push({src:el.getAttribute('data-lb-src'),cap:el.getAttribute('data-lb-cap'),el:el});
});
var lbIndex=-1;
var lightbox=document.getElementById('lightbox');
var showLb=function(i){
  if(!LB_ITEMS.length)return;
  lbIndex=(i+LB_ITEMS.length)%LB_ITEMS.length;
  var item=LB_ITEMS[lbIndex];
  document.getElementById('lbImg').src=item.src;
  document.getElementById('lbCap').textContent=item.cap+(LB_ITEMS.length>1?'　·　'+(lbIndex+1)+'/'+LB_ITEMS.length:'');
};
document.addEventListener('click',function(e){
  var t=e.target.closest?e.target.closest('[data-lb-src]'):null;
  if(!t)return;
  for(var i=0;i<LB_ITEMS.length;i++){if(LB_ITEMS[i].el===t){showLb(i);lightbox.classList.add('open');return}}
});
lightbox.addEventListener('click',function(e){
  if(e.target.closest&&e.target.closest('.lb-prev')){showLb(lbIndex-1);return}
  if(e.target.closest&&e.target.closest('.lb-next')){showLb(lbIndex+1);return}
  if(!e.target.closest||!e.target.closest('.lb-img'))lightbox.classList.remove('open');
});
document.addEventListener('keydown',function(e){
  if(!lightbox.classList.contains('open'))return;
  if(e.key==='Escape')lightbox.classList.remove('open');
  if(e.key==='ArrowLeft')showLb(lbIndex-1);
  if(e.key==='ArrowRight')showLb(lbIndex+1);
});
var themeBtn=document.getElementById('themeBtn');
var THEME_KEY='boh-export-theme';
var store={get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
var applyTheme=function(mode){
  var root=document.documentElement;
  if(mode==='light')root.setAttribute('data-theme','light');
  else if(mode==='dark')root.setAttribute('data-theme','dark');
  else root.removeAttribute('data-theme');
  var meta={auto:['auto','自动'],light:['sun','浅色'],dark:['moon','深色']}[mode]||['auto','自动'];
  document.getElementById('themeIcon').innerHTML=icon(meta[0]);
  document.getElementById('themeLabel').textContent=meta[1];
};
var themeMode=store.get(THEME_KEY)||'auto';
applyTheme(themeMode);
themeBtn.addEventListener('click',function(){
  themeMode=themeMode==='auto'?'light':(themeMode==='light'?'dark':'auto');
  store.set(THEME_KEY,themeMode);
  applyTheme(themeMode);
});
</script>
</body>
</html>`;


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
        let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
        try {
          const uploadPromise = uploadExportFile(filePath, bytes, storageToken);
          // 定时器在竞速分出胜负后清理，避免残留 reject 触发 unhandled rejection
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutTimer = setTimeout(() => reject(new Error(`上传超过 ${UPLOAD_TIMEOUT_MS / 1000}s 未完成`)), UPLOAD_TIMEOUT_MS);
          });
          await Promise.race([uploadPromise, timeoutPromise]);
          uploaded = true;
        } catch (uploadError) {
          lastUploadError = String((uploadError as Error)?.message || uploadError);
          console.error(`user-data-export: 上传异常（第 ${attempt} 次）`, uploadError);
        } finally {
          if (timeoutTimer) clearTimeout(timeoutTimer);
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
