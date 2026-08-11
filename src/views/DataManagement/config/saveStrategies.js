import { stripHtml, UUID_REGEX, EMAIL_REGEX, normalizeNewsContent } from '../composables/useDataAdminValidation.js';
import { getDefaultApiUrlForBohaiProvider } from '@/utils/api/bohai-model-config-api.js';
import { TAB_WRITABLE_FIELDS } from './index.js';

function toDateInputValue(dateValue) {
  if (!dateValue) return '';
  const raw = String(dateValue).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

function toISOStringFromInput(dateInput) {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function pickWritableFields(tabKey, payload) {
  const allowList = TAB_WRITABLE_FIELDS[tabKey] || [];
  const next = {};
  allowList.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
      next[key] = payload[key];
    }
  });
  return next;
}

export const SAVE_STRATEGIES = {
  users: async ({ editingItem }) => {
    const dataToSave = pickWritableFields('users', { ...editingItem });

    if (dataToSave.points !== undefined && dataToSave.points !== null && dataToSave.points !== '') {
      const normalizedPoints = Number(dataToSave.points);
      if (!Number.isFinite(normalizedPoints) || normalizedPoints < 0) {
        throw new Error('积分必须是大于等于 0 的数字');
      }
      dataToSave.points = Math.round(normalizedPoints);
    }

    if (dataToSave.experience !== undefined && dataToSave.experience !== null && dataToSave.experience !== '') {
      const normalizedExperience = Number(dataToSave.experience);
      if (!Number.isFinite(normalizedExperience) || normalizedExperience < 0) {
        throw new Error('经验值必须是大于等于 0 的数字');
      }
      dataToSave.experience = Math.round(normalizedExperience);
    }

    if (dataToSave.join_date) {
      dataToSave.join_date = toDateInputValue(dataToSave.join_date);
    }

    if (dataToSave.email !== undefined) {
      const email = String(dataToSave.email || '').trim();
      if (email && !EMAIL_REGEX.test(email)) {
        throw new Error('邮箱格式不正确');
      }
      dataToSave.email = email || null;
    }

    return dataToSave;
  },

  points: async ({ editingItem }) => {
    const dataToSave = pickWritableFields('points', { ...editingItem });

    if (dataToSave.points !== undefined && dataToSave.points !== null && dataToSave.points !== '') {
      const normalizedPoints = Number(dataToSave.points);
      if (!Number.isFinite(normalizedPoints) || normalizedPoints < 0) {
        throw new Error('积分必须是大于等于 0 的数字');
      }
      dataToSave.points = Math.round(normalizedPoints);
    }

    if (dataToSave.experience !== undefined && dataToSave.experience !== null && dataToSave.experience !== '') {
      const normalizedExperience = Number(dataToSave.experience);
      if (!Number.isFinite(normalizedExperience) || normalizedExperience < 0) {
        throw new Error('经验值必须是大于等于 0 的数字');
      }
      dataToSave.experience = Math.round(normalizedExperience);
    }

    if (dataToSave.join_date) {
      dataToSave.join_date = toDateInputValue(dataToSave.join_date);
    }

    return dataToSave;
  },

  forum: async ({ editingItem }) => {
    const forumTitle = String(editingItem.title || '').trim();
    const forumBody = String(editingItem.content || '').trim();
    const normalizedAuthorId = String(editingItem.author_id || '').trim();
    const normalizedAuthorUsername = String(editingItem.author_username || '').trim();
    const normalizedStatus = String(editingItem.status || 'approved').trim() || 'approved';

    if (!forumTitle) throw new Error('帖子标题不能为空');
    if (!forumBody) throw new Error('帖子正文不能为空');
    if (normalizedAuthorId && !UUID_REGEX.test(normalizedAuthorId)) throw new Error('作者 ID 必须是 UUID');

    const finalForumContent = `\u3010${forumTitle}\u3011\n${forumBody}`;
    return pickWritableFields('forum', {
      content: finalForumContent,
      author_id: normalizedAuthorId || null,
      author_username: normalizedAuthorUsername || null,
      status: normalizedStatus,
      updated_at: new Date().toISOString()
    });
  },

  subscriptions: async ({ editingItem }) => {
    const normalizedUserId = String(editingItem.user_id || '').trim();
    const normalizedPlanCode = String(editingItem.plan_code || '').trim();
    const normalizedPlanName = String(editingItem.plan_name || '').trim();
    const normalizedBillingCycle = String(editingItem.billing_cycle || '').trim();
    const normalizedStatus = String(editingItem.status || '').trim();
    const normalizedPointsCost = Number(editingItem.points_cost);
    const normalizedDurationMonths = Number(editingItem.duration_months);
    const startedAtIso = toISOStringFromInput(editingItem.started_at);
    const expiresAtIso = toISOStringFromInput(editingItem.expires_at);

    if (!normalizedUserId || !UUID_REGEX.test(normalizedUserId)) throw new Error('请先选择有效用户');
    if (!normalizedPlanCode || !normalizedPlanName) throw new Error('订阅内容不能为空');
    if (!Number.isFinite(normalizedPointsCost) || normalizedPointsCost < 0) throw new Error('积分成本必须是大于等于 0 的数字');
    if (!Number.isInteger(normalizedDurationMonths) || normalizedDurationMonths <= 0 || normalizedDurationMonths > 120) throw new Error('订阅月数必须是 1-120 之间的整数');
    if (!startedAtIso) throw new Error('订阅时间无效');
    if (!expiresAtIso) throw new Error('到期时间无效');
    if (Date.parse(expiresAtIso) <= Date.parse(startedAtIso)) throw new Error('到期时间必须晚于订阅时间');

    return pickWritableFields('subscriptions', {
      user_id: normalizedUserId,
      plan_code: normalizedPlanCode,
      plan_name: normalizedPlanName,
      billing_cycle: normalizedBillingCycle,
      points_cost: Math.round(normalizedPointsCost),
      duration_months: normalizedDurationMonths,
      started_at: startedAtIso,
      expires_at: expiresAtIso,
      status: normalizedStatus,
      metadata: editingItem.metadata || {},
      updated_at: new Date().toISOString()
    });
  },

  coreMemories: async ({ editingItem, userId }) => {
    const normalizedTitle = String(editingItem.title || '').trim();
    const normalizedContent = String(editingItem.content || '').trim();
    const normalizedCategory = String(editingItem.category || 'general').trim() || 'general';
    const normalizedStatus = String(editingItem.status || 'active').trim() || 'active';
    const normalizedPriority = Number(editingItem.priority);
    const normalizedTags = Array.isArray(editingItem.tags)
      ? editingItem.tags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 30)
      : [];

    if (!normalizedTitle) throw new Error('标题不能为空');
    if (!normalizedContent) throw new Error('官方事实内容不能为空');
    if (!Number.isFinite(normalizedPriority) || normalizedPriority < 0 || normalizedPriority > 100) {
      throw new Error('优先级必须是 0-100 之间的数字');
    }

    return pickWritableFields('coreMemories', {
      title: normalizedTitle,
      content: normalizedContent,
      category: normalizedCategory,
      tags: normalizedTags,
      priority: Math.round(normalizedPriority),
      source_label: String(editingItem.source_label || 'BOH 官方').trim() || 'BOH 官方',
      source_url: String(editingItem.source_url || '').trim(),
      status: normalizedStatus,
      updated_by: userId || null
    });
  },

  bohaiModels: async ({ editingItem, userId, isEditing }) => {
    const normalizedModeId = String(editingItem.mode_id || '').trim();
    const normalizedDisplayName = String(editingItem.display_name || '').trim();
    const normalizedProvider = String(editingItem.provider || 'siliconflow').trim().toLowerCase();
    const normalizedModelId = String(editingItem.model_id || '').trim();
    const normalizedCapability = String(editingItem.capability || 'chat').trim().toLowerCase();
    const normalizedStatus = String(editingItem.status || 'active').trim().toLowerCase();
    const normalizedIcon = String(editingItem.icon || 'sparkles').trim() || 'sparkles';
    const normalizedMinTier = String(editingItem.min_tier || 'free').trim().toLowerCase();
    const normalizedTemperature = Number(editingItem.temperature);
    const normalizedTopP = Number(editingItem.top_p);
    const normalizedFrequencyPenalty = Number(editingItem.frequency_penalty);
    const normalizedMaxTokens = Number(editingItem.max_tokens);
    const normalizedQuotaMultiplier = Number(editingItem.quota_multiplier ?? 1);
    const normalizedSortOrder = Number(editingItem.sort_order);

    if (!normalizedModeId || !/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(normalizedModeId)) {
      throw new Error('模式 ID 只能包含字母、数字、横线或下划线，长度 2-64');
    }
    if (!normalizedDisplayName) throw new Error('显示名称不能为空');
    if (!['siliconflow', 'zhipu', 'openrouter', 'custom'].includes(normalizedProvider)) throw new Error('供应商必须是 siliconflow / zhipu / openrouter / custom');
    if (!normalizedModelId) throw new Error('模型 ID 不能为空');
    if (!['chat', 'multimodal', 'plan', 'agent'].includes(normalizedCapability)) throw new Error('能力类型无效');
    if (!['active', 'disabled'].includes(normalizedStatus)) throw new Error('状态必须是 active 或 disabled');
    const allowedMinTiers = new Set(['guest', 'free', 'plus', 'pro', 'max', 'ultra', 'coding-lite', 'coding-plus', 'coding-pro', 'coding-ultra']);
    if (!allowedMinTiers.has(normalizedMinTier)) throw new Error('最低订阅档位无效');
    if (!Number.isFinite(normalizedTemperature) || normalizedTemperature < 0 || normalizedTemperature > 1.2) throw new Error('Temperature 必须在 0-1.2 之间');
    if (!Number.isFinite(normalizedTopP) || normalizedTopP < 0.1 || normalizedTopP > 1) throw new Error('Top P 必须在 0.1-1 之间');
    if (!Number.isFinite(normalizedFrequencyPenalty) || normalizedFrequencyPenalty < 0 || normalizedFrequencyPenalty > 2) throw new Error('Frequency Penalty 必须在 0-2 之间');
    if (!Number.isInteger(normalizedMaxTokens) || normalizedMaxTokens < 256 || normalizedMaxTokens > 4096) throw new Error('最大输出 tokens 必须是 256-4096 的整数');
    if (!Number.isFinite(normalizedQuotaMultiplier) || normalizedQuotaMultiplier < 0.1 || normalizedQuotaMultiplier > 100) throw new Error('额度倍率必须在 0.1-100 之间');
    if (!Number.isInteger(normalizedSortOrder) || normalizedSortOrder < 0 || normalizedSortOrder > 10000) throw new Error('显示排序必须是 0-10000 的整数');

    return pickWritableFields('bohaiModels', {
      mode_id: normalizedModeId,
      display_name: normalizedDisplayName,
      tagline: String(editingItem.tagline || '').trim(),
      description: String(editingItem.description || '').trim(),
      provider: normalizedProvider,
      provider_label: String(editingItem.provider_label || '').trim() || normalizedProvider,
      model_id: normalizedModelId,
      api_url: String(editingItem.api_url || '').trim() || getDefaultApiUrlForBohaiProvider(normalizedProvider),
      capability: normalizedCapability,
      icon: normalizedIcon,
      temperature: normalizedTemperature,
      top_p: normalizedTopP,
      frequency_penalty: normalizedFrequencyPenalty,
      max_tokens: normalizedMaxTokens,
      quota_multiplier: normalizedQuotaMultiplier,
      min_tier: normalizedMinTier,
      sort_order: normalizedSortOrder,
      status: normalizedStatus,
      notes: String(editingItem.notes || '').trim(),
      created_by: isEditing ? undefined : (userId || null),
      updated_by: userId || null
    });
  },

  lotteries: async ({ editingItem, userId, isEditing }) => {
    const normalizedTitle = String(editingItem.title || '').trim();
    const normalizedPrizeTitle = String(editingItem.prize_title || '').trim();
    const normalizedStatus = String(editingItem.status || 'open').trim() || 'open';
    const normalizedFulfillmentStatus = String(editingItem.fulfillment_status || 'pending_contact').trim() || 'pending_contact';
    const normalizedCommunityVisible = editingItem.is_community_visible !== false && editingItem.is_community_visible !== 'false';
    const rawMaxEntries = editingItem.max_entries;
    const hasMaxEntries = rawMaxEntries !== null && rawMaxEntries !== undefined && rawMaxEntries !== '';
    const normalizedMaxEntries = hasMaxEntries ? Number(rawMaxEntries) : null;
    const rawWinnerCount = editingItem.winner_count;
    const normalizedWinnerCount = rawWinnerCount === null || rawWinnerCount === undefined || rawWinnerCount === ''
      ? 1
      : Number(rawWinnerCount);
    const normalizedEntryDeadlineAt = toISOStringFromInput(editingItem.entry_deadline_at);
    const normalizedDrawAt = toISOStringFromInput(editingItem.draw_at);

    if (!normalizedTitle) throw new Error('抽奖标题不能为空');
    if (!normalizedPrizeTitle) throw new Error('奖品名称不能为空');
    if (!['draft', 'open', 'drawn', 'closed'].includes(normalizedStatus)) throw new Error('抽奖状态无效');
    if (!['pending_contact', 'confirmed', 'fulfilled', 'voided'].includes(normalizedFulfillmentStatus)) throw new Error('中奖处理状态无效');
    if (hasMaxEntries && (!Number.isInteger(normalizedMaxEntries) || normalizedMaxEntries <= 0)) throw new Error('报名人数上限必须是正整数，或留空表示不限');
    if (!Number.isInteger(normalizedWinnerCount) || normalizedWinnerCount <= 0) throw new Error('中奖人数必须是正整数');
    if (normalizedMaxEntries !== null && normalizedWinnerCount > normalizedMaxEntries) throw new Error('中奖人数不能大于报名人数上限');
    if (editingItem.draw_at && !normalizedDrawAt) throw new Error('自动开奖时间无效');
    if (editingItem.entry_deadline_at && !normalizedEntryDeadlineAt) throw new Error('报名截止时间无效');
    if (normalizedEntryDeadlineAt && normalizedDrawAt && Date.parse(normalizedEntryDeadlineAt) > Date.parse(normalizedDrawAt)) {
      throw new Error('报名截止时间不能晚于自动开奖时间');
    }

    return pickWritableFields('lotteries', {
      title: normalizedTitle,
      description: String(editingItem.description || '').trim(),
      prize_title: normalizedPrizeTitle,
      prize_description: String(editingItem.prize_description || '').trim(),
      cover_image_url: String(editingItem.cover_image_url || '').trim(),
      status: normalizedStatus,
      fulfillment_status: normalizedFulfillmentStatus,
      is_community_visible: normalizedCommunityVisible,
      max_entries: normalizedMaxEntries,
      winner_count: normalizedWinnerCount,
      entry_deadline_at: normalizedEntryDeadlineAt,
      draw_at: normalizedDrawAt,
      created_by: isEditing ? undefined : (userId || null),
      updated_by: userId || null
    });
  },

  products: async ({ editingItem }) => {
    const normalizedId = Number(editingItem.id);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) throw new Error('商品 ID 必须是正整数');

    const normalizedPointsCost = Number(editingItem.points_cost);
    if (!Number.isFinite(normalizedPointsCost) || normalizedPointsCost < 0) throw new Error('商品积分定价必须是大于等于 0 的数字');

    const normalizedStock = Number(editingItem.stock);
    if (!Number.isFinite(normalizedStock) || normalizedStock < 0) throw new Error('库存必须是大于等于 0 的数字');

    const normalizedSpecifications = Array.isArray(editingItem.specifications)
      ? editingItem.specifications
        .map((spec) => ({
          label: String(spec?.label || '').trim(),
          value: String(spec?.value || '').trim()
        }))
        .filter((spec) => spec.label && spec.value)
      : [];

    return pickWritableFields('products', {
      id: normalizedId,
      title: String(editingItem.title || '').trim(),
      category: String(editingItem.category || '').trim(),
      description: String(editingItem.description || '').trim(),
      points_cost: Math.round(normalizedPointsCost),
      stock: Math.round(normalizedStock),
      image: String(editingItem.image || '').trim(),
      specifications: normalizedSpecifications,
      is_active: editingItem.is_active === true || editingItem.is_active === 'true',
      is_purchasable: editingItem.is_purchasable === true || editingItem.is_purchasable === 'true'
    });
  },

  news: async ({ editingItem, validateNewsPayload }) => {
    const dataToSave = pickWritableFields('news', { ...editingItem });
    dataToSave.id = Number(editingItem.id);
    dataToSave.category = String(editingItem.category || '').trim();
    dataToSave.title = String(editingItem.title || '').trim();
    dataToSave.date = String(editingItem.date || '').trim();
    dataToSave.author = String(editingItem.author || '').trim();
    dataToSave.content = normalizeNewsContent(editingItem.content);

    const normalizedExcerpt = String(editingItem.excerpt || '').trim();
    dataToSave.excerpt = normalizedExcerpt || stripHtml(dataToSave.content).slice(0, 80);

    if (validateNewsPayload && !validateNewsPayload(dataToSave)) {
      throw new Error('新闻数据验证失败');
    }

    return dataToSave;
  },

  activities: async ({ editingItem }) => {
    const normalizedId = Number(editingItem.id);
    const normalizedTitle = String(editingItem.title || '').trim();
    const normalizedDate = toDateInputValue(editingItem.date);

    if (!Number.isInteger(normalizedId) || normalizedId <= 0) throw new Error('活动 ID 必须是正整数');
    if (!normalizedDate) throw new Error('活动日期不能为空');

    return pickWritableFields('activities', {
      id: normalizedId,
      title: normalizedTitle,
      date: normalizedDate,
      image: String(editingItem.image || '').trim(),
      description: String(editingItem.description || '').trim()
    });
  },

  gifts: async ({ editingItem }) => {
    const normalizedUserId = String(editingItem.user_id || '').trim();
    if (!normalizedUserId) throw new Error('请先选择用户');
    if (!editingItem.gift_content || !String(editingItem.gift_content).trim()) throw new Error('礼物内容不能为空');

    const customCompletedAt = toISOStringFromInput(editingItem.completed_at);
    const normalizedIsActive = typeof editingItem.is_active === 'string'
      ? editingItem.is_active === 'true'
      : Boolean(editingItem.is_active);
    const normalizedGiftStatus = editingItem.gift_status;
    const nowIso = new Date().toISOString();
    const normalizedCompletedAt = normalizedGiftStatus === 'completed'
      ? (customCompletedAt || nowIso)
      : null;

    return pickWritableFields('gifts', {
      user_id: normalizedUserId,
      gift_no: editingItem.gift_no,
      gift_content: editingItem.gift_content,
      gift_price: editingItem.gift_price,
      gift_image: editingItem.gift_image,
      gift_status: normalizedGiftStatus,
      is_active: normalizedIsActive,
      completed_at: normalizedCompletedAt,
      updated_at: nowIso
    });
  },

  addresses: async ({ editingItem }) => {
    const normalizedUserId = String(editingItem.user_id || '').trim();
    if (!normalizedUserId) throw new Error('请先选择用户');

    const recipient = String(editingItem.recipient || '').trim();
    if (!recipient) throw new Error('收件人不能为空');

    const phone = String(editingItem.phone || '').trim();
    if (!phone) throw new Error('联系电话不能为空');

    const detail = String(editingItem.detail || '').trim();
    if (!detail) throw new Error('详细地址不能为空');

    const allowedTags = new Set(['', 'home', 'company', 'school']);
    const tag = String(editingItem.tag || '').trim();
    if (!allowedTags.has(tag)) throw new Error('地址标签无效');

    // is_default 来自 select 字段，可能是字符串 'true'/'false' 或布尔值
    const normalizedIsDefault = typeof editingItem.is_default === 'string'
      ? editingItem.is_default === 'true'
      : Boolean(editingItem.is_default);

    return pickWritableFields('addresses', {
      user_id: normalizedUserId,
      recipient,
      phone,
      region: String(editingItem.region || '').trim(),
      detail,
      tag,
      is_default: normalizedIsDefault,
      updated_at: new Date().toISOString()
    });
  },

  posterRequests: async ({ editingItem }) => {
    const normalizedUserId = String(editingItem.user_id || '').trim();
    if (!normalizedUserId) throw new Error('请先选择用户');

    const normalizedStatus = String(editingItem.status || 'pending').trim() || 'pending';
    const allowedStatuses = new Set(['pending', 'processing', 'shipped', 'completed']);
    if (!allowedStatuses.has(normalizedStatus)) throw new Error('海报申请状态无效');

    return pickWritableFields('posterRequests', {
      user_id: normalizedUserId,
      status: normalizedStatus,
      updated_at: new Date().toISOString()
    });
  }
};
