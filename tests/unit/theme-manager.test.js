import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DOM globals before module import
const mockSetAttribute = vi.fn();
const mockClassList = { toggle: vi.fn() };
const mockQuerySelectorAll = vi.fn(() => []);
const mockQuerySelector = vi.fn(() => null);
const mockDispatchEvent = vi.fn();
const mockMatchMedia = vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

vi.stubGlobal('document', {
  documentElement: {
    setAttribute: mockSetAttribute,
    classList: mockClassList,
  },
  querySelectorAll: mockQuerySelectorAll,
  querySelector: mockQuerySelector,
});

vi.stubGlobal('window', {
  dispatchEvent: mockDispatchEvent,
  matchMedia: mockMatchMedia,
  localStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
  },
  navigator: { userAgent: '', maxTouchPoints: 0 },
});

vi.mock('../../src/utils/theme-css-loader.js', () => ({
  ensureThemeCSS: vi.fn(() => Promise.resolve()),
}));

let ThemeManager;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  const mod = await import('../../src/utils/theme-manager.js');
  ThemeManager = mod.themeManager.constructor;
});

function createInstance() {
  const tm = new ThemeManager();
  // Stub applyTheme to avoid DOM side effects in non-DOM tests
  const origApply = tm.applyTheme;
  tm.applyTheme = function (theme, pref) {
    this.theme = theme;
    this.preference = pref || this.preference;
  };
  return tm;
}

describe('theme-manager: constructor', () => {
  it('starts with the eighth anniversary MC theme', () => {
    const tm = createInstance();
    expect(tm.theme).toBe('anniversary-mc');
    expect(tm.preference).toBe('anniversary-mc');
    expect(tm.uiStyle).toBe('glass');
    expect(tm.initialized).toBe(false);
  });

  it('starts with empty listeners array', () => {
    const tm = createInstance();
    expect(tm.listeners).toEqual([]);
  });
});

describe('theme-manager: resolveTheme', () => {
  it('returns light for system when system prefers light', () => {
    const tm = createInstance();
    vi.spyOn(tm, 'getSystemTheme').mockReturnValue('light');
    expect(tm.resolveTheme('system')).toBe('light');
  });

  it('returns dark for system when system prefers dark', () => {
    const tm = createInstance();
    vi.spyOn(tm, 'getSystemTheme').mockReturnValue('dark');
    expect(tm.resolveTheme('system')).toBe('dark');
  });

  it('returns preference directly when not system', () => {
    const tm = createInstance();
    expect(tm.resolveTheme('light')).toBe('light');
    expect(tm.resolveTheme('dark')).toBe('dark');
    expect(tm.resolveTheme('home-cat')).toBe('home-cat');
    expect(tm.resolveTheme('anniversary-mc')).toBe('anniversary-mc');
  });

  it('uses current preference when no argument', () => {
    const tm = createInstance();
    tm.preference = 'dark';
    expect(tm.resolveTheme()).toBe('dark');
  });
});

describe('theme-manager: toggle', () => {
  it('toggles from light to dark', () => {
    const tm = createInstance();
    tm.theme = 'light';
    const result = tm.toggle();
    expect(result).toBe('dark');
    expect(tm.theme).toBe('dark');
    expect(tm.preference).toBe('dark');
  });

  it('toggles from dark to light', () => {
    const tm = createInstance();
    tm.theme = 'dark';
    const result = tm.toggle();
    expect(result).toBe('light');
    expect(tm.theme).toBe('light');
    expect(tm.preference).toBe('light');
  });
});

