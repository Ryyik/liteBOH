import {
  normalizeText,
  containsAnyKeyword,
  isOperationQuestion,
  extractQueryKeywords,
  scoreChunk,
  normalizePromptLine,
  formatPromptDate,
  formatBillingCycleLabel,
  parsePostTitleAndBody
} from './bohai-engine-helpers.js';

import {
  USER_PRIVATE_PERSONAL_PATTERN,
  USER_PRIVATE_SUMMARY_KEYWORDS,
  USER_PRIVATE_ALL_KEYWORDS,
  USER_PRIVATE_POST_KEYWORDS,
  USER_PRIVATE_GIFT_KEYWORDS,
  USER_PRIVATE_BIRTHDAY_KEYWORDS,
  USER_PRIVATE_PUSHPLUS_KEYWORDS,
  USER_PRIVATE_SUBSCRIPTION_KEYWORDS,
  USER_PRIVATE_CONTEXT_MAX_ITEMS,
  USER_PRIVATE_CONTEXT_MAX_ITEM_CHARS,
  GIFT_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS
} from './chat-engine-config.js';

import { getBirthdayCountdown } from './bohai-engine-helpers.js';

export const resolveUserPrivateRetrievalPlan = (queryText = '') => {
  const normalized = normalizeText(queryText);
  if (!normalized) {
    return {
      shouldUse: false,
      overview: false,
      posts: false,
      gifts: false,
      birthday: false,
      pushplus: false,
      subscriptions: false
    };
  }

  const hasPersonalPronoun = USER_PRIVATE_PERSONAL_PATTERN.test(normalized);
  const asksSummary = containsAnyKeyword(normalized, USER_PRIVATE_SUMMARY_KEYWORDS)
    || (hasPersonalPronoun && /(信息|资料|状态|情况|数据|内容|账户|账号)/.test(normalized));
  const asksAll = (asksSummary || hasPersonalPronoun)
    && containsAnyKeyword(normalized, USER_PRIVATE_ALL_KEYWORDS);

  const posts = containsAnyKeyword(normalized, USER_PRIVATE_POST_KEYWORDS)
    || (hasPersonalPronoun && /(帖子|发帖|论坛)/.test(normalized));
  const gifts = containsAnyKeyword(normalized, USER_PRIVATE_GIFT_KEYWORDS)
    || (hasPersonalPronoun && /(礼物|礼品)/.test(normalized));
  const birthday = containsAnyKeyword(normalized, USER_PRIVATE_BIRTHDAY_KEYWORDS)
    || (hasPersonalPronoun && /生日/.test(normalized));
  const pushplus = containsAnyKeyword(normalized, USER_PRIVATE_PUSHPLUS_KEYWORDS)
    || (hasPersonalPronoun && /推送/.test(normalized));
  const subscriptions = containsAnyKeyword(normalized, USER_PRIVATE_SUBSCRIPTION_KEYWORDS)
    || (hasPersonalPronoun && /(订阅|会员|积分|套餐)/.test(normalized));

  const shouldUseByIntent = asksSummary || asksAll || posts || gifts || birthday || pushplus || subscriptions;
  if (!shouldUseByIntent) {
    return {
      shouldUse: false,
      overview: false,
      posts: false,
      gifts: false,
      birthday: false,
      pushplus: false,
      subscriptions: false
    };
  }

  // "如何发帖"等纯操作问题优先走站点操作知识，不触发用户私域读库。
  if (
    isOperationQuestion(normalized)
    && !asksSummary
    && !asksAll
    && !gifts
    && !birthday
    && !pushplus
    && !subscriptions
    && !containsAnyKeyword(normalized, ['我的帖子', '我发的帖子', '我的发帖'])
  ) {
    return {
      shouldUse: false,
      overview: false,
      posts: false,
      gifts: false,
      birthday: false,
      pushplus: false,
      subscriptions: false
    };
  }

  return {
    shouldUse: true,
    overview: asksSummary || asksAll || posts || gifts || birthday || pushplus || subscriptions,
    posts: asksAll || posts,
    gifts: asksAll || gifts,
    birthday: asksAll || birthday,
    pushplus: asksAll || pushplus,
    subscriptions: asksAll || subscriptions
  };
};

