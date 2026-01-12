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

### Task D1: Fix lyrics-cache.test.ts TypeScript errors
- **File**: `src/lib/__tests__/lyrics-cache.test.ts` (modify)
- **Description**: Fix type errors for EnhancementPayload and ChordEnhancementPayloadV1 types
- **Details**:
  - Updated mock enhancement data from `{ words: [] }` to `{ version: 1, algoVersion: 1, lines: [] }` (EnhancementPayload type)
  - Updated mock chordEnhancement data from `{ version: 1, chords: [] }` to `{ patchFormatVersion: "chords-json-v1", algoVersion: "1.0", lines: [] }` (ChordEnhancementPayloadV1 type)
  - Updated test assertions to match new type shapes
- [x] Completed

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

### Task 14: Create StaticLyricLine component
- Created `src/components/display/StaticLyricLine.tsx` with memo pattern
- Props: `text`, `isActive`, `isPast`, `isNext`, `fontSize`, `onClick`, `index`, `chords`, `chordPositions`, `isRTL`, `innerRef`
- Active line styling: font-semibold + subtle accent background with AnimatePresence animation
- Next line: 85% opacity
- Past lines: 40% opacity
- Upcoming lines: 100% opacity with muted text color
- Reuses InlineChord for fallback chord display, ChordBadge for positioned chords
- Handles empty lines with musical note (♪) placeholder
- Full RTL text direction support
- ARIA attributes: `aria-current` for active, `aria-label` for line content
- Exported from `src/components/display/index.ts`

### Task 15: Update ScoreBookPage to use StaticLyricLine
- Modified `src/components/display/ScoreBookPage.tsx`
- Replaced LyricLine import with StaticLyricLine
- Removed word-timing related props from interface: `showWordHighlight`, `currentTime`, `isPlaying`, `songDuration`, `allLines`
- Simplified props interface to: `lines`, `currentLineIndex`, `pageStartIndex`, `fontSize`, `showChords`, `onLineClick`, `lineChordData`, `isRTL`
- Updated ScoreBookDisplay.tsx to remove unused `useCurrentTime` hook and `scoreBookWordHighlight` preference
- Props spread conditionally to handle `exactOptionalPropertyTypes`

### Task 16: Create PageThumbnail component
- Created `src/components/display/PageThumbnail.tsx` with memo pattern
- Props: `pageIndex`, `lines`, `isCurrentPage`, `currentLineIndex`, `pageStartIndex`, `onClick`
- Container: 150px width with 4:3 aspect ratio, rounded corners
- Content: Scaled-down text using CSS `transform: scale(0.25)` with overflow hidden
- Shows actual line text from the page
- Highlights current line within page (accent color, bold) when visible
- Current page: 2px accent border + subtle glow shadow
- Non-current pages: surface1 background, muted 1px border
- Hover state: scale 1.05 + brightness increase
- Page number badge in top-right corner
- ARIA: `aria-label="Go to page X"`, `aria-current="page"` when current
- Exported from `src/components/display/index.ts`

### Task 18: Create PageNavigationArrows component
- Created `src/components/display/PageNavigationArrows.tsx` with memo pattern
- Props: `onPrev`, `onNext`, `hasPrev`, `hasNext`, `className?`
- Desktop: 48px icons, transparent background with hover effect (bg-white/10)
- Mobile: 32px icons, semi-transparent overlay (bg-black/30, text-white/50)
- Disabled state: 30% opacity, pointer-events-none
- Uses `useReducedMotion()` to disable scale animations when preferred
- Provides haptic feedback via `useHaptic()` hook
- Hover: scale 1.1, Tap: scale 0.9
- ARIA: `aria-label="Previous page"` / `"Next page"`, `aria-disabled` when appropriate
- Exported from `src/components/display/index.ts`

### Task 20: Add Score Book specific font size preference
- Added constants to `src/core/PreferencesStore.ts`: SCOREBOOK_MIN_FONT_SIZE (14), SCOREBOOK_MAX_FONT_SIZE (32), SCOREBOOK_FONT_SIZE_STEP (2), SCOREBOOK_DEFAULT_FONT_SIZE (20)
- Added `scoreBookFontSize` to Preferences interface
- Added to DEFAULT_PREFERENCES with default value 20
- Added `getScoreBookFontSize()` getter method
- Added `setScoreBookFontSize(value: number)` setter with clamping
- Exported new constants from `src/core/index.ts`

