# Album Art Customization - Implementation Plan

Generated from specs. Tasks sorted by priority.

## Status Legend
- [ ] Not started
- [x] Completed
- [~] In progress
- [!] Blocked

---

## Phase 1: Core Image Edit Mode (P0)

### Task 1: Add image edit state to ShareDesignerStore
- **File**: `src/components/share/designer/ShareDesignerStore.ts` (modify)
- **Description**: Extend store with image positioning, zoom, and edit mode state
- **Details**:
  - Add `isImageEditing`, `offsetX`, `offsetY`, `scale` properties
  - Add methods: `setImageEditing`, `setImageOffset`, `setImageScale`, `resetImagePosition`
  - Initialize with sensible defaults (offset 0,0 / scale 1.0)
- [x] Completed

### Task 2: Create ImageEditMode toggle button
- **File**: `src/components/share/ImageEditMode.tsx` (new)
- **Description**: Button component to enter/exit image edit mode
- **Details**:
  - Render image icon button next to existing pencil button
  - Only visible when album pattern is selected
  - Toggle `isImageEditing` state on click
  - Show "Done" button when in edit mode
- [x] Completed

### Task 3: Implement drag-to-pan on preview
- **File**: `src/components/share/designer/ShareDesignerPreview.tsx` (modify)
- **Description**: Add mouse/touch drag handling for image repositioning
- **Details**:
  - Track pointer events when `isImageEditing` is true
  - Calculate offset as percentage of image dimensions
  - Clamp offset to -100/+100 range
  - Apply CSS transform based on offset values
- [x] Completed

### Task 4: Implement pinch-to-zoom
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Add pinch gesture support for mobile zoom
- **Details**:
  - Track touch distance changes
  - Calculate scale factor from pinch delta
  - Clamp scale to 1.0-3.0 range
  - Apply CSS transform scale
- [x] Completed

### Task 5: Create ZoomSlider control
- **File**: `src/components/share/designer/controls/ZoomSlider.tsx` (new)
- **Description**: Slider component for zoom level adjustment
- **Details**:
  - Range input from 100% to 300%
  - Display current zoom percentage
  - Plus/minus buttons at ends
  - Update store scale on change
- [x] Completed

### Task 6: Add scroll-wheel zoom for desktop
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Enable mouse wheel zoom when in edit mode
- **Details**:
  - Listen for wheel events on preview container
  - Calculate zoom delta from wheel deltaY
  - Prevent page scroll when zooming
  - Apply scale clamped to valid range
- [x] Completed

### Task 7: Add keyboard navigation
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Arrow keys for pan, +/- for zoom, Escape to exit
- **Details**:
  - Arrow keys adjust offset by 5% increments
  - +/- keys adjust scale by 0.1 increments
  - R key resets to default position/zoom
  - Escape key exits edit mode
- [x] Completed

### Task 8: Add visual affordances for edit mode
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Dashed border and dimmed lyrics in edit mode
- **Details**:
  - Animated dashed border around card when editing
  - Reduce lyrics opacity to 0.5
  - Cursor changes: default → grab → grabbing
- [x] Completed

### Task 9: Add reset button
- **File**: `src/components/share/ImageEditMode.tsx` (modify)
- **Description**: Button to reset position and zoom to defaults
- **Details**:
  - Call `resetImagePosition` method on store
  - Position next to Done button
  - Disabled when already at default values
- [x] Completed

---

## Phase 2: Effects System Foundation (P0)

### Task 10: Define effect types and defaults
- **File**: `src/components/share/effects/index.ts` (new)
- **Description**: Type definitions and default values for all effects
- **Details**:
  - Export EffectType union and EffectSettings interface
  - Define DEFAULT_EFFECT_SETTINGS for each effect type
  - Export EFFECT_DEFINITIONS array with metadata (name, icon, defaults)
- [x] Completed

### Task 11: Add effects state to ShareDesignerStore
- **File**: `src/components/share/ShareDesignerStore.ts` (modify)
- **Description**: Extend store with effect type and settings
- **Details**:
  - Add `effect` and `effectSettings` properties
  - Add `setEffect`, `setEffectSetting` methods
  - Migrate existing vignette to new system
- [x] Completed

