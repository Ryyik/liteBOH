/**
 * 收货地址簿（user_addresses）读写收口
 *
 * 为什么单独一个模块：仓库的分层门禁（check:layering）禁止 UI/视图层直连数据层。
 * 2026-11-02 地址从资产页搬到「购物袋订单区 + 设置页」时，购物袋与结算弹窗各自
 * 要读一次默认地址、结算还要把新填的收件信息写回默认地址 —— 四个直连点会一起
 * 把门禁顶红，也容易再度出现「地址双轨」。
 *
 * 地址双轨的现状（2026-11-02 定）：
 *   · user_addresses = 地址簿，用户在购物袋 / 设置里维护的**唯一真源**；
 *   · profiles.shipping_* = 2026-11-01 之前结算写回的三列，只作**历史回落**，
 *     不再作为主数据（老用户没地址簿时读它，避免结算表单一片空白）。
 * 结算读地址簿优先、profiles 回落，见 views/Shop/index.vue 的 loadShippingProfile。
 */

import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';

/** 地址行里结算/摘要真正用到的列（别 SELECT *，地址表以后加列不必跟着变） */
export const ADDRESS_COLUMNS = 'id, recipient, phone, region, detail, is_default';

/* 地址簿是「本人手填几条」的量级，整表读取比分两次（默认 + 计数）更省也更不容易对不上。
   50 是防御性上限：真有人填到 50 条以上，摘要与计数仍以这 50 条为准。 */
const ADDRESS_LIMIT = 50;

/**
 * 读整本地址簿（默认地址排在最前，其次按创建时间倒序）。
 *
 * @returns {Promise<{ data: object[], error: Error|null }>} 读失败不抛，data 给空数组
 */
export async function fetchMyAddresses(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return { data: [], error: null };
  try {
    const { data, error } = await supabase
      .from('user_addresses')
      .select(ADDRESS_COLUMNS)
      .eq('user_id', uid)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(ADDRESS_LIMIT);
    if (error) return { data: [], error };
    return { data: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    logger.warn('address-api', '读取收货地址簿失败', error);
    return { data: [], error };
  }
}

/**
 * 取「默认地址」；没有默认时退化为最近创建的一条。
 *
 * 为什么不直接 `.eq('is_default', true)`：老数据里可能一条都没标默认（地址簿是后加的），
 * 那时用户明明填过地址却读不到，结算表单又变空白。按 is_default 倒序取第一条，
 * 有默认拿默认，没默认拿最新的 —— 两种情况都符合用户预期。
 *
 * @returns {Promise<{ data: object|null, error: Error|null }>} 读失败不抛，data 给 null
 */
export async function fetchDefaultAddress(userId) {
  const { data, error } = await fetchMyAddresses(userId);
  return { data: data.length ? data[0] : null, error };
}

/**
 * 把结算表单里填的收件信息同步进「已有的默认地址」。
 *
 * 刻意**不新建**地址：结算页不是地址编辑器，用户在这里改一个错别字不该凭空长出一条
 * 新地址（地址簿还得自己去删）。没有默认地址时直接返回 `{ skipped: true }`。
 *
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: Error }>}
 */
export async function syncDefaultAddress({ userId, recipient, phone, region, detail }) {
  const uid = String(userId || '').trim();
  if (!uid) return { ok: false, skipped: true };
  try {
    const { data, error } = await supabase
      .from('user_addresses')
      .select('id')
      .eq('user_id', uid)
      .eq('is_default', true)
      .limit(1);
    if (error) return { ok: false, error };
    const rowId = Array.isArray(data) ? data[0]?.id : null;
    if (!rowId) return { ok: false, skipped: true };

    const patch = {};
    const put = (key, value) => {
      const text = String(value || '').trim();
      if (text) patch[key] = text;
    };
    put('recipient', recipient);
    put('phone', phone);
    put('region', region);
    put('detail', detail);
    // 四个字段都没填就别发 UPDATE（否则会把默认地址整条清空）
    if (!Object.keys(patch).length) return { ok: false, skipped: true };

    const { error: updateError } = await supabase
      .from('user_addresses')
      .update(patch)
      .eq('id', rowId);
    if (updateError) return { ok: false, error: updateError };
    return { ok: true };
  } catch (error) {
    logger.warn('address-api', '同步默认收货地址失败', error);
    return { ok: false, error };
  }
}
