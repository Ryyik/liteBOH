import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers – create fresh DOM/API mocks for each test
// ---------------------------------------------------------------------------

function createMocks() {
  const visibilityListeners = [];
  const errorListeners = [];
  const rejectionListeners = [];
  const observerCallbacks = [];
  const observeCalls = [];
  const disconnectCalls = [];

  const mockNavigator = {
    sendBeacon: vi.fn(() => true),
    userAgent: 'MockAgent/1.0',
  };

  const mockDocument = {
    addEventListener: vi.fn((type, handler, options) => {
      if (type === 'visibilitychange') {
        visibilityListeners.push({ handler, options });
      }
    }),
    visibilityState: 'visible',
  };

  const mockWindow = {
    addEventListener: vi.fn((type, handler) => {
      if (type === 'error') {
        errorListeners.push(handler);
      } else if (type === 'unhandledrejection') {
        rejectionListeners.push(handler);
      }
    }),
    location: { href: 'https://example.com/page' },
    document: mockDocument,
    navigator: mockNavigator,
  };

  function stubAll() {
    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('document', mockDocument);
    vi.stubGlobal('navigator', mockNavigator);
    vi.stubGlobal(
      'PerformanceObserver',
      vi.fn((callback) => {
        const instance = {
          observe: vi.fn((options) => {
            observeCalls.push(options);
          }),
          disconnect: vi.fn(() => {
            disconnectCalls.push(instance);
          }),
        };
        observerCallbacks.push({ callback, instance });
        return instance;
      }),
    );
  }

  return {
    mockWindow,
    mockDocument,
    mockNavigator,
    visibilityListeners,
    errorListeners,
    rejectionListeners,
    observerCallbacks,
    observeCalls,
    disconnectCalls,
    stubAll,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('monitoring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // =====================================================================
  // initMonitoring – early return
  // =====================================================================
  describe('initMonitoring', () => {
    it('returns early when window is undefined', async () => {
      // No window stub → typeof window === 'undefined'
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');

      const { initMonitoring } = await import('../../src/utils/monitoring.js');

      // Should not throw, should not try to access window
      expect(() => initMonitoring()).not.toThrow();
    });

    it('registers window error event listener', async () => {
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      expect(mocks.mockWindow.addEventListener).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
    });

    it('registers window unhandledrejection event listener', async () => {
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      expect(mocks.mockWindow.addEventListener).toHaveBeenCalledWith(
        'unhandledrejection',
        expect.any(Function),
      );
    });

    it('calls initWebVitalsLite (observes web vitals)', async () => {
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Three PerformanceObservers should be created: LCP, CLS, INP
      expect(mocks.observerCallbacks.length).toBe(3);
    });
  });

  // =====================================================================
  // initMonitoring – error event → sendMetric
  // =====================================================================
  describe('error event handler', () => {
    it('sends runtime_error metric via navigator.sendBeacon', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Simulate an error event
      const errorEvent = {
        message: 'TypeError: foo is not a function',
        filename: 'https://example.com/app.js',
        lineno: 42,
        colno: 7,
      };
      mocks.errorListeners[0](errorEvent);

      expect(mocks.mockNavigator.sendBeacon).toHaveBeenCalledTimes(1);

      const [url, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      expect(url).toBe('https://telemetry.example.com/v1');

      const parsed = JSON.parse(body);
      expect(parsed.type).toBe('runtime_error');
      expect(parsed.message).toBe('TypeError: foo is not a function');
      expect(parsed.source).toBe('https://example.com/app.js');
      expect(parsed.line).toBe(42);
      expect(parsed.col).toBe(7);
      expect(parsed.ts).toBeTypeOf('number');
      expect(parsed.url).toBe('https://example.com/page');
      expect(parsed.ua).toBe('MockAgent/1.0');
    });

    it('logs via logger.error for error events', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      const errorEvent = {
        message: 'Test error',
        filename: 'test.js',
        lineno: 1,
        colno: 1,
      };
      mocks.errorListeners[0](errorEvent);

      // navigator.sendBeacon should have been called
      expect(mocks.mockNavigator.sendBeacon).toHaveBeenCalled();
    });

    it('handles error events without a message gracefully', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      const errorEvent = {
        message: undefined,
        filename: undefined,
        lineno: undefined,
        colno: undefined,
      };
      // Should not throw
      expect(() => mocks.errorListeners[0](errorEvent)).not.toThrow();

      expect(mocks.mockNavigator.sendBeacon).toHaveBeenCalledTimes(1);
      const [, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      const parsed = JSON.parse(body);
      expect(parsed.type).toBe('runtime_error');
    });
  });

  // =====================================================================
  // initMonitoring – unhandledrejection → sendMetric
  // =====================================================================
  describe('unhandledrejection event handler', () => {
    it('sends unhandled_rejection metric with Error reason', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      const rejectionEvent = {
        reason: new Error('Promise rejected'),
      };
      mocks.rejectionListeners[0](rejectionEvent);

      expect(mocks.mockNavigator.sendBeacon).toHaveBeenCalledTimes(1);

      const [, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      const parsed = JSON.parse(body);
      expect(parsed.type).toBe('unhandled_rejection');
      expect(parsed.message).toBe('Promise rejected');
      expect(parsed.ts).toBeTypeOf('number');
    });

    it('handles string rejection reason', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      mocks.rejectionListeners[0]({ reason: 'just a string' });

      const [, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      const parsed = JSON.parse(body);
      expect(parsed.type).toBe('unhandled_rejection');
      expect(parsed.message).toBe('just a string');
    });

    it('handles undefined/null rejection reason with fallback', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      mocks.rejectionListeners[0]({ reason: undefined });

      const [, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      const parsed = JSON.parse(body);
      expect(parsed.type).toBe('unhandled_rejection');
      expect(parsed.message).toBe('unknown');
    });
  });

  // =====================================================================
  // sendMetric – early returns
  // =====================================================================
  describe('sendMetric (via error handler)', () => {
    it('skips sending when MONITORING_ENDPOINT is not set', async () => {
      // Explicitly unset the env var that may have been set by previous tests
      vi.stubEnv('VITE_MONITORING_ENDPOINT', undefined);
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      mocks.errorListeners[0]({
        message: 'should not send',
        filename: 'x.js',
        lineno: 1,
        colno: 1,
      });

      expect(mocks.mockNavigator.sendBeacon).not.toHaveBeenCalled();
    });

    it('skips sending when navigator is not available', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');

      // Stub window but NOT navigator
      vi.stubGlobal('window', {
        addEventListener: vi.fn(),
        location: { href: 'https://example.com/' },
      });
      vi.stubGlobal('document', { addEventListener: vi.fn() });
      // navigator is undefined

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Should not throw, nor call sendBeacon (because navigator is undefined)
      const errorHandler = vi.mocked(window).addEventListener.mock.calls.find(
        ([type]) => type === 'error',
      )?.[1];

      expect(() =>
        errorHandler({
          message: 'error',
          filename: 'f.js',
          lineno: 1,
          colno: 1,
        }),
      ).not.toThrow();
    });
  });

  // =====================================================================
  // sendMetric – payload shape
  // =====================================================================
  describe('sendMetric payload', () => {
    it('includes ts, url, ua in every payload', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      mocks.errorListeners[0]({
        message: 'payload check',
        filename: 'p.js',
        lineno: 10,
        colno: 5,
      });

      const [, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      const parsed = JSON.parse(body);

      // Common fields always present
      expect(typeof parsed.ts).toBe('number');
      expect(parsed.url).toBe('https://example.com/page');
      expect(parsed.ua).toBe('MockAgent/1.0');
    });

    it('logs warning when sendBeacon throws', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.mockNavigator.sendBeacon = vi.fn(() => {
        throw new Error('Beacon failed');
      });
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Should not throw – error is caught internally
      expect(() =>
        mocks.errorListeners[0]({
          message: 'test',
          filename: 't.js',
          lineno: 1,
          colno: 1,
        }),
      ).not.toThrow();
    });
  });

  // =====================================================================
  // initWebVitalsLite – graceful degradation
  // =====================================================================
  describe('initWebVitalsLite graceful degradation', () => {
    it('returns early when PerformanceObserver is undefined', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      // Stub everything except PerformanceObserver
      vi.stubGlobal('window', mocks.mockWindow);
      vi.stubGlobal('document', mocks.mockDocument);
      vi.stubGlobal('navigator', mocks.mockNavigator);
      // PerformanceObserver not stubbed → typeof PerformanceObserver === 'undefined'

      const { initMonitoring } = await import('../../src/utils/monitoring.js');

      // Should not throw
      expect(() => initMonitoring()).not.toThrow();
      // No observers created
      expect(mocks.observerCallbacks.length).toBe(0);
    });

    it('wraps each observer in try/catch – survives observe throwing', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();

      // PerformanceObserver that throws on observe()
      vi.stubGlobal(
        'PerformanceObserver',
        vi.fn(() => ({
          observe: vi.fn(() => {
            throw new Error('observe not supported');
          }),
          disconnect: vi.fn(),
        })),
      );
      vi.stubGlobal('window', mocks.mockWindow);
      vi.stubGlobal('document', mocks.mockDocument);
      vi.stubGlobal('navigator', mocks.mockNavigator);

      const { initMonitoring } = await import('../../src/utils/monitoring.js');

      // Should not throw – all three observers are wrapped in try/catch
      expect(() => initMonitoring()).not.toThrow();
    });
  });

  // =====================================================================
  // initWebVitalsLite – LCP
  // =====================================================================
  describe('initWebVitalsLite – LCP', () => {
    it('observes largest-contentful-paint with buffered: true', async () => {
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // First observer = LCP
      const lcpCall = mocks.observeCalls[0];
      expect(lcpCall).toEqual({ type: 'largest-contentful-paint', buffered: true });
    });

    it('sends LCP metric on visibilitychange to hidden', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Feed LCP entry into the first observer callback
      const lcpEntry = { startTime: 1234.5 };
      mocks.observerCallbacks[0].callback({
        getEntries: () => [lcpEntry],
      });

      // Set visibility to hidden and fire the handler
      mocks.mockDocument.visibilityState = 'hidden';
      const lcpVisibilityHandler = mocks.visibilityListeners.find(
        (l) => l.options?.once === true,
      );
      lcpVisibilityHandler.handler();

      expect(mocks.mockNavigator.sendBeacon).toHaveBeenCalledTimes(1);
      const [, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      const parsed = JSON.parse(body);
      expect(parsed.type).toBe('web_vital');
      expect(parsed.name).toBe('LCP');
      expect(parsed.value).toBe(1234.5);
    });

    it('does not send LCP when value is 0', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // No entry fed → lcpValue stays 0
      mocks.mockDocument.visibilityState = 'hidden';
      // Find the LCP visibility handler (first one registered with { once: true })
      const lcpHandler = mocks.visibilityListeners[0];
      lcpHandler.handler();

      expect(mocks.mockNavigator.sendBeacon).not.toHaveBeenCalled();
    });

    it('disconnects LCP observer after sending', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Feed an entry
      mocks.observerCallbacks[0].callback({
        getEntries: () => [{ startTime: 500 }],
      });

      mocks.mockDocument.visibilityState = 'hidden';
      mocks.visibilityListeners[0].handler();

      // disconnect should have been called on the LCP observer instance
      expect(mocks.observerCallbacks[0].instance.disconnect).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // initWebVitalsLite – CLS
  // =====================================================================
  describe('initWebVitalsLite – CLS', () => {
    it('observes layout-shift with buffered: true', async () => {
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Second observer = CLS
      const clsCall = mocks.observeCalls[1];
      expect(clsCall).toEqual({ type: 'layout-shift', buffered: true });
    });

    it('accumulates layout-shift values excluding hadRecentInput', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Feed CLS entries – one with hadRecentInput (should be skipped)
      mocks.observerCallbacks[1].callback({
        getEntries: () => [
          { value: 0.1, hadRecentInput: false },
          { value: 0.05, hadRecentInput: true },
          { value: 0.2, hadRecentInput: false },
        ],
      });

      mocks.mockDocument.visibilityState = 'hidden';
      // CLS handler is registered second
      mocks.visibilityListeners[1].handler();

      expect(mocks.mockNavigator.sendBeacon).toHaveBeenCalledTimes(1);
      const [, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      const parsed = JSON.parse(body);
      expect(parsed.type).toBe('web_vital');
      expect(parsed.name).toBe('CLS');
      // 0.1 + 0.2 = 0.3 (0.05 skipped because hadRecentInput)
      expect(parsed.value).toBeCloseTo(0.3);
    });

    it('disconnects CLS observer after sending', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      mocks.mockDocument.visibilityState = 'hidden';
      mocks.visibilityListeners[1].handler();

      expect(mocks.observerCallbacks[1].instance.disconnect).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // initWebVitalsLite – INP
  // =====================================================================
  describe('initWebVitalsLite – INP', () => {
    it('observes event type with buffered and durationThreshold', async () => {
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Third observer = INP
      const inpCall = mocks.observeCalls[2];
      expect(inpCall).toEqual({ type: 'event', buffered: true, durationThreshold: 16 });
    });

    it('tracks maximum event duration as INP', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Feed event entries
      mocks.observerCallbacks[2].callback({
        getEntries: () => [
          { duration: 50, name: 'click', entryType: 'event' },
          { duration: 120, name: 'keydown', entryType: 'event' },
          { duration: 80, name: 'pointerdown', entryType: 'event' },
        ],
      });

      mocks.mockDocument.visibilityState = 'hidden';
      // INP handler is registered third
      mocks.visibilityListeners[2].handler();

      expect(mocks.mockNavigator.sendBeacon).toHaveBeenCalledTimes(1);
      const [, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      const parsed = JSON.parse(body);
      expect(parsed.type).toBe('web_vital');
      expect(parsed.name).toBe('INP');
      expect(parsed.value).toBe(120);
    });

    it('does not send INP when value is 0', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // No entries → inpValue stays 0
      mocks.mockDocument.visibilityState = 'hidden';
      mocks.visibilityListeners[2].handler();

      expect(mocks.mockNavigator.sendBeacon).not.toHaveBeenCalled();
    });

    it('disconnects INP observer after sending', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Feed an entry so inpValue > 0
      mocks.observerCallbacks[2].callback({
        getEntries: () => [{ duration: 16 }],
      });

      mocks.mockDocument.visibilityState = 'hidden';
      mocks.visibilityListeners[2].handler();

      expect(mocks.observerCallbacks[2].instance.disconnect).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // Edge cases
  // =====================================================================
  describe('edge cases', () => {
    it('handles JSON.stringify failure in sendMetric', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();

      // Create a circular reference that JSON.stringify cannot handle
      const circularObj = {};
      circularObj.self = circularObj;

      mocks.stubAll();
      // Override window.location to be a circular object
      mocks.mockWindow.location = circularObj;

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Should not throw
      expect(() =>
        mocks.errorListeners[0]({
          message: 'test',
          filename: 'f.js',
          lineno: 1,
          colno: 1,
        }),
      ).not.toThrow();
    });

    it('handles rejection with Error having no message', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      const err = new Error();
      err.message = ''; // empty message → falls back to String(reason)
      mocks.rejectionListeners[0]({ reason: err });

      const [, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      const parsed = JSON.parse(body);
      expect(parsed.type).toBe('unhandled_rejection');
      expect(parsed.message).toBe('Error');
    });

    it('tolerates missing document.addEventListener (very old browser)', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');

      // Stub document without addEventListener
      vi.stubGlobal('window', {
        addEventListener: vi.fn(),
        location: { href: 'https://example.com/' },
      });
      vi.stubGlobal('document', {});
      vi.stubGlobal('navigator', { sendBeacon: vi.fn(), userAgent: 'old' });
      vi.stubGlobal('PerformanceObserver', vi.fn(() => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
      })));

      const { initMonitoring } = await import('../../src/utils/monitoring.js');

      // Should not throw when trying to attach visibility listeners
      expect(() => initMonitoring()).not.toThrow();
    });

    it('tolerates PerformanceObserver constructor throwing', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();

      vi.stubGlobal(
        'PerformanceObserver',
        vi.fn(() => {
          throw new Error('PerformanceObserver not supported');
        }),
      );
      vi.stubGlobal('window', mocks.mockWindow);
      vi.stubGlobal('document', mocks.mockDocument);
      vi.stubGlobal('navigator', mocks.mockNavigator);

      const { initMonitoring } = await import('../../src/utils/monitoring.js');

      // Each try/catch should catch the constructor error
      expect(() => initMonitoring()).not.toThrow();
    });

    it('event entries without duration property are ignored in INP', async () => {
      vi.stubEnv('VITE_MONITORING_ENDPOINT', 'https://telemetry.example.com/v1');
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // Feed entries where only some have duration
      mocks.observerCallbacks[2].callback({
        getEntries: () => [
          { name: 'a' }, // no duration
          { duration: 60, name: 'b' },
          { name: 'c' }, // no duration
          { duration: 30, name: 'd' },
        ],
      });

      mocks.mockDocument.visibilityState = 'hidden';
      mocks.visibilityListeners[2].handler();

      expect(mocks.mockNavigator.sendBeacon).toHaveBeenCalledTimes(1);
      const [, body] = mocks.mockNavigator.sendBeacon.mock.calls[0];
      const parsed = JSON.parse(body);
      expect(parsed.value).toBe(60);
    });

    it('visibility listener has { once: true } option', async () => {
      const mocks = createMocks();
      mocks.stubAll();

      const { initMonitoring } = await import('../../src/utils/monitoring.js');
      initMonitoring();

      // All three visibilitychange listeners should be registered with { once: true }
      const visibilityCalls = mocks.mockDocument.addEventListener.mock.calls.filter(
        ([type]) => type === 'visibilitychange',
      );
      expect(visibilityCalls.length).toBe(3);

      for (const [, , options] of visibilityCalls) {
        expect(options).toEqual({ once: true });
      }
    });
  });
});