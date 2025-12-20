"use client"

import { soundSystem, type AudioError, type AudioNotInitialized } from "@/sounds"
import { Context, type Effect, Layer } from "effect"

export class SoundSystemService extends Context.Tag("SoundSystemService")<
  SoundSystemService,
  {
    readonly getMicrophoneAnalyser: Effect.Effect<AnalyserNode, AudioError>
    readonly stopMicrophone: Effect.Effect<void, never>
    readonly playVoiceDetected: Effect.Effect<void, AudioNotInitialized>
  }
>() {}

export const SoundSystemLive = Layer.succeed(SoundSystemService, {
  getMicrophoneAnalyser: soundSystem.getMicrophoneAnalyserEffect,
  stopMicrophone: soundSystem.stopMicrophoneEffect,
  playVoiceDetected: soundSystem.playVoiceDetectedEffect,
})
