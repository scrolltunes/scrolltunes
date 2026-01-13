const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const

/**
 * Format musical key from Spotify pitch class + mode
 * @param key Pitch class (0-11), -1 for unknown
 * @param mode 0=minor, 1=major, null=unknown
 * @returns Formatted key string or null
 */
export function formatMusicalKey(key: number | null, mode: number | null): string | null {
  if (key === null || key === -1 || key < 0 || key > 11) {
    return null
  }

  const pitch = PITCH_CLASSES[key]
  if (pitch === undefined) return null

  const modeName = mode === 1 ? "major" : mode === 0 ? "minor" : ""

  return modeName ? `${pitch} ${modeName}` : pitch
}
