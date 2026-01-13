# UX Design: Unified Share Experience

> **Status: Implemented** (January 2026)

## Executive Summary

Merge the LyricsShareModal and ShareDesigner into a single, progressive share experience that starts simple and expands to full studio capabilities without navigation. The design follows a "progressive disclosure" pattern where users begin with quick, opinionated defaults and can drill into advanced controls as needed.

---

## Implementation Notes

**Completed**: All phases of the unified share experience have been implemented. The `ShareExperience` component now serves as the single entry point for all share functionality, replacing the previous `LyricsShareModal`, `ShareDesigner`, and `ShareDesignerPage` components.

### Key Implementation Details

- **Entry Point**: `ShareExperience` component in `src/components/share/ShareExperience.tsx`
- **State Management**: `ShareExperienceStore` extends patterns from `ShareDesignerStore` with additional mode, step, preset, and compact pattern state
- **Mode Transitions**: Animated transitions between compact and expanded modes with 300ms/250ms durations
- **Removed Components**: `LyricsShareModal`, `ShareDesigner`, `ShareDesignerPage`, and the `/share` route

### Deviations from Original Design

1. **File Structure**: The `shared/` directory was not created as a separate folder. Instead:
   - `LineSelection` is inline in `ShareExperience.tsx`
   - `ShareDesignerPreview` remains in `designer/` (not renamed to `SharePreview`)
   - `ImageEditMode` and `TextEditMode` remain at root level of `share/`
   - `ExportActions` functionality integrated via `useShareExport` hook

2. **ZoomSlider**: Reused existing component from `designer/controls/ZoomSlider.tsx` rather than creating a new one in `shared/`

3. **State Shape**: The actual state uses `experienceMode` and `experienceStep` field names (prefixed to avoid conflicts with inherited state)

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| URL routing | Modal-only (remove /share page) | Simpler, unified entry point |
| Default studio tab | Templates | Fastest path to polished look |
| Quick presets | Yes - Clean, Vibrant, Dark, Vintage | Instant styles for quick sharing |
| Preset colors | Album-aware | Adapts to each song's artwork |
| Mobile expand | Full screen | Maximum space for studio controls |
| "Open in Studio" button | Remove | Replaced by inline "More options" |
| Preset editing | Fully editable | Presets are starting points, not locks |
| Reopen state | Always compact | Fresh start, simple mental model |
| Compact preview | Large preview | Users see changes live |
| Image edit mode | Both modes | Popular feature, always accessible |

---

## 1. Design Principles

1. **Progressive Disclosure** - Start simple, reveal complexity on demand
2. **Zero Navigation** - Everything happens in one expandable interface
3. **Mobile-First** - Optimized for phone, scales beautifully to desktop
4. **Instant Gratification** - Quick share path takes <10 seconds
5. **Non-Destructive** - Undo/redo for all changes, easy reset

---

## 2. Architecture

### Single Component: `ShareExperience`

Three separate components consolidated into one adaptive component:

```
Before:
├── LyricsShareModal (quick share)
├── ShareDesigner (modal studio)
└── ShareDesignerPage (full studio) ← REMOVED

After:
└── ShareExperience (unified, expandable)
    ├── Mode: "compact" (modal, quick share)
    └── Mode: "expanded" (full studio in-place)
```

### State Management

Unified `ShareExperienceStore` extends `ShareDesignerStore` patterns:
- Undo/redo available in both modes
- State preserved when expanding/collapsing
- Template system available at all levels
- Quick presets (Clean, Vibrant, Dark, Vintage) with album-aware colors

---

## 3. User Flow

### Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         UNIFIED SHARE FLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐          │
│  │   SELECT     │      │   PREVIEW    │      │   SHARE      │          │
│  │   LYRICS     │ ──►  │   + QUICK    │ ──►  │   (export)   │          │
│  │              │      │   CUSTOMIZE  │      │              │          │
│  └──────────────┘      └──────┬───────┘      └──────────────┘          │
│                               │                                         │
│                               │ "More options" / expand                 │
│                               ▼                                         │
│                        ┌──────────────┐                                 │
│                        │   STUDIO     │                                 │
│                        │   MODE       │                                 │
│                        │  (expanded)  │                                 │
│                        └──────────────┘                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Select Lyrics (unchanged)

