"use client"

import { useScreenReaderAnnounce } from "@/hooks/useScreenReaderAnnounce"
import { memo, useCallback, useEffect, useId, useRef } from "react"
import { EffectThumbnail } from "./EffectThumbnail"
import { EFFECT_DEFINITIONS, type EffectType, getEffectName } from "./index"

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
  const { announce, liveRegionProps } = useScreenReaderAnnounce()
  const prevValueRef = useRef(value)

  // Announce effect changes
  useEffect(() => {
    if (prevValueRef.current !== value) {
      const effectName = getEffectName(value)
      announce(`Effect changed to ${effectName}`)
      prevValueRef.current = value
    }
  }, [value, announce])

  const handleEffectChange = useCallback(
    (effect: EffectType) => {
      onChange(effect)
    },
    [onChange],
  )

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
        {EFFECT_DEFINITIONS.map(effect => (
          <EffectThumbnail
            key={effect.id}
            id={`${groupId}-${effect.id}`}
            effect={effect}
            isSelected={effect.id === value}
            albumArt={albumArt}
            onClick={() => handleEffectChange(effect.id)}
          />
        ))}

        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>
      <div {...liveRegionProps} />
    </div>
  )
})
