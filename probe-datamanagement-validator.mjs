// 数据管理面板校验器回归测试：复现"新闻模板保存报 Cannot read properties of undefined (reading 'includes')"
import {
  createFieldValidator,
  createRequiredFieldsValidator,
  createNewsPayloadValidator,
  normalizeNewsContent
} from './src/views/DataManagement/composables/useDataAdminValidation.js';

const results = [];
const check = (name, fn) => {
  try {
    const ok = fn();
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  } catch (e) {
    results.push(`FAIL  ${name}  =>  ${e.message}`);
  }
};

const NEWS_CATEGORIES = ['event', 'update', 'community', 'announce'];

const makeDeps = (overrides = {}) => ({
  getCurrentFields: () => (overrides.fields || [
    { key: 'id', label: 'ID', type: 'number', required: true },
    { key: 'category', label: '分类', type: 'select', required: true, options: NEWS_CATEGORIES.map((v) => ({ value: v, label: v })) },
    { key: 'title', label: '标题', type: 'text', required: true },
    { key: 'excerpt', label: '摘要', type: 'textarea', required: true },
    { key: 'content', label: '正文', type: 'textarea', required: true },
    { key: 'date', label: '日期', type: 'date', required: true },
    { key: 'author', label: '作者', type: 'text', required: true }
  ]),
  editingItemRef: { value: { ...(overrides.item || {}) } },
  fieldErrors: overrides.fieldErrors || {},
  getCurrentTab: () => overrides.tab || 'news',
  clearFieldError: (k) => { if (overrides.fieldErrors) delete overrides.fieldErrors[k]; },
  NEWS_CATEGORY_VALUES: overrides.noCategoryDep ? undefined : NEWS_CATEGORIES
});

// 1) 保存流程会逐字段跑 validateField（此前在 category 处崩溃）
check('validateField(category) 修复后不再抛 undefined.includes', () => {
  const fe = {};
  const validateField = createFieldValidator(makeDeps({
    item: { category: 'update', title: '测试新闻标题', excerpt: '这是一个足够长的摘要内容', content: '这是足够长的正文内容，超过二十个字符的测试文本。', date: '2026-09-07', author: 'admin', id: 1 },
    fieldErrors: fe
  }));
  return validateField('category') === true;
});

// 2) deps 缺失时优雅降级（防御性）
check('deps 缺少 NEWS_CATEGORY_VALUES 时优雅降级不崩溃', () => {
  const validateField = createFieldValidator(makeDeps({ noCategoryDep: true, item: { category: 'update' } }));
  return validateField('category') === true;
});

// 3) 非法分类仍然被拦截
check('非法分类值被正确拦截', () => {
  const fe = {};
  const validateField = createFieldValidator(makeDeps({ item: { category: 'hack' }, fieldErrors: fe }));
  return validateField('category') === false && Boolean(fe.category);
});

// 4) 必填校验
check('createRequiredFieldsValidator 正常工作', () => {
  const validateRequired = createRequiredFieldsValidator(makeDeps({
    item: { category: '', title: '' },
    fieldErrors: {}
  }));
  return validateRequired() === false;
});

// 5) 保存 payload 校验（saveStrategies news 调用路径）
check('createNewsPayloadValidator 合法 payload 通过', () => {
  const validate = createNewsPayloadValidator({
    fieldErrors: {},
    getNewsRows: () => [{ id: 1 }, { id: 2 }],
    getIsEditing: () => true,
    getEditingItemId: () => 1,
    NEWS_CATEGORY_VALUES: NEWS_CATEGORIES
  });
  return validate({ id: 1, category: 'update', date: '2026-09-07', excerpt: '足够长的摘要内容测试文本', content: '<p>足够长的正文内容测试文本，超过二十个字符。</p>' }) === true;
});

// 6) 纯文本新闻模板 → normalizeNewsContent（保存策略调用）
check('normalizeNewsContent 处理模板文本', () => {
  const html = normalizeNewsContent('BOH 更新公告\n\n重点内容\n- 要点 1：请填写具体内容\n- 要点 2：请填写具体内容');
  return html.includes('<h4>重点内容</h4>') && html.includes('<ul>') && html.includes('<li>');
});

console.log(results.join('\n'));
console.log(results.every((r) => r.startsWith('PASS')) ? '\n全部通过 ✅' : '\n存在失败 ❌');
process.exit(results.every((r) => r.startsWith('PASS')) ? 0 : 1);