### Task 17: Create PageSidebar component
- Created `src/components/display/PageSidebar.tsx` with memo pattern
- Props: `pages` (array of line arrays), `currentPage`, `currentLineIndex`, `onPageSelect`, `linesPerPage`
- Container: 180px fixed width, full height, `hidden lg:flex flex-col`
- Scrollable list with `overflow-y-auto`, smooth scroll behavior
- Renders PageThumbnail for each page with proper page start index calculation
- Auto-scrolls to keep current page thumbnail visible via useEffect + scrollIntoView
- Gap between thumbnails: 12px (gap-3 in Tailwind)
- Subtle header showing "Pages (X)" with total count
- Background: surface0 with muted border separator
- ARIA: `aria-label="Page navigation"` (role="navigation" removed as redundant on nav element)
- Exported from `src/components/display/index.ts`

### Task 21: Update Settings page for Score Book font
- Modified `src/app/settings/page.tsx`
- Added imports for SCOREBOOK_* constants from `@/core`
- Added `handleScoreBookFontSizeChange` handler
- Added `formatScoreBookFontSize` format function
- Added SliderSetting for Score Book font size in the conditional Score Book options section
- Removed "Word highlight" toggle (no longer applicable with StaticLyricLine)
- Removed unused `handleToggleScoreBookWordHighlight` handler
- Removed unused `HighlighterCircle` icon import
- Kept "Show chords" toggle unchanged

### Task 19: Restructure ScoreBookDisplay layout
- Modified `src/components/display/ScoreBookDisplay.tsx`
- New layout structure:
  - Desktop: `flex` container with `[PageSidebar 180px] | [Main Content flex-1] | [Nav Arrows overlaid]`
  - Mobile: `[Main Content 100%]` with `[Nav Arrows overlay on edges]`
- Removed PageFlipWarning import and related state (`showPageFlipWarning`, `isOnSecondToLastLineOfPage`)
- Integrated PageSidebar (desktop only, left side via `hidden lg:flex` in component)
- Integrated PageNavigationArrows (both desktop and mobile)
- Changed from `fontSize` to `scoreBookFontSize` preference
- Added `handlePrevPage`, `handleNextPage`, `handlePageSelect` callbacks
- Built `pages` array from `pageLineRanges` for PageSidebar
- Renamed `linesPerPage` from hook to `calculatedLinesPerPage` to avoid conflict with store state
- Added `hasPrev` and `hasNext` computed values for navigation arrows
- Added horizontal padding to animated page container (`px-4 lg:px-8`)

### Task 22: Add keyboard navigation for Score Book
- Modified `src/hooks/useKeyboardShortcuts.ts`
- Added `displayMode` parameter to `UseKeyboardShortcutsOptions` interface
- Imported `scoreBookStore` and `DisplayMode` type from `@/core`
- Modified ArrowLeft/ArrowRight handlers with mode-specific behavior:
  - In Score Book mode: calls `scoreBookStore.prevPage()` / `scoreBookStore.nextPage()`
  - In Karaoke mode: seeks backward/forward (existing behavior)
- Updated `SongPageClient.tsx` to pass `displayMode: preferences.displayMode` to hook
- Added `displayMode` to useEffect dependency array

---

## Gap Analysis (Phase 5)

**Analysis completed**: 2026-01-12

### Components Verified Missing
| Component | Status | Notes |
|-----------|--------|-------|
| StaticLyricLine.tsx | ✅ Done | Completed in Task 14 |
| PageThumbnail.tsx | ✅ Done | Completed in Task 16 |
| PageSidebar.tsx | ✅ Done | Completed in Task 17 |
| PageNavigationArrows.tsx | ✅ Done | Completed in Task 18 |

### Preferences Verified Missing
| Preference | Status | Notes |
|------------|--------|-------|
| scoreBookFontSize | ✅ Done | Completed in Task 20 |
| SCOREBOOK_MIN_FONT_SIZE | ✅ Done | Added in Task 20 |
| SCOREBOOK_MAX_FONT_SIZE | ✅ Done | Added in Task 20 |

