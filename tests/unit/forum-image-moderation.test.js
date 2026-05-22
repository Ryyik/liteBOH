import { describe, expect, it } from 'vitest';
import { classifyNsfwPredictions } from '../../src/utils/forum-image-moderation.js';

describe('forum-image-moderation', () => {
  it('approves low-risk images', () => {
    const result = classifyNsfwPredictions([
      { className: 'Neutral', probability: 0.93 },
      { className: 'Drawing', probability: 0.04 },
      { className: 'Sexy', probability: 0.02 },
      { className: 'Porn', probability: 0.005 },
      { className: 'Hentai', probability: 0.005 }
    ]);

    expect(result.status).toBe('approved');
  });

  it('rejects obvious porn or hentai predictions', () => {
    const result = classifyNsfwPredictions([
      { className: 'Neutral', probability: 0.05 },
      { className: 'Porn', probability: 0.7 },
      { className: 'Hentai', probability: 0.02 },
      { className: 'Sexy', probability: 0.2 }
    ]);

    expect(result.status).toBe('rejected');
  });

  it('flags borderline sexy images as review-needed', () => {
    const result = classifyNsfwPredictions([
      { className: 'Neutral', probability: 0.2 },
      { className: 'Sexy', probability: 0.7 },
      { className: 'Porn', probability: 0.08 },
      { className: 'Hentai', probability: 0.04 }
    ]);

    expect(result.status).toBe('needs_review');
  });
});
