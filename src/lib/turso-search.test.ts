import { ServerBaseLayer } from "@/services/server-base-layer"
import { TursoService, TursoServiceLive } from "@/services/turso"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

const testLayer = Layer.mergeAll(ServerBaseLayer, TursoServiceLive)

describe("Turso search", () => {
  /**
   * Integration test - requires network access and TURSO_LRCLIB_URL/TURSO_LRCLIB_AUTH_TOKEN
   *
   * Tests that searching for "my sacrifice" returns "My Sacrifice" by Creed
   * as a top result (ranked by popularity).
   */
  it("should return 'My Sacrifice' by Creed for query 'my sacrifice'", async () => {
    const query = "my sacrifice"

    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const turso = yield* TursoService
        return yield* turso.search(query, 10)
      }).pipe(Effect.provide(testLayer)),
    )

    // Should return results with Creed's "My Sacrifice" near the top
    const hasCreed = results.some(
      r =>
        r.artist.toLowerCase().includes("creed") &&
        r.title.toLowerCase().includes("sacrifice"),
    )

    expect(hasCreed).toBe(true)
    expect(results.length).toBeGreaterThan(0)

    // Log the top result for verification
    if (results[0]) {
      console.log(`Top result: "${results[0].title}" by ${results[0].artist}`)
    }
  })
})
