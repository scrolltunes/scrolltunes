# Score Book Lyrics Display - Implementation Plan

## Overview

Replace the default scrolling lyrics display with a page-based "Score Book" mode. Shows lyrics like a music score book - full pages that flip rather than scroll. Current scrolling mode preserved as "Karaoke mode".

## User Requirements

- **Time-based page advancement** (no VAD for page flips)
- **Dynamic pagination** (fit lines to viewport)
- **Score book as new default** (scroll mode → "Karaoke mode")
- **Minimal display** with optional toggles for chords/word highlighting

---

## UX Design

### Layout (Mobile Portrait)

```
┌────────────────────────────────────────┐
│ ← Song Title                      •••  │  ◄── Minimal header (tap to expand)
├────────────────────────────────────────┤
│                                        │
│  In the town where I was born         │  ◄── Past lines (opacity 0.3)
│                                        │
│  Lived a man who sailed to sea        │  ◄── Past line (opacity 0.4)
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ And he told us of his life        │ │  ◄── CURRENT LINE
│ │                                    │ │      - Full brightness
│ └────────────────────────────────────┘ │      - Subtle left border accent
│                                        │
│  In the land of submarines            │  ◄── NEXT LINE (85% brightness)
│                                        │
│  So we sailed up to the sun          │  ◄── Upcoming (opacity 0.5)
│                                        │
│  Till we found the sea of green      │  ◄── Upcoming (opacity 0.5)
│                                        │
│══════════════════════════════════════│  ◄── Progress bar (subtle)
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░│
│                                        │
│     ◄ PAGE 2 of 5 ►                   │  ◄── Page indicator + swipe zones
└────────────────────────────────────────┘
```

### Page Flip Warning State

When on the 2nd-to-last line, show a subtle banner:
```
┌──────────────────────────────────┐
│    ► NEXT PAGE READY            │  ◄── Gentle pulse animation
│      tap or continue singing     │      60% opacity background
└──────────────────────────────────┘
```

### Line Styling

| State | Opacity | Extra Styling |
|-------|---------|---------------|
| Past (>2 lines ago) | 0.3 | - |
| Past (1-2 lines) | 0.4 | - |
| **Current** | 1.0 | `border-l-3 border-accent`, font-weight 600 |
| Next | 0.85 | `ml-2` indent, font-weight 500 |
| Upcoming | 0.5 | - |

### Interactions

1. **Auto page advancement**: Page flips when current line crosses page boundary (time-based)
2. **Manual swipe**: Swipe left/right to navigate pages
3. **Tap to flip**: Tap flip warning banner or bottom 30% of screen
4. **Reduced motion**: Crossfade instead of 3D flip animation

---

## New Files to Create

| File | Purpose |
|------|---------|
| `src/core/ScoreBookStore.ts` | Runtime pagination state (current page, total pages, line ranges) |
| `src/components/display/ScoreBookDisplay.tsx` | Main container: subscribes to LyricsPlayer, handles page transitions |
| `src/components/display/ScoreBookPage.tsx` | Renders a single page of lines with styling |
| `src/components/display/PageIndicator.tsx` | "Page 2 of 5" indicator with swipe zones |
| `src/components/display/PageFlipWarning.tsx` | Banner when approaching page end |
| `src/hooks/useSwipeGesture.ts` | Horizontal swipe detection for manual navigation |
| `src/hooks/useDynamicPagination.ts` | Calculate lines per page from viewport/font size |

## Files to Modify

| File | Changes |
|------|---------|
| `src/core/PreferencesStore.ts` | Add `displayMode`, `scoreBookShowChords`, `scoreBookWordHighlight` |
| `src/core/index.ts` | Export new store and hooks |
| `src/components/display/index.ts` | Export new components |
| `src/app/song/[artistSlug]/[trackSlugWithId]/SongPageClient.tsx` | Conditional render: ScoreBookDisplay vs LyricsDisplay |
| `src/animations.ts` | Add `pageFlip` spring preset |

---

## State Management

### New Preferences (PreferencesStore.ts)

