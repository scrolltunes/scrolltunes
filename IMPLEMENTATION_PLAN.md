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
- [x] Completed

### Task 7: Create QuickControls component
- **File**: `src/components/share/compact/QuickControls.tsx` (new)
- **Description**: Build pattern selector, effect controls, and toggles
- **Details**:
  - Pattern buttons: None, Dots, Grid, Waves, Album
  - Effect selector (reuse EffectSelector when Album)
  - Effect strength slider (reuse AlbumArtEffectControls)
  - Three toggles: Shadow, Spotify code, Branding
- [x] Completed

### Task 8: Create GradientPalette component
- **File**: `src/components/share/compact/GradientPalette.tsx` (new)
- **Description**: Album-derived color palette for background selection
- **Details**:
  - Extract dominant colors from album art
  - Display as horizontal row of color swatches
  - Custom color picker option
  - Show only when not using Album pattern
- [x] Completed

---

## Phase 3: Quick Presets (P0)

### Task 9: Create preset definitions
- **File**: `src/components/share/ShareExperienceStore.ts` (already exists)
- **Description**: Define the four quick preset configurations
- **Details**:
  - Clean: light tint, no effect, soft shadow
  - Vibrant: saturated gradient, no effect, medium shadow
  - Dark: album art, darken 60%, strong shadow
  - Vintage: muted tint, desaturate 40%, soft shadow
- [x] Completed (discovered: already implemented in `getPresetConfig()` method at lines 707-806)

### Task 10: Create album color extraction utility
- **File**: `src/lib/colors/extract-dominant-color.ts` (already exists)
- **Description**: Extract and transform colors from album art for presets
- **Details**:
  - Reuse existing `extractDominantColor` from `@/lib/colors`
  - Generate variations: light, saturated, muted, warm
  - Cache results per album art URL
- [x] Completed (discovered: already implemented in `@/lib/colors`)

### Task 11: Create QuickStylePresets component
- **File**: `src/components/share/compact/QuickStylePresets.tsx` (new)
- **Description**: Four preset buttons with album-aware styling
- **Details**:
  - Horizontal row: Clean, Vibrant, Dark, Vintage
  - Show preview thumbnail or color swatch for each
  - Highlight active preset
  - Apply preset on click via store
- [x] Completed

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
- [x] Completed

### Task 13: Create ZoomSlider component
- **File**: `src/components/share/shared/ZoomSlider.tsx` (new)
- **Description**: Zoom control UI with slider and buttons
- **Details**:
  - Minus button, slider, plus button
  - Display current zoom level (e.g., "120%")
  - Reset button to restore defaults
- [x] Completed (discovered: already exists at `designer/controls/ZoomSlider.tsx`)

### Task 14: Integrate image edit into CompactView
- **File**: `src/components/share/compact/CompactView.tsx` (modify)
- **Description**: Add image edit toggle and controls to compact mode
- **Details**:
  - Show image edit button (🖼️) when Album pattern selected
  - Apply gesture handlers to preview when editing
  - Show zoom slider when editing
- [x] Completed

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
- [x] Completed

### Task 16: Create ControlTabs component
- **File**: `src/components/share/expanded/ControlTabs.tsx` (new)
- **Description**: Tab navigation for mobile expanded mode
- **Details**:
  - Tabs: Templates, Layout, Style, Elements, Effects
  - Templates selected by default
  - Horizontal scrollable on narrow screens
- [x] Completed

### Task 17: Create TemplatesPanel
- **File**: `src/components/share/expanded/panels/TemplatesPanel.tsx` (new)
- **Description**: Template gallery panel for expanded mode
- **Details**:
  - Reuse existing TemplateGallery component
  - Wrap with panel styling
- [x] Completed

### Task 18: Create remaining panels (Layout, Style, Elements, Effects)
- **File**: `src/components/share/expanded/panels/*.tsx` (new)
- **Description**: Create control panels for each tab
- **Details**:
  - Reuse existing control components from ShareDesigner
  - LayoutPanel: aspect ratio, padding
  - StylePanel: background, typography
  - ElementsPanel: visibility toggles
  - EffectsPanel: shadow, border, album effects
- [x] Completed

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
- [x] Completed

### Task 20: Implement mode transition in ShareExperience
- **File**: `src/components/share/ShareExperience.tsx` (modify)
- **Description**: Add animated transitions between compact and expanded
- **Details**:
  - Animate modal size change
  - Coordinate element animations (fade, slide)
  - Manage focus during transition
- [x] Completed

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

### Task 6: Create CompactView layout
- Created `src/components/share/compact/CompactView.tsx` and `index.ts`
- Full compact customize view with ShareDesignerPreview integration
- Exposes `triggerShare` method via forwardRef for footer button integration
- Text edit mode with toggle button and reset capability
- Image edit mode button (shown when album art background is selected)
- Share menu dropdown with copy/download/share actions (reuses useShareExport hook)
- Preview scaling to fit container width (same pattern as LyricsShareModal)
- Placeholders for Quick Styles (Task 11), Pattern & Effects controls (Task 7), and Gradient Palette (Task 8)
- "More options" button to expand to studio mode
- Footer "Share Image" button integrated in ShareExperience.tsx