Same as current modal - tap lines to select.

### Step 2: Quick Customize (compact mode)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                    Customize                       ✕    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [✏️]                                              [🖼️]  │   │
│  │  ╔════════════════════════════════════════════════════╗  │   │
│  │  ║                                                    ║  │   │
│  │  ║        🎵  Song Title                             ║  │   │
│  │  ║            Artist                                  ║  │   │
│  │  ║                                                    ║  │   │
│  │  ║        "Selected lyrics appear here"              ║  │   │
│  │  ║        "Second line of lyrics"                    ║  │   │
│  │  ║                                                    ║  │   │
│  │  ╚════════════════════════════════════════════════════╝  │   │
│  │                                                           │   │
│  │  ○ ○ ○ ○ ○ ○ ●    (gradient palette)                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Quick Styles (album-aware)                               │   │
│  │  [Clean] [Vibrant] [Dark] [Vintage]                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Pattern    [None] [Dots] [Grid] [Waves] [●Album]        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Effect     [○][○][●][○][○][○][○][○]  (effect thumbs)   │   │
│  │  Strength   ════════════●════════════  50%               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ○ Drop shadow    ○ Spotify code    ○ Support us ❤️      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [⚙️ More options...]                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│               [          Share Image          ]                  │
└─────────────────────────────────────────────────────────────────┘
```

**Quick Customize Features:**
- Preview with edit (✏️) and image edit (🖼️) toggles
- Gradient palette (from album colors)
- **Quick Styles: Clean, Vibrant, Dark, Vintage** (album-aware presets)
- Pattern selector (None, Dots, Grid, Waves, Album)
- Effect selector + primary control (when Album pattern)
- Three toggles: shadow, Spotify code, branding
- "More options" expander to studio mode

### Quick Style Presets (Album-Aware)

| Preset | Background | Effect | Shadow | Description |
|--------|------------|--------|--------|-------------|
| **Clean** | Light tint from album | None | Soft | Minimal, airy look with subtle album color |
| **Vibrant** | Saturated gradient from album | None | Medium | Bold, colorful, eye-catching |
| **Dark** | Album art | Darken 60% | Strong | Moody, dramatic, lyrics pop |
| **Vintage** | Muted/warm from album | Desaturate 40% | Soft | Nostalgic, film-like quality |

### Step 3: Studio Mode (expanded) - Mobile Full Screen

When user taps "More options" on mobile, expands to full screen:

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                     Studio                    [Share ▼] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [✏️] [🖼️]                                    [↩️] [↪️]  │   │
│  │  ╔════════════════════════════════════════════════════╗  │   │
│  │  ║              CARD PREVIEW                          ║  │   │
│  │  ╚════════════════════════════════════════════════════╝  │   │
│  │                    Zoom: ════●════ 120%                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [●Templates] [Layout] [Style] [Elements] [Effects]      │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                           │   │
│  │  Templates tab shown by default                          │   │
│  │                                                           │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │Template │ │Template │ │Template │ │Template │        │   │
│  │  │    1    │ │    2    │ │    3    │ │    4    │        │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [✨ Less options]                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Studio Mode Features:**
- Undo/redo buttons (↩️ ↪️)
- Zoom slider for image edit mode
- Tabbed controls: **Templates (default)**, Layout, Style, Elements, Effects
- "Less options" to collapse back to quick mode
- Share dropdown in header
- All preset values fully editable

---

## 4. Desktop Layout (≥768px)

On larger screens, show side-by-side layout:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back                        Share Card                        [Share ▼]  │
├───────────────────────────────────┬─────────────────────────────────────────┤
│                                   │                                          │
│  ┌─────────────────────────────┐  │  ┌────────────────────────────────────┐ │
│  │ [✏️] [🖼️]          [↩️][↪️]│  │  │ Templates                     [▼] │ │
│  │                              │  │  ├────────────────────────────────────┤ │
│  │  ╔══════════════════════╗   │  │  │ ┌────┐ ┌────┐ ┌────┐ ┌────┐      │ │
│  │  ║                      ║   │  │  │ │ T1 │ │ T2 │ │ T3 │ │ T4 │      │ │
│  │  ║     CARD PREVIEW     ║   │  │  │ └────┘ └────┘ └────┘ └────┘      │ │
│  │  ║                      ║   │  │  └────────────────────────────────────┘ │
│  │  ║                      ║   │  │                                          │
│  │  ╚══════════════════════╝   │  │  ┌────────────────────────────────────┐ │
│  │                              │  │  │ Layout                        [▼] │ │
│  │  Zoom: ═══════●═══════      │  │  ├────────────────────────────────────┤ │
│  │                              │  │  │ Aspect: [1:1] [9:16] [16:9] [4:5] │ │
│  │                              │  │  │ Padding: ═════●═════  24px        │ │
│  └─────────────────────────────┘  │  └────────────────────────────────────┘ │
│                                   │                                          │
│                                   │  ┌────────────────────────────────────┐ │
│                                   │  │ Background                     [▼] │ │
│                                   │  ├────────────────────────────────────┤ │
│                                   │  │ Type: [Solid] [Gradient] [●Album]  │ │
│                                   │  │ Effect: [thumbnails...]            │ │
│                                   │  │ Strength: ════●════  40%           │ │
│                                   │  └────────────────────────────────────┘ │
│                                   │                                          │
│                                   │  ┌────────────────────────────────────┐ │
│                                   │  │ Typography                     [▼] │ │
│                                   │  │ Elements                       [▼] │ │
│                                   │  │ Effects                        [▼] │ │
│                                   │  └────────────────────────────────────┘ │
│                                   │                                          │
└───────────────────────────────────┴─────────────────────────────────────────┘
```

