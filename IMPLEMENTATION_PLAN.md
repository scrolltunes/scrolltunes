# Unified Share Experience - Implementation Plan

Generated from `specs/*.md` and `docs/ux-unified-share-experience.md`.
Tasks sorted by priority (P0 → P1 → P2).

## Status Legend
- [ ] Not started
- [x] Completed
- [~] In progress
- [!] Blocked

---

## Phase 1: Foundation (P0)

### Task 1: Create ShareExperienceStore with mode state
- **File**: `src/components/share/ShareExperienceStore.ts` (new)
- **Description**: Create the unified store class extending ShareDesignerStore patterns
- **Details**:
  - Add `mode: "compact" | "expanded"` to state
  - Add `step: "select" | "customize"` to state
  - Implement `setMode()` and `setStep()` methods
  - Ensure state persists across mode changes
  - Use `useSyncExternalStore` pattern per CLAUDE.md
- [x] Completed

### Task 2: Add quick preset state to store
- **File**: `src/components/share/ShareExperienceStore.ts` (modify)
- **Description**: Add activePreset field and preset application logic
- **Details**:
  - Add `activePreset: QuickPreset | null` to state
  - Create `applyPreset(preset: QuickPreset)` method
  - Clear activePreset when any setting is manually changed
- [x] Completed

### Task 3: Add pattern background state to store
- **File**: `src/components/share/ShareExperienceStore.ts` (modify)
- **Description**: Migrate pattern backgrounds from LyricsShareModal to store
- **Details**:
  - Add `pattern: PatternVariant` to state
  - Add `patternSeed: number` for waves pattern
  - Ensure pattern state integrates with existing background types
- [x] Completed

### Task 4: Add image edit state to store
- **File**: `src/components/share/ShareExperienceStore.ts` (modify)
- **Description**: Add pan/zoom state for album art manipulation
- **Details**:
  - Add `imageEdit: { offsetX, offsetY, scale }` to state
  - Add `isImageEditing: boolean` flag
  - Implement `setImageOffset()`, `setImageScale()`, `resetImageEdit()` methods
- [x] Completed

---

## Phase 2: Compact Mode UI (P0)

### Task 5: Create ShareExperience main component shell
- **File**: `src/components/share/ShareExperience.tsx` (new)
- **Description**: Create the main unified component that switches between modes
- **Details**:
  - Accept same props as LyricsShareModal
  - Initialize ShareExperienceStore
  - Render CompactView or ExpandedView based on mode
  - Handle modal open/close with state reset
- [x] Completed

### Task 6: Create CompactView layout
- **File**: `src/components/share/compact/CompactView.tsx` (new)
- **Description**: Build the compact mode layout with preview and controls
- **Details**:
  - Header with back button and close
  - Preview area (reuse ShareDesignerPreview)
  - Controls section below preview
  - Footer with "More options" and "Share Image" buttons
- [ ] Not started

### Task 7: Create QuickControls component
- **File**: `src/components/share/compact/QuickControls.tsx` (new)
- **Description**: Build pattern selector, effect controls, and toggles
- **Details**:
  - Pattern buttons: None, Dots, Grid, Waves, Album
  - Effect selector (reuse EffectSelector when Album)
  - Effect strength slider (reuse AlbumArtEffectControls)
  - Three toggles: Shadow, Spotify code, Branding
- [ ] Not started

### Task 8: Create GradientPalette component
- **File**: `src/components/share/compact/GradientPalette.tsx` (new)
- **Description**: Album-derived color palette for background selection
- **Details**:
  - Extract dominant colors from album art
  - Display as horizontal row of color swatches
  - Custom color picker option
  - Show only when not using Album pattern
- [ ] Not started

---

## Phase 3: Quick Presets (P0)

### Task 9: Create preset definitions
- **File**: `src/components/share/presets/index.ts` (new)
- **Description**: Define the four quick preset configurations
- **Details**:
  - Clean: light tint, no effect, soft shadow
  - Vibrant: saturated gradient, no effect, medium shadow
  - Dark: album art, darken 60%, strong shadow
  - Vintage: muted tint, desaturate 40%, soft shadow
- [ ] Not started

### Task 10: Create album color extraction utility
- **File**: `src/components/share/presets/albumColors.ts` (new)
- **Description**: Extract and transform colors from album art for presets
- **Details**:
  - Reuse existing `extractDominantColor` from `@/lib/colors`
  - Generate variations: light, saturated, muted, warm
  - Cache results per album art URL
