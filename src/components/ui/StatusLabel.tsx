"use client"

import type { DetailedActivityStatus, PlayerState } from "@/core"
import {
  Circle,
  Guitar,
  Microphone,
  Pause,
  Play,
  Warning,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { memo, useMemo } from "react"

export interface StatusConfig {
  readonly label: string
  readonly icon: React.ReactNode
  readonly colorClass: string
  readonly bgClass: string
}

const ICON_SIZE = 14

function getVoiceStatusConfig(status: DetailedActivityStatus): StatusConfig | null {
  switch (status) {
    case "idle":
      return null
    case "listening":
      return {
        label: "Listening",
        icon: <Microphone size={ICON_SIZE} weight="fill" />,
        colorClass: "text-indigo-400",
        bgClass: "bg-indigo-500/10",
      }
    case "singing":
      return {
        label: "Singing",
        icon: <Microphone size={ICON_SIZE} weight="fill" />,
        colorClass: "text-green-400",
        bgClass: "bg-green-500/10",
      }
    case "instrument":
      return {
        label: "Instrument",
        icon: <Guitar size={ICON_SIZE} weight="fill" />,
        colorClass: "text-amber-400",
        bgClass: "bg-amber-500/10",
      }
    case "noisy":
      return {
        label: "Noisy room",
        icon: <Warning size={ICON_SIZE} weight="fill" />,
        colorClass: "text-orange-400",
        bgClass: "bg-orange-500/10",
      }
  }
}

function getPlayerStatusConfig(playerState: PlayerState): StatusConfig | null {
  switch (playerState._tag) {
    case "Playing":
      return {
        label: "Playing",
        icon: <Play size={ICON_SIZE} weight="fill" />,
        colorClass: "text-green-400",
        bgClass: "bg-green-500/10",
      }
    case "Paused":
      return {
        label: "Paused",
        icon: <Pause size={ICON_SIZE} weight="fill" />,
        colorClass: "text-yellow-400",
        bgClass: "bg-yellow-500/10",
      }
    case "Ready":
      return {
        label: "Ready",
        icon: <Circle size={ICON_SIZE} weight="fill" />,
        colorClass: "text-neutral-400",
        bgClass: "bg-neutral-500/10",
      }
    default:
      return null
  }
}

export interface StatusLabelProps {
  readonly playerState: PlayerState
  readonly detailedStatus: DetailedActivityStatus
  readonly className?: string
}

export const StatusLabel = memo(function StatusLabel({
  playerState,
  detailedStatus,
  className = "",
}: StatusLabelProps) {
  const configs = useMemo(() => {
    const result: StatusConfig[] = []

    const playerConfig = getPlayerStatusConfig(playerState)
    if (playerConfig) {
      result.push(playerConfig)
    }

    // Only show voice status when not playing (voice triggers playback)
    if (playerState._tag !== "Playing") {
      const voiceConfig = getVoiceStatusConfig(detailedStatus)
      if (voiceConfig) {
        result.push(voiceConfig)
      }
    }

    return result
  }, [playerState, detailedStatus])

  if (configs.length === 0) {
    return null
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <AnimatePresence mode="popLayout">
        {configs.map(config => (
          <motion.span
            key={config.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.colorClass} ${config.bgClass}`}
          >
            {config.icon}
            {config.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  )
})
