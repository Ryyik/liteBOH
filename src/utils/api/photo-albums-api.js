/**
 * 摄影集数据访问层
 *
 * 表：photo_albums / photo_album_photos / photo_album_pages / photo_album_exports
 * RLS：本人全权；公众只读 published+shared；管理员全权（见迁移 2026092701）。
 */

import { supabase } from '../supabase-client.js';
import { normalizeDbError } from '../request-core.js';
import { logger } from '../logger.js';

const ALBUM_COLUMNS = 'id, user_id, title, subtitle, cover_url, status, shared_to_community, photo_count, created_at, updated_at';
const PHOTO_COLUMNS = 'id, album_id, user_id, cloudinary_url, public_id, width, height, ratio, caption, sort_order, moderation_status, moderation_score, moderation_source, created_at';
const PAGE_COLUMNS = 'id, album_id, page_index, page_type, layout_id, chapter_title, note, photo_refs, created_at, updated_at';

function normalizeAlbum(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title || '未命名影集',
    subtitle: row.subtitle || '',
    coverUrl: row.cover_url || '',
    status: row.status || 'draft',
    sharedToCommunity: row.shared_to_community === true,
    photoCount: Number(row.photo_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizePhoto(row, index) {
  if (!row) return null;
  return {
    id: row.id,
    albumId: row.album_id,
    userId: row.user_id,
    url: row.cloudinary_url,
    publicId: row.public_id || '',
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    ratio: row.ratio || 'landscape',
    caption: row.caption || '',
    sortOrder: Number.isFinite(row.sort_order) ? Number(row.sort_order) : index,
    moderationStatus: row.moderation_status || 'approved',
    moderationScore: Number(row.moderation_score || 0),
    moderationSource: row.moderation_source || 'auto',
    createdAt: row.created_at
  };
}

function normalizePage(row) {
  if (!row) return null;
  return {
    id: row.id,
    albumId: row.album_id,
    pageIndex: Number(row.page_index || 0),
    pageType: row.page_type || 'content',
    layoutId: row.layout_id || 'full',
    chapterTitle: row.chapter_title || '',
    note: row.note || '',
    photoRefs: Array.isArray(row.photo_refs) ? row.photo_refs.map(String) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function normalizeAlbumBundle(albumRow, photoRows, pageRows) {
  return {
    album: normalizeAlbum(albumRow),
    photos: (photoRows || []).map(normalizePhoto).filter(Boolean),
    pages: (pageRows || []).map(normalizePage).filter(Boolean).sort((a, b) => a.pageIndex - b.pageIndex)
  };
}

/**
 * 我的影集列表（个人空间入口）
 */
export async function listMyAlbums() {
  try {
    const { data, error } = await supabase
      .from('photo_albums')
      .select(ALBUM_COLUMNS)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return { ok: true, data: (data || []).map(normalizeAlbum).filter(Boolean), error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '读取影集列表失败', error);
    return { ok: false, data: [], error: normalizeDbError(error, '读取影集列表失败') };
  }
}

/**
 * 新建影集
 */
export async function createAlbum({ title, subtitle = '', coverUrl = '' } = {}) {
  try {
    const payload = {
      title: String(title || '').trim().slice(0, 80) || '未命名影集',
      subtitle: String(subtitle || '').trim().slice(0, 120),
      cover_url: String(coverUrl || '').trim()
    };
    const { data, error } = await supabase
      .from('photo_albums')
      .insert(payload)
      .select(ALBUM_COLUMNS)
      .single();
    if (error) throw error;
    return { ok: true, data: normalizeAlbum(data), error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '新建影集失败', error);
    return { ok: false, data: null, error: normalizeDbError(error, '新建影集失败') };
  }
}

async function fetchPhotos(albumId) {
  const { data, error } = await supabase
    .from('photo_album_photos')
    .select(PHOTO_COLUMNS)
    .eq('album_id', albumId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchPages(albumId) {
  const { data, error } = await supabase
    .from('photo_album_pages')
    .select(PAGE_COLUMNS)
    .eq('album_id', albumId)
    .order('page_index', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * 读取完整影集（编辑器用，本人）
 */
export async function getMyAlbum(albumId) {
  try {
    const { data: albumRow, error: albumError } = await supabase
      .from('photo_albums')
      .select(ALBUM_COLUMNS)
      .eq('id', albumId)
      .maybeSingle();
    if (albumError) throw albumError;
    if (!albumRow) throw normalizeDbError({ message: '影集不存在' }, '影集不存在');

    const [photoRows, pageRows] = await Promise.all([fetchPhotos(albumId), fetchPages(albumId)]);
    return { ok: true, data: normalizeAlbumBundle(albumRow, photoRows, pageRows), error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '读取影集失败', error);
    return { ok: false, data: null, error: normalizeDbError(error, '读取影集失败') };
  }
}

/**
 * 读取公开影集（阅读页；RLS 保证仅 published+shared 或本人可见）
 */
export async function getPublicAlbum(albumId) {
  return getMyAlbum(albumId);
}

/**
 * 更新影集基础信息（标题/副标题/封面/状态/分享开关）
 */
export async function updateAlbum(albumId, patch = {}) {
  try {
    const payload = {};
    if (patch.title !== undefined) payload.title = String(patch.title || '').trim().slice(0, 80) || '未命名影集';
    if (patch.subtitle !== undefined) payload.subtitle = String(patch.subtitle || '').trim().slice(0, 120);
    if (patch.coverUrl !== undefined) payload.cover_url = String(patch.coverUrl || '').trim();
    if (patch.status !== undefined) payload.status = patch.status === 'published' ? 'published' : 'draft';
    if (patch.sharedToCommunity !== undefined) payload.shared_to_community = patch.sharedToCommunity === true;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('photo_albums')
      .update(payload)
      .eq('id', albumId)
      .select(ALBUM_COLUMNS)
      .single();
    if (error) throw error;
    return { ok: true, data: normalizeAlbum(data), error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '更新影集失败', error);
    return { ok: false, data: null, error: normalizeDbError(error, '更新影集失败') };
  }
}

/**
 * 删除影集（照片/页面/导出台账级联）
 */
export async function deleteAlbum(albumId) {
  try {
    const { error } = await supabase
      .from('photo_albums')
      .delete()
      .eq('id', albumId);
    if (error) throw error;
    return { ok: true, error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '删除影集失败', error);
    return { ok: false, error: normalizeDbError(error, '删除影集失败') };
  }
}

async function syncPhotoCount(albumId) {
  const { count, error } = await supabase
    .from('photo_album_photos')
    .select('id', { count: 'exact', head: true })
    .eq('album_id', albumId);
  if (error) throw error;
  const { error: updateError } = await supabase
    .from('photo_albums')
    .update({ photo_count: Number(count || 0), updated_at: new Date().toISOString() })
    .eq('id', albumId);
  if (updateError) throw updateError;
  return Number(count || 0);
}

/**
 * 批量添加照片（上传完成后调用）
 * @param {Array<{url:string, publicId?:string, width:number, height:number, ratio:string, moderationStatus?:string, moderationScore?:number, moderationSource?:string}>} photos
 */
export async function addAlbumPhotos(albumId, photos = []) {
  try {
    const rows = (photos || []).map((photo, index) => ({
      album_id: albumId,
      cloudinary_url: String(photo.url || '').trim(),
      public_id: String(photo.publicId || '').trim(),
      width: Number(photo.width || 0),
      height: Number(photo.height || 0),
      ratio: ['landscape', 'portrait', 'square'].includes(photo.ratio) ? photo.ratio : 'landscape',
      sort_order: index,
      moderation_status: ['approved', 'rejected', 'pending', 'reviewing'].includes(photo.moderationStatus)
        ? photo.moderationStatus
        : 'approved',
      moderation_score: Number(photo.moderationScore || 0),
      moderation_source: String(photo.moderationSource || 'auto').slice(0, 20)
    }));
    if (!rows.length) return { ok: true, data: [], error: null };

    const { data, error } = await supabase
      .from('photo_album_photos')
      .insert(rows)
      .select(PHOTO_COLUMNS);
    if (error) throw error;
    await syncPhotoCount(albumId);
    return { ok: true, data: (data || []).map(normalizePhoto).filter(Boolean), error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '添加照片失败', error);
    return { ok: false, data: [], error: normalizeDbError(error, '添加照片失败') };
  }
}

/**
 * 删除单张照片
 */
export async function deleteAlbumPhoto(albumId, photoId) {
  try {
    const { error } = await supabase
      .from('photo_album_photos')
      .delete()
      .eq('id', photoId)
      .eq('album_id', albumId);
    if (error) throw error;
    await syncPhotoCount(albumId);
    return { ok: true, error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '删除照片失败', error);
    return { ok: false, error: normalizeDbError(error, '删除照片失败') };
  }
}

/**
 * 更新照片配文
 */
export async function updatePhotoCaption(photoId, caption) {
  try {
    const { error } = await supabase
      .from('photo_album_photos')
      .update({ caption: String(caption || '').slice(0, 300) })
      .eq('id', photoId);
    if (error) throw error;
    return { ok: true, error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '更新配文失败', error);
    return { ok: false, error: normalizeDbError(error, '更新配文失败') };
  }
}

/**
 * 整体保存页面流（编辑器保存：先清后写，页数有限可接受）
 * @param {Array<{pageType:string, layoutId:string, chapterTitle:string, note:string, photoRefs:string[]}>} pages
 */
export async function saveAlbumPages(albumId, pages = []) {
  try {
    const deleteResult = await supabase
      .from('photo_album_pages')
      .delete()
      .eq('album_id', albumId);
    if (deleteResult.error) throw deleteResult.error;

    const rows = (pages || []).map((page, index) => ({
      album_id: albumId,
      page_index: index,
      page_type: ['cover', 'chapter', 'content', 'end'].includes(page.pageType) ? page.pageType : 'content',
      layout_id: String(page.layoutId || 'full').slice(0, 32),
      chapter_title: String(page.chapterTitle || '').slice(0, 80),
      note: String(page.note || '').slice(0, 500),
      photo_refs: Array.isArray(page.photoRefs) ? page.photoRefs.map(String) : []
    }));
    if (rows.length) {
      const insertResult = await supabase
        .from('photo_album_pages')
        .insert(rows);
      if (insertResult.error) throw insertResult.error;
    }

    const { error: touchError } = await supabase
      .from('photo_albums')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', albumId);
    if (touchError) throw touchError;
    return { ok: true, error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '保存页面流失败', error);
    return { ok: false, error: normalizeDbError(error, '保存页面流失败') };
  }
}

/**
 * 社区影集区列表（公开）
 */
export async function listCommunityAlbums({ limit = 24, offset = 0 } = {}) {
  try {
    let query = supabase
      .from('photo_albums')
      .select(`${ALBUM_COLUMNS}, profile:user_id(username, avatar_url)`)
      .eq('status', 'published')
      .eq('shared_to_community', true)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    const { data, error } = await query;
    if (error) throw error;
    const albums = (data || []).map((row) => ({
      ...normalizeAlbum(row),
      authorName: row?.profile?.username || '',
      authorAvatar: row?.profile?.avatar_url || ''
    }));
    return { ok: true, data: albums, error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '读取社区影集失败', error);
    return { ok: false, data: [], error: normalizeDbError(error, '读取社区影集失败') };
  }
}

/**
 * 记录一次导出（月度配额判定依据）
 */
export async function logAlbumExport(albumId, kind = 'single') {
  try {
    const { error } = await supabase
      .from('photo_album_exports')
      .insert({ album_id: albumId, kind: kind === 'zip' ? 'zip' : 'single' });
    if (error) throw error;
    return { ok: true, error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '记录导出失败', error);
    return { ok: false, error: normalizeDbError(error, '记录导出失败') };
  }
}

/**
 * 本月已导出次数
 */
export async function countMyExportsThisMonth() {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { count, error } = await supabase
      .from('photo_album_exports')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart.toISOString());
    if (error) throw error;
    return { ok: true, data: Number(count || 0), error: null };
  } catch (error) {
    logger.warn('photo-albums-api', '读取导出次数失败', error);
    return { ok: false, data: 0, error: normalizeDbError(error) };
  }
}
