# Share Lyrics Designer - Full Page Layout

> **UX Design Document**
> Converting the modal-based Share Designer to a full-page experience

---

## 1. Overview

### 1.1 Current State
- Modal overlay with `max-w-lg` (512px) constraint
- Two-step flow: select lines → customize
- Limited screen real estate for controls
- Same UI for mobile and desktop

### 1.2 Goals
- **Full-page route** at `/song/[artist]/[track]/share`
- **Desktop**: Side-by-side layout with generous preview canvas
- **Mobile**: Stacked layout with bottom sheet controls
- **Preserve**: Two-step flow, all customization features

### 1.3 Design Principles
1. **Maximize preview space** - The card preview is the star
2. **Progressive disclosure** - Simple defaults, advanced options available
3. **Context preservation** - Easy return to lyrics page
4. **Touch-first mobile** - Gestures and large touch targets

---

## 2. URL Structure

```
/song/[artistSlug]/[trackSlugWithId]/share
                                     ├── ?step=select     (line selection)
                                     └── ?step=customize  (editor)
```

**State preservation via URL:**
- `step`: Current step (select | customize)
- `lines`: Selected line IDs (comma-separated, optional)

**Navigation:**
- Back button → `/song/[artist]/[track]` (lyrics page)
- Browser back → Previous step or lyrics page

---

## 3. User Flows

### 3.1 Entry Points

```
┌─────────────────────────────────────────────────────────┐
│                    LYRICS PAGE                          │
│                                                         │
│  Entry Point 1: Share button in action bar              │
│  ───────────────────────────────────────                │
│  → Navigates to /share?step=select                      │
│                                                         │
│  Entry Point 2: Long-press lyric → "Share" option       │
│  ───────────────────────────────────────                │
│  → Navigates to /share?step=select&lines=id1,id2        │
│     (pre-selects the pressed lines)                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Main Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   LYRICS     │     │    SELECT    │     │  CUSTOMIZE   │
│    PAGE      │────▶│    LINES     │────▶│   & EXPORT   │
│              │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
       ▲                    │                    │
       │                    │                    │
       └────────────────────┴────────────────────┘
                    Back navigation
```

---

## 4. Wireframes

