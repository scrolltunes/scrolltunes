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
- [x] Completed

### Task 2: Create ScoreBookStore with pagination state
- **File**: `src/core/ScoreBookStore.ts` (new)
- **Description**: Runtime state management for page tracking and pagination
- **Details**:
  - Define tagged events: GoToPage, NextPage, PrevPage, SetPagination
  - Implement ScoreBookState interface with currentPage, totalPages, linesPerPage, pageLineRanges
  - Class-based store with useSyncExternalStore pattern
  - Methods: goToPage, nextPage, prevPage, setPagination, findPageForLine, reset
  - Export singleton instance and useScoreBookState hook
- [x] Completed

### Task 3: Add pageFlip animation preset
- **File**: `src/animations.ts` (modify)
- **Description**: Add spring preset and variants for page flip animation
- **Details**:
  - Add `pageFlip` to springs object (stiffness 280, damping 26, mass 0.9)
  - Add `pageFlipVariants` to variants object with enter/center/exit states
- [x] Completed

### Task 4: Export new store from core/index.ts
- **File**: `src/core/index.ts` (modify)
- **Description**: Export ScoreBookStore and hooks
- **Details**:
  - Export scoreBookStore singleton
  - Export useScoreBookState hook
  - Export ScoreBookState type and events
- [x] Completed (done as part of Task 2)

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
- [x] Completed

### Task 6: Create useSwipeGesture hook
- **File**: `src/hooks/useSwipeGesture.ts` (new)
- **Description**: Detect horizontal swipe gestures for page navigation
- **Details**:
  - Accept onSwipeLeft, onSwipeRight callbacks and threshold (default 50px)
  - Track touch start position
  - Calculate horizontal distance on touch end
  - Trigger callback if threshold exceeded
  - Return handlers object for attachment to element
- [x] Completed

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
- [x] Completed

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
- [x] Completed

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
- [x] Completed

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
- [x] Completed

### Task 11: Export components from display/index.ts
- **File**: `src/components/display/index.ts` (modify)
- **Description**: Export new Score Book components
- **Details**:
  - Export ScoreBookDisplay
  - Export ScoreBookPage
  - Export PageIndicator
  - Export PageFlipWarning
- [x] Completed

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
- [x] Completed

### Task 13: Add display mode toggle to Settings page
- **File**: `src/app/settings/page.tsx` (modify)
- **Description**: Add UI for switching display modes and toggling Score Book features
- **Details**:
  - Add Display Mode selector (Score Book / Karaoke)
  - Add Score Book section with chord and word highlight toggles
  - Follow existing settings UI patterns
  - Update preferences via preferencesStore methods
- [x] Completed

---

## Discovered Tasks

(Tasks discovered during implementation go here)

---

## Completed Tasks

### Task 1: Add display mode preferences to PreferencesStore
- Added `DisplayMode` type with "scorebook" | "karaoke" options
- Added 3 new preferences: displayMode, scoreBookShowChords, scoreBookWordHighlight
- Added getter/setter methods for each preference
- Default: scorebook mode enabled, chords and word highlight disabled

### Task 2: Create ScoreBookStore with pagination state
- Created `src/core/ScoreBookStore.ts` with class-based store pattern
- Defined tagged events: GoToPage, NextPage, PrevPage, SetPagination
- Implemented ScoreBookState interface with currentPage, totalPages, linesPerPage, pageLineRanges
- Added methods: goToPage, nextPage, prevPage, setPagination, findPageForLine, reset
- Added helper methods: getCurrentPageRange, isOnLastLineOfPage, isOnSecondToLastLineOfPage
- Exported singleton instance and hooks (useScoreBookState, useCurrentPage, useTotalPages, useLinesPerPage, usePageLineRanges)

### Task 4: Export new store from core/index.ts
- Completed as part of Task 2

### Task 3: Add pageFlip animation preset
- Added `pageFlip` spring preset to springs object (stiffness 280, damping 26, mass 0.9)
- Added `pageFlip` variants to variants object with enter/center/exit states for horizontal slide animation

### Task 5: Create useDynamicPagination hook
- Created `src/hooks/useDynamicPagination.ts` with ResizeObserver pattern
- Options: containerRef, fontSize, totalLines
- Calculates linesPerPage based on available height (minus 100px padding) and lineHeight (fontSize * 1.8)
- Clamps result between 4-10 lines
- Updates automatically on container resize
- Exported from `src/hooks/index.ts` with types

