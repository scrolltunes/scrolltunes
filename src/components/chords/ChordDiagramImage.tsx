"use client"

import { motion } from "motion/react"
import { memo } from "react"

export interface ChordDiagramImageProps {
  readonly chord: string
  readonly size?: "sm" | "md" | "lg"
  readonly onClick?: () => void
}

const sizeConfig = {
  sm: { height: 60, className: "h-[60px]" },
  md: { height: 80, className: "h-[80px]" },
  lg: { height: 120, className: "h-[120px]" },
} as const

export const ChordDiagramImage = memo(function ChordDiagramImage({
  chord,
  size = "md",
  onClick,
}: ChordDiagramImageProps) {
  const { className } = sizeConfig[size]
  const diagramUrl = `https://www.scales-chords.com/api/scapi.1.3.php?chord=${encodeURIComponent(chord)}`

  const imgElement = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={diagramUrl} alt={`${chord} chord diagram`} className={`${className} w-auto`} />
  )

  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        className="shrink-0 rounded-md bg-neutral-800/30 p-1 transition-colors hover:bg-neutral-700/50"
        aria-label={`Show ${chord} chord diagram`}
        whileTap={{ scale: 0.95 }}
      >
        {imgElement}
      </motion.button>
    )
  }

  return <div className="shrink-0">{imgElement}</div>
})
