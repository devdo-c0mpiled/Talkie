import type { CSSProperties, ReactNode } from 'react'

type MarqueeProps = {
  /** One full set of items. It is repeated `copies` times and scrolled by one set per loop. */
  children: ReactNode
  /** How many times the set is rendered; must cover the widest viewport plus one set. */
  copies: number
  /** Seconds to scroll one set. */
  duration: number
  reverse?: boolean
  /** Hide every copy from assistive tech (purely decorative marquees). */
  decorative?: boolean
  className?: string
}

export function Marquee({ children, copies, duration, reverse, decorative, className }: MarqueeProps) {
  const style = { '--lp-copies': copies, '--lp-marquee-duration': `${duration}s` } as CSSProperties
  return (
    <div
      className={className ? `lp-marquee ${className}` : 'lp-marquee'}
      data-reverse={reverse ? '' : undefined}
      aria-hidden={decorative || undefined}
      style={style}
    >
      <div className="lp-marquee-track">
        {Array.from({ length: copies }, (_, copy) => (
          <div className="lp-marquee-set" key={copy} aria-hidden={copy > 0 || undefined}>
            {children}
          </div>
        ))}
      </div>
    </div>
  )
}
