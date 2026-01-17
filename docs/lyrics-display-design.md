# Lyrics Display Design Guide

## Philosophy

The lyrics display is designed as a **distraction-free teleprompter** for musicians. The goal is subtle, non-jarring transitions that don't pull attention away from the performance.

## Key Design Decisions

### No Font Weight Changes

**Problem:** Changing font weight (e.g., normal → bold) when a line becomes active causes layout shift because bold characters are wider. This creates a jarring "jump" effect as text reflows.

**Solution:** Use the same font weight (`font-normal`, 400) for all lines. Active lines are distinguished through:
- Brighter text color (`--color-text` vs `--color-text3`)
- Accent indicator bar on the left (3px, `--color-accent`)
- Higher opacity (100% vs 40-85%)

This creates a subtle, elegant highlight without any layout reflow.

### Text Alignment

- **Mobile:** Left-justified (`text-left`) for comfortable reading
- **Desktop:** Centered (`md:text-center`) to align with the action bar

### Padding Structure

- **Mobile:** `pl-8 pr-4` (asymmetric - more left padding for visual balance)
- **Desktop:** Centered via `max-w-3xl mx-auto`

The text has `pl-2` internal padding to account for the 3px active indicator bar.

### Preview Line

The "next page preview" line is right-justified (`text-right`) to visually hint that content continues on the next page.

### Opacity Hierarchy

| Line State | Opacity | Color Variable |
|------------|---------|----------------|
| Past (>2 lines ago) | 40% | `--color-text-muted` |
| Past (1-2 lines) | 40% | `--color-text-muted` |
| Current | 100% | `--color-text` |
| Next | 85% | `--color-text2` |
| Upcoming | 100% | `--color-text3` |

### Page Navigation

- **Mobile:** Navigation arrows hidden by default, appear on tap for 2.5 seconds
- **Desktop:** Arrows always visible but subtle (30% opacity, 60% on hover)
- **Both:** Dot indicators at top, swipe gestures supported

### Metronome Overlay

The floating metronome uses 60% opacity to avoid blocking lyrics content while remaining accessible.

## Component Structure

```
LyricsDisplay
├── Progress bar (top)
├── Page indicator (dots)
├── LyricsPage
│   ├── LyricLine (multiple)
│   │   ├── Chord display (optional)
│   │   ├── Text content
│   │   └── Active indicator bar
│   └── Preview line
└── Navigation arrows
```

## CSS Variables Used

- `--color-text` - Active line text
- `--color-text2` - Next line text
- `--color-text3` - Upcoming lines text
- `--color-text-muted` - Past lines text
- `--color-accent` - Active indicator bar
- `--color-text-ghost` - Empty line placeholder (♪)
