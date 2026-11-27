import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const source = readFileSync(resolve(import.meta.dirname, '../../src/views/Join/index.vue'), 'utf8');
const rawScript = scriptSection(source);
const code = squeezeSource(stripComments(rawScript));
const bodyOf = (name) => {
  const start = rawScript.indexOf(`const ${name} =`);
  expect(start, `${name} 应存在`).toBeGreaterThan(-1);
  const next = rawScript.indexOf('\nconst ', start + 1);
  return squeezeSource(
    stripComments(rawScript.slice(start, next === -1 ? rawScript.length : next)),
  );
};

describe('join review regressions', () => {
  it('管理员预览激活后，所有真实写处理器都必须短路', () => {
    for (const name of ['handleNext', 'handleSkip', 'flushPendingAvatar', 'completeIdentity']) {
      expect(bodyOf(name), name).toContain('if (isAdminPreview.value) return');
    }
    expect(bodyOf('adminPreviewJump')).toContain('isAdminPreview.value = true');
  });

  it('验证码请求绑定邮箱快照，返回时邮箱或步骤已变就丢弃结果', () => {
    const body = bodyOf('verifyOtpAndContinue');
    expect(body).toContain('const email = normalizeEmail(formData.email)');
    expect(body).toContain('verifySignupOtp(email, code)');
    expect(body).toMatch(
      /currentStep\.value\s*!==\s*2\s*\|\|\s*normalizeEmail\(formData\.email\)\s*!==\s*email/,
    );
  });

  it('发码请求绑定邮箱快照，返回时邮箱已变就丢弃结果', () => {
    const body = bodyOf('sendOtpForSignup');
    expect(body).toContain('const normalizedEmail = normalizeEmail(formData.email)');
    expect(body).toMatch(
      /currentStep\.value\s*!==\s*1\s*\|\|\s*normalizeEmail\(formData\.email\)\s*!==\s*normalizedEmail/,
    );
  });

  it('重发验证码绑定邮箱/步骤/序号，重发期间禁止返回', () => {
    const body = bodyOf('handleResendOtp');
    expect(body).toContain('const email = normalizeEmail(formData.email)');
    expect(body).toContain('resendSignupConfirmation(email)');
    expect(body).toMatch(
      /currentStep\.value\s*!==\s*2\s*\|\|\s*normalizeEmail\(formData\.email\)\s*!==\s*email/,
    );
    expect(bodyOf('canGoBack')).toContain('!isResending.value');
  });

  it('管理员预览提供退出入口并恢复真实表单', () => {
    expect(source).toContain('@click="adminPreviewExit"');
    expect(bodyOf('adminPreviewExit')).toContain('isAdminPreview.value = false');
  });

  it('服务端已注册或 ID 已占用时主按钮禁用', () => {
    const body = bodyOf('canAdvance');
    expect(body).toContain("emailState.value !== 'err'");
    expect(body).toContain("accountState.value !== 'err'");
  });

  it('收尾会话失效时错误写到当前验证码屏，并清掉旧发码记录', () => {
    const body = bodyOf('finishAfterVerification');
    expect(body).toContain("otpError.value = '登录状态已失效，请重新验证。'");
    expect(body).toContain('otpSentAt.value = 0');
    expect(body).toContain("otpSentTo.value = ''");
  });

  it('头像上传有互斥锁，成功后清 blob 避免完成态重复上传', () => {
    const body = bodyOf('flushPendingAvatar');
    expect(body).toContain('isAvatarUploading.value');
    expect(body).toContain('formData.avatarBlob = null');
    expect(bodyOf('handleSkip')).toContain('isAvatarUploading.value');
  });
});
