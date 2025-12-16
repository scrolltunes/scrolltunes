/**
 * BPM provider interface and fallback composition
 *
 * Designed for extensibility - add new providers by implementing BPMProvider
 * and adding to the providers array.
 */

import { Effect } from "effect"
import type { BPMError } from "./bpm-errors"
import { BPMNotFoundError } from "./bpm-errors"
import type { BPMResult, BPMTrackQuery } from "./bpm-types"

/**
 * Interface for BPM data providers.
 * Implement this to add new BPM sources.
 */
export interface BPMProvider {
  readonly name: string
  getBpm(query: BPMTrackQuery): Effect.Effect<BPMResult, BPMError>
}

/**
 * Compose multiple providers with fallback behavior.
 *
 * Only BPMNotFoundError triggers fallback to next provider.
 * Other errors (BPMAPIError, BPMRateLimitError) bubble up immediately.
 */
export function getBpmWithFallback(
  providers: readonly BPMProvider[],
  query: BPMTrackQuery,
): Effect.Effect<BPMResult, BPMError> {
  if (providers.length === 0) {
    return Effect.fail(
      new BPMNotFoundError({
        title: query.title,
        artist: query.artist,
      }),
    )
  }

  const first = providers[0]
  if (!first) {
    return Effect.fail(
      new BPMNotFoundError({
        title: query.title,
        artist: query.artist,
      }),
    )
  }

  const rest = providers.slice(1)

  if (rest.length === 0) {
    return first.getBpm(query)
  }

  return first
    .getBpm(query)
    .pipe(
      Effect.catchAll(error =>
        error._tag === "BPMNotFoundError" ? getBpmWithFallback(rest, query) : Effect.fail(error),
      ),
    )
}

/**
 * Race multiple providers concurrently, returning the first success.
 *
 * Uses Effect.firstSuccessOf to run all providers in parallel.
 * Only fails if ALL providers fail.
 */
export function getBpmRace(
  providers: readonly BPMProvider[],
  query: BPMTrackQuery,
): Effect.Effect<BPMResult, BPMError> {
  if (providers.length === 0) {
    return Effect.fail(
      new BPMNotFoundError({
        title: query.title,
        artist: query.artist,
      }),
    )
  }

  const effects = providers.map(provider => provider.getBpm(query))

  return Effect.firstSuccessOf(effects).pipe(
    Effect.catchAll(() =>
      Effect.fail(
        new BPMNotFoundError({
          title: query.title,
          artist: query.artist,
        }),
      ),
    ),
  )
}
