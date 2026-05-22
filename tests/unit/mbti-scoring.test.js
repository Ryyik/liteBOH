import { describe, it, expect } from 'vitest';
import {
  createEmptyScores,
  calculateScores,
  deriveMbtiType,
  buildMbtiDimensions,
  getFirstUnansweredQuestionId,
} from '../../src/utils/mbti-scoring.js';

describe('mbti-scoring', () => {
  it('creates empty score buckets', () => {
    expect(createEmptyScores()).toEqual({ E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 });
  });

  it('calculates scores and supports reverse scoring', () => {
    const questions = [
      { id: 1, dimension: 'E', reverse: false },
      { id: 2, dimension: 'I', reverse: true },
      { id: 3, dimension: 'J', reverse: false },
    ];

    const answers = { 1: 5, 2: 1, 3: 4 };
    const scores = calculateScores(questions, answers);

    expect(scores.E).toBe(5);
    expect(scores.I).toBe(5);
    expect(scores.J).toBe(4);
  });

  it('derives MBTI type with correct J/P polarity', () => {
    const type = deriveMbtiType({ E: 10, I: 8, S: 6, N: 9, T: 12, F: 4, J: 11, P: 7 });
    expect(type).toBe('ENTJ');
  });

  it('builds dimension summaries with percentage and direction', () => {
    const dimensions = buildMbtiDimensions({ E: 9, I: 3, S: 4, N: 8, T: 5, F: 5, J: 2, P: 6 });
    const ei = dimensions.find((item) => item.key === 'EI');
    const sn = dimensions.find((item) => item.key === 'SN');

    expect(ei.percentage).toBe(75);
    expect(ei.isRight).toBe(false);
    expect(sn.percentage).toBe(67);
    expect(sn.isRight).toBe(true);
  });

  it('finds the first unanswered question id', () => {
    const questions = [{ id: 1 }, { id: 2 }, { id: 3 }];

    expect(getFirstUnansweredQuestionId(questions, { 1: 5, 3: 2 })).toBe(2);
    expect(getFirstUnansweredQuestionId(questions, { 1: 5, 2: 4, 3: 2 })).toBe(null);
  });
});
