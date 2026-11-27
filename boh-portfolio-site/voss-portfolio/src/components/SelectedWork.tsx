import { useState } from 'react'
import type { CSSProperties } from 'react'
import { projects } from '../content/site'
import { useWipe } from '../lib/transition'

export function SelectedWork() {
  const { navigateWithWipe } = useWipe()
  const [active, setActive] = useState(0)
  const current = projects[active]

  const go = (slug: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    navigateWithWipe(`/work/${slug}`)
  }

  return (
    <section className="work-section" id="work">
      <div className="section-head">
        <h2>精选作品</h2>
        <span className="meta">{projects.length} 个项目 · 2018—2026</span>
      </div>

      <div className="work-stage">
        <ol className="work-rows">
          {projects.map((p, i) => (
            <li className="work-row" key={p.slug}>
              <a
                className="work-row-link"
                href={`/work/${p.slug}`}
                onClick={go(p.slug)}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                data-cursor="view"
              >
                <span className="work-row-index meta">0{i + 1}</span>
                <h3 className="roll-title" aria-label={p.title}>
                  {p.title.split('').map((ch, ci) => (
                    <span className="roll-char" aria-hidden="true" key={ci}>
                      <span className="roll-a" style={{ '--d': `${ci * 22}ms` } as CSSProperties}>
                        {ch === ' ' ? '\u00A0' : ch}
                      </span>
                      <span className="roll-b" style={{ '--d': `${ci * 22}ms` } as CSSProperties}>
                        {ch === ' ' ? '\u00A0' : ch}
                      </span>
                    </span>
                  ))}
                </h3>
                <span className="work-row-meta meta">
                  <span>{p.category}</span>
                  <span>{p.year}</span>
                </span>
                <figure className="work-row-media" aria-hidden="true">
                  <img
                    src={p.cover}
                    alt=""
                    width={1536}
                    height={1024}
                    loading={i < 2 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                </figure>
              </a>
            </li>
          ))}
        </ol>

        <aside className="work-preview">
          <a
            className="work-preview-link"
            href={`/work/${current.slug}`}
            onClick={go(current.slug)}
            aria-label={`查看 ${current.title} 项目详情`}
            data-cursor="view"
          >
            <div className="work-preview-frame">
              {projects.map((p, i) => (
                <img
                  key={p.slug}
                  className={i === active ? 'is-active' : undefined}
                  src={p.cover}
                  alt=""
                  width={1536}
                  height={1024}
                  loading="eager"
                  decoding="async"
                />
              ))}
            </div>
          </a>
        </aside>
      </div>
    </section>
  )
}
