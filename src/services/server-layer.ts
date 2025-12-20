import { SongsterrServiceLive } from "@/lib/chords/songsterr-client"
import { SpeechClientServiceLive } from "@/lib/google-speech-client"
import { SpotifyServiceLive } from "@/lib/spotify-client"
import { SpeechUsageTrackerLive } from "@/lib/speech-usage-tracker"
import { Layer } from "effect"
import { BpmProvidersLive } from "@/services/bpm-providers"
import { ServerBaseLayer } from "./server-base-layer"

export const ServerLayer = Layer.mergeAll(
  ServerBaseLayer,
  SpotifyServiceLive.pipe(Layer.provide(ServerBaseLayer)),
  BpmProvidersLive.pipe(Layer.provide(ServerBaseLayer)),
  SongsterrServiceLive.pipe(Layer.provide(ServerBaseLayer)),
  SpeechClientServiceLive.pipe(Layer.provide(ServerBaseLayer)),
  SpeechUsageTrackerLive.pipe(Layer.provide(ServerBaseLayer)),
)
