import { useState } from 'react'
import { capabilities } from '../content/site'

export function Capabilities() {
  const [open, setOpen] = useState<number>(0)

  return (
    <section id="capabilities">
      <div className="section-head">
        <h2>能力</h2>
        <span className="meta">我们做什么</span>
      </div>
      <div className="cap-list">
        {capabilities.map((c, i) => {
          const expanded = open === i
          return (
            <div className={`cap-item ${expanded ? 'open' : ''}`} key={c.title}>
              <button
                className="cap-trigger"
                aria-expanded={expanded}
                aria-controls={`cap-body-${i}`}
                id={`cap-trigger-${i}`}
                onClick={() => setOpen(expanded ? -1 : i)}
              >
                <span className="cap-num">0{i + 1}</span>
                <h3>{c.title}</h3>
                <span className="cap-icon" aria-hidden="true" />
              </button>
              <div className="cap-body" id={`cap-body-${i}`} role="region" aria-labelledby={`cap-trigger-${i}`}>
                <div>
                  <p>{c.body}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