- [ ] Not started

### Task 11: Create QuickStylePresets component
- **File**: `src/components/share/compact/QuickStylePresets.tsx` (new)
- **Description**: Four preset buttons with album-aware styling
- **Details**:
  - Horizontal row: Clean, Vibrant, Dark, Vintage
  - Show preview thumbnail or color swatch for each
  - Highlight active preset
  - Apply preset on click via store
- [ ] Not started

---

## Phase 4: Image Edit Mode (P1)

### Task 12: Create useShareGestures hook
- **File**: `src/components/share/hooks/useShareGestures.ts` (new)
- **Description**: Handle pan/zoom gestures for image editing
- **Details**:
  - Pointer events for drag (pan)
  - Touch events for pinch (zoom)
  - Wheel events for scroll zoom
  - Keyboard events for arrow keys and +/-
- [ ] Not started

### Task 13: Create ZoomSlider component
- **File**: `src/components/share/shared/ZoomSlider.tsx` (new)
- **Description**: Zoom control UI with slider and buttons
- **Details**:
  - Minus button, slider, plus button
  - Display current zoom level (e.g., "120%")
  - Reset button to restore defaults
- [ ] Not started

### Task 14: Integrate image edit into CompactView
- **File**: `src/components/share/compact/CompactView.tsx` (modify)
- **Description**: Add image edit toggle and controls to compact mode
- **Details**:
  - Show image edit button (🖼️) when Album pattern selected
  - Apply gesture handlers to preview when editing
  - Show zoom slider when editing
- [ ] Not started

---

## Phase 5: Expanded Mode UI (P1)

### Task 15: Create ExpandedView layout
- **File**: `src/components/share/expanded/ExpandedView.tsx` (new)
- **Description**: Build the expanded studio mode layout
- **Details**:
  - Full screen on mobile (100vh)
  - Side-by-side on desktop (preview left, controls right)
  - Header with back, title, share dropdown
  - Undo/redo buttons in preview area
- [ ] Not started

### Task 16: Create ControlTabs component
- **File**: `src/components/share/expanded/ControlTabs.tsx` (new)
- **Description**: Tab navigation for mobile expanded mode
- **Details**:
  - Tabs: Templates, Layout, Style, Elements, Effects
  - Templates selected by default
  - Horizontal scrollable on narrow screens
- [ ] Not started

### Task 17: Create TemplatesPanel
- **File**: `src/components/share/expanded/panels/TemplatesPanel.tsx` (new)
- **Description**: Template gallery panel for expanded mode
- **Details**:
  - Reuse existing TemplateGallery component
  - Wrap with panel styling
- [ ] Not started

### Task 18: Create remaining panels (Layout, Style, Elements, Effects)
- **File**: `src/components/share/expanded/panels/*.tsx` (new)
- **Description**: Create control panels for each tab
- **Details**:
  - Reuse existing control components from ShareDesigner
  - LayoutPanel: aspect ratio, padding
  - StylePanel: background, typography
  - ElementsPanel: visibility toggles
  - EffectsPanel: shadow, border, album effects
- [ ] Not started

---

## Phase 6: Transitions (P1)

### Task 19: Create transition animations
- **File**: `src/components/share/transitions.ts` (new)
- **Description**: Define animation constants and variants
- **Details**:
  - Expand animation: 300ms ease-out
  - Collapse animation: 250ms ease-in
  - Element fade/slide variants
  - Respect prefers-reduced-motion
- [ ] Not started

### Task 20: Implement mode transition in ShareExperience
- **File**: `src/components/share/ShareExperience.tsx` (modify)
- **Description**: Add animated transitions between compact and expanded
- **Details**:
  - Animate modal size change
  - Coordinate element animations (fade, slide)
  - Manage focus during transition
- [ ] Not started

---

## Phase 7: Migration & Cleanup (P2)

### Task 21: Replace LyricsShareModal usage
- **File**: Various files that import LyricsShareModal
- **Description**: Replace all usages with ShareExperience
- **Details**:
  - Find all imports of LyricsShareModal
  - Replace with ShareExperience
  - Update props as needed
- [ ] Not started

### Task 22: Remove /share route and ShareDesignerPage
- **File**: `src/app/share/page.tsx` (delete)
- **Description**: Remove the standalone share page
- **Details**:
  - Delete share page route
  - Update any links to /share
  - Remove ShareDesignerPage component
