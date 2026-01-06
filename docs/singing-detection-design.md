# PROMPT.md — Add Singing Detector Activation Mode (Alternative to VAD + Energy)

## Mission
Implement an **alternative activation method** for lyric scrolling:

- Existing (keep unchanged): **VAD + Energy** activation.
- New (add): **Singing Detector** activation.
- Users can **toggle and configure** which activation method is used via the **Settings** page.

This must work **client-side in the browser on mobile** (Next.js app on Vercel). Do not send audio to the server. Do not record/store audio. Match existing privacy posture (local-only processing).

Repository context (verify exact paths/exports before editing):
- Settings page exists under `app/settings/` and core stores include `src/core/VoiceActivityStore.ts` and `src/core/PreferencesStore.ts`.  
- Tooling: Biome lint, Vitest tests, TS strict mode.
- Existing deps already include: `@ricky0123/vad-web`, `@mediapipe/tasks-audio`, `onnxruntime-web`.

---

## Constraints (do not violate)
1. **Do not break or regress existing VAD + Energy mode.** It must remain the default behavior.
2. **Singing detector must be opt-in** via Settings (a new “Activation method” choice).
3. **All processing is on-device**. No microphone audio uploaded, logged, or stored.
4. **No UI jank**: inference should not block the main thread; use a Web Worker if needed.
5. **Code style**: match existing patterns (Effect-first store patterns, project conventions).
6. **No new paid services**. Prefer existing dependencies. Avoid adding heavy new deps unless absolutely necessary.

---

## Definition of Done (must be true)
- A Settings control exists that lets users choose:
  - `VAD + Energy (default)`
  - `Singing detection (experimental)`
- When set to **VAD + Energy**, behavior is exactly as before.
- When set to **Singing detection**:
  - Instrument-only intros and noisy-room non-vocal sound do **not** trigger scrolling (substantially fewer false positives than VAD+Energy).
  - Singing onset triggers scrolling with a tunable threshold and hold time.
- Unit tests exist for the core trigger/state machine logic.
- `bun run check` passes (lint + typecheck + tests).
- Update any docs or in-app help text related to voice activation if needed.

At the end, output exactly: `<promise>COMPLETE</promise>`

---

## Plan Overview (phases)

### Phase 1 — Understand current activation flow
1. Locate current activation logic:
   - Find where mic is enabled and where scrolling is started.
   - Find current VAD + energy code (likely in `VoiceActivityStore` + audio components).
2. Identify how settings are stored and read:
   - Inspect `PreferencesStore.ts` (and any settings schema/types).
3. Identify where the Settings UI is implemented (likely under `app/settings/`).

Deliverable: a short note listing key files and what to edit.

### Phase 2 — Add Settings schema + UI
Add new preference fields:
- `activationMode: "vad_energy" | "singing"`
- `singingDetector: { ...config... }`

Singing detector config (start with these defaults; make them adjustable):
- `provider: "mediapipe_yamnet"` (default; ONNX can be future)
- `startThreshold: 0.90`
- `stopThreshold: 0.60` (hysteresis)
- `holdMs: 400`
- `cooldownMs: 1500`
- `emaAlpha: 0.2`
- `hopMs: 200`
- `windowMs: 975` (approx one segment for YAMNet-style classifiers)
- `rejectSpeech: true`
- `speechMax: 0.6`
- `debug: false`

Settings UI:
- Add a radio group or segmented control:
  - “VAD + Energy (recommended)"
  - “Singing detection (experimental)"
- Add an “Advanced” accordion when singing mode is selected:
  - sliders/inputs for thresholds and timings
  - a toggle for “Treat speech as non-singing” (rejectSpeech)
  - a debug toggle (optional)

### Phase 3 — Implement a pluggable detector interface
Create a new module, e.g. `src/audio/activation/`.

Define a small interface so we can swap implementations cleanly:

```ts
export type ActivationMode = "vad_energy" | "singing";

export type DetectorState = "idle" | "listening" | "triggered";

export type DetectorEvent =
  | { type: "probability"; pSinging: number; pSpeech?: number }
  | { type: "state"; state: DetectorState }
  | { type: "trigger" }
  | { type: "error"; error: string };

export interface ActivationDetector {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(cb: (e: DetectorEvent) => void): () => void;
}
```

