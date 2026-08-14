import { supabase } from '../supabase-client.js';

const normalizeLottery = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const drawAt = value.draw_at || value.drawAt || value.draw_time || value.drawTime || null;
  const drawnAt = value.drawn_at || value.drawnAt || null;
  const winners = Array.isArray(value.winners)
    ? value.winners.map((winner, index) => ({
      position: Number(winner?.position ?? index + 1),
      entry_id: winner?.entry_id || null,
      user_id: winner?.user_id || null,
      username: String(winner?.username || '')
    })).filter((winner) => winner.user_id || winner.username)
    : [];
  return {
    id: String(value.id || ''),
    title: String(value.title || ''),
    description: String(value.description || ''),
    prize_title: String(value.prize_title || ''),
    prize_description: String(value.prize_description || ''),
    cover_image_url: String(value.cover_image_url || ''),
    status: String(value.status || 'open'),
    is_community_visible: value.is_community_visible !== false,
    enforce_account_age_check: value.enforce_account_age_check === true || value.enforce_account_age_check === 'true',
    max_entries: value.max_entries === null || value.max_entries === undefined ? null : Number(value.max_entries),
    winner_count: value.winner_count === null || value.winner_count === undefined ? 1 : Number(value.winner_count),
    entry_count: Number(value.entry_count || 0),
    entry_deadline_at: value.entry_deadline_at || null,
    draw_at: drawAt,
    drawn_at: drawnAt,
    winner_user_id: value.winner_user_id || null,
    winner_username: String(value.winner_username || ''),
    winners,
    current_user_entry_id: value.current_user_entry_id || null,
    current_user_entry_created_at: value.current_user_entry_created_at || null,
    current_user_entry_number: value.current_user_entry_number === null || value.current_user_entry_number === undefined
      ? null
      : Number(value.current_user_entry_number),
    created_at: value.created_at || null,
    updated_at: value.updated_at || null
  };
};

export const getHomeLottery = async () => {
  const { data, error } = await supabase.rpc('get_home_lottery');
  if (error) {
    const fallback = await getHomeLotteryFallback();
    if (fallback.data) {
      return { data: fallback.data, error: null };
    }
    return { data: null, error };
  }
  return { data: normalizeLottery(data), error: null };
};

const getHomeLotteryFallback = async () => {
  try {
    const { data, error } = await supabase
      .from('lotteries')
      .select('id, title, description, prize_title, prize_description, cover_image_url, status, max_entries, winner_count, entry_deadline_at, draw_at, drawn_at, winner_user_id, winner_username, fulfillment_status, created_at, updated_at')
      .eq('is_home_visible', true)
      .in('status', ['open', 'drawn'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { data: null, error: new Error('未找到首页抽奖') };
    return { data: normalizeLottery({ ...data, entry_count: 0 }), error: null };
  } catch (fallbackError) {
    return { data: null, error: fallbackError };
  }
};

export const joinHomeLottery = async (lotteryId) => {
  const safeLotteryId = String(lotteryId || '').trim();
  if (!safeLotteryId) {
    return {
      data: null,
      error: new Error('抽奖 ID 不能为空')
    };
  }

  const { data, error } = await supabase.rpc('join_home_lottery', {
    p_lottery_id: safeLotteryId
  });

  if (error) {
    return { data: null, error };
  }

  return { data, error: null };
};

export const getCommunityLotteries = async () => {
  const { data, error } = await supabase.rpc('get_community_lotteries');
  if (error) {
    const fallback = await getCommunityLotteriesFallback();
    if (fallback.data.length > 0) {
      return { data: fallback.data, error: null };
    }
    return { data: [], error };
  }
  const list = Array.isArray(data) ? data : [];
  return { data: list.map(normalizeLottery).filter(Boolean), error: null };
};

const getCommunityLotteriesFallback = async () => {
  try {
    const { data, error } = await supabase
      .from('lotteries')
      .select('id, title, description, prize_title, prize_description, cover_image_url, status, is_community_visible, enforce_account_age_check, max_entries, winner_count, entry_deadline_at, draw_at, drawn_at, winner_user_id, winner_username, fulfillment_status, created_at, updated_at')
      .eq('is_community_visible', true)
      .in('status', ['open', 'drawn', 'closed'])
      .order('status', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    const items = Array.isArray(data) ? data.filter(Boolean) : [];
    return { data: items.map((item) => normalizeLottery({ ...item, entry_count: 0 })).filter(Boolean), error: null };
  } catch (fallbackError) {
    return { data: [], error: fallbackError };
  }
};

export const joinCommunityLottery = async (lotteryId) => {
  const safeLotteryId = String(lotteryId || '').trim();
  if (!safeLotteryId) {
    return {
      data: null,
      error: new Error('抽奖 ID 不能为空')
    };
  }

  const { data, error } = await supabase.rpc('join_community_lottery', {
    p_lottery_id: safeLotteryId
  });

  if (error) {
    return { data: null, error };
  }

  return { data, error: null };
};
