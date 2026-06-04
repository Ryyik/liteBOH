const ACTION_HELP_QUERY_PATTERN = /(怎么|如何|步骤|教程|入口|路径|在哪|在哪里|能不能|是否可以|可以吗)/;
const ACTION_POST_TRIGGER_PATTERN = /(发帖|发个帖|发(?:一条|一篇|个)?.{0,8}帖子|发布.{0,8}帖子|论坛发帖|论坛发布|论坛发布文案|起草.{0,12}(论坛|社区|帖子|发布文案)|写.{0,12}(论坛|社区|帖子|发布文案)|生成.{0,12}(论坛|社区|帖子|发布文案)|整理.{0,12}(论坛|社区|帖子|发布文案))/;
const ACTION_MAIL_TRIGGER_PATTERN = /(发邮件|发私信|写邮件|写信|寄信)/;
const ACTION_REQUEST_CUE_PATTERN = /(帮我|替我|代我|请帮我|请你|我想|我要|帮忙)/;
const ACTION_CANCEL_KEYWORDS_PATTERN = /(取消|算了|作废|终止|撤回|撤销|停止)/;
const ACTION_NEGATIVE_SEND_PATTERN = /(先别发|别发|不要发|不用发|不发了|不发|先不发|暂不发|不发送|不发布|不发帖)/;
const ACTION_POST_CONFIRM_PATTERN = /(发帖|发布|发出去|发出|就发这个|按这个发|发吧)/;
const ACTION_MAIL_CONFIRM_PATTERN = /(发送|发出|发出去|寄出|就发这个|按这个发|发吧)/;
const ACTION_QUESTION_CUE_PATTERN = /(吗|么|如何|怎么|能不能|是否|可不可以|行不行)/;

export const normalizeActionDecisionText = (text) => String(text || '')
  .trim()
  .replace(/\s+/g, '')
  .replace(/[，。！!？?、,.；;~～]/g, '')
  .toLowerCase();

const ACTION_CANCEL_EXACT = new Set([
  '取消', '取消吧', '不用了', '不用', '不发了', '算了', '算了吧', '停止', '撤销', '撤回', '终止'
]);

const ACTION_POST_CONFIRM_EXACT = new Set([
  '确认发布', '确认发帖', '发布', '发帖', '确定发布', '确定发帖',
  '就这样发', '就这样发吧', '就发这个', '发吧', '按这个发', '就按这个发', '就按这版发', '直接发'
]);

const ACTION_MAIL_CONFIRM_EXACT = new Set([
  '确认发送', '确认发出', '发送', '发出去', '确定发送',
  '就这样发', '就这样发吧', '就发这个', '发吧', '按这个发', '就按这个发', '直接发送', '发出'
]);

export const isActionDraftCancelIntent = (text) => {
  const normalized = normalizeActionDecisionText(text);
  if (!normalized) return false;
  if (ACTION_CANCEL_EXACT.has(normalized)) return true;
  if (ACTION_CANCEL_KEYWORDS_PATTERN.test(normalized)) return true;
  return ACTION_NEGATIVE_SEND_PATTERN.test(normalized);
};

export const isPostDraftConfirmIntent = (text) => {
  const normalized = normalizeActionDecisionText(text);
  if (!normalized) return false;
  if (isActionDraftCancelIntent(normalized)) return false;
  if (ACTION_QUESTION_CUE_PATTERN.test(normalized)) return false;
  if (ACTION_POST_CONFIRM_EXACT.has(normalized)) return true;

  const agrees = /^(好|好的|行|可以|可|确认|确定|同意|ok|yes|y)/.test(normalized);
  if (agrees && ACTION_POST_CONFIRM_PATTERN.test(normalized)) return true;
  return /^(就|直接)?(按这个|按这版|按此|就按这个)?(发帖|发布|发出去|发出|发吧)(吧|呀|了)?$/.test(normalized);
};

export const isMailDraftConfirmIntent = (text) => {
  const normalized = normalizeActionDecisionText(text);
  if (!normalized) return false;
  if (isActionDraftCancelIntent(normalized)) return false;
  if (ACTION_QUESTION_CUE_PATTERN.test(normalized)) return false;
  if (ACTION_MAIL_CONFIRM_EXACT.has(normalized)) return true;

  const agrees = /^(好|好的|行|可以|可|确认|确定|同意|ok|yes|y)/.test(normalized);
  if (agrees && ACTION_MAIL_CONFIRM_PATTERN.test(normalized)) return true;
  return /^(就|直接)?(按这个|按这版|按此|就按这个)?(发送|发出|发出去|寄出|发吧)(吧|呀|了)?$/.test(normalized);
};

export const isPostDraftRequest = (text) => {
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return false;
  if (!ACTION_POST_TRIGGER_PATTERN.test(normalized)) return false;
  if (ACTION_HELP_QUERY_PATTERN.test(normalized) && !ACTION_REQUEST_CUE_PATTERN.test(normalized)) {
    return false;
  }
  return ACTION_REQUEST_CUE_PATTERN.test(normalized) || /标题[:：]|内容[:：]|正文[:：]/.test(text);
};

export const isMailDraftRequest = (text) => {
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return false;
  if (!ACTION_MAIL_TRIGGER_PATTERN.test(normalized)) return false;
  if (ACTION_HELP_QUERY_PATTERN.test(normalized) && !ACTION_REQUEST_CUE_PATTERN.test(normalized)) {
    return false;
  }
  return ACTION_REQUEST_CUE_PATTERN.test(normalized)
    || /给.+发(邮件|私信)/.test(normalized)
    || /收件人[:：]|主题[:：]|内容[:：]/.test(text);
};

const ACTION_CREATE_PAGE_TRIGGER_PATTERN = /(创建网页|创建页面|生成网页|生成页面|做个网页|做个页面|做个主页|做个落地页|搭建网页|搭建页面|设计网页|设计页面|建个网页|建个页面|制作网页|制作页面|网页设计|页面设计)/;
const ACTION_PAGE_TEMPLATE_PATTERN = /(首页|主页|落地页|活动页|公告页|展示页|介绍页|个人介绍|作品集|登录页|注册页|关于页|联系我们|产品页|宣传页|推广页|营销页)/;

export const isCreatePageRequest = (text) => {
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return false;
  if (!ACTION_CREATE_PAGE_TRIGGER_PATTERN.test(normalized)) return false;
  if (ACTION_HELP_QUERY_PATTERN.test(normalized) && !ACTION_REQUEST_CUE_PATTERN.test(normalized)) {
    return false;
  }
  return true;
};

export const isCreatePageConfirmIntent = (text) => {
  const normalized = normalizeActionDecisionText(text);
  if (!normalized) return false;
  if (isActionDraftCancelIntent(normalized)) return false;
  if (ACTION_QUESTION_CUE_PATTERN.test(normalized)) return false;
  return /^(好|好的|行|可以|可|确认|确定|同意|发送|ok|yes|y)/.test(normalized)
    || /^(就|直接)?(按这个|按这版)?(发送|发过去|打开|使用)(吧|呀|了)?$/.test(normalized);
};
