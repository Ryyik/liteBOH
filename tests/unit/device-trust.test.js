import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('device-trust', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubWindow(overrides = {}) {
    const mockLocalStorage = {
      _store: {},
      getItem: vi.fn((key) => mockLocalStorage._store[key] || null),
      setItem: vi.fn((key, value) => { mockLocalStorage._store[key] = value; }),
      ...overrides.localStorage,
    };

    const mockCrypto = {
      randomUUID: vi.fn(),
      subtle: {
        digest: vi.fn(),
      },
      ...overrides.crypto,
    };

    vi.stubGlobal('window', {
      localStorage: mockLocalStorage,
      crypto: mockCrypto,
    });

    return { localStorage: mockLocalStorage, crypto: mockCrypto };
  }

  it('generates a hash for the device', async () => {
    const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
    const { crypto: mockCrypto } = stubWindow();
    mockCrypto.randomUUID.mockReturnValue(mockUUID);
    mockCrypto.subtle.digest.mockResolvedValue(new Uint8Array(32).fill(0xAB));

    const { getLoginDeviceIdHash } = await import('../../src/utils/device-trust.js');
    const hash = await getLoginDeviceIdHash();
    expect(hash).toBeTypeOf('string');
    // SHA-256 of the UUID produces a 64-char hex string
    expect(hash.length).toBe(64);
  });

  it('falls back to raw UUID when crypto.subtle unavailable', async () => {
    const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
    const { crypto: mockCrypto } = stubWindow();
    mockCrypto.randomUUID.mockReturnValue(mockUUID);
    // Set subtle to undefined on the window.crypto object
    Object.defineProperty(mockCrypto, 'subtle', { value: undefined, configurable: true });

    const { getLoginDeviceIdHash } = await import('../../src/utils/device-trust.js');
    const hash = await getLoginDeviceIdHash();
    expect(hash).toBe(mockUUID);
  });

  it('returns empty string when no window', async () => {
    // Don't stub window at all - it doesn't exist in node
    vi.unstubAllGlobals();

    const { getLoginDeviceIdHash } = await import('../../src/utils/device-trust.js');
    const hash = await getLoginDeviceIdHash();
    expect(hash).toBe('');
  });

  it('returns empty string when localStorage throws', async () => {
    stubWindow({
      localStorage: {
        getItem: vi.fn(() => { throw new Error('Access denied'); }),
        setItem: vi.fn(),
      },
    });

    const { getLoginDeviceIdHash } = await import('../../src/utils/device-trust.js');
    const hash = await getLoginDeviceIdHash();
    expect(hash).toBe('');
  });

  it('reuses existing device ID from localStorage', async () => {
    const { localStorage: mockLS, crypto: mockCrypto } = stubWindow({
      localStorage: {
        getItem: vi.fn(() => 'existing-device-id'),
        setItem: vi.fn(),
      },
    });
    mockCrypto.subtle.digest.mockResolvedValue(new Uint8Array([0x11, 0x22, 0x33]));

    const { getLoginDeviceIdHash } = await import('../../src/utils/device-trust.js');
    const hash = await getLoginDeviceIdHash();
    expect(hash).toBe('112233');
    expect(mockLS.getItem).toHaveBeenCalled();
  });

  it('generates fallback ID when crypto.randomUUID unavailable', async () => {
    const { localStorage: mockLS, crypto: mockCrypto } = stubWindow();
    Object.defineProperty(mockCrypto, 'randomUUID', { value: undefined, configurable: true });
    Object.defineProperty(mockCrypto, 'subtle', { value: undefined, configurable: true });

    const { getLoginDeviceIdHash } = await import('../../src/utils/device-trust.js');
    const hash = await getLoginDeviceIdHash();
    expect(hash).toBeTypeOf('string');
    // Fallback ID format: boh-{timestamp}-{random}-{random}
    expect(mockLS.setItem).toHaveBeenCalled();
  });
});