import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { hero, site, motion } from '../content/site'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { PosterField } from './PosterField'

gsap.registerPlugin(ScrollTrigger)

export function Hero() {
  const root = useRef<HTMLElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const letters = site.monogram.split('')
  const accentFrom = 1

  useEffect(() => {
    const el = root.current
    if (!el || reduced) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: motion.ease } })
      tl.fromTo(
        '.wordmark .letter',
        { yPercent: 112 },
        { yPercent: 0, duration: motion.heroReveal.duration, stagger: motion.heroReveal.stagger },
        0.1,
      )
        .fromTo(
          '.hero-title .reveal-line > span',
          { y: 26, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, stagger: 0.08 },
          0.5,
        )

      gsap.to('.wordmark', {
        scale: 0.72,
        y: -60,
        opacity: 0.25,
        transformOrigin: 'left bottom',
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'bottom bottom',
          end: 'bottom top',
          scrub: true,
        },
      })
      gsap.to('.hero-row', {
        y: -40,
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'bottom bottom', end: 'bottom top', scrub: true },
      })
    }, el)

    return () => ctx.revert()
  }, [reduced])

  return (
    <section className="hero" ref={root} aria-label="Intro">
      <div className="hero-pin" ref={frame}>
        <PosterField section={root} pin={frame} />
        <div className="hero-content">
          <p className="wordmark" aria-hidden="true">
            {letters.map((ch, i) => (
              <span className="mask" key={i}>
                <span className={`letter ${i >= accentFrom ? 'is-accent' : ''}`}>
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              </span>
            ))}
          </p>
          <div className="hero-row">
            <div className="hero-title">
              <h1>
                <span className="reveal-line">
                  <span>{hero.line1}</span>
                </span>
                <span className="reveal-line">
                  <span>{hero.line2}</span>
                </span>
              </h1>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
