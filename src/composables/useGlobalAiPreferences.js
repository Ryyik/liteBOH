import { reactive, watch } from 'vue';
import { LIQUID_GLASS_SPEC } from '@/config/liquid-glass-spec.js';

export const GLOBAL_AI_PREFERENCES_KEY = 'boh_global_ai_preferences_v1';

const defaults = Object.freeze({
  shortcutEnabled: true,
  shortcut: 'mod+k',
  gestureEnabled: true,
  gestureSide: 'right',
  gestureSensitivity: 'medium',
  hapticsEnabled: true,
  initialHeight: 'comfortable',
  openBehavior: 'resume',
  autoFocus: true,
  enterToSend: true,
  defaultWebSearch: false,
  pageContextEnabled: false,
  selectionContextEnabled: true,
  contextMode: 'full',
  appearance: 'system',
  density: 'comfortable',
  fontScale: 'medium',
  /* 折射玻璃白膜透明度（2026-10-14，§21.7；§21.11 令牌提为站点级）：0~1，实际渲染 =
     rgba(var(--refract-tint-rgb), var(--refract-alpha))，由 useBohShell 写根。
     默认值与可调边界的真源 = `src/config/liquid-glass-spec.js`
     （两次「白底上玻璃隐形」事故的档案，改样貌只改 spec）。 */
  glassOpacity: LIQUID_GLASS_SPEC.tintAlphaDefault,
  animationsEnabled: true,
  showDetails: true,
});

function readPreferences() {
  if (typeof window === 'undefined') return { ...defaults };
  try {
    const saved = JSON.parse(window.localStorage.getItem(GLOBAL_AI_PREFERENCES_KEY) || '{}');
    return { ...defaults, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { ...defaults };
  }
}

const preferences = reactive(readPreferences());
let persistenceStarted = false;

function ensurePersistence() {
  if (persistenceStarted || typeof window === 'undefined') return;
  persistenceStarted = true;
  watch(
    preferences,
    (value) => {
      try {
        window.localStorage.setItem(GLOBAL_AI_PREFERENCES_KEY, JSON.stringify(value));
      } catch {
        /* preference persistence is best-effort */
      }
    },
    { deep: true },
  );
}

export function matchesGlobalAiShortcut(event, shortcut = preferences.shortcut) {
  const key = String(event?.key || '').toLowerCase();
  const hasModifier = Boolean(event?.metaKey || event?.ctrlKey);
  if (shortcut === 'mod+space') return hasModifier && key === ' ';
  if (shortcut === 'mod+j') return hasModifier && key === 'j';
  return hasModifier && key === 'k';
}

export function getGlobalAiShortcutLabel(shortcut = preferences.shortcut) {
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const modifier = isMac ? '⌘' : 'Ctrl+';
  if (shortcut === 'mod+space') return `${modifier}${isMac ? 'Space' : 'Space'}`;
  if (shortcut === 'mod+j') return `${modifier}J`;
  return `${modifier}K`;
}

export function useGlobalAiPreferences() {
  ensurePersistence();

  const resetPreferences = () => Object.assign(preferences, defaults);

  return {
    preferences,
    defaults,
    resetPreferences,
  };
}
