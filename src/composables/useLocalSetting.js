/**
 * Namespaced localStorage composable.
 *
 * All keys are prefixed with 'boh_' to avoid collisions.
 * Provides reactive read/write with JSON parse/stringify.
 *
 * Usage:
 *   const enabled = useLocalSetting('memory_capture', false)
 *   enabled.value = true   // auto-saves to localStorage
 */

import { ref, watch } from 'vue'

const STORAGE_PREFIX = 'boh_'

export function useLocalSetting(key, defaultValue) {
  const storageKey = STORAGE_PREFIX + key

  const stored = (() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw === null) return defaultValue
      return JSON.parse(raw)
    } catch {
      return defaultValue
    }
  })()

  const value = ref(stored)

  watch(value, (newVal) => {
    try {
      if (newVal === null || newVal === undefined) {
        localStorage.removeItem(storageKey)
      } else {
        localStorage.setItem(storageKey, JSON.stringify(newVal))
      }
    } catch {
      // quota exceeded or other storage errors — silently ignore
    }
  }, { deep: true })

  return value
}