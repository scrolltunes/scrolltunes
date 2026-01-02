import { SongsterrServiceLive } from "@/lib/chords/songsterr-client"
import { SpeechClientServiceLive } from "@/lib/google-speech-client"
import { SpeechUsageTrackerLive } from "@/lib/speech-usage-tracker"
import { SpotifyServiceLive } from "@/lib/spotify-client"
import { AuthServiceLive } from "@/services/auth"
import { BpmProvidersLive } from "@/services/bpm-providers"
import { CatalogServiceLive } from "@/services/catalog"
import { DbLayer } from "@/services/db"
import { TursoServiceLive } from "@/services/turso"
import { Layer } from "effect"
import { ServerBaseLayer } from "./server-base-layer"

export const ServerLayer = Layer.mergeAll(
  ServerBaseLayer,
  DbLayer,
  AuthServiceLive,
  SpotifyServiceLive.pipe(Layer.provide(ServerBaseLayer)),
  BpmProvidersLive.pipe(Layer.provide(ServerBaseLayer)),
  SongsterrServiceLive.pipe(Layer.provide(ServerBaseLayer)),
  SpeechClientServiceLive.pipe(Layer.provide(ServerBaseLayer)),
  SpeechUsageTrackerLive.pipe(Layer.provide(ServerBaseLayer)),
  CatalogServiceLive.pipe(Layer.provide(DbLayer)),
  TursoServiceLive,
)
