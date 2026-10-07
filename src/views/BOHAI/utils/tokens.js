/**
 * tokens.js — Token 估算
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */

// --- Token 估算 ---
// 用字符数估算 token 消耗，比纯 char.length 更准确。
// 中文: ~1.8 tokens/char，英文/ASCII: ~0.3 tokens/char，其他: ~1.0 tokens/char。
// 加上每条消息的角色标记开销 (~20 tokens)。
export const TOKEN_ESTIMATE_ROLE_OVERHEAD = 20;

export const estimateTokens = (text) => {
  if (!text) return 0;
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK 统一表意文字
      tokens += 1.8;
    } else if (code <= 0x7f) {
      // ASCII
      tokens += 0.3;
    } else {
      // 其他 Unicode（标点、符号、日韩等）
      tokens += 1.0;
    }
  }
  return Math.ceil(tokens);
};

export const estimateMessagesTokens = (messages) => {
  if (!messages || messages.length === 0) return 0;
  return messages.reduce((sum, msg) => {
    return sum + TOKEN_ESTIMATE_ROLE_OVERHEAD + estimateTokens(String(msg.content || ''));
  }, 0);
};