describe('theme-manager: setTheme', () => {
  it('sets theme to light', () => {
    const tm = createInstance();
    tm.theme = 'dark';
    tm.setTheme('light');
    expect(tm.theme).toBe('light');
    expect(tm.preference).toBe('light');
  });

  it('sets theme to dark', () => {
    const tm = createInstance();
    tm.setTheme('dark');
    expect(tm.theme).toBe('dark');
    expect(tm.preference).toBe('dark');
  });

  it('sets theme to home-cat', () => {
    const tm = createInstance();
    tm.setTheme('home-cat');
    expect(tm.theme).toBe('home-cat');
    expect(tm.preference).toBe('home-cat');
  });

  it('sets theme to the eighth anniversary MC theme', () => {
    const tm = createInstance();
    tm.setTheme('anniversary-mc');
    expect(tm.theme).toBe('anniversary-mc');
    expect(tm.preference).toBe('anniversary-mc');
  });

  it('ignores invalid theme values', () => {
    const tm = createInstance();
    tm.theme = 'light';
    tm.preference = 'light';
    tm.setTheme('invalid');
    expect(tm.theme).toBe('light');
    expect(tm.preference).toBe('light');
  });
});

describe('theme-manager: getTheme / getPreference / getUiStyle', () => {
  it('getTheme returns current theme', () => {
    const tm = createInstance();
    tm.theme = 'dark';
    expect(tm.getTheme()).toBe('dark');
  });

  it('getPreference returns current preference', () => {
    const tm = createInstance();
    tm.preference = 'system';
    expect(tm.getPreference()).toBe('system');
  });

  it('getUiStyle returns current uiStyle', () => {
    const tm = createInstance();
    tm.uiStyle = 'flat';
    expect(tm.getUiStyle()).toBe('flat');
  });
});

describe('theme-manager: setUiStyle', () => {
  it('sets uiStyle to flat', () => {
    const tm = createInstance();
    tm.setUiStyle('flat');
    expect(tm.uiStyle).toBe('flat');
  });

  it('sets uiStyle to glass', () => {
    const tm = createInstance();
    tm.uiStyle = 'flat';
    tm.setUiStyle('glass');
    expect(tm.uiStyle).toBe('glass');
  });

  it('ignores invalid uiStyle values', () => {
    const tm = createInstance();
    tm.uiStyle = 'glass';
    tm.setUiStyle('invalid');
    expect(tm.uiStyle).toBe('glass');
  });
});

describe('theme-manager: isDark', () => {
  it('returns true when theme is dark', () => {
    const tm = createInstance();
    tm.theme = 'dark';
    expect(tm.isDark()).toBe(true);
  });

  it('returns false when theme is light', () => {
    const tm = createInstance();
    tm.theme = 'light';
    expect(tm.isDark()).toBe(false);
  });
});

describe('theme-manager: resetToSystem', () => {
  it('resets preference to system', () => {
    const tm = createInstance();
    vi.spyOn(tm, 'getSystemTheme').mockReturnValue('light');
    tm.preference = 'dark';
    tm.theme = 'dark';
    tm.resetToSystem();
    expect(tm.preference).toBe('system');
  });
});

describe('theme-manager: addListener / removeListener', () => {
  it('adds and notifies listeners', () => {
    const tm = createInstance();
    const cb = vi.fn();
    tm.addListener(cb);
    tm.notifyListeners('dark', 'dark', 'glass');
    expect(cb).toHaveBeenCalledWith('dark', 'dark', 'glass');
  });

  it('removes listener', () => {
    const tm = createInstance();
    const cb = vi.fn();
    tm.addListener(cb);
    tm.removeListener(cb);
    tm.notifyListeners('dark', 'dark', 'glass');
    expect(cb).not.toHaveBeenCalled();
  });

  it('ignores non-function callbacks', () => {
    const tm = createInstance();
    tm.addListener('not a function');
    expect(tm.listeners).toHaveLength(0);
  });

  it('handles listener errors gracefully', () => {
    const tm = createInstance();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badCb = vi.fn(() => { throw new Error('listener error'); });
    const goodCb = vi.fn();
    tm.addListener(badCb);
    tm.addListener(goodCb);
    tm.notifyListeners('dark', 'dark', 'glass');
    expect(goodCb).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('theme-manager: init', () => {
  it('does not re-initialize', () => {
    const tm = createInstance();
    tm.initialized = true;
    tm.init();
    tm.initialized = true;
    // Second call should be no-op
    tm.init();
    expect(tm.initialized).toBe(true);
  });
});
