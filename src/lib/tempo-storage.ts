const STORAGE_KEY = "scrolltunes:tempo-preferences"

interface TempoPreferences {
  [songId: string]: number
}

function getPreferences(): TempoPreferences {
  if (typeof window === "undefined") return {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as TempoPreferences) : {}
  } catch {
    return {}
  }
}

function setPreferences(prefs: TempoPreferences): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Storage full or unavailable
  }
}

export function getSavedTempo(songId: string): number | null {
  const prefs = getPreferences()
  return prefs[songId] ?? null
}

export function saveTempo(songId: string, tempo: number): void {
  const prefs = getPreferences()
  prefs[songId] = tempo
  setPreferences(prefs)
}

export function clearTempo(songId: string): void {
  const prefs = getPreferences()
  delete prefs[songId]
  setPreferences(prefs)
}

export function clearAllTempos(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable
  }
}
