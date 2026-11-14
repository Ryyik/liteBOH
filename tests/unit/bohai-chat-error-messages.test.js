import { describe, expect, it } from 'vitest';
import {
  CHAT_ERROR_KINDS,
  CHAT_ERROR_MESSAGES,
  classifyChatError,
  errorTextOf,
  isGenerationErrorText,
  sanitizeErrorDetail,
} from '@/views/BOHAI/utils/chatErrorMessages.js';

/**
 * 聊天错误文案（2026-11-12 用户报障）。
 *
 * 用户截图里的原文：
 *   服务暂时繁忙，请稍后再试。
 *   详情：{"error":{"code":"1302","message":"您的账户已达到速率限制，请您控制请求频率"}}
 *
 * 口径：遇到速率问题要显示「我们遇到速率问题，请重试。本次不扣减额度。」，
 * 不再把上游的 code / JSON 甩给用户；同时任务面板必须把这条判成「失败」而不是「已完成」。
 */
describe('BOHAI 聊天错误：归类与文案', () => {
  it('智谱 1302（整段 JSON 当 message 抛上来）→ rate-limit', () => {
    const raw = '{"error":{"code":"1302","message":"您的账户已达到速率限制，请您控制请求频率"}}';
    expect(classifyChatError(new Error(raw))).toBe(CHAT_ERROR_KINDS.RATE_LIMIT);
    expect(classifyChatError(raw)).toBe(CHAT_ERROR_KINDS.RATE_LIMIT);
  });

  it('各家限流形态都归到 rate-limit（不靠单一字面量）', () => {
    for (const text of [
      'rate limit exceeded',
      'Too Many Requests',
      'HTTP 429',
      '请求过于频繁，请稍后',
      'RPM 超出限制',
    ]) {
      expect(classifyChatError(text), text).toBe(CHAT_ERROR_KINDS.RATE_LIMIT);
    }
  });

  it('我们自己的额度用尽 ≠ 上游限流（不能提示「稍后重试」）', () => {
    expect(classifyChatError('今日 BOH AI Token 额度已用完，明天 0:00 重置')).toBe(
      CHAT_ERROR_KINDS.QUOTA,
    );
    expect(classifyChatError('积分不足：AI 对话将消耗积分，请先签到或领取积分后再使用。')).toBe(
      CHAT_ERROR_KINDS.QUOTA,
    );
  });

  it('鉴权 / 网络各自归类（换模型救不了 401，见 EF 的 shouldFallbackToNextModel）', () => {
    expect(classifyChatError('invalid api key')).toBe(CHAT_ERROR_KINDS.AUTH);
    expect(classifyChatError('Failed to fetch')).toBe(CHAT_ERROR_KINDS.NETWORK);
    expect(classifyChatError('模型服务不可用。')).toBe(CHAT_ERROR_KINDS.UPSTREAM);
    expect(classifyChatError('')).toBe(CHAT_ERROR_KINDS.UNKNOWN);
  });

  it('⭐ 速率问题的文案：说人话 + 明确「本次不扣减额度」', () => {
    const text = CHAT_ERROR_MESSAGES.rateLimited();
    expect(text).toContain('速率问题');
    expect(text).toContain('请重试');
    expect(text).toContain('本次不扣减额度');
    // 不许把上游的 code / JSON 露出来
    expect(text).not.toContain('1302');
    expect(text).not.toMatch(/[{[]/);
  });

  it('详情清洗：整段 JSON 只取 message，SSE 残片也能抽出来', () => {
    expect(
      sanitizeErrorDetail(
        '{"error":{"code":"1302","message":"您的账户已达到速率限制，请您控制请求频率"}}',
      ),
    ).toBe('您的账户已达到速率限制，请您控制请求频率');
    expect(sanitizeErrorDetail('event: error\ndata: {"error":{"message":"上游超时"}}')).toBe(
      '上游超时',
    );
    // 普通文本原样（截断 300）
    expect(sanitizeErrorDetail(new Error('boom'))).toBe('boom');
    expect(sanitizeErrorDetail(null)).toBe('网络请求异常');
    expect(sanitizeErrorDetail('x'.repeat(400))).toHaveLength(300);
  });

  it('errorTextOf：Error / string / 嵌套对象都能取到文本', () => {
    expect(errorTextOf(new Error('a'))).toBe('a');
    expect(errorTextOf('b')).toBe('b');
    expect(errorTextOf({ error: { message: 'c' } })).toBe('c');
    expect(errorTextOf(null)).toBe('');
  });

  it('任务面板的失败判定覆盖新文案（新增失败文案不会再失配成「已完成」）', () => {
    expect(isGenerationErrorText(CHAT_ERROR_MESSAGES.rateLimited())).toBe(true);
    expect(isGenerationErrorText(CHAT_ERROR_MESSAGES.generationFailed('上游炸了'))).toBe(true);
    expect(isGenerationErrorText(CHAT_ERROR_MESSAGES.noValidContent)).toBe(true);
    // 用户主动停止**不是**失败（历史文案也要保持这个极性）
    expect(isGenerationErrorText(CHAT_ERROR_MESSAGES.generationStopped)).toBe(false);
    expect(isGenerationErrorText(CHAT_ERROR_MESSAGES.generationTimeout)).toBe(false);
    expect(isGenerationErrorText('一段正常回答')).toBe(false);
    expect(isGenerationErrorText('')).toBe(false);
  });
});