---

## 5. Mobile Design (Primary)

Since mobile is the primary use case, here's the detailed mobile experience:

### Mobile Compact Mode (Bottom Sheet)

```
┌────────────────────────────────────┐
│  ─────  (drag handle)              │
│                                    │
│  ← Back      Customize         ✕   │
├────────────────────────────────────┤
│                                    │
│  [✏️]                        [🖼️] │
│  ╔══════════════════════════════╗  │
│  ║                              ║  │
│  ║      🎵  Song Title          ║  │
│  ║          Artist              ║  │
│  ║                              ║  │
│  ║      "Lyrics line one"       ║  │
│  ║      "Lyrics line two"       ║  │
│  ║                              ║  │
│  ╚══════════════════════════════╝  │
│                                    │
│  ○ ○ ○ ○ ○ ● ○  (gradients)       │
│                                    │
├────────────────────────────────────┤
│  Quick Styles                      │
│  [Clean] [Vibrant] [Dark] [Vintage]│
├────────────────────────────────────┤
│  Pattern                           │
│  [None] [Dots] [Grid] [Waves] [●]  │
├────────────────────────────────────┤
│  Effect  (when Album selected)     │
│  [○][○][●][○][○][○][○][○] → scroll │
│  Strength ═══════●═══════  50%     │
├────────────────────────────────────┤
│  ○ Shadow  ○ Spotify  ○ Support ❤️ │
├────────────────────────────────────┤
│  [⚙️ More options...]              │
├────────────────────────────────────┤
│                                    │
│  [    📤 Share Image    ]          │
│                                    │
└────────────────────────────────────┘
```

### Mobile Expanded Mode (Full Screen)

```
┌────────────────────────────────────┐
│  ← Back        Studio    [Share ▼] │
├────────────────────────────────────┤
│                                    │
│  [✏️] [🖼️]              [↩️] [↪️] │
│  ╔══════════════════════════════╗  │
│  ║                              ║  │
│  ║        CARD PREVIEW          ║  │
│  ║                              ║  │
│  ╚══════════════════════════════╝  │
│                                    │
│  Zoom [−] ═══════●═══════ [+]     │
│                                    │
├────────────────────────────────────┤
│ [Templates][Layout][Style][+2 more]│
├────────────────────────────────────┤
│                                    │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐      │
│  │ T1 │ │ T2 │ │ T3 │ │ T4 │      │
│  └────┘ └────┘ └────┘ └────┘      │
│  ← scroll horizontally →          │
│                                    │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐      │
│  │ T5 │ │ T6 │ │ T7 │ │ T8 │      │
│  └────┘ └────┘ └────┘ └────┘      │
│                                    │
│  (scrollable content area)        │
│                                    │
├────────────────────────────────────┤
│  [✨ Less options]                 │
└────────────────────────────────────┘
```

