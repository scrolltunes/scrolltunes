# Edit Mode Feature

## Overview

Edit Mode allows signed-in users to customize songs for live performance by skipping lines, modifying text, and adding section markers. The feature is desktop-first with rich editing capabilities.

**Key Principle**: We NEVER store lyrics on the server. Following the LRC enhancement system pattern, we store only patches/modifications that are applied client-side to the base lyrics fetched from LRCLIB.

## Current Status

### Completed

#### Phase 1: Core Infrastructure
- [x] Types in `src/lib/song-edits/types.ts`
- [x] `SongEditsStore` with localStorage + API sync (`src/core/SongEditsStore.ts`)
- [x] API endpoints for CRUD (`src/app/api/user/song-edits/[songId]/route.ts`)
- [x] `lrcHash` computation for patch validation
- [x] Section detection utilities (`src/lib/song-edits/section-detection.ts`)
- [x] Apply edits utilities (`src/lib/song-edits/apply-edits.ts`)

#### Phase 2: Basic Edit Mode UI
- [x] `EditModeProvider` context with selection state
- [x] `EditToolbar` component with Skip/Unskip/Select All/Clear/Save/Revert/Exit
- [x] `EditableLyricsDisplay` with checkbox-based selection
- [x] `EditableLyricLine` with timing display, checkboxes, skip indicators
- [x] Skip/unskip functionality for selected lines
- [x] Inline text modification (double-click to edit)
- [x] Empty line (instrumental) display with "♪ Instrumental" indicator
- [x] Strikethrough styling for skipped lines

#### Phase 3: Playback Integration
- [x] Apply edits to lyrics on load (filters skipped lines, applies text mods)
- [x] "Modified" indicator in SongActionBar
- [x] Auto-load edits when song page loads
- [x] Edits applied when not in edit mode

#### Phase 4: Admin Integration
- [x] "Edits" status badge in songs list (grid and table views)
- [x] "Edit Lyrics" button linking to song page with `?edit=1`
- [x] Auto-enter edit mode via `?edit=1` query parameter
- [x] Edit status in song detail page

### Not Yet Implemented

#### Phase 2: Remaining Items
- [ ] Keyboard shortcuts (E, S, U, Enter, Escape, Ctrl+S)
- [ ] Shift+Click range select (currently checkbox-only)
- [ ] Ctrl/Cmd+Click multi-select (currently checkbox-only)

#### Phase 3: Advanced Editing
- [ ] Section markers with popover UI (auto-detect + manual)
- [ ] BPM override control
- [ ] Tempo multiplier control
- [ ] Section skip (skip entire detected section at once)

#### Phase 4: Performance View
- [ ] Diff view mode (show original vs edited side-by-side)
- [ ] Quick toggle during performance to show/hide diff
- [ ] "Original" view toggle to temporarily show unedited lyrics

#### Phase 5: Polish
- [ ] Unsaved changes confirmation dialog
- [ ] Mobile read-only view (hide edit button, apply edits silently)
- [ ] Desktop-only edit mode detection (`min-width: 1024px`)
- [ ] Edge case handling (hash mismatch warnings, etc.)

#### Future (Deferred)
- [ ] Undo/redo with Ctrl+Z/Ctrl+Y
- [ ] Edit history/versioning
- [ ] Export/share custom arrangements

---

## Design Decisions

### Patching Approach
- Patches reference lines by **index** (not ID or text)
- `lrcHash` validates patches against current lyrics version
- Custom text modifications store only the user's replacement text
- No copyrighted lyrics stored server-side

### Selection Model
- Checkbox-based selection (click checkboxes to select/deselect)
- "Select All" / "Clear" for bulk operations
- Selection state managed in `EditModeProvider` context

### Skipped Lines
- Completely hidden during normal playback
- Shown with strikethrough and dimmed in edit mode
- "Skip" badge indicator on skipped lines

### Modified Text
- Shown in green (`text-emerald-300`) in edit mode
- "Edited" badge indicator on modified lines
- Double-click to edit inline

### Empty Lines (Instrumental)
- Displayed as "♪ Instrumental" in edit mode
- Can be skipped like regular lines
- Timing shown inline

---

## Data Model

### Storage
Edits stored in `user_song_settings.settingsJson.edits` JSONB column.

### Types (`src/lib/song-edits/types.ts`)

```typescript
export type SectionType =
  | "verse" | "chorus" | "bridge" | "pre-chorus"
  | "outro" | "intro" | "instrumental" | "custom"

export interface LinePatch {
  readonly idx: number                    // Line index
  readonly action: "skip" | "modify" | "section"
  readonly skipped?: boolean              // For "skip" action
  readonly customText?: string            // For "modify" action
  readonly sectionType?: SectionType      // For "section" action
  readonly sectionLabel?: string          // For "custom" section type
}

export interface SongEditPatchPayload {
  readonly version: 1
  readonly lrcHash: string                // For validation
  readonly createdAt: string
  readonly updatedAt: string
  readonly linePatches: readonly LinePatch[]
  readonly bpmOverride: number | null
  readonly tempoMultiplier: number | null
  readonly hasSkippedLines: boolean
  readonly hasModifiedText: boolean
  readonly hasSectionMarkers: boolean
}
```

