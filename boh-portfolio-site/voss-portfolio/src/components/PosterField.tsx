import { useEffect, useRef, useState, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { projects } from '../content/site'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { createPosterAtlas } from '../lib/posterAtlas'
import { createPosterField } from '../lib/posterField'

gsap.registerPlugin(ScrollTrigger)

type Props = { section: RefObject<HTMLElement>; pin: RefObject<HTMLDivElement> }

export function PosterField({ section, pin }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<ReturnType<typeof createPosterField> | null>(null)
  const target = useRef(0)
  const wakeRef = useRef(() => {})
  const entranceComplete = useRef(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [revision, setRevision] = useState(0)
  const reduced = usePrefersReducedMotion()
  const animated = !reduced && status !== 'unavailable'

  useEffect(() => {
    if (!animated || !section.current || !pin.current) return
    // Parent refs attach after child layout effects; reserve scroll space before loading imagery.
    const trigger = ScrollTrigger.create({
      trigger: section.current,
      pin: pin.current,
      start: 'top top',
      end: () => `+=${window.innerHeight * 4}`,
      anticipatePin: 1,
      refreshPriority: 1,
      invalidateOnRefresh: true,
      onUpdate: self => { target.current = self.progress; wakeRef.current() },
    })
    target.current = trigger.progress
    const refresh = requestAnimationFrame(() => ScrollTrigger.refresh())
    return () => { cancelAnimationFrame(refresh); trigger.kill() }
  }, [animated])

  useEffect(() => {
    const el = canvas.current
    if (!el || reduced) return
    let alive = true
    setStatus('loading')
    const lost = (event: Event) => {
      event.preventDefault()
      setStatus('unavailable')
    }
    const restored = () => setRevision(value => value + 1)
    el.addEventListener('webglcontextlost', lost)
    el.addEventListener('webglcontextrestored', restored)
    createPosterAtlas().then(atlas => {
      if (!alive) return
      renderer.current = createPosterField(el, atlas)
      if (target.current > 0.002) entranceComplete.current = true
      renderer.current.draw(target.current, 0, { x: 0, y: 0 }, 0, entranceComplete.current ? 1 : 0)
      setStatus('ready')
    }).catch(error => {
      if (alive) {
        setStatus('unavailable')
        console.warn('Poster field unavailable:', error)
      }
    })
    return () => {
      alive = false
      el.removeEventListener('webglcontextlost', lost)
      el.removeEventListener('webglcontextrestored', restored)
      renderer.current?.dispose()
      renderer.current = null
    }
  }, [reduced, revision])

  useEffect(() => {
    const sec = section.current
    const frame = pin.current
    const scene = renderer.current
    if (!sec || !frame || !scene || status !== 'ready' || reduced) return
    let progress = target.current
    let entrance = entranceComplete.current || progress > 0.002 ? 1 : 0
    let elapsed = 0
    let last = 0
    let animation = 0
    let visible = false
    const pointer = { x: 0, y: 0 }
    const destination = { x: 0, y: 0 }
    const draw = (now: number) => {
      animation = 0
      if (!visible || document.hidden) return
      const frameDelta = (now - (last || now)) / 1000
      const delta = Math.min(frameDelta, 0.05)
      last = now
      const easing = 1 - Math.exp(-delta * 7)
      const previous = progress
      progress += (target.current - progress) * easing
      if (Math.abs(target.current - progress) < 0.00005) progress = target.current
      pointer.x += (destination.x - pointer.x) * easing
      pointer.y += (destination.y - pointer.y) * easing
      if (Math.abs(destination.x - pointer.x) < 0.00005) pointer.x = destination.x
      if (Math.abs(destination.y - pointer.y) < 0.00005) pointer.y = destination.y
      elapsed += delta
      entrance = Math.min(1, entrance + frameDelta * (target.current > 0.002 ? 5 : 1 / 2.1))
      if (entrance === 1) entranceComplete.current = true
      const speed = Math.min(1, Math.abs(progress - previous) / Math.max(delta, 0.001) * 2)
      scene.draw(progress, elapsed, pointer, speed, entrance)
      sec.dataset.progress = progress.toFixed(3)
      sec.dataset.entrance = entrance.toFixed(3)
      animation = requestAnimationFrame(draw)
    }
    const wake = () => {
      if (!animation && visible && !document.hidden) {
        last = 0
        animation = requestAnimationFrame(draw)
      }
    }
    wakeRef.current = wake
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) wake()
      else { cancelAnimationFrame(animation); animation = 0; last = 0 }
    }, { rootMargin: '100px' })
    observer.observe(sec)
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const rect = frame.getBoundingClientRect()
      destination.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2
      destination.y = -((event.clientY - rect.top) / rect.height - 0.5) * 2
      wake()
    }
    const onLeave = () => { destination.x = 0; destination.y = 0; wake() }
    const onVisibility = () => {
      if (document.hidden) { cancelAnimationFrame(animation); animation = 0; last = 0 }
      else wake()
    }
    const resize = new ResizeObserver(() => { scene.resize(); wake() })
    resize.observe(frame)
    frame.addEventListener('pointermove', onMove, { passive: true })
    frame.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      wakeRef.current = () => {}
      observer.disconnect()
      resize.disconnect()
      cancelAnimationFrame(animation)
      frame.removeEventListener('pointermove', onMove)
      frame.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      delete sec.dataset.progress
      delete sec.dataset.entrance
    }
  }, [status, reduced])

  return (
    <div className={`poster-field ${animated ? `is-${status}` : 'is-static'}`} aria-hidden="true">
      <canvas className="poster-canvas" ref={canvas} />
      {!animated && (
        <div className="poster-fallback">
          {projects.map(project => (
            <figure key={project.slug}>
              <img src={project.cover} alt={project.coverAlt} width={1536} height={1024} loading="lazy" />
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
