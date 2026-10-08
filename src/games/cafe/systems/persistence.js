/**
 * 局内存档（localStorage）—— plans/026 P0-1
 *
 * 旧实现在 index.vue 里散着 3 个 `localStorage.setItem` + 1 处读取，共5 处字符串字面量。
 * 改成单一真源：key 在这里定义，读写都走这里，改名不会漏改。
 *
 * ⚠️ localStorage 在隐私模式/无痕窗口下会抛异常，所有调用点必须容忍失败
 *（旧实现用空catch，本模块沿用但不吞掉「解析失败」之外的问题）。
 */

const STORAGE_KEYS = {
  best: 'boh-anniversary-cafe-best',
  wallet: 'boh-anniversary-cafe-wallet',
  upgrades: 'boh-anniversary-cafe-upgrades',
};

const UPGRADE_IDS = ['grinder', 'machine', 'steam'];
const MAX_UPGRADE_LEVEL = 3;

export function readBestScore() {
  const value = Number(safeGet(STORAGE_KEYS.best));
  return Number.isFinite(value) ? value : 0;
}

export function readWallet() {
  const value = Number(safeGet(STORAGE_KEYS.wallet));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** 读取升级等级，逐项 clamp 到 [0, 3]，非法值回落 0 */
export function readUpgrades() {
  const result = { grinder: 0, machine: 0, steam: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.upgrades);
    if (!raw) return result;
    const parsed = JSON.parse(raw);
    for (const id of UPGRADE_IDS) {
      const level = Number(parsed?.[id]);
      result[id] = Number.isFinite(level)
        ? Math.max(0, Math.min(MAX_UPGRADE_LEVEL, Math.floor(level)))
        : 0;
    }
  } catch {
    // 解析失败当作全新档，不要让坏数据卡住游戏
  }
  return result;
}

/** 打烊时写一次三项 */
export function persistRound({ bestScore, wallet, upgrades }) {
  safeSet(STORAGE_KEYS.best, String(bestScore));
  safeSet(STORAGE_KEYS.wallet, String(wallet));
  safeSet(STORAGE_KEYS.upgrades, JSON.stringify(upgrades));
}

/** 升级购买后立即落盘（避免刷新丢档） */
export function persistWalletAndUpgrades({ wallet, upgrades }) {
  safeSet(STORAGE_KEYS.wallet, String(wallet));
  safeSet(STORAGE_KEYS.upgrades, JSON.stringify(upgrades));
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage may be unavailable in private contexts.
  }
}
