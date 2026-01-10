import type { LyricLine } from "@/core"
import type { DetectedSection, SectionType, SongEditPatchPayload } from "./types"
import { findLinePatch } from "./types"

/**
 * Auto-detect sections from empty lines in lyrics
 *
 * Empty lines (text.trim() === "") mark section boundaries.
 * Returns detected sections with default labels.
 */
export function detectSections(lines: readonly LyricLine[]): DetectedSection[] {
  const sections: DetectedSection[] = []
  let sectionNumber = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    // First line starts a section
    if (i === 0 && line.text.trim() !== "") {
      sections.push({
        startLineIndex: i,
        defaultLabel: `Section ${sectionNumber}`,
      })
      sectionNumber++
      continue
    }

    // Empty line followed by non-empty line starts a new section
    if (line.text.trim() === "") {
      const nextLine = lines[i + 1]
      if (nextLine && nextLine.text.trim() !== "") {
        sections.push({
          startLineIndex: i + 1,
          defaultLabel: `Section ${sectionNumber}`,
        })
        sectionNumber++
      }
    }
  }

  return sections
}

/**
 * Get section markers with user overrides applied
 */
export function getSectionsWithOverrides(
  lines: readonly LyricLine[],
  payload: SongEditPatchPayload | null,
): DetectedSection[] {
  const detected = detectSections(lines)

  if (!payload) return detected

  // Apply user overrides from linePatches
  return detected.map(section => {
    const patch = findLinePatch(payload.linePatches, section.startLineIndex)

    if (patch?.action === "section" && patch.sectionType) {
      if (patch.sectionLabel !== undefined) {
        return {
          ...section,
          userOverride: {
            type: patch.sectionType,
            label: patch.sectionLabel,
          },
        }
      }
      return {
        ...section,
        userOverride: {
          type: patch.sectionType,
        },
      }
    }

    return section
  })
}

/**
 * Get line indices that belong to a section (until next section or end)
 */
export function getSectionLineIndices(
  sectionIndex: number,
  sections: DetectedSection[],
  totalLines: number,
): { start: number; end: number } {
  const section = sections[sectionIndex]
  if (!section) {
    return { start: 0, end: totalLines - 1 }
  }

  const nextSection = sections[sectionIndex + 1]
  const start = section.startLineIndex
  const end = nextSection ? nextSection.startLineIndex - 1 : totalLines - 1

  return { start, end }
}

/**
 * Get the section label for display
 */
export function getSectionLabel(section: DetectedSection): string {
  if (section.userOverride) {
    if (section.userOverride.type === "custom" && section.userOverride.label) {
      return section.userOverride.label
    }
    return SECTION_TYPE_LABELS[section.userOverride.type]
  }
  return section.defaultLabel
}

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  verse: "Verse",
  chorus: "Chorus",
  bridge: "Bridge",
  "pre-chorus": "Pre-Chorus",
  intro: "Intro",
  outro: "Outro",
  instrumental: "Instrumental",
  custom: "Section",
}

export const SECTION_TYPES: SectionType[] = [
  "verse",
  "chorus",
  "bridge",
  "pre-chorus",
  "intro",
  "outro",
  "instrumental",
  "custom",
]
