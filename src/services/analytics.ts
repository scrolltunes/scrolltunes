"use client"

import { track as vercelTrack } from "@vercel/analytics"
import { Context, Effect, Layer } from "effect"

export interface AnalyticsServiceShape {
  readonly track: (
    event: string,
    properties?: Record<string, string | number | boolean | null>,
  ) => Effect.Effect<void>
  readonly isEnabled: () => boolean
}

export class AnalyticsService extends Context.Tag("AnalyticsService")<
  AnalyticsService,
  AnalyticsServiceShape
>() {}

export const AnalyticsServiceLive = Layer.succeed(AnalyticsService, {
  track: (event, properties) =>
    Effect.sync(() => {
      vercelTrack(event, properties)
    }),
  isEnabled: () => true,
})

export const AnalyticsServiceDisabled = Layer.succeed(AnalyticsService, {
  track: () => Effect.void,
  isEnabled: () => false,
})
