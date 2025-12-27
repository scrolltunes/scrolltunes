# Advanced Voice Detection System Design

## Problem Statement

ScrollTunes needs to detect when a performer **starts singing** to trigger synchronized lyrics scrolling. The current energy-based Voice Activity Detection (VAD) approach using RMS levels and frequency filtering (~300-3400Hz) produces false positives from:

- Guitar strums and chords
- Drum hits
- Audience noise and applause
- Other instruments in the same frequency range as human voice

**Goal**: Detect WHEN singing starts (not WHAT is being sung), with robust discrimination between human voice and musical instruments.

## Current Implementation

The existing `VoiceActivityStore` uses:
- `computeRMSFromByteFrequency()` - energy-based detection
- `smoothLevel()` - exponential smoothing
- `detectVoiceActivity()` - hysteresis thresholds for state transitions

**Limitations**:
- Cannot distinguish voice from instruments with similar energy levels
- High false positive rate in live music environments
- No learned understanding of speech/voice characteristics

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    THREE-TIER DETECTION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Tier 1: Energy Pre-filter (current approach)                  │
│   ├── Fast, ~1ms latency                                        │
│   ├── Filters obvious silence                                   │
│   └── Gates Tier 2 to save compute                              │
│                           ↓                                     │
│   Tier 2: Silero VAD (@ricky0123/vad-web)                       │
│   ├── Deep learning model, ~5ms latency                         │
│   ├── Trained on 6000+ languages                                │
│   ├── Distinguishes speech from noise                           │
│   └── Runs via ONNX Runtime Web (browser-native)                │
│                           ↓                                     │
│   Tier 3: Audio Classification (optional)                       │
│   ├── YAMNet via MediaPipe Audio Classifier                     │
│   ├── 521 audio event classes                                   │
│   ├── Explicitly classifies "Speech" vs "Guitar" vs "Drum"      │
│   └── Extra confirmation for noisy environments                 │
│                           ↓                                     │
│   ══════════════════════════════════════════════════════════    │
│                    TRIGGER LYRICS PLAYBACK                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Solution Options

### Option 1: Silero VAD via @ricky0123/vad-web (Recommended)

**The best browser-native VAD available.** Uses a deep learning model trained on diverse audio, running entirely in-browser via ONNX Runtime Web.

#### Comparison

| Feature | Current (Energy-Based) | Silero VAD |
|---------|------------------------|------------|
| Accuracy | Low in noise | High - trained on diverse audio |
| False positives | Guitar/drums trigger it | Trained to distinguish speech |
| Model size | N/A | ~2MB ONNX model |
| Latency | <1ms | <5ms per frame |
| Privacy | ✅ On-device | ✅ On-device |
| License | N/A | MIT |

#### Installation

```bash
bun add @ricky0123/vad-web onnxruntime-web
```

#### Integration Example

```typescript
import { MicVAD } from "@ricky0123/vad-web"

const vad = await MicVAD.new({
  onSpeechStart: () => {
    console.log("Voice detected - start lyrics!")
    lyricsPlayer.play()
  },
  onSpeechEnd: (audio: Float32Array) => {
    // Optional: analyze the speech segment
  },
  // Tuning parameters for live music environment
  positiveSpeechThreshold: 0.7,  // Higher = more confidence required
  negativeSpeechThreshold: 0.3,  // Hysteresis for stable detection
  redemptionFrames: 8,           // Frames to wait before "speech end"
  frameSamples: 1536,            // ~96ms at 16kHz
  minSpeechFrames: 3,            // Minimum frames to trigger
  
  // Asset paths (can use CDN)
  onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
  baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/",
})

await vad.start()
```

#### Key Advantages
- **MIT licensed**, no API keys, no telemetry
- **Runs entirely in browser** - no backend needed
- **Pre-trained on speech** - neural network learned voice characteristics
- **Active community** - 1.7k GitHub stars, regular updates
- **Simple API** - callbacks for speech start/end

---

### Option 2: YAMNet Audio Classification

If Silero VAD still produces false positives with instruments, add **audio classification** as a second filter. YAMNet can classify 521 audio events including:

- **Speech classes** (indices 0-13): Speech, Child speech, Narration, Singing, Conversation
- **Music classes** (indices 137+): Guitar, Drum, Piano, Strumming
- **Noise classes**: Applause, Crowd, Cheering

#### A. MediaPipe Audio Classifier (Recommended for Browser)

