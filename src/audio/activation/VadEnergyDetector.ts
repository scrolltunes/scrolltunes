/**
 * VadEnergyDetector - Wraps existing SingingDetectionStore
 *
 * This is a thin adapter that exposes the existing Silero VAD + Energy
 * detection system through the ActivationDetector interface.
 */

import { singingDetectionStore } from "@/core/SingingDetectionService"
import type { ActivationDetector, DetectorEventCallback, DetectorState } from "./types"

export class VadEnergyDetector implements ActivationDetector {
  private state: DetectorState = "idle"
  private callbacks = new Set<DetectorEventCallback>()
  private unsubscribe: (() => void) | null = null

  async start(): Promise<void> {
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
        this.emit({
          type: "probability",
          pSinging: snapshot.level,
        })
      }
    })

    // Start the underlying detection
    await singingDetectionStore.startListening()
    this.updateState("listening")
  }

  async stop(): Promise<void> {
    if (this.state === "idle") return

    singingDetectionStore.stopListening()

    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }

    this.updateState("idle")
  }

  getState(): DetectorState {
    return this.state
  }

  onEvent(callback: DetectorEventCallback): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  dispose(): void {
    this.stop()
    this.callbacks.clear()
  }

  private updateState(newState: DetectorState): void {
    if (this.state !== newState) {
      this.state = newState
      this.emit({ type: "state", state: newState })
    }
  }

  private emitTrigger(): void {
    this.emit({ type: "trigger" })
  }

  private emit(event: Parameters<DetectorEventCallback>[0]): void {
    for (const callback of this.callbacks) {
      callback(event)
    }
  }
}
