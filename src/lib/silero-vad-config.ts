/**
 * Configuration for Silero VAD (Voice Activity Detection)
 *
 * Uses @ricky0123/vad-web with Silero VAD model for accurate
 * speech detection in the browser.
 */

export interface SileroVADConfig {
  /**
   * Base path for ONNX WASM files
   * @default "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/"
   */
  readonly onnxWASMBasePath: string

  /**
   * Base path for VAD model assets (silero_vad.onnx, vad.worklet.bundle.min.js)
   * @default "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/"
   */
  readonly baseAssetPath: string

  /**
   * Probability threshold for speech start (0-1)
   * @default 0.5
   */
  readonly positiveSpeechThreshold: number

  /**
   * Probability threshold for speech end (0-1)
   * @default 0.35
   */
  readonly negativeSpeechThreshold: number

  /**
   * Minimum duration of speech in ms before triggering start
   * @default 250
   */
  readonly minSpeechMs: number

  /**
   * Duration in ms to wait after speech ends before triggering stop
   * @default 300
   */
  readonly redemptionMs: number
}

/** Preset for quiet rooms - lower thresholds, faster response */
export const SILERO_PRESET_QUIET: SileroVADConfig = {
  onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/",
  baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
  positiveSpeechThreshold: 0.6,
  negativeSpeechThreshold: 0.3,
  minSpeechMs: 150,
  redemptionMs: 200,
}

/** Preset for normal environments - balanced settings */
export const SILERO_PRESET_NORMAL: SileroVADConfig = {
  onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/",
  baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
  positiveSpeechThreshold: 0.75,
  negativeSpeechThreshold: 0.35,
  minSpeechMs: 250,
  redemptionMs: 300,
}

/** Preset for loud/noisy environments - higher thresholds to avoid false positives */
export const SILERO_PRESET_LOUD: SileroVADConfig = {
  onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/",
  baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
  positiveSpeechThreshold: 0.85,
  negativeSpeechThreshold: 0.45,
  minSpeechMs: 350,
  redemptionMs: 400,
}

/** Preset for acoustic guitar + voice - very high threshold, longer sustain required */
export const SILERO_PRESET_GUITAR: SileroVADConfig = {
  onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/",
  baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
  positiveSpeechThreshold: 0.88, // Allow earlier singing onset
  negativeSpeechThreshold: 0.7, // Higher hysteresis
  minSpeechMs: 250, // Faster singing detection
  redemptionMs: 500, // Wait longer before speech end
}

/** Preset for voice search - sensitive to speech, 2s silence before stopping */
export const SILERO_PRESET_VOICE_SEARCH: SileroVADConfig = {
  onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/",
  baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
  positiveSpeechThreshold: 0.6, // More sensitive to detect speech quickly
  negativeSpeechThreshold: 0.35, // Standard hysteresis
  minSpeechMs: 200, // Quick detection
  redemptionMs: 2000, // 2 seconds silence before stopping
}

export type SileroPreset = "quiet" | "normal" | "loud" | "guitar" | "voice-search"

export function getPresetConfig(preset: SileroPreset): SileroVADConfig {
  switch (preset) {
    case "quiet":
      return SILERO_PRESET_QUIET
    case "normal":
      return SILERO_PRESET_NORMAL
    case "loud":
      return SILERO_PRESET_LOUD
    case "guitar":
      return SILERO_PRESET_GUITAR
    case "voice-search":
      return SILERO_PRESET_VOICE_SEARCH
  }
}

export const DEFAULT_SILERO_VAD_CONFIG: SileroVADConfig = {
  ...SILERO_PRESET_GUITAR,
}