### Current State Confirmed
| Item | Status | Location |
|------|--------|----------|
| scoreBookWordHighlight | ✅ Exists | PreferencesStore.ts:79 (will be removed in Task 23) |
| "Word highlight" toggle | ✅ Exists | settings/page.tsx:950 (will be removed in Task 21) |
| ScoreBookPage uses LyricLine | ✅ Confirmed | Will switch to StaticLyricLine in Task 15 |
| Arrow keys seek (not page flip) | ✅ Confirmed | useKeyboardShortcuts.ts has no mode-aware behavior |

### Implementation Notes
1. **Font size constants location**: Currently in `src/core/PreferencesStore.ts` (lines 8-11). Task 20 can add SCOREBOOK_* constants there rather than limits.ts.
2. **ScoreBookStore ready**: Already has `nextPage()` and `prevPage()` methods needed for keyboard navigation.
3. **PageFlipWarning.tsx exists**: Will be deprecated and removed in Task 23.

---

## Phase 5: Score Book Redesign (P0)

**Goal**: Transform Score Book from scrolling-based to true static page display (like a PDF viewer)

Key changes:
- Static text that doesn't move during playback
- Line-by-line highlighting (bold + subtle background)
- Desktop sidebar with mini text previews of pages
- Navigation arrows + swipe gestures for page transitions
- Auto-advance when current line crosses page boundary
- Much smaller default font size (20px vs 34px)

**Task Dependencies**:
```
Task 14 (StaticLyricLine)
    └── Task 15 (Update ScoreBookPage)
Task 16 (PageThumbnail)
    └── Task 17 (PageSidebar)
Task 18 (PageNavigationArrows)
Task 20 (scoreBookFontSize preference)
    └── Task 21 (Settings page)
Tasks 14-18, 20 ──► Task 19 (Restructure ScoreBookDisplay)
Tasks 14, 16-18 ──► Task 23 (Export & cleanup)
Task 22 (Keyboard nav) - independent, can be done anytime
```

### Task 14: Create StaticLyricLine component
- **File**: `src/components/display/StaticLyricLine.tsx` (new)
- **Description**: Simple line rendering without word-level animation
- **Details**:
  - Props: `text`, `isActive`, `isPast`, `isNext`, `fontSize`, `onClick`, `chords?`, `chordPositions?`
  - Active line styling: bold text (font-semibold) + subtle background (bg-accent/10) + left border accent
  - Next line: slight opacity reduction (85%) + ml-2 indent
  - Past lines: reduced opacity (30-40%)
  - Upcoming lines: 50% opacity
  - Support chord display above text (optional, reuse InlineChord/ChordBadge)
  - No `elapsedInLine`, `wordTimings`, `duration` props needed
  - Handle empty lines with musical note (♪) placeholder
  - Support RTL text direction
  - Include ARIA attributes for accessibility
- **Depends on**: None (leaf task)
- [x] Completed

### Task 15: Update ScoreBookPage to use StaticLyricLine
- **File**: `src/components/display/ScoreBookPage.tsx` (modify)
- **Description**: Replace LyricLine with StaticLyricLine, simplify props
- **Details**:
  - Replace LyricLine import with StaticLyricLine
  - Remove word-timing related props: `currentTime`, `isPlaying`, `songDuration`, `allLines`
  - Remove `showWordHighlight` prop (no longer applicable)
  - Keep position-based styling logic (getLinePosition function)
  - Simplify ScoreBookPageProps interface:
    - Keep: `lines`, `currentLineIndex`, `pageStartIndex`, `fontSize`, `showChords`, `onLineClick`, `lineChordData`, `isRTL`
    - Remove: `showWordHighlight`, `currentTime`, `isPlaying`, `songDuration`, `allLines`
  - Pass appropriate props to StaticLyricLine based on line position
- **Depends on**: Task 14
- [x] Completed

### Task 16: Create PageThumbnail component
- **File**: `src/components/display/PageThumbnail.tsx` (new)
- **Description**: Mini-rendered preview of a page's text for sidebar
- **Details**:
  - Props: `pageIndex`, `lines`, `isCurrentPage`, `currentLineIndex`, `onClick`
  - Container: ~150px width, 4:3 aspect ratio, rounded corners
  - Content: Scaled-down text (CSS transform: scale(0.25)) with overflow hidden
  - Show actual line text, highlight current line within page if visible
  - Current page styling: accent border (2px), subtle glow/shadow
  - Non-current pages: surface1 background, muted border
  - Hover state: slight scale up, brighter border
  - Click handler navigates to page
  - Page number badge in corner
  - ARIA: `role="button"`, `aria-label="Go to page X"`, `aria-current` when current
