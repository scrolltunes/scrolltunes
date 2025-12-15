/**
 * BPM error types using Effect.ts tagged errors
 */

import { Data } from "effect"

export class BPMNotFoundError extends Data.TaggedError("BPMNotFoundError")<{
  readonly title: string
  readonly artist: string
}> {}

export class BPMAPIError extends Data.TaggedError("BPMAPIError")<{
  readonly status: number
  readonly message: string
}> {}

export class BPMRateLimitError extends Data.TaggedError("BPMRateLimitError")<{
  readonly retryAfterMs: number
}> {}

export type BPMError = BPMNotFoundError | BPMAPIError | BPMRateLimitError
