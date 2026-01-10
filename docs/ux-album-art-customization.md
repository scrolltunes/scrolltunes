# UX Design: Album Art Background Customization

> **Status: ✅ Fully Implemented** (January 2026)

## Executive Summary

Design a seamless editing experience for album art background positioning and effects in the lyrics share card, with mobile-first interactions and clear visual affordances.

---

## 1. User Flow

### Current State → Proposed State

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│  Select "Album" Pattern → Adjust Vignette Slider → Done        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     PROPOSED FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│  Select "Album" Pattern                                         │
│         ↓                                                       │
│  Choose Effect (Vignette, Blur, Duotone, etc.)                 │
│         ↓                                                       │
│  Tap "Adjust" button on preview OR double-tap image            │
│         ↓                                                       │
│  Enter Image Edit Mode:                                         │
│    • Drag to pan                                                │
│    • Pinch/slider to zoom                                       │
│    • Effect-specific controls appear                            │
│         ↓                                                       │
│  Tap "Done" or tap outside to exit                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Interaction Model

### Mode Separation

```
┌────────────────────────────────────────────────────────────────┐
│                    EDIT MODES (Mutually Exclusive)             │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌──────────────┐         ┌──────────────┐                   │
│   │  📝 LYRICS   │         │  🖼️ IMAGE    │                   │
│   │  EDIT MODE   │         │  EDIT MODE   │                   │
│   ├──────────────┤         ├──────────────┤                   │
│   │ Edit text    │         │ Pan/drag     │                   │
│   │ Input fields │         │ Zoom         │                   │
│   │ Pencil icon  │         │ Effects      │                   │
│   └──────────────┘         └──────────────┘                   │
│                                                                │
│   Toggle: Pencil button     Toggle: Image button OR           │
│                             double-tap on preview              │
└────────────────────────────────────────────────────────────────┘
```

### Gesture Mapping

| Platform | Pan | Zoom In | Zoom Out | Exit Mode |
|----------|-----|---------|----------|-----------|
| Mobile | Drag with finger | Pinch out | Pinch in | Tap "Done" / Tap outside |
| Desktop | Click + drag | Scroll up / `+` key | Scroll down / `-` key | Click "Done" / Escape |

---

## 3. Wireframes