### Task 12: Create applyEffect utility
- **File**: `src/components/share/effects/applyEffect.ts` (new)
- **Description**: Generate CSS styles for each effect type
- **Details**:
  - Function returns CSS object for given effect + settings
  - Handle vignette (radial gradient overlay)
  - Handle blur (filter: blur)
  - Handle darken (filter: brightness)
  - Handle desaturate (filter: grayscale)
- [x] Completed

### Task 13: Apply effects to preview background
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Use applyEffect to style album art background
- **Details**:
  - Import and call applyEffect with current state
  - Apply returned styles to background element
  - Ensure effects work with position/zoom transforms
- [x] Completed

### Task 14: Create EffectSelector component
- **File**: `src/components/share/effects/EffectSelector.tsx` (new)
- **Description**: Horizontal scrollable row of effect thumbnails
- **Details**:
  - Map EFFECT_DEFINITIONS to EffectThumbnail components
  - Horizontal scroll with snap on mobile
  - Selected state with accent border
  - Call setEffect on thumbnail click
- [x] Completed

### Task 15: Create EffectThumbnail component
- **File**: `src/components/share/effects/EffectThumbnail.tsx` (new)
- **Description**: Individual effect preview thumbnail
- **Details**:
  - Show album art with effect applied at small scale
  - Effect name label below
  - Selected indicator dot
  - 60x80px size
- [x] Completed

### Task 16: Create EffectControls component
- **File**: `src/components/share/effects/AlbumArtEffectControls.tsx` (new)
- **Description**: Dynamic controls panel for selected effect
- **Details**:
  - Render different controls based on effect type
  - Vignette: strength slider
  - Blur: amount slider
  - Darken: amount slider
  - Desaturate: amount slider
  - Update store settings on change
- [x] Completed

### Task 17: Integrate effect UI into share designer
- **File**: `src/components/share/ShareDesigner.tsx` (modify)
- **Description**: Add EffectSelector and EffectControls to UI
- **Details**:
  - Show EffectSelector when album pattern selected
  - Show EffectControls below selector
  - Replace existing vignette-only slider
- [x] Completed

---

## Phase 3: Advanced Effects (P1)

### Task 18: Implement Tint effect
- **File**: `src/components/share/effects/applyEffect.ts` (modify)
- **Description**: Color overlay with blend mode
- **Details**:
  - Add tint case to applyEffect
  - Use mix-blend-mode: color with opacity
  - Support custom color from settings
- [x] Completed (already implemented in applyEffect.ts)

### Task 19: Add Tint controls
- **File**: `src/components/share/effects/AlbumArtEffectControls.tsx` (already included)
- **Description**: Color picker and intensity slider for tint
- **Details**:
  - Color picker with palette presets
  - Intensity slider 0-100%
  - Live preview updates
- [x] Completed (included in Task 16)

### Task 20: Implement Gradient Overlay effect
- **File**: `src/components/share/effects/applyEffect.ts` (modify)
- **Description**: Semi-transparent gradient overlay
- **Details**:
  - Support linear gradients (top/bottom/left/right)
  - Support radial gradient
  - Apply with specified color and opacity
- [x] Completed (already implemented in applyEffect.ts)

### Task 21: Add Gradient controls
- **File**: `src/components/share/effects/AlbumArtEffectControls.tsx` (already included)
- **Description**: Direction selector, color picker, opacity slider
- **Details**:
  - Direction buttons: top, bottom, left, right, radial
  - Color picker with palette
  - Opacity slider 0-80%
- [x] Completed (included in Task 16)

### Task 22: Implement Duotone effect
- **File**: `src/components/share/effects/applyEffect.ts` (modify)
- **Description**: Two-color luminosity mapping
- **Details**:
  - Use SVG filter for duotone
  - Or CSS filter chain: grayscale + sepia + hue-rotate
  - Map shadows to color 1, highlights to color 2
- [x] Completed (already implemented in applyEffect.ts)

### Task 23: Add Duotone controls
- **File**: `src/components/share/effects/AlbumArtEffectControls.tsx` (already included)
- **Description**: Two color pickers and contrast slider
- **Details**:
  - Shadow color picker
  - Highlight color picker
  - Contrast slider 0-100%
- [x] Completed (included in Task 16)

---

## Phase 4: Polish (P2)

### Task 24: Add haptic feedback
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Vibration feedback on mobile interactions
- **Details**:
  - Use navigator.vibrate API if available
  - Short vibration on mode toggle
  - Subtle feedback on zoom limits
- [x] Completed

