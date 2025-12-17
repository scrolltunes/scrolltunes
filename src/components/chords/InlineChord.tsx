import { motion } from "motion/react"
import { ChordBadge } from "./ChordBadge"

interface InlineChordProps {
  chords: readonly string[]
  isCurrentLine?: boolean
}

export function InlineChord({ chords, isCurrentLine = false }: InlineChordProps) {
  if (chords.length === 0) return null

  return (
    <motion.div
      className="flex flex-wrap gap-1.5 mb-1"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {chords.map((chord, i) => (
        <ChordBadge key={`${chord}-${i}`} chord={chord} isActive={isCurrentLine} size="sm" />
      ))}
    </motion.div>
  )
}
