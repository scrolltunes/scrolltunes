"use client"

import { Data } from "effect"
import { useSyncExternalStore } from "react"

// --- Types ---

/**
 * Line range for a single page
 */
export interface PageLineRange {
  readonly start: number
  readonly end: number
}

/**
 * Runtime state for Score Book pagination
 */
export interface ScoreBookState {
  readonly currentPage: number
  readonly totalPages: number
  readonly linesPerPage: number
  readonly pageLineRanges: readonly PageLineRange[]
  /** Navigation direction: 1 = forward, -1 = backward */
  readonly direction: 1 | -1
}

// --- Tagged Events ---

/**
 * Navigate to a specific page
 */
export class GoToPage extends Data.TaggedClass("GoToPage")<{
  readonly page: number
}> {}

/**
 * Navigate to the next page
 */
export class NextPage extends Data.TaggedClass("NextPage")<object> {}

/**
 * Navigate to the previous page
 */
export class PrevPage extends Data.TaggedClass("PrevPage")<object> {}

/**
 * Set pagination configuration when lyrics or viewport changes
 */
export class SetPagination extends Data.TaggedClass("SetPagination")<{
  readonly totalLines: number
  readonly linesPerPage: number
}> {}

export type ScoreBookEvent = GoToPage | NextPage | PrevPage | SetPagination

// --- Default State ---

const DEFAULT_STATE: ScoreBookState = {
  currentPage: 0,
  totalPages: 0,
  linesPerPage: 6,
  pageLineRanges: [],
  direction: 1,
}

// --- ScoreBookStore Class ---

/**
 * ScoreBookStore - Manages Score Book pagination state
 *
 * Uses useSyncExternalStore pattern for React integration.
 * This store manages runtime state only (no persistence).
 */
export class ScoreBookStore {
  private listeners = new Set<() => void>()
  private state: ScoreBookState = DEFAULT_STATE

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): ScoreBookState => this.state

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private setState(partial: Partial<ScoreBookState>): void {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  /**
   * Dispatch a ScoreBook event
   */
  dispatch(event: ScoreBookEvent): void {
    switch (event._tag) {
      case "GoToPage":
        this.goToPage(event.page)
        break
      case "NextPage":
        this.nextPage()
        break
      case "PrevPage":
        this.prevPage()
        break
      case "SetPagination":
        this.setPagination(event.totalLines, event.linesPerPage)
        break
    }
  }

  /**
   * Navigate to a specific page (0-indexed)
   */
  goToPage(page: number): void {
    const clampedPage = Math.max(0, Math.min(page, this.state.totalPages - 1))
    if (clampedPage !== this.state.currentPage && this.state.totalPages > 0) {
      const direction = clampedPage > this.state.currentPage ? 1 : -1
      this.setState({ currentPage: clampedPage, direction })
    }
  }

  /**
   * Navigate to the next page
   */
  nextPage(): void {
    if (this.state.currentPage < this.state.totalPages - 1) {
      this.setState({ currentPage: this.state.currentPage + 1, direction: 1 })
    }
  }

  /**
   * Navigate to the previous page
   */
  prevPage(): void {
    if (this.state.currentPage > 0) {
      this.setState({ currentPage: this.state.currentPage - 1, direction: -1 })
    }
  }

  /**
   * Set pagination configuration when lyrics or viewport changes
   */
  setPagination(totalLines: number, linesPerPage: number): void {
    const clampedLinesPerPage = Math.max(4, Math.min(linesPerPage, 10))
    const totalPages = Math.max(1, Math.ceil(totalLines / clampedLinesPerPage))

    // Build page line ranges
    const pageLineRanges: PageLineRange[] = []
    for (let i = 0; i < totalPages; i++) {
      const start = i * clampedLinesPerPage
      const end = Math.min(start + clampedLinesPerPage - 1, totalLines - 1)
      pageLineRanges.push({ start, end })
    }

    // Clamp current page to valid range
    const currentPage = Math.min(this.state.currentPage, totalPages - 1)

    this.setState({
      totalPages,
      linesPerPage: clampedLinesPerPage,
      pageLineRanges,
      currentPage: Math.max(0, currentPage),
    })
  }

  /**
   * Find which page contains a given line index
   */
  findPageForLine(lineIndex: number): number {
    if (this.state.linesPerPage === 0) return 0
    return Math.floor(lineIndex / this.state.linesPerPage)
  }

  /**
   * Reset pagination state
   */
  reset(): void {
    this.state = DEFAULT_STATE
    this.notify()
  }

  /**
   * Get the line range for the current page
   */
  getCurrentPageRange(): PageLineRange | undefined {
    return this.state.pageLineRanges[this.state.currentPage]
  }

  /**
   * Check if we're on the last line of the current page
   */
  isOnLastLineOfPage(lineIndex: number): boolean {
    const range = this.getCurrentPageRange()
    if (!range) return false
    return lineIndex === range.end
  }

  /**
   * Check if we're on the second-to-last line of the current page (for warning)
   */
  isOnSecondToLastLineOfPage(lineIndex: number): boolean {
    const range = this.getCurrentPageRange()
    if (!range) return false
    return lineIndex === range.end - 1 && range.end > range.start
  }
}

// --- Singleton Instance ---

export const scoreBookStore = new ScoreBookStore()

// --- React Hooks ---

/**
 * Subscribe to full ScoreBook state
 */
export function useScoreBookState(): ScoreBookState {
  return useSyncExternalStore(
    scoreBookStore.subscribe,
    scoreBookStore.getSnapshot,
    () => DEFAULT_STATE,
  )
}

/**
 * Get current page number (0-indexed)
 */
export function useCurrentPage(): number {
  const state = useScoreBookState()
  return state.currentPage
}

/**
 * Get total number of pages
 */
export function useTotalPages(): number {
  const state = useScoreBookState()
  return state.totalPages
}

/**
 * Get lines per page
 */
export function useLinesPerPage(): number {
  const state = useScoreBookState()
  return state.linesPerPage
}

/**
 * Get page line ranges
 */
export function usePageLineRanges(): readonly PageLineRange[] {
  const state = useScoreBookState()
  return state.pageLineRanges
}
