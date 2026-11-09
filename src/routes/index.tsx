import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> BEAUTY WITHOUT BORDERS</p>
          <h1>낯선 언어 너머,<br /><em>더 가까운 대화.</em></h1>
          <p className="hero-description">예약부터 상담까지, 말이 달라 망설이지 않도록.<br className="desktop" /> Talkie가 뷰티숍과 고객의 대화를 잇습니다.</p>
          <div className="hero-actions"><a className="button button-dark" href="#how">Talkie 알아보기 <span>↗</span></a><Link className="text-link" to="/admin">숍 관리자 살펴보기 <span>→</span></Link></div>
          <p className="hero-note"><span>✳</span> 전화 통역 서비스 준비 중</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-label">A LITTLE HELP,<br />A BETTER CONNECTION <span>↗</span></div>
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="bubble bubble-one"><span className="bubble-icon">✳</span><p>안녕하세요!<br /><strong>예약 도와드릴게요.</strong></p></div>
          <div className="connector">✦</div>
          <div className="bubble bubble-two"><span className="bubble-icon">✺</span><p>Hello!<br /><strong>I'd like to book.</strong></p></div>
          <div className="art-bottom"><span>THE BEAUTY OF<br />BEING UNDERSTOOD</span><span>01 / 02</span></div>
        </div>
      </section>
      <div className="ticker" aria-hidden="true"><span>GOOD CONVERSATIONS</span><b>✳</b><span>BETTER EXPERIENCES</span><b>✳</b><span>EVERY LANGUAGE</span><b>✳</b><span>GOOD CONVERSATIONS</span></div>
      <section className="intro" id="how">
        <div className="intro-heading"><p className="eyebrow"><span /> HOW TALKIE HELPS</p><h2>좋은 경험은<br /><em>좋은 대화에서.</em></h2></div>
        <div className="intro-copy"><p>처음 방문하는 고객도, 고객을 맞이하는 숍도 편안하게 이야기할 수 있도록.</p><p>Talkie는 서로 다른 언어 사이의 거리를 줄이는 전화 통역 경험을 준비하고 있습니다.</p></div>
      </section>
      <section className="features" aria-label="서비스 방향">
        <article><span className="feature-number">01 / CONNECT</span><div className="feature-icon">↗</div><h3>더 편안한 첫 대화</h3><p>예약과 문의에서 시작되는 대화의 부담을 덜어줍니다.</p></article>
        <article><span className="feature-number">02 / UNDERSTAND</span><div className="feature-icon">✳</div><h3>서로를 이해하는 순간</h3><p>고객과 숍이 각자의 언어로 소통하는 경험을 생각합니다.</p></article>
        <article><span className="feature-number">03 / TOGETHER</span><div className="feature-icon">✺</div><h3>숍을 위한 간결한 공간</h3><p>숍 운영에 필요한 통화 관리의 시작을 준비합니다.</p></article>
      </section>
      <section className="closing"><div><p className="eyebrow"><span /> MADE FOR CONNECTION</p><h2>함께 만드는<br /><em>더 쉬운 소통.</em></h2></div><div><p>Talkie는 지금 준비 중입니다.<br />새로운 소식을 기대해 주세요.</p><Link className="button button-light" to="/admin">관리자 화면 보기 <span>↗</span></Link></div><div className="closing-star" aria-hidden="true">✳</div></section>
    </>
  )
}
