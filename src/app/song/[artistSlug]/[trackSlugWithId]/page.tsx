import { parseTrackSlugWithId } from "@/lib/slug"
import { loadSongData } from "@/services/song-loader"
import SongPageClient from "./SongPageClient"

interface PageProps {
  params: Promise<{ artistSlug: string; trackSlugWithId: string }>
  searchParams: Promise<{ spotifyId?: string; edit?: string }>
}

export default async function SongPage({ params, searchParams }: PageProps) {
  const { artistSlug, trackSlugWithId } = await params
  const { spotifyId } = await searchParams

  const lrclibId = parseTrackSlugWithId(trackSlugWithId)

  if (lrclibId === null) {
    return (
      <SongPageClient
        lrclibId={0}
        artistSlug={artistSlug}
        trackSlugWithId={trackSlugWithId}
        initialData={null}
        initialError="invalid-url"
      />
    )
  }

  const result = await loadSongData(lrclibId, spotifyId ?? null)

  if (result._tag === "Success") {
    return (
      <SongPageClient
        lrclibId={lrclibId}
        artistSlug={artistSlug}
        trackSlugWithId={trackSlugWithId}
        initialData={result}
        initialError={null}
      />
    )
  }

  const errorType =
    result._tag === "NotFound"
      ? "not-found"
      : result._tag === "InvalidLyrics"
        ? "invalid-lyrics"
        : "network"

  return (
    <SongPageClient
      lrclibId={lrclibId}
      artistSlug={artistSlug}
      trackSlugWithId={trackSlugWithId}
      initialData={null}
      initialError={errorType}
    />
  )
}