### Mobile Image Edit Mode

```
┌────────────────────────────────────┐
│  ← Back      Edit Image        ✕   │
├────────────────────────────────────┤
│                                    │
│  ╔══════════════════════════════╗  │
│  ║ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ ║  │
│  ║ │                          │ ║  │
│  ║ │    👆 Drag to move       │ ║  │
│  ║ │    🤏 Pinch to zoom      │ ║  │
│  ║ │                          │ ║  │
│  ║ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ ║  │
│  ╚══════════════════════════════╝  │
│                                    │
│  Zoom [−] ═══════●═══════ [+]     │
│        1x            3x            │
│                                    │
│           [🔄 Reset]               │
│                                    │
├────────────────────────────────────┤
│                                    │
│  [      ✓ Done      ]              │
│                                    │
└────────────────────────────────────┘
```

### Mobile Touch Targets

All interactive elements follow mobile best practices:
- **Minimum touch target**: 44×44px
- **Spacing between targets**: 8px minimum
- **Thumb-friendly zones**: Primary actions at bottom of screen

### Mobile Gestures

| Gesture | Action |
|---------|--------|
| Swipe down on handle | Dismiss modal |
| Tap outside modal | Dismiss modal |
| Drag on preview (image edit) | Pan album art |
| Pinch on preview (image edit) | Zoom album art |
| Horizontal swipe on effects | Scroll effect thumbnails |
| Horizontal swipe on templates | Scroll templates |

### Mobile Performance Considerations

- Lazy load effect thumbnails
- Debounce slider updates (16ms)
- Use CSS transforms for preview scaling (GPU accelerated)
- Preload album art at modal open
- Compress exported images on device

---

## 6. Transition Animations

### Compact → Expanded (Mobile)

```
1. Modal expands to full screen (100vh)
2. Quick controls fade out, tabs fade in
3. Undo/redo buttons appear
4. Header updates ("Customize" → "Studio")
5. Duration: 300ms, ease-out curve
```

### Expanded → Compact

```
1. Reverse of above
2. State is preserved (changes made in studio mode persist)
3. Duration: 250ms, ease-in curve
```

---

## 6. Image Edit Mode

Available in **both compact and expanded modes** when Album pattern is selected:

### Toggle Behavior

```
┌─────────────────────────────────────────────────────────────────┐
│  [✏️]  [🖼️]  ← Toggle between text edit and image edit         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Image Edit Mode Active:                                        │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  ║  │
│  ║ │                                                      │  ║  │
│  ║ │      Drag to pan, pinch/scroll to zoom             │  ║  │
│  ║ │                                                      │  ║  │
│  ║ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  ║  │
│  ╚══════════════════════════════════════════════════════════╝  │
│                                                                  │
│  Zoom  [−]  ════════●════════  [+]   [Reset]                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Gestures

| Platform | Pan | Zoom In | Zoom Out |
|----------|-----|---------|----------|
| Mobile | Drag | Pinch out | Pinch in |
| Desktop | Click+drag | Scroll up / + key | Scroll down / - key |

---

## 7. Component Architecture

### Design File Structure (see Section 14 for actual implementation)

```
src/components/share/
├── ShareExperience.tsx          # Main unified component
├── ShareExperienceStore.ts      # Unified state (extend ShareDesignerStore)
├── compact/
│   ├── CompactView.tsx          # Quick customize layout
│   ├── QuickControls.tsx        # Pattern, effects, toggles
│   ├── QuickStylePresets.tsx    # Clean, Vibrant, Dark, Vintage
│   └── GradientPalette.tsx      # Color selection
├── expanded/
│   ├── ExpandedView.tsx         # Studio layout
│   ├── ControlTabs.tsx          # Tab navigation
│   └── panels/
│       ├── TemplatesPanel.tsx
│       ├── LayoutPanel.tsx
│       ├── StylePanel.tsx
│       ├── ElementsPanel.tsx
│       └── EffectsPanel.tsx
├── shared/
│   ├── SharePreview.tsx         # Card preview (rename from ShareDesignerPreview)
│   ├── LineSelection.tsx        # Lyrics selection step
│   ├── ImageEditMode.tsx        # Pan/zoom toggle (existing)
│   ├── TextEditMode.tsx         # Lyrics text editing
│   └── ExportActions.tsx        # Copy/download/share
├── effects/                     # (existing, unchanged)
│   ├── index.ts
│   ├── applyEffect.ts
│   ├── EffectSelector.tsx
│   └── AlbumArtEffectControls.tsx
└── hooks/
    ├── useShareExport.ts        # (existing)
    └── useShareGestures.ts      # New: pan/zoom gesture handling
