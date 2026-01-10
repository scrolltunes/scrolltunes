/**
 * Song Edit Mode Types - LRC Patching System
 *
 * IMPORTANT: We NEVER store lyrics on the server.
 * Following the LRC enhancement pattern (docs/lrc-enhancement-system.md),
 * we store only patches that are applied client-side to base lyrics from LRCLIB.
 *
 * Patches reference lines by INDEX (like word enhancements), not by content.
 * Custom text modifications contain user-generated content only.
 *
 * Stored in user_song_settings.settingsJson.edits
 */

/** Section marker types for labeling parts of a song */
export type SectionType =
  | "verse"
  | "chorus"
  | "bridge"
  | "pre-chorus"
  | "outro"
  | "intro"
  | "instrumental"
  | "custom"

/** Edit action types */
export type LinePatchAction = "skip" | "modify" | "section"

/**
 * A single line patch representing a user modification
 *
 * Uses sparse storage - only modified lines have patches.
 * References lines by INDEX (like word enhancements), not by storing text.
 */
export interface LinePatch {
  /** Line index in the LRC (0-based, like word enhancement patches) */
  readonly idx: number

  /** Type of patch applied to this line */
  readonly action: LinePatchAction

  /** For "skip" action: whether the line is skipped during playback */
  readonly skipped?: boolean

  /**
   * For "modify" action: user's custom replacement text
   * This is USER-GENERATED content (their own lyrics/notes), not copyrighted text.
   * Empty string means "remove this line's text" (different from skip)
   */
  readonly customText?: string

  /** For "section" action: the section type */
  readonly sectionType?: SectionType

  /** For "section" action with "custom" type: custom label */
  readonly sectionLabel?: string
}

/**
 * Complete edit patch payload for a song
 *
 * Follows the LRC enhancement pattern:
 * - Patches are applied client-side to base lyrics from LRCLIB
 * - lrcHash validates patches still match the current LRC version
 * - Only indices and user-generated content are stored
 */
export interface SongEditPatchPayload {
  /** Schema version for future migrations */
  readonly version: 1

  /**
   * Hash of the base LRC this patch was created against.
   * Used to detect if LRCLIB lyrics have changed since patch creation.
   * If hash mismatches, patches may not align correctly.
   */
  readonly lrcHash: string

  /** When the patches were first created */
  readonly createdAt: string

  /** When the patches were last modified */
  readonly updatedAt: string

  /** Line-level patches (sparse - only includes modified lines) */
  readonly linePatches: readonly LinePatch[]

  /** BPM override (null = use original/detected) */
  readonly bpmOverride: number | null

  /** Tempo multiplier override for scroll speed */
  readonly tempoMultiplier: number | null

  /** Computed flags for quick existence checks */
  readonly hasSkippedLines: boolean
  readonly hasModifiedText: boolean
  readonly hasSectionMarkers: boolean
}

/** Default empty patch payload for initialization */
export function createEmptyPatchPayload(lrcHash: string): SongEditPatchPayload {
  const now = new Date().toISOString()
  return {
    version: 1,
    lrcHash,
    createdAt: now,
    updatedAt: now,
    linePatches: [],
    bpmOverride: null,
    tempoMultiplier: null,
    hasSkippedLines: false,
    hasModifiedText: false,
    hasSectionMarkers: false,
  }
}

/**
 * Auto-detected section marker from empty lines
 */
export interface DetectedSection {
  /** Index of the first line after the section break */
  readonly startLineIndex: number

  /** Auto-assigned label (e.g., "Section 1") */
  readonly defaultLabel: string

  /** User override if set */
  readonly userOverride?: {
    readonly type: SectionType
    readonly label?: string
  }
}

/**
 * Extended settingsJson structure with edit patches
 *
 * This extends the existing user_song_settings.settingsJson column
 */
export interface UserSongSettingsJson {
  /** Song edit patches (never stores original lyrics) */
  editPatches?: SongEditPatchPayload
}