```typescript
export type DisplayMode = "scorebook" | "karaoke"

// Add to Preferences interface:
readonly displayMode: DisplayMode           // Default: "scorebook"
readonly scoreBookShowChords: boolean       // Default: false
readonly scoreBookWordHighlight: boolean    // Default: false
```

### New Store: ScoreBookStore.ts

```typescript
import { Data } from "effect"
import { useSyncExternalStore } from "react"

// Tagged events (Effect.ts pattern)
export class GoToPage extends Data.TaggedClass("GoToPage")<{ readonly page: number }> {}
export class NextPage extends Data.TaggedClass("NextPage")<object> {}
export class PrevPage extends Data.TaggedClass("PrevPage")<object> {}
export class SetPagination extends Data.TaggedClass("SetPagination")<{
  readonly totalLines: number
  readonly linesPerPage: number
}> {}

export type ScoreBookEvent = GoToPage | NextPage | PrevPage | SetPagination

export interface ScoreBookState {
  readonly currentPage: number
  readonly totalPages: number
  readonly linesPerPage: number
  readonly pageLineRanges: ReadonlyArray<{ start: number; end: number }>
}

const DEFAULT_STATE: ScoreBookState = {
  currentPage: 0,
  totalPages: 1,
  linesPerPage: 6,
  pageLineRanges: [{ start: 0, end: 5 }],
}

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

  goToPage(page: number): void {
    const clamped = Math.max(0, Math.min(page, this.state.totalPages - 1))
    this.setState({ currentPage: clamped })
  }

  nextPage(): void {
    this.goToPage(this.state.currentPage + 1)
  }

  prevPage(): void {
    this.goToPage(this.state.currentPage - 1)
  }

  setPagination(totalLines: number, linesPerPage: number): void {
    const ranges: Array<{ start: number; end: number }> = []
    for (let i = 0; i < totalLines; i += linesPerPage) {
      ranges.push({
        start: i,
        end: Math.min(i + linesPerPage - 1, totalLines - 1),
      })
    }
    this.setState({
      linesPerPage,
      totalPages: ranges.length,
      pageLineRanges: ranges,
      currentPage: Math.min(this.state.currentPage, ranges.length - 1),
    })
  }

  findPageForLine(lineIndex: number): number {
    for (let i = 0; i < this.state.pageLineRanges.length; i++) {
      const range = this.state.pageLineRanges[i]
      if (range && lineIndex >= range.start && lineIndex <= range.end) {
        return i
      }
    }
    return 0
  }

  reset(): void {
    this.state = DEFAULT_STATE
    this.notify()
  }
}

export const scoreBookStore = new ScoreBookStore()

export function useScoreBookState(): ScoreBookState {
  return useSyncExternalStore(
    scoreBookStore.subscribe,
    scoreBookStore.getSnapshot,
    () => DEFAULT_STATE,
  )
}
```

---

## Animation Presets (animations.ts)

```typescript
// Add to springs object:
pageFlip: {
  type: "spring" as const,
  stiffness: 280,
  damping: 26,
  mass: 0.9,
}

// Add to variants object:
pageFlip: {
  enter: (direction: 1 | -1) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: 1 | -1) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
}
```

---

## Component Architecture

### Component Hierarchy

```
ScoreBookDisplay
├── PageIndicator (top-right, "Page 2 of 5")
├── AnimatePresence
│   └── ScoreBookPage (current page content)
│       ├── LyricLine[] (6-8 lines, styled for score book)
│       └── PageFlipWarning (when on 2nd-to-last line)
├── ProgressBar (bottom, shows position in page)
└── SwipeZones (invisible left/right touch areas)
```

### Key Logic: Auto Page Advancement

```typescript
// In ScoreBookDisplay.tsx
const playerState = usePlayerState()
const currentLineIndex = useCurrentLineIndex()
const { currentPage, pageLineRanges } = useScoreBookState()

// Auto-advance page when line crosses boundary
useEffect(() => {
  if (playerState._tag === "Playing") {
    const targetPage = scoreBookStore.findPageForLine(currentLineIndex)
    if (targetPage !== currentPage) {
      scoreBookStore.goToPage(targetPage)
    }
  }
}, [currentLineIndex, playerState._tag, currentPage])
```

