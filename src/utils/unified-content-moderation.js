import { supabase } from './supabase-client.js';
import { logger } from './logger.js';
import {
  MODERATION_STATUS_APPROVED,
  MODERATION_STATUS_REJECTED,
  normalizeModerationStatus,
  quickKeywordModerate,
  quickModerate,
  moderateWithGLM
} from './content-moderation.js';

export const UNIFIED_APPROVED_STATUS = MODERATION_STATUS_APPROVED;
export const UNIFIED_REJECTED_STATUS = MODERATION_STATUS_REJECTED;

function normalizeReason(result = {}) {
  return String(
    result.reason ||
    result.message ||
    result.reasonCode ||
    result.source ||
    ''
  ).trim();
}

function toModerationResult(result = {}, fallbackStatus = UNIFIED_APPROVED_STATUS) {
  const status = normalizeModerationStatus(result.status, fallbackStatus);
  const reason = normalizeReason(result);
  return {
    ...result,
    status,
    message: String(result.message || reason || (status === UNIFIED_REJECTED_STATUS ? '内容审查未通过' : '通过')),
    reason
  };
}

function isSyntheticModerationSource(source = '') {
  const normalized = String(source || '').trim();
  return normalized === 'no_api_key'
    || normalized === 'test_env_bypass'
    || normalized.startsWith('fallback_');
}

function isPermissionOrRlsError(error) {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const combined = `${message} ${details} ${hint}`;

  if (code === '42501' || code === 'PGRST301') return true;
  return combined.includes('permission denied')
    || combined.includes('row-level security')
    || combined.includes('new row violates row-level security policy');
}

export function isMissingDbColumnError(error, columnName = '') {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const needle = String(columnName || '').trim().toLowerCase();

  if (code === '42703' || code === 'PGRST204') return true;
  if (!needle) return false;
  const text = `${message} ${hint} ${details}`;
  return text.includes(needle) && text.includes('column');
}

export function isMissingDbTableError(error, tableName = '') {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const needle = String(tableName || '').trim().toLowerCase();

  if (code === '42P01') return true;
  if (!needle) return false;
  return `${message} ${hint} ${details}`.includes(needle);
}

export function runKeywordPrecheck(content, { scene = 'default' } = {}) {
  const result = quickKeywordModerate(content, { scene });
  return toModerationResult(result, UNIFIED_APPROVED_STATUS);
}

export async function runSyncStrictModeration(content, {
  scene = 'default',
  timeoutMs
} = {}) {
  const result = await quickModerate(content, { scene, failClosed: true, timeoutMs });
  return toModerationResult(result, UNIFIED_REJECTED_STATUS);
}

export async function runAsyncRelaxedModeration(content, {
  scene = 'default',
  timeoutMs
} = {}) {
  const result = await moderateWithGLM(content, { scene, failClosed: false, timeoutMs });
  return toModerationResult(result, UNIFIED_APPROVED_STATUS);
}

export async function writeModerationAuditLog({
  targetId,
  targetType,
  result,
  moderatorId = null
} = {}) {
  const safeTargetId = String(targetId || '').trim();
  const safeTargetType = String(targetType || '').trim();
  if (!safeTargetId || !safeTargetType) return { ok: false, skipped: true, error: null };

  const normalized = toModerationResult(result, '');
  if (!normalized.status || (normalized.status !== UNIFIED_APPROVED_STATUS && normalized.status !== UNIFIED_REJECTED_STATUS)) {
    return { ok: false, skipped: true, error: null };
  }
  if (isSyntheticModerationSource(normalized.source)) {
    return { ok: false, skipped: true, error: null, reason: 'synthetic_moderation_source' };
  }

  const payload = {
    target_id: safeTargetId,
    target_type: safeTargetType,
    ai_result: normalized.status,
    ai_reason: normalized.reason || null,
    moderator_id: moderatorId || null
  };

  const { error } = await supabase.from('moderation_logs').insert([payload]);
  if (!error) {
    return { ok: true, skipped: false, error: null };
  }

  if (!isPermissionOrRlsError(error)) {
    logger.warn('unified-content-moderation', '写入 moderation_logs 失败（不阻断）', {
      targetId: safeTargetId,
      targetType: safeTargetType,
      status: normalized.status,
      error
    });
    return { ok: false, skipped: false, error };
  }

  const { error: rpcError } = await supabase.rpc('insert_moderation_log', {
    p_target_id: safeTargetId,
    p_target_type: safeTargetType,
    p_ai_result: normalized.status,
    p_ai_reason: normalized.reason || null,
    p_moderator_id: moderatorId || null
  });

  if (rpcError) {
    logger.warn('unified-content-moderation', '写入 moderation_logs 失败（直接写与 RPC 均失败）', {
      targetId: safeTargetId,
      targetType: safeTargetType,
      status: normalized.status,
      directError: error,
      rpcError
    });
    return { ok: false, skipped: false, error: rpcError };
  }

  return { ok: true, skipped: false, error: null, fallback: 'rpc' };
}
