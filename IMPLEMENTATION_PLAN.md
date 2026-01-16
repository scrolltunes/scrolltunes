# Implementation Plan: TUI Redesign

> **Scope**: Everything (all pages, components, modals) | **Risk**: Aggressive (full component library rewrite) | **Constraints**: Dark mode only, defer Share Designer

## Summary

Migrate ScrollTunes to a terminal-inspired dark theme (Tokyo Night palette) with new UI primitives, terminal effects (glow, scanlines, grid), and Inter + Space Mono fonts. Remove light mode entirely. Create `ui2/` component library, migrate all pages, then cleanup.

---

## Phase 1: Foundation

- [x] **1.1** Update `globals.css` with Tokyo Night design tokens (replace current color variables with new palette: bg-primary/secondary/tertiary, fg-primary/secondary/muted, accent-primary/secondary/tertiary, status colors, borders)
- [x] **1.2** Remove `:root.light` block and `:root.dark` block from `globals.css` (single dark theme only)
- [x] **1.3** Add terminal utility classes to `globals.css`: `.terminal-glow`, `.terminal-scanlines`, `.glass`, `.gradient-text`, `.focus-ring`, grid pattern utility
- [x] **1.4** Replace fonts in `layout.tsx`: Geist → Inter, Geist_Mono → Space Mono; update CSS variables `--font-inter`, `--font-space-mono`
- [x] **1.5** Simplify inline theme script in `layout.tsx` to always apply dark theme (remove light mode logic)
- [x] **1.6** Simplify `ThemeProvider.tsx` to remove theme switching (always dark, remove themeMode subscription)
- [x] **1.7** Update `src/theme.ts` to remove light mode values, align with new token names

---

## Phase 2: UI Primitives (`src/components/ui2/`)

- [x] **2.1** Create `src/components/ui2/Button.tsx` with variants (default, secondary, outline, ghost), sizes (sm, default, lg), terminal styling (rounded-sm, font-mono, glow on hover)
- [x] **2.2** Create `src/components/ui2/Card.tsx` with CardHeader, CardContent, CardFooter; variants (default, elevated, bordered); interactive + glowOnHover props
- [x] **2.3** Create `src/components/ui2/Badge.tsx` with status dot, accent border, monospace text
- [x] **2.4** Create `src/components/ui2/IconButton.tsx` (migrate from ui/, update to new tokens)
- [x] **2.5** Create `src/components/ui2/Input.tsx` with terminal styling (bg-secondary, border, focus glow)
- [x] **2.6** Create `src/components/ui2/Modal.tsx` base component with backdrop blur, slide-up animation
- [x] **2.7** Create `src/components/ui2/Skeleton.tsx` (migrate from ui/, update colors)
- [x] **2.8** Create `src/components/ui2/index.ts` barrel export

---

## Phase 3: Layout Components

- [x] **3.1** Create/update Header component with sticky positioning, blur backdrop, terminal-styled logo, navigation links
- [x] **3.2** Update `Footer.tsx` to use new tokens and terminal styling
- [x] **3.3** Update `LogoMenu.tsx` dropdown to use new Card/Button primitives and tokens
- [x] **3.4** Create `PageShell.tsx` wrapper component for consistent page layout (optional ambient background, padding, max-width)

---

## Phase 4: Core Pages

- [x] **4.1** Update Home page (`/`) - search input, RecentSongs, HomeFavorites, HomeSetlists sections with new primitives
- [x] **4.2** Update `SongSearch.tsx` component with new Input, Card styling
- [x] **4.3** Update `RecentSongs.tsx` to use new Card/SongListItem styling
- [x] **4.4** Update Song page (`SongPageClient.tsx`) - header, action bar, overall layout
- [x] **4.5** Update Favorites page (`/favorites`) with new primitives
- [x] **4.6** Update Setlists page (`/setlists`) with new Card styling
- [x] **4.7** Update Setlist detail page (`SetlistDetailClient.tsx`)
- [x] **4.8** Update Settings page (`/settings`) - remove theme picker, update all controls to new styling
- [x] **4.9** Update Login page (`/login`) with terminal-styled sign-in button
- [x] **4.10** Update static pages (`/about`, `/terms`, `/privacy`, `/roadmap`) with new typography and Card styling

---

## Phase 5: Feature Components

- [x] **5.1** Update `LyricsDisplay.tsx` and `LyricLine.tsx` - active line glow, updated colors
- [x] **5.2** Update `ChordBadge.tsx` and `InlineChord.tsx` to use new accent colors
- [x] **5.3** Update `VoiceIndicator.tsx`, `SingingDebugIndicator.tsx` with new status colors
- [x] **5.4** Update `FloatingMetronome.tsx`, `Metronome.tsx`, `MetronomeOrb.tsx` styling
- [x] **5.5** Update `SongActionBar.tsx` and `FloatingActions.tsx` with new IconButton/Button
- [x] **5.6** Update `SongInfoModal.tsx` to use new Modal primitive
- [x] **5.7** Update `ReportIssueModal.tsx` to use new Modal/Input/Button primitives
- [x] **5.8** Update setlist modals (`CreateSetlistModal`, `EditSetlistModal`, `AddToSetlistModal`)
- [x] **5.9** Update `SongListItem.tsx` (ui/) with new Card-like styling
- [x] **5.10** Update `GlassCard.tsx` to align with new Card or mark for deprecation
- [x] **5.11** Update `AmbientBackground.tsx` - remove light mode branch, update colors
- [x] **5.12** Update `BackButton.tsx`, `FavoriteButton.tsx` to use new primitives

---

## Phase 6: Admin (Minimal)

- [x] **6.1** Update admin pages to reference new CSS token names (find/replace old variable names)
- [x] **6.2** Ensure admin tables/cards use new border and background tokens
- [x] **6.3** Verify admin functionality unchanged

---

## Phase 7: Cleanup

- [x] **7.1** Merge `ui2/` primitives into `ui/` (Button, Card, Badge, Input, Modal, IconButton, Skeleton)
- [x] **7.2** Delete `src/components/ui2/` directory
- [x] **7.3** Delete `src/design/studio-pro-dark.css`
- [x] **7.4** Remove unused theme-related exports from `theme.ts` (done in Phase 1)
- [x] **7.5** Remove theme picker UI from Settings page (done in Phase 4)
- [x] **7.6** Audit for any remaining hardcoded colors (should use tokens)
- [x] **7.7** Merged ui2/ into ui/ (no rename needed)
- [x] **7.8** Run `bun run check` (lint + typecheck + test) and fix any issues
- [x] **7.9** Manual visual QA on mobile and desktop

---

## Notes

- Share Designer components (`src/components/share/*`) are **excluded** from this migration
- Test pages (`/test/*`) are **excluded**
- Preserve all `motion/react` animations
- Keep chord diagram black-on-white styling (`.chord-diagram-svg`)
- Keep Spotify green (`--color-spotify`) for brand compliance
