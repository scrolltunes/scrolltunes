# TUI Redesign Specification

> Comprehensive migration of ScrollTunes to a terminal/TUI-inspired dark theme based on Ralph TUI design system.

## Overview

Migrate ScrollTunes from the current dual-theme (dark/light) design to a single, cohesive terminal-inspired dark theme featuring Tokyo Night color palette, monospace typography accents, and terminal effects (glow, scanlines, grid patterns).

## Design System Reference

Based on [ralph-tui website](file:///Users/hmemcpy/git/ralph-tui/website) design system.

### Color Palette (Tokyo Night)

```css
/* Background layers */
--bg-primary: 26 27 38;      /* #1a1b26 - deepest background */
--bg-secondary: 36 40 59;    /* #24283b - cards, elevated surfaces */
--bg-tertiary: 47 52 73;     /* #2f3449 - hover states */
--bg-highlight: 61 66 89;    /* #3d4259 - active states */

/* Foreground (text) */
--fg-primary: 192 202 245;   /* #c0caf5 - primary text */
--fg-secondary: 169 177 214; /* #a9b1d6 - secondary text */
--fg-muted: 86 95 137;       /* #565f89 - muted/placeholder */
--fg-dim: 65 72 104;         /* #414868 - disabled/ghost */

/* Accent colors */
--accent-primary: 122 162 247;   /* #7aa2f7 - blue (primary actions) */
--accent-secondary: 187 154 247; /* #bb9af7 - purple (secondary) */
--accent-tertiary: 125 207 255;  /* #7dcfff - cyan (highlights) */

/* Status colors */
--status-success: 158 206 106;  /* #9ece6a - green */
--status-warning: 224 175 104;  /* #e0af68 - amber */
--status-error: 247 118 142;    /* #f7768e - pink/red */
--status-info: 122 162 247;     /* #7aa2f7 - blue */

/* Borders */
--border: 61 66 89;          /* #3d4259 - default */
--border-active: 122 162 247; /* #7aa2f7 - focused/active */
--border-muted: 47 52 73;     /* #2f3449 - subtle */
```

### Typography

| Role | Font | CSS Variable |
|------|------|--------------|
| Body/UI | Inter | `--font-inter` |
| Code/Mono | Space Mono | `--font-space-mono` |

- Headings: `font-mono` (Space Mono) for terminal aesthetic
- Body text: `font-sans` (Inter) for readability
- Buttons/labels: `font-mono` with `tracking-wide`

### Terminal Effects

1. **Glow on hover**: `box-shadow: 0 0 20px rgba(122,162,247,0.4)`
2. **Gradient orbs**: Animated blurred spheres in backgrounds
3. **Grid pattern**: Subtle 60px grid overlay at `opacity-[0.03]`
4. **Scanlines**: Repeating gradient for CRT effect
5. **Typing cursor**: Blinking cursor accent
6. **Glass effect**: `backdrop-blur-sm` with semi-transparent bg

### Component Patterns

#### Button
- Sharp corners: `rounded-sm`
- Monospace font: `font-mono tracking-wide`
- Glow on hover
- Variants: default (accent), secondary, outline, ghost
- Sizes: sm, default, lg

#### Card
- Background: `bg-secondary`
- Border: `border-border`
- Hover: border highlight + subtle glow
- Interactive variant with lift effect

#### Badge
- Pill shape with status dot
- Monospace uppercase text
- Accent border

---

## Scope

### In Scope

#### Phase 1: Foundation
- [ ] New design tokens in `globals.css` (Tokyo Night palette)
- [ ] Remove light mode (`:root.light`, theme switching logic)
- [ ] Replace fonts (Geist → Inter + Space Mono)
- [ ] Terminal utility classes (glow, scanlines, grid, glass)

#### Phase 2: UI Primitives (`src/components/ui2/`)
- [ ] Button (variants: default, secondary, outline, ghost; sizes: sm, default, lg)
- [ ] Card (variants: default, elevated, bordered; interactive + glowOnHover)
- [ ] CardHeader, CardContent, CardFooter
- [ ] Badge (status dot, variants)
- [ ] IconButton (migrated from ui/)
- [ ] Input (text input with terminal styling)
- [ ] Modal (base modal with backdrop blur)
- [ ] Skeleton (loading states)
- [ ] index.ts barrel export

#### Phase 3: Layout Components
- [ ] Header (sticky, blur backdrop, logo, nav)
- [ ] Footer (update styling)
- [ ] PageShell (consistent page wrapper)
- [ ] LogoMenu (update styling)

#### Phase 4: Core Pages
- [ ] Home (`/`) - search, recent, favorites, setlists sections
- [ ] Song page (`/song/[artistSlug]/[trackSlugWithId]`)
- [ ] Favorites (`/favorites`)
- [ ] Setlists (`/setlists`, `/setlists/[slugOrId]`)
- [ ] Settings (`/settings`) - remove theme picker
- [ ] Login (`/login`)
- [ ] Static pages (`/about`, `/terms`, `/privacy`, `/roadmap`)

#### Phase 5: Feature Components
- [ ] LyricsDisplay / LyricLine (active line styling)
- [ ] ChordBadge / InlineChord
- [ ] Audio controls (VoiceIndicator, Metronome, etc.)
- [ ] SongActionBar / FloatingActions
- [ ] All modals (SongInfoModal, ReportIssueModal, setlist modals)
- [ ] SongListItem

#### Phase 6: Admin (Minimal)
- [ ] Update to use new tokens (colors only)
- [ ] Keep functional layout intact

#### Phase 7: Cleanup
- [ ] Migrate all ui/ imports to ui2/
- [ ] Delete `src/components/ui/` (old)
- [ ] Delete `src/design/studio-pro-dark.css`
- [ ] Remove theme-related code from `theme.ts`
- [ ] Remove `ThemeProvider.tsx` theme switching logic
- [ ] Simplify inline theme script in `layout.tsx`
- [ ] Rename `ui2/` to `ui/` (optional final step)

### Out of Scope (Deferred)

- Share Designer (`/s/[id]`, `src/components/share/*`) - complex mini-app, defer to later phase
- Test pages (`/test/*`) - dev-only
- Advanced admin polish

---

## Acceptance Criteria

### Visual
- [ ] Consistent Tokyo Night color palette across all pages
- [ ] Terminal aesthetic: monospace headings, glow effects, sharp corners
- [ ] No light mode remnants (no flash, no toggle)
- [ ] Smooth animations preserved (motion/react)

### Functional
- [ ] All existing features work unchanged
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Mobile-responsive (primary use case)

### Code Quality
- [ ] New UI primitives are composable and documented
- [ ] Consistent use of design tokens (no hardcoded colors)
- [ ] Clean component API (variants, sizes via props)

---

## Edge Cases

1. **Chord diagrams**: Must remain black-on-white (already handled via `.chord-diagram-svg`)
2. **Spotify branding**: Keep `--color-spotify` green for brand compliance
3. **AmbientBackground**: Remove light mode opacity branch
4. **Share Designer**: Exclude from this migration, keep current styling
5. **Admin pages**: Minimal token update only, preserve data-dense layouts

---

## Technical Notes

### Token Migration Strategy
- Single source of truth: `src/app/globals.css`
- Delete: `src/design/studio-pro-dark.css`
- Update: `src/theme.ts` (remove light mode, align with new tokens)

### Font Loading
Replace in `src/app/layout.tsx`:
```tsx
// Before
import { Geist, Geist_Mono } from "next/font/google"

// After
import { Inter, Space_Mono } from "next/font/google"
```

### Theme Removal
1. Remove `:root.light` block from `globals.css`
2. Simplify inline script in `layout.tsx` (always dark)
3. Remove `themeMode` from PreferencesStore schema
4. Remove theme picker from Settings page
5. Simplify or remove `ThemeProvider.tsx`

### Animation Preservation
- Keep all `motion/react` usage
- Keep `src/animations.ts` presets
- Update colors in animation-related components

---

## Dependencies

- `next/font/google`: Inter, Space_Mono (already available)
- No new packages required
- motion/react: already installed
