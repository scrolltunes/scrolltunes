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
  searchLyrics,
  getLyricsBySpotifyId,
  fetchLyrics,
  fetchLyricsSearch,
  fetchLyricsWithFallback,
  LyricsNotFoundError,
  LyricsAPIError,
  type LyricsError,
  type LRCLibResponse,
} from "./lyrics-client"

export { haptic, isHapticSupported, type HapticPattern } from "./haptics"
