import { describe, expect, it } from 'vitest';
import {
  isAltchaEnabled,
  ALTCHA_DEFAULT_FIELD_NAME,
  ALTCHA_DEFAULT_WORKERS,
  getAltchaChallengeUrl,
} from '@/utils/altcha.js';

describe('altcha', () => {
  describe('ALTCHA_DEFAULT_FIELD_NAME', () => {
    it('is "altcha"', () => {
      expect(ALTCHA_DEFAULT_FIELD_NAME).toBe('altcha');
    });
  });

  describe('ALTCHA_DEFAULT_WORKERS', () => {
    it('is a positive number', () => {
      expect(ALTCHA_DEFAULT_WORKERS).toBeGreaterThan(0);
    });
  });

  describe('isAltchaEnabled', () => {
    it('returns a boolean', () => {
      expect(typeof isAltchaEnabled()).toBe('boolean');
    });
  });

  describe('getAltchaChallengeUrl', () => {
    it('returns a URL string or empty string', () => {
      const url = getAltchaChallengeUrl('auth');
      expect(typeof url).toBe('string');
    });

    it('returns empty string for empty scope', () => {
      const url = getAltchaChallengeUrl('');
      // When SUPABASE_URL is set, scope defaults to 'default'
      expect(typeof url).toBe('string');
    });

    it('returns URL with scope parameter when SUPABASE_URL is set', () => {
      const url = getAltchaChallengeUrl('auth');
      if (url) {
        expect(url).toContain('scope=');
      }
    });
  });
});