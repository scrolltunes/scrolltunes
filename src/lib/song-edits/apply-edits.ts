import type { LyricLine, Lyrics } from "@/core"
import { type SongEditPatchPayload, findLinePatch } from "./types"

/**
 * Apply song edit patches to lyrics for playback
 *
 * IMPORTANT: This is a CLIENT-SIDE operation.
 * Base lyrics come from LRCLIB, patches are applied locally.
 *
 * - Filters out skipped lines (hidden completely during performance)
 * - Applies text modifications (user-generated content)
 * - Preserves original timing
 */
export function applyEditPatches(lyrics: Lyrics, patches: SongEditPatchPayload | null): Lyrics {
  if (!patches || patches.linePatches.length === 0) {
    return lyrics
  }

  // Build lookup set for O(1) skip checks
  const skipSet = new Set<number>()
  const textOverrides = new Map<number, string>()

  for (const patch of patches.linePatches) {
    if (patch.action === "skip" && patch.skipped) {
      skipSet.add(patch.idx)
    }
    if (patch.action === "modify" && patch.customText !== undefined) {
      textOverrides.set(patch.idx, patch.customText)
    }
  }

  // Filter and transform lines
  const transformedLines: LyricLine[] = []

  for (let i = 0; i < lyrics.lines.length; i++) {
    const line = lyrics.lines[i]
    if (!line) continue

    // Skip lines marked for skipping
    if (skipSet.has(i)) {
      continue
    }

    // Apply text modification if exists
    const customText = textOverrides.get(i)
    if (customText !== undefined) {
      transformedLines.push({
        ...line,
        text: customText,
      })
    } else {
      transformedLines.push(line)
    }
  }

  return {
    ...lyrics,
    lines: transformedLines,
  }
}

/**
 * Get lines with edit metadata for diff view
 *
 * Returns all lines (including skipped) with their edit status.
 * Useful for showing modifications during rehearsal.
 */
export interface LineWithEditStatus {
  readonly lineIndex: number
  readonly line: LyricLine
  readonly isSkipped: boolean
  readonly isModified: boolean
  readonly originalText: string
  readonly displayText: string
}

export function getLinesWithEditStatus(
  lyrics: Lyrics,
  patches: SongEditPatchPayload | null,
): LineWithEditStatus[] {
  if (!patches) {
    return lyrics.lines.map((line, index) => ({
      lineIndex: index,
      line,
      isSkipped: false,
      isModified: false,
      originalText: line.text,
      displayText: line.text,
    }))
  }

  // Build lookup maps
  const skipSet = new Set<number>()
  const textOverrides = new Map<number, string>()

  for (const patch of patches.linePatches) {
    if (patch.action === "skip" && patch.skipped) {
      skipSet.add(patch.idx)
    }
    if (patch.action === "modify" && patch.customText !== undefined) {
      textOverrides.set(patch.idx, patch.customText)
    }
  }

  return lyrics.lines.map((line, index) => {
    const isSkipped = skipSet.has(index)
    const customText = textOverrides.get(index)
    const isModified = customText !== undefined

    return {
      lineIndex: index,
      line,
      isSkipped,
      isModified,
      originalText: line.text,
      displayText: customText ?? line.text,
    }
  })
}

/**
 * Count edit statistics
 */
export interface EditStats {
  readonly skippedCount: number
  readonly modifiedCount: number
  readonly sectionCount: number
  readonly totalPatches: number
}

export function getEditStats(patches: SongEditPatchPayload | null): EditStats {
  if (!patches) {
    return { skippedCount: 0, modifiedCount: 0, sectionCount: 0, totalPatches: 0 }
  }

  let skippedCount = 0
  let modifiedCount = 0
  let sectionCount = 0

  for (const patch of patches.linePatches) {
    if (patch.action === "skip" && patch.skipped) skippedCount++
    if (patch.action === "modify" && patch.customText !== undefined) modifiedCount++
    if (patch.action === "section") sectionCount++
  }

  return {
    skippedCount,
    modifiedCount,
    sectionCount,
    totalPatches: skippedCount + modifiedCount,
  }
}

/**
 * Check if patches are valid for the given lyrics
 *
 * Validates that:
 * 1. All patch indices are within bounds
 * 2. lrcHash matches (if provided)
 */
export function validatePatches(
  lyrics: Lyrics,
  patches: SongEditPatchPayload,
  currentLrcHash?: string,
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = []

  // Check lrcHash if provided
  if (currentLrcHash && patches.lrcHash !== currentLrcHash) {
    warnings.push(
      "Lyrics have changed since patches were created. Some edits may not align correctly.",
    )
  }

  // Check all indices are in bounds
  for (const patch of patches.linePatches) {
    if (patch.idx < 0 || patch.idx >= lyrics.lines.length) {
      warnings.push(
        `Patch references line ${patch.idx} but lyrics only have ${lyrics.lines.length} lines.`,
      )
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  }
}

/**
 * Get section marker for a line (from patches)
 */
export function getSectionMarker(
  patches: SongEditPatchPayload | null,
  lineIndex: number,
): { type: string; label?: string } | null {
  if (!patches) return null

  const patch = findLinePatch(patches.linePatches, lineIndex)
  if (patch?.action === "section" && patch.sectionType) {
    if (patch.sectionLabel !== undefined) {
      return { type: patch.sectionType, label: patch.sectionLabel }
    }
    return { type: patch.sectionType }
  }
  return null
}

// Backward compatibility alias
/** @deprecated Use applyEditPatches instead */
export const applyEditsToLyrics = applyEditPatches
