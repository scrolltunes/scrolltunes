"use client"

import { motion } from "motion/react"
import { memo, useId } from "react"
import { EFFECT_DEFINITIONS, type EffectType } from "./index"

export interface EffectSelectorProps {
  readonly value: EffectType
  readonly onChange: (effect: EffectType) => void
  readonly albumArt?: string | null
}

export const EffectSelector = memo(function EffectSelector({
  value,
  onChange,
  albumArt,
}: EffectSelectorProps) {
  const groupId = useId()

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium" style={{ color: "var(--color-text2)" }}>
        Effect
      </span>
      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        role="radiogroup"
        aria-label="Select album art effect"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {EFFECT_DEFINITIONS.map(effect => {
          const isSelected = effect.id === value
          const EffectIcon = effect.icon
          const thumbnailId = `${groupId}-${effect.id}`

          return (
            <motion.button
              key={effect.id}
              id={thumbnailId}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${effect.name}: ${effect.description}`}
              onClick={() => onChange(effect.id)}
              className="flex flex-col items-center gap-1.5 rounded-lg p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
              style={{
                minWidth: 60,
                scrollSnapAlign: "start",
                background: "var(--color-surface2)",
                boxShadow: isSelected ? "0 0 0 2px var(--color-accent)" : "none",
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Effect preview thumbnail */}
              <div
                className="relative flex items-center justify-center rounded overflow-hidden"
                style={{
                  width: 40,
                  height: 40,
                  background: albumArt ? `url(${albumArt})` : "var(--color-surface3)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {/* Icon overlay */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    background: "rgba(0,0,0,0.4)",
                  }}
                >
                  <EffectIcon size={18} weight="regular" style={{ color: "white" }} />
                </div>
              </div>

              {/* Effect name */}
              <span
                className="text-[10px] font-medium text-center leading-tight"
                style={{
                  color: isSelected ? "var(--color-accent)" : "var(--color-text3)",
                }}
              >
                {effect.name}
              </span>
            </motion.button>
          )
        })}

        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>
    </div>
  )
})
