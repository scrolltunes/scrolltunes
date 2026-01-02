"use client"

import type { LyricLine } from "@/core"
import { motion } from "motion/react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { type LineRole, LyricLineStage } from "./LyricLineStage"
import { LyricsActionBar } from "./LyricsActionBar"

export interface LyricsViewportStageProps {
  readonly lines: readonly LyricLine[]
  readonly activeIndex: number
  readonly currentTime: number
  readonly isPlaying: boolean
  readonly onLineClick?: ((index: number) => void) | undefined
  readonly onCreateCard?: ((selectedIds: readonly string[]) => void) | undefined
  readonly fontSize?: number | undefined
}

const ANCHOR_PERCENT = 0.25

function getLineRole(index: number, activeIndex: number): LineRole | null {
  const offset = index - activeIndex
  if (offset === 0) return "current"
  if (offset === 1) return "next"
  if (offset >= -2 && offset <= 2) return "context"
  return null
}

export function LyricsViewportStage({
  lines,
  activeIndex,
  currentTime,
  isPlaying,
  onLineClick,
  onCreateCard,
  fontSize = 32,
}: LyricsViewportStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])

  const [viewportHeight, setViewportHeight] = useState(400)
  const [translateY, setTranslateY] = useState(0)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (container) {
      const height = container.clientHeight - 80
      setViewportHeight(Math.max(300, height))
    }
  }, [])

  const getLineTop = useCallback((index: number): number => {
    let top = 0
    for (let i = 0; i < index; i++) {
      const el = lineRefs.current[i]
      top += el?.offsetHeight ?? 60
    }
    return top
  }, [])

  useEffect(() => {
    const calculateTranslate = () => {
      const container = containerRef.current
      if (!container) return

      const containerHeight = container.clientHeight - 80
      const anchorY = containerHeight * ANCHOR_PERCENT

      const currentLine = lines[activeIndex]
      const nextLine = lines[activeIndex + 1]

      const currentTop = getLineTop(activeIndex)
      const nextTop = getLineTop(activeIndex + 1)

      if (!isPlaying || !currentLine || !nextLine) {
        setTranslateY(-currentTop + anchorY)
        return
      }

      const lineStart = currentLine.startTime
      const lineEnd = nextLine.startTime
      const lineDuration = lineEnd - lineStart

      if (lineDuration <= 0) {
        setTranslateY(-currentTop + anchorY)
        return
      }

      const progress = Math.max(0, Math.min(1, (currentTime - lineStart) / lineDuration))
      const interpolatedTop = currentTop + (nextTop - currentTop) * progress

      setTranslateY(-interpolatedTop + anchorY)
    }

    calculateTranslate()
  }, [activeIndex, currentTime, isPlaying, lines, fontSize, getLineTop])

  const handleSelectClick = useCallback(() => {
    setIsSelecting(true)
    setSelectedIds(new Set())
  }, [])

  const handleCancelClick = useCallback(() => {
    setIsSelecting(false)
    setSelectedIds(new Set())
  }, [])

  const handleCreateCardClick = useCallback(() => {
    if (selectedIds.size > 0) {
      onCreateCard?.([...selectedIds])
      setIsSelecting(false)
      setSelectedIds(new Set())
    }
  }, [selectedIds, onCreateCard])

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        const delta = e.key === "ArrowDown" ? 1 : -1
        const nextIndex = Math.max(0, Math.min(lines.length - 1, activeIndex + delta))
        if (nextIndex !== activeIndex) {
          onLineClick?.(nextIndex)
        }
      }
    },
    [activeIndex, lines.length, onLineClick],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener("keydown", handleKeyDown)
    return () => container.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: "var(--stage-text3)" }}>No lyrics available</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "var(--stage-bg)" }}
      tabIndex={0}
      role="region"
      aria-label="Lyrics display"
    >
      <div className="flex-1 flex flex-col items-center px-4 overflow-hidden">
        <div
          className="w-full max-w-4xl relative overflow-hidden"
          style={{ height: viewportHeight }}
        >
          <motion.div
            ref={contentRef}
            className="absolute inset-x-0"
            initial={false}
            animate={{ y: translateY }}
            transition={{ duration: 0 }}
          >
            {lines.map((line, index) => {
              const role = getLineRole(index, activeIndex)
              const isVisible = role !== null

              return (
                <div
                  key={line.id}
                  ref={el => {
                    lineRefs.current[index] = el
                  }}
                  style={{
                    opacity: isVisible ? 1 : 0,
                    pointerEvents: isVisible ? "auto" : "none",
                  }}
                  className="py-3 transition-opacity duration-200"
                >
                  <LyricLineStage
                    id={line.id}
                    text={line.text}
                    role={role ?? "context"}
                    fontSize={fontSize}
                    onClick={() => onLineClick?.(index)}
                    isSelecting={isSelecting}
                    isSelected={selectedIds.has(line.id)}
                    onSelect={() => handleToggleSelect(line.id)}
                  />
                </div>
              )
            })}
          </motion.div>
        </div>
      </div>

      <LyricsActionBar
        isSelecting={isSelecting}
        selectedCount={selectedIds.size}
        onSelectClick={handleSelectClick}
        onCreateCardClick={handleCreateCardClick}
        onCancelClick={handleCancelClick}
      />
    </div>
  )
}
