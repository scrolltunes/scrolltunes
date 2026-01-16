import { parseTrackSlugWithId } from "@/lib/slug"
import { loadSongData } from "@/services/song-loader"
import { headers } from "next/headers"
import SongPageClient from "./SongPageClient"

interface PageProps {
  params: Promise<{ artistSlug: string; trackSlugWithId: string }>
  searchParams: Promise<{ edit?: string }>
}

const BOT_USER_AGENTS = [
  "googlebot",
  "bingbot",
  "yandexbot",
  "duckduckbot",
  "slurp",
  "baiduspider",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "slackbot",
  "applebot",
]

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  return BOT_USER_AGENTS.some(bot => ua.includes(bot))
}

export default async function SongPage({ params }: PageProps) {
  const { artistSlug, trackSlugWithId } = await params

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

  const headersList = await headers()
  const userAgent = headersList.get("user-agent")

  if (!isBot(userAgent)) {
    return (
      <SongPageClient
        lrclibId={lrclibId}
        artistSlug={artistSlug}
        trackSlugWithId={trackSlugWithId}
        initialData={null}
        initialError={null}
      />
    )
  }

  const result = await loadSongData(lrclibId)

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