export const selectItemsByQuery = (items, queryText, projector, maxItems = USER_PRIVATE_CONTEXT_MAX_ITEMS) => {
  const source = Array.isArray(items) ? items : [];
  if (source.length === 0) return [];

  const keywords = extractQueryKeywords(queryText);
  if (keywords.length === 0) {
    return source.slice(0, maxItems);
  }

  const scored = source.map((item) => ({
    item,
    score: scoreChunk(String(projector(item) || ''), keywords)
  }));

  const matched = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((entry) => entry.item);

  if (matched.length > 0) return matched;
  return source.slice(0, maxItems);
};

export const getUserOverviewContext = (snapshot) => {
  const profile = snapshot?.profile || {};
  const username = normalizePromptLine(profile?.username, 32) || '未知';
  const role = normalizePromptLine(profile?.role, 16) || 'user';
  const points = Number(profile?.points || 0);
  const joinDate = formatPromptDate(profile?.join_date, '未知');

  return {
    context: `【当前登录用户概览】\n用户名: ${username}\n角色: ${role}\n当前积分: ${points}\n加入时间: ${joinDate}`,
    label: '当前用户概览'
  };
};

export const getUserPostsPrivateContext = (snapshot, queryText) => {
  const posts = Array.isArray(snapshot?.posts) ? snapshot.posts : [];
  const selected = selectItemsByQuery(
    posts,
    queryText,
    (post) => {
      const parsed = parsePostTitleAndBody(post?.content);
      return `${parsed.title}\n${parsed.body}`;
    }
  );

  if (posts.length === 0) {
    return {
      context: '【当前用户发帖记录】\n当前账号暂无发帖记录。',
      total: 0,
      label: '我的帖子(0条)'
    };
  }

  const body = selected.map((post, index) => {
    const parsed = parsePostTitleAndBody(post?.content);
    const preview = normalizePromptLine(parsed.body, USER_PRIVATE_CONTEXT_MAX_ITEM_CHARS);
    const time = formatPromptDate(post?.created_at, '未知');
    const likes = Number(post?.like_count || post?.likes_count || 0);
    const comments = Number(post?.comment_count || 0);
    const status = normalizePromptLine(post?.status, 12) || 'approved';
    return `[${index + 1}] ${parsed.title}\n时间: ${time}  状态: ${status}\n互动: 点赞 ${likes} / 评论 ${comments}\n内容: ${preview || '（空）'}`;
  }).join('\n\n');

  return {
    context: `【当前用户发帖记录】\n总帖数: ${posts.length}\n${body}`,
    total: posts.length,
    label: `我的帖子(${posts.length}条)`
  };
};

export const getUserGiftPrivateContext = (snapshot) => {
  const gifts = Array.isArray(snapshot?.gifts) ? snapshot.gifts : [];
  const profile = snapshot?.profile || {};
  let source = gifts;

  if (source.length === 0 && profile?.gift_content) {
    source = [{
      id: 'profile_fallback',
      gift_no: profile?.gift_no || '未知',
      gift_content: profile?.gift_content || '',
      gift_price: profile?.gift_price || 0,
      gift_status: profile?.gift_status || 'preparing',
      is_active: true,
      updated_at: null,
      created_at: null
    }];
  }

  if (source.length === 0) {
    return {
      context: '【当前用户礼物状态】\n当前账号暂无礼物记录。',
      total: 0,
      activeCount: 0,
      label: '礼物(0条)'
    };
  }

  const active = source.filter((gift) => Boolean(gift?.is_active));
  const ordered = [
    ...active,
    ...source.filter((gift) => !gift?.is_active)
  ].slice(0, USER_PRIVATE_CONTEXT_MAX_ITEMS);

  const body = ordered.map((gift, index) => {
    const content = normalizePromptLine(gift?.gift_content, 42) || '未命名礼物';
    const statusKey = String(gift?.gift_status || 'preparing').toLowerCase();
    const status = GIFT_STATUS_LABELS[statusKey] || statusKey || '未知';
    const price = Number(gift?.gift_price || 0);
    const updatedAt = formatPromptDate(gift?.updated_at || gift?.created_at || gift?.completed_at, '未知');
    const stage = gift?.is_active ? '进行中' : '历史';
    const giftNo = normalizePromptLine(gift?.gift_no, 24) || '未知';
    return `[${index + 1}] ${content}\n编号: ${giftNo}\n状态: ${status} (${stage})  金额: ${price}\n更新时间: ${updatedAt}`;
  }).join('\n\n');

  return {
    context: `【当前用户礼物状态】\n总记录: ${source.length}\n进行中: ${active.length}\n${body}`,
    total: source.length,
    activeCount: active.length,
    label: active.length > 0 ? `礼物(进行中${active.length})` : `礼物(${source.length}条)`
  };
};

