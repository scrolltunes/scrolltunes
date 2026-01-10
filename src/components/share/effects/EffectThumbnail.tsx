"use client"

import { motion } from "motion/react"
import { memo, useMemo } from "react"
import { applyEffect } from "./applyEffect"
import { DEFAULT_EFFECT_SETTINGS, type EffectDefinition } from "./index"

export interface EffectThumbnailProps {
  readonly effect: EffectDefinition
  readonly isSelected: boolean
  readonly albumArt?: string | null | undefined
  readonly onClick: () => void
  readonly id?: string | undefined
}

/**
 * Individual effect preview thumbnail
 *
 * Shows album art with the actual effect applied at small scale,
 * with effect name below and selected indicator.
 */
export const EffectThumbnail = memo(function EffectThumbnail({
  effect,
  isSelected,
  albumArt,
  onClick,
  id,
}: EffectThumbnailProps) {
  // Apply the effect to generate CSS styles
  const effectStyles = useMemo(() => {
    return applyEffect(effect.id, DEFAULT_EFFECT_SETTINGS)
  }, [effect.id])

  return (
    <motion.button
      id={id}
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={`${effect.name}: ${effect.description}`}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-lg p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
      style={{
        width: 60,
        minWidth: 60,
        scrollSnapAlign: "start",
        background: "var(--color-surface2)",
        boxShadow: isSelected ? "0 0 0 2px var(--color-accent)" : "none",
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Effect preview thumbnail - actual effect applied */}
      <div
        className="relative rounded overflow-hidden"
        style={{
          width: 52,
          height: 52,
        }}
      >
        {/* Album art background with filter effect */}
        <div
          className="absolute inset-0"
          style={{
            background: albumArt ? `url(${albumArt})` : "var(--color-surface3)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: effectStyles.filter,
          }}
        />

        {/* Primary overlay (vignette, tint, gradient, duotone shadow) */}
        {effectStyles.overlay ? (
          <div className="absolute inset-0" style={effectStyles.overlay} />
        ) : null}

        {/* Secondary overlay (duotone highlight) */}
        {effectStyles.secondaryOverlay ? (
          <div className="absolute inset-0" style={effectStyles.secondaryOverlay} />
        ) : null}
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

      {/* Selected indicator dot */}
      {isSelected ? (
        <div
          className="absolute bottom-1 left-1/2 -translate-x-1/2"
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "var(--color-accent)",
          }}
        />
      ) : null}
    </motion.button>
  )
})