### 4.1 Desktop - Line Selection (≥1024px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Back to lyrics                    Share Lyrics                            │
│  ─────────────────────────────────────────────────────────────────────────── │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────┐  ┌──────────────────────────┐ │
│   │                                         │  │                          │ │
│   │           LIVE PREVIEW                  │  │   SELECT LYRICS          │ │
│   │                                         │  │                          │ │
│   │   ┌─────────────────────────────────┐   │  │   Tap lines to include   │ │
│   │   │                                 │   │  │   in your card           │ │
│   │   │     ╔═════════════════════╗     │   │  │                          │ │
│   │   │     ║  🎵  Song Title     ║     │   │  │   ┌──────────────────┐   │ │
│   │   │     ║      Artist Name    ║     │   │  │   │ ☐ First line... │   │ │
│   │   │     ║                     ║     │   │  │   ├──────────────────┤   │ │
│   │   │     ║  "Selected lyrics   ║     │   │  │   │ ☑ Second line..│   │ │
│   │   │     ║   appear here"      ║     │   │  │   ├──────────────────┤   │ │
│   │   │     ║                     ║     │   │  │   │ ☑ Third line...│   │ │
│   │   │     ╚═════════════════════╝     │   │  │   ├──────────────────┤   │ │
│   │   │                                 │   │  │   │ ☐ Fourth line.. │   │ │
│   │   └─────────────────────────────────┘   │  │   ├──────────────────┤   │ │
│   │                                         │  │   │ ☐ Fifth line... │   │ │
│   │                                         │  │   └──────────────────┘   │ │
│   │                                         │  │                          │ │
│   │                                         │  │   [scrollable list]      │ │
│   └─────────────────────────────────────────┘  │                          │ │
│                                                │                          │ │
│                                                │  ┌──────────────────────┐│ │
│                                                │  │    Continue →        ││ │
│                                                │  │    (2 lines selected)││ │
│                                                │  └──────────────────────┘│ │
│                                                └──────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Layout: 60% preview (left) | 40% selection panel (right)
Header: 56px fixed
Content: calc(100vh - 56px)
```

### 4.2 Desktop - Customize View (≥1024px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Back                              Share Lyrics            [Copy] [Save] ▼ │
│  ─────────────────────────────────────────────────────────────────────────── │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────┐  ┌──────────────────────────┐ │
│   │                                         │  │                          │ │
│   │           CANVAS PREVIEW                │  │  ┌────────────────────┐  │ │
│   │                                         │  │  │ 📐 Templates    ▾  │  │ │
│   │   ┌─────────────────────────────────┐   │  │  ├────────────────────┤  │ │
│   │   │  [Edit ✏️]           [Resize ↔️] │   │  │  │ ┌──┐┌──┐┌──┐┌──┐  │  │ │
│   │   │                                 │   │  │  │ │  ││  ││  ││  │  │  │ │
│   │   │     ╔═════════════════════╗     │   │  │  │ └──┘└──┘└──┘└──┘  │  │ │
│   │   │     ║  🎵  Song Title     ║     │   │  │  └────────────────────┘  │ │
│   │   │     ║      Artist Name    ║     │   │  │                          │ │
│   │   │     ║                     ║     │   │  │  ┌────────────────────┐  │ │
│   │   │     ║  "And in the end   ║     │   │  │  │ 📏 Layout       ▾  │  │ │
│   │   │     ║   the love you     ║     │   │  │  ├────────────────────┤  │ │
│   │   │     ║   take..."         ║     │   │  │  │ Aspect: [1:1]      │  │ │
│   │   │     ║                     ║     │   │  │  │ Padding: ○────●── │  │ │
│   │   │     ╚═════════════════════╝     │   │  │  └────────────────────┘  │ │
│   │   │                                 │   │  │                          │ │
│   │   └─────────────────────────────────┘   │  │  ┌────────────────────┐  │ │
│   │                                         │  │  │ 🎨 Background   ▾  │  │ │
│   │   Zoom: [─●───] 85%    [Fit] [100%]    │  │  ├────────────────────┤  │ │
│   │                                         │  │  │ [collapsed]        │  │ │
│   └─────────────────────────────────────────┘  │  └────────────────────┘  │ │
│                                                │                          │ │
│                                                │  ┌────────────────────┐  │ │
│                                                │  │ ✏️ Typography    ▾  │  │ │
│                                                │  ├────────────────────┤  │ │
│                                                │  │ [collapsed]        │  │ │
│                                                │  └────────────────────┘  │ │
│                                                │                          │ │
│                                                │  ┌────────────────────┐  │ │
│                                                │  │ 🧩 Elements     ▾  │  │ │
│                                                │  └────────────────────┘  │ │
│                                                │                          │ │
│                                                │  ┌────────────────────┐  │ │
│                                                │  │ ✨ Effects      ▾  │  │ │
│                                                │  └────────────────────┘  │ │
│                                                │                          │ │
│                                                │  ┌──────────────────────┐│ │
│                                                │  │  📤 Share            ││ │
│                                                │  └──────────────────────┘│ │
│                                                └──────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Layout: 60% preview (left) | 40% control panel (right)
Control panel: Scrollable with accordion sections
Export actions: In header (desktop) for quick access
```

### 4.3 Mobile - Line Selection (<1024px)

