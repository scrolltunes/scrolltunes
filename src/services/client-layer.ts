"use client"

import { Layer } from "effect"
import { AppConfigProviderLive } from "./config-provider"
import type { FetchService } from "./fetch"
import { FetchServiceLive } from "./fetch"
import type { PublicConfig } from "./public-config"
import { PublicConfigLive } from "./public-config"
import type { SoundSystemService } from "./sound-system"
import { SoundSystemLive } from "./sound-system"
import type { StorageService } from "./storage"
import { StorageServiceLive } from "./storage"

export type ClientLayerContext = FetchService | PublicConfig | SoundSystemService | StorageService

const ClientConfigLayer = PublicConfigLive.pipe(Layer.provide(AppConfigProviderLive))

export const ClientLayer = Layer.mergeAll(
  FetchServiceLive,
  ClientConfigLayer,
  SoundSystemLive,
  StorageServiceLive,
)
