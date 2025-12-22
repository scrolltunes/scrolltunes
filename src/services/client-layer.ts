"use client"

import { SpeechDetectionLive, type SpeechDetectionService } from "@/core/SpeechDetectionService"
import { SttStreamLive, type SttStreamService } from "@/lib/stt-stream-client"
import { Layer } from "effect"
import type { AnalyticsService } from "./analytics"
import { AnalyticsServiceLive } from "./analytics"
import { AppConfigProviderLive } from "./config-provider"
import type { FetchService } from "./fetch"
import { FetchServiceLive } from "./fetch"
import type { PublicConfig } from "./public-config"
import { PublicConfigLive } from "./public-config"
import type { SoundSystemService } from "./sound-system"
import { SoundSystemLive } from "./sound-system"
import type { StorageService } from "./storage"
import { StorageServiceLive } from "./storage"

export type ClientLayerContext =
  | AnalyticsService
  | FetchService
  | PublicConfig
  | SoundSystemService
  | StorageService
  | SttStreamService
  | SpeechDetectionService

const ClientConfigLayer = PublicConfigLive.pipe(Layer.provide(AppConfigProviderLive))

export const ClientLayer = Layer.mergeAll(
  AnalyticsServiceLive,
  FetchServiceLive,
  ClientConfigLayer,
  SoundSystemLive,
  StorageServiceLive,
  SttStreamLive,
  SpeechDetectionLive,
)
