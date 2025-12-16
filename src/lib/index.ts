// Library exports
// Will contain: lyrics-parser, spotify-client, voice-detection, tempo-tracker

export {
  computeRMSFromByteFrequency,
  smoothLevel,
  detectVoiceActivity,
  detectBurst,
  isInBurstWindow,
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

export {
  toSlug,
  makeCanonicalPath,
  parseTrackSlugWithId,
  extractLrclibId,
} from "./slug"

export type { SearchResultTrack, SearchApiResponse } from "./search-api-types"

export {
  type RecentSong,
  type CachedLyrics,
  LYRICS_CACHE_TTL_MS,
  MAX_RECENT_SONGS,
  POSITION_MAX_AGE_MS,
  POSITION_MIN_SECONDS,
  POSITION_END_BUFFER_SECONDS,
} from "./recent-songs-types"

export {
  loadCachedLyrics,
  saveCachedLyrics,
  removeCachedLyrics,
  hasCachedLyrics,
  clearAllCachedLyrics,
} from "./lyrics-cache"

export {
  type SileroVADConfig,
  type SileroPreset,
  DEFAULT_SILERO_VAD_CONFIG,
  SILERO_PRESET_QUIET,
  SILERO_PRESET_NORMAL,
  SILERO_PRESET_LOUD,
  getPresetConfig,
} from "./silero-vad-config"

export { containsRTL, detectLyricsDirection } from "./text-direction"
