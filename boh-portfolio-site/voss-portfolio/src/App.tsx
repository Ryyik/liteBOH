import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Cursor } from './components/Cursor'
import { MotionProvider } from './components/MotionProvider'
import { TransitionProvider, TransitionOverlay } from './lib/transition'
import Home from './pages/Home'
import CaseStudy from './pages/CaseStudy'

/** SPA scroll management: hash targets, saved positions for back navigation, top on new pages. */
function ScrollManager() {
  const location = useLocation()

  useEffect(() => {
    const pendingHash = sessionStorage.getItem('pending-hash')
    const isHashLink = location.pathname === '/' && (location.hash || pendingHash)

    if (isHashLink) {
      const target = pendingHash || location.hash
      if (pendingHash) sessionStorage.removeItem('pending-hash')
      // two frames: let layout (incl. images' reserved space) settle
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = target && document.querySelector(target)
          if (el) el.scrollIntoView()
          else window.scrollTo(0, 0)
        }),
      )
      return
    }

    if (location.pathname !== '/') {
      window.scrollTo(0, 0)
      return
    }

    const saved = sessionStorage.getItem('scrollpos:' + location.key)
    if (saved) window.scrollTo(0, Number(saved))
    else window.scrollTo(0, 0)
  }, [location])

  useEffect(() => {
    const onScroll = () => {
      if (location.pathname === '/') {
        sessionStorage.setItem('scrollpos:' + location.key, String(window.scrollY))
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionProvider>
        <ScrollManager />
        <a className="skip-link" href="#main">跳到主要内容</a>
        <Nav />
        <Cursor />
        <TransitionProvider>
          <TransitionOverlay />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/work/:slug" element={<CaseRoute />} />
            <Route
              path="*"
              element={
                <main id="main" style={{ padding: 'calc(var(--nav-h) + 80px) var(--pad) 80px' }}>
                  <h1 style={{ fontSize: 'clamp(40px, 8vw, 96px)' }}>404</h1>
                  <p style={{ margin: '16px 0 32px' }}>
                    页面不存在。<a className="u-link" href="/">返回首页</a>
                  </p>
                </main>
              }
            />
          </Routes>
        </TransitionProvider>
      </MotionProvider>
    </BrowserRouter>
  )
}

function CaseRoute() {
  const { slug = '' } = useParams()
  return <CaseStudy slug={slug} />
}