- **Depends on**: None (leaf task)
- [x] Completed

### Task 17: Create PageSidebar component
- **File**: `src/components/display/PageSidebar.tsx` (new)
- **Description**: Desktop-only sidebar showing page thumbnails
- **Details**:
  - Props: `pages` (array of line arrays), `currentPage`, `currentLineIndex`, `onPageSelect`
  - Container: 180px fixed width, full height, `hidden lg:flex flex-col`
  - Scrollable list with `overflow-y-auto`, smooth scroll behavior
  - Render PageThumbnail for each page
  - Auto-scroll to keep current page thumbnail visible (useEffect with scrollIntoView)
  - Gap between thumbnails: 12px
  - Subtle header showing "Pages" with total count
  - Background: surface0 or transparent
  - ARIA: `role="navigation"`, `aria-label="Page navigation"`
- **Depends on**: Task 16
- [x] Completed

### Task 18: Create PageNavigationArrows component
- **File**: `src/components/display/PageNavigationArrows.tsx` (new)
- **Description**: Left/right arrow buttons for page navigation
- **Details**:
  - Props: `onPrev`, `onNext`, `hasPrev`, `hasNext`, `className?`
  - Position: absolute left/right edges within parent container
  - Desktop: always visible, 48px icon size, subtle background on hover
  - Mobile: semi-transparent (opacity 50%), smaller (32px), overlay on edges
  - Icons: CaretLeft/CaretRight from `@phosphor-icons/react`
  - Disabled state: opacity 30%, pointer-events-none when !hasPrev/!hasNext
  - Hover: scale up slightly, background highlight
  - Active/tap: scale down, haptic feedback (useHaptic)
  - Respect reduced motion (disable scale animations)
  - ARIA: `aria-label="Previous page"` / `"Next page"`, `aria-disabled` when appropriate
- **Depends on**: None (leaf task)
- [x] Completed

### Task 19: Restructure ScoreBookDisplay layout
- **File**: `src/components/display/ScoreBookDisplay.tsx` (modify)
- **Description**: New layout with sidebar and navigation arrows
- **Details**:
  - New layout structure:
    - Desktop: `flex` container with `[PageSidebar 180px] | [Main Content flex-1] | [Nav Arrows overlaid]`
    - Mobile: `[Main Content 100%]` with `[Nav Arrows overlay on edges]`
  - Remove word-level timing subscriptions:
    - Remove currentTime tracking for word highlighting
    - Remove isPlaying-dependent word animation logic
  - Keep page auto-advance logic (when currentLineIndex crosses page boundary)
  - Keep swipe gesture support for mobile
  - Integrate PageSidebar (desktop only, left side)
  - Integrate PageNavigationArrows (both desktop and mobile)
  - Remove PageFlipWarning component and related state (`showPageFlipWarning`, `isOnSecondToLastLineOfPage`)
  - Remove `scoreBookWordHighlight` preference usage (no longer applicable)
  - Use `scoreBookFontSize` preference instead of shared `fontSize`
  - Update ScoreBookPage props to match simplified interface
  - Build pages array for PageSidebar from pageLineRanges
  - Ensure proper keyboard focus management
- **Depends on**: Tasks 14, 15, 16, 17, 18, 20
- [x] Completed

