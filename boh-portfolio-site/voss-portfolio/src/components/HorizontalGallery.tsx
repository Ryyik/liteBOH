import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { projects, studies } from '../content/site'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { GlassEdge } from './GlassEdge'

gsap.registerPlugin(ScrollTrigger, CustomEase)
// Tuned by hand: slow leave, steep middle, long soft landing — named eases read as canned next to the roll.
CustomEase.create('bohRoll', '0.36, 0.02, 0.28, 1')

export function HorizontalGallery() {
  const section = useRef<HTMLElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()

  const items = projects.slice(0, 5).map((p) => ({
    src: p.cover, alt: p.coverAlt, caption: `${p.title} — ${p.category}`,
  }))

  useLayoutEffect(() => {
    const sec = section.current
    const tr = track.current
    const vp = viewport.current
    if (!sec || !tr || !vp || reduced) return
    const intro = sec.querySelector<HTMLElement>('.h-intro')!

    const mm = gsap.matchMedia()
    mm.add('(min-width: 900px)', () => {
      vp.scrollLeft = 0
      const getOverflow = () => Math.max(0, tr.scrollWidth - vp.clientWidth)
      const position = { entry: 0, drift: 0 }
      let started = false
      gsap.set(tr, { x: vp.clientWidth + 36 })
      const setX = gsap.quickSetter(tr, 'x', 'px')
      const render = () => {
        // Keep the lens stationary so the incoming strip actually passes through the curl.
        setX(gsap.utils.interpolate(vp.clientWidth + 36, -getOverflow() * position.drift, position.entry))
        tr.dispatchEvent(new Event('gallery:move'))
      }
      const entrance = gsap.timeline({ paused: true, onUpdate: render })
        .to(intro, { autoAlpha: 0, y: -26, duration: 0.4, ease: 'power2.inOut' })
        .to(position, { entry: 1, duration: 3, ease: 'bohRoll' }, 0.3)
      const playEntrance = () => {
        if (started) return
        started = true
        entrance.play()
      }
      const drift = gsap.to(position, {
        drift: 1,
        ease: 'none',
        onUpdate: render,
        scrollTrigger: {
          trigger: sec,
          start: 'top top',
          end: () => `+=${getOverflow() + 200}`,
          pin: sec.querySelector('.h-pin'),
          pinSpacing: true,
          anticipatePin: 1,
          scrub: 1.15,
          invalidateOnRefresh: true,
          onEnter: playEntrance,
          onEnterBack: playEntrance,
          onLeave: () => {
            started = true
            entrance.progress(1).pause()
          },
          onLeaveBack: (trigger) => {
            started = false
            entrance.pause(0)
            render()
            if (trigger.scroll() >= trigger.start) playEntrance()
          },
          onRefresh: render,
        },
      })
      const isWithinGallery = () => {
        const trigger = drift.scrollTrigger
        return !!trigger && trigger.scroll() >= trigger.start && trigger.scroll() < trigger.end
      }
      const onScroll = () => {
        if (isWithinGallery()) playEntrance()
      }
      const onKey = (event: KeyboardEvent) => {
        const trigger = drift.scrollTrigger
        if (!trigger || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const step = tr.querySelector('figure')!.clientWidth
        const target = event.key === 'Home' ? trigger.start : event.key === 'End' ? trigger.end
          : window.scrollY + (event.key === 'ArrowRight' ? step : -step)
        window.scrollTo({ top: gsap.utils.clamp(trigger.start, trigger.end, target), behavior: 'instant' })
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      vp.addEventListener('keydown', onKey)
      onScroll()
      return () => {
        window.removeEventListener('scroll', onScroll)
        vp.removeEventListener('keydown', onKey)
        gsap.set(tr, { clearProps: 'transform' })
        vp.scrollLeft = 0
        tr.dispatchEvent(new Event('gallery:move'))
      }
    })
    return () => mm.revert()
  }, [reduced])

  return (
    <section className="h-gallery" ref={section} aria-label="空间作品画廊">
      <div className="h-pin">
        <div className="section-head">
          <h2>{studies.heading}</h2>
          <span className="meta">滚动探索 · {items.length} 幅画面</span>
        </div>

        <div className="h-body">
          <p className="h-intro">{studies.intro}</p>
          <div className="h-stage">
            <div className="h-viewport" ref={viewport} tabIndex={0} role="region" aria-label="空间作品 — 使用左右方向键浏览">
              <div className="h-track" ref={track}>
                {items.map((img) => (
                  <figure className="h-card" key={img.src}>
                    <img
                      src={img.src}
                      alt={img.alt}
                      width={1536}
                      height={1024}
                      decoding="async"
                    />
                    <figcaption className="meta">{img.caption}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
            <GlassEdge viewport={viewport} track={track} />
          </div>
        </div>
      </div>
    </section>
  )
}
