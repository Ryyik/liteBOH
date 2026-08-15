import { computed } from 'vue';
import {
  appModeState,
  BETA5_APP_MODE,
  getAppMode,
  setAppMode,
  STABLE_APP_MODE
} from '@/utils/app-mode-manager.js';

export const useAppMode = () => ({
  mode: appModeState,
  isBeta5: computed(() => appModeState.value === BETA5_APP_MODE),
  getAppMode,
  setAppMode,
  stableMode: STABLE_APP_MODE,
  beta5Mode: BETA5_APP_MODE
});
