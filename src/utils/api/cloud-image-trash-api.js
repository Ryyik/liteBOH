/**
 * 图库单图删除 + 回收站 API（plans/039）。
 *
 * 三个动作的全部 SQL 都在 supabase/migrations/2026110413_cloud_image_trash.sql：
 *   · delete_cloud_entry_images —— 图库 blocks + 论坛帖子图片 + 回收站行（同事务）
 *   · restore_cloud_image_trash —— 回收站行 → 图库 blocks + 原帖图片
 *   · 回收站列表直接读表（RLS: auth.uid() = user_id）
 */
import { supabase } from '../supabase-client.js';
import { invalidateByTags, normalizeDbError } from '../request-core.js';
import { resolveTrashDaysLeft } from '../cloud-image-trash.js';

const TRASH_COLUMNS =
  'id, entry_id, source_post_id, source, image_url, public_id, entry_title, entry_date, deleted_at, purge_after, state';

/** RPC 以 "CODE:message" 抛错（与论坛 RPC 同一约定），这里拆成结构化 error。 */
function parseTrashRpcError(error) {
  const raw = String(error?.message || '').trim();
  const colon = raw.indexOf(':');
  if (colon > 0) {
    const code = raw.slice(0, colon).trim();
    const message = raw.slice(colon + 1).trim();
    if (/^[A-Z][A-Z_]+$/.test(code)) {
      return normalizeDbError({ code, message: message || raw });
    }
  }
  return normalizeDbError(error);
}

/**
 * 删除一条内容里的指定图片。
 * 论坛同步条目会在同一事务里同步更新 forum_post_images / posts.image_count。
 *
 * **必须传 publicIds**：服务端按 publicId 定位 block（幂等）。只传下标时，
 * 删除后 blocks 会重排，任何重试都会命中下一张图（审查实测确认）。
 * 返回 `alreadyDeleted: true` 表示这批图早就删过了，什么都没动。
 */
export async function deleteCloudEntryImages(entryId, blockIndexes = [], publicIds = []) {
  const safeEntryId = String(entryId || '').trim();
  const indexes = Array.from(
    new Set(
      (Array.isArray(blockIndexes) ? blockIndexes : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0),
    ),
  ).sort((a, b) => a - b);
  const ids = Array.from(
    new Set(
      (Array.isArray(publicIds) ? publicIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  if (!safeEntryId || (indexes.length === 0 && ids.length === 0)) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '没有选中可删除的图片', code: 'INVALID_SELECTION' }),
    };
  }

  const { data, error } = await supabase.rpc('delete_cloud_entry_images', {
    p_entry_id: safeEntryId,
    p_block_indexes: indexes,
    p_public_ids: ids,
  });

  if (error) {
    return { ok: false, data: null, error: parseTrashRpcError(error) };
  }

  // 帖子详情/列表/图库缓存都要失效：删的是帖子里的图，三者都会变。
  invalidateByTags(['boh-cloud', 'boh-cloud-public', 'posts', 'comments', 'notifications']);
  return { ok: true, data, error: null };
}

/**
 * 回收站列表（只列 pending；restored/purged 不进列表）。
 * 返回项已带 daysLeft，UI 不必再算一遍。
 */
export async function listMyTrashedImages({ limit = 240, now = Date.now() } = {}) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 240;

  const { data, error } = await supabase
    .from('boh_cloud_image_trash')
    .select(TRASH_COLUMNS)
    .eq('state', 'pending')
    .order('deleted_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    return { ok: false, data: [], error: normalizeDbError(error) };
  }

  const items = (Array.isArray(data) ? data : []).map((row) => {
    const purgeAfter = String(row.purge_after || '');
    const daysLeft = resolveTrashDaysLeft(purgeAfter, now);
    return {
      id: String(row.id || ''),
      entryId: String(row.entry_id || ''),
      sourcePostId: String(row.source_post_id || ''),
      source: String(row.source || 'manual'),
      imageUrl: String(row.image_url || ''),
      publicId: String(row.public_id || ''),
      entryTitle: String(row.entry_title || ''),
      entryDate: String(row.entry_date || ''),
      deletedAt: String(row.deleted_at || ''),
      purgeAfter,
      daysLeft,
      expired: daysLeft <= 0,
    };
  });

  return { ok: true, data: items, error: null };
}

/** 恢复回收站里的图片（图库 + 原帖同时恢复）。数组可跨条目，RPC 内部按条目分组。 */
export async function restoreCloudImageTrash(trashIds = []) {
  const ids = Array.from(
    new Set(
      (Array.isArray(trashIds) ? trashIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  if (ids.length === 0) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '没有选中可恢复的图片', code: 'INVALID_SELECTION' }),
    };
  }

  const { data, error } = await supabase.rpc('restore_cloud_image_trash', {
    p_trash_ids: ids,
  });

  if (error) {
    return { ok: false, data: null, error: parseTrashRpcError(error) };
  }

  invalidateByTags(['boh-cloud', 'boh-cloud-public', 'posts', 'comments', 'notifications']);
  return { ok: true, data, error: null };
}

/**
 * 永久删除回收站里的图片（2026-11-04 用户口径「回收站也可以选择恢复或永久删除」）。
 *
 * 与恢复的差别：**立即销毁 Cloudinary 资产**，不可撤销。所以走 EF 而不是 RPC ——
 * Cloudinary 的 API secret 只在函数环境里，数据库侧没有也不该有。
 *
 * EF 的「用户点名」模式按 JWT 的 sub 过滤 user_id，越权 id 会被静默忽略
 * （不报「无权限」，避免用它枚举别人回收站里有什么）。
 */
export async function purgeCloudImageTrash(trashIds = []) {
  const ids = Array.from(
    new Set(
      (Array.isArray(trashIds) ? trashIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  if (ids.length === 0) {
    return {
      ok: false,
      data: null,
      error: normalizeDbError({ message: '没有选中可删除的图片', code: 'INVALID_SELECTION' }),
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('purge-cloud-image-trash', {
      body: { ids },
    });

    if (error) throw error;

    // 部分失败时函数返回 207 + ok:false，failed 里带每条的原因 ——
    // 不能只看 HTTP 状态就当全部成功（资产没销毁却把行标 purged 是不可逆的假成功）。
    if (data?.ok === false) {
      const failedCount = Array.isArray(data?.failed) ? data.failed.length : 0;
      return {
        ok: false,
        data,
        error: normalizeDbError({
          message: failedCount
            ? `${failedCount} 张图片没能销毁，请稍后重试`
            : '永久删除失败，请稍后重试',
          code: 'TRASH_PURGE_FAILED',
        }),
      };
    }

    invalidateByTags(['boh-cloud', 'boh-cloud-public', 'posts', 'comments', 'notifications']);
    return { ok: true, data, error: null };
  } catch (error) {
    return { ok: false, data: null, error: normalizeDbError(error, '永久删除失败') };
  }
}
