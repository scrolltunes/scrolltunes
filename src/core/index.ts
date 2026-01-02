export {
  LyricsPlayer,
  lyricsPlayer,
  usePlayerState,
  useCurrentLineIndex,
  useCurrentTime,
  usePlayerControls,
  useResetCount,
  type Lyrics,
  type LyricLine,
  type LyricWord,
  type PlayerState,
  type PlayerEvent,
  LoadLyrics,
  Play,
  Pause,
  Seek,
  Reset,
  Tick,
} from "./LyricsPlayer"

export {
  VoiceActivityStore,
  voiceActivityStore,
  useVoiceActivity,
  useIsSpeaking,
  useDetailedActivityStatus,
  useVoiceControls,
  type VoiceState,
  type VADConfig,
  type VADEvent,
  type MicPermissionStatus,
  type DetailedActivityStatus,
  VADError,
  StartListening,
  StopListening,
  VoiceStart,
  VoiceStop,
  UpdateLevel,
} from "./VoiceActivityStore"

export {
  SileroVADEngine,
  SileroLoadError,
  SileroNotSupportedError,
  type SileroVADCallbacks,
} from "./SileroVADEngine"

export {
  AudioClassifierService,
  getAudioClassifier,
  getAudioClassifierIfReady,
  destroyAudioClassifier,
  type ClassifierDecision,
  type ClassificationCategory,
  type AudioClassifierConfig,
  DEFAULT_CLASSIFIER_CONFIG,
  ClassifierNotInitialized,
  ClassifierLoadError,
} from "./AudioClassifierService"

export {
  PreferencesStore,
  preferencesStore,
  usePreferences,
  usePreference,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  FONT_SIZE_STEP,
  DEFAULT_FONT_SIZE,
  type Preferences,
  type ThemeMode,
} from "./PreferencesStore"

export {
  MetronomeStore,
  metronomeStore,
  useMetronome,
  useMetronomeControls,
  type MetronomeState,
  type MetronomeMode,
  type MetronomeControls,
} from "./MetronomeStore"

export {
  recentSongsStore,
  useRecentSongsState,
  useRecentSongs,
  useRecentSong,
  useAlbumArtLoadingIds,
  useIsLoadingAlbumArt,
  useIsRecentsLoading,
  useIsRecentsInitialized,
  useExpectedRecentsCount,
  type RecentSong,
  type RecentSongsState,
} from "./RecentSongsStore"

export {
  AccountStore,
  accountStore,
  useAccount,
  useIsAuthenticated,
  useIsAdmin,
  useUser,
  type AccountState,
  type AccountUser,
  type AccountProfile,
} from "./AccountStore"

export {
  favoritesStore,
  useFavorites,
  useIsFavorite,
  type FavoriteItem,
  type ServerFavorite,
} from "./FavoritesStore"

export {
  SetlistsStore,
  setlistsStore,
  useSetlists,
  useSetlistsLoading,
  useActiveSetlist,
  useSetlist,
  useSetlistsContainingSong,
  type SetlistsState,
  type Setlist,
  type SetlistSong,
} from "./SetlistsStore"

export {
  SpeechRecognitionStore,
  speechRecognitionStore,
  useSpeechState,
  useSpeechControls,
  useIsQuotaAvailable,
  useSpeechTier,
  useIsWebSpeechAvailable,
  type SpeechState,
  type SpeechTier,
  type SpeechEvent,
  SpeechRecognitionError,
  StartRecognition,
  StopRecognition,
  ReceivePartial,
  ReceiveFinal,
  SetSpeechError,
} from "./SpeechRecognitionStore"

export {
  chordsStore,
  useChordsState,
  useChordsData,
  useTranspose,
  useShowChords,
  useVariableSpeedPainting,
  useUniqueChords,
  type ChordsState,
} from "./ChordsStore"
