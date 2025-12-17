import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { searchLRCLibBySpotifyMetadata } from "./lyrics-client"

describe("Spotify-first search", () => {
  /**
   * Integration test - requires network access and SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET
   *
   * Tests that Spotify normalizes "my sacrifice" to "My Sacrifice" by Creed,
   * and that LRCLIB is searched with exact metadata.
   */
  it("should resolve 'my sacrifice' to 'My Sacrifice' by Creed", async () => {
    const query = "my sacrifice"

    const results = await Effect.runPromise(searchLRCLibBySpotifyMetadata(query))

    // Spotify should normalize to "My Sacrifice" by Creed
    // LRCLIB should return results matching that exact metadata
    const hasCreed = results.some(
      r =>
        r.artistName.toLowerCase().includes("creed") &&
        r.trackName.toLowerCase().includes("sacrifice"),
    )

    expect(hasCreed).toBe(true)
    expect(results.length).toBeGreaterThan(0)

    // Log the top result for verification
    if (results[0]) {
      console.log(`Top result: "${results[0].trackName}" by ${results[0].artistName}`)
    }
  })
})
