import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { site } from '../content/site'
import { useMotionControl } from './MotionProvider'

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const { enabled, systemReduced, lowPower, toggle } = useMotionControl()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuBtnRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  const isCase = location.pathname !== '/'
  const onNavClick = (href: string) => {
    if (menuOpen) setMenuOpen(false)
    if (href.startsWith('/#') && isCase) sessionStorage.setItem('pending-hash', href.slice(1))
  }

  return (
    <>
      <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
        <Link to="/" className="brand" onClick={() => setMenuOpen(false)} aria-label="方块之家首页">
          {site.monogram}<span className="dot">.</span>
        </Link>
        <div className="nav-actions">
          <nav className="nav-links" aria-label="主导航">
            {site.nav.map((item) => (
              <Link key={item.href} to={item.href} onClick={() => onNavClick(item.href)} className="u-link">
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            className="motion-toggle"
            type="button"
            onClick={toggle}
            disabled={systemReduced}
            aria-pressed={!enabled}
            title={systemReduced ? '系统已开启减少动效' : lowPower ? '检测到低性能设备，可手动开启动效' : '切换页面动效'}
          >
            动效 · {enabled ? '开' : '关'}
          </button>
          <button
            ref={menuBtnRef}
            className="menu-btn"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? '关闭' : '菜单'}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="menu-overlay" id="mobile-menu" role="dialog" aria-modal="true" aria-label="导航菜单">
          <ul>
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link to={item.href} onClick={() => onNavClick(item.href)}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="menu-foot">
            <span>{site.location}</span>
            <span>{site.availability}</span>
          </div>
        </div>
      )}
    </>
  )
}
