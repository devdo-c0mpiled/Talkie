import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin')({ component: Admin })

function Admin() {
  return (
    <section className="admin-page">
      <div className="admin-top"><Link to="/" className="back-link">← 홈으로 돌아가기</Link><span className="status"><span /> 준비 중</span></div>
      <div className="admin-content"><p className="eyebrow"><span /> TALKIE FOR SHOPS</p><h1>숍을 위한 공간,<br /><em>곧 만나요.</em></h1><p>통화와 고객 소통을 한곳에서 관리할 수 있도록<br className="desktop" /> 관리자 공간을 준비하고 있습니다.</p><div className="admin-notice"><span>✳</span><div><strong>아직 이용할 수 없어요</strong><p>로그인, 통화 연결, 관리 기능은 아직 제공되지 않습니다.</p></div></div><Link to="/" className="button button-dark">서비스 소개 보기 <span>↗</span></Link></div>
      <div className="admin-decoration" aria-hidden="true">✳</div>
    </section>
  )
}