```

### State Shape

```typescript
interface ShareExperienceState {
  // Mode
  mode: "compact" | "expanded"
  step: "select" | "customize"

  // Selection
  selectedLineIds: readonly string[]
  editedLines: Map<string, string>

  // Quick Style Preset (null = custom)
  activePreset: "clean" | "vibrant" | "dark" | "vintage" | null

  // Background
  backgroundType: "solid" | "gradient" | "pattern" | "albumArt"
  gradientId: string
  customColor: string
  pattern: PatternVariant
  patternSeed: number

  // Album Art (when backgroundType === "albumArt")
  albumArtEffect: EffectType
  albumArtEffectSettings: EffectSettings
  imageEdit: {
    offsetX: number  // -100 to 100
    offsetY: number  // -100 to 100
    scale: number    // 1.0 to 3.0
  }

  // Layout
  aspectRatio: AspectRatioPreset | "custom"
  customAspectRatio?: { width: number; height: number }
  padding: number

  // Typography (expanded mode)
  typography: TypographyConfig

  // Elements
  elements: {
    showAlbumArt: boolean
    showMetadata: boolean
    showLyrics: boolean
    showSpotifyCode: boolean
    showBranding: boolean
    brandingText: string
  }

  // Effects
  shadow: ShadowConfig
  border: BorderConfig

  // Export
  exportFormat: "png" | "jpeg" | "webp"
  exportQuality: "standard" | "high" | "max"

  // Editor state
  isTextEditing: boolean
  isImageEditing: boolean

  // History
  history: readonly Snapshot[]
  historyIndex: number
}
```

---

## 8. Migration Strategy

### Phase 1: Consolidate State (Non-breaking)
1. Extend `ShareDesignerStore` with pattern backgrounds from modal
2. Add `mode: "compact" | "expanded"` to store
3. Add quick style presets (Clean, Vibrant, Dark, Vintage)
4. Ensure all modal features work with store

### Phase 2: Create Unified Component
1. Build `ShareExperience` component using store
2. Implement compact view (matching current modal UX + presets)
3. Implement expanded view (matching current studio UX)
4. Add transition animations
5. Add image edit mode to compact view

### Phase 3: Replace Existing Components
1. Replace `LyricsShareModal` with `ShareExperience` in compact mode
2. Replace `ShareDesigner` with `ShareExperience`
3. Remove `/share` route and `ShareDesignerPage`
4. Update all entry points

### Phase 4: Cleanup
1. Remove deprecated components (LyricsShareModal, ShareDesigner, ShareDesignerPage)
2. Consolidate duplicate code
3. Update documentation

---

## 9. Accessibility

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` | Move between controls |
| `Enter/Space` | Activate button, toggle |
| `Arrow Keys` | Navigate palette, effect selector, presets |
| `+` / `-` | Zoom in/out (image edit mode) |
| `Arrow Keys` | Pan image (image edit mode) |
| `Escape` | Exit edit mode / close modal |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |

### Screen Reader Announcements

