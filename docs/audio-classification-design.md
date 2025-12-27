# Audio Classification Design: Instrument vs Vocal Discrimination

## Problem

Current detection stack (Silero VAD + energy gate + burst detection) still produces false positives in specific scenarios:
- **Harmonica/melodica**: Continuous pitched sounds that Silero misclassifies as speech
- **Whistling**: Human-produced but not singing
- **Backing vocals from speakers**: Phone picks up PA/monitor output
- **High-pitched guitar techniques**: Harmonics, slides in vocal frequency range

**Goal**: Add a classification layer that can explicitly identify "singing" vs "guitar" vs "harmonica" etc.

---

## Implemented Architecture: Classification Gate

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DETECTION PIPELINE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────────┐                                                  │
│   │ Tier 1: Energy   │ ──[silence]──→ Skip (save compute)               │
│   │ (current RMS)    │                                                  │
│   └────────┬─────────┘                                                  │
│            │ [above threshold]                                          │
│            ↓                                                            │
│   ┌──────────────────┐                                                  │
│   │ Tier 2: Silero   │ ──[not speech]──→ No detection                   │
│   │ VAD (0.75)       │                                                  │
│   └────────┬─────────┘                                                  │
│            │ [speech detected - smoothed > 0.75]                        │
│            ↓                                                            │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │ Tier 3: YAMNet Audio Classifier (MediaPipe)                      │  │
│   │                                                                  │  │
│   │  Input: 1s audio buffer at 16kHz (ring buffer in SoundSystem)    │  │
│   │  Output: Top classifications with confidence scores              │  │
│   │                                                                  │  │
│   │  ┌─────────────────────────────────────────────────────────────┐ │  │
│   │  │ Decision Logic:                                             │ │  │
│   │  │                                                             │ │  │
│   │  │ ALLOW (singing confirmed):                                  │ │  │
│   │  │   - "Singing" >= 0.3                                        │ │  │
│   │  │   - "Music" > 0.3 AND voice > 0.15                          │ │  │
│   │  │   - "Speech" >= 0.5                                         │ │  │
│   │  │                                                             │ │  │
│   │  │ REJECT (instrument, not voice):                             │ │  │
│   │  │   - High-priority: Harmonica/Whistle > 0.25 AND voice < 0.2 │ │  │
│   │  │   - Instrument >= 0.4 AND voice < 0.15                      │ │  │
│   │  │   - Music >= 0.4 AND voice < 0.1 (guitar strumming)         │ │  │
│   │  │                                                             │ │  │
│   │  │ DEFER (uncertain, trust Silero):                            │ │  │
│   │  │   - Low confidence in all classes                           │ │  │
│   │  └─────────────────────────────────────────────────────────────┘ │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│            │                                                            │
│            ↓                                                            │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │ Tier 4: Silero Override (for singing over guitar)                │  │
│   │                                                                  │  │
│   │  If classifier rejected BUT:                                     │  │
│   │    - Silero smoothed level >= 0.85                               │  │
│   │    - Consecutive high frames >= 2 (~200ms)                       │  │
│   │  Then: Clear rejection cache and re-classify                     │  │
│   └──────────────────────────────────────────────────────────────────┘  │
│                           ↓                                             │
│   ════════════════════════════════════════════════════════════════════  │
│                    TRIGGER LYRICS PLAYBACK                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### Audio Capture Path

The classifier needs raw audio samples, not just frequency data. A dedicated AudioContext is created in `SoundSystem.ts` to capture audio via `ScriptProcessorNode`:

```typescript
// Dedicated AudioContext for classifier (bypasses Tone.js wrapper issues)
private classifierAudioContext: AudioContext | null = null
private classifierMicSource: MediaStreamAudioSourceNode | null = null

// Ring buffer: 1 second at 16kHz = 16000 samples
private classifierBuffer: Float32Array = new Float32Array(16000)
```

**Why a separate AudioContext?**
- Tone.js wraps the AudioContext and hides `createScriptProcessor`
- Creating a fresh native AudioContext ensures access to ScriptProcessorNode
- Uses the same `micStream` as the main audio path

### Classifier Service (`AudioClassifierService.ts`)

Uses MediaPipe's YAMNet model for audio classification:

```typescript
// CDN paths for model assets
const MEDIAPIPE_WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio/wasm"
const YAMNET_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/latest/yamnet.tflite"
```

**Class Categories:**
- `SINGING_CLASSES`: Singing, Choir, Chant, Yodeling, Humming, A capella, Vocal music
- `SPEECH_CLASSES`: Speech, Male/Female/Child speech, Narration, Conversation
- `MUSIC_CLASSES`: Music, Musical instrument, Plucked string instrument
- `INSTRUMENT_REJECT_CLASSES`: Guitar, Harmonica, Whistle, Flute, Drums, etc.
- `HIGH_PRIORITY_REJECT`: Harmonica, Whistle (commonly confused with voice)

### Integration with SingingDetectionService

The classifier is called as a gate before releasing speech detection:

```typescript
// In onFrameProcessed callback
if (shouldRelease) {
  if (this.classifierEnabled && !this.verifySingingWithClassifier()) {
    vadLog("SILERO", "Deferred speech blocked by classifier (instrument detected)")
    return  // Don't release, keep retrying
  }
  // Release and trigger VoiceStart event
}
```

**Rejection Caching:**
- Rejections are cached for 500ms to avoid repeated classification
- Cache is cleared if Silero shows sustained high confidence (override)

### Performance

| Component | Size | Latency | CPU Impact |
|-----------|------|---------|------------|
| Energy RMS | 0 | <1ms | Negligible |
| Silero VAD | ~2MB | ~5ms/frame | Low |
| YAMNet Classifier | ~8MB | ~50-100ms | Medium |
| **Total** | ~10MB | ~60-110ms | Acceptable |

**Optimizations:**
- Lazy-load classifier on first use
- Warm-up classification during init (suppresses TensorFlow INFO message)
- Rejection caching to avoid repeated classification
- Silero override for faster recovery when singing starts

---

## Key Files

- `src/core/AudioClassifierService.ts` - YAMNet classifier wrapper
- `src/core/SingingDetectionService.ts` - Main detection orchestration
- `src/sounds/SoundSystem.ts` - Audio capture with ring buffer
- `src/lib/vad-log.ts` - Shared logging utilities

---

## Configuration

Feature flag in environment:
```
NEXT_PUBLIC_AUDIO_CLASSIFIER=true  # Enable/disable classifier gate
```

Silero VAD preset for guitar (`src/lib/silero-vad-config.ts`):
```typescript
export const SILERO_PRESET_GUITAR: SileroVADConfig = {
  positiveSpeechThreshold: 0.75,
  negativeSpeechThreshold: 0.45,
  minSpeechMs: 200,
  redemptionMs: 350,
}
```

---

## Testing

Manual testing scenarios:
1. **Guitar only** - Should NOT trigger (classifier rejects "Music without voice")
2. **Singing only** - Should trigger quickly (~200ms)
3. **Singing + guitar** - Should trigger (classifier allows "Speech" or override kicks in)
4. **Harmonica** - Should NOT trigger (high-priority reject)
5. **Silence** - Should NOT trigger (energy gate)

Debug logging via `vadLog()` writes to `/api/dev/vad-log` and `vad-debug.log`.
