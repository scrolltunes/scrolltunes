import { normalizeTrackKey } from "@/lib/bpm"

const COMBINING_DIACRITICS = /\p{Diacritic}/gu
const NON_ALPHANUMERIC = /[^\p{Letter}\p{Number}]+/gu

export function toSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, "-")
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

export function makeSetlistPath(config: { readonly id: string; readonly name: string }): string {
  const slug = toSlug(config.name) || "setlist"
  return `/setlists/${encodeURIComponent(slug)}-${config.id}`
}

const UUID_REGEX = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
const UUID_ONLY_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseSetlistSlugWithId(slugOrId: string): string | null {
  const match = slugOrId.match(UUID_REGEX)
  if (match?.[1]) return match[1]

  return UUID_ONLY_REGEX.test(slugOrId) ? slugOrId : null
}

export function uuidToBase64Url(uuid: string): string {
  const hex = uuid.replace(/-/g, "")
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function base64UrlToUuid(code: string): string | null {
  try {
    let base64 = code.replace(/-/g, "+").replace(/_/g, "/")
    while (base64.length % 4 !== 0) {
      base64 += "="
    }
    const binary = atob(base64)
    if (binary.length !== 16) return null

    let hex = ""
    for (let i = 0; i < 16; i++) {
      hex += binary.charCodeAt(i).toString(16).padStart(2, "0")
    }
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  } catch {
    return null
  }
}
