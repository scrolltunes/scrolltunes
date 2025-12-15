/**
 * Server-side in-memory BPM cache
 *
 * Wraps a BPMProvider to cache results per normalized title+artist.
 * Cache persists for the lifetime of the serverless function instance.
 */

import { Effect } from "effect"
import type { BPMError } from "./bpm-errors"
import type { BPMProvider } from "./bpm-provider"
import type { BPMResult, BPMTrackQuery } from "./bpm-types"
import { makeCacheKey } from "./bpm-types"

const cache = new Map<string, BPMResult>()

/**
 * Wrap a provider with in-memory caching
 */
export function withInMemoryCache(base: BPMProvider): BPMProvider {
  return {
    name: `${base.name}Cached`,

    getBpm(query: BPMTrackQuery): Effect.Effect<BPMResult, BPMError> {
      const key = makeCacheKey(query)
      const cached = cache.get(key)

      if (cached) {
        return Effect.succeed(cached)
      }

      return base.getBpm(query).pipe(
        Effect.tap(result =>
          Effect.sync(() => {
            cache.set(key, result)
          }),
        ),
      )
    },
  }
}

/**
 * Clear the in-memory cache (for testing)
 */
export function clearBpmCache(): void {
  cache.clear()
}
