import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { searchLRCLibBySpotifyMetadata, searchLRCLibTracks } from "./lyrics-client"

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

  /**
   * Integration test - requires network access
   *
   * Compares timing between:
   * - Current flow: Direct LRCLIB search with raw query
   * - New flow: Spotify lookup first, then LRCLIB with exact metadata
   */
  it("timing: compare current vs spotify-first flow", async () => {
    const query = "my sacrifice"

    // Time current flow (direct LRCLIB)
    const currentStart = performance.now()
    const currentResult = await Effect.runPromise(searchLRCLibTracks(query))
    const currentDuration = performance.now() - currentStart

    // Time new flow (Spotify → LRCLIB)
    const newStart = performance.now()
    const newResult = await Effect.runPromise(searchLRCLibBySpotifyMetadata(query))
    const newDuration = performance.now() - newStart

    console.log(`\n=== Timing Comparison for "${query}" ===`)
    console.log(`Current flow (direct LRCLIB): ${currentDuration.toFixed(2)}ms`)
    console.log(`Spotify-first flow: ${newDuration.toFixed(2)}ms`)
    console.log(`Difference: ${(newDuration - currentDuration).toFixed(2)}ms`)
    console.log(`Current results: ${currentResult.length}, New results: ${newResult.length}`)

    // Both should return results
    expect(currentResult.length).toBeGreaterThan(0)
    expect(newResult.length).toBeGreaterThan(0)

    // Verify both contain Creed - My Sacrifice
    const currentHasCreed = currentResult.some(
      r =>
        r.artistName.toLowerCase().includes("creed") &&
        r.trackName.toLowerCase().includes("sacrifice"),
    )
    const newHasCreed = newResult.some(
      r =>
        r.artistName.toLowerCase().includes("creed") &&
        r.trackName.toLowerCase().includes("sacrifice"),
    )

    expect(currentHasCreed).toBe(true)
    expect(newHasCreed).toBe(true)
  })
})
