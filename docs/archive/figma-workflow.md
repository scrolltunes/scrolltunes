# ScrollTunes Figma Workflow

> Design-to-code process for ScrollTunes (scrolltunes.com)

## Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   Figma     │────▶│ Design Tokens│────▶│   JSON      │────▶│  Tailwind    │
│   Design    │     │   Plugin     │     │   Export    │     │   Config     │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
                                                                    │
                                                                    ▼
                                                            ┌──────────────┐
                                                            │  Components  │
                                                            │  (React)     │
                                                            └──────────────┘
```

## Figma File Structure

Organize the ScrollTunes Figma file with these pages:

```
📁 ScrollTunes
├── 🎨 Foundation
│   ├── Colors
│   ├── Typography
│   ├── Spacing
│   ├── Shadows
│   └── Icons
├── 🧩 Components
│   ├── Buttons
│   ├── Controls (sliders, toggles)
│   ├── Cards
│   ├── Lyrics display
│   ├── Chord diagrams
│   └── Navigation
├── 📱 Screens - Mobile
│   ├── Home
│   ├── Song player
│   ├── Karaoke mode
│   ├── Jam session
│   └── Settings
├── 💻 Screens - Desktop
│   └── (same as mobile)
└── 🔄 Prototypes
    └── User flows
```

## Design Tokens Pipeline

### Step 1: Install Figma Plugin

Install [Design Tokens](https://www.figma.com/community/plugin/888356646278934516/design-tokens) by Lukas Oppermann.

### Step 2: Configure Variables in Figma

Create Figma Variables for:

| Collection | Variables |
|------------|-----------|
| **Colors** | `primary`, `secondary`, `background`, `surface`, `text-*`, `accent-*` |
| **Spacing** | `space-1` through `space-12` (4px base) |
| **Typography** | `font-size-*`, `line-height-*`, `font-weight-*` |
| **Radius** | `radius-sm`, `radius-md`, `radius-lg`, `radius-full` |
| **Shadows** | `shadow-sm`, `shadow-md`, `shadow-lg` |

Use **Modes** for theming:
- `light` mode
- `dark` mode (primary for stage use)

### Step 3: Export Tokens

1. Run Design Tokens plugin
2. Choose "Export to file" → JSON
3. Save to `src/tokens/figma-tokens.json`

### Step 4: Transform to Tailwind

Use Style Dictionary to transform tokens:

```bash
bun run tokens:build
```

This generates:
- `src/tokens/tailwind-colors.js`
- `src/tokens/tailwind-spacing.js`
- `tailwind.config.js` imports

## Folder Structure

```
src/
├── tokens/
│   ├── figma-tokens.json       # Exported from Figma (gitignored or committed)
│   ├── style-dictionary.config.js
│   ├── tailwind-colors.js      # Generated
│   ├── tailwind-spacing.js     # Generated
│   └── tailwind-typography.js  # Generated
├── assets/
│   ├── icons/                  # Exported SVGs from Figma
│   │   ├── play.svg
│   │   ├── pause.svg
│   │   ├── mic.svg
│   │   └── ...
│   └── images/                 # Static images
└── components/
    └── ui/                     # Matches Figma components
```

## Dev Mode Workflow

For day-to-day development:

1. **Designer** creates/updates component in Figma
2. **Designer** marks component "Ready for dev" in Dev Mode
3. **Developer** opens Figma Dev Mode
4. **Developer** inspects component:
   - Copy CSS/Tailwind classes
   - View spacing, colors as tokens
   - See component variants
5. **Developer** implements in React, referencing tokens

## Component Naming Convention

Match Figma component names to React component names:

| Figma | React |
|-------|-------|
| `Button/Primary` | `<Button variant="primary">` |
| `LyricsLine/Active` | `<LyricsLine active>` |
| `ChordDiagram/Am` | `<ChordDiagram chord="Am">` |
| `Control/Slider` | `<Slider>` |

## Syncing Changes

### Design → Code

1. Update Figma design
2. Re-export tokens (if foundation changed)
3. Run `bun run tokens:build`
4. Update React components as needed
5. Commit changes

### Code → Design (feedback)

If implementation reveals issues:

1. Developer documents issue
2. Create Figma comment on relevant frame
3. Designer reviews and updates
4. Re-sync tokens if needed

## Commands

```bash
# Build tokens from Figma export
bun run tokens:build

# Watch for token changes during development
bun run tokens:watch

# Export icons from Figma (requires Figma API token)
bun run figma:icons
```

## Figma API Integration (Optional)

For automated exports, set up Figma API access:

```bash
# .env.local
FIGMA_ACCESS_TOKEN=your-personal-access-token
FIGMA_FILE_ID=your-scrolltunes-file-id
```

Then use scripts to:
- Auto-export icons as SVGs
- Sync component inventory
- Generate component screenshots for docs

## Resources

- [Design Tokens Plugin](https://www.figma.com/community/plugin/888356646278934516/design-tokens)
- [Style Dictionary](https://amzn.github.io/style-dictionary/)
- [Figma Dev Mode](https://www.figma.com/dev-mode/)
- [Figma REST API](https://www.figma.com/developers/api)
