/**
 * DataAdmin 表单验证相关纯函数与工厂
 * 拆分自 DataAdmin.vue (P2 拆分第一阶段)
 *
 * 导出:
 *  - 纯函数: validateDateString / splitForumContent / normalizeNewsContent / getNextNumericId
 *  - 工厂: createFieldValidator / createRequiredFieldsValidator / createNewsPayloadValidator
 *    需要访问响应式状态, 通过参数注入以保持 DataAdmin.vue 对状态的完全所有权
 */

const ESCAPE_HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value) => String(value || '')
  .replace(/[&<>"']/g, (ch) => ESCAPE_HTML_MAP[ch] || ch);

export const stripHtml = (value) => String(value || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const hasHtmlTag = (value) => /<[^>]+>/.test(String(value || ''));

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 校验 YYYY-MM-DD 字符串是否为有效日期
export const validateDateString = (value) => {
  const source = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return false;

  const [year, month, day] = source.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return false;

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

// 解析论坛内容里 【标题】\n正文 格式
export const splitForumContent = (rawContent) => {
  const content = String(rawContent || '').replace(/\r\n/g, '\n').trim();
  if (!content) return { title: '', body: '' };

  const titleMatch = content.match(/^【([^】\n]{1,80})】\s*\n?/);
  if (!titleMatch) {
    return { title: '', body: content };
  }

  return {
    title: titleMatch[1].trim(),
    body: content.slice(titleMatch[0].length).trim()
  };
};

// 将纯文本新闻内容自动转成 HTML 段落/列表
export const normalizeNewsContent = (content) => {
  const trimmed = String(content || '').trim();
  if (!trimmed) return '';
  if (hasHtmlTag(trimmed)) return trimmed;

  const lines = trimmed.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1].trim());
      return;
    }

    flushList();
    if (/^(重点内容|活动安排|更新内容|后续计划|注意事项|详情|总结)$/.test(line)) {
      blocks.push(`<h4>${escapeHtml(line)}</h4>`);
      return;
    }
    blocks.push(`<p>${escapeHtml(line)}</p>`);
  });

  flushList();
  return blocks.join('\n');
};

// 从一组行中算出下一个可用的正整数 id
export const getNextNumericId = (rows = []) => {
  const numericIds = (rows || [])
    .map((item) => Number(item?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const maxId = numericIds.length ? Math.max(...numericIds) : 0;
  return maxId + 1;
};

const isEmptyValue = (value) => value === null
  || value === undefined
  || (typeof value === 'string' && !value.trim())
  || (Array.isArray(value) && value.length === 0);

/**
 * 创建单字段验证器
 * @param {Object} deps
 * @param {Function} deps.getCurrentFields - () => Array<FieldDef>
 * @param {Object} deps.editingItemRef - ref<Record<string, any>>
 * @param {Object} deps.fieldErrors - reactive<Record<string, string>>
 * @param {Function} deps.getCurrentTab - () => string
 * @param {Function} deps.clearFieldError - (fieldKey) => void
 */
export const createFieldValidator = (deps) => (fieldKey) => {
  const {
    getCurrentFields,
    editingItemRef,
    fieldErrors,
    getCurrentTab,
    clearFieldError
  } = deps;

  const field = getCurrentFields().find((item) => item.key === fieldKey);
  if (!field) return true;

  const value = editingItemRef.value[fieldKey];
  const isEmpty = isEmptyValue(value);

  if (field.required && isEmpty) {
    fieldErrors[fieldKey] = `${field.label}不能为空`;
    return false;
  }

  if (isEmpty) {
    clearFieldError(fieldKey);
    return true;
  }

  const textValue = String(value).trim();

  if (field.type === 'email' && textValue && !EMAIL_REGEX.test(textValue)) {
    fieldErrors[fieldKey] = '邮箱格式不正确';
    return false;
  }

  if (fieldKey === 'id' && (getCurrentTab() === 'users' || getCurrentTab() === 'points')) {
    if (textValue && !UUID_REGEX.test(textValue)) {
      fieldErrors[fieldKey] = '用户 ID 必须是有效 UUID';
      return false;
    }
  }

  if (fieldKey === 'author_id' && getCurrentTab() === 'forum') {
    if (textValue && !UUID_REGEX.test(textValue)) {
      fieldErrors[fieldKey] = '作者 ID 必须是 UUID 格式';
      return false;
    }
  }

  if (fieldKey === 'user_id' && getCurrentTab() === 'subscriptions') {
    if (textValue && !UUID_REGEX.test(textValue)) {
      fieldErrors[fieldKey] = '用户 ID 必须是 UUID 格式';
      return false;
    }
  }

  if (field.type === 'number') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      fieldErrors[fieldKey] = `${field.label}必须是有效数字`;
      return false;
    }
    if (field.min !== undefined && numeric < Number(field.min)) {
      fieldErrors[fieldKey] = `${field.label}不能小于 ${field.min}`;
      return false;
    }
    if (field.max !== undefined && numeric > Number(field.max)) {
      fieldErrors[fieldKey] = `${field.label}不能大于 ${field.max}`;
      return false;
    }
  }

  if (field.maxLength && textValue.length > Number(field.maxLength)) {
    fieldErrors[fieldKey] = `${field.label}不能超过 ${field.maxLength} 个字符`;
    return false;
  }

  if (field.type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
    const allowedValues = field.options.map((opt) => opt.value);
    if (!allowedValues.includes(value)) {
      fieldErrors[fieldKey] = `${field.label}选项无效`;
      return false;
    }
  }

  if (getCurrentTab() === 'news') {
    if (fieldKey === 'id') {
      const numId = Number(value);
      if (!Number.isInteger(numId) || numId <= 0) {
        fieldErrors[fieldKey] = 'ID 必须是正整数';
        return false;
      }
    }

    if (fieldKey === 'category' && !deps.NEWS_CATEGORY_VALUES.includes(textValue)) {
      fieldErrors[fieldKey] = '分类必须使用下拉中的系统值';
      return false;
    }

    if (fieldKey === 'title' && textValue.length < 4) {
      fieldErrors[fieldKey] = '标题至少 4 个字符';
      return false;
    }

    if (fieldKey === 'date' && !validateDateString(textValue)) {
      fieldErrors[fieldKey] = '日期格式无效，请使用日期选择器';
      return false;
    }

    if (fieldKey === 'author' && textValue.length < 2) {
      fieldErrors[fieldKey] = '作者名至少 2 个字符';
      return false;
    }

    if (fieldKey === 'excerpt') {
      const excerpt = stripHtml(textValue);
      if (excerpt.length < 10) {
        fieldErrors[fieldKey] = '摘要建议至少 10 个字符';
        return false;
      }
      if (excerpt.length > 120) {
        fieldErrors[fieldKey] = '摘要建议不超过 120 个字符';
        return false;
      }
    }

    if (fieldKey === 'content') {
      const contentLength = stripHtml(textValue).length;
      if (contentLength < 20) {
        fieldErrors[fieldKey] = '正文内容过短，至少 20 个字符';
        return false;
      }
    }
  }

  clearFieldError(fieldKey);
  return true;
};

