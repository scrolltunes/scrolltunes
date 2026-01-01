import { type LyricsApiResponse, isLyricsApiSuccess } from "@/lib"
import { normalizeArtistName, normalizeTrackName } from "@/lib/normalize-track"
import { parseTrackSlugWithId } from "@/lib/slug"
import { loadServerConfig } from "@/services/server-config"
import type { Metadata, ResolvingMetadata } from "next"

interface GenerateMetadataProps {
  params: Promise<{ artistSlug: string; trackSlugWithId: string }>
  searchParams: Promise<{ spotifyId?: string }>
}

export async function generateMetadata(
  { params, searchParams }: GenerateMetadataProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { trackSlugWithId } = await params
  const searchParamsObj = await searchParams
  const spotifyId = searchParamsObj?.spotifyId

  const lrclibId = parseTrackSlugWithId(trackSlugWithId)

  if (lrclibId === null) {
    return {
      title: "Song | ScrollTunes",
    }
  }

  try {
    const { baseUrl } = loadServerConfig()

    const url = spotifyId
      ? `${baseUrl}/api/lyrics/${lrclibId}?spotifyId=${spotifyId}`
      : `${baseUrl}/api/lyrics/${lrclibId}`

    const response = await fetch(url, { next: { revalidate: 3600 } })
    const data: LyricsApiResponse = await response.json()

    if (!response.ok || !isLyricsApiSuccess(data)) {
      return {
        title: "Song | ScrollTunes",
      }
    }

    const title = normalizeTrackName(data.lyrics.title)
    const artist = normalizeArtistName(data.lyrics.artist)
    const pageTitle = `${title} by ${artist} | ScrollTunes`
    const albumArt = data.albumArt ?? undefined

    return {
      title: {
        absolute: pageTitle,
      },
      description: `Sing along to ${title} by ${artist} on ScrollTunes | Live lyrics teleprompter with voice-activated scrolling`,
      openGraph: {
        title: pageTitle,
        description: `Sing along to ${title} by ${artist} on ScrollTunes`,
        type: "website",
        ...(albumArt && {
          images: [
            {
              url: albumArt,
              width: 300,
              height: 300,
              alt: `${title} by ${artist}`,
            },
          ],
        }),
      },
      twitter: {
        card: "summary_large_image",
        title: pageTitle,
        description: `Sing along to ${title} by ${artist} on ScrollTunes`,
        ...(albumArt && { images: [albumArt] }),
      },
    }
  } catch (error) {
    return {
      title: "Song | ScrollTunes",
    }
  }
}

export default function SongLayout({ children }: { children: React.ReactNode }) {
  return children
}
