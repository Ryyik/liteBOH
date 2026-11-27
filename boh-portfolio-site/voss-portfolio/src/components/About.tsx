import { about } from '../content/site'
import { useReveal } from '../hooks/useReveal'

export function About() {
  const ref = useReveal<HTMLElement>()
  return (
    <section id="about" className="about-section" ref={ref}>
      <div className="section-head">
        <h2>{about.heading}</h2>
        <span className="meta">{about.experience.length} 个章节</span>
      </div>
      <div className="about-grid">
        <div className="about-text">
          {about.paragraphs.map((p, i) => (
            <p className="rv" key={i}>
              {p}
            </p>
          ))}
          <ul className="exp-list">
            {about.experience.map((e) => (
              <li className="rv" key={e.period}>
                <span className="period">{e.period}</span>
                <span>{e.item}</span>
              </li>
            ))}
          </ul>
        </div>
        <figure className="about-media rv">
          <img src={about.portrait} alt={about.portraitAlt} width={1024} height={1280} loading="lazy" decoding="async" />
          <figcaption className="meta">{about.caption}</figcaption>
        </figure>
      </div>
    </section>
  )
}
