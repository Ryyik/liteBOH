import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { resolveMotionEnabled } from '../lib/motion'

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number
}

interface MotionContextValue {
  enabled: boolean
  systemReduced: boolean
  lowPower: boolean
  toggle: () => void
}

export const MotionContext = createContext<MotionContextValue>({
  enabled: true,
  systemReduced: false,
  lowPower: false,
  toggle: () => {},
})

const readSaved = (): boolean | undefined => {
  try {
    const value = localStorage.getItem('boh-motion')
    return value === null ? undefined : value === 'on'
  } catch {
    return undefined
  }
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [systemQuery] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)'))
  const [systemReduced, setSystemReduced] = useState(systemQuery.matches)
  const [saved, setSaved] = useState<boolean | undefined>(readSaved)
  const lowPower =
    ((navigator as NavigatorWithMemory).deviceMemory ?? 8) <= 4 ||
    (navigator.hardwareConcurrency || 8) <= 4
  const enabled = resolveMotionEnabled({ prefersReducedMotion: systemReduced, saved, deviceMemory: (navigator as NavigatorWithMemory).deviceMemory, hardwareConcurrency: navigator.hardwareConcurrency })

  useEffect(() => {
    const onChange = () => setSystemReduced(systemQuery.matches)
    systemQuery.addEventListener('change', onChange)
    return () => systemQuery.removeEventListener('change', onChange)
  }, [systemQuery])

  useEffect(() => {
    document.documentElement.dataset.motion = enabled ? 'on' : 'off'
  }, [enabled])

  const toggle = useCallback(() => {
    if (systemReduced) return
    setSaved((current) => {
      const next = !(current ?? !lowPower)
      try {
        localStorage.setItem('boh-motion', next ? 'on' : 'off')
      } catch {
        // The in-memory preference still works when storage is unavailable.
      }
      return next
    })
  }, [lowPower, systemReduced])

  const value = useMemo(() => ({ enabled, systemReduced, lowPower, toggle }), [enabled, systemReduced, lowPower, toggle])
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
}

export const useMotionControl = () => useContext(MotionContext)
