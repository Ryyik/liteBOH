import { beforeEach, describe, expect, it, vi } from 'vitest';

const localStorage = (() => {
  let values = new Map();
  return {
    getItem: vi.fn((key) => values.get(key) || null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    clear: () => { values = new Map(); }
  };
})();

const documentElement = { dataset: {} };
const addEventListener = vi.fn();
const dispatchEvent = vi.fn();

vi.stubGlobal('document', { documentElement, createElement: vi.fn(() => ({})) });
vi.stubGlobal('window', { localStorage, addEventListener, dispatchEvent });
vi.stubGlobal('CustomEvent', class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  documentElement.dataset = {};
});

describe('app-mode-manager', () => {
  it('migrates legacy mode storage to the released Beta 5 default', async () => {
    localStorage.setItem('boh_app_mode', 'stable');
    const { getAppMode, initAppModeManager } = await import('../../src/utils/app-mode-manager.js');

    initAppModeManager();

    expect(getAppMode()).toBe('beta5');
    expect(documentElement.dataset.bohAppMode).toBe('beta5');
    expect(localStorage.setItem).toHaveBeenCalledWith('boh_app_mode', 'beta5');
    expect(localStorage.setItem).toHaveBeenCalledWith('boh_app_mode_release', 'beta5-default');
  });

  it('keeps a user-selected 4.9.1 fallback after the release migration', async () => {
    localStorage.setItem('boh_app_mode_release', 'beta5-default');
    localStorage.setItem('boh_app_mode', 'stable');
    const { getAppMode, initAppModeManager } = await import('../../src/utils/app-mode-manager.js');

    initAppModeManager();

    expect(getAppMode()).toBe('stable');
    expect(documentElement.dataset.bohAppMode).toBe('stable');
  });

  it('persists a user-selected 4.9.1 fallback and notifies mounted consumers', async () => {
    const { setAppMode } = await import('../../src/utils/app-mode-manager.js');

    setAppMode('stable');

    expect(localStorage.setItem).toHaveBeenCalledWith('boh_app_mode', 'stable');
    expect(documentElement.dataset.bohAppMode).toBe('stable');
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'boh:app-mode-changed',
      detail: { mode: 'stable' }
    }));
  });
});