### Store State (`src/core/SongEditsStore.ts`)

```typescript
interface SongEditsState {
  readonly status: "idle" | "loading" | "ready" | "saving" | "error"
  readonly songId: number | null
  readonly lrcHash: string | null
  readonly payload: SongEditPatchPayload | null
  readonly originalPayload: SongEditPatchPayload | null
  readonly isDirty: boolean
  readonly isEditMode: boolean
  readonly error: string | null
}
```

---

## Component Structure

```
src/components/edit-mode/
├── EditModeProvider.tsx        # Context for selection + edit state
├── EditToolbar.tsx             # Top toolbar with actions
├── EditableLyricsDisplay.tsx   # Main editing view (scrollable)
├── EditableLyricLine.tsx       # Single editable line with checkbox
└── index.ts                    # Exports

src/lib/song-edits/
├── types.ts                    # Type definitions
├── apply-edits.ts              # applyEditPatches, getLinesWithEditStatus
├── section-detection.ts        # detectSections, getSectionMarkers
└── index.ts                    # Exports
```

---

## API Endpoints

```
GET    /api/user/song-edits/[songId]     → { edits: SongEditPatchPayload | null }
POST   /api/user/song-edits/[songId]     → { success: boolean }
DELETE /api/user/song-edits/[songId]     → { success: boolean }
```

---

## UI Layout (Edit Mode)

```
┌──────────────────────────────────────────────────────────────┐
│ Header: [Back] Song Title [Voice] [Play/Pause] [Reset]       │
├──────────────────────────────────────────────────────────────┤
│ Toolbar (sticky):                                            │
│ [Skip (N)] [Unskip] | [Select All] [Clear] | [Revert] [Save] [Exit Edit] │
│ Status: "Tap checkboxes to select • Double-click text to edit"│
│         "2 skipped, 1 modified • Unsaved changes"            │
├──────────────────────────────────────────────────────────────┤
│ Lyrics (scrollable):                                         │
│ 0:15  ☑ First line of the song                               │
│ 0:18  ☐ Second line here                          [Edited]   │
│ 0:22  ☐ ♪ Instrumental                            [Skip]     │
│ 0:30  ☐ Another line with lyrics                             │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### Song Page (`src/app/song/[artistSlug]/[trackSlugWithId]/page.tsx`)
- Loads edits on page load via `songEditsStore.loadEdits()`
- Applies patches during playback via `applyEditPatches()`
- Shows `EditModeProvider` + `EditToolbar` + `EditableLyricsDisplay` when in edit mode
- Handles `?edit=1` query param to auto-enter edit mode

### SongActionBar (`src/components/display/SongActionBar.tsx`)
- Shows "Edit" / "Modified" button for authenticated users (desktop only)
- Triggers `onEditClick` to enter edit mode

### Admin Songs Page (`src/app/admin/songs/page.tsx`)
- Shows "Edits" status badge
- Shows "Lyrics" / "Modified" button linking to `?edit=1`

---

## Caching Strategy

1. **localStorage**: Primary cache with 30-day TTL
   - Key: `scrolltunes:song-edits:${songId}`
   - Checked first on page load

2. **Server**: Persistent storage in `user_song_settings`
   - Fetched if localStorage miss or expired
   - Synced on save (optimistic local + server)

---

## Keyboard Shortcuts (Planned)

| Shortcut | Action |
|----------|--------|
| `E` | Enter/exit edit mode |
| `S` | Skip selected lines |
| `U` | Unskip selected lines |
| `Enter` | Edit selected line text |
| `Escape` | Exit text edit / deselect all |
| `Ctrl+S` / `Cmd+S` | Save edits |

---

## Mobile Considerations (Planned)

- Edit button hidden on mobile (`lg:flex` class)
- Edits applied silently during playback
- No editing UI on mobile (read-only)
- Consider adding toggle to view original vs edited

---

## Testing Checklist

- [ ] Enter edit mode, select lines, skip, save, reload → edits persist
- [ ] Double-click line, modify text, save → text modification applied
- [ ] Skip lines → hidden during normal playback
- [ ] Modified indicator shows in action bar when edits exist
- [ ] Revert button restores original state
- [ ] Exit without saving → changes discarded (needs confirmation dialog)
- [ ] Admin page shows correct edit status
- [ ] `?edit=1` auto-enters edit mode