### Task 25: Add screen reader announcements
- **File**: `src/components/share/ImageEditMode.tsx` (modify)
- **Description**: ARIA live region for mode and zoom changes
- **Details**:
  - Announce "Image edit mode entered"
  - Announce zoom level changes
  - Announce effect changes
- [ ] Not started

### Task 26: Ensure effects work in export
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Verify html-to-image captures all effects
- **Details**:
  - Test each effect type in export
  - Handle SVG filters if needed
  - Ensure transforms export correctly
- [ ] Not started

### Task 27: Add color picker component
- **File**: `src/components/share/controls/ColorPicker.tsx` (new)
- **Description**: Reusable color picker with presets
- **Details**:
  - Palette of common colors
  - Hex input field
  - Optional: HSL picker
  - Used by Tint, Duotone, Gradient effects
- [ ] Not started

---

## Discovered Tasks

(Tasks discovered during implementation go here)

---

## Completed Tasks

### Task 1: Add image edit state to ShareDesignerStore
- Added `ImageEditState` type to `types.ts` with `offsetX`, `offsetY`, `scale` properties
- Extended `EditMode` to include `"image"` mode
- Added `imageEdit` to `EditorState` with `DEFAULT_IMAGE_EDIT` defaults
- Added tagged events: `SetImageOffset`, `SetImageScale`, `ResetImagePosition`
- Added convenience methods: `setImageOffset()`, `setImageScale()`, `resetImagePosition()`, `isImageEditing()`
- Added hook: `useShareDesignerImageEdit()`

### Task 2: Create ImageEditMode toggle button
- Created `src/components/share/ImageEditMode.tsx` with toggle button component
- Added image icon (Image from phosphor-icons) next to existing pencil button
- Button only visible when albumArt background type is selected
- Toggles between Image icon and Check icon based on edit state
- Shows reset button (ArrowCounterClockwise) when in edit mode and changes exist
- Integrated into PreviewCanvas via `imageEditMode` prop
- Updated CustomizeView to pass image edit config to PreviewCanvas

### Task 3: Implement drag-to-pan on preview
- Added `isImageEditing`, `imageEdit`, and `onImageOffsetChange` props to `ShareDesignerPreview`
- Implemented pointer event handlers (`onPointerDown`, `onPointerMove`, `onPointerUp`) for drag tracking
- Applied background positioning via `backgroundPosition` CSS property based on offset values
- Applied zoom via `backgroundSize` CSS property based on scale value
- Added cursor, touchAction, and userSelect styles for proper drag UX
- Updated `CustomizeView` to pass image edit props to both desktop and mobile preview instances

### Task 4: Implement pinch-to-zoom
- Added `onImageScaleChange` prop to `ShareDesignerPreview`
- Added pinch state refs: `isPinchingRef`, `initialPinchDistanceRef`, `initialScaleRef`
- Implemented `getTouchDistance` helper to calculate distance between two touch points
- Implemented touch event handlers: `handleTouchStart`, `handleTouchMove`, `handleTouchEnd`
- On two-finger touch, captures initial distance and scale; on move, calculates scale factor
- Clamped scale to 1.0-3.0 range as per spec
- Added touch event bindings to card element when in image edit mode
- Updated `CustomizeView` to pass `handleImageScaleChange` callback to both preview instances

### Task 5: Create ZoomSlider control
- Created `src/components/share/designer/controls/ZoomSlider.tsx` with slider + plus/minus buttons
- Range input from 1.0 (100%) to 3.0 (300%) with 0.1 step
- Displays current zoom as percentage (e.g., "120%")
- Plus/minus buttons at ends for fine-grained control
- Follows existing Slider component patterns with styled-jsx
- Exported from `controls/index.ts`

### Task 6: Add scroll-wheel zoom for desktop
- Added `handleWheel` callback to `ShareDesignerPreview`
- Listens for wheel events on card element when in image edit mode
- Calculates zoom delta from wheel deltaY with 0.001 sensitivity
- Inverts deltaY so scroll up = zoom in, scroll down = zoom out
- Prevents default to stop page scroll when zooming
- Clamps scale to 1.0-3.0 range

### Task 7: Add keyboard navigation
- Added `useEffect` with keyboard event listener when in image edit mode
- Arrow keys (Up/Down/Left/Right) adjust offset by 5% increments
- +/= keys zoom in by 0.1, - key zooms out by 0.1
- R key resets position and zoom to defaults
- Escape key exits image edit mode
- Added `onExitImageEdit` and `onResetImagePosition` props to `ShareDesignerPreview`
- Ignores keypresses when user is typing in input/textarea/contentEditable
- Event listener properly cleaned up on unmount

