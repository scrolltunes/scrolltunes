/**
 * Activation Module
 *
 * Provides pluggable activation detectors for triggering lyric scrolling.
 */

export type {
  ActivationMode,
  DetectorState,
  DetectorEvent,
  DetectorEventCallback,
  ActivationDetectorConfig,
  ActivationDetector,
} from "./types"

export { VadEnergyDetector } from "./VadEnergyDetector"
export { MediaPipeSingingDetector } from "./MediaPipeSingingDetector"
export {
  createTriggerStateMachine,
  type TriggerStateMachine,
  type TriggerState,
  type TriggerInput,
  type TriggerOutput,
} from "./TriggerStateMachine"
export {
  ActivationController,
  activationController,
  useActivationState,
  useIsActivationListening,
  useIsSinging,
  useActivationLevel,
  useActivationControls,
  type ActivationState,
} from "./ActivationController"
