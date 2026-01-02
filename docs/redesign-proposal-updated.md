# ScrollTunes Award-Winning Redesign Proposal

> **Vision**: Treat the app as a "performance instrument"—ultra-legible, dark-first, thumb-optimized, with subtle audio-reactive ambience that never competes with lyrics.

## Table of Contents

1. [Visual Identity](#1-visual-identity--look-and-feel)
2. [Theme System](#2-theme-system)
3. [Mobile-First UX](#3-mobile-first-ux)
4. [Animations & Effects](#4-animations--effects)
5. [Background Animations](#5-subtle-background-animations-togglable)
6. [Layout & Navigation](#6-layout--navigation) *(includes Lyrics Share)*
7. [Responsive Breakpoints](#7-responsive-breakpoints)
8. [Award-Winning Differentiators](#8-award-winning-differentiators)
9. [Implementation Path](#9-implementation-path)

---

## 1. Visual Identity & Look and Feel

### 1.1 Color Palette Evolution

Keep the indigo DNA but modernize with a "stage lighting" system:

| Token | Current | Proposed | Purpose |
|-------|---------|----------|---------|
| `background` | `#0a0a0a` | `#050509` | Deeper stage dark with blue undertone |
| `backgroundElevated` | `#171717` | `#111827` | Cards, modals, elevated surfaces |
| `backgroundSubtle` | — | `#020617` | OLED-friendly variant |
| `backgroundOLED` | — | `#000000` | True black for OLED screens |
| `borderSubtle` | — | `#1f2937` | Subtle dividers |
| `primary` | `#6366f1` | Keep | Brand continuity (indigo) |
| `primarySoft` | — | `rgba(99, 102, 241, 0.14)` | Chip backgrounds, focus rings |
| `primaryBright` | `#8b5cf6` | `#818cf8` | Active states, indicators |
| `accentChord` | — | `#fbbf24` | Amber/gold for chord display |
| `accentSuccess` | — | `#22c55e` | Voice synced, success states |
| `accentWarning` | — | `#fbbf24` | Warnings, tempo indicators |
| `accentDanger` | — | `#f97373` | Errors, destructive actions |

**Background glow examples:**
```css
/* Subtle gradient for depth */
background: radial-gradient(circle at 10% -20%, #6366f122, transparent 55%),
            radial-gradient(circle at 110% 120%, #8b5cf622, transparent 60%);
```

### 1.2 Typography

Priorities: legibility at 1–2 meters, good hinting on mobile, neutral aesthetics.

**Font Stack:**
- UI & labels: `Geist Sans` (existing) or `Inter` as fallback
- Lyrics: Same sans-serif for maximum legibility (no decorative fonts)

**Size Scale:**

| Element | Phone Portrait | Phone Landscape | Tablet |
|---------|---------------|-----------------|--------|
| Current lyric line | 24–28px | 28–32px | 32–36px |
| Next/previous lines | 18–20px | 20–22px | 22–24px |
| UI labels | 14–15px | 14–15px | 15–16px |
| Chords | 14–16px bold | 16–18px bold | 18–20px bold |

**Weight System:**
- Current line: `font-semibold`
- Next line: `font-medium`
- Past lines: `font-normal` + reduced opacity (40–50%)
- Chords: `font-bold` + `tracking-wide` (`letter-spacing: 0.03em`)

**Line height:** 1.3–1.4 for lyrics (avoid cramped lines)

### 1.3 Visual Hierarchy & Spacing

Use a consistent 4/8px scale:

| Token | Value | Usage |
|-------|-------|-------|
| `spacing.xs` | 4px | Tight gaps |
| `spacing.sm` | 8px | Between lyric lines |
| `spacing.md` | 16px | Component padding |
| `spacing.lg` | 24px | Section gaps |
| `spacing.xl` | 32px | Major section breaks |

**Performance View Zones:**
- Zone 1 (80%): Lyrics pane — the star
- Zone 2 (20%): Minimal controls strip anchored bottom
- Everything else (metadata, progress): Fainter & peripheral

**Visual Devices:**
- "Reading rail": Faint vertical gradient behind current line to anchor gaze
- Soft pill behind active line for stage clarity (not a hard card)
- Current line placed at ~25% from top (comfortable reading position)

---

### 1.4 Studio Pro Dark Visual Language (Theme A)

The redesign should ship with a **more professional, “pro tool” aesthetic** (less “neon concept app”, more “stage equipment UI”).

**Core principles**
- **Calm surfaces, disciplined accent**: neutral dark surfaces; one indigo accent for primary focus and actions.
- **No glow soup**: prefer subtle borders + soft shadows over neon glows/inner glows.
- **Curated gradients only**: gradients are reserved for *Lyrics Share cards* (2–3 presets), not for core navigation.
- **Predictable rhythm**: strict 8pt grid; consistent padding and component sizing.
- **One icon language**: use a consistent line icon set (Lucide/SF Symbols style), no emojis.

#### 1.4.1 Studio Pro Dark tokens (source of truth)

These tokens match the delivered mockups (Studio Pro Dark pack). Store in `tokens.json` and generate CSS variables / TS theme from it.

```json
{
  "colors": {
    "bg": "#070A12",
    "surface1": "#0C1220",
    "surface2": "#111A2C",
    "surface3": "#151F33",
    "border": "rgba(255,255,255,0.10)",
    "borderStrong": "rgba(255,255,255,0.16)",
    "text": "#F3F5F7",
    "text2": "rgba(243,245,247,0.72)",
    "text3": "rgba(243,245,247,0.46)",
    "accent": "#5B6CFF",
    "accentHover": "#6F7DFF",
    "success": "#22C55E",
    "warning": "#FBBF24",
    "danger": "#FB7185"
  },
  "radius": { "sm": 10, "md": 14, "lg": 18, "xl": 24 },
  "type": { "ui": "Inter" },
  "spacing": { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32 }
}
```

#### 1.4.2 Typography rules (professional hierarchy)
- UI font: **Inter** (fallback to system font stack).
- Keep weights predictable: 600–900 only where needed.
- Lyric emphasis:
  - Active line: 900 (or 800), larger size, higher opacity
  - Neighbor lines: 600–700, reduced opacity
- Avoid mixed styles inside one line unless doing Karaoke word timing.

#### 1.4.3 Component styling rules
- **Cards**: surface fill + subtle border; shadow only for elevated modals/preview cards.
- **Buttons**:
  - Primary: `accent` (solid or soft fill), clear hover/pressed states
  - Secondary: `surface1/surface2` with `border`
- **Dividers**: use `border` opacity, not hard lines.
- **Highlight**: active lyric uses *tint + slim indicator bar* (left rail), not a giant glowing pill.

---


## 2. Theme System

Replace the filter-based light mode with proper variable-driven themes.

### 2.1 Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Base Mode        Performance Theme    Accessibility   │
│  ───────────      ─────────────────    ─────────────   │
│  • Dark           • Stage Mode         • High Contrast │
│  • OLED Black     • Practice Mode      • Large Text    │
│  • Light          • Karaoke Mode       • Reduced Motion│
└─────────────────────────────────────────────────────────┘
```

Themes are composed: Base Mode + Performance Theme + Accessibility overrides.

### 2.2 Base Modes

**Dark (default):**
```css
:root.dark {
  --background: #050509;
  --foreground: #e5e7eb;
  --surface: #111827;
  --border: #1f2937;
}
```

**OLED Black:**
```css
:root.oled {
  --background: #000000;
  --foreground: #f9fafb;
  --surface: #0a0a0a;
  --border: #171717;
}
```
- Reduce drop shadows, increase inner glows and outlines instead

**Light (true light, no filter inversion):**
```css
:root.light {
  --background: #f9fafb;
  --foreground: #111827;
  --surface: #e5e7eb;
  --border: #d1d5db;
}
```

### 2.3 Performance Themes

Expose "Performance Theme" in Settings & quick toggle from song view.

**Stage Mode (default for live):**
- OLED/dark background
- High contrast, minimal chrome
- Animations: subtle, low amplitude
- Auto-enable wake lock
- Hide status bar/URL chrome (PWA full-screen)
- Controls auto-hide after 3 seconds of inactivity

**Practice Mode:**
- More information visible:
  - Timeline scrubber
  - Tap targets for jumping sections
  - Metronome & chord diagrams always visible
- Softer background gradients
- More visible controls
- Word timing toggle accessible

**Karaoke Mode:**
- Large typography, centered layout
- Dual-line display (current + next)
- Per-word highlight with sweep animation
- More vibrant colors allowed
- Optional bouncing-ball animation for word timing
- Full-screen optimized

#### 2.3.1 Stage (Perform) vs Practice: product-level differences

These are **two distinct modes**, not cosmetic skins.

**Stage / Perform Mode**
- Goal: *don’t miss the next line under pressure.*
- UI: lyrics-first, minimal chrome, accidental-tap resistant controls.
- Behaviors:
  - conservative auto-scroll + stable layout
  - keep screen awake (wake lock)
  - optional “LIVE” listening indicator
  - avoid any tool panels that demand attention

**Practice Mode**
- Goal: *learn, repeat, and control the song.*
- UI: exposes rehearsal tools without harming lyric readability.
- Tools:
  - timeline scrub + optional A–B loop region
  - section chips (Intro / Verse / Chorus / Solo…) for jumping
  - chords: inline + diagrams on demand + “next chord” preview
  - metronome + count-in (optional)
  - tempo % and pitch shift (optional, if audio pipeline supports)

**Implementation note (important)**
Treat this as a capability switch:
- Stage: `playback + minimal navigation + share`
- Practice: `playback + navigation + timeline + loops + learning aids`

Keep **mode state** separate:
- Stage state: position, scroll speed, active line, minimal preferences
- Practice state: loop bounds, section selection, tempo/pitch overrides, chord visibility, metronome state

This prevents the codebase from turning into a toggle-driven spaghetti tragedy.

---

### 2.4 Accessibility Presets

Stacked atop base modes:

**High Contrast:**
- Force text to pure white on pure black (dark) or black on white (light)
- Outline current line with clear border + inner glow
- Increase border visibility

**Large Text:**
- Global `fontScale` preference (1.0x, 1.25x, 1.5x, 2.0x)
- Remaps all `fontSize` options proportionally

**Reduced Motion:**
- Respect `prefers-reduced-motion` media query
- Swap spring animations to simple fades
- Disable background animations
- Disable complex page transitions

**Colorblind-friendly:**
- Non-reliance on color alone
- Underlines/different font weights for chords vs lyrics
- Metronome pulse uses both color AND scale

---

## 3. Mobile-First UX

### 3.1 Touch Gestures

Design for "anywhere" taps so users don't hunt for buttons.

**Global Performance Gestures:**

| Gesture | Action |
|---------|--------|
| Double-tap anywhere | Toggle play/pause scrolling |
| Triple-tap anywhere | Restart song from first line |
| Long-press current line | Open quick controls (tempo, jump to section) |
| Swipe left from edge | Previous song in setlist |
| Swipe right from edge | Next song in setlist |
| Small upward flick (center) | Nudge scroll faster |
| Small downward flick (center) | Nudge scroll slower |

### 3.2 Thumb-Zone Layout (Portrait)

```
┌─────────────────────────────┐
│  ← Back  Song Title   🎤⚡ │  ← Top bar (6–8% height)
├─────────────────────────────┤
│                             │
│     ♪ previous line...      │  ← Dimmed (30–40% opacity)
│                             │
│  ┌─────────────────────────┐│
│  │ ► CURRENT LYRIC LINE ◄ ││  ← 25% from top, spotlight
│  └─────────────────────────┘│
│                             │
│     next line coming...     │  ← Slightly dimmed (70%)
│     and the one after...    │  ← More dimmed (50%)
│                             │
│                             │  ← Lyrics zone (~80%)
│                             │
├─────────────────────────────┤
│                             │
│   ⏪    [ ▶ PLAY ]    ⏩   │  ← Control strip (12–14%)
│  tempo       ●       mode   │
│                             │
└─────────────────────────────┘
```

**Control Strip Details:**
- Center: Large circular play/pause button (56×56px minimum)
- Left: Tempo/speed indicator with tap to adjust
- Right: Mode toggle (Stage/Practice)
- Overflow "•••" for quick settings (font size, chords, metronome)

### 3.3 Landscape Layout (Phone on Stand)

```
┌──────────────────────────────────────────────────┐
│  ← Back   "Song Title - Artist"      🎤 ⚡ 🔋   │
├────────────────────────────────┬─────────────────┤
│                                │                 │
│   previous line...             │   Chord: Am     │
│                                │   ┌─────────┐   │
│   ► CURRENT LYRIC LINE ◄       │   │  ●   ●  │   │
│                                │   │    ●    │   │
│   next line...                 │   │  ●      │   │
│   another line...              │   └─────────┘   │
│                                │                 │
│                                │   Next: F       │
│                                │                 │
├────────────────────────────────┴─────────────────┤
│        ⏪      [ ▶ ]      ⏩        80% tempo    │
└──────────────────────────────────────────────────┘
```

- Left 65–70%: Lyrics
- Right 30–35%: Chord diagrams, metronome, next song preview
- Text slightly larger (increased viewing distance)

### 3.4 Hands-Free Experience

- **Auto-hide**: Everything except lyrics hides after 3 seconds without touch
- **Wake overlay**: Tiny, low-contrast hints at edges
  - Faint play/pause glyph at bottom-center hinting double-tap
- **Voice cue visual**: When VAD is armed vs triggered
  - Thin pulsing line or small mic icon near top (not central)
- **Wake lock**: Prevent screen dimming during performance

---

## 4. Animations & Effects

Build on existing `animations.ts` infrastructure.

### 4.1 New Spring Presets

```typescript
// Add to animations.ts
export const springs = {
  // ... existing springs ...
  
  // Spotlight effect for active lyric line
  spotlight: {
    type: "spring" as const,
    stiffness: 300,
    damping: 22,
    mass: 0.6,
  },
  
  // Subtle background transitions
  ambient: {
    type: "spring" as const,
    stiffness: 80,
    damping: 20,
    mass: 1.2,
  },
  
  // Quick micro-interactions
  micro: {
    type: "spring" as const,
    stiffness: 500,
    damping: 35,
  },
}
```

### 4.2 Micro-Interactions

**Buttons:**
- Tap: `scale: 1 → 0.95 → 1` with `springs.micro`
- Active: Soft glow using `box-shadow: theme.shadow.glow`
- Focus: Ring with `primarySoft` color

**Toggles/Chips:**
- State change: `timing.fade` (200ms)
- Slide toggle knob: `springs.default`

**Icons:**
- Mic listening: Gentle pulse with `timing.pulse`
- Success: Brief scale bounce with `springs.bouncy`

### 4.3 Page Transitions

**Between main views (Home → Song, Song → Settings):**
- Crossfade + slight vertical translation (`y: 10 → 0`)
- Duration: 200ms with `timing.fade`
- In Stage Mode: Even more subtle or disabled

**Overlay modals (search, setlist picker):**
- Fade backdrop (opacity 0 → 0.8)
- Slide-up panel with `springs.default`
- Dismiss: Reverse animation

### 4.4 Lyric Highlight Animation

**Active Line Spotlight:**
```typescript
// On line activation
const activeLineAnimation = {
  // Background pill
  background: {
    opacity: [0, 1],
    scaleY: [0.96, 1],
    transition: springs.spotlight,
  },
  // Text color
  color: {
    from: "var(--text-secondary)",
    to: "var(--text-primary)",
    transition: timing.fade,
  },
}
```

**Word Painting (Karaoke Mode):**
- Color sweep from muted → white
- Timing based on `wordTimings` data
- Soft wash effect, not harsh transitions

**Reading Rail:**
- Faint vertical gradient behind current line
- Subtle glow that follows active position
- Opacity: 10–15%

### 4.5 Loading States

**Lyrics Loading:**
```
┌─────────────────────────────┐
│                             │
│   ░░░░░░░░░░░░░░░░░░░      │  ← Shimmer animation
│   ░░░░░░░░░░░░░            │
│   ░░░░░░░░░░░░░░░░░        │
│   ░░░░░░░░░░░░             │
│   ░░░░░░░░░░░░░░░          │
│   ░░░░░░░░░░               │
│                             │
│   "Listening for your      │
│    first note..."          │
│                             │
└─────────────────────────────┘
```

- 6–8 gray bars with randomized widths
- Shimmer background using `timing.pulse`
- Hint text when VAD is armed

---

## 5. Subtle Background Animations (Togglable)

**Key Principle:** Background should fade from awareness within seconds.

### 5.1 Ambient Effects

**Soft Gradient Wash:**
```css
.ambient-gradient {
  background: 
    radial-gradient(circle at 10% -20%, #6366f115, transparent 55%),
    radial-gradient(circle at 110% 120%, #8b5cf615, transparent 60%);
  animation: gradient-shift 20s ease-in-out infinite;
}

@keyframes gradient-shift {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
```

**Edge Glow:**
- Faint light from screen edges
- Can pulse at tempo when metronome enabled
- Very low opacity (5–10%)

### 5.2 Audio-Reactive Visualizations

Tie to Web Audio analysis but keep peripheral:

**Vocal Energy Bars:**
- Thin vertical bars at extreme left/right edges
- Height responds to vocal RMS level
- Color: monochrome (just lightness shifts)
- In Stage Mode: Very subtle amplitude

**Background Blur:**
- Slight blur intensity change based on audio level
- No color strobing

### 5.3 Particle System

- Very minimal: Slow-moving dust/smoke-like particles
- Heavily blurred (blur: 20–30px)
- Low count (10–20 particles max)
- Movement: Gentle drift, no sudden changes

### 5.4 Performance Safeguards

```typescript
// Pause when not visible
const observer = new IntersectionObserver(
  ([entry]) => {
    if (entry.isIntersecting) {
      resumeBackgroundAnimation()
    } else {
      pauseBackgroundAnimation()
    }
  },
  { threshold: 0.1 }
)

// Pause when tab backgrounded
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseBackgroundAnimation()
  } else {
    resumeBackgroundAnimation()
  }
})
```

**Settings:**
- Global toggle: "Background animations" (on/off)
- "Ultra Lite" mode: Disable all non-essential visuals
- Respect `prefers-reduced-motion`
- Stage Mode default: Minimal or off

---

## 6. Layout & Navigation

### 6.1 Home Page

```
┌─────────────────────────────┐
│  🎵 ScrollTunes    ⚙️ 🌙   │  ← Logo + settings + theme
├─────────────────────────────┤
│                             │
│   ┌─────────────────────┐   │
│   │ 🔍 Search songs...  │   │  ← Primary action (large)
│   └─────────────────────┘   │
│                             │
├─────────────────────────────┤
│  Recently Performed         │
│  ┌───┐ ┌───┐ ┌───┐ ───→    │  ← Horizontal scroll
│  │ 🎵│ │ 🎵│ │ 🎵│          │     Album art + title
│  └───┘ └───┘ └───┘          │
├─────────────────────────────┤
│  📋 Setlists                │
│  ┌─────────────────────────┐│
│  │ Friday Night Set    (8) ││  ← Song count
│  │ Tonight @ 9pm           ││  ← Next gig badge
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ Acoustic Covers   (12)  ││
│  └─────────────────────────┘│
├─────────────────────────────┤
│  ⭐ Favorites               │
│  Quick access to starred    │
│  songs...                   │
└─────────────────────────────┘
```

**Song Cards:**
- Album art thumbnail
- Title + artist
- Tempo indicator
- Last performed time
- Tap → Performance view with last-used mode

### 6.2 Search Modal

Full-screen overlay:

```
┌─────────────────────────────┐
│  ✕                          │  ← Close button
├─────────────────────────────┤
│  ┌─────────────────────────┐│
│  │ 🔍 Search...        🎤  ││  ← Voice search option
│  └─────────────────────────┘│
├─────────────────────────────┤
│  All  │  Spotify  │ History │  ← Filter tabs
├─────────────────────────────┤
│                             │
│  ┌─────────────────────────┐│
│  │ 🎵 Song Title           ││
│  │    Artist Name    📝 🎸 ││  ← Badges: lyrics, chords
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ 🎵 Another Song         ││
│  │    Another Artist  📝   ││
│  └─────────────────────────┘│
│                             │
└─────────────────────────────┘
```

- Slide-up from bottom
- Dim background song view (keep visible for context)
- Badges: "has lyrics", "has chords", "enhanced timing"

### 6.3 Settings Page

```
┌─────────────────────────────┐
│  ← Settings                 │
├─────────────────────────────┤
│                             │
│  APPEARANCE                 │
│  ┌─────────────────────────┐│
│  │ Theme          Dark ▼   ││
│  ├─────────────────────────┤│
│  │ Performance    Stage ▼  ││
│  │ Mode                    ││
│  ├─────────────────────────┤│
│  │ Background      ○ ━━━●  ││
│  │ Animations              ││
│  └─────────────────────────┘│
│                             │
│  TEXT & ACCESSIBILITY       │
│  ┌─────────────────────────┐│
│  │ Font Size      Medium ▼ ││
│  ├─────────────────────────┤│
│  │ High Contrast   ○ ━━━●  ││
│  ├─────────────────────────┤│
│  │ Reduced Motion  ●━━━ ○  ││
│  └─────────────────────────┘│
│                             │
│  AUDIO                      │
│  ┌─────────────────────────┐│
│  │ VAD Sensitivity ━━●━━━  ││
│  ├─────────────────────────┤│
│  │ Metronome Sound  ○━━━●  ││
│  └─────────────────────────┘│
│                             │
└─────────────────────────────┘
```

### 6.4 Setlist Management

**Setlist Index:**
```
┌─────────────────────────────┐
│  ← Setlists            ＋   │  ← Add new setlist
├─────────────────────────────┤
│                             │
│  ┌─────────────────────────┐│
│  │ 🎤 Friday Night Set     ││
│  │    8 songs • ~45 min    ││
│  │    Tonight @ 9pm        ││  ← Next gig badge
│  └─────────────────────────┘│
│                             │
│  ┌─────────────────────────┐│
│  │ 🎸 Acoustic Covers      ││
│  │    12 songs • ~1h 10min ││
│  └─────────────────────────┘│
│                             │
└─────────────────────────────┘
```

**Setlist Detail:**
```
┌─────────────────────────────┐
│  ← Friday Night Set    ▶️   │  ← Start from top
├─────────────────────────────┤
│                             │
│  ≡ 1. Bohemian Rhapsody    ▶│  ← Drag handle + play
│  ≡ 2. Hotel California     ▶│
│  ≡ 3. Wonderwall           ▶│
│  ≡ 4. Sweet Child O'Mine   ▶│
│  ...                        │
│                             │
├─────────────────────────────┤
│  ＋ Add songs               │
└─────────────────────────────┘
```

---


### 6.5 Lyrics Share (Selection → Card Generator)

A new flow to select one or more lyric lines and generate a shareable card with customizable styles/layouts.

#### 6.5.1 Selection mode (in-song)
- Enter selection mode via:
  - long-press a line, or
  - “Share” → “Select lyrics”
- Tap to select lines; long-press + drag to select a range.
- Bottom action bar:
  - Copy
  - Share (text)
  - **Create card** (primary)

#### 6.5.2 Card editor (live preview)
Card preview contains:
- album art (or placeholder)
- artist + title
- selected lyrics as the hero typography

Customization controls:
- **Style**: Gradient / Album overlay / Minimal
- **Layout templates**: choose from a small curated set (deterministic thumbnails)
- **Overlay intensity** slider (for album overlay readability)
- Export presets (strongly recommended):
  - Square (1:1)
  - Story (9:16)
  - Wide (16:9)

#### 6.5.3 Card template gallery
- Present 6–10 curated templates.
- Keep templates intentionally distinct (meta placement, lyric size, background treatment).
- Templates should be *safe defaults* with good contrast.

#### 6.5.4 Rendering & export (web constraints)
- Export via:
  - DOM-to-image (e.g. `html-to-image`) **or**
  - Canvas rendering for full control.
- Ensure:
  - deterministic fonts (load + wait)
  - safe area margins
  - contrast checks (minimum opacity for overlays)
  - offline-friendly when possible (PWA)

---


## 7. Responsive Breakpoints

Use Tailwind defaults with behavior mapping:

### Phone (< 640px)

- **Portrait**: Single column, lyrics dominate
- **Landscape**: Two-column (lyrics + chords/info)
- Minimum touch target: 44×44px
- Primary button: 56×56px

### Tablet (≥ 640px and < 1024px)

- More generous margins
- Lyrics max-width: `max-w-2xl`
- Chord diagrams visible by default
- Landscape: Lyrics center + sidebar right

### Desktop (≥ 1024px)

- Three-column layout option:
  - Left: Library/setlists
  - Center: Lyrics preview (matches mobile)
  - Right: Metadata, controls, debugging
- "Stage preview" in center that matches mobile experience

**Key Principle:** Performance view layout stays conceptually identical across breakpoints so muscle memory transfers.

---

## 8. Award-Winning Differentiators

What makes ScrollTunes stand out on Awwwards / CSS Design Awards:

### 1. "Instrument-Grade" Clarity
Not just pretty—feels like stage gear:
- Intentional darkness, precise typography
- Minimal UI chrome
- Designed for musician's distance and gaze, not a couch user

### 2. Functional Theme System
Stage vs Practice vs Karaoke are more than skins:
- They alter density, animations, and helpers
- Real behavioral changes, not just colors

### 3. Audio-Reactive Restraint
- Web Audio visualization done tastefully
- Low-contrast, peripheral effects
- Never competes with lyrics

### 4. Hands-Free-First Interactions
- Double-tap anywhere gestures
- Clear but subtle visual hints
- Controls that get out of the way

### 5. Teleprompter-Specific Polish
- Reading rail and spotlight highlight
- Per-word karaoke sweep
- Chord integration that respects scannability

### 6. Craft in Details
- Critical-damped springs that feel precise
- Micro-interactions throughout:
  - Mic icon pulse when listening
  - Color shift when auto-sync locks
  - Skeleton states that look like a teleprompter


### 7. Shareable Lyric Cards (Designed, not improvised)
- Select multiple lyric lines and generate a **professional lyric card** with:
  - curated templates (not infinite randomness)
  - album art / metadata placement that stays readable
  - restrained gradients or album overlay with intensity control
- Export presets for Square / Story / Wide make this immediately useful for actual humans.

---

---

## 9. Implementation Path


### 9.1 LLM-Assisted Implementation Plan (Phased)

Use an LLM as a coding partner, but keep changes **small, verifiable, and staged**. Each phase should end in a working app, not a “big bang” branch that never lands.

**Global rules for LLM-assisted work**
- Always start by asking the model to **summarize the existing code structure** (files/components/state) before changing it.
- Keep PRs small: one phase, one feature set, minimal refactors.
- Require outputs as:
  - a file-by-file change plan
  - then a patch/diff (or concrete file edits)
  - then a test/run checklist
- Don’t let the model invent dependencies casually. Prefer existing stack first.

#### Phase 0: Repo audit + scaffolding (0.5–1 day)
**Deliverables**
- Inventory of routes/pages/components
- Theme entry points (CSS variables, context/provider)
- A “Design Tokens” module with a single source of truth (`tokens.json` or `theme.ts`)
- Basic smoke test checklist (manual)

**LLM prompt guidance**
- “Scan the repo and produce a map of UI components, pages, and styling system. Identify the minimal set of files to touch to introduce design tokens.”

#### Phase 1: Studio Pro Dark theming (1–2 days)
**Deliverables**
- Implement Studio Pro Dark tokens (bg/surfaces/borders/text/accent)
- Replace filter-based light mode with real variables (if still present)
- Update common components (buttons/cards/modals/top bars)
- Confirm: no neon glows, no inconsistent outlines

**Acceptance checks**
- Home, search modal, settings all match token palette
- Borders are subtle; shadows are restrained

#### Phase 2: Navigation + layout refresh (1–2 days)
**Deliverables**
- Home page layout polish (search, recently performed, setlists)
- Search modal polish (tabs, results list, chips)
- Setlists index + detail layout consistency

**Acceptance checks**
- Spacing feels consistent on an 8pt grid
- Tap targets meet minimum size

#### Phase 3: Stage (Perform) mode screen (1–2 days)
**Deliverables**
- Lyrics-first screen with “reading rail” highlight and minimal controls
- Auto-hide controls behavior
- Wake lock behavior (PWA where applicable)

**Acceptance checks**
- Stage mode is readable from a distance
- No “practice” tools visible

#### Phase 4: Practice mode tools (2–4 days)
**Deliverables**
- Timeline scrub + (optional) A–B loop
- Section chips for navigation
- Chords: inline + next chord preview (diagram on demand)
- Metronome (optional)

**Acceptance checks**
- Practice tools do not break lyric readability
- Mode switch does not leak state (Stage stays minimal)

#### Phase 5: Lyrics Share feature (2–3 days)
**Deliverables**
- Selection mode in-song
- Card templates gallery
- Card editor with live preview and style controls
- Export presets (Square / Story / Wide)

**Acceptance checks**
- Export is deterministic (font load, size, margins)
- Templates remain readable across backgrounds

#### Phase 6: Polish, accessibility, performance (1–2 days)
**Deliverables**
- Reduced motion mode and accessibility audit
- Contrast checks for all templates
- Performance pass (scrolling, animation budgets)

**Acceptance checks**
- `prefers-reduced-motion` respected
- No dropped frames in Stage mode scrolling

---

### 9.2 LLM Phase Prompts (copy/paste templates)

**Phase prompt skeleton**
1) “Summarize how the relevant parts of the repo work today.”
2) “Propose the smallest change plan (file list + responsibilities).”
3) “Implement it as a patch with minimal diff.”
4) “List manual QA steps and any unit tests to add.”

**Guardrails**
- “Do not change unrelated files.”
- “Do not add dependencies unless explicitly justified.”
- “Keep style changes token-driven.”

---

### 9.3 Engineering Checklist (by phase)

#### Phase 0: Audit + scaffolding
- [ ] Map routes/pages/components and current styling system
- [ ] Identify theme entry points (CSS vars, context/provider)
- [ ] Add `tokens.json` (or `theme.ts`) as source of truth
- [ ] Add basic smoke test checklist

#### Phase 1: Studio Pro Dark theming
- [ ] Implement Studio Pro Dark tokens (bg/surfaces/text/borders/accent)
- [ ] Update shared components (buttons/cards/modals/top bars)
- [ ] Remove any filter-based “fake light mode” behavior
- [ ] Add persistence for base mode + performance theme

#### Phase 2: Navigation + layout polish
- [ ] Home: search + recents + setlists layout
- [ ] Search modal: chips/tabs + results list
- [ ] Setlists: index + detail layouts
- [ ] Confirm spacing on an 8pt grid and tap target sizes

#### Phase 3: Stage (Perform) mode
- [ ] Lyrics-first layout with reading rail highlight
- [ ] Minimal control strip + gesture support
- [ ] Auto-hide controls + wake lock behavior (PWA)
- [ ] Performance budget: stage scrolling stays smooth

#### Phase 4: Practice mode tools
- [ ] Timeline scrub + optional A–B loop
- [ ] Section navigation chips
- [ ] Chords: inline + next chord preview + diagram on demand
- [ ] Metronome (optional) + tempo/pitch controls (optional)

#### Phase 5: Lyrics Share
- [ ] Selection mode in-song (tap + range selection)
- [ ] Template gallery (curated)
- [ ] Editor: style/layout controls + overlay intensity
- [ ] Export presets: 1:1, 9:16, 16:9

#### Phase 6: QA + accessibility + performance
- [ ] Reduced motion + high contrast verification
- [ ] Contrast checks on share templates
- [ ] Cross-device responsive checks (portrait/landscape/desktop)
- [ ] Final perf pass (animations, scroll, export)

---
## Appendix: Design Tokens (Studio Pro Dark)

### tokens.json (recommended source of truth)
This matches the Studio Pro Dark visual language used in the mockups.

```json
{
  "colors": {
    "bg": "#070A12",
    "surface1": "#0C1220",
    "surface2": "#111A2C",
    "surface3": "#151F33",
    "text": "#F3F5F7",
    "text2": "rgba(243,245,247,0.72)",
    "text3": "rgba(243,245,247,0.46)",
    "accent": "#5B6CFF",
    "accentHover": "#6F7DFF",
    "success": "#22C55E",
    "warning": "#FBBF24",
    "danger": "#FB7185",
    "border": "rgba(255,255,255,0.10)",
    "borderStrong": "rgba(255,255,255,0.16)"
  },
  "radius": { "sm": 10, "md": 14, "lg": 18, "xl": 24 },
  "spacing": { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32 },
  "type": { "ui": "Inter" }
}
```

### theme.ts mapping (example)
Generate this from `tokens.json` (don’t maintain two divergent sources manually).

```ts
export const theme = {
  colors: {
    bg: "#070A12",
    surface1: "#0C1220",
    surface2: "#111A2C",
    surface3: "#151F33",
    text: "#F3F5F7",
    text2: "rgba(243,245,247,0.72)",
    text3: "rgba(243,245,247,0.46)",
    accent: "#5B6CFF",
    accentHover: "#6F7DFF",
    success: "#22C55E",
    warning: "#FBBF24",
    danger: "#FB7185",
    border: "rgba(255,255,255,0.10)",
    borderStrong: "rgba(255,255,255,0.16)",
  },
  radius: { sm: 10, md: 14, lg: 18, xl: 24 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  type: { ui: "Inter" }
};
```

### Share card gradients (curated presets)
Gradients should be used mainly for Lyrics Share cards, not core navigation.

- `Share Gradient A`: Indigo → Violet
- `Share Gradient B`: Cyan → Green
- `Share Mono`: Surface3 → Background

---
