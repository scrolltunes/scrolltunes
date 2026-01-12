import { accountStore } from "@/core"
import { Effect } from "effect"

/**
 * Client-side API utilities with built-in authentication guards.
 * All methods skip execution when user is not authenticated.
 */
export const userApi = {
  /**
   * Fire-and-forget POST request. Skips if not authenticated.
   * Errors are silently ignored (use for syncing, analytics, etc.)
   */
  post: (url: string, body: unknown): void => {
    if (!accountStore.isAuthenticated()) return
    Effect.runFork(
      Effect.tryPromise(() =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ).pipe(Effect.ignore),
    )
  },

  /**
   * Fire-and-forget PUT request. Skips if not authenticated.
   */
  put: (url: string, body: unknown): void => {
    if (!accountStore.isAuthenticated()) return
    Effect.runFork(
      Effect.tryPromise(() =>
        fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      ).pipe(Effect.ignore),
    )
  },

  /**
   * Fire-and-forget DELETE request. Skips if not authenticated.
   * Optionally accepts a body for DELETE requests that need it.
   */
  delete: (url: string, body?: unknown): void => {
    if (!accountStore.isAuthenticated()) return
    const options: RequestInit = { method: "DELETE" }
    if (body !== undefined) {
      options.headers = { "Content-Type": "application/json" }
      options.body = JSON.stringify(body)
    }
    Effect.runFork(Effect.tryPromise(() => fetch(url, options)).pipe(Effect.ignore))
  },

  /**
   * Authenticated GET request. Returns null if not authenticated or on error.
   */
  get: async <T>(url: string): Promise<T | null> => {
    if (!accountStore.isAuthenticated()) return null
    try {
      const response = await fetch(url)
      if (!response.ok) return null
      return (await response.json()) as T
    } catch {
      return null
    }
  },

  /**
   * Authenticated POST with response. Returns null if not authenticated or on error.
   */
  postWithResponse: async <T>(url: string, body: unknown): Promise<T | null> => {
    if (!accountStore.isAuthenticated()) return null
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) return null
      return (await response.json()) as T
    } catch {
      return null
    }
  },

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated: (): boolean => accountStore.isAuthenticated(),
}
