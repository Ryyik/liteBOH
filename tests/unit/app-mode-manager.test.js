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
  it('defaults invalid storage to stable and writes the root mode marker', async () => {
    localStorage.getItem.mockReturnValueOnce('unknown');
    const { getAppMode, initAppModeManager } = await import('../../src/utils/app-mode-manager.js');

    initAppModeManager();

    expect(getAppMode()).toBe('stable');
    expect(documentElement.dataset.bohAppMode).toBe('stable');
  });

  it('persists a beta selection and notifies mounted consumers', async () => {
    const { setAppMode } = await import('../../src/utils/app-mode-manager.js');

    setAppMode('beta5');

    expect(localStorage.setItem).toHaveBeenCalledWith('boh_app_mode', 'beta5');
    expect(documentElement.dataset.bohAppMode).toBe('beta5');
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'boh:app-mode-changed',
      detail: { mode: 'beta5' }
    }));
  });
});