/**
 * 创建必填字段批量校验
 */
export const createRequiredFieldsValidator = (deps) => () => {
  const { getCurrentFields, editingItemRef, fieldErrors } = deps;
  let valid = true;

  getCurrentFields().forEach((field) => {
    if (!field.required) return;
    const value = editingItemRef.value[field.key];
    if (isEmptyValue(value)) {
      fieldErrors[field.key] = `${field.label}不能为空`;
      valid = false;
    }
  });

  return valid;
};

/**
 * 创建新闻 payload 业务级校验
 * @param {Object} deps
 * @param {Object} deps.fieldErrors
 * @param {Function} deps.getNewsRows - () => Array (dataStore.news)
 * @param {Function} deps.getIsEditing
 * @param {Function} deps.getEditingItemId
 * @param {string[]} deps.NEWS_CATEGORY_VALUES
 */
export const createNewsPayloadValidator = (deps) => (payload) => {
  const { fieldErrors, getNewsRows, getIsEditing, getEditingItemId, NEWS_CATEGORY_VALUES } = deps;
  let valid = true;
  const normalizedId = Number(payload.id);

  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    fieldErrors.id = 'ID 必须是正整数';
    valid = false;
  } else {
    const editingId = getIsEditing() ? Number(getEditingItemId()) : null;
    const duplicate = getNewsRows().some((item) => {
      const itemId = Number(item.id);
      if (!Number.isInteger(itemId)) return false;
      if (getIsEditing() && itemId === editingId) return false;
      return itemId === normalizedId;
    });
    if (duplicate) {
      fieldErrors.id = 'ID 已存在，请点击"自动生成 ID"';
      valid = false;
    }
  }

  if (!NEWS_CATEGORY_VALUES.includes(payload.category)) {
    fieldErrors.category = '分类值不合法，请从下拉中选择';
    valid = false;
  }

  if (!validateDateString(payload.date)) {
    fieldErrors.date = '日期无效，请重新选择';
    valid = false;
  }

  const plainExcerpt = stripHtml(payload.excerpt);
  const plainContent = stripHtml(payload.content);
  if (plainExcerpt.length < 10) {
    fieldErrors.excerpt = '摘要至少 10 个字符';
    valid = false;
  }
  if (plainContent.length < 20) {
    fieldErrors.content = '正文至少 20 个字符';
    valid = false;
  }

  return valid;
};
