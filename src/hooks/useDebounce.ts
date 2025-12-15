"use client"

import { Effect, Fiber } from "effect"
import { useEffect, useRef, useState } from "react"

export interface UseDebounceOptions {
  readonly delayMs?: number
}

export interface UseDebounceResult<T> {
  readonly debouncedValue: T
  readonly isPending: boolean
}

const DEFAULT_DELAY_MS = 300

export function useDebounce<T>(value: T, options?: UseDebounceOptions): UseDebounceResult<T> {
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS

  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  const [isPending, setIsPending] = useState(false)
  const fiberRef = useRef<Fiber.RuntimeFiber<void, never> | null>(null)

  useEffect(() => {
    if (Object.is(value, debouncedValue) && !isPending) {
      return
    }

    setIsPending(true)

    if (fiberRef.current) {
      Effect.runFork(Fiber.interrupt(fiberRef.current))
      fiberRef.current = null
    }

    const debounceEffect = Effect.gen(function* (_) {
      yield* _(Effect.sleep(delayMs))
      setDebouncedValue(value)
      setIsPending(false)
    })

    fiberRef.current = Effect.runFork(debounceEffect)

    return () => {
      if (fiberRef.current) {
        Effect.runFork(Fiber.interrupt(fiberRef.current))
        fiberRef.current = null
      }
    }
  }, [value, delayMs, debouncedValue, isPending])

  useEffect(() => {
    return () => {
      if (fiberRef.current) {
        Effect.runFork(Fiber.interrupt(fiberRef.current))
        fiberRef.current = null
      }
    }
  }, [])

  return { debouncedValue, isPending }
}
