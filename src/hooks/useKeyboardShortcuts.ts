"use client"

import { lyricsPageStore, usePlayerControls, usePlayerState } from "@/core"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export interface UseKeyboardShortcutsOptions {
  readonly enabled?: boolean
  readonly tempoStep?: number
  /**
   * Callback when Score Book page navigation occurs via keyboard
   * Used to enter manual mode during playback
   */
  readonly onLyricsPageNav?: () => void
}

const PRESET_TEMPOS: Record<string, number> = {
  "1": 0.75,
  "2": 1.0,
  "3": 1.25,
  "4": 1.5,
}

export function useKeyboardShortcuts(options?: UseKeyboardShortcutsOptions): void {
  const { enabled = true, tempoStep = 0.1, onLyricsPageNav } = options ?? {}
  const state = usePlayerState()
  const { play, pause, reset, setScrollSpeed, getScrollSpeed } = usePlayerControls()
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      switch (event.key) {
        case " ": {
          event.preventDefault()
          if (state._tag === "Playing") {
            pause()
          } else if (
            state._tag === "Ready" ||
            state._tag === "Paused" ||
            state._tag === "Completed"
          ) {
            play()
          }
          break
        }
        case "r":
        case "R": {
          // Only reset on plain "r" key, not with modifiers (cmd+r, cmd+shift+r for browser reload)
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            event.preventDefault()
            reset()
          }
          break
        }
        case "ArrowLeft": {
          event.preventDefault()
          onLyricsPageNav?.()
          lyricsPageStore.prevPage()
          break
        }
        case "ArrowRight": {
          event.preventDefault()
          onLyricsPageNav?.()
          lyricsPageStore.nextPage()
          break
        }
        case "ArrowUp": {
          event.preventDefault()
          const currentSpeed = getScrollSpeed()
          setScrollSpeed(currentSpeed + tempoStep)
          break
        }
        case "ArrowDown": {
          event.preventDefault()
          const currentSpeed = getScrollSpeed()
          setScrollSpeed(currentSpeed - tempoStep)
          break
        }
        case "1":
        case "2":
        case "3":
        case "4": {
          event.preventDefault()
          const preset = PRESET_TEMPOS[event.key]
          if (preset !== undefined) {
            setScrollSpeed(preset)
          }
          break
        }
        case "Backspace": {
          event.preventDefault()
          router.back()
          break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    enabled,
    state,
    tempoStep,
    onLyricsPageNav,
    play,
    pause,
    reset,
    setScrollSpeed,
    getScrollSpeed,
    router,
  ])
}