### Dynamic Pagination Hook

```typescript
// useDynamicPagination.ts
export function useDynamicPagination(
  containerRef: RefObject<HTMLElement>,
  fontSize: number,
  totalLines: number,
): { linesPerPage: number } {
  const [linesPerPage, setLinesPerPage] = useState(6)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const viewportHeight = container.clientHeight
    const lineHeight = fontSize * 1.8
    const padding = 100
    const availableHeight = viewportHeight - padding

    const calculated = Math.floor(availableHeight / lineHeight)
    const clamped = Math.max(4, Math.min(10, calculated))

    setLinesPerPage(clamped)
  }, [containerRef, fontSize])

  return { linesPerPage }
}
```

### Swipe Gesture Hook

```typescript
// useSwipeGesture.ts
export function useSwipeGesture(options: {
  onSwipeLeft: () => void
  onSwipeRight: () => void
  threshold?: number
}) {
  const { onSwipeLeft, onSwipeRight, threshold = 50 } = options
  const startX = useRef(0)

  const handlers = {
    onTouchStart: (e: React.TouchEvent) => {
      startX.current = e.touches[0]?.clientX ?? 0
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const endX = e.changedTouches[0]?.clientX ?? 0
      const diff = endX - startX.current

      if (Math.abs(diff) > threshold) {
        if (diff > 0) onSwipeRight()
        else onSwipeLeft()
      }
    },
  }

  return { handlers }
}
```

---

## Integration: SongPageClient.tsx

```typescript
// In SongPageClient.tsx
const { displayMode } = usePreferences()

// In render:
{displayMode === "scorebook" ? (
  <ScoreBookDisplay
    className="flex-1 pb-12"
    chordEnhancement={loadState._tag === "Loaded" ? enhancements.chordEnhancement : null}
  />
) : (
  <LyricsDisplay
    className="flex-1 pb-12"
    chordEnhancement={loadState._tag === "Loaded" ? enhancements.chordEnhancement : null}
    onCreateCard={handleCreateCard}
  />
)}
```

---

## Implementation Order

### Phase 1: Foundation
1. Add preferences to `PreferencesStore.ts`
2. Create `ScoreBookStore.ts`
3. Add animation presets to `animations.ts`

### Phase 2: Hooks
4. Create `useDynamicPagination.ts`
5. Create `useSwipeGesture.ts`

### Phase 3: Components
6. Create `PageIndicator.tsx`
7. Create `PageFlipWarning.tsx`
8. Create `ScoreBookPage.tsx`
9. Create `ScoreBookDisplay.tsx`

### Phase 4: Integration
10. Update exports in `src/core/index.ts` and `src/components/display/index.ts`
11. Modify `SongPageClient.tsx` for conditional rendering
12. Add Settings UI toggle for display mode

### Phase 5: Polish
13. Test mobile (primary use case)
14. Test reduced motion
15. Test RTL languages

---

## Verification

### Commands
```bash
bun run typecheck   # Verify types
bun run lint        # Code style
bun run test        # Unit tests
bun run dev         # Manual testing
```

### Manual Testing Checklist
- [ ] Page advances when current line crosses boundary
- [ ] Swipe left/right navigates pages manually
- [ ] Page flip warning appears on 2nd-to-last line
- [ ] Animation respects reduced motion preference
- [ ] Dynamic pagination adjusts to font size
- [ ] RTL languages work correctly
- [ ] Chords toggle enables inline chords
- [ ] Word highlight toggle enables karaoke-style highlighting
- [ ] Mode persists across navigation
- [ ] Karaoke mode still works (regression test)

---

## Critical Files Reference

- `src/core/LyricsPlayer.ts` - State machine pattern to follow
- `src/components/display/LyricsDisplay.tsx` - Component structure to mirror
- `src/components/display/LyricLine.tsx` - Reuse for line rendering
- `src/core/PreferencesStore.ts` - Add new preferences
- `src/app/song/[artistSlug]/[trackSlugWithId]/SongPageClient.tsx` - Integration point
