"use client"

import { useCallback, useId, useState } from "react"

export interface UseScreenReaderAnnounceResult {
  /**
   * Announce a message to screen readers.
   * Uses a polite live region that won't interrupt current reading.
   */
  announce: (message: string) => void
  /**
   * The ARIA live region element to render in the component tree.
   * Must be rendered for announcements to work.
   */
  liveRegionProps: {
    id: string
    "aria-live": "polite"
    "aria-atomic": true
    role: "status"
    className: string
    children: string
  }
}

/**
 * Hook for making screen reader announcements.
 *
 * Returns an `announce` function and `liveRegionProps` that must be spread
 * onto a hidden element in the DOM. The element uses `sr-only` for visual hiding.
 *
 * @example
 * ```tsx
 * const { announce, liveRegionProps } = useScreenReaderAnnounce()
 *
 * const handleClick = () => {
 *   doSomething()
 *   announce("Action completed")
 * }
 *
 * return (
 *   <>
 *     <button onClick={handleClick}>Do something</button>
 *     <div {...liveRegionProps} />
 *   </>
 * )
 * ```
 */
export function useScreenReaderAnnounce(): UseScreenReaderAnnounceResult {
  const id = useId()
  const [message, setMessage] = useState("")

  const announce = useCallback((newMessage: string) => {
    // Clear first to ensure re-announcement of same message
    setMessage("")
    // Use requestAnimationFrame to ensure the clear is processed first
    requestAnimationFrame(() => {
      setMessage(newMessage)
    })
  }, [])

  return {
    announce,
    liveRegionProps: {
      id: `sr-announce-${id}`,
      "aria-live": "polite",
      "aria-atomic": true,
      role: "status",
      className: "sr-only",
      children: message,
    },
  }
}
