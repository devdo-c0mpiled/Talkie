import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

/** Header/footer chrome for the Korean shop-facing pages; the root route applies it to everything except `/`. */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="header">
        <Link to="/" className="logo" aria-label="Talkie 홈"><span className="logo-mark">✳</span> talkie<span className="logo-dot">.</span></Link>
        <nav aria-label="주 메뉴">
          <a href="/#how-it-works">서비스 소개</a>
          <Link to="/admin" className="nav-admin">숍 관리자 <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="footer"><Link to="/" className="footer-logo">talkie<span>.</span></Link><p>말이 달라도, 마음은 가까이.</p><span>© 2026 Talkie</span></footer>
    </div>
  )
}
