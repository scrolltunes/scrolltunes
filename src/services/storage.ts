"use client"

import { Context, Data, Effect, Layer } from "effect"

export class StorageError extends Data.TaggedClass("StorageError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export class StorageService extends Context.Tag("StorageService")<
  StorageService,
  {
    readonly getItem: (key: string) => Effect.Effect<string | null, StorageError>
    readonly setItem: (key: string, value: string) => Effect.Effect<void, StorageError>
    readonly removeItem: (key: string) => Effect.Effect<void, StorageError>
    readonly keys: Effect.Effect<readonly string[], StorageError>
  }
>() {}

const getStorage = (): Storage => {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("localStorage not available")
  }
  return window.localStorage
}

export const StorageServiceLive = Layer.succeed(StorageService, {
  getItem: key =>
    Effect.try({
      try: () => getStorage().getItem(key),
      catch: cause => new StorageError({ message: "Failed to read localStorage", cause }),
    }),
  setItem: (key, value) =>
    Effect.try({
      try: () => {
        getStorage().setItem(key, value)
      },
      catch: cause => new StorageError({ message: "Failed to write localStorage", cause }),
    }),
  removeItem: key =>
    Effect.try({
      try: () => {
        getStorage().removeItem(key)
      },
      catch: cause => new StorageError({ message: "Failed to remove localStorage item", cause }),
    }),
  keys: Effect.try({
    try: () => {
      const storage = getStorage()
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key) keys.push(key)
      }
      return keys
    },
    catch: cause => new StorageError({ message: "Failed to read localStorage keys", cause }),
  }),
})
