/**
 * 就地编辑的字段级校验。
 *
 * 只做一件事：把 `dataConfig` 里的字段声明（`required` / `maxLength` / `min`）
 * 翻译成给用户看的错误文案。**不在这里定义任何业务规则** —— 规则的真源始终是
 * `config/tables.js`，就地编辑和表单必须共用同一份，否则页面上能存进去的值
 * 会绕过表单校验，这正是可视化编辑最容易出的数据事故。
 *
 * @param {Object|null} meta 字段配置（tables.js 的 fields 项）
 * @param {unknown} value 待写入的新值
 * @returns {string} 错误文案；空串表示通过
 */
export const validateInlineField = (meta, value) => {
  if (!meta) return '';
  const label = meta.label || meta.key || '该字段';
  const text = String(value ?? '').trim();

  if (meta.required && !text) return `${label}不能为空`;

  if (meta.maxLength && text.length > meta.maxLength) {
    return `${label}最多 ${meta.maxLength} 个字`;
  }

  /* min 只对「确实填了数字」的值生效：空串 Number('') === 0 会误触发 min:0 以上的下限，
     而空值该不该拦由上面的 required 决定，不该由 min 顺带管。 */
  if (meta.min !== undefined && meta.min !== null && text !== '') {
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric < meta.min) {
      return `${label}不能小于 ${meta.min}`;
    }
  }

  return '';
};
