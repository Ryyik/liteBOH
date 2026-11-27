import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { motion } from '../content/site'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

interface TransitionCtx {
  navigating: boolean
  navigateWithWipe: (to: string) => void
}

const Ctx = createContext<TransitionCtx>({ navigating: false, navigateWithWipe: () => {} })
export const useWipe = () => useContext(Ctx)

export function TransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const reduced = usePrefersReducedMotion()
  const [navigating, setNavigating] = useState(false)
  const busy = useRef(false)
  const pendingDestination = useRef<string | null>(null)
  const startLocationKey = useRef<string | null>(null)
  const frame = useRef<number | null>(null)
  const navigateTimer = useRef<number | null>(null)
  const finishTimer = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    if (navigateTimer.current !== null) clearTimeout(navigateTimer.current)
    if (finishTimer.current !== null) clearTimeout(finishTimer.current)
    frame.current = null
    navigateTimer.current = null
    finishTimer.current = null
  }, [])

  const resetWipe = useCallback(() => {
    clearTimers()
    const el = document.querySelector<HTMLElement>('.wipe')
    if (el) {
      el.style.transition = 'none'
      el.style.transformOrigin = 'top'
      el.style.transform = 'scaleY(0)'
    }
    pendingDestination.current = null
    startLocationKey.current = null
    busy.current = false
    setNavigating(false)
  }, [clearTimers])

  useEffect(() => {
    if (
      pendingDestination.current &&
      navigationType === 'POP' &&
      location.key !== startLocationKey.current
    ) {
      resetWipe()
    }
  }, [location.key, navigationType, resetWipe])

  useEffect(() => clearTimers, [clearTimers])

  const navigateWithWipe = useCallback(
    (to: string) => {
      if (busy.current) return
      busy.current = true
      pendingDestination.current = to
      startLocationKey.current = location.key
      setNavigating(true)
      const el = document.querySelector<HTMLElement>('.wipe')
      if (!el || reduced) {
        navigate(to)
        busy.current = false
        pendingDestination.current = null
        startLocationKey.current = null
        setNavigating(false)
        return
      }
      el.style.transformOrigin = 'bottom'
      el.style.transition = `transform ${motion.transition.duration}s cubic-bezier(0.22,1,0.36,1)`
      frame.current = requestAnimationFrame(() => {
        el.style.transform = 'scaleY(1)'
      })
      navigateTimer.current = window.setTimeout(() => {
        navigate(to)
        finishTimer.current = window.setTimeout(() => {
          el.style.transition = `transform ${motion.transition.duration}s cubic-bezier(0.22,1,0.36,1)`
          el.style.transformOrigin = 'top'
          el.style.transform = 'scaleY(0)'
          pendingDestination.current = null
          startLocationKey.current = null
          busy.current = false
          setNavigating(false)
        }, 60)
      }, motion.transition.duration * 1000)
    },
    [location.key, navigate, reduced],
  )

  return <Ctx.Provider value={{ navigating, navigateWithWipe }}>{children}</Ctx.Provider>
}

export function TransitionOverlay() {
  return <div className="wipe" aria-hidden="true" />
}
