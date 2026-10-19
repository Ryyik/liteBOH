// Vitest setup file - provides browser APIs for Node.js test environment
import { vi } from 'vitest';

// ── 干净检出的环境兜底（2026-10-19）─────────────────────────────────────
// prepush --full / CI 对 HEAD 做**干净检出**跑测试，未跟踪的 `.env` 不在那里 ⇒
// `src/utils/supabase-client.js` 在导入期 createClient(supabaseUrl) 因空串直接
// throw `supabaseUrl is required`，16 个传递导入它的测试文件集体爆红（2026-10-19
// prepush --full 实测）。测试里 supabase 一律 mock，不需要真凭据 —— 只在**缺失时**
// 补格式合法的占位值；本地 worktree 有 .env 时保持真值不受影响。
if (!import.meta.env?.VITE_SUPABASE_URL) {
  import.meta.env.VITE_SUPABASE_URL = 'https://unit-test.placeholder.supabase.co';
}
if (!import.meta.env?.VITE_SUPABASE_ANON_KEY) {
  import.meta.env.VITE_SUPABASE_ANON_KEY = 'unit-test-anon-key';
}

// localStorage mock
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index) => Object.keys(store)[index] ?? null)
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });