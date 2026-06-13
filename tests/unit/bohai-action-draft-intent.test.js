import { describe, it, expect } from 'vitest';
import {
  normalizeActionDecisionText,
  isActionDraftCancelIntent,
  isPostDraftConfirmIntent,
  isPostDraftRequest
} from '../../src/utils/bohai-action-draft-intent.js';

describe('bohai action draft intent: normalization', () => {
  it('normalizes spaces and punctuation for intent matching', () => {
    expect(normalizeActionDecisionText('  好的， 就按这个发吧！  ')).toBe('好的就按这个发吧');
    expect(normalizeActionDecisionText('确认发送。')).toBe('确认发送');
  });
});

describe('bohai action draft intent: request detection', () => {
  it('detects post draft requests while keeping operation questions out', () => {
    expect(isPostDraftRequest('帮我发帖 标题：活动总结 内容：今天我们...')).toBe(true);
    expect(isPostDraftRequest('怎么发帖')).toBe(false);
  });
});

describe('bohai action draft intent: cancel and confirm', () => {
  it('recognizes cancel expressions in natural language', () => {
    expect(isActionDraftCancelIntent('取消')).toBe(true);
    expect(isActionDraftCancelIntent('先别发')).toBe(true);
    expect(isActionDraftCancelIntent('算了吧')).toBe(true);
  });

  it('supports natural post confirm phrases and avoids question false-positives', () => {
    expect(isPostDraftConfirmIntent('就发这个')).toBe(true);
    expect(isPostDraftConfirmIntent('发吧')).toBe(true);
    expect(isPostDraftConfirmIntent('可以，就按这个发帖')).toBe(true);
    expect(isPostDraftConfirmIntent('可以帮我发帖吗')).toBe(false);
    expect(isPostDraftConfirmIntent('先别发')).toBe(false);
  });
});