```
┌─────────────────────────────────────┐
│  ←  Share Lyrics                    │  ← Header (56px)
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  │     LIVE PREVIEW            │   │  ← Preview (40% height)
│  │                             │   │
│  │   ╔═══════════════════╗     │   │
│  │   ║  "Selected..."    ║     │   │
│  │   ╚═══════════════════╝     │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  Select lyrics to share             │  ← Instruction
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ☐ First lyric line here    │   │  ← Scrollable list
│  ├─────────────────────────────┤   │
│  │ ☑ Second lyric line here   │   │
│  ├─────────────────────────────┤   │
│  │ ☑ Third lyric line here    │   │
│  ├─────────────────────────────┤   │
│  │ ☐ Fourth lyric line here   │   │
│  ├─────────────────────────────┤   │
│  │ ☐ Fifth lyric line here    │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │  ← Sticky footer
│  │      Continue →             │   │
│  │      2 lines selected       │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘

Header: 56px fixed
Preview: ~35-40% of remaining height
List: Flexible, scrollable
Footer: 80px fixed with safe area
```

### 4.4 Mobile - Customize View (<1024px)

```
┌─────────────────────────────────────┐
│  ←  Customize                 [⋮]  │  ← Header with overflow menu
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │  [✏️]                  [↔️] │   │
│  │                             │   │
│  │   ╔═══════════════════╗     │   │  ← Preview (scales to fit)
│  │   ║  🎵 Song Title    ║     │   │
│  │   ║     Artist        ║     │   │
│  │   ║                   ║     │   │
│  │   ║  "Lyrics here..." ║     │   │
│  │   ║                   ║     │   │
│  │   ╚═══════════════════╝     │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  │ Templates │ Style │ Export │    │  ← Tab bar
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │  ← Bottom sheet (draggable)
│  │  ─────  (drag handle)       │   │
│  │                             │   │
│  │  [Template thumbnails...]   │   │  ← Tab content
│  │                             │   │
│  │  ┌──┐ ┌──┐ ┌──┐ ┌──┐       │   │
│  │  │  │ │  │ │  │ │  │ →     │   │
│  │  └──┘ └──┘ └──┘ └──┘       │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  ┌───────┐ ┌───────┐ ┌───────────┐ │  ← Sticky export bar
│  │ Copy  │ │ Save  │ │  Share    │ │
│  └───────┘ └───────┘ └───────────┘ │
└─────────────────────────────────────┘

Header: 56px fixed
Preview: Flexible (min 200px)
Tab bar: 48px
Bottom sheet: Expandable (peek: 200px, full: 60%)
Export bar: 64px + safe area
```

### 4.5 Mobile - Bottom Sheet Expanded

```
┌─────────────────────────────────────┐
│  ←  Customize                 [⋮]  │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │  ← Preview (compressed)
│  │   ╔═══════════════════╗     │   │
│  │   ║  (mini preview)   ║     │   │
│  │   ╚═══════════════════╝     │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│  │ Templates │ Style │ Export │    │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │  ─────  (drag to collapse)  │   │
│  │                             │   │
│  │  ┌─────────────────────┐   │   │
│  │  │ 📏 Layout           │   │   │
│  │  ├─────────────────────┤   │   │
│  │  │ Aspect Ratio        │   │   │
│  │  │ [1:1] [9:16] [4:5]  │   │   │
│  │  │                     │   │   │
│  │  │ Padding       24px  │   │   │
│  │  │ ○────────●──────○   │   │   │
│  │  └─────────────────────┘   │   │
│  │                             │   │
│  │  ┌─────────────────────┐   │   │
│  │  │ 🎨 Background       │   │   │
│  │  ├─────────────────────┤   │   │
│  │  │ Type                │   │   │
│  │  │ ○Solid ●Gradient    │   │   │
│  │  │ ○Album ○Pattern     │   │   │
│  │  │                     │   │   │
│  │  │ [gradient swatches] │   │   │
│  │  └─────────────────────┘   │   │
│  │                             │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│  ┌───────┐ ┌───────┐ ┌───────────┐ │
│  │ Copy  │ │ Save  │ │  Share    │ │
│  └───────┘ └───────┘ └───────────┘ │
└─────────────────────────────────────┘

Bottom sheet gestures:
- Drag handle to expand/collapse
- Swipe down to collapse
- Tap outside to collapse
- Sheet has 3 states: peek (200px), half (50%), full (85%)
```

