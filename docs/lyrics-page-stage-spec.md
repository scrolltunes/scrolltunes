# Lyrics Page Redesign (Stage/Perform Mode) — LLM Implementation Spec

> **Context:** This is a **web app** (not a music player). The Lyrics page is the app’s core.  
> **Goal:** Make the **current line unmistakable**, keep the **next line clearly visible**, and maintain **smooth, non-distracting transitions**.

---

## 1) Success Criteria (Non‑Negotiable)

1. **Current line clarity**
   - A performer can identify the current line in under **150ms** (peripheral glance).
2. **Next line preparation**
   - The next line is always **in view**, clearly readable, and visually distinct from background context.
3. **No jarring motion**
   - No bouncing, pulsing, dramatic easing, or continuous feed-like scrolling.
4. **Stable focal point**
   - The current line remains at a **stable vertical anchor** (teleprompter-like).
5. **Professional look**
   - Studio Pro Dark visual language: calm surfaces, subtle borders, disciplined accent usage.

---

## 2) Interaction Model (Stage/Perform)

### Allowed interactions
- **Tap (optional):** advance to next line (or whatever “advance” means in your app’s logic).
- **Long-press lyric line:** enter Selection Mode (Lyrics Share).
- **Scroll gesture:** allowed for *manual repositioning* but should **snap back** to the anchored current line when released (optional).

### Not on this page (by design)
- Playback controls (prev/next “track” buttons, audio player metaphors)
- Timeline scrubbing, looping, metronome, chord tooling (these belong to **Practice Mode**)

---

## 3) Visual Hierarchy: 5-Line Window

Render a small, deliberate window around the active line. Keep more lines available for scrolling/history, but the *presentation* should focus attention.

### Recommended visible stack
- 2 previous lines (low emphasis)
- **CURRENT line** (dominant)
- **NEXT line** (second priority)
- 1 future line (low emphasis)

### Styling rules
| Role | Font size | Weight | Opacity | Treatment |
|------|----------:|-------:|--------:|-----------|
| Current | 1.0x | 800–900 | 1.00 | highlight band + left rail |
| Next | 0.82–0.88x | 600–700 | 0.78–0.86 | plain, no band |
| Context | 0.65–0.72x | 500–600 | 0.40–0.55 | plain |

---

## 4) “Reading Rail” Highlight (Core Pattern)

Instead of karaoke word highlighting, use a **reading rail**:
- A soft, tinted horizontal band behind the current line (accent at ~8–12% opacity)
- A slim **left rail** (3–4px) in accent for quick peripheral recognition

### Requirements
- No glow effects
- No pulsing
- No animated gradient
- Rounded corners, subtle border (optional)

---

## 5) Motion & Transition Rules (No Jank)

### Primary rule: *current line stays anchored*
The world moves *around* it. When the active line advances:
- the stack shifts by one line height
- **crossfade + subtle translate** (very small)

### Timing
- Duration: **180–240ms**
- Easing: **linear** or mild `cubic-bezier(0.2, 0.0, 0.0, 1)` (avoid bouncy ease)
- Respect `prefers-reduced-motion`: opacity-only, or 0ms

### Avoid
- Continuous smooth scrolling like a social feed
- Large scaling changes
- Rapid snapping

---

## 6) Layout (Mobile-First)

### Structure
- **Top bar (quiet):** Back, song title, optional actions
- **Lyrics canvas (dominant):** centered stack
- **Bottom action bar (sticky):** “Select lyrics” + “Create Card” (Option A)

### Bottom action bar (Stage mode)
- Calm default state
- Enters selection mode via “Select lyrics”
- “Create card” becomes primary once >= 1 line selected

---

## 7) Data Model & State

### Inputs
- `lyrics: { id: string, text: string }[]`
- `activeIndex: number` (current line index)
- `selection: Set<id>` (for share mode)
- `mode: 'stage' | 'practice' | 'select'` (selection can be a sub-mode)

### Derived values
- `window = [activeIndex-2 .. activeIndex+2]` (clamped)
- `nextIndex = activeIndex + 1`

### State separation (important)
Keep stage state minimal:
- `activeIndex`, `scrollLock`, `fontScale`, `alignment`, `reducedMotion`

Selection/share state:
- `selectedIds`, `rangeAnchor`, `shareTemplate`, `shareStyle`

---

## 8) Component Breakdown (Suggested)

### `LyricsPageStage`
- orchestrates layout, mode switching, and active line changes

### `LyricsViewportStage`
- renders the lyric stack window
- applies reading rail styles
- handles transitions on `activeIndex` change

### `LyricLine`
- renders a single line with role styling:
  - `role = 'current' | 'next' | 'context'`
- supports selection interaction hooks

### `LyricsActionBar`
- sticky bottom bar:
  - Select lyrics
  - Create card (primary when selection non-empty)

---

## 9) Implementation Steps (Phased, LLM-Friendly)

### Phase 0 — Understand current code
1. Map existing files/components related to lyrics:
   - routing entry
   - lyrics rendering component(s)
   - state store/hooks
   - styling system
