/**
 * 圣诞交换礼物（/xmas）读写层。
 *
 * 真相源是 DB 三表 + 六个 SECURITY DEFINER 函数（见
 * supabase/migrations/2026112302_xmas_exchange.sql），页面与管理台共用本模块，
 * 不各自拼 rpc 调用 —— 否则「页面能报名、后台却看不到」这类口径问题会各写一套。
 *
 * 两条硬口径：
 *   · 揭晓前**不请求**对方身份：xmas_my_result 在 reveal_at 之前只返回时间，
 *     前端也没有第二条能拿到配对的接口（matches 表没有 select 策略）。
 *   · 后端还没部署时返回 `notReady: true`，页面回退到内置演示名单而不是白屏；
 *     管理台则直接提示「先应用迁移」，不假装保存成功。
 */
import { supabase } from '../supabase-client.js';

export const XMAS_SLUG = 'christmas-2026';

/** 表还没建时页面用的兜底时间窗。与迁移里的首次建行参数保持一致。 */
export const XMAS_EVENT_FALLBACK = Object.freeze({
  slug: XMAS_SLUG,
  title: '圣诞交换礼物',
  revealAt: '2026-12-20T20:00:00+08:00',
  signupDeadline: '2026-12-20T19:30:00+08:00',
  capacity: 20,
  status: 'open',
  isVisible: true,
});

export const XMAS_STATUS_LABELS = {
  draft: '未上线',
  open: '报名中',
  closed: '已截止',
  revealed: '已揭晓',
};

/** 后端没部署（函数不存在）与真实业务失败必须区分开：前者要回退，后者要报错。 */
export function isXmasBackendMissing(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return (
    code === '42883' ||
    code === 'PGRST202' ||
    code === '42P01' ||
    /could not find the function|does not exist|schema cache/i.test(message)
  );
}

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return { ...XMAS_EVENT_FALLBACK };
  const status = String(raw.status || '').trim();
  return {
    slug: String(raw.slug || XMAS_SLUG),
    title: String(raw.title || XMAS_EVENT_FALLBACK.title),
    revealAt: raw.reveal_at || XMAS_EVENT_FALLBACK.revealAt,
    signupDeadline: raw.signup_deadline || XMAS_EVENT_FALLBACK.signupDeadline,
    capacity: num(raw.capacity, XMAS_EVENT_FALLBACK.capacity),
    status: ['draft', 'open', 'closed', 'revealed'].includes(status) ? status : 'draft',
    isVisible: raw.is_visible === true,
    santaUserId: raw.santa_user_id || null,
    revealedAt: raw.revealed_at || null,
    updatedAt: raw.updated_at || null,
  };
}

function normalizeParticipants(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => ({
    userId: String(item?.user_id || ''),
    slot: num(item?.slot, index),
    status: item?.status === 'left' ? 'left' : 'joined',
    name: String(item?.name || '朋友'),
    avatarUrl: item?.avatar_url || '',
    frameUrl: item?.frame_url || '',
    joinedAt: item?.joined_at || null,
    leftAt: item?.left_at || null,
  }));
}

/** 页面首屏：名单 + 时间窗 + 我是否已参与，一次拿到。 */
export async function fetchXmasRoster(slug = XMAS_SLUG) {
  const { data, error } = await supabase.rpc('xmas_roster', { p_slug: slug });
  if (error) {
    return { ok: false, notReady: isXmasBackendMissing(error), error };
  }
  if (!data || data.ok !== true) {
    return {
      ok: false,
      notReady: false,
      code: data?.code || 'ROSTER_FAILED',
      message: data?.message || '读取活动失败',
    };
  }
  const participants = normalizeParticipants(data.participants);
  return {
    ok: true,
    event: normalizeEvent(data.event),
    participants,
    joinedCount: num(data.joined_count, participants.length),
    slotCount: num(data.slot_count, participants.length),
    me: data.me && data.me.joined === true ? { joined: true, slot: num(data.me.slot, 0) } : null,
  };
}

export async function joinXmas(slug = XMAS_SLUG) {
  const { data, error } = await supabase.rpc('xmas_join', { p_slug: slug });
  if (error) return { ok: false, notReady: isXmasBackendMissing(error), error };
  return {
    ok: data?.ok === true,
    code: data?.code || '',
    message: data?.message || '',
    slot: data?.slot ?? null,
    joinedCount: data?.joined_count ?? null,
    notReady: false,
  };
}