---

## 5. Component Specifications

### 5.1 Page Header

```typescript
interface ShareDesignerHeaderProps {
  readonly step: "select" | "customize"
  readonly title: string
  readonly artist: string
  readonly onBack: () => void
  readonly exportActions?: ExportActions // Only in customize step
}

// Desktop: Full header with export buttons visible
// Mobile: Compact header with overflow menu for exports
```

**Desktop Header:**
```
┌──────────────────────────────────────────────────────────────────┐
│  [←]  Share Lyrics                          [Copy] [Save] [Share]│
│       Song Title - Artist                                        │
└──────────────────────────────────────────────────────────────────┘
Height: 56px
Back button: 40×40px
Export buttons: 36px height, icon + label
```

**Mobile Header:**
```
┌─────────────────────────────────────┐
│  [←]  Share Lyrics            [⋮]  │
└─────────────────────────────────────┘
Height: 56px
Back: 40×40px
Overflow: Opens action sheet with Copy/Save/Share
```

### 5.2 Preview Canvas Container

```typescript
interface PreviewCanvasProps {
  readonly children: ReactNode // ShareDesignerPreview
  readonly onEditToggle: () => void
  readonly onWidthToggle: () => void
  readonly isEditing: boolean
  readonly expandedWidth: boolean
}

// Features:
// - Auto-scales preview to fit container
// - Checkered/neutral background to show card bounds
// - Floating action buttons (edit, resize)
// - Zoom controls (desktop only)
```

**Styling:**
```css
.preview-container {
  background: #1a1a1a; /* Neutral dark, not theme surface */
  border-radius: var(--radius-lg);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
```

### 5.3 Control Panel (Desktop)

```typescript
interface ControlPanelDesktopProps {
  readonly store: ShareDesignerStore
  readonly defaultSection?: string
}

// Accordion-style sections
// All sections collapsible
// One section expanded at a time (optional)
// Sticky section headers during scroll
```

**Section Layout:**
```
┌────────────────────────────────┐
│ ▾ Templates                    │ ← Section header (48px, clickable)
├────────────────────────────────┤
│                                │
│   [template grid content]      │ ← Section content (variable)
│                                │
├────────────────────────────────┤
│ ▸ Layout                       │ ← Collapsed section
├────────────────────────────────┤
│ ▸ Background                   │
├────────────────────────────────┤
│ ▸ Typography                   │
├────────────────────────────────┤
│ ▸ Elements                     │
├────────────────────────────────┤
│ ▸ Effects                      │
└────────────────────────────────┘
```

### 5.4 Bottom Sheet (Mobile)

```typescript
interface BottomSheetProps {
  readonly children: ReactNode
  readonly peekHeight: number // Default: 200
  readonly halfHeight: string // Default: "50%"
  readonly fullHeight: string // Default: "85%"
  readonly currentState: "peek" | "half" | "full"
  readonly onStateChange: (state: "peek" | "half" | "full") => void
}

// Gestures:
// - Drag handle to resize
// - Velocity-based snap to nearest state
// - Tap backdrop (when full) to collapse
```

**Visual:**
```
┌─────────────────────────────────┐
│         ════════                │ ← Drag handle (40×4px, centered)
│                                 │
│   [tab content]                 │
│                                 │
└─────────────────────────────────┘

Drag handle: 40×4px rounded pill
Background: var(--color-surface1)
Border-radius: 16px 16px 0 0 (top corners only)
Shadow: 0 -4px 20px rgba(0,0,0,0.3)
```

### 5.5 Mobile Tab Bar