### Task 8: Add visual affordances for edit mode
- Added `isDragging` state via `useState` to track active drag operations
- Updated `handlePointerDown` to set `isDragging` to true on drag start
- Updated `handlePointerUp` to set `isDragging` to false on drag end
- Cursor changes: `grab` when in image edit mode, `grabbing` while dragging
- Added animated dashed border overlay when `isImageEditing` is true
- Border uses pulsing opacity animation (0.4 to 1.0) via styled-jsx
- Content div opacity reduced to 0.5 when in image edit mode
- Border inset by 4px from card edge with matching border radius

### Task 9: Add reset button
- Already implemented as part of Task 2 (ImageEditMode component)
- Reset button (ArrowCounterClockwise icon) shows when in edit mode and changes exist
- Calls `onReset` callback which triggers `resetImagePosition` on store
- Button hidden when at default values via `hasChanges` check
- Positioned next to Done button in the edit mode UI

### Task 10: Define effect types and defaults
- Created `src/components/share/effects/index.ts` with complete effects system types
- Defined `EffectType` union: "none" | "vignette" | "blur" | "darken" | "desaturate" | "tint" | "gradient" | "duotone"
- Defined `GradientDirection` type for gradient overlay directions
- Defined `EffectSettings` interface with all effect parameters (strength, amounts, colors, etc.)
- Exported `DEFAULT_EFFECT_SETTINGS` with sensible defaults for all effects
- Defined `EffectDefinition` interface with id, name, description, icon
- Exported `EFFECT_DEFINITIONS` array with metadata for all 8 effects
- Added helper functions: `getEffectDefinition()`, `getEffectName()`
- Uses phosphor-icons for effect icons (CircleHalf, Drop, Gradient, Moon, Palette, SunDim, Textbox)

### Task 11: Add effects state to ShareDesignerStore
- Added `AlbumArtEffectConfig` interface to `types.ts` with `effect: EffectType` and `settings: EffectSettings`
- Added `albumArtEffect` property to `ShareDesignerState` interface
- Created `DEFAULT_ALBUM_ART_EFFECT` with effect: "none" and DEFAULT_EFFECT_SETTINGS
- Added tagged events: `SetAlbumArtEffect`, `SetAlbumArtEffectSetting`
- Added dispatch handlers for new events with history support
- Added convenience methods: `setAlbumArtEffect()`, `setAlbumArtEffectSetting()`
- Added hook: `useShareDesignerAlbumArtEffect()`
- Updated `handleApplyTemplate()` to preserve `albumArtEffect` state
- Re-exported `EffectType`, `EffectSettings`, `GradientDirection` from types.ts for convenience

### Task 12: Create applyEffect utility
- Created `src/components/share/effects/applyEffect.ts` with CSS style generation for all effects
- Defined `EffectStyles` interface with `filter`, `overlay`, and `secondaryOverlay` properties
- Implemented `applyEffect()` function with exhaustive switch on EffectType
- Vignette: radial gradient overlay with strength-based opacity
- Blur: CSS `filter: blur(Npx)` with amount mapping
- Darken: CSS `filter: brightness(N)` converting 0-80 amount to 1.0-0.2 brightness
- Desaturate: CSS `filter: grayscale(N%)` with direct percentage mapping
- Tint: color overlay with `mix-blend-mode: color` and intensity-based opacity
- Gradient: directional linear/radial gradients with color and opacity
- Duotone: grayscale + contrast filter with multiply/screen blend mode overlays
- Added `hexToRgb()` helper for color parsing
- Exported `applyEffect` and `EffectStyles` from effects index

### Task 13: Apply effects to preview background
- Added `AlbumArtEffectConfig` import and `applyEffect` import to `ShareDesignerPreview.tsx`
- Added `albumArtEffect?: AlbumArtEffectConfig` prop to `ShareDesignerPreviewProps`
- Created `albumArtEffectOverlay` memoized value that:
  - Returns null if background is not albumArt or effect is "none"
  - Calls `applyEffect()` with current effect type and settings
  - Renders filter layer via `backdropFilter` for CSS filter effects
  - Renders primary and secondary overlay divs for overlay-based effects