export async function leaveXmas(slug = XMAS_SLUG) {
  const { data, error } = await supabase.rpc('xmas_leave', { p_slug: slug });
  if (error) return { ok: false, notReady: isXmasBackendMissing(error), error };
  return {
    ok: data?.ok === true,
    code: data?.code || '',
    message: data?.message || '',
    notReady: false,
  };
}

export async function fetchXmasMyResult(slug = XMAS_SLUG) {
  const { data, error } = await supabase.rpc('xmas_my_result', { p_slug: slug });
  if (error) return { ok: false, notReady: isXmasBackendMissing(error), error };
  if (!data || data.ok !== true) {
    return { ok: false, notReady: false, code: data?.code || 'RESULT_FAILED' };
  }
  return {
    ok: true,
    revealed: data.revealed === true,
    code: data.code || '',
    message: data.message || '',
    revealAt: data.reveal_at || null,
    partner: data.partner
      ? {
          userId: String(data.partner.user_id || ''),
          username: String(data.partner.username || '朋友'),
          avatarUrl: data.partner.avatar_url || '',
          frameUrl: data.partner.frame_url || '',
        }
      : null,
  };
}

// ── 管理台 ────────────────────────────────────────────────────────────────────

export async function fetchXmasAdminOverview(slug = XMAS_SLUG) {
  const { data, error } = await supabase.rpc('xmas_admin_overview', { p_slug: slug });
  if (error) return { ok: false, notReady: isXmasBackendMissing(error), error };
  if (!data || data.ok !== true) {
    return {
      ok: false,
      notReady: false,
      code: data?.code || 'FORBIDDEN',
      message: data?.message || '没有权限',
    };
  }
  return {
    ok: true,
    exists: data.exists === true,
    slug: data.slug || slug,
    event: data.exists === true ? normalizeEvent(data.event) : null,
    participants: normalizeParticipants(data.participants),
    matches: Array.isArray(data.matches)
      ? data.matches.map((row) => ({
          aUserId: String(row?.a_user_id || ''),
          aName: String(row?.a_name || '朋友'),
          bUserId: row?.b_user_id ? String(row.b_user_id) : null,
          bName: String(row?.b_name || '朋友'),
          santa: row?.santa === true,
        }))
      : [],
  };
}

export async function saveXmasEvent(payload, slug = XMAS_SLUG) {
  const { data, error } = await supabase.rpc('xmas_admin_save_event', {
    p_slug: slug,
    p_title: payload.title || '圣诞交换礼物',
    p_reveal_at: payload.revealAt,
    p_signup_deadline: payload.signupDeadline,
    p_capacity: payload.capacity,
    p_status: payload.status,
    p_is_visible: payload.isVisible === true,
    p_santa_user_id: payload.santaUserId || null,
  });
  if (error) return { ok: false, notReady: isXmasBackendMissing(error), error };
  return { ok: data?.ok === true, code: data?.code || '', message: data?.message || '' };
}

export async function drawXmas(force = false, slug = XMAS_SLUG) {
  const { data, error } = await supabase.rpc('xmas_admin_draw', {
    p_slug: slug,
    p_force: force === true,
  });
  if (error) return { ok: false, notReady: isXmasBackendMissing(error), error };
  return {
    ok: data?.ok === true,
    code: data?.code || '',
    message: data?.message || '',
    pairs: data?.pairs ?? 0,
  };
}

export async function resetXmasMatches(slug = XMAS_SLUG) {
  const { data, error } = await supabase.rpc('xmas_admin_reset_matches', { p_slug: slug });
  if (error) return { ok: false, notReady: isXmasBackendMissing(error), error };
  return { ok: data?.ok === true, code: data?.code || '', message: data?.message || '' };
}

export async function removeXmasParticipant(userId, reason = '', slug = XMAS_SLUG) {
  const { data, error } = await supabase.rpc('xmas_admin_remove_participant', {
    p_slug: slug,
    p_user_id: userId,
    p_reason: reason || null,
  });
  if (error) return { ok: false, notReady: isXmasBackendMissing(error), error };
  return { ok: data?.ok === true, code: data?.code || '', message: data?.message || '' };
}

// ── 时间字段工具 ──────────────────────────────────────────────────────────────

/** timestamptz → `<input type="datetime-local">` 的本地值（YYYY-MM-DDTHH:mm） */
export function toLocalInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** datetime-local 的值是「本地时间不带时区」，必须显式转成 ISO 再入库 */
export function fromLocalInputValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