### Task 6: Create useSwipeGesture hook
- Created `src/hooks/useSwipeGesture.ts` with touch event handling
- Options: onSwipeLeft, onSwipeRight, threshold (default 50px), enabled
- Tracks touchStartX on touchstart, calculates deltaX on touchend
- Triggers onSwipeLeft/onSwipeRight callbacks if threshold exceeded
- Returns handlers object (onTouchStart, onTouchEnd) for element attachment
- Exported from `src/hooks/index.ts` with types

### Task 7: Create PageIndicator component
- Created `src/components/display/PageIndicator.tsx` with memo pattern
- Props: currentPage, totalPages, className
- Renders "Page X of Y" with text-muted color
- Positioned absolute top-right with subtle styling
- Includes ARIA label and aria-live="polite" for accessibility
- Exported from `src/components/display/index.ts`

### Task 8: Create PageFlipWarning component
- Created `src/components/display/PageFlipWarning.tsx` with memo pattern
- Props: visible, onTap
- AnimatePresence for enter/exit animations
- Pulse animation using timing.pulse for gentle opacity cycling
- Text: "Next page ready" with accent color styling
- Positioned absolute bottom center with semi-transparent background
- Backdrop blur and accent border for visibility
- ARIA label for accessibility
- Exported from `src/components/display/index.ts`

### Task 9: Create ScoreBookPage component
- Created `src/components/display/ScoreBookPage.tsx` with memo pattern
- Props: lines, currentLineIndex, pageStartIndex, fontSize, showChords, showWordHighlight, currentTime, isPlaying, onLineClick, lineChordData, isRTL, songDuration, allLines
- Position-based styling using LinePosition type (past-far, past-near, current, next, upcoming)
- Current line: border-l-[3px] with accent color
- Next line: ml-2 indent
- Reuses LyricLine component with appropriate props for opacity and styling
- Supports word-level highlighting when showWordHighlight enabled
- Supports chord display when showChords enabled
- Exported from `src/components/display/index.ts`

### Task 10: Create ScoreBookDisplay main component
- Created `src/components/display/ScoreBookDisplay.tsx` as main orchestrating component
- Subscribes to LyricsPlayer for currentLineIndex via useCurrentLineIndex hook
- Subscribes to ScoreBookStore for pagination state via useScoreBookState hook
- Uses useDynamicPagination hook to calculate lines per page based on container size
- Uses useSwipeGesture hook for manual page navigation (swipe left/right)
- Auto-advances page when current line crosses page boundary via useEffect
- Uses AnimatePresence with pageFlip variants for animated page transitions
- Includes PageIndicator (top-right), ScoreBookPage (main content), PageFlipWarning (bottom)
- Handles reduced motion preference with crossfade fallback animation
- Supports chord display and word-level highlighting via preferences
- Builds chord data map with transposition support (same pattern as LyricsDisplay)
- Exported from `src/components/display/index.ts`

### Task 11: Export components from display/index.ts
- Added ScoreBookDisplay export to `src/components/display/index.ts`
- All Score Book components now exported: ScoreBookDisplay, ScoreBookPage, PageIndicator, PageFlipWarning

### Task 12: Integrate ScoreBookDisplay into SongPageClient
- Modified `src/app/song/[artistSlug]/[trackSlugWithId]/SongPageClient.tsx`
- Added ScoreBookDisplay import from `@/components/display`
- Added conditional rendering based on `preferences.displayMode`:
  - When `displayMode === "scorebook"`: renders `ScoreBookDisplay`
  - When `displayMode === "karaoke"`: renders `LyricsDisplay`
- Edit mode behavior unchanged (still uses `EditModeProvider` with `EditableLyricsDisplay`)
- Both displays receive same props pattern (`className`, `chordEnhancement`)

### Task 13: Add display mode toggle to Settings page
- Modified `src/app/settings/page.tsx` to add Display Mode section
- Added imports: `DisplayMode` type, `Notebook`, `Scroll`, `HighlighterCircle` icons
- Added new handlers: `handleDisplayModeChange`, `handleToggleScoreBookChords`, `handleToggleScoreBookWordHighlight`
- Created Display Mode section with:
  - RadioOption for Score Book mode (Notebook icon)
  - RadioOption for Karaoke mode (Scroll icon)
  - Conditional Score Book options (animated with motion.div):
    - Toggle for "Show chords" (MusicNotes icon)
    - Toggle for "Word highlight" (HighlighterCircle icon)
- Added `DisplayMode` type export to `src/core/index.ts`

---

## Notes

- One task per loop iteration
- Search before implementing - don't duplicate existing code
- Validation command: `bun run check`
- Follow Effect.ts patterns for tagged events
- Use useSyncExternalStore for React integration