- [ ] Not started

### Task 23: Remove deprecated components
- **File**: Various (delete)
- **Description**: Clean up old components
- **Details**:
  - Delete LyricsShareModal.tsx
  - Delete ShareDesigner.tsx (modal version)
  - Delete ShareDesignerPage.tsx
  - Update exports in index files
- [ ] Not started

### Task 24: Update documentation
- **File**: `docs/ux-unified-share-experience.md` (modify)
- **Description**: Mark implementation as complete, document final architecture
- **Details**:
  - Update status to Implemented
  - Document any deviations from plan
  - Add developer notes
- [ ] Not started

---

## Discovered Tasks

(Tasks discovered during implementation go here)

---

## Completed Tasks

### Task 1: Create ShareExperienceStore with mode state
- Created `src/components/share/ShareExperienceStore.ts`
- Follows ShareDesignerStore patterns with Effect.ts tagged events
- Added `experienceMode: "compact" | "expanded"` and `experienceStep: "select" | "customize"`
- Implemented `setMode()` and `setStep()` convenience methods
- State persists across mode changes (mode/step are separate from history)
- Includes all React hooks following useSyncExternalStore pattern

### Task 2: Add quick preset state to store
- Added `QuickPreset` type: `"clean" | "vibrant" | "dark" | "vintage"`
- Added `activePreset: QuickPreset | null` field to store state
- Added `SetActivePreset` and `ApplyQuickPreset` tagged events
- Implemented `handleApplyQuickPreset()` with album-aware preset configs
- Implemented `getPresetConfig()` to generate background, effect, and shadow settings
- All manual edits (background, typography, elements, effects, albumArtEffect) clear activePreset
- Added convenience methods: `setActivePreset()`, `applyQuickPreset()`
- Added React hook: `useShareExperienceActivePreset()`

### Task 3: Add pattern background state to store
- Added `CompactPatternVariant` type: `"none" | "dots" | "grid" | "waves" | "albumArt"`
- Added `compactPattern: CompactPatternVariant` and `compactPatternSeed: number` to state
- Added `SetCompactPattern` and `RegenerateCompactPatternSeed` tagged events
- Setting compact pattern clears activePreset (custom styling)
- Pattern seed regenerates with `Date.now()` for waves pattern variation
- State resets to defaults (`"none"`, fresh seed) on store reset
- Added convenience methods: `setCompactPattern()`, `regenerateCompactPatternSeed()`
- Added getters: `getCompactPattern()`, `getCompactPatternSeed()`
- Added React hooks: `useShareExperienceCompactPattern()`, `useShareExperienceCompactPatternSeed()`

### Task 4: Add image edit state to store
- Image edit state already existed via `EditorState.imageEdit` from ShareDesignerStore patterns
- `SetImageOffset`, `SetImageScale`, `ResetImagePosition` tagged events at lines 184-193
- State handling with clamping: offsets -100 to 100, scale 1.0 to 3.0 (lines 547-575)
- Convenience methods: `setImageOffset()`, `setImageScale()`, `resetImagePosition()`
- `isImageEditing()` returns `this.editor.mode === "image"`
- React hook: `useShareExperienceImageEdit(store)`

### Task 5: Create ShareExperience main component shell
- Created `src/components/share/ShareExperience.tsx`
- Unified modal component that switches between compact and expanded modes
- Props match LyricsShareModal: `isOpen`, `onClose`, `title`, `artist`, `albumArt`, `albumArtLarge`, `spotifyId`, `lines`, `initialSelectedIds`
- Creates `ShareExperienceStore` when transitioning to customize step
- Preserves selection when navigating back from customize to select step
- Inline `LineSelection` component (will be extracted to shared/ in Task 6)
- Placeholder `CompactView` and `ExpandedView` components for Tasks 6 and 15
- Modal structure follows existing patterns (AnimatePresence, motion, springs.default)
- RTL support via text direction detection
- Escape key and backdrop click handlers for closing
- State reset on modal close (always reopens in compact/select mode per UX spec)

---

## Notes

- One task per loop iteration
- Search codebase before implementing - many pieces already exist
- Reuse existing components: ShareDesignerPreview, EffectSelector, TemplateGallery, etc.
- Follow project patterns: useSyncExternalStore, Effect.ts, tagged events
- Validation command: `bun run check`
