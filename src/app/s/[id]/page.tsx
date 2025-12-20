import { extractLrclibId, makeCanonicalPath } from "@/lib/slug"
import { loadServerConfig } from "@/services/server-config"
import { redirect } from "next/navigation"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ShortUrlRedirect({ params }: PageProps) {
  const { id } = await params

  const numericId = Number.parseInt(id, 10)
  if (Number.isNaN(numericId) || numericId <= 0) {
    redirect("/")
  }

  const { baseUrl } = loadServerConfig()

  try {
    const response = await fetch(`${baseUrl}/api/lyrics/${numericId}`)
    if (!response.ok) {
      redirect("/")
    }

    const data = await response.json()
    const songId = data.lyrics?.songId
    if (!songId) {
      redirect("/")
    }

    const lrclibId = extractLrclibId(songId)
    if (lrclibId === null) {
      redirect("/")
    }

    const canonicalPath = makeCanonicalPath({
      id: lrclibId,
      title: data.lyrics.title,
      artist: data.lyrics.artist,
    })

    redirect(canonicalPath)
  } catch {
    redirect("/")
  }
}
