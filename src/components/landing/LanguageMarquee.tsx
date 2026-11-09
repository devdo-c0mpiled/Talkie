import { Marquee } from './Marquee'

const greetings = [
  { lang: 'ja', text: 'こんにちは' },
  { lang: 'zh-Hans', text: '你好' },
  { lang: 'th', text: 'สวัสดี' },
  { lang: 'en', text: 'Hello' },
]

export function LanguageMarquee() {
  return (
    <Marquee className="lp-greetings" copies={8} duration={16} decorative>
      {greetings.map(({ lang, text }) => <span key={lang} lang={lang}>{text}</span>)}
    </Marquee>
  )
}
