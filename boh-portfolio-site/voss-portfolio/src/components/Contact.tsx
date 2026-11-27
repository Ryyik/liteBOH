import { useState } from 'react'
import { contact, site } from '../content/site'

type CopyState = 'idle' | 'ok' | 'err'

export function Contact() {
  const [copy, setCopy] = useState<CopyState>('idle')

  const copyEmail = async () => {
    const email = site.email
    let ok = false
    try {
      await navigator.clipboard.writeText(email)
      ok = true
    } catch {
      // Fallback for non-secure contexts / denied permission
      try {
        const ta = document.createElement('textarea')
        ta.value = email
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        ta.remove()
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopy('ok')
      window.setTimeout(() => setCopy('idle'), 2500)
    } else {
      setCopy('err')
      window.setTimeout(() => setCopy('idle'), 4000)
    }
  }

  return (
    <footer className="contact" id="contact">
      <h2>{contact.heading}</h2>
      <p className="line">{contact.line}</p>
      <div className="contact-row">
        <button className="email-btn u-link" onClick={copyEmail} title="点击复制邮箱地址">
          {site.email}
        </button>
        <span className={`copy-note ${copy === 'ok' ? 'ok' : copy === 'err' ? 'err' : ''}`} role="status" aria-live="polite">
          {copy === 'ok' ? '邮箱已复制' : copy === 'err' ? '复制失败，请手动复制地址' : ''}
        </span>
        {site.socials.length > 0 && (
          <nav className="socials" aria-label="Social links" style={{ marginLeft: 'auto' }}>
            {site.socials.map((s) => (
              <a key={s.label} className="u-link" href={s.href} target="_blank" rel="noreferrer">
                {s.label}
              </a>
            ))}
          </nav>
        )}
      </div>
      <div className="foot">
        <span>© {new Date().getFullYear()} {site.name} — 图片来自社群资料，案例编排为虚构演示。</span>
        <span>{site.location} · {site.availability}</span>
      </div>
    </footer>
  )
}
