import { db } from "@/lib/db"
import { chordEnhancements, lrcWordEnhancements } from "@/lib/db/schema"
import type { ChordEnhancementPayloadV1, EnhancementPayload } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export interface EnhancementsApiResponse {
  readonly hasEnhancement: boolean
  readonly enhancement: EnhancementPayload | null
  readonly hasChordEnhancement: boolean
  readonly chordEnhancement: ChordEnhancementPayloadV1 | null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const id = Number.parseInt(idParam, 10)

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid ID: must be a positive integer" }, { status: 400 })
  }

  const [enhancementRows, chordEnhancementRows] = await Promise.all([
    db
      .select({ id: lrcWordEnhancements.id, payload: lrcWordEnhancements.payload })
      .from(lrcWordEnhancements)
      .where(eq(lrcWordEnhancements.sourceLrclibId, id))
      .limit(1),
    db
      .select({ payload: chordEnhancements.payload })
      .from(chordEnhancements)
      .where(eq(chordEnhancements.sourceLrclibId, id))
      .limit(1),
  ])

  const enhancement = enhancementRows[0] ?? null
  const chordEnhancement = chordEnhancementRows[0] ?? null

  const body: EnhancementsApiResponse = {
    hasEnhancement: !!enhancement,
    enhancement: enhancement?.payload ?? null,
    hasChordEnhancement: !!chordEnhancement,
    chordEnhancement: chordEnhancement?.payload ?? null,
  }

  return NextResponse.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    },
  })
}
