# Score Book Display Mode

## Overview

Page-based lyrics display showing full pages that flip rather than scroll, optimized for live performance glanceability.

## Requirements

### Display Mode

- Score Book mode becomes the default display mode
- Current scrolling mode preserved as "Karaoke mode" in settings
- Mode persists in user preferences (localStorage + server sync)
- Quick toggle accessible from settings

### Page Layout

- Show 6-8 lines per page (dynamically calculated from viewport)
- Lines styled by position relative to current line:
  - Past (>2 lines): 30% opacity
  - Past (1-2 lines): 40% opacity
  - Current: 100% opacity, left border accent, font-weight 600
  - Next: 85% opacity, slight indent, font-weight 500
  - Upcoming: 50% opacity
- Page indicator showing "Page X of Y"
- Subtle progress bar showing position within current page

### Page Advancement

- Time-based only (no voice detection for page flips)
- Auto-advance when current line crosses page boundary
- Page flip warning banner appears on 2nd-to-last line
- Warning shows "Next page ready" with gentle pulse animation

### Manual Navigation

- Swipe left: next page
- Swipe right: previous page
- Tap flip warning banner or bottom 30% of screen to flip
- Touch threshold: 50px horizontal movement

### Animation

- Page flip uses spring animation (stiffness 280, damping 26)
- Crossfade fallback when `prefers-reduced-motion: reduce`
- 300ms transition duration

### Feature Toggles

- Chords: disabled by default, optional toggle
- Word-level highlighting: disabled by default, optional toggle
- Settings stored in preferences

## State Model

```typescript
// Preferences (persisted)
interface ScoreBookPreferences {
  readonly displayMode: "scorebook" | "karaoke"
  readonly scoreBookShowChords: boolean
  readonly scoreBookWordHighlight: boolean
}

// Runtime state (ScoreBookStore)
interface ScoreBookState {
  readonly currentPage: number
  readonly totalPages: number
  readonly linesPerPage: number
  readonly pageLineRanges: ReadonlyArray<{ start: number; end: number }>
}

// Tagged events
type ScoreBookEvent =
  | GoToPage
  | NextPage
  | PrevPage
  | SetPagination
```

## Files to Create

- `src/core/ScoreBookStore.ts` - Runtime pagination state
- `src/components/display/ScoreBookDisplay.tsx` - Main container
- `src/components/display/ScoreBookPage.tsx` - Single page rendering
- `src/components/display/PageIndicator.tsx` - Page number display
- `src/components/display/PageFlipWarning.tsx` - Flip warning banner
- `src/hooks/useSwipeGesture.ts` - Horizontal swipe detection
- `src/hooks/useDynamicPagination.ts` - Viewport-based line calculation

## Files to Modify

- `src/core/PreferencesStore.ts` - Add display mode preferences
- `src/core/index.ts` - Export new store
- `src/components/display/index.ts` - Export new components
- `src/animations.ts` - Add pageFlip spring preset
- `src/app/song/[artistSlug]/[trackSlugWithId]/SongPageClient.tsx` - Conditional rendering

## Acceptance Criteria

- [ ] Score Book mode displays as default for new users
- [ ] Pages contain dynamically calculated number of lines based on viewport
- [ ] Current line is visually prominent with accent border
- [ ] Page auto-advances when current line crosses boundary
- [ ] Page flip warning appears on second-to-last line
- [ ] Swipe gestures navigate between pages
- [ ] Animation respects reduced motion preference
- [ ] Display mode preference persists across sessions
- [ ] Karaoke mode remains fully functional
- [ ] Chords toggle enables/disables chord display
- [ ] Word highlight toggle enables/disables karaoke-style highlighting
