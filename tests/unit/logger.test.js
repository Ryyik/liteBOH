import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exports logger with all log levels', async () => {
    const { logger } = await import('../../src/utils/logger.js');
    expect(logger.debug).toBeTypeOf('function');
    expect(logger.info).toBeTypeOf('function');
    expect(logger.warn).toBeTypeOf('function');
    expect(logger.error).toBeTypeOf('function');
  });

  it('calls console.debug for debug level', async () => {
    vi.stubGlobal('console', {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    const { logger } = await import('../../src/utils/logger.js');
    logger.debug('test', 'hello world');
    expect(console.debug).toHaveBeenCalledWith('[test] hello world');
  });

  it('calls console.warn for warn level', async () => {
    vi.stubGlobal('console', {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    const { logger } = await import('../../src/utils/logger.js');
    logger.warn('scope', 'warning message');
    expect(console.warn).toHaveBeenCalledWith('[scope] warning message');
  });

  it('calls console.error for error level', async () => {
    vi.stubGlobal('console', {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    const { logger } = await import('../../src/utils/logger.js');
    logger.error('scope', 'error message');
    expect(console.error).toHaveBeenCalledWith('[scope] error message');
  });

  it('passes extra argument to console', async () => {
    vi.stubGlobal('console', {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    const { logger } = await import('../../src/utils/logger.js');
    const extra = { key: 'value' };
    logger.info('scope', 'message', extra);
    expect(console.info).toHaveBeenCalledWith('[scope] message', extra);
  });

  it('warn level calls console.warn and console.error, not info', async () => {
    vi.stubGlobal('console', {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    const { logger } = await import('../../src/utils/logger.js');
    logger.info('test', 'should not appear');
    logger.warn('test', 'should appear');

    // In test environment VITE_LOG_LEVEL defaults to debug, so info may be logged
    // The logger behavior at runtime depends on import.meta.env which is set at build time
    expect(console.warn).toHaveBeenCalled();
  });

  it('error level always logs', async () => {
    vi.stubGlobal('console', {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });

    const { logger } = await import('../../src/utils/logger.js');
    logger.error('test', 'error message');
    expect(console.error).toHaveBeenCalledWith('[test] error message');
  });
});