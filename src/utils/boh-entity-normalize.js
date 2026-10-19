/**
 * boh-entity-normalize.js — 人物别名归一（纯函数，无路径别名依赖）
 *
 * 单独成文件的原因：前端解析器（`boh-entity-resolver.js`）与 Node 播种脚本
 * （`scripts/seed-boh-entities.mjs`）必须用**同一套**归一化规则；脚本不能解析
 * `@/data/...` 别名，所以把纯函数放在这里，两边 relative import。
 */
const PUNCTUATION_RE = /[\s\u3000，。！？、,.!?;；:：'"“”‘’（）()【】[\]《》<>·~～\-_/\\|]+/g;

export const normalizeEntityText = (text) =>
  String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(PUNCTUATION_RE, '');

export const isLatinAlias = (value) => /^[a-z0-9_]+$/.test(value);
