"use client"

import { memo, useEffect, useRef } from "react"

interface StreamingTextProps {
  readonly text: string
  readonly className?: string
}

/**
 * Displays streaming text with a typewriter animation.
 * Uses direct DOM manipulation to bypass React's batching and ensure
 * rapid text updates are visible.
 */
export const StreamingText = memo(function StreamingText({
  text,
  className = "",
}: StreamingTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const displayedTextRef = useRef("")
  const animationRef = useRef<number | null>(null)
  const targetTextRef = useRef(text)

  useEffect(() => {
    targetTextRef.current = text

    const animate = () => {
      const target = targetTextRef.current
      const current = displayedTextRef.current

      if (current === target) {
        animationRef.current = null
        return
      }

      // Find common prefix
      let commonLength = 0
      const minLen = Math.min(current.length, target.length)
      for (let i = 0; i < minLen; i++) {
        if (current[i] === target[i]) {
          commonLength++
        } else {
          break
        }
      }

      let newText: string
      if (current.length > target.length && current.length > commonLength) {
        // Backspace
        newText = current.slice(0, -1)
      } else if (current.length < target.length) {
        // Add character
        newText = target.slice(0, current.length + 1)
      } else {
        // Replace from divergence
        newText = target.slice(0, commonLength + 1)
      }

      displayedTextRef.current = newText

      // Direct DOM update - bypasses React batching
      if (containerRef.current) {
        containerRef.current.textContent = `${newText}|`
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    // Start animation immediately
    if (animationRef.current === null) {
      animationRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [text])

  // Initial render with cursor
  return (
    <span ref={containerRef} className={className}>
      |
    </span>
  )
})
