import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_TIMEOUT_MS,
  ACTION_RETRY_DELAY_MS,
  MAX_ACTION_RETRY_COUNT,
  KEYWORD_CACHE_MAX_SIZE,
  MEMORY_CACHE_TTL_MS,
  ROUTE_DECISION_CACHE_MAX_SIZE,
  EVIDENCE_SOURCE_WEIGHTS,
  RANKING_SCORE_WEIGHTS,
  CIRCUIT_BREAKER,
  BOHAI_ERROR_TYPES,
  BOHAI_ERROR_MESSAGES,
} from '@/utils/bohai-constants.js';

describe('bohai-constants', () => {
  describe('timing constants', () => {
    it('CONNECTOR_TIMEOUT_MS is positive', () => {
      expect(CONNECTOR_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('ACTION_RETRY_DELAY_MS is positive', () => {
      expect(ACTION_RETRY_DELAY_MS).toBeGreaterThan(0);
    });

    it('MAX_ACTION_RETRY_COUNT is positive', () => {
      expect(MAX_ACTION_RETRY_COUNT).toBeGreaterThan(0);
    });

    it('MEMORY_CACHE_TTL_MS is 10 minutes', () => {
      expect(MEMORY_CACHE_TTL_MS).toBe(10 * 60 * 1000);
    });
  });

  describe('cache size constants', () => {
    it('KEYWORD_CACHE_MAX_SIZE is defined', () => {
      expect(KEYWORD_CACHE_MAX_SIZE).toBeGreaterThan(0);
    });

    it('ROUTE_DECISION_CACHE_MAX_SIZE is defined', () => {
      expect(ROUTE_DECISION_CACHE_MAX_SIZE).toBeGreaterThan(0);
    });
  });

  describe('EVIDENCE_SOURCE_WEIGHTS', () => {
    it('has all expected source keys', () => {
      expect(EVIDENCE_SOURCE_WEIGHTS).toHaveProperty('userPrivate');
      expect(EVIDENCE_SOURCE_WEIGHTS).toHaveProperty('cloud');
      expect(EVIDENCE_SOURCE_WEIGHTS).toHaveProperty('forum');
      expect(EVIDENCE_SOURCE_WEIGHTS).toHaveProperty('sharedMemory');
      expect(EVIDENCE_SOURCE_WEIGHTS).toHaveProperty('knowledge');
      expect(EVIDENCE_SOURCE_WEIGHTS).toHaveProperty('siteGuide');
    });

    it('all weights are positive numbers', () => {
      Object.values(EVIDENCE_SOURCE_WEIGHTS).forEach((weight) => {
        expect(typeof weight).toBe('number');
        expect(weight).toBeGreaterThan(0);
      });
    });
  });

  describe('RANKING_SCORE_WEIGHTS', () => {
    it('has all expected keys', () => {
      expect(RANKING_SCORE_WEIGHTS).toHaveProperty('lexicalMultiplier');
      expect(RANKING_SCORE_WEIGHTS).toHaveProperty('defaultSourceScore');
      expect(RANKING_SCORE_WEIGHTS).toHaveProperty('confidenceMultiplier');
    });
  });

  describe('CIRCUIT_BREAKER', () => {
    it('has failure threshold, window and reset window', () => {
      expect(CIRCUIT_BREAKER.failureThreshold).toBeGreaterThan(0);
      expect(CIRCUIT_BREAKER.failureWindowMs).toBeGreaterThan(0);
      expect(CIRCUIT_BREAKER.resetWindowMs).toBeGreaterThan(0);
    });

    it('reset window is greater than failure window', () => {
      expect(CIRCUIT_BREAKER.resetWindowMs).toBeGreaterThan(
        CIRCUIT_BREAKER.failureWindowMs
      );
    });
  });

  describe('BOHAI_ERROR_TYPES', () => {
    it('has all expected error types', () => {
      expect(BOHAI_ERROR_TYPES.NETWORK_ERROR).toBe('network_error');
      expect(BOHAI_ERROR_TYPES.AUTH_ERROR).toBe('auth_error');
      expect(BOHAI_ERROR_TYPES.LOGIN_REQUIRED).toBe('login_required');
      expect(BOHAI_ERROR_TYPES.TIMEOUT_ERROR).toBe('timeout_error');
      expect(BOHAI_ERROR_TYPES.VALIDATION_ERROR).toBe('validation_error');
      expect(BOHAI_ERROR_TYPES.EXECUTION_ERROR).toBe('execution_error');
      expect(BOHAI_ERROR_TYPES.UNKNOWN_ERROR).toBe('unknown_error');
    });
  });

  describe('BOHAI_ERROR_MESSAGES', () => {
    it('has actionNotFound message', () => {
      expect(BOHAI_ERROR_MESSAGES.actionNotFound).toBeTruthy();
    });

    it('has loginRequired message', () => {
      expect(BOHAI_ERROR_MESSAGES.loginRequired).toBeTruthy();
    });
  });
});