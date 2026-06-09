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

/**
 * For route guards — shows a blocking dialog via confirm/alert behavior.
 * Route guards run before mount, so we use a minimal approach.
 */
export function notifyRouteGuard(message, redirectTo = null) {
  console.warn('[RouteGuard]', message)
  // In production, this shows a brief alert (route guards run before Vue mount)
  // Once the app is hydrated, the TOAST_EVENT listener in App.vue handles it
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type: 'warning', duration: 3000 } }))
  }
}