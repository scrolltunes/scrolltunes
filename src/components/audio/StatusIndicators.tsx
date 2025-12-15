"use client"

import type { PlayerState } from "@/core"
import { Circle, Microphone, MicrophoneSlash, Pause, Play } from "@phosphor-icons/react"
import { memo } from "react"

export interface StatusIndicatorsProps {
  readonly playerState: PlayerState
  readonly isListening: boolean
  readonly isSpeaking: boolean
}

const ICON_SIZE = 20

export const StatusIndicators = memo(function StatusIndicators({
  playerState,
  isListening,
  isSpeaking,
}: StatusIndicatorsProps) {
  const getPlayerIcon = () => {
    switch (playerState._tag) {
      case "Playing":
        return <Play size={ICON_SIZE} weight="fill" className="text-green-500" />
      case "Paused":
        return <Pause size={ICON_SIZE} weight="fill" className="text-yellow-500" />
      default:
        return <Circle size={ICON_SIZE} weight="fill" className="text-neutral-500" />
    }
  }

  const getPlayerTooltip = () => {
    return playerState._tag
  }

  const getVoiceIcon = () => {
    if (isSpeaking) {
      return <Microphone size={ICON_SIZE} weight="fill" className="text-green-500" />
    }
    if (isListening) {
      return <Microphone size={ICON_SIZE} weight="fill" className="text-indigo-500" />
    }
    return <MicrophoneSlash size={ICON_SIZE} weight="fill" className="text-neutral-500" />
  }

  const getVoiceTooltip = () => {
    if (isSpeaking) return "Speaking"
    if (isListening) return "Listening"
    return "Off"
  }

  return (
    <div className="flex items-center gap-2">
      <span title={getPlayerTooltip()}>{getPlayerIcon()}</span>
      <span title={getVoiceTooltip()}>{getVoiceIcon()}</span>
    </div>
  )
})
