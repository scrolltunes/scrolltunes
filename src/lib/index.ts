// Library exports
// Will contain: lyrics-parser, spotify-client, voice-detection, tempo-tracker

export {
  computeRMSFromByteFrequency,
  smoothLevel,
  detectVoiceActivity,
  DEFAULT_VAD_CONFIG,
  INITIAL_VAD_RUNTIME,
  type VADConfig,
  type VADRuntimeState,
} from "./voice-detection"

export {
  DEMO_LYRICS,
  LONG_TEST_LYRICS,
  getMockLyrics,
  MOCK_SONGS,
} from "./mock-lyrics"

export {
  parseLRC,
  parseTimestamp,
  formatTimestamp,
  type LRCMetadata,
} from "./lyrics-parser"

export {
  getLyrics,
  getLyricsCached,
  searchLyrics,
  searchLRCLibTracks,
  getLyricsBySpotifyId,
  fetchLyrics,
  fetchLyricsCached,
  fetchLyricsSearch,
  fetchLRCLibTracks,
  fetchLyricsWithFallback,
  LyricsNotFoundError,
  LyricsAPIError,
  type LyricsError,
  type LRCLibResponse,
  type LRCLibTrackResult,
} from "./lyrics-client"

export { haptic, isHapticSupported, type HapticPattern } from "./haptics"

export {
  type AttributionSource as LyricsAttributionSource,
  type LyricsApiAttribution,
  type LyricsApiSuccessResponse,
  type LyricsApiErrorResponse,
  type LyricsApiResponse,
  isLyricsApiSuccess,
} from "./lyrics-api-types"

// BPM domain
export {
  type BPMTrackQuery,
  type BPMResult,
  type NormalizedTrackKey,
  normalizeTrackKey,
  makeCacheKey,
  type BPMError,
  BPMNotFoundError,
  BPMAPIError,
  BPMRateLimitError,
  type BPMProvider,
  getBpmWithFallback,
  getSongBpmProvider,
  withInMemoryCache,
  clearBpmCache,
  getCachedBpm,
  setCachedBpm,
  clearLocalBpmCache,
  getMockBpm,
  hasMockBpm,
  mockBpmProvider,
} from "./bpm"
