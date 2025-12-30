# Share Modal Visual Editor

> Full WYSIWYG editor for lyrics share cards with drag, resize, snap, and element controls

## Overview

Transform the share modal preview into a fully editable canvas where users can:
- Drag elements to reposition them
- Resize elements (album art, text containers)
- Show/hide individual elements
- Edit text inline
- Align to grid and snap to symmetry guidelines

## State Model

```typescript
interface ElementState {
  id: string
  type: 'albumArt' | 'title' | 'artist' | 'lyrics' | 'branding' | 'spotifyCode'
  x: number           // position from left (px)
  y: number           // position from top (px)
  width: number       // element width (px)
  height: number      // element height (px or 'auto')
  visible: boolean
  locked: boolean     // prevent accidental edits
  rotation?: number   // degrees (future)
}

interface ShareCardLayout {
  elements: ElementState[]
  cardWidth: number
  cardHeight: number
  gridSize: number    // snap grid cell size (e.g., 8px)
  snapEnabled: boolean
  guidesEnabled: boolean
}
```

### State Management

- Create `ShareEditorStore` using `useSyncExternalStore` pattern
- Initialize default layout from current fixed positions
- Persist custom layouts to localStorage per song (optional)

## Interaction System

### Drag and Drop

- Add `@dnd-kit/core` dependency for drag-and-drop
- Create `DraggableElement` wrapper component
- Implement drag handles (grab cursor on hover)
- Update element position on drag end
- Constrain movement within card bounds

### Resize Handles

- Create `ResizeHandle` component (corner + edge handles)
- Implement resize logic with minimum size constraints
- Maintain aspect ratio for album art (shift key to unlock)
- Show dimensions tooltip while resizing

### Selection

- Track selected element ID in state
- Show selection border (blue dashed) on selected element
- Show resize handles only on selected element
- Click outside to deselect
- Delete key to hide selected element

## Grid and Snap System

### Grid Overlay

- Add toggleable grid overlay (8px or 16px cells)
- Render grid lines as SVG pattern or CSS background
- Toggle via toolbar button

### Snap to Grid

- Snap element positions to nearest grid intersection on drag end
- Snap resize dimensions to grid multiples
- Visual feedback: highlight nearest grid line during drag

### Symmetry Guidelines

- Calculate and show center lines (horizontal + vertical)
- Show alignment guides when element edges/centers align with:
  - Card center (vertical)
  - Card middle (horizontal)
  - Other element edges
  - Other element centers
- Magnetic snap: auto-align when within 8px of guideline
- Guide colors: center = purple, edge align = cyan, spacing = orange

### Smart Spacing

- Detect equal spacing between 3+ elements
- Show spacing guides with dimension labels
- Snap to match existing spacing patterns

## Element Controls

### Visibility Toggles

- Add eye icon overlay on hover for each element
- Click to toggle visibility (hidden elements show as ghost)
- Hidden elements excluded from export

### Element-Specific Controls

| Element | Controls |
|---------|----------|
| Album art | Resize, hide, border radius slider |
| Title/Artist | Font size adjustment, hide |
| Lyrics | Individual line controls (edit, hide) |
| Branding | Edit text, hide |
| Spotify code | Resize, hide |

### Toolbar

Create floating toolbar above preview:
- Undo / Redo buttons
- Grid toggle (with size dropdown: 8px, 16px, 24px)
- Snap toggle
- Guides toggle
- Reset layout button
- Lock all / Unlock all

## Layout Engine

- Switch from CSS flexbox to absolute positioning
- Each element gets `position: absolute` with `left`, `top`, `width`, `height`
- Card container becomes `position: relative` with fixed dimensions
- Ensure html-to-image export works with absolute positioning

## Undo/Redo

- Implement history stack for layout changes
- Store snapshots on: drag end, resize end, visibility toggle, text edit
- Limit stack to 50 entries
- Wire Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z for redo

## Touch Support

- Implement touch drag (single finger)
- Implement touch resize (pinch gesture on selected element)
- Larger touch targets for handles (44px minimum)
- Long-press to select (alternative to tap)

## Export Considerations

- Ensure absolute-positioned elements render correctly in html-to-image
- Test cross-origin images with CORS
- Handle hidden elements (don't render in export)
- Maintain pixel-perfect output at 3x resolution

## File Structure

```
src/components/share/
├── editor/
│   ├── ShareEditorStore.ts      # State management
│   ├── DraggableElement.tsx     # Drag wrapper
│   ├── ResizeHandle.tsx         # Resize controls
│   ├── SelectionOverlay.tsx     # Selection UI
│   ├── GridOverlay.tsx          # Grid visualization
│   ├── AlignmentGuides.tsx      # Snap guidelines
│   ├── EditorToolbar.tsx        # Control buttons
│   └── ElementControls.tsx      # Per-element actions
└── LyricsShareModal.tsx         # Updated to use editor
```

## Implementation Phases

### Phase 1: Foundation (2 days)
- State model and store
- Absolute positioning layout
- Basic drag-and-drop

### Phase 2: Resize & Select (1-2 days)
- Selection UI
- Resize handles
- Element visibility toggles

### Phase 3: Snap & Guides (1-2 days)
- Grid overlay
- Snap to grid
- Symmetry guidelines
- Edge/center alignment

### Phase 4: Polish (1 day)
- Undo/redo
- Toolbar
- Touch support
- Export testing

## Dependencies

| Package | Purpose |
|---------|---------|
| `@dnd-kit/core` | Drag and drop (lightweight, accessible) |
| `@dnd-kit/modifiers` | Snap modifiers for grid alignment |

## Open Questions

- Should custom layouts be saved per-song or globally?
- Should we offer layout templates (minimal, centered, large art)?
- Do we need rotation support for elements?
- Should hidden elements be completely removed or shown as ghosts in edit mode?
