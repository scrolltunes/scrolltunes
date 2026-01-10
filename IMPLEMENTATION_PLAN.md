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
- [ ] Not started

### Task 7: Add keyboard navigation
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Arrow keys for pan, +/- for zoom, Escape to exit
- **Details**:
  - Arrow keys adjust offset by 5% increments
  - +/- keys adjust scale by 0.1 increments
  - R key resets to default position/zoom
  - Escape key exits edit mode
- [ ] Not started

### Task 8: Add visual affordances for edit mode
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Dashed border and dimmed lyrics in edit mode
- **Details**:
  - Animated dashed border around card when editing
  - Reduce lyrics opacity to 0.5
  - Cursor changes: default → grab → grabbing
- [ ] Not started

### Task 9: Add reset button
- **File**: `src/components/share/ImageEditMode.tsx` (modify)
- **Description**: Button to reset position and zoom to defaults
- **Details**:
  - Call `resetImagePosition` method on store
  - Position next to Done button
  - Disabled when already at default values
- [ ] Not started

---

## Phase 2: Effects System Foundation (P0)

### Task 10: Define effect types and defaults
- **File**: `src/components/share/effects/index.ts` (new)
- **Description**: Type definitions and default values for all effects
- **Details**:
  - Export EffectType union and EffectSettings interface
  - Define DEFAULT_EFFECT_SETTINGS for each effect type
  - Export EFFECT_DEFINITIONS array with metadata (name, icon, defaults)
- [ ] Not started

### Task 11: Add effects state to ShareDesignerStore
- **File**: `src/components/share/ShareDesignerStore.ts` (modify)
- **Description**: Extend store with effect type and settings
- **Details**:
  - Add `effect` and `effectSettings` properties
  - Add `setEffect`, `setEffectSetting` methods
  - Migrate existing vignette to new system
- [ ] Not started

### Task 12: Create applyEffect utility
- **File**: `src/components/share/effects/applyEffect.ts` (new)
- **Description**: Generate CSS styles for each effect type
- **Details**:
  - Function returns CSS object for given effect + settings
  - Handle vignette (radial gradient overlay)
  - Handle blur (filter: blur)
  - Handle darken (filter: brightness)
  - Handle desaturate (filter: grayscale)
- [ ] Not started

### Task 13: Apply effects to preview background
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Use applyEffect to style album art background
- **Details**:
  - Import and call applyEffect with current state
  - Apply returned styles to background element
  - Ensure effects work with position/zoom transforms
- [ ] Not started

### Task 14: Create EffectSelector component
- **File**: `src/components/share/effects/EffectSelector.tsx` (new)
- **Description**: Horizontal scrollable row of effect thumbnails
- **Details**:
  - Map EFFECT_DEFINITIONS to EffectThumbnail components
  - Horizontal scroll with snap on mobile
  - Selected state with accent border
  - Call setEffect on thumbnail click
- [ ] Not started

### Task 15: Create EffectThumbnail component
- **File**: `src/components/share/effects/EffectThumbnail.tsx` (new)
- **Description**: Individual effect preview thumbnail
- **Details**:
  - Show album art with effect applied at small scale
  - Effect name label below
  - Selected indicator dot
  - 60x80px size
- [ ] Not started

### Task 16: Create EffectControls component
- **File**: `src/components/share/effects/EffectControls.tsx` (new)
- **Description**: Dynamic controls panel for selected effect
- **Details**:
  - Render different controls based on effect type
  - Vignette: strength slider
  - Blur: amount slider
  - Darken: amount slider
  - Desaturate: amount slider
  - Update store settings on change
- [ ] Not started

### Task 17: Integrate effect UI into share designer
- **File**: `src/components/share/ShareDesigner.tsx` (modify)
- **Description**: Add EffectSelector and EffectControls to UI
- **Details**:
  - Show EffectSelector when album pattern selected
  - Show EffectControls below selector
  - Replace existing vignette-only slider
- [ ] Not started

---

## Phase 3: Advanced Effects (P1)

### Task 18: Implement Tint effect
- **File**: `src/components/share/effects/applyEffect.ts` (modify)
- **Description**: Color overlay with blend mode
- **Details**:
  - Add tint case to applyEffect
  - Use mix-blend-mode: color with opacity
  - Support custom color from settings
- [ ] Not started

### Task 19: Add Tint controls
- **File**: `src/components/share/effects/EffectControls.tsx` (modify)
- **Description**: Color picker and intensity slider for tint
- **Details**:
  - Color picker with palette presets
  - Intensity slider 0-100%
  - Live preview updates
- [ ] Not started

### Task 20: Implement Gradient Overlay effect
- **File**: `src/components/share/effects/applyEffect.ts` (modify)
- **Description**: Semi-transparent gradient overlay
- **Details**:
  - Support linear gradients (top/bottom/left/right)
  - Support radial gradient
  - Apply with specified color and opacity
- [ ] Not started

### Task 21: Add Gradient controls
- **File**: `src/components/share/effects/EffectControls.tsx` (modify)
- **Description**: Direction selector, color picker, opacity slider
- **Details**:
  - Direction buttons: top, bottom, left, right, radial
  - Color picker with palette
  - Opacity slider 0-80%
- [ ] Not started

### Task 22: Implement Duotone effect
- **File**: `src/components/share/effects/applyEffect.ts` (modify)
- **Description**: Two-color luminosity mapping
- **Details**:
  - Use SVG filter for duotone
  - Or CSS filter chain: grayscale + sepia + hue-rotate
  - Map shadows to color 1, highlights to color 2
- [ ] Not started

### Task 23: Add Duotone controls
- **File**: `src/components/share/effects/EffectControls.tsx` (modify)
- **Description**: Two color pickers and contrast slider
- **Details**:
  - Shadow color picker
  - Highlight color picker
  - Contrast slider 0-100%
- [ ] Not started

---

## Phase 4: Polish (P2)

### Task 24: Add haptic feedback
- **File**: `src/components/share/ShareDesignerPreview.tsx` (modify)
- **Description**: Vibration feedback on mobile interactions
- **Details**:
  - Use navigator.vibrate API if available
  - Short vibration on mode toggle
  - Subtle feedback on zoom limits
- [ ] Not started

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

---

## Notes

- One task per loop iteration
- Search codebase before implementing - vignette already exists
- Use Effect.ts for async operations
- Follow useSyncExternalStore pattern for store
- Use `@/` import alias
- Run `bun run check` to validate