### A. Preview Area (Album Mode Selected)

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌──────┐                                         ┌──────┐     │
│  │ ✏️   │  (lyrics edit)               (image)   │ 🖼️   │     │
│  └──────┘                                         └──────┘     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │     ┌───────┐                                          │   │
│  │     │ 🎵    │  Song Title                              │   │
│  │     │ Art   │  Artist Name                             │   │
│  │     └───────┘                                          │   │
│  │                                                         │   │
│  │     "Lyrics line one"                                  │   │
│  │     "Lyrics line two"                                  │   │
│  │                                                         │   │
│  │                         [ALBUM ART BACKGROUND]         │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Effect: [Vignette ▼]     ○────────●────────○  50%     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### B. Image Edit Mode Active

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ╔═══════════════════════════════════════════════════╗   │   │
│  │ ║                                                   ║   │   │
│  │ ║  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   ║   │   │
│  │ ║  │    DRAG AREA (shows full image bounds)   │   ║   │   │
│  │ ║  │                                          │   ║   │   │
│  │ ║  │         ← Drag to reposition →           │   ║   │   │
│  │ ║  │                                          │   ║   │   │
│  │ ║  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   ║   │   │
│  │ ║                                                   ║   │   │
│  │ ╚═══════════════════════════════════════════════════╝   │   │
│  │           ↑ Dashed border indicates edit mode ↑         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │   🔍−  ○──────────●──────────○  🔍+      [ Reset ]     │   │
│  │         Zoom: 120%                                      │   │
│  │                                                         │   │
│  │   Effect: [Vignette ▼]   ○────────●────────○  50%      │   │
│  │                                                         │   │
│  │                    [ ✓ Done ]                           │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Visual Affordances:
• Dashed animated border around card (indicates draggable)
• Slight dim on lyrics text (focus on image)
• Cursor changes to "grab" / "grabbing" on desktop
• Touch feedback on mobile (haptic if available)
```

### C. Mobile Controls Layout

```
┌─────────────────────────────────┐
│         PREVIEW CARD            │
│    (pinch to zoom, drag to      │
│         reposition)             │
│                                 │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │      Album Art BG         │  │
│  │       + Lyrics            │  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
├─────────────────────────────────┤
│                                 │
│  Zoom  [−]  ═══●═══════  [+]   │
│                                 │
│  Effect     [ Vignette  ▼ ]    │
│                                 │
│  Strength   ═══════●═══════    │
│                                 │
│  [ Reset ]          [ Done ]   │
│                                 │
└─────────────────────────────────┘
```

---

## 4. Proposed Effects

### Effect Options (Dropdown/Segmented Control)

| Effect | Description | Controls |
|--------|-------------|----------|
| **Vignette** | Clear center, blurred/darkened edges | Strength (0-100%) |
| **Blur** | Uniform gaussian blur across entire image | Blur amount (0-30px) |
| **Duotone** | Two-color overlay based on image luminosity | Color 1, Color 2 |
| **Gradient Overlay** | Semi-transparent gradient on top | Direction, Color, Opacity |
| **Desaturate** | Reduce color saturation | Saturation (0-100%) |
| **Darken** | Uniform dark overlay | Darkness (0-80%) |
| **Tint** | Single color wash | Color, Intensity |

### Effect Previews

```
┌─────────────────────────────────────────────────────────────────┐
│                        EFFECT SELECTOR                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │Vignette │ │  Blur   │ │ Duotone │ │  Tint   │ │ Darken  │  │
│  │  [img]  │ │  [img]  │ │  [img]  │ │  [img]  │ │  [img]  │  │
│  │    ●    │ │    ○    │ │    ○    │ │    ○    │ │    ○    │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│                                                                 │
│  ← Scroll horizontally for more effects →                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Effect-Specific Controls

```
VIGNETTE:
├── Strength: [slider 0-100%]
└── (uses existing implementation)

BLUR:
├── Amount: [slider 0-30px]
└── Preview updates in real-time

DUOTONE:
├── Shadow Color: [color picker] (default: dark from palette)
├── Highlight Color: [color picker] (default: light from palette)
└── Contrast: [slider 0-100%]

GRADIENT OVERLAY:
├── Direction: [Top→Bottom | Bottom→Top | Left→Right | Radial]
├── Color: [color picker or palette]
└── Opacity: [slider 0-80%]

DESATURATE:
├── Amount: [slider 0-100%]
└── 0% = full color, 100% = grayscale

TINT:
├── Color: [color picker or palette]
└── Intensity: [slider 0-100%]

DARKEN:
└── Amount: [slider 0-80%]
```

---

## 5. State Management

```typescript
interface AlbumArtEditState {
  // Position (as percentage offset from center)
  offsetX: number      // -100 to 100 (% of image width)
  offsetY: number      // -100 to 100 (% of image height)

  // Zoom
  scale: number        // 1.0 to 3.0 (100% to 300%)

  // Effect
  effect: 'vignette' | 'blur' | 'duotone' | 'gradient' | 'desaturate' | 'tint' | 'darken'
  effectSettings: {
    // Vignette
    vignetteStrength?: number    // 0-100

    // Blur
    blurAmount?: number          // 0-30

    // Duotone
    duotoneShadow?: string       // hex color
    duotoneHighlight?: string    // hex color
    duotoneContrast?: number     // 0-100

    // Gradient
    gradientDirection?: 'top' | 'bottom' | 'left' | 'right' | 'radial'
    gradientColor?: string       // hex color
    gradientOpacity?: number     // 0-80

    // Desaturate
    desaturateAmount?: number    // 0-100

    // Tint
    tintColor?: string           // hex color
    tintIntensity?: number       // 0-100

    // Darken
    darkenAmount?: number        // 0-80
  }
}
```

---

