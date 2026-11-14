/**
 * boh-ai-knowledge-admin-api.js — 管理员知识库单条变更（2026-11-12 新增）
 *
 * 只做「调 EF」这一件事：不解析、不判断权限、不弹窗。
 * 权限真源在 EF（`isRequestAdmin` 查 profiles.role）—— 前端的 `isAdmin` 只是 UI 开关，
 * 别在这里再加一层「本地判断就返回成功」的假实现。
 *
 * ⚠️ 三个动作都不做物理删除：`archive` 只把 `status` 置为 `archived`（可回滚）。
 */
import { supabase } from '@/utils/supabase-client.js';

/**
 * 从失败响应里挖出**真正的原因**。
 *
 * `functions.invoke` 在非 2xx 时只会给一句固定的
 * `Edge Function returned a non-2xx status code`（见 @supabase/functions-js 的
 * FunctionsHttpError），而 EF 实际回了 `{ ok: false, message: 'find text is ambiguous (2 matches)' }`
 * —— 正文挂在 `error.context`（一个 Response）上。不读它，管理员永远只看到那句通用话。
 */
const readErrorMessage = async (error) => {
  const response = error?.context;
  try {
    if (response && typeof response.clone === 'function') {
      const payload = await response.clone().json();
      const message = String(payload?.message || payload?.error || '').trim();
      if (message) return message;
    }
  } catch {
    // 响应体不是 JSON（网关错误页 / 空 body）—— 落到通用文案
  }
  return String(error?.message || '').trim() || '知识库变更请求失败';
};

const invokeKnowledgeWrite = async (body) => {
  const { data, error } = await supabase.functions.invoke('boh-ai-retrieval', { body });
  if (error) {
    const message = await readErrorMessage(error);
    return { ok: false, error: { message }, message };
  }
  const payload = data && typeof data === 'object' ? data : {};
  if (payload.ok === false) {
    return {
      ok: false,
      error: { message: payload.message || '知识库变更失败' },
      message: payload.message || '知识库变更失败',
    };
  }
  return { ok: true, error: null, data: payload.data || {} };
};

/**
 * 新增 / 改写一条知识切片。
 * @param {{ id?: string, sourceType?: string, sourceId?: string, title?: string, content: string, metadata?: object }} params
 */
export const upsertKnowledgeChunk = async ({
  id = '',
  sourceType = '',
  sourceId = '',
  title = '',
  content = '',
  metadata = null,
} = {}) =>
  invokeKnowledgeWrite({
    action: 'upsert_chunk',
    ...(id ? { id } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(sourceId ? { sourceId } : {}),
    title,
    content,
    ...(metadata ? { metadata } : {}),
  });

/**
 * 下架（软删）一条知识切片。可回滚：把 `status` 改回 `active` 即可。
 * @param {{ id: string }} params
 */
export const archiveKnowledgeChunk = async ({ id = '' } = {}) =>
  invokeKnowledgeWrite({ action: 'archive_chunk', id });

/**
 * 局部改写一条知识切片：把 `find` 换成 `replace`（`replace` 传空串＝删掉这一段）。
 *
 * ⚠️ `find` 必须在正文里**恰好出现一次**，否则 EF 返回 400（出现多次时可用 `allowMultiple`）。
 * 这是刻意的：改错一个数字很难被发现，让调用方被迫给出无歧义的锚点。
 * 要改整段语义（而不是某几个字）就走 `upsertKnowledgeChunk`。
 *
 * @param {{ id: string, find: string, replace: string, allowMultiple?: boolean }} params
 */
export const editKnowledgeChunk = async ({
  id = '',
  find = '',
  replace = '',
  allowMultiple = false,
} = {}) =>
  invokeKnowledgeWrite({
    action: 'edit_chunk',
    id,
    find,
    replace,
    ...(allowMultiple ? { allowMultiple: true } : {}),
  });
