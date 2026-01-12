"use client"

import {
  type LinePatch,
  type SectionType,
  type SongEditPatchPayload,
  computeEditFlags,
  createEmptyPatchPayload,
  findLinePatch,
  hasAnyEdits,
  updateEditPayload,
} from "@/lib/song-edits"
import { userApi } from "@/lib/user-api"
import { Data, Effect } from "effect"
import { useSyncExternalStore } from "react"

// ============================================================================
// SongEdits Errors
// ============================================================================

/**
 * Error during song edits API operations
 */
export class SongEditsError extends Data.TaggedClass("SongEditsError")<{
  readonly operation: string
  readonly cause?: unknown
}> {}

const CACHE_KEY_PREFIX = "scrolltunes:song-edits:"
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const CACHE_VERSION = 1

interface CachedEdits {
  payload: SongEditPatchPayload
  fetchedAt: number
  version: number
}

interface SongEditsState {
  readonly status: "idle" | "loading" | "ready" | "saving" | "error"
  readonly songId: number | null
  readonly lrcHash: string | null
  readonly payload: SongEditPatchPayload | null
  readonly originalPayload: SongEditPatchPayload | null
  readonly isDirty: boolean
  readonly isEditMode: boolean
  readonly error: string | null
}

const EMPTY_STATE: SongEditsState = {
  status: "idle",
  songId: null,
  lrcHash: null,
  payload: null,
  originalPayload: null,
  isDirty: false,
  isEditMode: false,
  error: null,
}

// --- localStorage helpers ---

function getCacheKey(songId: number): string {
  return `${CACHE_KEY_PREFIX}${songId}`
}

function loadFromCache(songId: number): SongEditPatchPayload | null {
  if (typeof window === "undefined") return null

  try {
    const stored = localStorage.getItem(getCacheKey(songId))
    if (!stored) return null

    const cached = JSON.parse(stored) as CachedEdits
    const age = Date.now() - cached.fetchedAt

    if (age > CACHE_TTL_MS || cached.version !== CACHE_VERSION) {
      localStorage.removeItem(getCacheKey(songId))
      return null
    }
    return cached.payload
  } catch {
    return null
  }
}

function saveToCache(songId: number, payload: SongEditPatchPayload): void {
  if (typeof window === "undefined") return

  try {
    const cached: CachedEdits = {
      payload,
      fetchedAt: Date.now(),
      version: CACHE_VERSION,
    }
    localStorage.setItem(getCacheKey(songId), JSON.stringify(cached))
  } catch {
    // Failed to save to localStorage
  }
}

function removeFromCache(songId: number): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(getCacheKey(songId))
  } catch {
    // Ignore
  }
}

// --- SongEditsStore ---