### Task 7: Create QuickControls component
- Created `src/components/share/compact/QuickControls.tsx`
- PatternSelector component with 5 pattern options (None, Dots, Grid, Waves, Album)
- Album option conditionally shown when album art is available
- EffectSelector and AlbumArtEffectControls integration when Album pattern selected
- Three toggle switches: Drop shadow, Spotify code (conditional), Support us (branding)
- ToggleSwitch component with accessible label and aria attributes
- All state connected to ShareExperienceStore via callback props
- Integrated into CompactView replacing placeholder

### Task 8: Create GradientPalette component
- Created `src/components/share/compact/GradientPalette.tsx`
- Displays album-derived gradient swatches from `store.getGradientPalette()`
- Horizontal row of circular color buttons with selection ring indicator
- Custom color picker option using hidden `<input type="color">`
- Positioned absolutely at bottom of preview area (same pattern as LyricsShareModal)
- Conditionally hidden when using Album pattern background
- Integrated into CompactView with handlers for gradient and custom color selection
- State management: gradient selection via `store.setGradient()`, custom color via `store.setSolidColor()`
- Exported `CUSTOM_COLOR_ID` constant for custom color identification

### Task 9: Create preset definitions
- Discovered already implemented in `ShareExperienceStore.ts` at `getPresetConfig()` method (lines 707-806)
- Four presets: clean, vibrant, dark, vintage with album-aware configurations
- Each returns background config, albumArtEffect config, and shadow config
- Uses gradient palette colors from album art extraction

### Task 10: Create album color extraction utility
- Discovered already implemented in `src/lib/colors/extract-dominant-color.ts`
- `extractDominantColor()` extracts average color from album art
- `buildGradientPalette()` creates album-derived gradient options
- Already integrated with ShareExperienceStore during initialization

### Task 11: Create QuickStylePresets component
- Created `src/components/share/compact/QuickStylePresets.tsx`
- Four preset buttons: Clean, Vibrant, Dark, Vintage in horizontal row
- Uses `useShareExperienceActivePreset` hook to track selected preset
- Calls `store.applyQuickPreset()` on click to apply preset configuration
- Accessible button styling with aria-label and aria-pressed attributes
- Integrated into CompactView replacing placeholder
- Exported from `compact/index.ts`

### Task 12: Create useShareGestures hook
- Created `src/components/share/hooks/useShareGestures.ts` and `index.ts`
- Extracted gesture handling from ShareDesignerPreview.tsx into reusable hook
- Pointer events: drag/pan with pointer capture and release
- Touch events: pinch-to-zoom with two-finger gesture detection
- Wheel events: scroll zoom with sensitivity scaling
- Keyboard events: arrow keys for pan, +/- for zoom, R for reset, Escape for exit
- Haptic feedback at zoom limits (min 1.0, max 3.0)
- Returns element ref, isDragging state, event handlers object, and gesture styles
- Exports constants: MIN_SCALE, MAX_SCALE, MIN_OFFSET, MAX_OFFSET, PAN_STEP, ZOOM_STEP

### Task 13: Create ZoomSlider component
- Discovered: Component already exists at `src/components/share/designer/controls/ZoomSlider.tsx`
- Full implementation with minus/plus buttons, slider, and zoom percentage display
- Range: 100% to 300% (MIN_SCALE=1, MAX_SCALE=3)
- Step: 0.1x (10%), Button step: 0.1x
- Accessibility: ARIA labels and value text
- Exported from `designer/controls/index.ts`
- Can be imported directly: `import { ZoomSlider } from "@/components/share/designer/controls"`

### Task 14: Integrate image edit into CompactView
- Modified `src/components/share/compact/CompactView.tsx`
- Image edit button (🖼️) already present when Album pattern selected (via ImageEditMode component)
- Gesture handlers already integrated via ShareDesignerPreview props (pointer, touch, wheel, keyboard)
- Added ZoomSlider component showing when `isImageEditing` is true
- ZoomSlider appears at bottom of preview area, absolutely positioned
- Connected to `imageEdit.scale` state and `handleImageScaleChange` callback

### Task 15: Create ExpandedView layout
- Created `src/components/share/expanded/ExpandedView.tsx` and `index.ts`
- Full expanded studio mode layout with both mobile and desktop views
- Mobile: Full screen (100dvh - header) with tabbed controls (Templates, Layout, Style, Elements, Effects)
- Desktop: Side-by-side layout (60% preview, 40% controls with collapsible accordion sections)
- Undo/redo buttons in preview area with history state integration
- Image edit mode with ZoomSlider when album art background selected
- Share dropdown with copy/download/share actions
- "Less options" button to collapse back to compact mode
- Reuses existing components: ShareDesignerPreview, TemplateGallery, all control components
- Added `applyTemplate()` method and `ApplyTemplate` event to ShareExperienceStore
- Added `buildBackgroundFromTemplate()` helper function
- Updated ShareExperience.tsx to use real ExpandedView and handle mode transitions

