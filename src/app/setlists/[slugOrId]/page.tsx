import { db } from "@/lib/db"
import { userSetlistSongs, userSetlists } from "@/lib/db/schema"
import { parseSetlistSlugWithId } from "@/lib/slug"
import { asc, eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { SetlistDetailClient } from "./SetlistDetailClient"

interface PageProps {
  params: Promise<{ slugOrId: string }>
}

export default async function SetlistDetailPage({ params }: PageProps) {
  const { slugOrId } = await params
  const id = parseSetlistSlugWithId(slugOrId)

  if (!id) {
    notFound()
  }

  const [setlist] = await db
    .select({
      id: userSetlists.id,
      name: userSetlists.name,
      description: userSetlists.description,
      color: userSetlists.color,
      icon: userSetlists.icon,
    })
    .from(userSetlists)
    .where(eq(userSetlists.id, id))

  if (!setlist) {
    notFound()
  }

  const songs = await db
    .select({
      id: userSetlistSongs.id,
      songId: userSetlistSongs.songId,
      songProvider: userSetlistSongs.songProvider,
      songTitle: userSetlistSongs.songTitle,
      songArtist: userSetlistSongs.songArtist,
      sortOrder: userSetlistSongs.sortOrder,
    })
    .from(userSetlistSongs)
    .where(eq(userSetlistSongs.setlistId, id))
    .orderBy(asc(userSetlistSongs.sortOrder))

  return <SetlistDetailClient setlist={setlist} songs={songs} />
}
