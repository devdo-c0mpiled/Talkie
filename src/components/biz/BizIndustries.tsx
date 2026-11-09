import { Marquee } from '../landing/Marquee'

const industries = [
  { text: 'Plastic surgery' }, { text: 'Dermatology' }, { text: 'Restaurants' }, { text: 'Hotels' },
  { text: 'Skin care' }, { text: 'Hair salons' }, { text: 'Nail salons' }, { text: 'Spas' },
  { text: '日本語', lang: 'ja' }, { text: '中文', lang: 'zh' }, { text: 'ไทย', lang: 'th' },
]

export function BizIndustries() {
  return (
    <section className="biz-band" aria-label="Industries">
      <p className="lp-sr-only">Built for clinics, restaurants, hotels, and beauty salons.</p>
      <Marquee copies={3} duration={30} decorative>
        {industries.map(({ text, lang }) => <span key={text} className="biz-band-item" lang={lang}>{text}</span>)}
      </Marquee>
    </section>
  )
}