// --- Backward compatibility aliases ---
// TODO: Remove these after migrating existing code

/** @deprecated Use LinePatch instead */
export type LineEdit = LinePatch
/** @deprecated Use LinePatchAction instead */
export type LineEditAction = LinePatchAction
/** @deprecated Use SongEditPatchPayload instead */
export type SongEditPayload = SongEditPatchPayload

// --- Helper Functions ---

/**
 * Create a new SongEditPatchPayload with current timestamps
 */
export function createEditPayload(
  lrcHash: string,
  partial?: Partial<Omit<SongEditPatchPayload, "version" | "lrcHash" | "createdAt" | "updatedAt">>,
): SongEditPatchPayload {
  const now = new Date().toISOString()
  return {
    ...createEmptyPatchPayload(lrcHash),
    ...partial,
    version: 1,
    lrcHash,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Update an existing payload with new patches and refresh updatedAt
 */
export function updateEditPayload(
  payload: SongEditPatchPayload,
  updates: Partial<Omit<SongEditPatchPayload, "version" | "lrcHash" | "createdAt" | "updatedAt">>,
): SongEditPatchPayload {
  return {
    ...payload,
    ...updates,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Compute hasSkippedLines, hasModifiedText, hasSectionMarkers from linePatches
 */
export function computeEditFlags(linePatches: readonly LinePatch[]): {
  hasSkippedLines: boolean
  hasModifiedText: boolean
  hasSectionMarkers: boolean
} {
  let hasSkippedLines = false
  let hasModifiedText = false
  let hasSectionMarkers = false

  for (const patch of linePatches) {
    if (patch.action === "skip" && patch.skipped) {
      hasSkippedLines = true
    }
    if (patch.action === "modify" && patch.customText !== undefined) {
      hasModifiedText = true
    }
    if (patch.action === "section") {
      hasSectionMarkers = true
    }
  }

  return { hasSkippedLines, hasModifiedText, hasSectionMarkers }
}

/**
 * Find a line patch by index
 */
export function findLinePatch(
  linePatches: readonly LinePatch[],
  lineIndex: number,
): LinePatch | undefined {
  return linePatches.find(p => p.idx === lineIndex)
}

/** @deprecated Use findLinePatch instead */
export function findLineEdit(
  lineEdits: readonly LinePatch[],
  lineId: string,
): LinePatch | undefined {
  // Extract index from "line-N" format for backward compatibility
  const match = lineId.match(/^line-(\d+)$/)
  if (!match?.[1]) return undefined
  const idx = Number.parseInt(match[1], 10)
  return findLinePatch(lineEdits, idx)
}

/**
 * Check if a line is skipped
 */
export function isLineSkipped(linePatches: readonly LinePatch[], lineIndex: number): boolean {
  const patch = findLinePatch(linePatches, lineIndex)
  return patch?.action === "skip" && patch.skipped === true
}

/**
 * Get the display text for a line (custom or original)
 * Returns the custom text if modified, otherwise the original
 */
export function getLineDisplayText(
  linePatches: readonly LinePatch[],
  lineIndex: number,
  originalText: string,
): string {
  const patch = findLinePatch(linePatches, lineIndex)
  if (patch?.action === "modify" && patch.customText !== undefined) {
    return patch.customText
  }
  return originalText
}

/**
 * Check if a payload has any patches
 */
export function hasAnyEdits(payload: SongEditPatchPayload | null | undefined): boolean {
  if (!payload) return false
  return (
    payload.linePatches.length > 0 ||
    payload.bpmOverride !== null ||
    payload.tempoMultiplier !== null
  )
}

/**
 * Convert line index to line ID format (for backward compatibility)
 */
export function lineIndexToId(index: number): string {
  return `line-${index}`
}

/**
 * Extract line index from line ID format
 */
export function lineIdToIndex(lineId: string): number | null {
  const match = lineId.match(/^line-(\d+)$/)
  if (!match?.[1]) return null
  return Number.parseInt(match[1], 10)
}
