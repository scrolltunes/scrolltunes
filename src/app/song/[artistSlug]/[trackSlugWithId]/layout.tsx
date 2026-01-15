import { parseTrackSlugWithId } from "@/lib/slug"
import { loadSongData } from "@/services/song-loader"
import type { Metadata, ResolvingMetadata } from "next"
import { headers } from "next/headers"

interface GenerateMetadataProps {
  params: Promise<{ artistSlug: string; trackSlugWithId: string }>
  searchParams: Promise<{ spotifyId?: string }>
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

function unslugify(slug: string): string {
  return slug
    .replace(/-\d+$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
}

export async function generateMetadata(
  { params, searchParams }: GenerateMetadataProps,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const { artistSlug, trackSlugWithId } = await params
  const searchParamsObj = await searchParams
  const spotifyId = searchParamsObj?.spotifyId

  const lrclibId = parseTrackSlugWithId(trackSlugWithId)

  if (lrclibId === null) {
    return {
      title: "Song | ScrollTunes",
    }
  }

  const headersList = await headers()
  const userAgent = headersList.get("user-agent")

  if (!isBot(userAgent)) {
    const title = unslugify(trackSlugWithId)
    const artist = unslugify(artistSlug)
    const pageTitle = `${title} by ${artist} | ScrollTunes`

    return {
      title: {
        absolute: pageTitle,
      },
      description: `Sing along to ${title} by ${artist} on ScrollTunes | Live lyrics teleprompter with voice-activated scrolling`,
    }
  }

  const result = await loadSongData(lrclibId, spotifyId ?? null)

  if (result._tag !== "Success") {
    return {
      title: "Song | ScrollTunes",
    }
  }

  const { lyrics, albumArt } = result
  const pageTitle = `${lyrics.title} by ${lyrics.artist} | ScrollTunes`

  return {
    title: {
      absolute: pageTitle,
    },
    description: `Sing along to ${lyrics.title} by ${lyrics.artist} on ScrollTunes | Live lyrics teleprompter with voice-activated scrolling`,
    openGraph: {
      title: pageTitle,
      description: `Sing along to ${lyrics.title} by ${lyrics.artist} on ScrollTunes`,
      type: "website",
      ...(albumArt && {
        images: [
          {
            url: albumArt,
            width: 300,
            height: 300,
            alt: `${lyrics.title} by ${lyrics.artist}`,
          },
        ],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: `Sing along to ${lyrics.title} by ${lyrics.artist} on ScrollTunes`,
      ...(albumArt && { images: [albumArt] }),
    },
  }
}

export default function SongLayout({ children }: { children: React.ReactNode }) {
  return children
}
