/**
 * Reference-counted body scroll lock composable.
 *
 * Prevents "stuck page" bugs caused by competing overflow settings.
 * Use instead of raw `document.body.style.overflow` assignments.
 *
 * Usage:
 *   const { lock, unlock } = useBodyScrollLock()
 *   onMounted(() => lock())   // count +1
 *   onUnmounted(() => unlock()) // count -1, auto-reset at 0
 */

const scrollLockCount = { current: 0 }

export function useBodyScrollLock() {
  function lock() {
    scrollLockCount.current++
    if (scrollLockCount.current === 1) {
      document.body.style.overflow = 'hidden'
    }
  }

  function unlock() {
    if (scrollLockCount.current <= 0) return
    scrollLockCount.current--
    if (scrollLockCount.current === 0) {
      document.body.style.overflow = ''
    }
  }

  return { lock, unlock }
}