```typescript
import { AudioClassifier, FilesetResolver } from "@mediapipe/tasks-audio"

const audio = await FilesetResolver.forAudioTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio/wasm"
)

const classifier = await AudioClassifier.createFromOptions(audio, {
  baseOptions: {
    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/latest/yamnet.tflite"
  },
  // Only care about voice-related classes
  categoryAllowlist: [
    "Speech", "Singing", "Child speech", "Narration", "Conversation"
  ],
  scoreThreshold: 0.3,
  maxResults: 5,
})

// Classify audio buffer
const results = classifier.classify(audioBuffer.getChannelData(0), sampleRate)
const isSingingOrSpeech = results[0]?.classifications[0]?.categories
  .some(c => c.categoryName?.includes("Speech") || c.categoryName === "Singing")
```

#### B. TensorFlow.js with YAMNet

```typescript
import * as tf from "@tensorflow/tfjs"

const model = await tf.loadGraphModel(
  "https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1",
  { fromTFHub: true }
)

// YAMNet expects 16kHz mono audio, normalized to [-1, 1]
const waveform = tf.tensor1d(audioSamples)
const [scores, embeddings, spectrogram] = model.predict(waveform)

// Check if top class is speech-related (indices 0-13 in AudioSet)
const topClassIndex = scores.argMax(-1).dataSync()[0]
const isSpeech = topClassIndex <= 13
```

---

### Option 3: Hybrid Tiered Approach

For maximum accuracy, combine multiple detection methods:

```typescript
// src/core/AdvancedVoiceDetector.ts
import { MicVAD } from "@ricky0123/vad-web"
import { AudioClassifier } from "@mediapipe/tasks-audio"
import { Data, Effect } from "effect"

// Tagged events for Effect.ts pattern
export class VoiceDetected extends Data.TaggedClass("VoiceDetected")<{
  readonly confidence: number
  readonly source: "silero" | "classifier" | "hybrid"
}> {}

export class VoiceStopped extends Data.TaggedClass("VoiceStopped")<object> {}

interface DetectorConfig {
  useSileroOnly: boolean
  useClassifierConfirmation: boolean
  sileroThreshold: number
  classifierThreshold: number
}

class AdvancedVoiceDetector {
  private sileroVAD: MicVAD | null = null
  private classifier: AudioClassifier | null = null
  private listeners = new Set<() => void>()
  private state = { isVoiceDetected: false, confidence: 0 }
  
  async initialize(config: DetectorConfig): Promise<void> {
    // Tier 2: Silero VAD (always enabled)
    this.sileroVAD = await MicVAD.new({
      positiveSpeechThreshold: config.sileroThreshold,
      negativeSpeechThreshold: config.sileroThreshold * 0.5,
      onSpeechStart: () => this.handleSileroSpeechStart(config),
      onSpeechEnd: () => this.handleSpeechEnd(),
    })
    
    // Tier 3: Optional classifier for extra accuracy
    if (config.useClassifierConfirmation) {
      const audio = await FilesetResolver.forAudioTasks(...)
      this.classifier = await AudioClassifier.createFromOptions(audio, {
        categoryAllowlist: ["Speech", "Singing", "Narration"],
        scoreThreshold: config.classifierThreshold,
      })
    }
  }
  
  private async handleSileroSpeechStart(config: DetectorConfig): Promise<void> {
    if (config.useSileroOnly || !this.classifier) {
      // Trust Silero alone
      this.setState({ isVoiceDetected: true, confidence: 0.8 })
      return
    }
    
    // Double-check with classifier
    const isConfirmed = await this.classifyCurrentAudio()
    if (isConfirmed) {
      this.setState({ isVoiceDetected: true, confidence: 0.95 })
    }
  }
  
  private handleSpeechEnd(): void {
    this.setState({ isVoiceDetected: false, confidence: 0 })
  }
  
  async start(): Promise<void> {
    await this.sileroVAD?.start()
  }
  
  stop(): void {
    this.sileroVAD?.pause()
  }
}
```

---

## Implementation Recommendations

### Phased Approach

| Phase | Solution | Effort | Accuracy | Bundle Size |
|-------|----------|--------|----------|-------------|
| **Phase 1** | Replace VAD with `@ricky0123/vad-web` | ~2 days | Good | +7MB |
| **Phase 2** | Add MediaPipe classifier as confirmation | ~1 week | Very Good | +8MB |
| **Phase 3** | Fine-tune thresholds for live music | Ongoing | Excellent | - |

