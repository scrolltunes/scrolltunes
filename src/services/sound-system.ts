"use client"

import { type AudioError, type AudioNotInitialized, soundSystem } from "@/sounds"
import { Context, type Effect, Layer } from "effect"

export class SoundSystemService extends Context.Tag("SoundSystemService")<
  SoundSystemService,
  {
    readonly getMicrophoneAnalyser: Effect.Effect<AnalyserNode, AudioError>
    readonly stopMicrophone: Effect.Effect<void, never>
    readonly playVoiceDetected: Effect.Effect<void, AudioNotInitialized>
    readonly initialize: Effect.Effect<void, AudioNotInitialized>
  }
>() {}

export const SoundSystemLive = Layer.succeed(SoundSystemService, {
  getMicrophoneAnalyser: soundSystem.getMicrophoneAnalyserEffect,
  stopMicrophone: soundSystem.stopMicrophoneEffect,
  playVoiceDetected: soundSystem.playVoiceDetectedEffect,
  initialize: soundSystem.initializeEffect,
})
