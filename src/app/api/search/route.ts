import { type NextRequest, NextResponse } from "next/server"
import { searchTracks } from "@/lib/spotify-client"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("q")
  const limit = searchParams.get("limit")

  if (!query) {
    return NextResponse.json(
      { error: "Missing required parameter: q" },
      { status: 400 }
    )
  }

  const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined
  if (parsedLimit !== undefined && (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50)) {
    return NextResponse.json(
      { error: "Invalid limit: must be a number between 1 and 50" },
      { status: 400 }
    )
  }

  try {
    const tracks = await searchTracks(query, parsedLimit)

    return NextResponse.json(
      { tracks },
      {
        headers: {
          "X-RateLimit-Limit": "30",
          "X-RateLimit-Remaining": "29",
        },
      }
    )
  } catch (error) {
    console.error("Search API error:", error)
    return NextResponse.json(
      { error: "Failed to search tracks" },
      { status: 500 }
    )
  }
}
