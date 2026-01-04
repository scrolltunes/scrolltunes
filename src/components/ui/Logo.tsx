import { useId, type ComponentProps } from "react"

interface LogoProps extends ComponentProps<"svg"> {
  size?: number
  /** Use colorful gradient (indigo/purple) instead of inheriting color */
  colorful?: boolean
}

/**
 * ScrollTunes logo - stylized scroll with lyrics lines and music note accent
 * @param colorful - When true, uses indigo/purple gradient. When false, uses currentColor.
 */
export function Logo({ size = 24, className, colorful = false, ...props }: LogoProps) {
  const gradientId = useId()

  if (colorful) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className={className}
        {...props}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>

        <g transform="translate(50, 50)">
          {/* Scroll/page base */}
          <path
            d="M-30 -40 Q-40 -40 -40 -30 L-40 30 Q-40 40 -30 40 L30 40 Q40 40 40 30 L40 -30 Q40 -40 30 -40 Z"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="3.5"
          />

          {/* Scroll curl at top */}
          <path
            d="M-30 -40 Q-20 -50 -10 -40"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="3.5"
          />

          {/* Lyrics lines */}
          <rect x="-25" y="-25" width="50" height="4" rx="2" fill={`url(#${gradientId})`} opacity="0.6" />
          <rect x="-25" y="-14" width="40" height="4" rx="2" fill={`url(#${gradientId})`} opacity="0.6" />
          <rect x="-25" y="-3" width="45" height="4" rx="2" style={{ fill: "var(--color-accent-bright)" }} />
          <rect x="-25" y="8" width="35" height="4" rx="2" fill={`url(#${gradientId})`} opacity="0.6" />
          <rect x="-25" y="19" width="42" height="4" rx="2" fill={`url(#${gradientId})`} opacity="0.5" />

          {/* Music note accent */}
          <g transform="translate(28, -22)">
            <ellipse cx="0" cy="12" rx="6" ry="5" fill={`url(#${gradientId})`} />
            <rect x="5" y="-12" width="2.5" height="24" fill={`url(#${gradientId})`} />
            <path d="M7.5 -12 Q15 -17 15 -7 Q15 0 7.5 -3" fill={`url(#${gradientId})`} />
          </g>
        </g>
      </svg>
    )
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      {...props}
    >
      <g transform="translate(50, 50)">
        {/* Scroll/page base */}
        <path
          d="M-30 -40 Q-40 -40 -40 -30 L-40 30 Q-40 40 -30 40 L30 40 Q40 40 40 30 L40 -30 Q40 -40 30 -40 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
        />

        {/* Scroll curl at top */}
        <path
          d="M-30 -40 Q-20 -50 -10 -40"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
        />

        {/* Lyrics lines */}
        <rect x="-25" y="-25" width="50" height="4" rx="2" opacity="0.8" />
        <rect x="-25" y="-14" width="40" height="4" rx="2" opacity="0.8" />
        <rect x="-25" y="-3" width="45" height="4" rx="2" />
        <rect x="-25" y="8" width="35" height="4" rx="2" opacity="0.8" />
        <rect x="-25" y="19" width="42" height="4" rx="2" opacity="0.7" />

        {/* Music note accent */}
        <g transform="translate(28, -22)">
          <ellipse cx="0" cy="12" rx="6" ry="5" />
          <rect x="5" y="-12" width="2.5" height="24" />
          <path d="M7.5 -12 Q15 -17 15 -7 Q15 0 7.5 -3" />
        </g>
      </g>
    </svg>
  )
}