2. Identify:
   - how `activeIndex` (or equivalent) is computed
   - how the app currently scrolls lyrics
   - existing selection/share behavior (if any)

**LLM output required:** file map + “what to touch” list.

---

### Phase 1 — Build the new Stage viewport (static)
1. Create `LyricsViewportStage` that:
   - accepts `lyrics`, `activeIndex`
   - computes a window (±2 lines, clamped)
2. Render 5 lines with role styling.
3. Implement reading rail:
   - band behind current line
   - left rail accent strip
4. Ensure next line is distinct and readable.

**Acceptance:** With a hardcoded `activeIndex`, the layout matches hierarchy and looks professional.

---

### Phase 2 — Add anchored transitions on `activeIndex` change
1. Wrap the 5-line stack in a container with fixed height.
2. On index change:
   - animate stack `translateY` by one line height
   - crossfade context lines (opacity)
3. Reset transform after animation completes (or use keyed transitions).
4. Reduced motion:
   - if `prefers-reduced-motion`, disable translate and keep opacity-only.

**Acceptance:** advancing lines feels smooth, subtle, and does not “jump”.

---

### Phase 3 — Integrate with real app state
1. Replace old Stage lyrics rendering with `LyricsViewportStage`.
2. Wire `activeIndex` from existing logic.
3. Verify:
   - responsive behavior
   - font scaling
   - theme consistency

**Acceptance:** Active line follows real progression and stays anchored.

---

### Phase 4 — Add Selection entry + Action Bar (Option A)
1. Add sticky `LyricsActionBar` at bottom:
   - “Select lyrics” (secondary)
   - “Create card” (disabled until selection non-empty)
2. Selection mode:
   - tap lines to toggle selection
   - long-press begins selection mode (optional)
   - show selected count and enable Create card
3. Preserve Stage readability:
   - current/next visibility still holds
   - selection highlight is subtle and readable

**Acceptance:** Selection flow is discoverable, professional, and doesn’t break the reading hierarchy.

---

### Phase 5 — Polish + accessibility
1. Font scaling:
   - scale current/next/context sizes proportionally
2. Alignment option:
   - centered default, optional left alignment
3. Contrast checks:
   - current rail band still readable in low brightness
4. Keyboard support (optional but recommended):
   - arrow up/down advances focus
5. Reduced motion:
   - confirm no translate animations

**Acceptance:** works for real humans, not just screenshots.

---

## 10) Styling (Token-Driven)

Use Studio Pro Dark tokens (or equivalent CSS variables):
- `--bg`, `--surface1`, `--surface2`, `--text`, `--text2`, `--text3`, `--accent`

### Suggested CSS variables
```css
:root {
  --bg: #070A12;
  --surface1: #0C1220;
  --surface2: #111A2C;
  --surface3: #151F33;

  --text: #F3F5F7;
  --text2: rgba(243,245,247,0.72);
  --text3: rgba(243,245,247,0.46);

  --accent: #5B6CFF;
  --border: rgba(255,255,255,0.10);
  --borderStrong: rgba(255,255,255,0.16);

  --radius-xl: 24px;
}
```

### Reading rail styles
```css
.currentRail {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  position: relative;
}
.currentRail::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent);
  border-radius: var(--radius-xl);
}
```

### Role styles
```css
.line.current { font-weight: 800; opacity: 1; }
.line.next    { font-weight: 650; opacity: 0.82; }
.line.context { font-weight: 550; opacity: 0.46; }
```

---

## 11) Transition Implementation (Two Recommended Approaches)

### Approach A: Keyed stack with CSS transition (simpler)
- Render the window in a wrapper
- On index change:
  - apply `transform: translateY(-lineHeight)` briefly
  - re-render with the new window and reset transform

**Pros:** minimal dependencies  
**Cons:** needs careful lineHeight measurement

### Approach B: FLIP technique (more robust)
- Capture pre-layout positions
- Update DOM
- Animate from old to new

**Pros:** smooth and flexible  
**Cons:** more code and edge cases

**Recommendation:** Start with Approach A; upgrade only if needed.

---

## 12) Manual QA Checklist

- Current line is obvious at a glance
- Next line is visible and readable
- Advancing lines does not cause jitter or jank
- Reduced motion: no translate animation
- Small screens: header + action bar don’t squeeze lyrics too much
- Long lines: wrapping is readable and does not break the rail shape
- Selection mode:
  - selecting multiple lines works
  - Create card enables/disables correctly
  - exiting selection returns to Stage cleanly

---

## 13) How to Use This With an LLM (Process)

For each phase:
1. Ask the model to **summarize current implementation** relevant to the phase.
2. Ask for a **minimal change plan** (file list + responsibilities).
3. Require a **patch/diff** (concrete edits).
4. Require a **QA checklist** tailored to the change.

**Guardrails**
- Do not add dependencies without explicit justification.
- Do not refactor unrelated UI.
- Keep diffs small and phase-scoped.
- Token-driven styling only.

---

## Appendix: Visual Target (One Sentence)

**Teleprompter-like stability:** the performer’s eyes lock on a calm, unmistakable current line rail while the next line stays clearly readable, with transitions that are felt, not noticed.
