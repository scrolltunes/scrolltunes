import { db } from "@/lib/db"
import { userSetlists } from "@/lib/db/schema"
import { base64UrlToUuid, makeSetlistPath } from "@/lib/slug"
import { eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"

interface PageProps {
  params: Promise<{ code: string }>
}

export default async function SetlistShortUrlRedirect({ params }: PageProps) {
  const { code } = await params

  const uuid = base64UrlToUuid(code)
  if (!uuid) {
    notFound()
  }

  const [setlist] = await db
    .select({ id: userSetlists.id, name: userSetlists.name })
    .from(userSetlists)
    .where(eq(userSetlists.id, uuid))

  if (!setlist) {
    notFound()
  }

  redirect(makeSetlistPath({ id: setlist.id, name: setlist.name }))
}
