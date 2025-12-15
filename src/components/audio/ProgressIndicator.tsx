"use client"

import { springs } from "@/animations"
import { usePlayerControls, usePlayerState } from "@/core"
import { motion } from "motion/react"
import { memo, useCallback, useRef } from "react"

export interface ProgressIndicatorProps {
  readonly className?: string
  readonly showTime?: boolean
  readonly interactive?: boolean
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export const ProgressIndicator = memo(function ProgressIndicator({
  className = "",
  showTime = true,
  interactive = true,
}: ProgressIndicatorProps) {
  const state = usePlayerState()
  const { seek } = usePlayerControls()
  const barRef = useRef<HTMLDivElement>(null)

  const getCurrentTime = (): number => {
    if (state._tag === "Playing" || state._tag === "Paused") {
      return state.currentTime
    }
    if (state._tag === "Completed") {
      return state.lyrics.duration
    }
    return 0
  }

  const getDuration = (): number => {
    if (state._tag === "Idle") {
      return 0
    }
    return state.lyrics.duration
  }

  const currentTime = getCurrentTime()
  const duration = getDuration()
  const progress = duration > 0 ? currentTime / duration : 0

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!interactive || !barRef.current || duration <= 0) return

      const rect = barRef.current.getBoundingClientRect()
      const clickX = event.clientX - rect.left
      const percentage = Math.max(0, Math.min(1, clickX / rect.width))
      const newTime = percentage * duration

      seek(newTime)
    },
    [interactive, duration, seek],
  )

  if (state._tag === "Idle") {
    return null
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {showTime && (
        <span className="text-sm text-neutral-400 tabular-nums min-w-[3.5rem]">
          {formatTime(currentTime)}
        </span>
      )}

      <div
        ref={barRef}
        onClick={handleClick}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
          }
        }}
        role={interactive ? "slider" : "progressbar"}
        aria-label="Playback progress"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={interactive ? 0 : undefined}
        className={`
          relative flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden
          ${interactive ? "cursor-pointer" : ""}
        `}
      >
        <motion.div
          className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full"
          initial={false}
          animate={{ width: `${progress * 100}%` }}
          transition={springs.default}
        />
      </div>

      {showTime && (
        <span className="text-sm text-neutral-400 tabular-nums min-w-[3.5rem] text-right">
          {formatTime(duration)}
        </span>
      )}
    </div>
  )
})