- "Share experience opened, select lyrics step"
- "Moved to customize step, compact mode"
- "Applied Vibrant style preset"
- "Expanded to studio mode"
- "Image edit mode entered. Use arrow keys to pan, plus and minus to zoom."
- "Effect changed to Blur"
- "Zoom level 120 percent"
- "Image exported successfully"

### Focus Management

- Focus trapped within modal
- Focus moves to first interactive element on step change
- Focus returns to trigger on modal close

---

## 10. Responsive Breakpoints

| Breakpoint | Compact Mode | Expanded Mode |
|------------|--------------|---------------|
| < 640px | Full-width bottom sheet (~85vh) | Full screen (100vh) |
| 640-767px | Centered modal (90%, max 600px) | Full screen (100vh) |
| ≥ 768px | Centered modal (90%, max 600px) | Side-by-side (90%, max 1200px) |

---

## 11. Success Metrics

1. **Quick Share Time** - Time from open to export < 10 seconds (maintain current)
2. **Preset Usage** - % of users who use quick style presets
3. **Studio Adoption** - % of users who expand to studio mode
4. **Feature Discovery** - % of users who try effects, templates
5. **Export Completion** - % of sessions that result in export
6. **Return Usage** - Users who use share feature multiple times

---

## 12. Resolved Questions

| Question | Decision |
|----------|----------|
| URL routing | Modal-only, remove /share page |
| Quick presets | Yes: Clean, Vibrant, Dark, Vintage (album-aware) |
| Default studio tab | Templates |
| Mobile expand behavior | Full screen |
| Preset editing | Fully editable (not locked) |
| Reopen state | Always compact |
| Image edit access | Both modes |

---

## 13. Next Steps

1. [x] Review and approve UX design
2. [x] Create technical implementation plan
3. [x] Phase 1: Consolidate state management
4. [x] Phase 2: Build unified component
5. [x] Phase 3: Replace existing components
6. [x] Phase 4: Cleanup and documentation

---

## 14. Final Architecture

### Implemented File Structure

```
src/components/share/
├── ShareExperience.tsx          # Main unified component
├── ShareExperienceStore.ts      # Unified state management
├── transitions.ts               # Animation constants and variants
├── ImageEditMode.tsx            # Pan/zoom toggle component
├── index.ts                     # Public exports
├── compact/
│   ├── CompactView.tsx          # Quick customize layout
│   ├── QuickControls.tsx        # Pattern, effects, toggles
│   ├── QuickStylePresets.tsx    # Clean, Vibrant, Dark, Vintage
│   ├── GradientPalette.tsx      # Color selection
│   └── index.ts
├── expanded/
│   ├── ExpandedView.tsx         # Studio layout (mobile/desktop)
│   ├── ControlTabs.tsx          # Tab navigation for mobile
│   ├── panels/
│   │   ├── TemplatesPanel.tsx
│   │   ├── LayoutPanel.tsx
│   │   ├── StylePanel.tsx
│   │   ├── ElementsPanel.tsx
│   │   ├── EffectsPanel.tsx
│   │   └── index.ts
│   └── index.ts
├── hooks/
│   ├── useShareGestures.ts      # Pan/zoom gesture handling
│   └── index.ts
├── designer/                    # Preserved components
│   ├── ShareDesignerPreview.tsx # Card preview
│   ├── ShareDesignerStore.ts    # Base store (extended by ShareExperienceStore)
│   ├── TemplateGallery.tsx      # Template browser
│   ├── TemplateCard.tsx
│   ├── useShareExport.ts        # Export functionality
│   ├── controls/                # All control components
│   ├── templates/               # Template definitions
│   └── types.ts
└── effects/                     # Effect system (unchanged)
    ├── EffectSelector.tsx
    ├── AlbumArtEffectControls.tsx
    ├── applyEffect.ts
    └── index.ts
```

### Removed Files

- `src/components/share/LyricsShareModal.tsx`
- `src/components/share/designer/ShareDesigner.tsx`
- `src/components/share/designer/ShareDesignerPage.tsx`
- `src/components/share/designer/page/` (entire directory)
- `src/app/song/[artistSlug]/[trackSlugWithId]/share/` (route directory)
