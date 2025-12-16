import type { ComponentProps } from "react"

interface LogoProps extends ComponentProps<"svg"> {
  size?: number
}

/**
 * ScrollTunes logo - stylized scroll with lyrics lines and music note accent
 */
export function Logo({ size = 24, className, ...props }: LogoProps) {
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
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      <g transform="translate(50, 50)">
        {/* Scroll/page base */}
        <path
          d="M-30 -40 Q-40 -40 -40 -30 L-40 30 Q-40 40 -30 40 L30 40 Q40 40 40 30 L40 -30 Q40 -40 30 -40 Z"
          fill="none"
          stroke="url(#logoGradient)"
          strokeWidth="3.5"
        />

        {/* Scroll curl at top */}
        <path
          d="M-30 -40 Q-20 -50 -10 -40"
          fill="none"
          stroke="url(#logoGradient)"
          strokeWidth="3.5"
        />

        {/* Lyrics lines */}
        <rect
          x="-25"
          y="-25"
          width="50"
          height="4"
          rx="2"
          fill="url(#logoGradient)"
          opacity="0.8"
        />
        <rect
          x="-25"
          y="-14"
          width="40"
          height="4"
          rx="2"
          fill="url(#logoGradient)"
          opacity="0.8"
        />
        <rect x="-25" y="-3" width="45" height="4" rx="2" fill="currentColor" />
        <rect x="-25" y="8" width="35" height="4" rx="2" fill="url(#logoGradient)" opacity="0.8" />
        <rect x="-25" y="19" width="42" height="4" rx="2" fill="url(#logoGradient)" opacity="0.7" />

        {/* Music note accent */}
        <g transform="translate(28, -22)">
          <ellipse cx="0" cy="12" rx="6" ry="5" fill="url(#logoGradient)" />
          <rect x="5" y="-12" width="2.5" height="24" fill="url(#logoGradient)" />
          <path d="M7.5 -12 Q15 -17 15 -7 Q15 0 7.5 -3" fill="url(#logoGradient)" />
        </g>
      </g>
    </svg>
  )
}