### Task 16: Create ControlTabs component
- Extracted `MobileTabBar` from `ExpandedView.tsx` into `src/components/share/expanded/ControlTabs.tsx`
- Exported as `ControlTabs` component with `ControlTabId` type and `ControlTabsProps` interface
- Five tabs: Templates, Layout, Style, Elements, Effects with Phosphor icons
- Horizontal scrollable via `overflow-x-auto` for narrow screens
- Animated selection indicator using framer-motion `layoutId`
- Proper ARIA attributes (`role="tablist"`, `role="tab"`, `aria-selected`)
- Updated `ExpandedView.tsx` to import and use the extracted component
- Updated `expanded/index.ts` to export `ControlTabs`, `CONTROL_TABS`, `ControlTabId`, and `ControlTabsProps`

### Task 17: Create TemplatesPanel
- Created `src/components/share/expanded/panels/TemplatesPanel.tsx`
- Created `src/components/share/expanded/panels/index.ts` for exports
- Wraps TemplateGallery component with consistent panel styling
- Props: `selectedTemplateId`, `onSelect` callback
- Updated `ExpandedView.tsx` to use TemplatesPanel in both mobile and desktop views
- Replaced direct TemplateGallery usage with TemplatesPanel component
- Updated `expanded/index.ts` to export TemplatesPanel and TemplatesPanelProps

### Task 18: Create remaining panels (Layout, Style, Elements, Effects)
- Created `src/components/share/expanded/panels/LayoutPanel.tsx`
  - Wraps LayoutControls with consistent panel styling
  - Props: `aspectRatio`, `padding`, `onAspectRatioChange`, `onPaddingChange`
- Created `src/components/share/expanded/panels/StylePanel.tsx`
  - Combines BackgroundControls and TypographyControls
  - Props: `background`, `typography`, `gradientPalette`, `hasAlbumArt`, callbacks
  - Uses conditional spread for optional `onRegeneratePattern` prop (exactOptionalPropertyTypes)
- Created `src/components/share/expanded/panels/ElementsPanel.tsx`
  - Wraps ElementsControls with consistent panel styling
  - Props: `elements`, `hasAlbumArt`, `hasSpotifyId`, `onElementChange`, `onToggleVisibility`
- Created `src/components/share/expanded/panels/EffectsPanel.tsx`
  - Combines EffectsControls and ExportControls
  - Props: `effects`, `exportSettings`, shadow/border/vignette/export callbacks, album art effect props
  - Uses conditional spread for optional album art effect props (exactOptionalPropertyTypes)
- Updated `panels/index.ts` to export all panel components and their prop types
- Updated `expanded/index.ts` to re-export all panels
- Refactored `ExpandedView.tsx` mobile `renderMobileTabContent()` to use new panel components
- Desktop ControlPanel already uses individual control components directly (unchanged)

### Task 19: Create transition animations
- Created `src/components/share/transitions.ts`
- Defined animation duration constants: EXPAND_DURATION (300ms), COLLAPSE_DURATION (250ms)
- Created `prefersReducedMotion()` utility following existing pattern in `@/lib/haptics.ts`
- Created `getTransition()` helper that respects reduced motion preference
- Defined transition presets: `expandTransition`, `collapseTransition`, `instantTransition`
- Created framer-motion variants for all animated elements:
  - `modalContainerVariants`: Modal height/maxHeight changes between modes
  - `quickControlsVariants`: Quick controls fade out during expand
  - `tabBarVariants`: Tab bar fade in during expand with staggered delay
  - `undoRedoVariants`: Undo/redo buttons scale and fade in
  - `controlPanelVariants`: Desktop side panel slide from right
  - `staggerContainerVariants` / `staggerChildVariants`: Staggered list animations
- Created utility functions: `createReducedMotionVariants()`, `getModeAnimationState()`, `getModalClasses()`
- All variants include proper easing (ease-out for expand, ease-in for collapse)

### Task 20: Implement mode transition in ShareExperience
- Modified `src/components/share/ShareExperience.tsx`
- Imported transition utilities from `transitions.ts`: `COLLAPSE_DURATION`, `EXPAND_DURATION`, `getModalClasses`, `prefersReducedMotion`
- Added mode transition tracking via `prevModeRef` to detect expand/collapse direction
- Added `modeTransitionDuration` and `contentTransitionDuration` memos based on direction
- Added `layout` prop to modal container for smooth height/width CSS transitions
- Configured layout transition with proper duration and easing based on expand/collapse
- Updated content animations (select/compact/expanded views) to use coordinated durations
- Content slides in/out with direction-aware x-offset and proper easing
- Added `role="dialog"`, `aria-modal`, and `aria-label` for accessibility
- Implemented focus management after transition completes
- Respects `prefers-reduced-motion` media query (instant transitions when enabled)

---

## Notes

- One task per loop iteration
- Search codebase before implementing - many pieces already exist
- Reuse existing components: ShareDesignerPreview, EffectSelector, TemplateGallery, etc.
- Follow project patterns: useSyncExternalStore, Effect.ts, tagged events
- Validation command: `bun run check`
