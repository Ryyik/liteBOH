import { reactive, watch } from 'vue';
import { LIQUID_GLASS_SPEC } from '@/config/liquid-glass-spec.js';

export const GLOBAL_AI_PREFERENCES_KEY = 'boh_global_ai_preferences_v1';

const defaults = Object.freeze({
  shortcutEnabled: true,
  shortcut: 'mod+k',
  /* plans/038 P3 退场的字段（gestureEnabled/gestureSide/gestureSensitivity/hapticsEnabled/
     initialHeight/openBehavior）不再声明 —— 旧 localStorage 里残留的键会被 spread 进来但
     无人消费，自然失效；不在这里保留死默认值。 */
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
  /* 全局挂件「小方」是否出场。**默认关**（2026-11-24 用户口径：
     「设置里要允许关闭小方（默认为用户关闭）」）。
     ⚠️ 放在这里而不是另起一个 store：本模块**已在首屏壳**（vite.config.js 的
     SHELL_CHUNKS），加一个布尔字段首屏零增长；而 App.vue 要拿它做 v-if
     （关掉后连 BohPetBlock 的懒加载 chunk 都不下载），新建模块反而会把整块
     拽进入口图。语义务必保持「布尔偏好」，不要往这里塞小方的运行期状态。
     ⚠️ 2026-11-23 加这个字段时默认值是 true，且 `ensurePersistence` 的 deep watch
        会在**任何**偏好变化（改主题、调玻璃透明度…）时把整份对象写进 localStorage
        ⇒ 绝大多数活跃用户的盘上早就躺着 `petEnabled: true`，而他们从没选过。
        所以「默认关」不能只改这一行 —— 必须配一次迁移（见下面的
        PET_DEFAULT_OFF_VERSION），否则改默认值对老用户等于没改。 */
  petEnabled: false,
});

/* 「小方默认关」的迁移代次（2026-11-24）。
   盘上是老数据（没有本字段 / 代次更小）⇒ 无条件把小方关掉并盖章，
   **只做一次**：之后用户自己打开就是他的明确选择，
   再进这里的 `petDefaultOffVersion` 已经等于本代次，不会被反复重置。
   ⚠️ 不要靠「有没有 petEnabled 键」判断 —— 它一直都在（上面那条 deep watch 写的）。 */
export const PET_DEFAULT_OFF_VERSION = 2;

function readPreferences() {
  if (typeof window === 'undefined') return { ...defaults };
  try {
    const raw = window.localStorage.getItem(GLOBAL_AI_PREFERENCES_KEY);
    /* 干净盘（新用户 / 隐私模式）⇒ 直接走 defaults，**不盖章**。
       区分「盘上有没有东西」很重要：迁移只该拦老数据；
       若对空盘也走迁移，defaults 里那个 false 就永远被覆盖，
       等于「默认值」这行代码形同虚设（反证时实测过：把它改成 true 不会变红）。 */
    if (!raw) return { ...defaults };
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return { ...defaults };
    const merged = { ...defaults, ...saved };
    /* 老盘数据（代次缺失或更小）⇒ 小方强制关一次并盖章。
       放在读取路径里而不是 ensurePersistence 之后：App.vue 的 v-if 在首帧就要
       读到 false（否则会先下载 BohPetBlock chunk 再卸掉，正好破坏「关了就不下载」）。
       读时直接改写 merged，下一次任何偏好变化把它写回盘。 */
    if (Number(saved.petDefaultOffVersion || 0) < PET_DEFAULT_OFF_VERSION) {
      merged.petEnabled = false;
      merged.petDefaultOffVersion = PET_DEFAULT_OFF_VERSION;
    }
    return merged;
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
