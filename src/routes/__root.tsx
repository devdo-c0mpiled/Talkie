import { HeadContent, Outlet, Scripts, createRootRoute, useLocation } from '@tanstack/react-router'
import { SiteShell } from '../components/SiteShell'
import landingCss from '../landing.css?url'
import appCss from '../styles.css?url'

const landingFonts =
  'https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&family=JetBrains+Mono&family=Noto+Sans+JP:wght@500;700&family=Noto+Sans+SC:wght@500;700&family=Noto+Sans+Thai:wght@500;700;800&display=swap'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Talkie — 서로의 말이 닿도록' },
      { name: 'description', content: '한국 뷰티숍과 외국인 고객을 위한 전화 통역 서비스, Talkie.' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: landingFonts },
      { rel: 'stylesheet', href: appCss },
      { rel: 'stylesheet', href: landingCss },
    ],
  }),
  component: Root,
})

// Pages that bring their own English chrome; every other page is a Korean shop page inside the shared shell.
const standalonePaths = ['/', '/signup', '/chat']
// Booking pages live under /b/<id>.
const standalonePrefix = '/b/'

function Root() {
  const isStandalone = useLocation({
    select: ({ pathname }) => standalonePaths.includes(pathname) || pathname.startsWith(standalonePrefix) || pathname.startsWith('/biz'),
  })

  return (
    <html lang={isStandalone ? 'en' : 'ko'}>
      <head><HeadContent /></head>
      <body>
        {isStandalone ? <Outlet /> : <SiteShell><Outlet /></SiteShell>}
        <Scripts />
      </body>
    </html>
  )
}
