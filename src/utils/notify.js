/**
 * Lightweight user-facing notification utility.
 *
 * In component context: dispatches a custom event consumed by App.vue toast.
 * In route-guard / non-component context: falls back with console.warn.
 *
 * Usage:
 *   import { notify } from '@/utils/notify.js'
 *   notify('请先登录', 'warning')
 */

const TOAST_EVENT = 'boh_notify'

export function notify(message, type = 'info') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }))
  }
}