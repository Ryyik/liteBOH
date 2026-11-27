import { Link } from 'react-router-dom'
import { getProject, nextProject, projects } from '../content/site'
import { useReveal } from '../hooks/useReveal'
import { useWipe } from '../lib/transition'
import { Contact } from '../components/Contact'

export default function CaseStudy({ slug }: { slug: string }) {
  const project = getProject(slug)
  const ref = useReveal<HTMLElement>()
  const { navigateWithWipe } = useWipe()

  if (!project) {
    return (
      <main id="main" style={{ padding: 'calc(var(--nav-h) + 80px) var(--pad) 80px' }}>
        <h1 style={{ fontSize: 'clamp(40px, 8vw, 96px)' }}>项目未找到</h1>
        <p style={{ margin: '16px 0 32px' }}>
          这个项目不存在。<Link className="u-link" to="/#work">返回精选作品</Link>
        </p>
      </main>
    )
  }

  const next = nextProject(slug)

  const go = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    navigateWithWipe(to)
  }

  return (
    <main id="main" ref={ref}>
      <article>
        <header className="case-hero">
          <div className="meta-row">
            <span className="meta">{project.category}</span>
            <span className="meta">{project.year}</span>
            <span className="meta">角色 — {project.role}</span>
          </div>
          <h1>{project.title}</h1>
          <p className="summary">{project.summary}</p>
        </header>

        <div className="case-cover">
          <img src={project.cover} alt={project.coverAlt} width={1536} height={1024} decoding="async" />
        </div>

        <div className="case-body">
          <div className="case-col">
            <div className="case-block rv">
              <h2>背景与问题</h2>
              <p>{project.intro}</p>
              <p>{project.challenge}</p>
            </div>
            {project.approach.map((a, i) => (
              <div className="case-block rv" key={i}>
                <h2>
                  <span className="meta" style={{ display: 'block', marginBottom: 6 }}>0{i + 1}</span>
                  {a.heading}
                </h2>
                <p>{a.body}</p>
              </div>
            ))}
            <div className="case-block rv">
              <h2>结果</h2>
              <p>{project.outcome}</p>
            </div>
          </div>
          <aside className="case-side">
            <dl>
              <div className="row">
                <dt>客户</dt>
                <dd>方块之家 BOH 社群资料 · 演示编排</dd>
              </div>
              <div className="row">
                <dt>类别</dt>
                <dd>{project.category}</dd>
              </div>
              <div className="row">
                <dt>年份</dt>
                <dd>{project.year}</dd>
              </div>
              <div className="row">
                <dt>角色</dt>
                <dd>{project.role}</dd>
              </div>
            </dl>
          </aside>
        </div>

        <div className="case-images">
          {project.images.map((img) => (
            <figure className="rv" key={img.src}>
              <img src={img.src} alt={img.alt} width={1536} height={1024} loading="lazy" decoding="async" />
              <figcaption className="meta">{img.caption}</figcaption>
            </figure>
          ))}
        </div>

        <nav className="case-nav" aria-label="项目导航">
          <a href="/#work" onClick={go('/#work')}>
            <span className="meta">← 全部作品</span>
            <span className="c-title">精选作品</span>
          </a>
          <a className="next" href={`/work/${next.slug}`} onClick={go(`/work/${next.slug}`)}>
            <span className="meta">下一个项目 →</span>
            <span className="c-title">{next.title}</span>
          </a>
        </nav>
      </article>
      <p className="meta" style={{ padding: '20px var(--pad) 0' }}>
        项目 {projects.findIndex((p) => p.slug === slug) + 1} / {projects.length} — 图片来自方块之家社群历史资料，项目叙事为虚构演示。
      </p>
      <Contact />
    </main>
  )
}
