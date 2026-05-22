const ACTION_HELP_QUERY_PATTERN = /(怎么|如何|步骤|教程|入口|路径|在哪|在哪里|能不能|是否可以|可以吗)/;
const ACTION_POST_TRIGGER_PATTERN = /(发帖|发个帖|发布帖子|发布一条帖子|发一篇帖子)/;
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
