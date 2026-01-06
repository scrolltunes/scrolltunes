"use client"

import { springs } from "@/animations"
import { Check, Play } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo } from "react"
import type { Template } from "./templates"

export interface TemplateCardProps {
  readonly template: Template
  readonly isSelected: boolean
  readonly onSelect: () => void
}

export const TemplateCard = memo(function TemplateCard({
  template,
  isSelected,
  onSelect,
}: TemplateCardProps) {
  const { previewColors } = template

  // Generate background style for preview
  const getPreviewBackground = (): string => {
    if (template.background.type === "solid") {
      return template.background.color
    }
    if (template.background.type === "gradient") {
      return template.background.gradient
    }
    if (template.background.type === "pattern") {
      return template.background.baseColor
    }
    // albumArt type - use preview colors
    return `linear-gradient(135deg, ${previewColors?.primary ?? "#1a1a2e"} 0%, ${previewColors?.secondary ?? "#16213e"} 100%)`
  }

  // Get text color for preview
  const getTextColor = (): string => {
    if (template.typography.color) {
      return template.typography.color
    }
    // Default based on background lightness
    return "#ffffff"
  }

  // Get accent color for preview elements
  const getAccentColor = (): string => {
    return previewColors?.accent ?? "rgba(255, 255, 255, 0.5)"
  }

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className="group relative flex-shrink-0 overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        width: 80,
        height: 100,
        borderWidth: 2,
        borderStyle: "solid",
        borderColor: isSelected ? "var(--color-accent)" : "transparent",
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      transition={springs.cardPress}
      aria-label={`Select ${template.name} template`}
      aria-pressed={isSelected}
    >
      {/* Preview container */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center p-2"
        style={{
          background: getPreviewBackground(),
        }}
      >
        {/* Mini album art placeholder */}
        {template.elements.albumArt?.visible !== false && (
          <div
            className="mb-1 flex-shrink-0"
            style={{
              width: template.elements.albumArt?.shape === "circle" ? 16 : 14,
              height: template.elements.albumArt?.shape === "circle" ? 16 : 14,
              borderRadius:
                template.elements.albumArt?.shape === "circle"
                  ? "50%"
                  : template.elements.albumArt?.shape === "square"
                    ? 0
                    : 2,
              background: getAccentColor(),
            }}
          />
        )}

        {/* Mini text lines */}
        <div
          className="flex w-full flex-col gap-0.5"
          style={{
            alignItems:
              template.typography.alignment === "center"
                ? "center"
                : template.typography.alignment === "right"
                  ? "flex-end"
                  : "flex-start",
            padding: "0 4px",
          }}
        >
          {/* Simulated lyric lines */}
          <div
            className="rounded-sm"
            style={{
              width: "90%",
              height: 3,
              background: getTextColor(),
              opacity: 0.9,
            }}
          />
          <div
            className="rounded-sm"
            style={{
              width: "70%",
              height: 3,
              background: getTextColor(),
              opacity: 0.7,
            }}
          />
          <div
            className="rounded-sm"
            style={{
              width: "80%",
              height: 3,
              background: getTextColor(),
              opacity: 0.5,
            }}
          />
        </div>

        {/* Pattern overlay for pattern templates */}
        {template.background.type === "pattern" && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                template.background.pattern === "dots"
                  ? "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)"
                  : template.background.pattern === "grid"
                    ? "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)"
                    : "none",
              backgroundSize:
                template.background.pattern === "dots"
                  ? "6px 6px"
                  : template.background.pattern === "grid"
                    ? "8px 8px"
                    : "auto",
            }}
          />
        )}
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full"
          style={{ background: "var(--color-accent)" }}
        >
          <Check size={12} weight="bold" className="text-white" />
        </motion.div>
      )}

      {/* Animated badge */}
      {template.isAnimated && (
        <div
          className="absolute bottom-1 left-1 flex h-4 w-4 items-center justify-center rounded-full"
          style={{ background: "rgba(0, 0, 0, 0.6)" }}
        >
          <Play size={8} weight="fill" className="text-white" />
        </div>
      )}

      {/* Hover overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "rgba(255, 255, 255, 0.05)" }}
      />
    </motion.button>
  )
})