```typescript
interface TabBarProps {
  readonly tabs: readonly {
    readonly id: string
    readonly label: string
    readonly icon: ReactNode
  }[]
  readonly activeTab: string
  readonly onChange: (tabId: string) => void
}

// Tabs:
// 1. Templates (grid icon)
// 2. Style (sliders icon) - combines Layout, Background, Typography
// 3. Export (share icon) - combines Elements, Effects, Export settings
```

**Visual:**
```
┌───────────┬───────────┬───────────┐
│ Templates │   Style   │  Export   │
│    📐     │    🎨     │    📤     │
└───────────┴───────────┴───────────┘
Height: 48px
Active indicator: Accent color underline (2px)
Touch target: Full tab width × 48px
```

### 5.6 Export Action Bar (Mobile)

```typescript
interface ExportActionBarProps {
  readonly onCopy: () => void
  readonly onSave: () => void
  readonly onShare: () => void
  readonly isGenerating: boolean
  readonly isCopied: boolean
}
```

**Visual:**
```
┌─────────────────────────────────────┐
│  ┌───────┐ ┌───────┐ ┌───────────┐ │
│  │ 📋    │ │ ⬇️    │ │ 📤 Share  │ │
│  │ Copy  │ │ Save  │ │           │ │
│  └───────┘ └───────┘ └───────────┘ │
│                                     │
└─────────────────────────────────────┘
Height: 64px + safe area inset
Copy/Save: Secondary style, 1/4 width each
Share: Primary style (accent), 1/2 width
```

---

## 6. Responsive Behavior

### 6.1 Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 768px | Stacked, bottom sheet |
| Tablet | 768-1023px | Stacked, larger preview |
| Desktop | ≥ 1024px | Side-by-side (60/40) |
| Wide | ≥ 1440px | Side-by-side (65/35) |

### 6.2 Layout Transitions

```typescript
// Responsive layout hook
function useShareDesignerLayout() {
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const isWide = useMediaQuery("(min-width: 1440px)")

  return {
    layout: isDesktop ? "side-by-side" : "stacked",
    previewRatio: isWide ? 0.65 : isDesktop ? 0.6 : 1,
    controlsRatio: isWide ? 0.35 : isDesktop ? 0.4 : 1,
  }
}
```

### 6.3 Component Adaptations

| Component | Mobile | Desktop |
|-----------|--------|---------|
| Header | Compact + overflow menu | Full with export buttons |
| Preview | Top section, ~40% height | Left panel, 60% width |
| Controls | Bottom sheet (draggable) | Right panel (scrollable) |
| Tabs | 3-tab bar | Accordion sections |
| Export | Sticky bottom bar | Header buttons |

---

## 7. Interaction Patterns

### 7.1 Navigation

| Action | Result |
|--------|--------|
| Back button | Return to lyrics page |
| Browser back | Previous step or lyrics page |
| Escape key | Back (if no modal open) |

### 7.2 Line Selection

| Action | Result |
|--------|--------|
| Tap line | Toggle selection |
| Long-press line | Toggle + haptic feedback |
| Continue button | Navigate to customize step |

### 7.3 Customization

| Action | Result |
|--------|--------|
| Tap template | Apply template |
| Adjust slider | Live preview update |
| Tap color swatch | Apply color |
| Edit button (preview) | Enter text edit mode |
| Resize button | Toggle card width |

### 7.4 Mobile Gestures

| Gesture | Target | Result |
|---------|--------|--------|
| Swipe up | Bottom sheet | Expand |
| Swipe down | Bottom sheet | Collapse |
| Drag | Sheet handle | Resize sheet |
| Pinch | Preview | Zoom (future) |

### 7.5 Keyboard Shortcuts (Desktop)

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + C` | Copy image |
| `Cmd/Ctrl + S` | Download image |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Escape` | Back / Close |
| `1-9` | Apply template N |

---

## 8. Accessibility

### 8.1 Focus Management

- **Page load**: Focus on first interactive element (back button)
- **Step change**: Focus on step heading
- **Modal open**: Focus trap within modal
- **Bottom sheet**: Focus on first control when expanded