Wrap the existing system:
- Implement `VadEnergyDetector` that calls the existing VAD+Energy behavior.
- It must be thin glue, not a rewrite.

### Phase 4 — Singing detector implementation (v1: MediaPipe Tasks Audio)
Implement `MediaPipeSingingDetector` using `@mediapipe/tasks-audio`:
- Load a model (recommended: YAMNet tflite).
- Ship model under `public/models/` (e.g. `public/models/yamnet.tflite`).
- Run classification on a sliding window:
  - window ≈ `windowMs`
  - hop ≈ `hopMs`
- Convert classifier outputs into:
  - `pSinging` = max(probabilities for “singing”-like labels)
  - `pSpeech` = max(probabilities for “speech”-like labels), if available

Important: don’t hardcode label indices blindly.
- Implement a mapping by label name (string match against label list).
- Keep the singing/speech label lists configurable in code (easy to adjust).

Performance:
- Do inference off-main-thread if possible:
  - Preferred: a Web Worker owns the model and receives PCM or feature frames.
  - If MediaPipe requires main thread, throttle hop rate and keep work minimal.
- Do not run inference if mic is off.
- Stop and clean up all audio nodes on stop.

### Phase 5 — Trigger logic (core false-positive killer)
Implement a small state machine that takes `pSinging` over time and emits `trigger`.

Rules:
- EMA smoothing:
  - `pSmooth = (1 - emaAlpha) * pSmooth + emaAlpha * pNow`
- Trigger with hold:
  - Start counting “above threshold” time when `pSmooth >= startThreshold`
  - If it stays above for `holdMs`, emit `trigger` and enter `triggered`
- Hysteresis:
  - In triggered state, consider “still singing” while `pSmooth >= stopThreshold`
- Cooldown:
  - After emitting trigger, suppress retriggers for `cooldownMs`
- Speech rejection (if enabled):
  - If `pSpeech > speechMax`, do NOT accumulate hold time toward trigger

This trigger logic must be unit-tested (pure function or class with deterministic time).

### Phase 6 — Integrate with ScrollTunes player
Add an “ActivationController” that:
- Reads `activationMode` from Preferences
- Instantiates the correct detector:
  - `vad_energy` → existing behavior
  - `singing` → singing detector
- Wires `trigger` to the existing “start scrolling” action
- Exposes state for UI indicator (optional):
  - mic listening
  - singing confidence (debug only)

When activationMode changes in Settings:
- stop current detector
- start the newly selected detector (if mic is enabled)

### Phase 7 — UI feedback (minimal but useful)
- Keep existing mic indicator behavior.
- Add an optional subtle indicator in singing mode:
  - “Singing detected” when triggered
  - Debug: show `pSinging` number if debug enabled

### Phase 8 — Tests + verification
1. Unit tests (Vitest):
   - EMA smoothing math
   - Hold trigger logic
   - Hysteresis behavior
   - Cooldown behavior
   - Speech rejection behavior
2. Manual verification checklist (document in PR description or notes):
   - Instrument-only intro does not start scroll
   - Start singing triggers within ~0.2–0.6s depending on settings
   - Loud noise does not trigger
   - Speech does not trigger (if rejectSpeech enabled)
   - Switching modes in Settings works without refresh
3. Run:
   - `bun run lint`
   - `bun run typecheck`
   - `bun run test`
   - `bun run check`

---

## Implementation Notes / Guardrails
- Avoid breaking SSR: only import/initialize mic/audio code inside client components or dynamic imports.
- Ensure model assets (tflite) are actually served by Next (put under `public/`).
- Make all new settings backwards compatible with existing stored preferences:
  - Provide defaults if fields are missing.
- Keep the existing VAD+Energy code path as stable as possible:
  - Changes should be additive and behind the setting toggle.

---

## Deliverables (what to output each iteration)
Each iteration:
1. List what changed (files touched).
2. Confirm how to run checks/tests.
3. State current status against Definition of Done.
4. If stuck, describe blockers and next concrete step.

When everything is done and verified:
Output exactly: `<promise>COMPLETE</promise>`