### Why All Solutions Are Browser-Native

Given the privacy constraint (no server-side data storage), all proposed solutions run **entirely in the browser**:

- ✅ **Silero VAD**: ONNX model runs via WebAssembly
- ✅ **MediaPipe/YAMNet**: TFLite model runs via WebAssembly
- ✅ **No audio leaves the device**
- ✅ **Works offline** after initial model download

### Bundle Size Optimization

| Library | Size | Load Strategy |
|---------|------|---------------|
| `@ricky0123/vad-web` | ~2MB model | Lazy load after user grants mic permission |
| `onnxruntime-web` | ~5MB WASM | Dynamic import, use CDN |
| `@mediapipe/tasks-audio` | ~8MB | Optional, load only if classifier needed |

**Recommendation**: Use CDN for WASM files, lazy-load models on first use.

```typescript
// Lazy initialization example
let vadPromise: Promise<MicVAD> | null = null

export function getVAD(): Promise<MicVAD> {
  if (!vadPromise) {
    vadPromise = MicVAD.new({
      onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
      baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/",
      // ... config
    })
  }
  return vadPromise
}
```

---

## Integration with Existing Architecture

### Replacing VoiceActivityStore

The existing `VoiceActivityStore` can be modified to use Silero VAD internally while keeping the same external API:

```typescript
// VoiceActivityStore.ts - modified

import { MicVAD } from "@ricky0123/vad-web"

export class VoiceActivityStore {
  private sileroVAD: MicVAD | null = null
  
  // Keep existing state shape
  private state: VoiceState = {
    isListening: false,
    isSpeaking: false,
    level: 0,
    lastSpeakingAt: null,
    permissionDenied: false,
  }
  
  // Existing subscribe/getSnapshot pattern unchanged
  subscribe = (listener: () => void) => { ... }
  getSnapshot = () => this.state
  
  // Modified: use Silero VAD instead of energy-based
  async startListening(): Promise<void> {
    if (this.state.isListening) return
    
    this.sileroVAD = await MicVAD.new({
      positiveSpeechThreshold: 0.7,
      onSpeechStart: () => {
        this.setState({ isSpeaking: true, lastSpeakingAt: Date.now() })
        Effect.runPromise(soundSystem.playVoiceDetectedEffect)
      },
      onSpeechEnd: () => {
        this.setState({ isSpeaking: false })
      },
      onFrameProcessed: (probs) => {
        // Update level for UI visualization
        this.setState({ level: probs.isSpeech })
      },
    })
    
    await this.sileroVAD.start()
    this.setState({ isListening: true })
  }
  
  stopListening(): void {
    this.sileroVAD?.pause()
    this.sileroVAD = null
    this.setState({ isListening: false, isSpeaking: false, level: 0 })
  }
}
```

### Hooks Remain Unchanged

```typescript
// These hooks continue to work without modification
const { isSpeaking, level } = useVoiceActivity()
const voiceTrigger = useVoiceTrigger({ autoPlay: true })
```

---

## Testing Considerations

### Test Scenarios

1. **Silence** - No false positives
2. **Guitar strumming** - Should NOT trigger
3. **Drum hits** - Should NOT trigger  
4. **Crowd noise** - Should NOT trigger
5. **Speaking voice** - Should trigger
6. **Singing voice** - Should trigger
7. **Mixed (guitar + singing)** - Should trigger when voice starts

### Threshold Tuning

For live music environments, start with higher thresholds and tune down:

```typescript
const LIVE_MUSIC_CONFIG = {
  positiveSpeechThreshold: 0.8,  // High confidence required
  negativeSpeechThreshold: 0.4,  // Generous hysteresis
  minSpeechFrames: 4,            // Require sustained voice
  redemptionFrames: 10,          // Wait longer before "speech end"
}
```

---

## References