class SongEditsStore {
  private listeners = new Set<() => void>()
  private state: SongEditsState = EMPTY_STATE

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SongEditsState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private updateState(partial: Partial<SongEditsState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  // --- Loading ---

  private loadEditsEffect(songId: number, lrcHash: string): Effect.Effect<void, SongEditsError> {
    return Effect.gen(this, function* () {
      // Skip if already loaded for this song with same hash
      if (
        this.state.songId === songId &&
        this.state.lrcHash === lrcHash &&
        this.state.status === "ready"
      ) {
        return
      }

      // Check localStorage first
      const cached = loadFromCache(songId)
      if (cached && cached.lrcHash === lrcHash) {
        this.updateState({
          status: "ready",
          songId,
          lrcHash,
          payload: cached,
          originalPayload: cached,
          isDirty: false,
          error: null,
        })
        return
      }

      this.updateState({
        status: "loading",
        songId,
        lrcHash,
        payload: null,
        originalPayload: null,
        isDirty: false,
        error: null,
      })

      // Fetch from server
      const data = yield* Effect.tryPromise({
        try: () =>
          userApi.get<{ edits: SongEditPatchPayload | null }>(`/api/user/song-edits/${songId}`),
        catch: cause => new SongEditsError({ operation: "loadEdits", cause }),
      })

      if (data?.edits) {
        // Check if patches still align with current lyrics
        if (data.edits.lrcHash !== lrcHash) {
          // Hash mismatch - patches may not align correctly
          // Still load them but could add a warning indicator
          console.warn("Song edit patches may be outdated - LRC hash mismatch")
        }
        saveToCache(songId, data.edits)
        this.updateState({
          status: "ready",
          payload: data.edits,
          originalPayload: data.edits,
          isDirty: false,
          error: null,
        })
      } else {
        // No edits found - use empty state
        this.updateState({
          status: "ready",
          payload: null,
          originalPayload: null,
          isDirty: false,
          error: null,
        })
      }
    })
  }

  loadEdits(songId: number, lrcHash: string): void {
    Effect.runFork(
      this.loadEditsEffect(songId, lrcHash).pipe(
        Effect.catchAll(error =>
          Effect.sync(() => {
            this.updateState({
              status: "error",
              error: error.cause instanceof Error ? error.cause.message : "Failed to load edits",
            })
          }),
        ),
      ),
    )
  }

  // --- Saving ---

  private saveEditsEffect(): Effect.Effect<boolean, SongEditsError> {
    return Effect.gen(this, function* () {
      const { songId, payload } = this.state
      if (songId === null || payload === null) {
        return false
      }

      this.updateState({ status: "saving" })

      // Optimistic local save
      saveToCache(songId, payload)

      // Sync to server
      const result = yield* Effect.tryPromise({
        try: () =>
          userApi.postWithResponse<{ success: boolean }>(`/api/user/song-edits/${songId}`, {
            edits: payload,
          }),
        catch: cause => new SongEditsError({ operation: "saveEdits", cause }),
      })

      if (result?.success) {
        this.updateState({
          status: "ready",
          originalPayload: payload,
          isDirty: false,
          error: null,
        })
        return true
      }

      this.updateState({
        status: "error",
        error: "Failed to save edits",
      })
      return false
    })
  }

  async saveEdits(): Promise<boolean> {
    return Effect.runPromise(
      this.saveEditsEffect().pipe(
        Effect.catchAll(error =>
          Effect.sync(() => {
            this.updateState({
              status: "error",
              error: error.cause instanceof Error ? error.cause.message : "Failed to save edits",
            })
            return false
          }),
        ),
      ),
    )
  }

  // --- Edit Mode ---

  enterEditMode(): void {
    const { lrcHash } = this.state
    if (!lrcHash) {
      console.error("Cannot enter edit mode without lrcHash")
      return
    }

    // Initialize empty payload if none exists
    if (this.state.payload === null) {
      const newPayload = createEmptyPatchPayload(lrcHash)
      this.updateState({
        isEditMode: true,
        payload: newPayload,
      })
    } else {
      this.updateState({ isEditMode: true })
    }
  }

  exitEditMode(): void {
    this.updateState({ isEditMode: false })
  }

  // --- Line Operations ---

  private ensurePayload(): SongEditPatchPayload {
    const { lrcHash } = this.state
    if (!lrcHash) {
      throw new Error("Cannot create payload without lrcHash")
    }
    return this.state.payload ?? createEmptyPatchPayload(lrcHash)
  }

  private updatePayloadWithPatches(linePatches: readonly LinePatch[]): void {
    const flags = computeEditFlags(linePatches)
    const newPayload = updateEditPayload(this.ensurePayload(), {
      linePatches,
      ...flags,
    })
    this.updateState({
      payload: newPayload,
      isDirty: true,
    })
  }

  skipLine(lineIndex: number): void {
    const payload = this.ensurePayload()
    const existing = findLinePatch(payload.linePatches, lineIndex)

    let newPatches: readonly LinePatch[]
    if (existing) {
      // Update existing patch
      newPatches = payload.linePatches.map(p =>
        p.idx === lineIndex ? { ...p, action: "skip" as const, skipped: true } : p,
      )
    } else {
      // Add new skip patch
      newPatches = [
        ...payload.linePatches,
        { idx: lineIndex, action: "skip" as const, skipped: true },
      ]
    }

    this.updatePayloadWithPatches(newPatches)
  }

  unskipLine(lineIndex: number): void {
    const payload = this.ensurePayload()
    const existing = findLinePatch(payload.linePatches, lineIndex)

    if (!existing || existing.action !== "skip") {
      return
    }

    // Remove the skip patch entirely
    const newPatches = payload.linePatches.filter(p => p.idx !== lineIndex)
    this.updatePayloadWithPatches(newPatches)
  }

  skipLineRange(startLineIndex: number, endLineIndex: number): void {
    const payload = this.ensurePayload()

    const existingIndices = new Set(payload.linePatches.map(p => p.idx))
    const newSkipPatches: LinePatch[] = []

    for (let idx = startLineIndex; idx <= endLineIndex; idx++) {
      if (!existingIndices.has(idx)) {
        newSkipPatches.push({ idx, action: "skip", skipped: true })
      }
    }

    const updatedExisting = payload.linePatches.map(p => {
      if (p.idx >= startLineIndex && p.idx <= endLineIndex) {
        return { ...p, action: "skip" as const, skipped: true }
      }
      return p
    })

    this.updatePayloadWithPatches([...updatedExisting, ...newSkipPatches])
  }

  modifyLineText(lineIndex: number, newText: string): void {
    const payload = this.ensurePayload()
    const existing = findLinePatch(payload.linePatches, lineIndex)

    let newPatches: readonly LinePatch[]
    if (existing) {
      newPatches = payload.linePatches.map(p =>
        p.idx === lineIndex ? { ...p, action: "modify" as const, customText: newText } : p,
      )
    } else {
      newPatches = [
        ...payload.linePatches,
        { idx: lineIndex, action: "modify" as const, customText: newText },
      ]
    }

    this.updatePayloadWithPatches(newPatches)
  }

  restoreLineText(lineIndex: number): void {
    const payload = this.ensurePayload()
    const existing = findLinePatch(payload.linePatches, lineIndex)

    if (!existing || existing.action !== "modify") {
      return
    }

    // Remove the modify patch
    const newPatches = payload.linePatches.filter(p => p.idx !== lineIndex)
    this.updatePayloadWithPatches(newPatches)
  }

  setSectionMarker(lineIndex: number, type: SectionType, label?: string): void {
    const payload = this.ensurePayload()
    const existing = findLinePatch(payload.linePatches, lineIndex)

    const sectionPatch: LinePatch =
      type === "custom" && label !== undefined
        ? { idx: lineIndex, action: "section", sectionType: type, sectionLabel: label }
        : { idx: lineIndex, action: "section", sectionType: type }

    let newPatches: readonly LinePatch[]
    if (existing) {
      newPatches = payload.linePatches.map(p => (p.idx === lineIndex ? sectionPatch : p))
    } else {
      newPatches = [...payload.linePatches, sectionPatch]
    }

    this.updatePayloadWithPatches(newPatches)
  }

  removeSectionMarker(lineIndex: number): void {
    const payload = this.ensurePayload()
    const existing = findLinePatch(payload.linePatches, lineIndex)

    if (!existing || existing.action !== "section") {
      return
    }

    const newPatches = payload.linePatches.filter(p => p.idx !== lineIndex)
    this.updatePayloadWithPatches(newPatches)
  }

  // --- Global Overrides ---

  setBpmOverride(bpm: number | null): void {
    const newPayload = updateEditPayload(this.ensurePayload(), { bpmOverride: bpm })
    this.updateState({
      payload: newPayload,
      isDirty: true,
    })
  }

  setTempoMultiplier(multiplier: number | null): void {
    const newPayload = updateEditPayload(this.ensurePayload(), { tempoMultiplier: multiplier })
    this.updateState({
      payload: newPayload,
      isDirty: true,
    })
  }

  // --- Revert ---

  revertToOriginal(): void {
    const { songId, originalPayload } = this.state

    if (originalPayload) {
      this.updateState({
        payload: originalPayload,
        isDirty: false,
      })
    } else {
      // No original edits - clear everything
      this.updateState({
        payload: null,
        isDirty: false,
      })
    }

    if (songId !== null) {
      if (originalPayload) {
        saveToCache(songId, originalPayload)
      } else {
        removeFromCache(songId)
      }
    }
  }

  deleteEdits(): boolean {
    const { songId } = this.state
    if (songId === null) return false

    removeFromCache(songId)
    // userApi.delete already uses Effect.runFork internally (fire-and-forget)
    userApi.delete(`/api/user/song-edits/${songId}`)

    this.updateState({
      payload: null,
      originalPayload: null,
      isDirty: false,
    })

    return true
  }

  // --- Helpers ---

  hasEdits(): boolean {
    return hasAnyEdits(this.state.payload)
  }

  getLinePatch(lineIndex: number): LinePatch | undefined {
    return this.state.payload ? findLinePatch(this.state.payload.linePatches, lineIndex) : undefined
  }

  isLineSkipped(lineIndex: number): boolean {
    const patch = this.getLinePatch(lineIndex)
    return patch?.action === "skip" && patch.skipped === true
  }

  getLineText(lineIndex: number, originalText: string): string {
    const patch = this.getLinePatch(lineIndex)
    if (patch?.action === "modify" && patch.customText !== undefined) {
      return patch.customText
    }
    return originalText
  }

  getSectionMarker(lineIndex: number): { type: SectionType; label?: string } | null {
    const patch = this.getLinePatch(lineIndex)
    if (patch?.action === "section" && patch.sectionType) {
      if (patch.sectionLabel !== undefined) {
        return { type: patch.sectionType, label: patch.sectionLabel }
      }
      return { type: patch.sectionType }
    }
    return null
  }

  clear(): void {
    this.state = EMPTY_STATE
    this.notify()
  }
}

export const songEditsStore = new SongEditsStore()

// --- React Hooks ---

export function useSongEditsState(): SongEditsState {
  return useSyncExternalStore(
    songEditsStore.subscribe,
    songEditsStore.getSnapshot,
    () => EMPTY_STATE,
  )
}

export function useIsEditMode(): boolean {
  return useSongEditsState().isEditMode
}

export function useHasEdits(): boolean {
  const state = useSongEditsState()
  return hasAnyEdits(state.payload)
}

export function useIsDirty(): boolean {
  return useSongEditsState().isDirty
}

export function useEditPayload(): SongEditPatchPayload | null {
  return useSongEditsState().payload
}

export function useLinePatch(lineIndex: number): LinePatch | undefined {
  const payload = useEditPayload()
  if (!payload) return undefined
  return findLinePatch(payload.linePatches, lineIndex)
}

export type { SongEditsState }
