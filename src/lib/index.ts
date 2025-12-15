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
