// BPM domain exports
export type { BPMTrackQuery, BPMResult, NormalizedTrackKey } from "./bpm-types"
export { normalizeTrackKey, makeCacheKey } from "./bpm-types"

export type { BPMError } from "./bpm-errors"
export { BPMNotFoundError, BPMAPIError, BPMRateLimitError } from "./bpm-errors"

export type { BPMProvider } from "./bpm-provider"
export { getBpmWithFallback } from "./bpm-provider"

export { getSongBpmProvider } from "./getsongbpm-client"
export { deezerBpmProvider } from "./deezer-bpm-client"

export { getMockBpm, hasMockBpm, mockBpmProvider } from "./mock-bpm"

export { withInMemoryCache, clearBpmCache } from "./bpm-cache"
export { getCachedBpm, setCachedBpm, clearLocalBpmCache } from "./bpm-localstorage"