- Added `albumArtEffectOverlay` to render tree after `albumArtOverlay` and before `vignetteOverlay`
- Updated `CustomizeView.tsx` to pass `albumArtEffect={state.albumArtEffect}` to both desktop and mobile `ShareDesignerPreview` instances

### Task 14: Create EffectSelector component
- Created `src/components/share/effects/EffectSelector.tsx` with horizontal scrollable effect thumbnails
- Maps `EFFECT_DEFINITIONS` to render each effect option as a button
- Each thumbnail shows: icon overlay on small album art preview, effect name below
- Horizontal scroll with `scrollSnapType: "x mandatory"` for mobile
- Selected state indicated with `var(--color-accent)` border
- Uses framer-motion for hover/tap feedback
- Proper ARIA attributes (radiogroup, radio, aria-checked)
- Exported from `effects/index.ts`

### Task 15: Create EffectThumbnail component
- Created `src/components/share/effects/EffectThumbnail.tsx` as a separate component
- Shows album art with actual effect applied using `applyEffect()` utility
- Effect previewed at 52x52px size inside 60px wide button
- Uses `DEFAULT_EFFECT_SETTINGS` for consistent effect preview across all thumbnails
- Renders filter layer, primary overlay, and secondary overlay for full effect support
- Effect name label below thumbnail with selected state color
- Selected indicator dot absolutely positioned at bottom
- Proper ARIA attributes (radio, aria-checked) and keyboard support via motion.button
- Refactored `EffectSelector` to use `EffectThumbnail` component
- Exported from `effects/index.ts`

### Task 16: Create EffectControls component
- Created `src/components/share/effects/AlbumArtEffectControls.tsx` for dynamic effect controls
- Renders different controls based on `effectType` prop via switch statement
- Vignette: strength slider (0-100%)
- Blur: amount slider (0-30px)
- Darken: amount slider (0-80%)
- Desaturate: amount slider (0-100%)
- Tint: color picker + intensity slider (0-100%)
- Gradient: direction selector (5 buttons: top/bottom/left/right/radial) + color picker + opacity slider (0-80%)
- Duotone: shadow color picker + highlight color picker + contrast slider (0-100%)
- Uses existing `Slider` and `ColorPicker` components from `@/components/share/designer/controls`
- Created `DirectionButton` and `DirectionSelector` internal components for gradient direction
- Uses phosphor-icons for direction buttons (ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CircleDashed)
- All handlers memoized with `useCallback`
- Exported from `effects/index.ts`

### Task 17: Integrate effect UI into share designer
- Modified `src/components/share/designer/controls/EffectsControls.tsx`:
  - Added imports for `AlbumArtEffectControls`, `EffectSelector`, `EffectSettings`, `EffectType` from `../../effects`
  - Extended `EffectsControlsProps` with album art effect props: `isAlbumArtBackground`, `albumArt`, `albumArtEffect`, `albumArtEffectSettings`, `onAlbumArtEffectChange`, `onAlbumArtEffectSettingChange`
  - Added album art effects section that renders `EffectSelector` and `AlbumArtEffectControls` when album art background is selected
  - Hid the existing vignette section when album art background is selected (album art effects include vignette)
- Modified `src/components/share/designer/page/CustomizeView.tsx`:
  - Added `handleAlbumArtEffectChange` callback to call `store.setAlbumArtEffect()`
  - Added `handleAlbumArtEffectSettingChange` callback to call `store.setAlbumArtEffectSetting()`
  - Passed all album art effect props to `EffectsControls` in both mobile and desktop layouts

### Task 24: Add haptic feedback
- Modified `src/components/share/ImageEditMode.tsx`:
  - Added `useHaptic` hook import
  - Added `handleToggle` callback with light haptic on mode toggle
  - Added `handleReset` callback with medium haptic on reset
- Modified `src/components/share/designer/ShareDesignerPreview.tsx`:
  - Added `useHaptic` hook import
  - Added `zoomLimitHapticRef` to track zoom limit haptic state
  - Added haptic feedback in `handleTouchMove` when hitting min/max zoom (1.0 or 3.0)
  - Added haptic feedback in `handleWheel` when crossing zoom limits
  - Reset haptic ref when pinch ends

---

## Notes

- One task per loop iteration
- Search codebase before implementing - vignette already exists
- Use Effect.ts for async operations
- Follow useSyncExternalStore pattern for store
- Use `@/` import alias
- Run `bun run check` to validate
