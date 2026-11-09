import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Talkie — 서로의 말이 닿도록' },
      { name: 'description', content: '한국 뷰티숍과 외국인 고객을 위한 전화 통역 서비스, Talkie.' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: Root,
})

function Root() {
  return (
    <html lang="ko">
      <head><HeadContent /></head>
      <body>
        <div className="shell">
          <header className="header">
            <Link to="/" className="logo" aria-label="Talkie 홈"><span className="logo-mark">✳</span> talkie<span className="logo-dot">.</span></Link>
            <nav aria-label="주 메뉴">
              <a href="/#how">서비스 소개</a>
              <Link to="/admin" className="nav-admin">숍 관리자 <span aria-hidden="true">↗</span></Link>
            </nav>
          </header>
          <main><RouteOutlet /></main>
          <footer className="footer"><Link to="/" className="footer-logo">talkie<span>.</span></Link><p>말이 달라도, 마음은 가까이.</p><span>© 2026 Talkie</span></footer>
        </div>
        <Scripts />
      </body>
    </html>
  )
}

import { Outlet as RouteOutlet } from '@tanstack/react-router'
