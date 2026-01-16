# Implementation Plan: TUI Redesign

> **Scope**: Everything (all pages, components, modals) | **Risk**: Aggressive (full component library rewrite) | **Constraints**: Dark mode only, defer Share Designer

## Summary

Migrate ScrollTunes to a terminal-inspired dark theme (Tokyo Night palette) with new UI primitives, terminal effects (glow, scanlines, grid), and Inter + Space Mono fonts. Remove light mode entirely. Create `ui2/` component library, migrate all pages, then cleanup.

---

## Phase 1: Foundation

- [x] **1.1** Update `globals.css` with Tokyo Night design tokens (replace current color variables with new palette: bg-primary/secondary/tertiary, fg-primary/secondary/muted, accent-primary/secondary/tertiary, status colors, borders)
- [ ] **1.2** Remove `:root.light` block and `:root.dark` block from `globals.css` (single dark theme only)
- [ ] **1.3** Add terminal utility classes to `globals.css`: `.terminal-glow`, `.terminal-scanlines`, `.glass`, `.gradient-text`, `.focus-ring`, grid pattern utility
- [ ] **1.4** Replace fonts in `layout.tsx`: Geist → Inter, Geist_Mono → Space Mono; update CSS variables `--font-inter`, `--font-space-mono`
- [ ] **1.5** Simplify inline theme script in `layout.tsx` to always apply dark theme (remove light mode logic)
- [ ] **1.6** Simplify `ThemeProvider.tsx` to remove theme switching (always dark, remove themeMode subscription)
- [ ] **1.7** Update `src/theme.ts` to remove light mode values, align with new token names

---

## Phase 2: UI Primitives (`src/components/ui2/`)

- [ ] **2.1** Create `src/components/ui2/Button.tsx` with variants (default, secondary, outline, ghost), sizes (sm, default, lg), terminal styling (rounded-sm, font-mono, glow on hover)
- [ ] **2.2** Create `src/components/ui2/Card.tsx` with CardHeader, CardContent, CardFooter; variants (default, elevated, bordered); interactive + glowOnHover props
- [ ] **2.3** Create `src/components/ui2/Badge.tsx` with status dot, accent border, monospace text
- [ ] **2.4** Create `src/components/ui2/IconButton.tsx` (migrate from ui/, update to new tokens)
- [ ] **2.5** Create `src/components/ui2/Input.tsx` with terminal styling (bg-secondary, border, focus glow)
- [ ] **2.6** Create `src/components/ui2/Modal.tsx` base component with backdrop blur, slide-up animation
- [ ] **2.7** Create `src/components/ui2/Skeleton.tsx` (migrate from ui/, update colors)
- [ ] **2.8** Create `src/components/ui2/index.ts` barrel export

---

## Phase 3: Layout Components

- [ ] **3.1** Create/update Header component with sticky positioning, blur backdrop, terminal-styled logo, navigation links
- [ ] **3.2** Update `Footer.tsx` to use new tokens and terminal styling
- [ ] **3.3** Update `LogoMenu.tsx` dropdown to use new Card/Button primitives and tokens
- [ ] **3.4** Create `PageShell.tsx` wrapper component for consistent page layout (optional ambient background, padding, max-width)

---

## Phase 4: Core Pages

- [ ] **4.1** Update Home page (`/`) - search input, RecentSongs, HomeFavorites, HomeSetlists sections with new primitives
- [ ] **4.2** Update `SongSearch.tsx` component with new Input, Card styling
- [ ] **4.3** Update `RecentSongs.tsx` to use new Card/SongListItem styling
- [ ] **4.4** Update Song page (`SongPageClient.tsx`) - header, action bar, overall layout
- [ ] **4.5** Update Favorites page (`/favorites`) with new primitives
- [ ] **4.6** Update Setlists page (`/setlists`) with new Card styling
- [ ] **4.7** Update Setlist detail page (`SetlistDetailClient.tsx`)
- [ ] **4.8** Update Settings page (`/settings`) - remove theme picker, update all controls to new styling
- [ ] **4.9** Update Login page (`/login`) with terminal-styled sign-in button
- [ ] **4.10** Update static pages (`/about`, `/terms`, `/privacy`, `/roadmap`) with new typography and Card styling

---

## Phase 5: Feature Components

- [ ] **5.1** Update `LyricsDisplay.tsx` and `LyricLine.tsx` - active line glow, updated colors
- [ ] **5.2** Update `ChordBadge.tsx` and `InlineChord.tsx` to use new accent colors
- [ ] **5.3** Update `VoiceIndicator.tsx`, `SingingDebugIndicator.tsx` with new status colors
- [ ] **5.4** Update `FloatingMetronome.tsx`, `Metronome.tsx`, `MetronomeOrb.tsx` styling
- [ ] **5.5** Update `SongActionBar.tsx` and `FloatingActions.tsx` with new IconButton/Button
- [ ] **5.6** Update `SongInfoModal.tsx` to use new Modal primitive
- [ ] **5.7** Update `ReportIssueModal.tsx` to use new Modal/Input/Button primitives
- [ ] **5.8** Update setlist modals (`CreateSetlistModal`, `EditSetlistModal`, `AddToSetlistModal`)
- [ ] **5.9** Update `SongListItem.tsx` (ui/) with new Card-like styling
- [ ] **5.10** Update `GlassCard.tsx` to align with new Card or mark for deprecation
- [ ] **5.11** Update `AmbientBackground.tsx` - remove light mode branch, update colors
- [ ] **5.12** Update `BackButton.tsx`, `FavoriteButton.tsx` to use new primitives

---

## Phase 6: Admin (Minimal)

- [ ] **6.1** Update admin pages to reference new CSS token names (find/replace old variable names)
- [ ] **6.2** Ensure admin tables/cards use new border and background tokens
- [ ] **6.3** Verify admin functionality unchanged

---

## Phase 7: Cleanup

- [ ] **7.1** Search codebase for all `ui/` imports and migrate to `ui2/`
- [ ] **7.2** Delete `src/components/ui/` directory (after all imports migrated)
- [ ] **7.3** Delete `src/design/studio-pro-dark.css`
- [ ] **7.4** Remove unused theme-related exports from `theme.ts`
- [ ] **7.5** Remove theme picker UI from Settings page (if not done in 4.8)
- [ ] **7.6** Audit for any remaining hardcoded colors (should use tokens)
- [ ] **7.7** Rename `src/components/ui2/` to `src/components/ui/` and update all imports
- [ ] **7.8** Run `bun run check` (lint + typecheck + test) and fix any issues
- [ ] **7.9** Manual visual QA on mobile and desktop

---

## Notes

- Share Designer components (`src/components/share/*`) are **excluded** from this migration
- Test pages (`/test/*`) are **excluded**
- Preserve all `motion/react` animations
- Keep chord diagram black-on-white styling (`.chord-diagram-svg`)
- Keep Spotify green (`--color-spotify`) for brand compliance
