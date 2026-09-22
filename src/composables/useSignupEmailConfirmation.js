import { verifyEmailTokenHash } from '@/utils/api/auth-api.js';
import { logger } from '@/utils/logger.js';

// ============================================================
// 邮箱验证回跳消费（GoTrue token-hash 型链接，注册 / 更换邮箱共用）
//
// 链接形态：{origin}/?token_hash=<明文token>&type=<signup|email_change>
// （signUp / updateUser({email}) 的回跳地址都是 origin/，GoTrue 把
// token_hash 拼进 query；与 recovery 邮件同一生成器，ResetPassword 页
// 对 recovery 做了同款解析。）
//
// 消费方式：verifyOtp({type, token_hash}) 成功 → supabase-js 保存会话并
// 广播 SIGNED_IN / USER_UPDATED → auth store 的事件处理器自动接管本地
// 状态（updateLocalState + 在线心跳 / 邮箱字段刷新），无需手动同步。
// ============================================================
const CONFIRM_TYPES = new Set(['signup', 'email_change']);

export function consumeEmailConfirmationRedirect() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search || '');
  const tokenHash = String(params.get('token_hash') || '').trim();
  const type = String(params.get('type') || '').trim();
  if (!tokenHash || !CONFIRM_TYPES.has(type)) return;

  // token 一次性：先清掉地址栏参数防刷新重放，再异步消费
  window.history.replaceState({}, document.title, window.location.pathname);

  void verifyEmailTokenHash(tokenHash, type)
    .then(({ ok, error }) => {
      if (ok) {
        logger.info('app', `邮箱验证完成（${type}），会话已建立`);
      } else {
        // 过期（mailer_otp_exp=3600，链接 1 小时有效）或已被消费：
        // 引导走登录 → 被拒时的文案会提示回对应页面重新获取
        logger.warn('app', `邮箱验证回跳消费失败（${type}）`, error?.message || error);
      }
    })
    .catch((e) => logger.warn('app', '邮箱验证回跳消费异常', e));
}
