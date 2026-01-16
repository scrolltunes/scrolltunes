"use client"

import { favoritesStore, useIsFavorite } from "@/core"
import { Heart } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { memo, useCallback } from "react"

export interface FavoriteButtonProps {
  readonly songId: number
  readonly title: string
  readonly artist: string
  readonly album?: string
  readonly albumArt?: string
  readonly size?: "sm" | "md"
  readonly className?: string
}

const sizeConfig = {
  sm: { icon: 24, button: 32 },
  md: { icon: 28, button: 40 },
} as const

export const FavoriteButton = memo(function FavoriteButton({
  songId,
  title,
  artist,
  album,
  albumArt,
  size = "md",
  className = "",
}: FavoriteButtonProps) {
  const isFavorite = useIsFavorite(songId)
  const config = sizeConfig[size]

  const handleToggle = useCallback(() => {
    favoritesStore.toggle({
      id: songId,
      title,
      artist,
      album: album ?? "",
      ...(albumArt !== undefined && { albumArt }),
    })
  }, [songId, title, artist, album, albumArt])

  return (
    <motion.button
      type="button"
      onClick={handleToggle}
      className={`flex items-center justify-center rounded-sm transition-colors hover:brightness-110 ${className}`}
      style={{ width: config.button, height: config.button, background: "var(--color-surface2)" }}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorite}
      whileTap={{ scale: 0.9 }}
    >
      <motion.div
        key={isFavorite ? "filled" : "outline"}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
      >
        <Heart
          size={config.icon}
          weight={isFavorite ? "fill" : "regular"}
          style={{
            color: isFavorite ? "var(--color-favorite)" : "var(--color-text3)",
            transition: "color 0.2s",
          }}
        />
      </motion.div>
    </motion.button>
  )
})