### 8.2 Screen Reader Announcements

```typescript
// Live region announcements
"2 lines selected" // On selection change
"Template applied: Minimal" // On template change
"Image copied to clipboard" // On copy
"Generating image..." // During export
```

### 8.3 ARIA Labels

```tsx
<button aria-label="Go back to lyrics page">←</button>
<button aria-label="Copy image to clipboard">Copy</button>
<button aria-label={`Select line: ${lineText}`}>...</button>
<div role="tablist" aria-label="Customization options">...</div>
```

### 8.4 Color Contrast

All UI follows existing ScrollTunes design system which meets WCAG 2.1 AA:
- Text on surface: 16.8:1 (AAA)
- Text2 on surface: 11.2:1 (AAA)
- Accent on surface: 5.8:1 (AA)

---

## 9. State Management

### 9.1 URL State

```typescript
interface URLState {
  step: "select" | "customize"
  lines?: string // Comma-separated IDs (optional persistence)
}

// Read on mount, update on navigation
const searchParams = useSearchParams()
const step = searchParams.get("step") ?? "select"
```

### 9.2 Component State

```typescript
// ShareDesignerPage state
interface PageState {
  step: "select" | "customize"
  selectedLineIds: Set<string>
  store: ShareDesignerStore | null // Created when entering customize
}

// Mobile-specific
interface MobileState {
  sheetState: "peek" | "half" | "full"
  activeTab: "templates" | "style" | "export"
}
```

### 9.3 Store Integration

Existing `ShareDesignerStore` remains unchanged. Page component:
1. Creates store when entering customize step
2. Passes store to child components
3. Store handles all customization state

---

## 10. Implementation Notes

### 10.1 File Structure

```
src/app/song/[artistSlug]/[trackSlugWithId]/share/
├── page.tsx              # Main page component
├── layout.tsx            # Optional: specific layout
└── components/
    ├── ShareDesignerPage.tsx      # Main orchestrator
    ├── ShareDesignerHeader.tsx    # Responsive header
    ├── LineSelectionView.tsx      # Step 1 content
    ├── CustomizeView.tsx          # Step 2 content
    ├── PreviewCanvas.tsx          # Preview container
    ├── ControlPanelDesktop.tsx    # Desktop controls
    ├── BottomSheet.tsx            # Mobile sheet
    ├── MobileTabBar.tsx           # Mobile tabs
    └── ExportActionBar.tsx        # Mobile export bar
```

### 10.2 Migration Path

1. Create new route structure
2. Extract reusable components from existing ShareDesigner.tsx
3. Build responsive layout containers
4. Wire up navigation between lyrics page and share page
5. Test on mobile and desktop
6. Remove modal-based implementation

### 10.3 Data Flow

```
LyricsPage
    │
    ├── "Share" button click
    │       ↓
    └── router.push(`/song/${artist}/${track}/share?step=select`)
            ↓
        ShareDesignerPage
            │
            ├── step=select: LineSelectionView
            │       ↓ (Continue)
            └── step=customize: CustomizeView
                    │
                    ├── Desktop: ControlPanelDesktop
                    └── Mobile: BottomSheet + MobileTabBar
```

---

## 11. Design Tokens Reference

```css
/* From globals.css - relevant tokens */
--color-bg: #070A12;
--color-surface1: #0C1220;
--color-surface2: #111A2C;
--color-text: #F3F5F7;
--color-text2: rgba(243, 245, 247, 0.72);
--color-text3: rgba(243, 245, 247, 0.46);
--color-accent: #5B6CFF;
--color-accent-soft: rgba(91, 108, 255, 0.14);
--color-border: rgba(255, 255, 255, 0.10);
--radius-lg: 18px;
--radius-xl: 24px;
```

---

*Document version: 1.0*
*Created: 2025-01-06*
*Author: UX Designer (Claude)*
