# Score Book Display - Implementation Plan

Generated from specs. Tasks sorted by priority.

## Status Legend
- [ ] Not started
- [x] Completed
- [~] In progress
- [!] Blocked

---

## Phase 1: Foundation (P0)

### Task 1: Add display mode preferences to PreferencesStore
- **File**: `src/core/PreferencesStore.ts` (modify)
- **Description**: Add displayMode, scoreBookShowChords, scoreBookWordHighlight preferences
- **Details**:
  - Add `DisplayMode` type: `"scorebook" | "karaoke"`
  - Add three new preference fields with defaults (scorebook, false, false)
  - Add getter/setter methods following existing pattern
  - Update DEFAULT_PREFERENCES
- [ ] Not started

### Task 2: Create ScoreBookStore with pagination state
- **File**: `src/core/ScoreBookStore.ts` (new)
- **Description**: Runtime state management for page tracking and pagination
- **Details**:
  - Define tagged events: GoToPage, NextPage, PrevPage, SetPagination
  - Implement ScoreBookState interface with currentPage, totalPages, linesPerPage, pageLineRanges
  - Class-based store with useSyncExternalStore pattern
  - Methods: goToPage, nextPage, prevPage, setPagination, findPageForLine, reset
  - Export singleton instance and useScoreBookState hook
- [ ] Not started

### Task 3: Add pageFlip animation preset
- **File**: `src/animations.ts` (modify)
- **Description**: Add spring preset and variants for page flip animation
- **Details**:
  - Add `pageFlip` to springs object (stiffness 280, damping 26, mass 0.9)
  - Add `pageFlipVariants` to variants object with enter/center/exit states
- [ ] Not started

### Task 4: Export new store from core/index.ts
- **File**: `src/core/index.ts` (modify)
- **Description**: Export ScoreBookStore and hooks
- **Details**:
  - Export scoreBookStore singleton
  - Export useScoreBookState hook
  - Export ScoreBookState type and events
- [ ] Not started

---

## Phase 2: Hooks (P0)

### Task 5: Create useDynamicPagination hook
- **File**: `src/hooks/useDynamicPagination.ts` (new)
- **Description**: Calculate lines per page based on viewport and font size
- **Details**:
  - Accept containerRef, fontSize, totalLines parameters
  - Calculate available height minus padding (100px)
  - Use lineHeight = fontSize * 1.8
  - Clamp result between 4-10 lines
  - Return linesPerPage value
  - Update on resize using ResizeObserver
- [ ] Not started

### Task 6: Create useSwipeGesture hook
- **File**: `src/hooks/useSwipeGesture.ts` (new)
- **Description**: Detect horizontal swipe gestures for page navigation
- **Details**:
  - Accept onSwipeLeft, onSwipeRight callbacks and threshold (default 50px)
  - Track touch start position
  - Calculate horizontal distance on touch end
  - Trigger callback if threshold exceeded
  - Return handlers object for attachment to element
- [ ] Not started

---

## Phase 3: Components (P0)

### Task 7: Create PageIndicator component
- **File**: `src/components/display/PageIndicator.tsx` (new)
- **Description**: Display current page number and total pages
- **Details**:
  - Props: currentPage, totalPages, className
  - Render "Page X of Y" text
  - Position absolute top-right with subtle styling
  - Use text-muted color from theme
- [ ] Not started

### Task 8: Create PageFlipWarning component
- **File**: `src/components/display/PageFlipWarning.tsx` (new)
- **Description**: Banner warning when page flip is imminent
- **Details**:
  - Props: visible, onTap
  - AnimatePresence for enter/exit animations
  - Pulse animation using timing.pulse
  - Text: "Next page ready"
  - Position at bottom of lyrics area
  - Semi-transparent background
- [ ] Not started

### Task 9: Create ScoreBookPage component
- **File**: `src/components/display/ScoreBookPage.tsx` (new)
- **Description**: Render a single page of lyric lines with styling
- **Details**:
  - Props: lines, currentLineIndex, pageStartIndex, fontSize, showChords, showWordHighlight
  - Map lines with position-based styling (past/current/next/upcoming)
  - Current line: full opacity, border-l-3 border-accent, font-semibold
  - Next line: opacity-85, ml-2 indent
  - Past lines: opacity-30 to opacity-40
  - Upcoming lines: opacity-50
  - Reuse LyricLine component with appropriate props
- [ ] Not started

### Task 10: Create ScoreBookDisplay main component
- **File**: `src/components/display/ScoreBookDisplay.tsx` (new)
- **Description**: Main container orchestrating Score Book mode
- **Details**:
  - Subscribe to LyricsPlayer for currentLineIndex
  - Subscribe to ScoreBookStore for pagination state
  - Use useDynamicPagination to calculate lines per page
  - Use useSwipeGesture for manual navigation
  - Auto-advance page when line crosses boundary (useEffect)
  - AnimatePresence with pageFlipVariants for page transitions
  - Include PageIndicator, ScoreBookPage, PageFlipWarning
  - Handle reduced motion preference
- [ ] Not started

### Task 11: Export components from display/index.ts
- **File**: `src/components/display/index.ts` (modify)
- **Description**: Export new Score Book components
- **Details**:
  - Export ScoreBookDisplay
  - Export ScoreBookPage
  - Export PageIndicator
  - Export PageFlipWarning
- [ ] Not started

---

## Phase 4: Integration (P1)

### Task 12: Integrate ScoreBookDisplay into SongPageClient
- **File**: `src/app/song/[artistSlug]/[trackSlugWithId]/SongPageClient.tsx` (modify)
- **Description**: Conditionally render ScoreBookDisplay vs LyricsDisplay
- **Details**:
  - Get displayMode from usePreferences
  - Render ScoreBookDisplay when displayMode === "scorebook"
  - Render LyricsDisplay when displayMode === "karaoke"
  - Pass appropriate props (chordEnhancement, etc.)
  - Maintain edit mode behavior unchanged
- [ ] Not started

### Task 13: Add display mode toggle to Settings page
- **File**: `src/app/settings/page.tsx` (modify)
- **Description**: Add UI for switching display modes and toggling Score Book features
- **Details**:
  - Add Display Mode selector (Score Book / Karaoke)
  - Add Score Book section with chord and word highlight toggles
  - Follow existing settings UI patterns
  - Update preferences via preferencesStore methods
- [ ] Not started

---

## Discovered Tasks

(Tasks discovered during implementation go here)

---

## Completed Tasks

(Move completed tasks here with brief notes)

---

## Notes

- One task per loop iteration
- Search before implementing - don't duplicate existing code
- Validation command: `bun run check`
- Follow Effect.ts patterns for tagged events
- Use useSyncExternalStore for React integration