## 6. Accessibility

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` | Move between controls |
| `Enter/Space` | Activate button / toggle edit mode |
| `Arrow Keys` | Pan image (when in edit mode) |
| `+` / `-` | Zoom in / out |
| `R` | Reset position and zoom |
| `Escape` | Exit edit mode |

### Screen Reader Announcements

- "Image edit mode. Use arrow keys to pan, plus and minus to zoom."
- "Zoom level: 120 percent"
- "Effect changed to Duotone"
- "Image position reset"

### ARIA Labels

```html
<button aria-label="Edit album art position and zoom">
<input type="range" aria-label="Zoom level" aria-valuemin="100" aria-valuemax="300">
<select aria-label="Select background effect">
```

---

## 7. Implementation Phases

### Phase 1: Core Positioning
1. Add image edit mode toggle (🖼️ button)
2. Implement drag-to-pan with touch/mouse support
3. Implement pinch-to-zoom (mobile) and scroll-to-zoom (desktop)
4. Add zoom slider control
5. Add reset button

### Phase 2: Effects System
1. Refactor vignette as one effect option
2. Add effect selector (horizontal scroll on mobile)
3. Implement Blur effect
4. Implement Darken effect
5. Implement Desaturate effect

### Phase 3: Advanced Effects
1. Implement Duotone effect
2. Implement Tint effect
3. Implement Gradient Overlay effect
4. Add color pickers for relevant effects

---

## 8. Visual Affordances Summary

| State | Visual Indicator |
|-------|------------------|
| Album mode selected | Image button appears next to pencil |
| Image edit mode active | Dashed animated border, dimmed lyrics |
| Dragging | Cursor: grabbing, slight scale pulse |
| At zoom limit | Slider handle hits end, subtle bounce |
| Effect applied | Thumbnail shows effect in selector |

---

## 9. Implementation Notes

### Key Files

| Component | File |
|-----------|------|
| Image edit state | `src/components/share/designer/ShareDesignerStore.ts` |
| Image edit toggle | `src/components/share/ImageEditMode.tsx` |
| Preview with gestures | `src/components/share/designer/ShareDesignerPreview.tsx` |
| Zoom slider | `src/components/share/designer/controls/ZoomSlider.tsx` |
| Effect types & defaults | `src/components/share/effects/index.ts` |
| Effect CSS generation | `src/components/share/effects/applyEffect.ts` |
| Effect selector | `src/components/share/effects/EffectSelector.tsx` |
| Effect thumbnails | `src/components/share/effects/EffectThumbnail.tsx` |
| Effect controls | `src/components/share/effects/AlbumArtEffectControls.tsx` |
| Color picker | `src/components/share/designer/controls/ColorPicker.tsx` |

### State Management

- Extended `EditMode` type to include `"image"` mode
- Added `ImageEditState` with `offsetX`, `offsetY`, `scale` properties
- Added `AlbumArtEffectConfig` with `effect: EffectType` and `settings: EffectSettings`
- Store methods: `setImageOffset()`, `setImageScale()`, `resetImagePosition()`, `isImageEditing()`
- Store methods: `setAlbumArtEffect()`, `setAlbumArtEffectSetting()`
- Hooks: `useShareDesignerImageEdit()`, `useShareDesignerAlbumArtEffect()`

### Effect System

Effects use CSS filters and overlays via `applyEffect()` utility:

| Effect | Implementation |
|--------|----------------|
| Vignette | Radial gradient overlay with opacity |
| Blur | CSS `filter: blur(Npx)` on img element |
| Darken | CSS `filter: brightness(N)` on img element |
| Desaturate | CSS `filter: grayscale(N%)` on img element |
| Tint | Color overlay with `mix-blend-mode: color` |
| Gradient | Linear/radial gradient overlay with color + opacity |
| Duotone | Grayscale + contrast filter with multiply/screen blend overlays |

### Export Compatibility

Album art uses an `<img>` element (not CSS `background-image`) so that CSS `filter` properties work with html-to-image export. Overlay-based effects use `mixBlendMode` which renders correctly in canvas.

### Accessibility

- `useScreenReaderAnnounce` hook provides ARIA live region announcements
- Announces mode changes, zoom level, effect changes, and reset actions
- Haptic feedback via `useHaptic` hook on mode toggle, reset, and zoom limits
