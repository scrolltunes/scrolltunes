import type { Metadata, ResolvingMetadata } from "next"
import type { LyricsApiResponse } from "@/lib/lyrics-api-types"
import { isLyricsApiSuccess } from "@/lib/lyrics-api-types"
import { parseTrackSlugWithId } from "@/lib/slug"

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{
    artistSlug: string
    trackSlugWithId: string
  }>
}

export async function generateMetadata(
  { params }: Omit<LayoutProps, "children">,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  try {
    const { artistSlug, trackSlugWithId } = await params
    const lrclibId = parseTrackSlugWithId(trackSlugWithId)

    if (!lrclibId) {
      return {
        title: "Song | ScrollTunes",
      }
    }

    // Fetch song metadata from the API
    const response = await fetch(`https://scrolltunes.com/api/lyrics/${lrclibId}`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    })

    if (!response.ok) {
      return {
        title: `${trackSlugWithId.split("-").slice(0, -1).join(" ")} | ScrollTunes`,
      }
    }

    const data: LyricsApiResponse = await response.json()

    if (!isLyricsApiSuccess(data)) {
      return {
        title: "Song | ScrollTunes",
      }
    }

    const { title, artist } = data.lyrics
    const albumArt = data.albumArt

    const ogTitle = `${title} — ${artist}`
    const ogDescription = `Listen to lyrics for ${title} by ${artist} on ScrollTunes`

    const metadata: Metadata = {
      title: ogTitle,
      description: ogDescription,
      openGraph: {
        title: ogTitle,
        description: ogDescription,
        type: "website",
        url: `https://scrolltunes.com/song/${artistSlug}/${trackSlugWithId}`,
        images: albumArt
          ? [
              {
                url: albumArt,
                width: 300,
                height: 300,
                alt: `${title} album art`,
              },
            ]
          : (await parent).openGraph?.images,
      },
      twitter: {
        card: "summary_large_image",
        title: ogTitle,
        description: ogDescription,
        images: albumArt ? [albumArt] : undefined,
      },
    }

    return metadata
  } catch {
    // If metadata fetch fails, return default metadata
    return {}
  }
}

export default function SongLayout({ children }: LayoutProps) {
  return children
}
