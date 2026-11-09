type IconProps = {
  src: string
  /** Square size in px; pass `width`/`height` for non-square icons. */
  size?: number
  width?: number
  height?: number
  className?: string
}

/** Decorative SVG exported from the Figma design, rendered at its native size. */
export function Icon({ src, size, width = size, height = size, className }: IconProps) {
  return <img src={src} alt="" width={width} height={height} className={className} />
}
