import { normalizeTrackKey } from "@/lib/bpm"

const COMBINING_DIACRITICS = /\p{Diacritic}/gu

export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function makeCanonicalPath(config: {
  readonly id: number
  readonly title: string
  readonly artist: string
}): string {
  const normalized = normalizeTrackKey({ title: config.title, artist: config.artist })
  const artistSlug = toSlug(normalized.artist) || "artist"
  const trackSlug = toSlug(normalized.title) || "track"
  return `/song/${artistSlug}/${trackSlug}-${config.id}`
}

export function parseTrackSlugWithId(slugWithId: string): number | null {
  const match = slugWithId.match(/-(\d+)$/)
  if (match?.[1] === undefined) {
    return null
  }
  const id = Number.parseInt(match[1], 10)
  return Number.isNaN(id) ? null : id
}

export function extractLrclibId(id: string): number | null {
  const match = id.match(/^lrclib-(\d+)$/)
  if (match?.[1] === undefined) {
    return null
  }
  const numId = Number.parseInt(match[1], 10)
  return Number.isNaN(numId) ? null : numId
}