- [Silero VAD](https://github.com/snakers4/silero-vad) - Enterprise-grade VAD model
- [@ricky0123/vad-web](https://github.com/ricky0123/vad) - Browser VAD wrapper
- [MediaPipe Audio Classifier](https://ai.google.dev/edge/mediapipe/solutions/audio/audio_classifier/web_js) - YAMNet for browser
- [YAMNet](https://tfhub.dev/google/yamnet/1) - Audio event classification
- [AudioSet](https://research.google.com/audioset/) - 521 audio event classes

---

## Oracle Review & Recommendations

> Analysis by GPT-5 reasoning model

### Key Insight: Simplify the Architecture

**Don't ship the full three-tier system.** Use a **1.5-tier design** instead:

- **Tier A**: Silero VAD as the primary detector (always enabled)
- **Tier B**: Your existing energy VAD as a **fallback** for unsupported browsers and as a **UI level meter**
- **Tier C (deferred)**: Classifier only if production data proves you truly need it

### Critical UX Insight: Single Onset Detection

ScrollTunes doesn't need continuous speech detection—it needs **one robust onset**:

```typescript
// Add to state
hasTriggeredStart: boolean = false

// In VoiceStart handler:
if (!this.state.hasTriggeredStart) {
  this.setState({ hasTriggeredStart: true })
  lyricsPlayer.play()
}
// Ignore all further voice events for this song
```

This alone mitigates most "later guitar/drum" false positives—they don't matter once you've started.

### Recommended Threshold Strategy

**Optimize for precision over recall.** A 300ms delay is better than a guitar-triggered false start.

```typescript
const LIVE_MUSIC_CONFIG = {
  positiveSpeechThreshold: 0.80,  // High confidence required
  negativeSpeechThreshold: 0.40,  // Good hysteresis
  minSpeechFrames: 4,             // ~300-400ms sustained voice
  redemptionFrames: 10,           // Don't drop 'speaking' too eagerly
}
```

**Environment presets** (expose as single "Sensitivity" slider):
- Quiet room: `0.6 / 0.3 / 2 frames`
- Normal: `0.75 / 0.35 / 3 frames`
- Bar/loud stage: `0.85 / 0.45 / 5 frames`

### Bundle Strategy

- **Start with ~7MB (Silero only)**, not ~15MB with classifier
- Lazy-load after mic permission succeeds
- Use CDN for WASM/ONNX assets
- Cache via service worker for repeat performers

```typescript
// Lazy initialization
let vadPromise: Promise<MicVAD> | null = null

export async function getVAD(): Promise<MicVAD> {
  if (!vadPromise) {
    vadPromise = MicVAD.new({
      onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
      baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/",
      positiveSpeechThreshold: 0.80,
      // ...
    })
  }
  return vadPromise
}
```

### Edge Cases to Handle

1. **Vocals from PA/speakers**: Phone picks up backing track vocals
   - Mitigation: Educate users to position phone closer to singer than speakers

2. **Talking before song**: Conversation/banter triggers early
   - Mitigation: Only arm VAD after user taps "Ready"; optional ignore window

3. **Very soft singing**: High thresholds miss quiet vocals
   - Mitigation: "High sensitivity" preset for quiet acoustic sets

4. **Noisy bars/percussive instruments**: Drum attacks trigger falsely
   - Mitigation: Temporal gating + high thresholds (N consecutive frames)

5. **First-time use with poor network**: Model can't load
   - Mitigation: Graceful fallback to energy VAD with clear messaging

### Guardrails

1. **Hard lock after first trigger**: Stop VAD once lyrics start (caps CPU, ignores later audio)

2. **Testing flow**: Guide new users through 10-sec "Test detection" screen
   - "Play your intro… now sing… did it start at the right time?"

3. **Timeout/manual override**: If no voice after 30-60s, show "Tap to start manually"

4. **Fallback indicator**: If Silero fails, show subtle "Detection quality: Basic" badge

### When to Consider Classifier (Tier C)

Only add YAMNet/MediaPipe if, after field use with Silero:
- >5-10% of first-song starts are mis-triggered
- Core use cases (acoustic guitar + vocal) still have frequent false positives
- User feedback confirms this is the main frustration

### Revised Implementation Plan

| Phase | What | Effort | Value |
|-------|------|--------|-------|
| **Phase 1** | Replace VAD with `@ricky0123/vad-web` behind existing API | 1-3 days | High |
| **Phase 2** | Add "Sensitivity" slider with 3 presets | 0.5-1 day | Medium |
| **Phase 3** | Add "Test detection" onboarding flow | 1-2 days | Medium |
| **Phase 4** | Collect field data, instrument false positive rate | Ongoing | Essential |
| **Phase 5** | Add classifier tier (only if data proves need) | 1-2 weeks | Maybe never needed |

### Conclusion

Silero VAD + aggressive thresholds + single-onset semantics + environment presets will likely get you 80-90% of the value for a fraction of the complexity. Ship that as MVP, collect real usage data, and only then decide if the classifier tier is warranted.
