/**
 * VadEnergyDetector - Wraps existing SingingDetectionStore
 *
 * This is a thin adapter that exposes the existing Silero VAD + Energy
 * detection system through the ActivationDetector interface.
 */

import { singingDetectionStore } from "@/core/SingingDetectionService"
import { Effect } from "effect"
import {
  type ActivationDetector,
  type DetectorError,
  type DetectorEventCallback,
  type DetectorState,
  MicrophonePermissionError,
  ProbabilityEvent,
  StateEvent,
  TriggerEvent,
} from "./types"

export class VadEnergyDetector implements ActivationDetector {
  private state: DetectorState = "idle"
  private callbacks = new Set<DetectorEventCallback>()
  private unsubscribe: (() => void) | null = null

  start(): Effect.Effect<void, DetectorError> {
    return Effect.gen(this, function* () {
      if (this.state !== "idle") return

      // Subscribe to singing detection store events
      this.unsubscribe = singingDetectionStore.subscribe(() => {
        const snapshot = singingDetectionStore.getSnapshot()

        // Update state based on store state
        if (!snapshot.isListening) {
          this.updateState("idle")
        } else if (snapshot.isSpeaking) {
          this.updateState("triggered")
          this.emitTrigger()
        } else {
          this.updateState("listening")
        }

        // Emit probability events for UI feedback
        if (snapshot.isListening) {
          this.emit(
            new ProbabilityEvent({
              pSinging: snapshot.level,
            }),
          )
        }
      })

      // Start the underlying detection
      yield* Effect.tryPromise({
        try: () => singingDetectionStore.startListening(),
        catch: e =>
          new MicrophonePermissionError({
            message: e instanceof Error ? e.message : "Failed to start VAD detection",
          }),
      })

      this.updateState("listening")
    })
  }

  stop(): Effect.Effect<void> {
    return Effect.sync(() => {
      if (this.state === "idle") return

      singingDetectionStore.stopListening()

      if (this.unsubscribe) {
        this.unsubscribe()
        this.unsubscribe = null
      }

      this.updateState("idle")
    })
  }

  getState(): DetectorState {
    return this.state
  }

  onEvent(callback: DetectorEventCallback): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  dispose(): void {
    Effect.runSync(this.stop())
    this.callbacks.clear()
  }

  private updateState(newState: DetectorState): void {
    if (this.state !== newState) {
      this.state = newState
      this.emit(new StateEvent({ state: newState }))
    }
  }

  private emitTrigger(): void {
    this.emit(new TriggerEvent({}))
  }

  private emit(event: ProbabilityEvent | StateEvent | TriggerEvent): void {
    for (const callback of this.callbacks) {
      callback(event)
    }
  }
}
