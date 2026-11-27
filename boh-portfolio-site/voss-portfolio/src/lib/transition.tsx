import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const reduced = usePrefersReducedMotion()
  const [navigating, setNavigating] = useState(false)
  const busy = useRef(false)

  const navigateWithWipe = useCallback(
    (to: string) => {
      if (busy.current) return
      busy.current = true
      setNavigating(true)
      const el = document.querySelector<HTMLElement>('.wipe')
      if (!el || reduced) {
        navigate(to)
        busy.current = false
        setNavigating(false)
        return
      }
      el.style.transformOrigin = 'bottom'
      el.style.transition = `transform ${motion.transition.duration}s cubic-bezier(0.22,1,0.36,1)`
      requestAnimationFrame(() => {
        el.style.transform = 'scaleY(1)'
      })
      window.setTimeout(() => {
        navigate(to)
        window.setTimeout(() => {
          el.style.transition = `transform ${motion.transition.duration}s cubic-bezier(0.22,1,0.36,1)`
          el.style.transformOrigin = 'top'
          el.style.transform = 'scaleY(0)'
          busy.current = false
          setNavigating(false)
        }, 60)
      }, motion.transition.duration * 1000)
    },
    [navigate, reduced],
  )

  return <Ctx.Provider value={{ navigating, navigateWithWipe }}>{children}</Ctx.Provider>
}

export function TransitionOverlay() {
  return <div className="wipe" aria-hidden="true" />
}