### Task 20: Add Score Book specific font size preference
- **File**: `src/core/PreferencesStore.ts` (modify)
- **Description**: Separate font size for Score Book mode
- **Details**:
  - Add `scoreBookFontSize` to Preferences interface
  - Default: 20 (much smaller than karaoke's 34px default)
  - Add constants in PreferencesStore.ts (next to existing MIN_FONT_SIZE, MAX_FONT_SIZE):
    - `SCOREBOOK_MIN_FONT_SIZE = 14`
    - `SCOREBOOK_MAX_FONT_SIZE = 32`
    - `SCOREBOOK_DEFAULT_FONT_SIZE = 20`
    - `SCOREBOOK_FONT_SIZE_STEP = 2`
  - Add `getScoreBookFontSize()` getter method
  - Add `setScoreBookFontSize(value: number)` setter with clamping
  - Add to DEFAULT_PREFERENCES
  - Ensure persistence to localStorage and server sync
- **Depends on**: None (leaf task)
- [x] Completed

### Task 21: Update Settings page for Score Book font
- **File**: `src/app/settings/page.tsx` (modify)
- **Description**: Add font size slider for Score Book mode
- **Details**:
  - Add font size slider in Score Book options section (conditional, in motion.div)
  - Props: `value={preferences.scoreBookFontSize}`, `onChange={handleScoreBookFontSizeChange}`
  - Import constants from PreferencesStore: `SCOREBOOK_MIN_FONT_SIZE`, `SCOREBOOK_MAX_FONT_SIZE`, `SCOREBOOK_FONT_SIZE_STEP`
  - Reuse existing SliderSetting component pattern
  - Format value: `${value}px` or `${value}px (default)` when 20
  - **Remove "Word highlight" toggle** at line 950 (no longer applicable with StaticLyricLine)
  - Keep "Show chords" toggle
  - Update imports to include new constants from `@/core`
- **Depends on**: Task 20
- [x] Completed

### Task 22: Add keyboard navigation for Score Book
- **File**: `src/hooks/useKeyboardShortcuts.ts` (modify)
- **Description**: Arrow key navigation for page flipping
- **Details**:
  - **Mode-specific behavior** for ArrowLeft/ArrowRight:
    - In **Score Book mode**: ArrowLeft → `scoreBookStore.prevPage()`, ArrowRight → `scoreBookStore.nextPage()`
    - In **Karaoke mode**: ArrowLeft/Right continue to seek (current behavior)
  - Add `displayMode` parameter to UseKeyboardShortcutsOptions
  - Import `scoreBookStore` and `preferencesStore` (or accept displayMode as option)
  - Modify existing ArrowLeft/ArrowRight handlers to check displayMode first
  - Alternative approach: add new PageUp/PageDown handlers that always work for Score Book
  - Keep other shortcuts unchanged (spacebar, r, up/down arrows for speed, 1-4 presets)
  - Consider adding `[` and `]` as alternative page navigation keys (non-conflicting)
- **Depends on**: None (independent, can be done anytime)
- [x] Completed

### Task 23: Export new components and cleanup
- **File**: `src/components/display/index.ts` (modify)
- **Description**: Export new components, deprecate unused
- **Details**:
  - Add exports for new components:
    - `export { StaticLyricLine } from "./StaticLyricLine"`
    - `export { PageThumbnail } from "./PageThumbnail"`
    - `export { PageSidebar } from "./PageSidebar"`
    - `export { PageNavigationArrows } from "./PageNavigationArrows"`
  - Remove PageFlipWarning export (deprecated, no longer used)
  - **Optional cleanup**: Delete `src/components/display/PageFlipWarning.tsx` file
  - Update PreferencesStore to remove `scoreBookWordHighlight` preference (or mark deprecated)
  - Remove `scoreBookWordHighlight` getter/setter methods
  - Update DEFAULT_PREFERENCES to remove `scoreBookWordHighlight`
  - Clean up any unused imports in affected files
- **Depends on**: Tasks 14, 16, 17, 18, 19
- [ ] Not started

---

## Recommended Execution Order

Phase 5 tasks can be parallelized using subagents. Recommended batches:

**Batch 1** (4 independent leaf tasks - run in parallel):
- Task 14: StaticLyricLine component
- Task 16: PageThumbnail component
- Task 18: PageNavigationArrows component
- Task 20: scoreBookFontSize preference

**Batch 2** (depends on Batch 1):
- Task 15: Update ScoreBookPage (depends on Task 14)
- Task 17: PageSidebar (depends on Task 16)
- Task 21: Settings page font slider (depends on Task 20)
- Task 22: Keyboard navigation (independent, can run anytime)

**Batch 3** (integration - depends on all above):
- Task 19: Restructure ScoreBookDisplay layout

**Batch 4** (cleanup - run last):
- Task 23: Export new components and cleanup

---

## Notes

- One task per loop iteration (or use subagents for parallel execution)
- Search before implementing - don't duplicate existing code
- Validation command: `bun run check`
- Follow Effect.ts patterns for tagged events
- Use useSyncExternalStore for React integration
- All new components should include ARIA attributes for accessibility
- Respect `prefers-reduced-motion` for animations
