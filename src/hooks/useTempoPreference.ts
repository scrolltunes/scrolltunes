import { usePlayerControls } from "@/core"
import { getSavedTempo, saveTempo } from "@/lib/tempo-storage"
import { useCallback, useEffect, useRef } from "react"

export interface UseTempoPreferenceOptions {
  readonly songId: string | null
  readonly autoLoad?: boolean
  readonly autoSave?: boolean
}

export function useTempoPreference(options: UseTempoPreferenceOptions): {
  loadSavedTempo: () => void
  saveCurrentTempo: () => void
} {
  const { songId, autoLoad = true, autoSave = true } = options
  const controls = usePlayerControls()
  const lastSavedTempo = useRef<number | null>(null)

  const loadSavedTempo = useCallback(() => {
    if (!songId) return
    const saved = getSavedTempo(songId)
    if (saved !== null) {
      controls.setScrollSpeed(saved)
      lastSavedTempo.current = saved
    }
  }, [songId, controls])

  const saveCurrentTempo = useCallback(() => {
    if (!songId) return
    const current = controls.getScrollSpeed()
    saveTempo(songId, current)
    lastSavedTempo.current = current
  }, [songId, controls])

  useEffect(() => {
    if (autoLoad && songId) {
      loadSavedTempo()
    }
  }, [autoLoad, songId, loadSavedTempo])

  useEffect(() => {
    if (!autoSave || !songId) return

    const intervalId = setInterval(() => {
      const current = controls.getScrollSpeed()
      if (current !== lastSavedTempo.current) {
        saveTempo(songId, current)
        lastSavedTempo.current = current
      }
    }, 1000)

    return () => clearInterval(intervalId)
  }, [autoSave, songId, controls])

  return { loadSavedTempo, saveCurrentTempo }
}