export const getUserBirthdayPrivateContext = (snapshot) => {
  const profile = snapshot?.profile || {};
  const countdown = getBirthdayCountdown(profile?.birth_month, profile?.birth_day);

  if (!countdown) {
    return {
      context: '【当前用户生日会信息】\n当前账号尚未设置生日（月/日），可前往个人资料补充后启用生日会提醒。',
      label: '生日会(未设置)'
    };
  }

  const daysHint = countdown.daysUntil === 0
    ? '就是今天'
    : `${countdown.daysUntil} 天后`;

  return {
    context: `【当前用户生日会信息】\n生日: ${countdown.month} 月 ${countdown.day} 日\n下一个生日: ${countdown.nextDate}（${daysHint}）`,
    label: countdown.daysUntil === 0 ? '生日会(今天)' : '生日会'
  };
};

export const getUserPushplusPrivateContext = (snapshot) => {
  const profile = snapshot?.profile || {};
  const enabled = Boolean(profile?.pushplus_enabled);
  return {
    context: `【当前用户 Pushplus 状态】\nPushplus 离线推送: ${enabled ? '已开启' : '未开启'}`,
    enabled,
    label: enabled ? 'Pushplus(已开启)' : 'Pushplus(未开启)'
  };
};

export const getUserSubscriptionPrivateContext = (snapshot) => {
  const subscriptions = Array.isArray(snapshot?.subscriptions) ? snapshot.subscriptions : [];
  const nowTs = Date.now();
  const active = subscriptions.filter((item) => {
    if (String(item?.status || '') !== 'active') return false;
    if (!item?.expiresAt) return true;
    const expiresTs = new Date(item.expiresAt).getTime();
    return Number.isFinite(expiresTs) ? expiresTs > nowTs : true;
  });

  const preferred = (active.length > 0 ? active : subscriptions).slice(0, USER_PRIVATE_CONTEXT_MAX_ITEMS);
  const points = Number(snapshot?.profile?.points || 0);

  if (subscriptions.length === 0) {
    return {
      context: `【当前用户订阅与积分】\n当前积分: ${points}\n当前无付费订阅记录。`,
      activeCount: 0,
      label: '订阅(0项)'
    };
  }

  const body = preferred.map((item, index) => {
    const planName = normalizePromptLine(item?.planName || item?.plan_name, 40) || '未知套餐';
    const cycle = formatBillingCycleLabel(item?.billingCycle || item?.billing_cycle);
    const expiresAt = formatPromptDate(item?.expiresAt || item?.expires_at, '未知');
    const statusKey = String(item?.status || '').toLowerCase();
    const status = SUBSCRIPTION_STATUS_LABELS[statusKey] || statusKey || '未知';
    const pointsCost = Number(item?.pointsCost || item?.points_cost || 0);
    return `[${index + 1}] ${planName}\n周期: ${cycle}\n状态: ${status}\n到期: ${expiresAt}\n积分消耗: ${pointsCost}`;
  }).join('\n\n');

  return {
    context: `【当前用户订阅与积分】\n当前积分: ${points}\n订阅记录: ${subscriptions.length} 项（生效中 ${active.length}）\n${body}`,
    activeCount: active.length,
    label: active.length > 0 ? `订阅(生效${active.length}项)` : `订阅(${subscriptions.length}项)`
  };
};
