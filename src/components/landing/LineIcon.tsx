const shapes = {
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
}

/** Decorative stroke icon drawn in the current text color (see `.lp-ic`). */
export function LineIcon({ name, size = 20 }: { name: keyof typeof shapes; size?: number }) {
  return <svg className="lp-ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{shapes[name]}</svg>
}
